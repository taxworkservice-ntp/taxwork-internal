import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveShareToken, latestReportFile } from "@/lib/actions/reports";
import { shareTokenFromSegment } from "@/lib/share-link";
import {
  shareAccessCookieName,
  verifyShareAccess,
} from "@/lib/share-access";
import { r2, R2_BUCKET } from "@/lib/r2";
import { asciiFileName } from "@/lib/download";

export const runtime = "nodejs";

/**
 * Public, tokenized download of the latest stored report PDF. The R2 object
 * stays private; we stream it back with an attachment disposition so the
 * browser downloads it instead of opening it inline.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Require the tax-ID gate before handing over the PDF.
  const key = shareTokenFromSegment(token);
  const cookie = (await cookies()).get(shareAccessCookieName(key))?.value;
  if (!verifyShareAccess(cookie, key)) {
    return NextResponse.redirect(
      new URL(`/r/${encodeURIComponent(token)}`, request.url),
      303
    );
  }

  const resolved = await resolveShareToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "expired or invalid link" }, { status: 404 });
  }
  const file = await latestReportFile(resolved.reportId);
  if (!file) {
    return NextResponse.json({ error: "no report file" }, { status: 404 });
  }

  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.storage_path })
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) {
      return NextResponse.json({ error: "empty report file" }, { status: 404 });
    }
    const name = file.file_name || "report.pdf";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
        // force download; include a UTF-8 filename for Thai names
        "Content-Disposition": `attachment; filename="${asciiFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("share pdf download failed:", error);
    return NextResponse.json({ error: "download failed" }, { status: 500 });
  }
}
