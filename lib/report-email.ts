import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { r2, R2_BUCKET } from "@/lib/r2";
import { periodToThai } from "@/lib/report-format";
import {
  REPORT_EMAIL_MONTHLY_LIMIT,
  type ReportEmailInput,
} from "@/lib/email/report-email";
import { getActiveReportShare, mintReportShare } from "@/lib/report-share";

/**
 * Server-side helpers for the report email: monthly quota accounting and
 * assembling the pure builder's inputs from the database.
 */

export type EmailQuota = { limit: number; sent: number; remaining: number };

export async function countSentThisMonth(): Promise<number> {
  const rows = (await sql`
    select count(*)::int as c from report_emails
    where status='sent' and sent_at >= date_trunc('month', now())
  `) as { c: number }[];
  return Number(rows[0]?.c ?? 0);
}

export async function getReportEmailQuota(): Promise<EmailQuota> {
  const sent = await countSentThisMonth();
  return {
    limit: REPORT_EMAIL_MONTHLY_LIMIT,
    sent,
    remaining: Math.max(0, REPORT_EMAIL_MONTHLY_LIMIT - sent),
  };
}

async function logoDataUri(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: storagePath })
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return null;
    const type = obj.ContentType ?? "image/png";
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export type ReportEmailContext =
  | {
      ok: true;
      to: string;
      clientId: string;
      reportNo: string | null;
      attachmentName: string;
      email: Omit<ReportEmailInput, "attachmentName">;
    }
  | { ok: false; error: string; status: number };

/**
 * Gather everything the email needs, ensuring an active share link exists.
 * Returns an error result (with an HTTP status) when the round can't be sent.
 */
export async function loadReportEmailContext(
  reportId: string
): Promise<ReportEmailContext> {
  const rows = (await sql`
    select r.status, r.period_label, r.report_no, r.public_id,
           c.id as client_id, c.name as client_name, c.email as client_email, c.tax_id
    from monthly_reports r
    join clients c on c.id = r.client_id
    where r.id=${reportId}
  `) as {
    status: string;
    period_label: string;
    report_no: string | null;
    public_id: string;
    client_id: string;
    client_name: string;
    client_email: string | null;
    tax_id: string | null;
  }[];
  const report = rows[0];
  if (!report) return { ok: false, error: "ไม่พบรายงาน", status: 404 };
  if (report.status !== "issued")
    return { ok: false, error: "ต้องออกรายงานก่อนจึงจะส่งอีเมลได้", status: 409 };
  const to = report.client_email?.trim();
  if (!to) return { ok: false, error: "ลูกค้ายังไม่มีอีเมล กรุณาเพิ่มที่หน้าลูกค้าก่อน", status: 400 };

  const settings = (await sql`
    select firm_name, prepared_by, brand_color, company_logo_path,
           firm_phone, firm_line, firm_address
    from app_settings where id=1
  `) as {
    firm_name: string | null;
    prepared_by: string | null;
    brand_color: string | null;
    company_logo_path: string | null;
    firm_phone: string | null;
    firm_line: string | null;
    firm_address: string | null;
  }[];
  const s = settings[0];

  const totals = (await sql`
    select coalesce(sum(amount), 0)::float8 as total
    from monthly_filings where report_id=${reportId}
  `) as { total: number }[];

  // Ensure a live share link; mint one if missing/expired.
  let share = await getActiveReportShare(reportId);
  if (!share) {
    const minted = await mintReportShare(reportId, 7);
    if (!minted.ok) return { ok: false, error: minted.error, status: 400 };
    share = minted.share;
  }

  const reportNo = report.report_no?.trim() || null;
  const attachmentName = `รายงานภาษี-${periodToThai(report.period_label)}.pdf`;

  return {
    ok: true,
    to,
    clientId: report.client_id,
    reportNo,
    attachmentName,
    email: {
      firmName: s?.firm_name?.trim() || "Taxwork",
      preparedBy: s?.prepared_by?.trim() || null,
      firmPhone: s?.firm_phone?.trim() || null,
      firmLine: s?.firm_line?.trim() || null,
      firmAddress: s?.firm_address?.trim() || null,
      brandColor: s?.brand_color?.trim() || null,
      logoDataUri: await logoDataUri(s?.company_logo_path ?? null),
      clientName: report.client_name,
      periodTh: periodToThai(report.period_label),
      reportNo,
      total: Number(totals[0]?.total ?? 0),
      shareUrl: share.url,
    },
  };
}
