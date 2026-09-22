import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Atomic fetch claim: approved -> downloading. Exactly one worker wins;
// place phase needs no claim (target-scoped rows, idempotent .bak + copy).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const rows = (await sql`update express_backup_restores
    set status='downloading', updated_at=now()
    where id=${id} and status='approved' and target_agent_id=${auth.agentId}
    returning id, job_id, target_path`) as {
    id: string;
    job_id: string;
    target_path: string;
  }[];
  const restore = rows[0];
  if (!restore)
    return NextResponse.json({ error: "restore not available" }, { status: 409 });

  const jobs = (await sql`select checksum, backup_size_bytes, file_name
    from express_backup_jobs where id=${String(restore.job_id)}`) as {
    checksum: string | null;
    backup_size_bytes: unknown;
    file_name: string | null;
  }[];
  const job = jobs[0];

  return NextResponse.json({
    id: String(restore.id),
    jobId: String(restore.job_id),
    targetPath: String(restore.target_path),
    expectedChecksum: job?.checksum == null ? null : String(job.checksum),
    backupSizeBytes: job?.backup_size_bytes == null ? null : Number(job.backup_size_bytes),
    fileName: job?.file_name == null ? null : String(job.file_name),
  });
}
