import { sql } from "@/lib/db";

/**
 * Public, unauthenticated read of the link-preview branding. Lives outside the
 * `"use server"` action module so it can be imported by the edge-runtime OG
 * image route (which can't pull in `node:crypto` via share-access). It only
 * ever touches `app_settings` — never report data — because it is served to
 * social crawlers.
 */
export type SharePreviewSettings = {
  title: string | null;
  description: string | null;
  firmName: string | null;
  brandColor: string | null;
};

export async function loadSharePreviewSettings(): Promise<SharePreviewSettings> {
  try {
    const rows = (await sql`select firm_name, brand_color, share_preview_title, share_preview_description from app_settings where id=1`) as {
      firm_name: string | null;
      brand_color: string | null;
      share_preview_title: string | null;
      share_preview_description: string | null;
    }[];
    const row = rows[0];
    return {
      title: row?.share_preview_title ?? null,
      description: row?.share_preview_description ?? null,
      firmName: row?.firm_name ?? null,
      brandColor: row?.brand_color ?? null,
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
    };
  }
}
