import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Restore work targeted at this agent: approved (fetch+stage now) and
// confirmed (human verified the staged copy — .bak + place now).
// The agent never receives R2 keys; downloads go through download-url.
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const rows = (await sql`select r.id, r.job_id, r.target_path, r.status,
      j.checksum as expected_checksum, j.backup_size_bytes, j.file_name
    from express_backup_restores r
    join express_backup_jobs j on j.id = r.job_id
    where r.target_agent_id = ${auth.agentId}
      and r.status in ('approved', 'confirmed')
    order by r.created_at asc limit 10`) as {
    id: string;
    job_id: string;
    target_path: string;
    status: string;
    expected_checksum: string | null;
    backup_size_bytes: unknown;
    file_name: string | null;
  }[];

  return NextResponse.json({
    restores: rows.map((r) => ({
      id: String(r.id),
      jobId: String(r.job_id),
      targetPath: String(r.target_path),
      status: String(r.status),
      expectedChecksum:
        r.expected_checksum == null ? null : String(r.expected_checksum),
      backupSizeBytes: r.backup_size_bytes == null ? null : Number(r.backup_size_bytes),
      fileName: r.file_name == null ? null : String(r.file_name),
    })),
  });
}
