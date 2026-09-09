import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { newAgentSecret, sha256Hex } from "@/lib/express-backup";

// One-time exchange: registration token (shown once to the owner) -> long-lived credential.
// The raw secret is returned exactly once and only its hash is stored.
export async function POST(request: NextRequest) {
  const { agentId, registrationToken, version } = await request.json();
  if (!agentId || !registrationToken) {
    return NextResponse.json({ error: "agentId and registrationToken required" }, { status: 400 });
  }

  const rows = (await sql`select id, registration_token_hash, status, revoked_at
    from express_backup_agents where id=${agentId}`) as {
    id: string;
    registration_token_hash: string | null;
    status: string;
    revoked_at: unknown;
  }[];
  const agent = rows[0];
  if (!agent || !agent.registration_token_hash) {
    return NextResponse.json({ error: "invalid registration" }, { status: 401 });
  }
  if (agent.status === "revoked" || agent.revoked_at) {
    return NextResponse.json({ error: "agent revoked" }, { status: 403 });
  }
  if (sha256Hex(String(registrationToken).trim()) !== agent.registration_token_hash) {
    return NextResponse.json({ error: "invalid registration" }, { status: 401 });
  }

  const secret = newAgentSecret();
  await sql`update express_backup_agents
    set token_hash=${sha256Hex(secret)}, registration_token_hash=null,
        status='online', last_seen_at=now(), version=${version ?? null}, updated_at=now()
    where id=${agentId}`;

  return NextResponse.json({ credential: `${agentId}.${secret}` });
}
