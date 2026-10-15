"use server";

import { cookies, headers } from "next/headers";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { generatePublicId } from "@/lib/ids";
import { shareTokenFromSegment } from "@/lib/share-link";
import {
  getActiveReportShare,
  isShareActive,
  mintReportShare,
  type ReportShare as ReportShareCore,
} from "@/lib/report-share";
import { getReportEmailQuota as readReportEmailQuota } from "@/lib/report-email-quota";
import { normalizeSharePreviewDetail } from "@/lib/share-preview";
import {
  isValidTaxId,
  matchesTaxIdSuffix,
  normalizeTaxId,
  SHARE_TAX_ID_SUFFIX_LENGTH,
  shareAccessCookieName,
  shareAccessCookieOptions,
  signShareAccess,
} from "@/lib/share-access";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { buildUpdate, num } from "./db-helpers";
import { planRoundMirror } from "@/lib/report-rounds";

export type ClientRow = {
  id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  avatar_text: string | null;
  avatar_color: string | null;
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
  pdf_page: number | null;
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

/** Advance a YYYY-MM-DD date by one calendar month (clamped to month end). */
function shiftMonth(ymd: string): string | null {
  const m = ymd.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + 1;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(ny, nm, 0).getDate();
  const nd = Math.min(Number(m[3]), dim);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

function toAttachment(r: Record<string, unknown>): Attachment {
  const a = r as unknown as Attachment;
  return {
    ...a,
    size_bytes: a.size_bytes == null ? null : num(a.size_bytes),
    pdf_page: a.pdf_page == null ? null : num(a.pdf_page),
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
  return (await sql`select id, name, tax_id, address, phone, email, avatar_text, avatar_color from clients where status='active'`) as ClientRow[];
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
  report_renderer: string | null;
  share_preview_title: string | null;
  share_preview_description: string | null;
  share_preview_detail: string | null;
  firm_phone: string | null;
  firm_line: string | null;
  firm_address: string | null;
};

export type ReportRenderer = "legacy" | "server";

function normalizeRenderer(value: string | null | undefined): ReportRenderer {
  return value === "server" ? "server" : "legacy";
}

export type AppSettingsResult =
  | { ok: true; settings: AppSettings | null }
  | { ok: false; error: string };

export async function getAppSettings(): Promise<AppSettingsResult> {
  try {
    await requireUser();
    const rows = await selectAppSettings();
    return { ok: true, settings: rows[0] ?? null };
  } catch (error) {
    console.error("getAppSettings failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

/** Read app_settings, degrading gracefully when newer columns aren't migrated. */
async function selectAppSettings(): Promise<AppSettings[]> {
  try {
    return (await sql`select company_logo_path, company_logo_file_name, firm_name, brand_color, cover_style, prepared_by, report_renderer, share_preview_title, share_preview_description, share_preview_detail, firm_phone, firm_line, firm_address from app_settings where id=1`) as AppSettings[];
  } catch {
    try {
      const rows = (await sql`select company_logo_path, company_logo_file_name, firm_name, brand_color, cover_style, prepared_by, report_renderer, share_preview_title, share_preview_description, firm_phone, firm_line, firm_address from app_settings where id=1`) as Omit<AppSettings, "share_preview_detail">[];
      return rows.map((r) => ({ ...r, share_preview_detail: null }));
    } catch {
      try {
        const rows = (await sql`select company_logo_path, company_logo_file_name, firm_name, brand_color, cover_style, prepared_by, report_renderer, share_preview_title, share_preview_description from app_settings where id=1`) as Omit<AppSettings, "share_preview_detail" | "firm_phone" | "firm_line" | "firm_address">[];
        return rows.map((r) => ({
          ...r,
          share_preview_detail: null,
          firm_phone: null,
          firm_line: null,
          firm_address: null,
        }));
      } catch {
        const legacy = (await sql`select company_logo_path, company_logo_file_name, firm_name, brand_color, cover_style, prepared_by from app_settings where id=1`) as Omit<AppSettings, "report_renderer" | "share_preview_title" | "share_preview_description" | "share_preview_detail" | "firm_phone" | "firm_line" | "firm_address">[];
        return legacy.map((r) => ({
          ...r,
          report_renderer: null,
          share_preview_title: null,
          share_preview_description: null,
          share_preview_detail: null,
          firm_phone: null,
          firm_line: null,
          firm_address: null,
        }));
      }
    }
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
  reportRenderer?: string;
  sharePreviewTitle?: string | null;
  sharePreviewDescription?: string | null;
  sharePreviewDetail?: string | null;
  firmPhone?: string | null;
  firmLine?: string | null;
  firmAddress?: string | null;
}): Promise<ActionResult> {
  try {
    await requireUser();
    const coverStyle = input.coverStyle === "classic" ? "classic" : "modern";
    const renderer = normalizeRenderer(input.reportRenderer);
    const shareTitle = input.sharePreviewTitle?.trim() || null;
    const shareDesc = input.sharePreviewDescription?.trim() || null;
    const shareDetail = normalizeSharePreviewDetail(input.sharePreviewDetail);
    const firmPhone = input.firmPhone?.trim() || null;
    const firmLine = input.firmLine?.trim() || null;
    const firmAddress = input.firmAddress?.trim() || null;
    const now = new Date().toISOString();
    try {
      await sql`insert into app_settings (id, firm_name, brand_color, cover_style, prepared_by, report_renderer, share_preview_title, share_preview_description, share_preview_detail, firm_phone, firm_line, firm_address, updated_at)
        values (1, ${input.firmName}, ${input.brandColor}, ${coverStyle}, ${input.preparedBy ?? null}, ${renderer}, ${shareTitle}, ${shareDesc}, ${shareDetail}, ${firmPhone}, ${firmLine}, ${firmAddress}, ${now})
        on conflict (id) do update set firm_name=${input.firmName}, brand_color=${input.brandColor}, cover_style=${coverStyle}, prepared_by=${input.preparedBy ?? null}, report_renderer=${renderer}, share_preview_title=${shareTitle}, share_preview_description=${shareDesc}, share_preview_detail=${shareDetail}, firm_phone=${firmPhone}, firm_line=${firmLine}, firm_address=${firmAddress}, updated_at=${now}`;
    } catch {
      try {
        await sql`insert into app_settings (id, firm_name, brand_color, cover_style, prepared_by, report_renderer, share_preview_title, share_preview_description, share_preview_detail, updated_at)
          values (1, ${input.firmName}, ${input.brandColor}, ${coverStyle}, ${input.preparedBy ?? null}, ${renderer}, ${shareTitle}, ${shareDesc}, ${shareDetail}, ${now})
          on conflict (id) do update set firm_name=${input.firmName}, brand_color=${input.brandColor}, cover_style=${coverStyle}, prepared_by=${input.preparedBy ?? null}, report_renderer=${renderer}, share_preview_title=${shareTitle}, share_preview_description=${shareDesc}, share_preview_detail=${shareDetail}, updated_at=${now}`;
      } catch {
        try {
          await sql`insert into app_settings (id, firm_name, brand_color, cover_style, prepared_by, report_renderer, share_preview_title, share_preview_description, updated_at)
            values (1, ${input.firmName}, ${input.brandColor}, ${coverStyle}, ${input.preparedBy ?? null}, ${renderer}, ${shareTitle}, ${shareDesc}, ${now})
            on conflict (id) do update set firm_name=${input.firmName}, brand_color=${input.brandColor}, cover_style=${coverStyle}, prepared_by=${input.preparedBy ?? null}, report_renderer=${renderer}, share_preview_title=${shareTitle}, share_preview_description=${shareDesc}, updated_at=${now}`;
        } catch {
          // Some columns may not be migrated yet — save what the schema supports.
          try {
            await sql`insert into app_settings (id, firm_name, brand_color, cover_style, prepared_by, report_renderer, updated_at)
              values (1, ${input.firmName}, ${input.brandColor}, ${coverStyle}, ${input.preparedBy ?? null}, ${renderer}, ${now})
              on conflict (id) do update set firm_name=${input.firmName}, brand_color=${input.brandColor}, cover_style=${coverStyle}, prepared_by=${input.preparedBy ?? null}, report_renderer=${renderer}, updated_at=${now}`;
          } catch {
            await sql`insert into app_settings (id, firm_name, brand_color, cover_style, prepared_by, updated_at)
              values (1, ${input.firmName}, ${input.brandColor}, ${coverStyle}, ${input.preparedBy ?? null}, ${now})
              on conflict (id) do update set firm_name=${input.firmName}, brand_color=${input.brandColor}, cover_style=${coverStyle}, prepared_by=${input.preparedBy ?? null}, updated_at=${now}`;
          }
        }
      }
    }
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

/** Insert a round. When `requestedSeq` is given it must be free; otherwise the
 *  smallest unused round number is used (so freed numbers are reused). */
async function insertMonthlyReport(
  clientId: string,
  period: string,
  requestedSeq?: number | null
): Promise<MonthlyReport> {
  await requireUser();
  let seq: number;
  if (requestedSeq != null) {
    if (!Number.isInteger(requestedSeq) || requestedSeq < 1) {
      throw new Error("ครั้งที่ต้องเป็นจำนวนเต็มบวก");
    }
    const taken = (await sql`select 1 from monthly_reports
      where client_id=${clientId} and period_label=${period} and seq=${requestedSeq}`) as unknown[];
    if (taken.length) throw new Error(`ครั้งที่ ${requestedSeq} มีอยู่แล้ว`);
    seq = requestedSeq;
  } else {
    const rows = (await sql`select seq from monthly_reports
      where client_id=${clientId} and period_label=${period}`) as { seq: number }[];
    const used = new Set(rows.map((r) => Number(r.seq)));
    seq = 1;
    while (used.has(seq)) seq += 1;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = generatePublicId();
    try {
      const rows = (await sql`insert into monthly_reports (client_id, period_label, seq, report_no, public_id, label)
        values (${clientId}, ${period}, ${seq}, ${buildReportNo(period, publicId)}, ${publicId}, ${`ครั้งที่ ${seq}`})
        returning *`) as Record<string, unknown>[];
      if (rows[0]) return toReport(rows[0]);
    } catch (err) {
      // public_id collision — retry with a new key
      if (attempt === 4) throw err;
    }
  }
  throw new Error("สร้างรายงานไม่สำเร็จ");
}

export type CreateReportResult =
  | { ok: true; report: MonthlyReport }
  | { ok: false; error: string };

export async function createMonthlyReport(
  clientId: string,
  period: string,
  requestedSeq?: number | null
): Promise<CreateReportResult> {
  try {
    return { ok: true, report: await insertMonthlyReport(clientId, period, requestedSeq) };
  } catch (error) {
    console.error("createMonthlyReport failed:", error);
    return { ok: false, error: actionError(error) };
  }
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

  const target = await insertMonthlyReport(targetClientId, targetPeriod);

  // Insert one row at a time with the tagged template. A single multi-row
  // VALUES with all-parameter values can trip Postgres type inference
  // ("could not determine data type of parameter $1").
  const inserted: Record<string, unknown>[] = [];
  for (let i = 0; i < prev.length; i++) {
    const r = prev[i] as {
      form_code: string;
      description: string | null;
      amount: unknown;
      due_date: unknown;
      payment_method: string | null;
      bank_account_id: string | null;
      sort_order: unknown;
    };
    const rows = (await sql`insert into monthly_filings (client_id, period_label, report_id, form_code, description, amount, due_date, payment_method, bank_account_id, sort_order)
      values (${targetClientId}, ${targetPeriod}, ${target.id}, ${r.form_code}, ${r.description}, ${num(r.amount)}, ${r.due_date == null ? null : shiftMonth(str(r.due_date))}, ${r.payment_method ?? null}, ${r.bank_account_id}, ${i + 1})
      returning *`) as Record<string, unknown>[];
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted.map((f) => toFiling(f, []));
}

/**
 * Copy a round's items forward with amounts zeroed and no uploaded files, so
 * the target round becomes a reusable template for the new month.
 */
async function carryFilingsAsTemplate(
  sourceReportId: string,
  targetClientId: string,
  targetPeriod: string,
  targetReportId: string
): Promise<void> {
  const prev = (await sql`select form_code, description, due_date, payment_method, bank_account_id, remark, sort_order
    from monthly_filings where report_id=${sourceReportId}
    order by sort_order, created_at`) as Record<string, unknown>[];
  for (let i = 0; i < prev.length; i++) {
    const r = prev[i] as {
      form_code: string;
      description: string | null;
      due_date: unknown;
      payment_method: string | null;
      bank_account_id: string | null;
      remark: string | null;
    };
    await sql`insert into monthly_filings (client_id, period_label, report_id, form_code, description, amount, due_date, payment_method, bank_account_id, remark, sort_order)
      values (${targetClientId}, ${targetPeriod}, ${targetReportId}, ${r.form_code}, ${r.description}, 0, ${r.due_date == null ? null : shiftMonth(str(r.due_date))}, ${r.payment_method ?? null}, ${r.bank_account_id}, ${r.remark ?? null}, ${i + 1})`;
  }
}

/**
 * Keep a month in sync with the previous one: every round the previous month
 * has is created here if missing, and any round here that is still empty is
 * prefilled from its same-numbered counterpart — carried forward without
 * amounts, slips, QR images, or Part 2 documents, so each round acts as its own
 * template. Idempotent (rounds that already hold items are never touched), so
 * it is safe to run on every month view. With no earlier month it falls back to
 * creating the default rounds ครั้งที่ 1 and 2, empty.
 */
export async function ensureDefaultRounds(
  clientId: string,
  period: string
): Promise<MonthlyReport[]> {
  await requireUser();

  const sourceMonths = (await sql`select period_label from monthly_reports
    where client_id=${clientId} and period_label < ${period}
    order by period_label desc limit 1`) as { period_label: string }[];
  const sourcePeriod = sourceMonths[0]?.period_label;

  if (!sourcePeriod) {
    // No history to mirror — create the default template rounds, empty.
    const existing = (await sql`select 1 from monthly_reports
      where client_id=${clientId} and period_label=${period} limit 1`) as unknown[];
    if (existing.length) return [];
    const created: MonthlyReport[] = [];
    for (const seq of [1, 2]) {
      try {
        created.push(await insertMonthlyReport(clientId, period, seq));
      } catch {
        // a concurrent call already created this round
      }
    }
    return created;
  }

  const sourceRounds = (await sql`select id, seq from monthly_reports
    where client_id=${clientId} and period_label=${sourcePeriod}
    order by seq`) as { id: string; seq: number }[];
  const targetRounds = (await sql`select r.id, r.seq,
      (select count(*) from monthly_filings f where f.report_id = r.id)::int as filing_count
    from monthly_reports r
    where r.client_id=${clientId} and r.period_label=${period}
    order by r.seq`) as { id: string; seq: number; filing_count: number }[];

  const steps = planRoundMirror(
    sourceRounds.map((r) => ({ id: r.id, seq: num(r.seq) })),
    targetRounds.map((r) => ({ id: r.id, seq: num(r.seq), filingCount: num(r.filing_count) }))
  );

  const created: MonthlyReport[] = [];
  for (const step of steps) {
    if (step.action === "create") {
      let report: MonthlyReport;
      try {
        report = await insertMonthlyReport(clientId, period, step.seq);
      } catch {
        continue; // a concurrent call already created this round
      }
      await carryFilingsAsTemplate(step.sourceId, clientId, period, report.id);
      created.push(report);
    } else {
      await carryFilingsAsTemplate(step.sourceId, clientId, period, step.targetId);
    }
  }
  return created;
}

export type CopyRoundResult =
  | { ok: true; filings: Filing[] }
  | { ok: false; error: string };

/**
 * Pull a chosen source round's items into the current (target) round. Only
 * allowed while the target round is empty and still editable — the pull is a
 * template copy (amounts zeroed, no files), matching the automatic seeding.
 */
export async function copyRoundIntoReport(
  sourceReportId: string,
  targetReportId: string
): Promise<CopyRoundResult> {
  try {
    await requireUser();
    if (sourceReportId === targetReportId) {
      return { ok: false, error: "รอบต้นทางและปลายทางเป็นรอบเดียวกันไม่ได้" };
    }

    const targets = (await sql`select client_id, period_label from monthly_reports
      where id=${targetReportId}`) as { client_id: string; period_label: string }[];
    const target = targets[0];
    if (!target) return { ok: false, error: "ไม่พบรอบปลายทาง" };

    const sources = (await sql`select client_id from monthly_reports
      where id=${sourceReportId}`) as { client_id: string }[];
    if (!sources[0]) return { ok: false, error: "ไม่พบรอบต้นทาง" };
    if (sources[0].client_id !== target.client_id) {
      return { ok: false, error: "ดึงได้เฉพาะรอบของลูกค้ารายเดียวกัน" };
    }

    await assertReportEditable(targetReportId);

    const existing = (await sql`select 1 from monthly_filings
      where report_id=${targetReportId} limit 1`) as unknown[];
    if (existing.length) {
      return { ok: false, error: "รอบนี้มีรายการอยู่แล้ว — ดึงได้เฉพาะรอบที่ยังว่าง" };
    }

    await carryFilingsAsTemplate(
      sourceReportId,
      target.client_id,
      target.period_label,
      targetReportId
    );
    const filings = await loadFilings(target.client_id, target.period_label, targetReportId);
    return { ok: true, filings };
  } catch (error) {
    console.error("copyRoundIntoReport failed:", error);
    return { ok: false, error: actionError(error) };
  }
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
  await assertFilingEditable(filingId);
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
  const rows = (await sql`select filing_id from filing_attachments where id=${id}`) as {
    filing_id: string;
  }[];
  if (rows[0]) await assertFilingEditable(rows[0].filing_id);
  await sql`delete from filing_attachments where id=${id}`;
}

/** Persist where each slip landed in the generated PDF (for the share link). */
export async function setAttachmentPages(
  updates: { id: string; page: number }[]
): Promise<void> {
  await requireUser();
  for (const u of updates) {
    await sql`update filing_attachments set pdf_page=${u.page} where id=${u.id}`;
  }
}

/**
 * Public: resolve a slip attachment for the share page. Only returns slips that
 * belong to the given report (the caller must have validated the share token).
 */
export async function resolveSlip(
  reportId: string,
  attachmentId: string
): Promise<{ storage_path: string; file_name: string; mime_type: string | null } | null> {
  const rows = (await sql`
    select a.storage_path, a.file_name, a.mime_type
    from filing_attachments a
    join monthly_filings f on f.id = a.filing_id
    where a.id=${attachmentId} and a.kind='slip' and f.report_id=${reportId}
  `) as { storage_path: string; file_name: string; mime_type: string | null }[];
  const row = rows[0];
  return row
    ? {
        storage_path: String(row.storage_path),
        file_name: String(row.file_name),
        mime_type: row.mime_type == null ? null : String(row.mime_type),
      }
    : null;
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

export type ReportFile = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
};

/** Generated PDFs kept for a report round, newest first. */
export async function listReportFiles(reportId: string): Promise<ReportFile[]> {
  await requireUser();
  const rows = (await sql`
    select id, file_name, storage_path, size_bytes, uploaded_at, uploaded_by
    from files
    where report_id=${reportId} and category='monthly-report'
    order by uploaded_at desc
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    file_name: String(r.file_name),
    storage_path: String(r.storage_path),
    size_bytes: num(r.size_bytes),
    uploaded_at: str(r.uploaded_at),
    uploaded_by: r.uploaded_by == null ? null : String(r.uploaded_by),
  }));
}

export type ReportDocument = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  sort_order: number;
};

/** Part 2 documents persisted for a report round, in append order. */
export async function listReportDocuments(
  reportId: string
): Promise<ReportDocument[]> {
  await requireUser();
  const rows = (await sql`
    select id, file_name, storage_path, size_bytes, mime_type, sort_order
    from report_documents
    where report_id=${reportId}
    order by sort_order, created_at
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    file_name: String(r.file_name),
    storage_path: String(r.storage_path),
    size_bytes: num(r.size_bytes),
    mime_type: r.mime_type == null ? null : String(r.mime_type),
    sort_order: num(r.sort_order),
  }));
}

export async function addReportDocument(
  reportId: string,
  meta: {
    storage_path: string;
    file_name: string;
    size_bytes: number;
    mime_type: string | null;
    sort_order: number;
  }
): Promise<void> {
  await requireUser();
  await assertReportEditable(reportId);
  await sql`insert into report_documents (report_id, storage_path, file_name, size_bytes, mime_type, sort_order)
    values (${reportId}, ${meta.storage_path}, ${meta.file_name}, ${meta.size_bytes}, ${meta.mime_type}, ${meta.sort_order})`;
}

export async function deleteReportDocument(id: string): Promise<void> {
  await requireUser();
  const rows = (await sql`select report_id from report_documents where id=${id}`) as {
    report_id: string;
  }[];
  if (rows[0]) await assertReportEditable(rows[0].report_id);
  await sql`delete from report_documents where id=${id}`;
}

export async function clearReportDocuments(reportId: string): Promise<void> {
  await requireUser();
  await assertReportEditable(reportId);
  await sql`delete from report_documents where report_id=${reportId}`;
}

/** Persist a new append order for a round's documents. */
export async function reorderReportDocuments(
  reportId: string,
  ids: string[]
): Promise<ActionResult> {
  try {
    await requireUser();
    await assertReportEditable(reportId);
    let order = 0;
    for (const id of ids) {
      order += 1;
      await sql`update report_documents set sort_order=${order} where id=${id} and report_id=${reportId}`;
    }
    return { ok: true };
  } catch (error) {
    console.error("reorderReportDocuments failed:", error);
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Temporary share links
// ---------------------------------------------------------------------------

export type ReportShare = ReportShareCore;

export type ReportShareResult =
  | { ok: true; share: ReportShare | null }
  | { ok: false; error: string };

/** Current active share link for a report round (for the settings UI). */
export async function getReportShare(reportId: string): Promise<ReportShare | null> {
  await requireUser();
  return getActiveReportShare(reportId);
}

/** Mint (or refresh) a share link. Only issued rounds may be shared. */
export async function createReportShareLink(
  reportId: string,
  days = 7
): Promise<ReportShareResult> {
  try {
    await requireUser();
    const res = await mintReportShare(reportId, days);
    return res.ok ? { ok: true, share: res.share } : res;
  } catch (error) {
    console.error("createReportShareLink failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

export async function revokeReportShareLink(reportId: string): Promise<ActionResult> {
  try {
    await requireUser();
    await sql`update monthly_reports set share_token=null, share_revoked_at=${new Date().toISOString()} where id=${reportId}`;
    return { ok: true };
  } catch (error) {
    console.error("revokeReportShareLink failed:", error);
    return fail(error);
  }
}

export type ReportEmailQuota = { limit: number; sent: number; remaining: number };

/** Report-email quota for the current calendar month (client delivery). */
export async function getReportEmailQuota(): Promise<ReportEmailQuota> {
  await requireUser();
  return readReportEmailQuota();
}

export type ReportEmailLog = {
  id: string;
  to_email: string;
  status: "sent" | "failed";
  /** Staff email, or "client" when the client requested the archive copy. */
  sent_by: string | null;
  sent_at: string;
  error: string | null;
};

/** Recent delivery attempts for a round (most recent first). */
export async function listReportEmails(reportId: string): Promise<ReportEmailLog[]> {
  await requireUser();
  try {
    const rows = (await sql`
      select id, to_email, status, sent_by, sent_at, error
      from report_emails
      where report_id=${reportId}
      order by sent_at desc
      limit 20
    `) as {
      id: string;
      to_email: string;
      status: string;
      sent_by: string | null;
      sent_at: string;
      error: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      to_email: r.to_email,
      status: r.status === "failed" ? "failed" : "sent",
      sent_by: r.sent_by,
      sent_at: typeof r.sent_at === "string" ? r.sent_at : new Date(r.sent_at).toISOString(),
      error: r.error,
    }));
  } catch {
    // Table not migrated yet.
    return [];
  }
}

/** Successful-email counts per round for a client+month (for the round chips). */
export async function getRoundEmailCounts(
  clientId: string,
  period: string
): Promise<Record<string, number>> {
  await requireUser();
  try {
    const rows = (await sql`
      select e.report_id, count(*)::int as c
      from report_emails e
      join monthly_reports r on r.id = e.report_id
      where r.client_id=${clientId} and r.period_label=${period} and e.status='sent'
      group by e.report_id
    `) as { report_id: string; c: number }[];
    const map: Record<string, number> = {};
    for (const r of rows) map[r.report_id] = Number(r.c);
    return map;
  } catch {
    return {};
  }
}

/** Public: resolve a share token to a report id, respecting expiry/revoke. */
/** Public: resolve a share token (optionally slug-prefixed) to a report. */
export async function resolveShareToken(
  token: string
): Promise<{ reportId: string; expiresAt: string | null } | null> {
  const key = shareTokenFromSegment(token);
  if (!key) return null;
  const rows = await sql`
    select id, share_token, share_expires_at, share_revoked_at
    from monthly_reports where share_token=${key}
  ` as {
    id: string;
    share_token: string | null;
    share_expires_at: string | null;
    share_revoked_at: string | null;
  }[];
  const row = rows[0];
  if (!row || !isShareActive(row)) return null;
  return {
    reportId: String(row.id),
    expiresAt: row.share_expires_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tax-ID gate (client-facing share links)
// ---------------------------------------------------------------------------

export type ShareGateInfo = {
  reportId: string;
  firmName: string;
  hasTaxId: boolean;
  expiresAt: string | null;
};

/**
 * Public: minimal info needed to render the gate screen. Deliberately does not
 * load the report model (no client name, amounts, or R2 assets).
 */
export async function getShareGateInfo(
  token: string
): Promise<ShareGateInfo | null> {
  const key = shareTokenFromSegment(token);
  if (!key) return null;
  const rows = (await sql`
    select r.id, r.share_token, r.share_expires_at, r.share_revoked_at,
           c.tax_id, s.firm_name
    from monthly_reports r
    join clients c on c.id = r.client_id
    left join app_settings s on s.id = 1
    where r.share_token=${key}
  `) as {
    id: string;
    share_token: string | null;
    share_expires_at: string | null;
    share_revoked_at: string | null;
    tax_id: string | null;
    firm_name: string | null;
  }[];
  const row = rows[0];
  if (!row || !isShareActive(row)) return null;
  return {
    reportId: String(row.id),
    firmName: (row.firm_name ?? "").trim() || "Taxwork",
    hasTaxId: normalizeTaxId(row.tax_id).length > 0,
    expiresAt: row.share_expires_at ?? null,
  };
}

export type ShareVerifyResult =
  | { ok: true }
  | { ok: false; error: string; retryAfter?: number };

/** Cookie lifetime: don't outlive the link, and cap at 30 days. */
function shareCookieMaxAge(expiresAt: string | null): number {
  const cap = 30 * 86400;
  if (!expiresAt) return cap;
  const secs = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(secs) || secs <= 0) return 60;
  return Math.min(secs, cap);
}

/**
 * Public: check the submitted tax ID against the report's client. On success,
 * sets the signed access cookie so the page, PDF, and slip routes are unlocked.
 * Rate-limited per IP to blunt guessing. Errors are intentionally generic.
 */
export async function verifyShareTaxId(
  token: string,
  taxId: string
): Promise<ShareVerifyResult> {
  const key = shareTokenFromSegment(token);
  if (!key) return { ok: false, error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" };

  const limit = rateLimit(clientKey(await headers(), "share-verify"), 5, 10 * 60_000);
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil(limit.retryAfter / 60));
    return {
      ok: false,
      error: `พยายามหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${mins} นาที`,
      retryAfter: limit.retryAfter,
    };
  }

  const input = normalizeTaxId(taxId);
  if (input.length !== SHARE_TAX_ID_SUFFIX_LENGTH) {
    return {
      ok: false,
      error: `กรุณากรอกเลขท้าย ${SHARE_TAX_ID_SUFFIX_LENGTH} หลักของเลขประจำตัวผู้เสียภาษี`,
    };
  }

  const rows = (await sql`
    select r.id, r.share_token, r.share_expires_at, r.share_revoked_at, c.tax_id
    from monthly_reports r
    join clients c on c.id = r.client_id
    where r.share_token=${key}
  `) as {
    id: string;
    share_token: string | null;
    share_expires_at: string | null;
    share_revoked_at: string | null;
    tax_id: string | null;
  }[];
  const row = rows[0];
  if (!row || !isShareActive(row)) {
    return { ok: false, error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" };
  }

  const expected = normalizeTaxId(row.tax_id);
  if (!isValidTaxId(expected) || !matchesTaxIdSuffix(input, expected)) {
    return { ok: false, error: "เลขท้ายไม่ถูกต้อง" };
  }

  const store = await cookies();
  store.set(
    shareAccessCookieName(key),
    signShareAccess(key),
    shareAccessCookieOptions(shareCookieMaxAge(row.share_expires_at))
  );
  return { ok: true };
}

/** Public: newest stored PDF copy for a report (for the share download). */
export async function latestReportFile(
  reportId: string
): Promise<{ storage_path: string; file_name: string } | null> {
  const rows = (await sql`
    select storage_path, file_name from files
    where report_id=${reportId} and category='monthly-report'
    order by uploaded_at desc limit 1
  `) as { storage_path: string; file_name: string }[];
  return rows[0]
    ? { storage_path: String(rows[0].storage_path), file_name: String(rows[0].file_name) }
    : null;
}

// ---------------------------------------------------------------------------
// Payment reconciliation
// ---------------------------------------------------------------------------

export type ReportPayment = {
  id: string;
  amount: number;
  method: string | null;
  note: string | null;
  paid_at: string;
  recorded_by: string | null;
};

function toPayment(r: Record<string, unknown>): ReportPayment {
  return {
    id: String(r.id),
    amount: num(r.amount),
    method: r.method == null ? null : String(r.method),
    note: r.note == null ? null : String(r.note),
    paid_at: str(r.paid_at),
    recorded_by: r.recorded_by == null ? null : String(r.recorded_by),
  };
}

export async function listReportPayments(reportId: string): Promise<ReportPayment[]> {
  await requireUser();
  const rows = (await sql`
    select id, amount, method, note, paid_at, recorded_by
    from report_payments where report_id=${reportId}
    order by paid_at desc
  `) as Record<string, unknown>[];
  return rows.map(toPayment);
}

/** Sum of filing amounts for a round (what the client owes). */
async function reportTotalDue(reportId: string): Promise<number> {
  const rows = (await sql`
    select coalesce(sum(amount), 0)::float8 as total
    from monthly_filings where report_id=${reportId}
  `) as { total: number }[];
  return Number(rows[0]?.total ?? 0);
}

export async function addReportPayment(
  reportId: string,
  input: { amount: number; method?: string | null; note?: string | null }
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "จำนวนเงินไม่ถูกต้อง" };
    await sql`insert into report_payments (report_id, amount, method, note, recorded_by)
      values (${reportId}, ${amount}, ${input.method?.trim() || null}, ${input.note?.trim() || null}, ${user.email})`;
    return { ok: true };
  } catch (error) {
    console.error("addReportPayment failed:", error);
    return fail(error);
  }
}

export async function deleteReportPayment(id: string): Promise<ActionResult> {
  try {
    await requireUser();
    await sql`delete from report_payments where id=${id}`;
    return { ok: true };
  } catch (error) {
    console.error("deleteReportPayment failed:", error);
    return fail(error);
  }
}

export type ReportPaymentTotals = { due: number; paid: number };

/** Public totals for the share page (report id comes from a valid token). */
export async function getReportPaymentTotals(
  reportId: string
): Promise<ReportPaymentTotals> {
  const due = await reportTotalDue(reportId);
  const rows = (await sql`
    select coalesce(sum(amount), 0)::float8 as paid
    from report_payments where report_id=${reportId}
  `) as { paid: number }[];
  return { due, paid: Number(rows[0]?.paid ?? 0) };
}
