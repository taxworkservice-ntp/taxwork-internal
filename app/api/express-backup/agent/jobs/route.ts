import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Pending jobs with the config the agent needs (source path only —
// the agent never receives client credentials or unrelated data).
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const rows = (await sql`select j.id, j.client_id, j.trigger_type, j.created_at,
      cfg.source_path, cfg.retention_days
    from express_backup_jobs j
    join express_backup_configs cfg on cfg.client_id = j.client_id
    where j.status = 'pending' and cfg.enabled = true
    order by j.created_at asc limit 10`) as {
    id: string;
    client_id: string;
    trigger_type: string;
    created_at: unknown;
    source_path: string;
    retention_days: number;
  }[];

  return NextResponse.json({
    jobs: rows.map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      triggerType: r.trigger_type,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      sourcePath: r.source_path,
      retentionDays: Number(r.retention_days),
    })),
  });
}
