import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireUserApi } from "@/lib/session";

// Manual backup trigger for browser users (agent picks the pending job up).
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { clientId } = await request.json();
  if (!clientId || typeof clientId !== "string") {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const cfg = (await sql`select enabled from express_backup_configs
    where client_id=${clientId}`) as { enabled: boolean }[];
  if (!cfg[0]) return NextResponse.json({ error: "not configured" }, { status: 400 });
  if (!cfg[0].enabled) return NextResponse.json({ error: "disabled" }, { status: 400 });

  const busy = (await sql`select id from express_backup_jobs
    where client_id=${clientId} and status in ('pending','running') limit 1`) as { id: string }[];
  if (busy[0]) return NextResponse.json({ error: "job already pending" }, { status: 409 });

  const rows = (await sql`insert into express_backup_jobs (client_id, status, trigger_type)
    values (${clientId}, 'pending', 'manual') returning id`) as { id: string }[];
  return NextResponse.json({ id: String(rows[0].id) });
}
