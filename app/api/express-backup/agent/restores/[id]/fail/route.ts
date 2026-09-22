import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Best-effort failure report for any unfinished restore owned by this agent.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const errorCode = typeof body.errorCode === "string" ? body.errorCode : "UNKNOWN_ERROR";
  const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage : "";

  await sql`update express_backup_restores
    set status='failed', error_code=${errorCode},
      error_message=${errorMessage.slice(0, 2000)}, updated_at=now()
    where id=${id} and target_agent_id=${auth.agentId}
      and status in ('approved','downloading','staged','confirmed')`;

  return NextResponse.json({ ok: true });
}
