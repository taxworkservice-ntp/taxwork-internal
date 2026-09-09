import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

const KNOWN_CODES = new Set([
  "SOURCE_NOT_FOUND",
  "ACCESS_DENIED",
  "DISK_FULL",
  "ARCHIVE_FAILED",
  "NETWORK_ERROR",
  "UPLOAD_FAILED",
  "CHECKSUM_ERROR",
  "JOB_EXPIRED",
  "AUTH_FAILED",
  "UNKNOWN_ERROR",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const rawCode = typeof body.errorCode === "string" ? body.errorCode : "UNKNOWN_ERROR";
  const errorCode = KNOWN_CODES.has(rawCode) ? rawCode : "UNKNOWN_ERROR";
  const errorMessage =
    typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 2000) : null;

  const rows = (await sql`update express_backup_jobs
    set status='failed', completed_at=now(), error_code=${errorCode}, error_message=${errorMessage}
    where id=${id} and status in ('pending','running')
      and (agent_id is null or agent_id=${auth.agentId})
    returning id`) as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "job not available" }, { status: 409 });

  // Stamp ownership so completion/failure races are attributable.
  await sql`update express_backup_jobs set agent_id=${auth.agentId} where id=${id} and agent_id is null`;

  return NextResponse.json({ ok: true });
}
