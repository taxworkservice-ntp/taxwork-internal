import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveShareToken, resolveSlip } from "@/lib/actions/reports";
import { r2, R2_BUCKET } from "@/lib/r2";

export const runtime = "nodejs";

function asciiFileName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  return cleaned || "slip";
}

/**
 * Public, tokenized access to a filing's pay-in slip (image or PDF). The R2
 * object stays private; the slip must belong to the tokenized report.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const reportId = await resolveShareToken(token);
  if (!reportId) {
    return NextResponse.json({ error: "expired or invalid link" }, { status: 404 });
  }
  const slip = await resolveSlip(reportId, id);
  if (!slip) {
    return NextResponse.json({ error: "slip not found" }, { status: 404 });
  }

  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: slip.storage_path })
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) {
      return NextResponse.json({ error: "empty slip" }, { status: 404 });
    }
    const name = slip.file_name || "slip";
    const contentType =
      slip.mime_type ??
      (/\.pdf$/i.test(name) ? "application/pdf" : "application/octet-stream");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${asciiFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("share slip fetch failed:", error);
    return NextResponse.json({ error: "slip unavailable" }, { status: 500 });
  }
}
