import { sql } from "@/lib/db";
import {
  DEFAULT_SHARE_PREVIEW_DETAIL,
  normalizeSharePreviewDetail,
  type SharePreviewDetail,
} from "@/lib/share-preview";
import { periodToThai } from "@/lib/report-format";

/**
 * Public, unauthenticated reads for the link-preview. Lives outside the
 * `"use server"` action module so the edge-runtime OG image route can import it
 * (it can't pull in `node:crypto` via share-access). Only firm branding and the
 * token's own report are read — the token is the secret.
 */

export type SharePreviewSettings = {
  title: string | null;
  description: string | null;
  firmName: string | null;
  brandColor: string | null;
  detail: SharePreviewDetail;
};

export async function loadSharePreviewSettings(): Promise<SharePreviewSettings> {
  try {
    const rows = (await sql`select firm_name, brand_color, share_preview_title, share_preview_description, share_preview_detail from app_settings where id=1`) as {
      firm_name: string | null;
      brand_color: string | null;
      share_preview_title: string | null;
      share_preview_description: string | null;
      share_preview_detail: string | null;
    }[];
    const row = rows[0];
    return {
      title: row?.share_preview_title ?? null,
      description: row?.share_preview_description ?? null,
      firmName: row?.firm_name ?? null,
      brandColor: row?.brand_color ?? null,
      detail: normalizeSharePreviewDetail(row?.share_preview_detail),
    };
  } catch {
    // Columns not migrated yet — brand by firm name/colour only.
    const rows = (await sql`select firm_name, brand_color from app_settings where id=1`) as {
      firm_name: string | null;
      brand_color: string | null;
    }[];
    return {
      title: null,
      description: null,
      firmName: rows[0]?.firm_name ?? null,
      brandColor: rows[0]?.brand_color ?? null,
      detail: DEFAULT_SHARE_PREVIEW_DETAIL,
    };
  }
}

export type SharePreviewFields = {
  periodTh: string;
  label: string | null;
  clientName: string | null;
  total: number;
};

/**
 * Minimal per-link preview fields, looked up by share token (no tax-ID gate).
 * The token is the secret; returns null for an unknown/expired/revoked link.
 */
export async function loadSharePreviewFields(
  tokenKey: string
): Promise<SharePreviewFields | null> {
  try {
    const rows = (await sql`
      select r.period_label, r.label, c.name as client_name,
             (select coalesce(sum(amount), 0)::float8
                from monthly_filings f where f.report_id = r.id) as total
      from monthly_reports r
      join clients c on c.id = r.client_id
      where r.share_token = ${tokenKey}
        and r.share_revoked_at is null
        and (r.share_expires_at is null or r.share_expires_at > now())
      limit 1
    `) as {
      period_label: string;
      label: string | null;
      client_name: string | null;
      total: number;
    }[];
    const row = rows[0];
    if (!row) return null;
    return {
      periodTh: periodToThai(row.period_label),
      label: row.label ?? null,
      clientName: row.client_name ?? null,
      total: Number(row.total ?? 0),
    };
  } catch {
    return null;
  }
}
