import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { resolveShareToken } from "@/lib/actions/reports";
import { buildReportModel } from "@/lib/report-model";
import { periodToThai, formatBaht } from "@/lib/report-format";

export const runtime = "nodejs";
export const alt = "รายงานภาษี";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fontData(file: string): ArrayBuffer | null {
  try {
    const buf = fs.readFileSync(
      path.join(process.cwd(), "public", "fonts", file)
    );
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return ab;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const fonts: {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
  }[] = [];
  const regular = fontData("Sarabun-Regular.ttf");
  const bold = fontData("Sarabun-Bold.ttf");
  if (regular) fonts.push({ name: "Sarabun", data: regular, weight: 400, style: "normal" });
  if (bold) fonts.push({ name: "Sarabun", data: bold, weight: 700, style: "normal" });

  let title = "รายงานภาษี";
  let client = "";
  let total: string | null = null;
  let firm = "Taxwork";
  let logo: string | null = null;

  const resolved = await resolveShareToken(token);
  if (resolved) {
    const model = await buildReportModel(resolved.reportId);
    title = `รายงานภาษี ${periodToThai(model.periodLabel)}`;
    client = model.client.name;
    total = `${formatBaht(model.total)} บาท`;
    firm = model.firmName;
    logo = model.logoDataUri;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: "64px",
          fontFamily: fonts.length ? "Sarabun" : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                width={72}
                height={72}
                style={{ objectFit: "contain", borderRadius: 12, marginRight: 20 }}
              />
            ) : null}
            <div style={{ fontSize: 30, fontWeight: 700, color: "#171717" }}>
              {firm}
            </div>
          </div>
          <div style={{ fontSize: 24, color: "#737373" }}>รายงานภาษี</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            marginBottom: "auto",
          }}
        >
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#0a0a0a",
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          {client ? (
            <div style={{ fontSize: 36, color: "#404040", marginTop: 16 }}>
              {client}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            borderTop: "2px solid #e5e5e5",
            paddingTop: 24,
          }}
        >
          <div style={{ fontSize: 28, color: "#737373" }}>ยอดรวม</div>
          {total ? (
            <div style={{ fontSize: 44, fontWeight: 700, color: "#0a0a0a" }}>
              {total}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
