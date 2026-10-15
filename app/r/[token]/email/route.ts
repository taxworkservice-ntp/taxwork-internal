import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveShareToken } from "@/lib/actions/reports";
import { shareTokenFromSegment } from "@/lib/share-link";
import { shareAccessCookieName, verifyShareAccess } from "@/lib/share-access";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  getReportEmailQuota,
  hasRecentSend,
  sendReportEmailForRound,
} from "@/lib/report-email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Public, tax-ID-gated "email me this report" from the share page. The
 * recipient is always the client's email on file (never client-supplied), so
 * this cannot be used as a relay. Deduped per round and rate-limited per IP.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Require the tax-ID gate before sending anything.
  const key = shareTokenFromSegment(token);
  const cookie = (await cookies()).get(shareAccessCookieName(key))?.value;
  if (!verifyShareAccess(cookie, key)) {
    return NextResponse.json({ error: "ต้องยืนยันตัวตนก่อน" }, { status: 403 });
  }

  const resolved = await resolveShareToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 404 });
  }

  const limit = rateLimit(clientKey(request.headers, "share-email"), 5, 10 * 60_000);
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil(limit.retryAfter / 60));
    return NextResponse.json(
      { error: `ส่งบ่อยเกินไป กรุณาลองใหม่ในอีก ${mins} นาที` },
      { status: 429 }
    );
  }

  if (await hasRecentSend(resolved.reportId)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const quota = await getReportEmailQuota();
  if (quota.remaining <= 0) {
    return NextResponse.json(
      { error: "ขณะนี้ไม่สามารถส่งอีเมลได้ กรุณาติดต่อเจ้าหน้าที่" },
      { status: 429 }
    );
  }

  const result = await sendReportEmailForRound({
    reportId: resolved.reportId,
    sentBy: "client",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, remaining: result.remaining });
}
