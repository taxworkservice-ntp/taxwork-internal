import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveShareToken, latestReportFile } from "@/lib/actions/reports";
import { R2_BUCKET, signedUrl } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Public, tokenized download of the latest stored report PDF. The R2 object
 * stays private; we hand back a short-lived signed URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const reportId = await resolveShareToken(token);
  if (!reportId) {
    return NextResponse.json({ error: "expired or invalid link" }, { status: 404 });
  }
  const file = await latestReportFile(reportId);
  if (!file) {
    return NextResponse.json({ error: "no report file" }, { status: 404 });
  }
  const url = await signedUrl(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.storage_path })
  );
  return NextResponse.redirect(url, 302);
}
