import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { loadSharePreviewSettings } from "@/lib/share-preview-data";
import { contrastText, normalizeHex } from "@/lib/client-avatar";

// Edge runtime keeps the image generation cheap. Static-safe text only
// (no stacked Thai marks that Satori mis-renders).
export const runtime = "edge";
export const alt = "ลงทะเบียนใช้บริการ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FALLBACK_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://internal.taxworkaccount.com";

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
    const type = res.headers.get("content-type") ?? "";
    if (!/font|ttf|octet-stream|binary/i.test(type)) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const [settings, origin] = await Promise.all([loadSharePreviewSettings(), resolveOrigin()]);

  const firm = settings.firmName?.trim() || "Taxwork";
  const accent = normalizeHex(settings.brandColor) ?? "#111827";
  const onAccent = contrastText(accent);
  const font = await loadFont(origin);
  if (!font) {
    throw new Error("OG image font unavailable");
  }

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
          <div style={{ fontSize: "84px", fontWeight: 700, color: "#111827", lineHeight: 1.15 }}>
            ลงทะเบียนใช้บริการ
          </div>
          <div style={{ marginTop: "16px", fontSize: "34px", color: "#6b7280" }}>
            ใช้เวลาประมาณ 3 นาที
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
      fonts: [{ name: "Sarabun", data: font, weight: 700, style: "normal" }],
    }
  );
}
