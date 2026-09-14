"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { buildUpdate, num } from "./db-helpers";

export type ClientRow = {
  id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type BankAccount = {
  id: string;
  label: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string | null;
  qr_path: string | null;
  qr_mime_type: string | null;
};

export type Attachment = {
  id: string;
  filing_id: string;
  kind: "slip" | "qr" | "document";
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
  covers?: string[];
};

export type Filing = {
  id: string;
  client_id: string;
  period_label: string;
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  remark: string | null;
  payment_method: string | null;
  bank_account_id: string | null;
  sort_order: number;
  created_at?: string;
  filing_attachments: Attachment[];
};

function str(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? "");
}

function dateOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}

function toAttachment(r: Record<string, unknown>): Attachment {
  const a = r as unknown as Attachment;
  return {
    ...a,
    size_bytes: a.size_bytes == null ? null : num(a.size_bytes),
    created_at: str(a.created_at),
  };
}

function toFiling(r: Record<string, unknown>, attachments: Attachment[] = []): Filing {
  const f = r as unknown as Filing;
  return {
    ...f,
    amount: num(f.amount),
    sort_order: num(f.sort_order),
    due_date: dateOnly(f.due_date),
    created_at: f.created_at == null ? undefined : str(f.created_at),
    filing_attachments: attachments,
  };
}

export async function listCustomFormCodes(): Promise<string[]> {
  await requireUser();
  const rows = (await sql`select code from form_custom_codes order by code`) as { code: string }[];
  return rows.map((r) => r.code);
}

export async function rememberFormCode(code: string): Promise<void> {
  await requireUser();
  const c = code.trim();
  if (!c) return;
  await sql`insert into form_custom_codes (code) values (${c}) on conflict (code) do nothing`;
}

export async function listCustomPaymentMethods(): Promise<string[]> {
  await requireUser();
  const rows = (await sql`select code from payment_method_presets order by code`) as { code: string }[];
  return rows.map((r) => r.code);
}

export async function rememberPaymentMethod(code: string): Promise<void> {
  await requireUser();
  const c = code.trim();
  if (!c) return;
  await sql`insert into payment_method_presets (code) values (${c}) on conflict (code) do nothing`;
}

export async function deleteCustomPaymentMethod(code: string): Promise<void> {
  await requireUser();
  await sql`delete from payment_method_presets where code=${code.trim()}`;
}

export async function listActiveClients(): Promise<ClientRow[]> {
  await requireUser();
  return (await sql`select id, name, tax_id, address, phone, email from clients where status='active'`) as ClientRow[];
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  await requireUser();
  return (await sql`select * from bank_accounts order by created_at`) as BankAccount[];
}

export async function loadFilings(clientId: string, period: string): Promise<Filing[]> {
  await requireUser();
  const filings = (await sql`select * from monthly_filings
    where client_id=${clientId} and period_label=${period}
    order by sort_order, created_at`) as Record<string, unknown>[];
  if (!filings.length) return [];
  const ids = filings.map((f) => (f as { id: string }).id);
  const atts = (await sql.query(
    `select * from filing_attachments where filing_id in (${ids.map((_, i) => `$${i + 1}`).join(",")}) order by created_at`,
    ids
  )) as Record<string, unknown>[];
  const links = (await sql.query(
    `select attachment_id, filing_id from attachment_filings where filing_id in (${ids.map((_, i) => `$${i + 1}`).join(",")})`,
    ids
  )) as { attachment_id: string; filing_id: string }[];
  const coverMap = new Map<string, Set<string>>();
  for (const l of links) {
    if (!coverMap.has(l.attachment_id)) coverMap.set(l.attachment_id, new Set());
    coverMap.get(l.attachment_id)!.add(l.filing_id);
  }
  const byFiling = new Map<string, Attachment[]>();
  for (const a of atts) {
    const att = toAttachment(a);
    const set = coverMap.get(att.id);
    set?.add(att.filing_id);
    att.covers = Array.from(set ?? [att.filing_id]);
    if (!byFiling.has(att.filing_id)) byFiling.set(att.filing_id, []);
    byFiling.get(att.filing_id)!.push(att);
  }
  return filings.map((f) => toFiling(f, byFiling.get((f as { id: string }).id) ?? []));
}

export async function getAppSettings(): Promise<{ company_logo_path: string | null; company_logo_file_name: string | null } | null> {
  await requireUser();
  const rows = (await sql`select company_logo_path, company_logo_file_name from app_settings where id=1`) as {
    company_logo_path: string | null;
    company_logo_file_name: string | null;
  }[];
  return rows[0] ?? null;
}

export async function saveAppSettings(path: string | null, fileName: string | null): Promise<void> {
  await requireUser();
  await sql`insert into app_settings (id, company_logo_path, company_logo_file_name, updated_at)
    values (1, ${path}, ${fileName}, ${new Date().toISOString()})
    on conflict (id) do update set company_logo_path=${path}, company_logo_file_name=${fileName}, updated_at=${new Date().toISOString()}`;
}

export type FilingInput = {
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  payment_method?: string | null;
  bank_account_id?: string | null;
  sort_order?: number;
};

