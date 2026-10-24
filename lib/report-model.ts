import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { appOrigin } from "@/lib/app-url";
import { shareSlug, shareUrl } from "@/lib/share-link";
import { r2, R2_BUCKET } from "@/lib/r2";

/**
 * Server-side report model. This is the single source of truth for the
 * server renderer (HTML -> PDF). Unlike the legacy browser builder, every
 * binary asset is resolved to a data URI here so the headless browser needs no
 * network or auth.
 */

export type ReportModelSlip = {
  id: string;
  file_name: string;
  mime_type: string | null;
  /** True for PNG/JPG (embed/inline); false for PDF. */
  isImage: boolean;
  /** R2 key — the renderer reads bytes from here. */
  storagePath: string;
  /** Inline data URI for images (share page); null for PDFs. */
  dataUri: string | null;
  /** Page this slip landed on in the generated PDF (null until generated). */
  pdfPage: number | null;
};

export type ReportModelAttachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  isImage: boolean;
};

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
  /** Pay-in slips attached to this filing, in upload order. */
  slips: ReportModelSlip[];
  /**
   * Share-link-only documents. These are intentionally NOT part of `slips`,
   * so the combined PDF/email never includes them.
   */
  attachedDocuments: ReportModelAttachment[];
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
  /** Firm contact for the letterhead; null when unset. */
  firmPhone: string | null;
  firmLine: string | null;
  /** Firm brand colour (hex) for subtle PDF accents; null → neutral default. */
  brandColor: string | null;
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
  /** Public share URL when an active link exists (rendered on the payment page). */
  shareUrl: string | null;
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

function guessMimeFromPath(p: string): string | null {
  const lower = p.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return null;
}

function isGenericMime(ct: string | null | undefined): boolean {
  if (!ct) return true;
  const m = ct.toLowerCase();
  return m === "application/octet-stream" || m === "binary/octet-stream" || m === "application/binary";
}

async function toDataUri(
  storagePath: string | null,
  fallbackMime: string | null = null
): Promise<string | null> {
  const got = await getBytes(storagePath);
  if (!got) return null;
  // R2 sometimes stores a generic/absent content type; fall back to the DB mime
  // then the file extension so images always render in the PDF.
  let ct = got.contentType;
  if (isGenericMime(ct)) {
    ct = fallbackMime || guessMimeFromPath(storagePath ?? "") || ct;
  }
  return `data:${ct};base64,${Buffer.from(got.bytes).toString("base64")}`;
}

function isImageMime(mime: string | null, storagePath: string): boolean {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return true;
  const lower = storagePath.toLowerCase();
  return /\.(png|jpe?g)$/.test(lower);
}

