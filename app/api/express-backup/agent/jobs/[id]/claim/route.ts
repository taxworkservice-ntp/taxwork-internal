import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Atomic claim: exactly one agent wins. Losers get 409.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const rows = (await sql`update express_backup_jobs
    set status='running', agent_id=${auth.agentId}, started_at=now()
    where id=${id} and status='pending'
    returning id, client_id`) as { id: string; client_id: string }[];
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "job not available" }, { status: 409 });

  const cfg = (await sql`select source_path, retention_days from express_backup_configs
    where client_id=${job.client_id}`) as { source_path: string; retention_days: number }[];

  return NextResponse.json({
    id: String(job.id),
    clientId: String(job.client_id),
    sourcePath: cfg[0]?.source_path,
    retentionDays: cfg[0] ? Number(cfg[0].retention_days) : 30,
  });
}
