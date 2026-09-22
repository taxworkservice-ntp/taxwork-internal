import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { r2, R2_BUCKET } from "@/lib/r2";

/**
 * Server-side report model. This is the single source of truth for the
 * server renderer (HTML -> PDF). Unlike the legacy browser builder, every
 * binary asset is resolved to a data URI here so the headless browser needs no
 * network or auth.
 */

export type ReportModelFiling = {
  id: string;
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  remark: string | null;
  payment_method: string | null;
  bank: ReportModelBank | null;
  /** Per-filing QR (preferred) else the bank's QR, as a data URI. */
  qrDataUri: string | null;
};

export type ReportModelBank = {
  id: string;
  label: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string | null;
  qrDataUri: string | null;
  logoDataUri: string | null;
  logoBottomDataUri: string | null;
};

export type ReportModelDocument = {
  id: string;
  file_name: string;
  mime_type: string | null;
  dataUri: string;
};

export type ReportModel = {
  reportId: string;
  firmName: string;
  preparedBy: string;
  reportNo: string | null;
  reportLabel: string | null;
  periodLabel: string;
  issueDate: string;
  logoDataUri: string | null;
  client: {
    name: string;
    tax_id: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  filings: ReportModelFiling[];
  documents: ReportModelDocument[];
  total: number;
};

async function getBytes(
  storagePath: string | null
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!storagePath) return null;
  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: storagePath })
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return null;
    return { bytes, contentType: obj.ContentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

async function toDataUri(storagePath: string | null): Promise<string | null> {
  const got = await getBytes(storagePath);
  if (!got) return null;
  return `data:${got.contentType};base64,${Buffer.from(got.bytes).toString("base64")}`;
}

function thaiToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
}

/** Build the full server-side model for a report round. */
export async function buildReportModel(reportId: string): Promise<ReportModel> {
  const reportRows = (await sql`
    select r.*, c.name as client_name, c.tax_id, c.address, c.phone, c.email
    from monthly_reports r
    join clients c on c.id = r.client_id
    where r.id=${reportId}
  `) as Record<string, unknown>[];
  const report = reportRows[0];
  if (!report) throw new Error("ไม่พบรายงาน");

  const settingsRows = (await sql`
    select firm_name, prepared_by, company_logo_path from app_settings where id=1
  `) as { firm_name: string | null; prepared_by: string | null; company_logo_path: string | null }[];
  const settings = settingsRows[0];

  const filingRows = (await sql`
    select * from monthly_filings where report_id=${reportId}
    order by sort_order, created_at
  `) as Record<string, unknown>[];
  const filingIds = filingRows.map((f) => String(f.id));

  const banks = (await sql`select * from bank_accounts`) as Record<string, unknown>[];
  const bankById = new Map(banks.map((b) => [String(b.id), b]));

  const qrPathsByFiling = new Map<string, string>();
  if (filingIds.length) {
    const atts = (await sql.query(
      `select filing_id, storage_path from filing_attachments
       where kind='qr' and filing_id in (${filingIds.map((_, i) => `$${i + 1}`).join(",")})
       order by created_at`,
      filingIds
    )) as { filing_id: string; storage_path: string }[];
    for (const a of atts) {
      // first QR wins (matches "one QR per filing, replace on upload")
      if (!qrPathsByFiling.has(a.filing_id))
        qrPathsByFiling.set(a.filing_id, a.storage_path);
    }
  }

  // Resolve bank binaries once, then reuse across filings sharing a bank.
  const bankCache = new Map<string, ReportModelBank | null>();
  async function resolveBank(bankId: string | null): Promise<ReportModelBank | null> {
    if (!bankId) return null;
    if (bankCache.has(bankId)) return bankCache.get(bankId) ?? null;
    const b = bankById.get(bankId);
    if (!b) {
      bankCache.set(bankId, null);
      return null;
    }
    const [qrDataUri, logoDataUri, logoBottomDataUri] = await Promise.all([
      toDataUri((b.qr_path as string) ?? null),
      toDataUri((b.logo_path as string) ?? null),
      toDataUri((b.logo_bottom_path as string) ?? null),
    ]);
    const resolved: ReportModelBank = {
      id: bankId,
      label: String(b.label ?? ""),
      bank_name: String(b.bank_name ?? ""),
      account_no: String(b.account_no ?? ""),
      account_name: String(b.account_name ?? ""),
      promptpay_id: b.promptpay_id == null ? null : String(b.promptpay_id),
      qrDataUri,
      logoDataUri,
      logoBottomDataUri,
    };
    bankCache.set(bankId, resolved);
    return resolved;
  }

  const filings: ReportModelFiling[] = [];
  for (const f of filingRows) {
    const id = String(f.id);
    const bank = await resolveBank(
      f.bank_account_id == null ? null : String(f.bank_account_id)
    );
    const qrPath = qrPathsByFiling.get(id) ?? null;
    const qrDataUri = qrPath ? await toDataUri(qrPath) : bank?.qrDataUri ?? null;
    filings.push({
      id,
      form_code: String(f.form_code ?? ""),
      description: f.description == null ? null : String(f.description),
      amount: Number(f.amount ?? 0),
      due_date: f.due_date == null ? null : String(f.due_date).slice(0, 10),
      remark: f.remark == null ? null : String(f.remark),
      payment_method: f.payment_method == null ? null : String(f.payment_method),
      bank,
      qrDataUri,
    });
  }

  const docRows = (await sql`
    select id, file_name, mime_type, storage_path from report_documents
    where report_id=${reportId} order by sort_order, created_at
  `) as Record<string, unknown>[];
  const documents: ReportModelDocument[] = [];
  for (const d of docRows) {
    const dataUri = await toDataUri(String(d.storage_path));
    if (!dataUri) continue;
    documents.push({
      id: String(d.id),
      file_name: String(d.file_name),
      mime_type: d.mime_type == null ? null : String(d.mime_type),
      dataUri,
    });
  }

  const total = filings.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);

  return {
    reportId,
    firmName: settings?.firm_name?.trim() || "Taxwork",
    preparedBy: settings?.prepared_by?.trim() || settings?.firm_name?.trim() || "Taxwork",
    reportNo: report.report_no == null ? null : String(report.report_no),
    reportLabel: report.label == null ? null : String(report.label),
    periodLabel: String(report.period_label ?? ""),
    issueDate: thaiToday(),
    logoDataUri: await toDataUri(settings?.company_logo_path ?? null),
    client: {
      name: String(report.client_name ?? ""),
      tax_id: report.tax_id == null ? null : String(report.tax_id),
      address: report.address == null ? null : String(report.address),
      phone: report.phone == null ? null : String(report.phone),
      email: report.email == null ? null : String(report.email),
    },
    filings,
    documents,
    total,
  };
}
