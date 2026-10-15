import "server-only";
import { sql } from "@/lib/db";
import { generatePublicId } from "@/lib/ids";
import { appOrigin } from "@/lib/app-url";
import { shareSlug, shareUrl } from "@/lib/share-link";
import { isValidTaxId } from "@/lib/share-access";

/**
 * Report share-link core (token minting / lookup), shared by the authenticated
 * server actions in lib/actions/reports.ts and the email route. Callers are
 * responsible for auth (requireUser / requireUserApi).
 */

export type ReportShare = {
  token: string;
  url: string;
  expiresAt: string;
};

export type MintShareResult = { ok: true; share: ReportShare } | { ok: false; error: string };

export function isShareActive(row: {
  share_token: string | null;
  share_expires_at: string | null;
  share_revoked_at: string | null;
}): boolean {
  if (!row.share_token || row.share_revoked_at) return false;
  if (row.share_expires_at && new Date(row.share_expires_at).getTime() < Date.now())
    return false;
  return true;
}

/** Current active share link for a report round, or null. */
export async function getActiveReportShare(reportId: string): Promise<ReportShare | null> {
  const rows = (await sql`
    select share_token, share_expires_at, share_revoked_at, period_label, seq
    from monthly_reports where id=${reportId}
  `) as {
    share_token: string | null;
    share_expires_at: string | null;
    share_revoked_at: string | null;
    period_label: string;
    seq: number;
  }[];
  const row = rows[0];
  if (!row || !isShareActive(row)) return null;
  const origin = await appOrigin();
  return {
    token: row.share_token!,
    url: shareUrl(origin, shareSlug(row.period_label, Number(row.seq) || 1), row.share_token!),
    expiresAt: row.share_expires_at ?? "",
  };
}

/**
 * Mint (or refresh) a share link. Only issued rounds may be shared, and the
 * client must have a valid tax ID to pass the public gate. Writing a new token
 * replaces (cancels) any previous link immediately.
 */
export async function mintReportShare(reportId: string, days = 7): Promise<MintShareResult> {
  const rows = (await sql`
    select r.status, r.period_label, r.seq, c.tax_id
    from monthly_reports r
    join clients c on c.id = r.client_id
    where r.id=${reportId}
  `) as {
    status: string;
    period_label: string;
    seq: number;
    tax_id: string | null;
  }[];
  if (!rows[0]) return { ok: false, error: "ไม่พบรายงาน" };
  if (rows[0].status !== "issued")
    return { ok: false, error: "ต้องออกรายงานก่อนจึงจะสร้างลิงก์ได้" };
  if (!isValidTaxId(rows[0].tax_id))
    return {
      ok: false,
      error:
        "ลูกค้ายังไม่มีเลขประจำตัวผู้เสียภาษี (13 หลัก) กรุณาเพิ่มที่หน้าลูกค้าก่อนสร้างลิงก์",
    };

  const token = generatePublicId(20);
  const expires = new Date(Date.now() + Math.max(1, days) * 86400000);
  await sql`update monthly_reports
    set share_token=${token}, share_expires_at=${expires.toISOString()}, share_revoked_at=null
    where id=${reportId}`;
  const origin = await appOrigin();
  const slug = shareSlug(rows[0].period_label, Number(rows[0].seq) || 1);
  return {
    ok: true,
    share: {
      token,
      url: shareUrl(origin, slug, token),
      expiresAt: expires.toISOString(),
    },
  };
}
