import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { R2_BUCKET, signedUrl } from "@/lib/r2";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { storagePath } = await request.json();
  if (!storagePath || storagePath.includes("..")) {
    return NextResponse.json({ error: "storagePath required" }, { status: 400 });
  }

  const url = await signedUrl(
    new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: storagePath })
  );
  await fetch(url, { method: "DELETE" });

  return NextResponse.json({ ok: true });
}
