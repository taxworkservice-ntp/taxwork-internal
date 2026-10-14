import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { buildSharePreview } from "@/lib/share-preview";
import { loadSharePreviewSettings } from "@/lib/share-preview-data";
import { contrastText, normalizeHex } from "@/lib/client-avatar";

// Edge runtime keeps the image generation cheap and off the Chromium path.
// This route must not import the reports action module (it pulls node:crypto).
export const runtime = "edge";
export const alt = "รายงานภาษี";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FALLBACK_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://internal.taxworkaccount.com";

/** The app's own origin, so the Sarabun font can be fetched from /public. */
async function resolveOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  } catch {
    // headers() unavailable — fall back to the configured origin.
  }
  return FALLBACK_ORIGIN;
}

async function loadFont(origin: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${origin}/fonts/Sarabun-Bold.ttf`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const [settings, origin] = await Promise.all([
    loadSharePreviewSettings(),
    resolveOrigin(),
  ]);
  const preview = buildSharePreview(settings);
  const firm = settings.firmName?.trim() || "Taxwork";
  const accent = normalizeHex(settings.brandColor) ?? "#111827";
  const onAccent = contrastText(accent);
  const font = await loadFont(origin);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#ffffff",
          padding: "72px",
          fontFamily: "Sarabun",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "72px",
              height: "72px",
              borderRadius: "18px",
              backgroundColor: accent,
              color: onAccent,
              fontSize: "40px",
              fontWeight: 700,
            }}
          >
            {firm.slice(0, 1)}
          </div>
          <div style={{ fontSize: "36px", fontWeight: 700, color: "#111827" }}>{firm}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "88px", fontWeight: 700, color: "#111827" }}>
            {preview.title}
          </div>
          <div style={{ marginTop: "16px", fontSize: "34px", color: "#6b7280" }}>
            เอกสารรายงานภาษีสำหรับลูกค้า
          </div>
          <div
            style={{
              marginTop: "44px",
              display: "flex",
              height: "12px",
              width: "260px",
              borderRadius: "999px",
              backgroundColor: accent,
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Sarabun", data: font, weight: 700, style: "normal" }]
        : undefined,
    }
  );
}
