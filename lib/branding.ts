import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { r2, R2_BUCKET } from "@/lib/r2";

/** Firm branding for public pages (intake form, etc.), from app_settings. */

export type FirmBranding = {
  firmName: string;
  brandColor: string | null;
  logoDataUri: string | null;
};

function guessMime(path: string): string {
  const l = path.toLowerCase();
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  if (l.endsWith(".webp")) return "image/webp";
  if (l.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

async function logoDataUri(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: path }));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return null;
    let ct = obj.ContentType ?? "";
    if (!ct || /octet-stream/i.test(ct)) ct = guessMime(path);
    return `data:${ct};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function getFirmBranding(): Promise<FirmBranding> {
  try {
    const rows = (await sql`
      select firm_name, brand_color, company_logo_path from app_settings where id=1
    `) as {
      firm_name: string | null;
      brand_color: string | null;
      company_logo_path: string | null;
    }[];
    const r = rows[0];
    return {
      firmName: r?.firm_name?.trim() || "Taxwork",
      brandColor: r?.brand_color?.trim() || null,
      logoDataUri: await logoDataUri(r?.company_logo_path ?? null),
    };
  } catch {
    return { firmName: "Taxwork", brandColor: null, logoDataUri: null };
  }
}
