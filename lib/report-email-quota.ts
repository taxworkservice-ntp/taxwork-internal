import "server-only";
import { sql } from "@/lib/db";
import { REPORT_EMAIL_MONTHLY_LIMIT } from "@/lib/email/report-email";

/**
 * Monthly report-email quota accounting. Kept dependency-light (no Chromium,
 * no email SDK) so it can be imported by the Reports page server actions
 * without pulling the heavy send pipeline into that function.
 */

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
