import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Agent made the .bak rollback copy and placed the verified files.
// Only reachable after the human confirm gate (status='confirmed').
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const bakPath = typeof body.bakPath === "string" ? body.bakPath : "";
  if (!bakPath) return NextResponse.json({ error: "bakPath required" }, { status: 400 });

  const rows = (await sql`update express_backup_restores
    set status='completed', bak_path=${bakPath}, updated_at=now()
    where id=${id} and status='confirmed' and target_agent_id=${auth.agentId}
    returning id`) as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not your confirmed restore" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
