import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Temporary diagnostic webhook: records the sender user ID of any message sent
 * to the OA so staff can discover the correct ADMIN_LINE_USER_IDS value.
 * Signature is intentionally not verified (we hold no channel secret here) —
 * it only stores sender IDs, never acts on them. Remove once IDs are known.
 */
export async function POST(request: Request) {
  let body: { events?: { source?: { userId?: string }; timestamp?: number }[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    for (const e of body.events ?? []) {
      const uid = e.source?.userId;
      if (!uid) continue;
      await sql`insert into line_contacts (user_id, last_seen_at)
        values (${uid}, now())
        on conflict (user_id) do update set last_seen_at = now()`;
    }
  } catch (error) {
    console.error("line webhook store failed:", error);
  }
  return NextResponse.json({ ok: true });
}
