import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveFilingDocument, resolveShareToken } from "@/lib/actions/reports";
import { shareTokenFromSegment } from "@/lib/share-link";
import { shareAccessCookieName, verifyShareAccess } from "@/lib/share-access";
import { r2, R2_BUCKET } from "@/lib/r2";
import { asciiFileName } from "@/lib/download";

export const runtime = "nodejs";

/**
 * Public, tokenized access to a filing's share-only document (image or PDF).
 * The R2 object stays private; the document must belong to the tokenized report
 * and the caller must have passed the tax-ID gate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;

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
  const document = await resolveFilingDocument(resolved.reportId, id);
  if (!document) {
    return NextResponse.json({ error: "document not found" }, { status: 404 });
  }

  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: document.storage_path })
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) {
      return NextResponse.json({ error: "empty document" }, { status: 404 });
    }
    const name = document.file_name || "document";
    const contentType =
      document.mime_type ??
      (/\.pdf$/i.test(name)
        ? "application/pdf"
        : /\.(png|jpe?g)$/i.test(name)
          ? "image/jpeg"
          : "application/octet-stream");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${asciiFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("share document fetch failed:", error);
    return NextResponse.json({ error: "document unavailable" }, { status: 500 });
  }
}
