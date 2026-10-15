import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { r2, R2_BUCKET } from "@/lib/r2";
import { periodToThai } from "@/lib/report-format";
import { sanitizeFileName } from "@/lib/download";
import {
  REPORT_EMAIL_MONTHLY_LIMIT,
  buildReportEmail,
  type ReportEmailInput,
} from "@/lib/email/report-email";
import { sendEmail } from "@/lib/email/resend";

/**
 * Server-side helpers for the report email: monthly quota accounting, context
 * assembly, and one shared send path used by both the admin route and the
 * client-facing share route.
 */

/** Minutes within which a repeat send for the same round is treated as a dupe. */
export const REPORT_EMAIL_DEDUPE_MINUTES = 10;

export type EmailQuota = { limit: number; sent: number; remaining: number };

export async function countSentThisMonth(): Promise<number> {
  const rows = (await sql`
    select count(*)::int as c from report_emails
    where status='sent'
      and sent_at >= date_trunc('month', now() at time zone 'Asia/Bangkok')
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

/** True when this round was already emailed successfully within `minutes`. */
export async function hasRecentSend(
  reportId: string,
  minutes = REPORT_EMAIL_DEDUPE_MINUTES
): Promise<boolean> {
  const rows = (await sql`
    select 1 from report_emails
    where report_id=${reportId} and status='sent'
      and sent_at >= now() - make_interval(mins => ${minutes})
    limit 1
  `) as unknown[];
  return rows.length > 0;
}

export type ReportEmailContext =
  | {
      ok: true;
      to: string;
      clientId: string;
      attachmentName: string;
      email: ReportEmailInput;
    }
  | { ok: false; error: string; status: number };

/** Load everything needed to email a round, enforcing the send guards. */
export async function loadReportEmailContext(
  reportId: string
): Promise<ReportEmailContext> {
  const rows = (await sql`
    select r.status, r.period_label, r.report_no, r.label,
           c.id as client_id, c.name as client_name, c.email as client_email
    from monthly_reports r
    join clients c on c.id = r.client_id
    where r.id=${reportId}
  `) as {
    status: string;
    period_label: string;
    report_no: string | null;
    label: string | null;
    client_id: string;
    client_name: string;
    client_email: string | null;
  }[];
  const report = rows[0];
  if (!report) return { ok: false, error: "ไม่พบรายงาน", status: 404 };
  if (report.status !== "issued")
    return { ok: false, error: "ต้องออกรายงานก่อนจึงจะส่งอีเมลได้", status: 409 };
  const to = report.client_email?.trim();
  if (!to)
    return { ok: false, error: "ลูกค้ายังไม่มีอีเมล กรุณาเพิ่มที่หน้าลูกค้าก่อน", status: 400 };

  const countRows = (await sql`
    select count(*)::int as c from monthly_filings where report_id=${reportId}
  `) as { c: number }[];
  if (Number(countRows[0]?.c ?? 0) === 0)
    return { ok: false, error: "รอบนี้ยังไม่มีรายการ จึงไม่ส่งอีเมล", status: 409 };

  const settings = (await sql`
    select firm_name from app_settings where id=1
  `) as { firm_name: string | null }[];
  const s = settings[0];

  const totals = (await sql`
    select coalesce(sum(amount), 0)::float8 as total
    from monthly_filings where report_id=${reportId}
  `) as { total: number }[];

  const periodTh = periodToThai(report.period_label);
  const label = report.label?.trim() || null;
  const base = `รายงานภาษี-${report.client_name}-${periodTh}${label ? `-${label}` : ""}`;
  const attachmentName = `${sanitizeFileName(base)}.pdf`;

  return {
    ok: true,
    to,
    clientId: report.client_id,
    attachmentName,
    email: {
      firmName: s?.firm_name?.trim() || "Taxwork",
      clientName: report.client_name,
      periodTh,
      reportLabel: label,
      reportNo: report.report_no?.trim() || null,
      total: Number(totals[0]?.total ?? 0),
    },
  };
}

/** Read the latest stored report PDF from R2, or null if none exists yet. */
async function storedReportPdf(reportId: string): Promise<Uint8Array | null> {
  const rows = (await sql`
    select storage_path from files
    where report_id=${reportId} and category='monthly-report'
    order by uploaded_at desc limit 1
  `) as { storage_path: string }[];
  const path = rows[0]?.storage_path;
  if (!path) return null;
  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: String(path) })
    );
    const bytes = await obj.Body?.transformToByteArray();
    return bytes ?? null;
  } catch {
    return null;
  }
}

export type SendReportEmailResult =
  | { ok: true; remaining: number }
  | { ok: false; error: string; status: number };

/**
 * Send (or log a failure for) the client-archival report email for one round.
 * Attaches the canonical stored PDF when available, else a fresh render.
 * Every attempt is logged to report_emails; failures never count toward quota.
 */
export async function sendReportEmailForRound(opts: {
  reportId: string;
  sentBy: string;
}): Promise<SendReportEmailResult> {
  const ctx = await loadReportEmailContext(opts.reportId);
  if (!ctx.ok) return { ok: false, error: ctx.error, status: ctx.status };

  const built = buildReportEmail(ctx.email);
  const record = async (
    status: "sent" | "failed",
    providerId: string | null,
    error: string | null
  ) => {
    try {
      await sql`insert into report_emails
        (report_id, client_id, to_email, subject, status, provider_message_id, error, sent_by)
        values (${opts.reportId}, ${ctx.clientId}, ${ctx.to}, ${built.subject}, ${status},
                ${providerId}, ${error}, ${opts.sentBy})`;
    } catch (e) {
      console.error("report_emails insert failed:", e);
    }
  };

  try {
    // Render lazily so the heavy Chromium pipeline is never pulled into the
    // lightweight server-action graph that also reads the quota.
    let bytes = await storedReportPdf(opts.reportId);
    if (!bytes) {
      const { buildServerReportPdf } = await import("@/lib/report-pdf/server");
      bytes = (await buildServerReportPdf(opts.reportId)).bytes;
    }

    const { id } = await sendEmail({
      to: ctx.to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      attachments: [
        {
          filename: ctx.attachmentName,
          content: Buffer.from(bytes),
          contentType: "application/pdf",
        },
      ],
    });

    await record("sent", id, null);
    const after = await getReportEmailQuota();
    return { ok: true, remaining: after.remaining };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sendReportEmailForRound failed:", error);
    await record("failed", null, message);
    return { ok: false, error: message, status: 502 };
  }
}
