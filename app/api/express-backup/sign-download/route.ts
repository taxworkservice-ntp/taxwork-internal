import { NextResponse, type NextRequest } from "next/server";
import { createHash, createHmac } from "crypto";
import { sql } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { BACKUP_R2_PREFIX } from "@/lib/express-backup";

// Express-scoped presigned download: validates the job (must be success)
// and the storage namespace (express-backups/...) instead of trusting a raw path.
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { jobId } = await request.json();
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const rows = (await sql`select storage_key, file_name, status from express_backup_jobs
    where id=${jobId}`) as { storage_key: string | null; file_name: string | null; status: string }[];
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status !== "success" || !job.storage_key) {
    return NextResponse.json({ error: "backup not available" }, { status: 400 });
  }
  if (job.storage_key.includes("..") || !job.storage_key.startsWith(`${BACKUP_R2_PREFIX}/`)) {
    return NextResponse.json({ error: "invalid storage key" }, { status: 400 });
  }

  const url = presignedGet(job.storage_key, 300);
  return NextResponse.json({ url, fileName: job.file_name });
}

function presignedGet(storageKey: string, expires: number): string {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucket = process.env.R2_BUCKET ?? "internal-waxwork";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${storageKey.split("/").map(encodeRfc3986).join("/")}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQueryString = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
    .join("&");
  const canonicalRequest = ["GET", canonicalUri, canonicalQueryString, `host:${host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const hmac = (key: Buffer | string, data: string) =>
    createHmac("sha256", key).update(data).digest();
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

function encodeRfc3986(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
