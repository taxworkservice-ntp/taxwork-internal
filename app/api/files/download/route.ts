import { NextResponse, type NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireUserApi } from "@/lib/session";
import { r2, R2_BUCKET } from "@/lib/r2";
import { asciiFileName } from "@/lib/download";
import { recordFileDownloadByPath } from "@/lib/file-downloads";

export const runtime = "nodejs";

/**
 * Same-origin download proxy. Streams a private R2 object back through the app
 * with an attachment disposition. Used instead of handing the browser a
 * cross-origin presigned URL, which mobile browsers handle inconsistently
 * (popup blocking + raw-byte/mojibake tabs when opened after an await).
 */
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { storagePath?: unknown; fileName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!storagePath || storagePath.includes("..")) {
    return NextResponse.json({ error: "storagePath required" }, { status: 400 });
  }

  let obj;
  try {
    obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: storagePath })
    );
  } catch {
    return NextResponse.json({ error: "object not found" }, { status: 404 });
  }

  const bytes = await obj.Body?.transformToByteArray();
  if (!bytes) {
    return NextResponse.json({ error: "empty object" }, { status: 404 });
  }

  try {
    await recordFileDownloadByPath(storagePath, user.email);
  } catch {
    // Tracking is best-effort and must never block the download.
  }

  const name =
    (typeof body.fileName === "string" && body.fileName.trim()) ||
    storagePath.split("/").pop() ||
    "download";
  const contentType = obj.ContentType ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
