import { NextResponse, type NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { R2_BUCKET, signedUrl } from "@/lib/r2";
import { authenticateAgent, BACKUP_R2_PREFIX } from "@/lib/express-backup";

// Server-minted download target: key comes from the source backup job,
// never from the agent. Short-lived GET; R2 secrets stay server-side.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const rows = (await sql`select r.id, j.storage_key from express_backup_restores r
    join express_backup_jobs j on j.id = r.job_id
    where r.id=${id} and r.target_agent_id=${auth.agentId}
      and r.status in ('downloading','confirmed')`) as {
    id: string;
    storage_key: string | null;
  }[];
  const restore = rows[0];
  if (!restore) return NextResponse.json({ error: "not your active restore" }, { status: 403 });

  const key = restore.storage_key ? String(restore.storage_key) : "";
  if (!key || key.includes("..") || !key.startsWith(`${BACKUP_R2_PREFIX}/`)) {
    return NextResponse.json({ error: "bad storage key" }, { status: 400 });
  }

  const url = await signedUrl(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return NextResponse.json({ url });
}
