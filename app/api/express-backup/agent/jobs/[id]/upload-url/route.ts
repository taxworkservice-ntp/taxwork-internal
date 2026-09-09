import { NextResponse, type NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { R2_BUCKET, signedUrl } from "@/lib/r2";
import { authenticateAgent, jobStorageKey } from "@/lib/express-backup";

// Server-minted upload target: the key is derived from job + client + timestamp,
// never accepted from the agent. R2 secrets stay server-side.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const rows = (await sql`select id, client_id, agent_id, status from express_backup_jobs
    where id=${id}`) as { id: string; client_id: string; agent_id: string | null; status: string }[];
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status !== "running" || job.agent_id !== auth.agentId) {
    return NextResponse.json({ error: "not your running job" }, { status: 403 });
  }

  const key = jobStorageKey(String(job.client_id), String(job.id));
  const url = await signedUrl(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: "application/zip" })
  );

  const body = await request.json().catch(() => ({}));
  const fileName = typeof body.fileName === "string" ? body.fileName : key.split("/").pop()!;
  await sql`update express_backup_jobs set storage_key=${key}, file_name=${fileName}
    where id=${id}`;

  return NextResponse.json({ url, storageKey: key, fileName });
}
