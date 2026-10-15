import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { sql } from "@/lib/db";
import { buildServerReportPdf } from "@/lib/report-pdf/server";
import {
  buildReportEmail,
  REPORT_EMAIL_MONTHLY_LIMIT,
} from "@/lib/email/report-email";
import { sendEmail } from "@/lib/email/resend";
import { getReportEmailQuota, loadReportEmailContext } from "@/lib/report-email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Send a monthly-report email to the client: a branded link to the public
 * share page plus the server-rendered PDF. Hard-capped at
 * REPORT_EMAIL_MONTHLY_LIMIT successful sends per calendar month; attempts are
 * logged to report_emails (failed rows never count toward the quota).
 */
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { reportId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!reportId) {
    return NextResponse.json({ error: "reportId required" }, { status: 400 });
  }

  const quota = await getReportEmailQuota();
  if (quota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `ครบโควตาส่งอีเมล ${REPORT_EMAIL_MONTHLY_LIMIT} ฉบับ/เดือนแล้ว`,
        remaining: 0,
        limit: quota.limit,
      },
      { status: 429 }
    );
  }

  const ctx = await loadReportEmailContext(reportId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const record = async (
    status: "sent" | "failed",
    providerId: string | null,
    error: string | null
  ) => {
    try {
      await sql`insert into report_emails
        (report_id, client_id, to_email, subject, status, provider_message_id, error, sent_by)
        values (${reportId}, ${ctx.clientId}, ${ctx.to}, ${subject}, ${status},
                ${providerId}, ${error}, ${user.email})`;
    } catch (e) {
      console.error("report_emails insert failed:", e);
    }
  };

  let subject = ctx.email.reportNo
    ? `${ctx.email.firmName} — รายงานสรุปการนำส่งภาษีประจำเดือน ${ctx.email.periodTh} (${ctx.email.reportNo})`
    : `${ctx.email.firmName} — รายงานสรุปการนำส่งภาษีประจำเดือน ${ctx.email.periodTh}`;

  try {
    const { bytes } = await buildServerReportPdf(reportId);
    const built = buildReportEmail({
      ...ctx.email,
      attachmentName: ctx.attachmentName,
    });
    subject = built.subject;

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
    return NextResponse.json({ ok: true, remaining: after.remaining, limit: after.limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sendReportEmail failed:", error);
    await record("failed", null, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
