"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { generatePublicId } from "@/lib/ids";
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
  logo_path: string | null;
  logo_mime_type: string | null;
  logo_bottom_path: string | null;
  logo_bottom_mime_type: string | null;
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
  report_id: string | null;
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

export type MonthlyReport = {
  id: string;
  client_id: string;
  period_label: string;
  seq: number;
  report_no: string | null;
  public_id: string;
  label: string | null;
  status: "draft" | "issued";
  issued_at: string | null;
  created_at: string;
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

function toReport(r: Record<string, unknown>): MonthlyReport {
  const m = r as unknown as MonthlyReport;
  return {
    ...m,
    seq: num(m.seq),
    issued_at: m.issued_at == null ? null : str(m.issued_at),
    created_at: str(m.created_at),
  };
}

/** Formal number: TW-{YYMM พ.ศ.}-{public_id}, e.g. period "2026-08" -> "TW-6908-7F3K9Q2M".
 *  The suffix is a random key (not the round count) so clients can't infer volume. */
function buildReportNo(periodLabel: string, publicId: string): string {
  const m = periodLabel.match(/^(\d{4})-(\d{2})/);
  if (!m) return `TW-${periodLabel}-${publicId}`;
  const yy = String((Number(m[1]) + 543) % 100).padStart(2, "0");
  return `TW-${yy}${m[2]}-${publicId}`;
}

async function assertReportEditable(
  reportId: string | null | undefined
): Promise<void> {
  if (!reportId) return; // legacy filing without a round stays editable
  const rows = (await sql`select status from monthly_reports where id=${reportId}`) as {
    status: string;
  }[];
  if (rows[0]?.status === "issued") {
    throw new Error("รายงานฉบับนี้ออกแล้ว ไม่สามารถแก้ไขได้");
  }
}

async function assertFilingEditable(filingId: string): Promise<void> {
  const rows = (await sql`select report_id from monthly_filings where id=${filingId}`) as {
    report_id: string | null;
  }[];
  await assertReportEditable(rows[0]?.report_id ?? null);
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

export async function loadFilings(
  clientId: string,
  period: string,
  reportId?: string | null
): Promise<Filing[]> {
  await requireUser();
  const filings = reportId
    ? ((await sql`select * from monthly_filings
        where report_id=${reportId}
        order by sort_order, created_at`) as Record<string, unknown>[])
    : ((await sql`select * from monthly_filings
        where client_id=${clientId} and period_label=${period}
        order by sort_order, created_at`) as Record<string, unknown>[]);
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

// Server actions catch their own errors and return them as data: Next.js
// masks thrown action errors on the client ("Server Components render"),
// so returning the message is the only way to surface the real cause in dev
// and production alike.
export type ActionResult = { ok: true } | { ok: false; error: string };

function actionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: actionError(error) };
}

export type AppSettings = {
  company_logo_path: string | null;
  company_logo_file_name: string | null;
  firm_name: string | null;
  brand_color: string | null;
  cover_style: string | null;
  prepared_by: string | null;
};

export type AppSettingsResult =
  | { ok: true; settings: AppSettings | null }
  | { ok: false; error: string };

export async function getAppSettings(): Promise<AppSettingsResult> {
  try {
    await requireUser();
    const rows = (await sql`select company_logo_path, company_logo_file_name, firm_name, brand_color, cover_style, prepared_by from app_settings where id=1`) as AppSettings[];
    return { ok: true, settings: rows[0] ?? null };
  } catch (error) {
    console.error("getAppSettings failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

export async function saveAppSettings(path: string | null, fileName: string | null): Promise<ActionResult> {
  try {
    await requireUser();
    await sql`insert into app_settings (id, company_logo_path, company_logo_file_name, updated_at)
      values (1, ${path}, ${fileName}, ${new Date().toISOString()})
      on conflict (id) do update set company_logo_path=${path}, company_logo_file_name=${fileName}, updated_at=${new Date().toISOString()}`;
    return { ok: true };
  } catch (error) {
    console.error("saveAppSettings failed:", error);
    return fail(error);
  }
}

export async function saveReportBranding(input: {
  firmName: string | null;
  brandColor: string | null;
  coverStyle: string;
  preparedBy?: string | null;
}): Promise<ActionResult> {
  try {
    await requireUser();
    const coverStyle = input.coverStyle === "classic" ? "classic" : "modern";
    await sql`insert into app_settings (id, firm_name, brand_color, cover_style, prepared_by, updated_at)
      values (1, ${input.firmName}, ${input.brandColor}, ${coverStyle}, ${input.preparedBy ?? null}, ${new Date().toISOString()})
      on conflict (id) do update set firm_name=${input.firmName}, brand_color=${input.brandColor}, cover_style=${coverStyle}, prepared_by=${input.preparedBy ?? null}, updated_at=${new Date().toISOString()}`;
    return { ok: true };
  } catch (error) {
    console.error("saveReportBranding failed:", error);
    return fail(error);
  }
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

export async function listMonthlyReports(
  clientId: string,
  period: string
): Promise<MonthlyReport[]> {
  await requireUser();
  const rows = (await sql`select * from monthly_reports
    where client_id=${clientId} and period_label=${period}
    order by seq`) as Record<string, unknown>[];
  return rows.map(toReport);
}

export async function createMonthlyReport(
  clientId: string,
  period: string
): Promise<MonthlyReport> {
  await requireUser();
  for (let attempt = 0; attempt < 5; attempt++) {
    const maxRow = (await sql`select coalesce(max(seq),0)::int as m from monthly_reports
      where client_id=${clientId} and period_label=${period}`) as { m: number }[];
    const seq = (maxRow[0]?.m ?? 0) + 1;
    const publicId = generatePublicId();
    try {
      const rows = (await sql`insert into monthly_reports (client_id, period_label, seq, report_no, public_id, label)
        values (${clientId}, ${period}, ${seq}, ${buildReportNo(period, publicId)}, ${publicId}, ${`ครั้งที่ ${seq}`})
        returning *`) as Record<string, unknown>[];
      if (rows[0]) return toReport(rows[0]);
    } catch (err) {
      // unique collision on (client, period, seq) or public_id — retry
      if (attempt === 4) throw err;
    }
  }
  throw new Error("สร้างรายงานไม่สำเร็จ");
}

const REPORT_EDITABLE = ["label", "report_no", "status", "issued_at"];

export async function patchMonthlyReport(
  id: string,
  patch: Partial<Pick<MonthlyReport, "label" | "report_no" | "status" | "issued_at">>
): Promise<void> {
  await requireUser();
  const { text, params } = buildUpdate(
    "monthly_reports",
    id,
    { ...patch } as Record<string, unknown>,
    REPORT_EDITABLE
  );
  await sql.query(text, params);
}

export async function issueMonthlyReport(id: string): Promise<void> {
  await requireUser();
  const rows = (await sql`select period_label, public_id, report_no from monthly_reports where id=${id}`) as {
    period_label: string;
    public_id: string;
    report_no: string | null;
  }[];
  if (!rows[0]) throw new Error("ไม่พบรายงาน");
  const reportNo =
    rows[0].report_no ?? buildReportNo(rows[0].period_label, rows[0].public_id);
  await sql`update monthly_reports
    set status='issued', issued_at=${new Date().toISOString()}, report_no=${reportNo}
    where id=${id}`;
}

export async function reopenMonthlyReport(id: string): Promise<void> {
  await requireUser();
  await sql`update monthly_reports set status='draft', issued_at=null where id=${id}`;
}

export async function deleteMonthlyReport(id: string): Promise<void> {
  await requireUser();
  await sql`delete from monthly_reports where id=${id}`;
}

export async function copyReportToNewIssue(
  sourceReportId: string,
  targetClientId: string,
  targetPeriod: string
): Promise<Filing[]> {
  await requireUser();
  const src = (await sql`select id from monthly_reports where id=${sourceReportId}`) as {
    id: string;
  }[];
  if (!src[0]) return [];
  const prev = (await sql`select form_code, description, amount, due_date, payment_method, bank_account_id, sort_order
    from monthly_filings where report_id=${sourceReportId}
    order by sort_order, created_at`) as Record<string, unknown>[];
  if (!prev.length) return [];

  const target = await createMonthlyReport(targetClientId, targetPeriod);

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
    const r = f as {
      form_code: string;
      description: string | null;
      amount: unknown;
      due_date: unknown;
      payment_method: string | null;
      bank_account_id: string | null;
      sort_order: unknown;
    };
    const base = values.length;
    values.push(
      targetClientId,
      targetPeriod,
      target.id,
      r.form_code,
      r.description,
      num(r.amount),
      r.due_date == null ? null : shiftMonth(str(r.due_date)),
      r.payment_method ?? null,
      r.bank_account_id,
      i + 1
    );
    const ph = (k: number) => `$${base + k + 1}`;
    return `(${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ph).join(",")})`;
  });
  const inserted = (await sql.query(
    `insert into monthly_filings (client_id, period_label, report_id, form_code, description, amount, due_date, payment_method, bank_account_id, sort_order)
     values ${groups.join(",")} returning *`,
    values
  )) as Record<string, unknown>[];
  return inserted.map((f) => toFiling(f, []));
}

export async function addFiling(
  clientId: string,
  period: string,
  reportId: string,
  input: FilingInput
): Promise<Filing> {
  await requireUser();
  await assertReportEditable(reportId);
  const maxRow = (await sql`select coalesce(max(sort_order),0)::int as m from monthly_filings
    where report_id=${reportId}`) as { m: number }[];
  const rows = (await sql`insert into monthly_filings (client_id, period_label, report_id, form_code, description, amount, due_date, payment_method, sort_order)
    values (${clientId}, ${period}, ${reportId}, ${input.form_code}, ${input.description}, ${input.amount}, ${input.due_date}, ${input.payment_method ?? null}, ${(maxRow[0]?.m ?? 0) + 1})
    returning *`) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Insert failed");
  return toFiling(rows[0], []);
}

const FILING_EDITABLE = ["form_code", "description", "amount", "due_date", "payment_method", "bank_account_id", "sort_order", "remark"];

export async function patchFiling(id: string, patch: Partial<Filing>): Promise<void> {
  await requireUser();
  await assertFilingEditable(id);
  const p = { ...(patch as Record<string, unknown>) };
  if ("amount" in p) p.amount = num(p.amount);
  const { text, params } = buildUpdate("monthly_filings", id, p, FILING_EDITABLE);
  await sql.query(text, params);
}

export async function deleteFiling(id: string): Promise<void> {
  await requireUser();
  await assertFilingEditable(id);
  await sql`delete from monthly_filings where id=${id}`;
}

export async function clearFilings(reportId: string): Promise<void> {
  await requireUser();
  await assertReportEditable(reportId);
  await sql`delete from monthly_filings where report_id=${reportId}`;
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

export async function setBankQr(bankId: string, path: string | null): Promise<ActionResult> {
  try {
    await requireUser();
    await sql`update bank_accounts set qr_path=${path} where id=${bankId}`;
    return { ok: true };
  } catch (error) {
    console.error("setBankQr failed:", error);
    return fail(error);
  }
}

export async function setBankLogo(
  bankId: string,
  slot: "top" | "bottom",
  path: string | null,
  mimeType: string | null
): Promise<ActionResult> {
  try {
    await requireUser();
    if (slot === "bottom") {
      await sql`update bank_accounts set logo_bottom_path=${path}, logo_bottom_mime_type=${mimeType} where id=${bankId}`;
    } else {
      await sql`update bank_accounts set logo_path=${path}, logo_mime_type=${mimeType} where id=${bankId}`;
    }
    return { ok: true };
  } catch (error) {
    console.error("setBankLogo failed:", error);
    return fail(error);
  }
}

export async function recordReportFile(
  clientId: string,
  reportId: string,
  storage_path: string,
  file_name: string,
  size_bytes: number
): Promise<void> {
  const user = await requireUser();
  await sql`insert into files (client_id, report_id, storage_path, file_name, size_bytes, mime_type, category, uploaded_by)
    values (${clientId}, ${reportId}, ${storage_path}, ${file_name}, ${size_bytes}, 'application/pdf', 'monthly-report', ${user.email})`;
}
