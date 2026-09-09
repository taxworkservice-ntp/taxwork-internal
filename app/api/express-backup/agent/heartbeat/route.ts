import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const version = typeof body.version === "string" ? body.version : null;

  await sql`update express_backup_agents
    set last_seen_at=now(), status='online', updated_at=now(),
        version=coalesce(${version}, version)
    where id=${auth.agentId}`;

  return NextResponse.json({ ok: true });
}
