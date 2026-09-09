import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent } from "@/lib/express-backup";

// Job is marked success only after the agent confirms the R2 upload completed.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { checksum, backupSizeBytes, sourceSizeBytes, sourceFileCount, storageKey } = body as {
    checksum?: unknown;
    backupSizeBytes?: unknown;
    sourceSizeBytes?: unknown;
    sourceFileCount?: unknown;
    storageKey?: unknown;
  };
  if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/i.test(checksum)) {
    return NextResponse.json({ error: "valid sha256 checksum required" }, { status: 400 });
  }
  const backupSize = Number(backupSizeBytes);
  if (!Number.isFinite(backupSize) || backupSize <= 0) {
    return NextResponse.json({ error: "backupSizeBytes required" }, { status: 400 });
  }

  const rows = (await sql`update express_backup_jobs
    set status='success', completed_at=now(), checksum=${checksum},
        backup_size_bytes=${Math.floor(backupSize)},
        source_size_bytes=${sourceSizeBytes == null ? null : Math.floor(Number(sourceSizeBytes))},
        source_file_count=${sourceFileCount == null ? null : Math.floor(Number(sourceFileCount))},
        storage_key=coalesce(${typeof storageKey === "string" ? storageKey : null}, storage_key)
    where id=${id} and status='running' and agent_id=${auth.agentId}
    returning id`) as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not your running job" }, { status: 403 });

  return NextResponse.json({ ok: true });
}