export async function copyMonthFilings(clientId: string, fromPeriod: string, toPeriod: string): Promise<Filing[]> {
  await requireUser();
  const prev = (await sql`select form_code, description, amount, due_date, payment_method, bank_account_id, sort_order
    from monthly_filings where client_id=${clientId} and period_label=${fromPeriod}
    order by sort_order, created_at`) as Record<string, unknown>[];
  if (!prev.length) return [];
  const maxRow = (await sql`select coalesce(max(sort_order),0)::int as m from monthly_filings
    where client_id=${clientId} and period_label=${toPeriod}`) as { m: number }[];
  const maxSort = maxRow[0]?.m ?? 0;
  const shiftMonth = (ymd: string): string | null => {
    const m = ymd.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + 1;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    const dim = new Date(ny, nm, 0).getDate();
    const nd = Math.min(Number(m[3]), dim);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${ny}-${pad(nm)}-${pad(nd)}`;
  };
  const values: unknown[] = [];
  const groups = prev.map((f, i) => {
    const r = f as { form_code: string; description: string | null; amount: unknown; due_date: unknown; payment_method: string | null; bank_account_id: string | null; sort_order: unknown };
    const base = values.length;
    values.push(
      clientId, toPeriod, r.form_code, r.description, num(r.amount),
      r.due_date == null ? null : shiftMonth(str(r.due_date)),
      r.payment_method ?? null,
      r.bank_account_id, maxSort + i + 1
    );
    const ph = (k: number) => `$${base + k + 1}`;
    return `(${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(ph).join(",")})`;
  });
  const inserted = (await sql.query(
    `insert into monthly_filings (client_id, period_label, form_code, description, amount, due_date, payment_method, bank_account_id, sort_order)
     values ${groups.join(",")} returning *`,
    values
  )) as Record<string, unknown>[];
  return inserted.map((f) => toFiling(f, []));
}

export async function addFiling(clientId: string, period: string, input: FilingInput): Promise<Filing> {
  await requireUser();
  const maxRow = (await sql`select coalesce(max(sort_order),0)::int as m from monthly_filings
    where client_id=${clientId} and period_label=${period}`) as { m: number }[];
  const rows = (await sql`insert into monthly_filings (client_id, period_label, form_code, description, amount, due_date, payment_method, sort_order)
    values (${clientId}, ${period}, ${input.form_code}, ${input.description}, ${input.amount}, ${input.due_date}, ${input.payment_method ?? null}, ${(maxRow[0]?.m ?? 0) + 1})
    returning *`) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Insert failed");
  return toFiling(rows[0], []);
}

const FILING_EDITABLE = ["form_code", "description", "amount", "due_date", "payment_method", "bank_account_id", "sort_order", "remark"];

export async function patchFiling(id: string, patch: Partial<Filing>): Promise<void> {
  await requireUser();
  const p = { ...(patch as Record<string, unknown>) };
  if ("amount" in p) p.amount = num(p.amount);
  const { text, params } = buildUpdate("monthly_filings", id, p, FILING_EDITABLE);
  await sql.query(text, params);
}

export async function deleteFiling(id: string): Promise<void> {
  await requireUser();
  await sql`delete from monthly_filings where id=${id}`;
}

export async function clearFilings(clientId: string, period: string): Promise<void> {
  await requireUser();
  await sql`delete from monthly_filings where client_id=${clientId} and period_label=${period}`;
}

export async function addAttachment(
  filingId: string,
  kind: string,
  meta: { storage_path: string; file_name: string; size_bytes: number; mime_type: string | null },
  covers: string[]
): Promise<void> {
  await requireUser();
  const inserted = (await sql`insert into filing_attachments (filing_id, kind, storage_path, file_name, size_bytes, mime_type)
    values (${filingId}, ${kind}, ${meta.storage_path}, ${meta.file_name}, ${meta.size_bytes}, ${meta.mime_type})
    returning id`) as { id: string }[];
  const extras = covers.filter((cid) => cid !== filingId);
  if (kind === "slip" && extras.length && inserted[0]) {
    const values: unknown[] = [];
    const groups = extras.map((fid) => {
      const base = values.length;
      values.push(inserted[0].id, fid);
      return `($${base + 1},$${base + 2})`;
    });
    await sql.query(`insert into attachment_filings (attachment_id, filing_id) values ${groups.join(",")}`, values);
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  await requireUser();
  await sql`delete from filing_attachments where id=${id}`;
}

export async function addBankAccount(input: {
  label: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string | null;
}): Promise<void> {
  await requireUser();
  await sql`insert into bank_accounts (label, bank_name, account_no, account_name, promptpay_id)
    values (${input.label}, ${input.bank_name}, ${input.account_no}, ${input.account_name}, ${input.promptpay_id})`;
}

export async function deleteBankAccount(id: string): Promise<void> {
  await requireUser();
  await sql`delete from bank_accounts where id=${id}`;
}

export async function setBankQr(bankId: string, path: string | null): Promise<void> {
  await requireUser();
  await sql`update bank_accounts set qr_path=${path} where id=${bankId}`;
}

export async function recordReportFile(
  clientId: string,
  storage_path: string,
  file_name: string,
  size_bytes: number
): Promise<void> {
  const user = await requireUser();
  await sql`insert into files (client_id, storage_path, file_name, size_bytes, mime_type, category, uploaded_by)
    values (${clientId}, ${storage_path}, ${file_name}, ${size_bytes}, 'application/pdf', 'monthly-report', ${user.email})`;
}
