import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import {
  REPORT_EMAIL_MONTHLY_LIMIT,
} from "@/lib/email/report-email";
import {
  getReportEmailQuota,
  sendReportEmailForRound,
} from "@/lib/report-email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin-triggered report email (Reports page "ส่งอีเมลรายงาน"). Attaches the
 * round's PDF to `clients.email`. Hard-capped at REPORT_EMAIL_MONTHLY_LIMIT
 * successful sends per calendar month; attempts are logged to report_emails.
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

  const result = await sendReportEmailForRound({ reportId, sentBy: user.email });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, remaining: result.remaining });
}
