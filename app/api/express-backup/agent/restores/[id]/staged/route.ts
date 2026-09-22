import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Agent verified the download (SHA-256 matches the backup checksum) and
// extracted it to local staging. Waiting on the human confirm gate.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const fileCount =
    typeof body.fileCount === "number" && Number.isInteger(body.fileCount) && body.fileCount >= 0
      ? body.fileCount
      : null;
  if (fileCount === null) return NextResponse.json({ error: "fileCount required" }, { status: 400 });

  const rows = (await sql`update express_backup_restores
    set status='staged', staged_file_count=${fileCount}, updated_at=now()
    where id=${id} and status='downloading' and target_agent_id=${auth.agentId}
    returning id`) as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not your downloading restore" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