/** Read raw object bytes from R2 (used for PDF slip pages). */
export async function readObjectBytes(
  storagePath: string
): Promise<Uint8Array | null> {
  const got = await getBytes(storagePath);
  return got?.bytes ?? null;
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
    select firm_name, prepared_by, company_logo_path, company_logo_file_name,
           brand_color, firm_phone, firm_line
    from app_settings where id=1
  `) as {
    firm_name: string | null;
    prepared_by: string | null;
    company_logo_path: string | null;
    company_logo_file_name: string | null;
    brand_color: string | null;
    firm_phone: string | null;
    firm_line: string | null;
  }[];
  const settings = settingsRows[0];

  const filingRows = (await sql`
    select * from monthly_filings where report_id=${reportId}
    order by sort_order, created_at
  `) as Record<string, unknown>[];
  const filingIds = filingRows.map((f) => String(f.id));

  const banks = (await sql`select * from bank_accounts`) as Record<string, unknown>[];
  const bankById = new Map(banks.map((b) => [String(b.id), b]));

  const qrPathsByFiling = new Map<string, string>();
  const slipsByFiling = new Map<
    string,
    { id: string; storage_path: string; file_name: string; mime_type: string | null; pdf_page: number | null }[]
  >();
  const documentsByFiling = new Map<string, ReportModelAttachment[]>();
  if (filingIds.length) {
    const placeholders = filingIds.map((_, i) => `$${i + 1}`).join(",");
    const qrs = (await sql.query(
      `select filing_id, storage_path from filing_attachments
       where kind='qr' and filing_id in (${placeholders})
       order by created_at`,
      filingIds
    )) as { filing_id: string; storage_path: string }[];
    for (const a of qrs) {
      // first QR wins (matches "one QR per filing, replace on upload")
      if (!qrPathsByFiling.has(a.filing_id))
        qrPathsByFiling.set(a.filing_id, a.storage_path);
    }
    const slips = (await sql.query(
      `select id, filing_id, storage_path, file_name, mime_type, pdf_page from filing_attachments
       where kind='slip' and filing_id in (${placeholders})
       order by created_at`,
      filingIds
    )) as {
      id: string;
      filing_id: string;
      storage_path: string;
      file_name: string;
      mime_type: string | null;
      pdf_page: number | null;
    }[];
    for (const a of slips) {
      if (!slipsByFiling.has(a.filing_id)) slipsByFiling.set(a.filing_id, []);
      slipsByFiling.get(a.filing_id)!.push(a);
    }
    const shareDocs = (await sql.query(
      `select id, filing_id, file_name, mime_type from filing_attachments
       where kind='document' and filing_id in (${placeholders})
       order by created_at`,
      filingIds
    )) as {
      id: string;
      filing_id: string;
      file_name: string;
      mime_type: string | null;
    }[];
    for (const d of shareDocs) {
      if (!documentsByFiling.has(d.filing_id)) documentsByFiling.set(d.filing_id, []);
      documentsByFiling.get(d.filing_id)!.push({
        id: String(d.id),
        file_name: String(d.file_name),
        mime_type: d.mime_type == null ? null : String(d.mime_type),
        isImage: isImageMime(d.mime_type, String(d.file_name)),
      });
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
      toDataUri((b.qr_path as string) ?? null, (b.qr_mime_type as string) ?? null),
      toDataUri((b.logo_path as string) ?? null, (b.logo_mime_type as string) ?? null),
      toDataUri(
        (b.logo_bottom_path as string) ?? null,
        (b.logo_bottom_mime_type as string) ?? null
      ),
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

    const slips: ReportModelSlip[] = [];
    for (const s of slipsByFiling.get(id) ?? []) {
      const isImage = isImageMime(s.mime_type, s.storage_path);
      slips.push({
        id: String(s.id),
        file_name: String(s.file_name),
        mime_type: s.mime_type == null ? null : String(s.mime_type),
        isImage,
        storagePath: String(s.storage_path),
        dataUri: isImage ? await toDataUri(String(s.storage_path)) : null,
        pdfPage: s.pdf_page == null ? null : Number(s.pdf_page),
      });
    }

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
      slips,
      attachedDocuments: documentsByFiling.get(id) ?? [],
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

  const shareToken = report.share_token == null ? null : String(report.share_token);
  const shareExpires =
    report.share_expires_at == null ? null : String(report.share_expires_at);
  const shareRevoked =
    report.share_revoked_at == null ? null : String(report.share_revoked_at);
  const shareActive =
    Boolean(shareToken) &&
    !shareRevoked &&
    (!shareExpires || new Date(shareExpires).getTime() > Date.now());
  const shareUrlValue = shareActive
    ? shareUrl(
        await appOrigin(),
        shareSlug(String(report.period_label ?? ""), Number(report.seq ?? 1)),
        shareToken!
      )
    : null;

  return {
    reportId,
    firmName: settings?.firm_name?.trim() || "Taxwork",
    preparedBy: settings?.prepared_by?.trim() || settings?.firm_name?.trim() || "Taxwork",
    reportNo: report.report_no == null ? null : String(report.report_no),
    reportLabel: report.label == null ? null : String(report.label),
    periodLabel: String(report.period_label ?? ""),
    issueDate: thaiToday(),
    logoDataUri: await toDataUri(
      settings?.company_logo_path ?? null,
      guessMimeFromPath(settings?.company_logo_file_name ?? "")
    ),
    firmPhone: settings?.firm_phone?.trim() || null,
    firmLine: settings?.firm_line?.trim() || null,
    brandColor: settings?.brand_color?.trim() || null,
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
    shareUrl: shareUrlValue,
  };
}
