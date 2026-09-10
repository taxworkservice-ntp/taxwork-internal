"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { num } from "./db-helpers";
import {
  AGENT_ONLINE_MS,
  computeStatus,
  isAgentOnline,
  newAgentSecret,
  newRegistrationToken,
  sha256Hex,
  type ExpressBackupAgent,
  type ExpressBackupConfig,
  type ExpressBackupJob,
  type ExpressBackupStatus,
} from "@/lib/express-backup";

function str(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toConfig(r: Record<string, unknown>): ExpressBackupConfig {
  return {
    id: String(r.id),
    client_id: String(r.client_id),
    source_path: String(r.source_path ?? ""),
    enabled: Boolean(r.enabled),
    schedule_type: String(r.schedule_type ?? "daily"),
    schedule_time: String(r.schedule_time ?? "23:00:00"),
    timezone: String(r.timezone ?? "Asia/Bangkok"),
    retention_days: num(r.retention_days),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

function toJob(r: Record<string, unknown>): ExpressBackupJob {
  return {
    id: String(r.id),
    client_id: String(r.client_id),
    agent_id: r.agent_id == null ? null : String(r.agent_id),
    target_agent_id: r.target_agent_id == null ? null : String(r.target_agent_id),
    source_path_used: r.source_path_used == null ? null : String(r.source_path_used),
    status: String(r.status),
    trigger_type: String(r.trigger_type ?? "manual"),
    started_at: optStr(r.started_at),
    completed_at: optStr(r.completed_at),
    source_file_count: r.source_file_count == null ? null : num(r.source_file_count),
    source_size_bytes: r.source_size_bytes == null ? null : num(r.source_size_bytes),
    backup_size_bytes: r.backup_size_bytes == null ? null : num(r.backup_size_bytes),
    file_name: r.file_name == null ? null : String(r.file_name),
    storage_key: r.storage_key == null ? null : String(r.storage_key),
    checksum: r.checksum == null ? null : String(r.checksum),
    error_code: r.error_code == null ? null : String(r.error_code),
    error_message: r.error_message == null ? null : String(r.error_message),
    created_at: str(r.created_at),
    agent_name: r.agent_name == null ? null : String(r.agent_name),
    target_agent_name:
      r.target_agent_name == null ? null : String(r.target_agent_name),
  };
}

function toAgent(r: Record<string, unknown>, clientName: string | null): ExpressBackupAgent {
  return {
    id: String(r.id),
    agent_name: String(r.agent_name ?? ""),
    machine_name: String(r.machine_name ?? ""),
    client_id: r.client_id == null ? null : String(r.client_id),
    client_name: clientName,
    status: liveStatus(String(r.status), optStr(r.last_seen_at), optStr(r.revoked_at)),
    version: r.version == null ? null : String(r.version),
    last_seen_at: optStr(r.last_seen_at),
    revoked_at: optStr(r.revoked_at),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

/** Derive display status: revoked wins, otherwise online/offline from heartbeat. */
function liveStatus(stored: string, lastSeen: string | null, revokedAt: string | null): string {
  if (stored === "revoked" || revokedAt) return "revoked";
  return isAgentOnline(lastSeen) ? "online" : "offline";
}

export type OverviewRow = {
  client_id: string;
  client_name: string;
  tax_id: string | null;
  has_config: boolean;
  enabled: boolean;
  source_path: string | null;
  schedule_time: string | null;
  retention_days: number | null;
  latest_job_status: string | null;
  latest_job_created_at: string | null;
  latest_success_at: string | null;
  latest_success_size: number | null;
  status: ExpressBackupStatus;
  machine_count: number;
};

/**
 * One row per active client with its latest backup state.
 * Single query with lateral joins — no N+1, no R2 scan.
 */
export async function getExpressBackupOverview(): Promise<{
  rows: OverviewRow[];
  agentsOnline: number;
  agentsTotal: number;
}> {
  await requireUser();
  const rows = (await sql`select c.id as client_id, c.name as client_name, c.tax_id,
      cfg.enabled, cfg.source_path, cfg.schedule_time, cfg.retention_days,
      lj.status as latest_job_status, lj.created_at as latest_job_created_at,
      ls.completed_at as latest_success_at, ls.backup_size_bytes as latest_success_size,
      m.n as machine_count
    from clients c
    left join express_backup_configs cfg on cfg.client_id = c.id
    left join lateral (
      select status, created_at from express_backup_jobs
      where client_id = c.id order by created_at desc limit 1
    ) lj on true
    left join lateral (
      select completed_at, backup_size_bytes from express_backup_jobs
      where client_id = c.id and status = 'success' order by completed_at desc limit 1
    ) ls on true
    left join lateral (
      select count(*)::text as n from express_backup_agent_paths ap
      join express_backup_agents a on a.id = ap.agent_id
      where ap.client_id = c.id and a.status <> 'revoked' and a.revoked_at is null
    ) m on true
    where c.status = 'active'
    order by c.name`) as Record<string, unknown>[];

  const agents = (await sql`select status, last_seen_at, revoked_at
    from express_backup_agents`) as { status: string; last_seen_at: unknown; revoked_at: unknown }[];
  const agentsTotal = agents.length;
  const cutoff = Date.now() - AGENT_ONLINE_MS;
  const agentsOnline = agents.filter(
    (a) =>
      a.status !== "revoked" &&
      !a.revoked_at &&
      a.last_seen_at instanceof Date &&
      a.last_seen_at.getTime() > cutoff
  ).length;

  return {
    rows: rows.map((r) => {
      const hasConfig = r.enabled !== null && r.enabled !== undefined;
      const enabled = Boolean(r.enabled);
      const latestJobStatus = r.latest_job_status == null ? null : String(r.latest_job_status);
      const latestSuccessAt =
        r.latest_success_at == null
          ? null
          : r.latest_success_at instanceof Date
            ? r.latest_success_at.toISOString()
            : String(r.latest_success_at);
      return {
        client_id: String(r.client_id),
        client_name: String(r.client_name),
        tax_id: r.tax_id == null ? null : String(r.tax_id),
        has_config: hasConfig,
        enabled,
        source_path: r.source_path == null ? null : String(r.source_path),
        schedule_time: r.schedule_time == null ? null : String(r.schedule_time),
        retention_days: r.retention_days == null ? null : num(r.retention_days),
        latest_job_status: latestJobStatus,
        latest_job_created_at:
          r.latest_job_created_at == null
            ? null
            : r.latest_job_created_at instanceof Date
              ? r.latest_job_created_at.toISOString()
              : String(r.latest_job_created_at),
        latest_success_at: latestSuccessAt,
        latest_success_size: r.latest_success_size == null ? null : num(r.latest_success_size),
        status: computeStatus({ enabled, hasConfig, latestJobStatus, latestSuccessAt }),
        machine_count: num(r.machine_count ?? 0),
      };
    }),
    agentsOnline,
    agentsTotal,
  };
}

export type BackupDetail = {
  client: { id: string; name: string; tax_id: string | null };
  config: ExpressBackupConfig | null;
  status: ExpressBackupStatus;
  latest_success: ExpressBackupJob | null;
  jobs: ExpressBackupJob[];
  agents: ExpressBackupAgent[];
  agent_paths: AgentPath[];
};

export async function getExpressBackupDetail(clientId: string): Promise<BackupDetail> {
  await requireUser();
  const clients = (await sql`select id, name, tax_id from clients where id=${clientId}`) as {
    id: string;
    name: string;
    tax_id: string | null;
  }[];
  const client = clients[0];
  if (!client) throw new Error("ไม่พบลูกค้า");

  const cfgRows = (await sql`select * from express_backup_configs
    where client_id=${clientId}`) as Record<string, unknown>[];
  const config = cfgRows[0] ? toConfig(cfgRows[0]) : null;

  const jobRows = (await sql`select j.*, a.agent_name, t.agent_name as target_agent_name
    from express_backup_jobs j
    left join express_backup_agents a on a.id = j.agent_id
    left join express_backup_agents t on t.id = j.target_agent_id
    where j.client_id=${clientId} order by j.created_at desc limit 50`) as Record<string, unknown>[];
  const jobs = jobRows.map(toJob);
  const latest = jobRows[0] ? toJob(jobRows[0]) : null;
  const latestSuccess = jobs.find((j) => j.status === "success") ?? null;

  const agentRows = (await sql`select a.*, c.name as client_name from express_backup_agents a
    left join clients c on c.id = a.client_id
    order by a.last_seen_at desc nulls last`) as Record<string, unknown>[];
  const agents = agentRows.map((r) =>
    toAgent(r, r.client_name == null ? null : String(r.client_name))
  );

  const pathRows = (await sql`select ap.*, a.agent_name, a.machine_name
    from express_backup_agent_paths ap
    join express_backup_agents a on a.id = ap.agent_id
    where ap.client_id=${clientId} and a.status <> 'revoked' and a.revoked_at is null
    order by a.agent_name`) as Record<string, unknown>[];
  const agent_paths: AgentPath[] = pathRows.map((r) => ({
    id: String(r.id),
    agent_id: String(r.agent_id),
    agent_name: String(r.agent_name ?? ""),
    machine_name: String(r.machine_name ?? ""),
    client_id: String(r.client_id),
    source_path: String(r.source_path ?? ""),
    is_primary: Boolean(r.is_primary),
  }));

  return {
    client: { id: String(client.id), name: client.name, tax_id: client.tax_id },
    config,
    status: computeStatus({
      enabled: config?.enabled ?? false,
      hasConfig: config !== null,
      latestJobStatus: latest?.status ?? null,
      latestSuccessAt: latestSuccess?.completed_at ?? latestSuccess?.created_at ?? null,
    }),
    latest_success: latestSuccess,
    jobs,
    agents,
    agent_paths,
  };
}

export type ConfigForm = {
  source_path: string;
  schedule_time: string; // "HH:MM"
  retention_days: number;
  enabled: boolean;
};

function assertWindowsPath(sourcePath: string): void {
  if (!sourcePath) throw new Error("กรุณาระบุแหล่งข้อมูล (source path)");
  if (!/^[A-Za-z]:[\\/]/.test(sourcePath) && !sourcePath.startsWith("\\\\")) {
    throw new Error("source path ต้องเป็นพาธ Windows เช่น D:\\ExpressData\\ABC");
  }
}

export type AgentPath = {
  id: string;
  agent_id: string;
  agent_name: string;
  machine_name: string;
  client_id: string;
  source_path: string;
  is_primary: boolean;
};

/** Per-machine folders for one client (empty = no machine holds it here yet). */
export async function getAgentPaths(clientId: string): Promise<AgentPath[]> {
  await requireUser();
  const rows = (await sql`select ap.*, a.agent_name, a.machine_name
    from express_backup_agent_paths ap
    join express_backup_agents a on a.id = ap.agent_id
    where ap.client_id=${clientId} and a.status <> 'revoked' and a.revoked_at is null
    order by a.agent_name`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    agent_id: String(r.agent_id),
    agent_name: String(r.agent_name ?? ""),
    machine_name: String(r.machine_name ?? ""),
    client_id: String(r.client_id),
    source_path: String(r.source_path ?? ""),
    is_primary: Boolean(r.is_primary),
  }));
}

/** Set (or replace) the folder one machine uses for one client. */
export async function saveAgentPath(
  agentId: string,
  clientId: string,
  sourcePath: string
): Promise<AgentPath> {
  await requireUser();
  const path = sourcePath.trim();
  assertWindowsPath(path);
  const agents = (await sql`select id from express_backup_agents
    where id=${agentId} and status <> 'revoked' and revoked_at is null`) as { id: string }[];
  if (!agents[0]) throw new Error("ไม่พบเครื่อง");
  const clients = (await sql`select id from clients where id=${clientId}`) as { id: string }[];
  if (!clients[0]) throw new Error("ไม่พบลูกค้า");
  const rows = (await sql`insert into express_backup_agent_paths
      (agent_id, client_id, source_path, updated_at)
    values (${agentId}, ${clientId}, ${path}, now())
    on conflict (agent_id, client_id) do update set
      source_path = excluded.source_path, updated_at = now()
    returning *`) as Record<string, unknown>[];
  const names = (await sql`select agent_name, machine_name from express_backup_agents
    where id=${agentId}`) as { agent_name: string; machine_name: string }[];
  return {
    id: String(rows[0].id),
    agent_id: agentId,
    agent_name: names[0]?.agent_name ?? "",
    machine_name: names[0]?.machine_name ?? "",
    client_id: clientId,
    source_path: path,
    is_primary: Boolean(rows[0].is_primary),
  };
}

/** Remove one machine's folder for a client (falls back to client default). */
export async function deleteAgentPath(agentId: string, clientId: string): Promise<void> {
  await requireUser();
  await sql`delete from express_backup_agent_paths
    where agent_id=${agentId} and client_id=${clientId}`;
}

/** Mark which machine holds the source of truth (display + restore guidance). */
export async function setPrimaryAgentPath(
  agentId: string | null,
  clientId: string
): Promise<void> {
  await requireUser();
  await sql`update express_backup_agent_paths set is_primary = false, updated_at = now()
    where client_id=${clientId}`;
  if (agentId) {
    const rows = (await sql`update express_backup_agent_paths
      set is_primary = true, updated_at = now()
      where agent_id=${agentId} and client_id=${clientId} returning id`) as { id: string }[];
    if (!rows[0]) throw new Error("กรุณาบันทึกพาธของเครื่องนี้ก่อนตั้งเป็นเครื่องหลัก");
  }
}

export async function saveExpressBackupConfig(
  clientId: string,
  form: ConfigForm
): Promise<ExpressBackupConfig> {
  await requireUser();
  const sourcePath = form.source_path.trim();
  assertWindowsPath(sourcePath);
  if (!Number.isInteger(form.retention_days) || form.retention_days <= 0) {
    throw new Error("จำนวนวันเก็บข้อมูลต้องมากกว่า 0");
  }
  const time = /^(\d{2}):(\d{2})(:\d{2})?$/.test(form.schedule_time)
    ? form.schedule_time.length === 5
      ? `${form.schedule_time}:00`
      : form.schedule_time
    : null;
  if (!time) throw new Error("รูปแบบเวลาไม่ถูกต้อง");

  const clients = (await sql`select id from clients where id=${clientId}`) as { id: string }[];
  if (!clients[0]) throw new Error("ไม่พบลูกค้า");

  const rows = (await sql`insert into express_backup_configs
      (client_id, source_path, enabled, schedule_type, schedule_time, timezone, retention_days, updated_at)
    values (${clientId}, ${sourcePath}, ${form.enabled}, 'daily', ${time}, 'Asia/Bangkok', ${form.retention_days}, now())
    on conflict (client_id) do update set
      source_path = excluded.source_path,
      enabled = excluded.enabled,
      schedule_time = excluded.schedule_time,
      retention_days = excluded.retention_days,
      updated_at = now()
    returning *`) as Record<string, unknown>[];
  return toConfig(rows[0]);
}

/** Guard: client must have an enabled config and no pending/running job. */
async function assertCreatable(clientId: string): Promise<void> {
  const cfg = (await sql`select enabled from express_backup_configs
    where client_id=${clientId}`) as { enabled: boolean }[];
  if (!cfg[0]) throw new Error("ยังไม่ได้ตั้งค่า Express Backup ของลูกค้านี้");
  if (!cfg[0].enabled) throw new Error("ปิดการสำรองข้อมูลของลูกค้านี้อยู่");
  const busy = (await sql`select id from express_backup_jobs
    where client_id=${clientId} and status in ('pending','running') limit 1`) as { id: string }[];
  if (busy[0]) throw new Error("มีงานสำรองข้อมูลที่รออยู่แล้ว");
}

/**
 * Create one pending job per machine holding this client ("back up both").
 * Machines with an override row each get a targeted job; when no machine
 * has a row yet, a single untargeted job preserves legacy behavior.
 */
export async function createManualBackupJob(clientId: string): Promise<{ ids: string[] }> {
  const user = await requireUser();
  await assertCreatable(clientId);
  void user;
  const machines = (await sql`select ap.agent_id from express_backup_agent_paths ap
    join express_backup_agents a on a.id = ap.agent_id
    where ap.client_id=${clientId} and a.status <> 'revoked' and a.revoked_at is null`) as {
    agent_id: string;
  }[];
  let rows: { id: string }[];
  if (machines.length === 0) {
    rows = (await sql`insert into express_backup_jobs (client_id, status, trigger_type)
      values (${clientId}, 'pending', 'manual') returning id`) as { id: string }[];
  } else {
    rows = [];
    for (const m of machines) {
      const r = (await sql`insert into express_backup_jobs
          (client_id, target_agent_id, status, trigger_type)
        values (${clientId}, ${String(m.agent_id)}, 'pending', 'manual') returning id`) as {
        id: string;
      }[];
      rows.push(r[0]);
    }
  }
  return { ids: rows.map((r) => String(r.id)) };
}

export async function createBackupAllJobs(): Promise<{ created: number; skipped: number }> {
  await requireUser();
  const cfgs = (await sql`select cfg.client_id from express_backup_configs cfg
    join clients c on c.id = cfg.client_id
    where cfg.enabled = true and c.status = 'active'`) as { client_id: string }[];
  let created = 0;
  let skipped = 0;
  for (const c of cfgs) {
    const busy = (await sql`select id from express_backup_jobs
      where client_id=${c.client_id} and status in ('pending','running') limit 1`) as {
      id: string;
    }[];
    if (busy[0]) {
      skipped++;
      continue;
    }
    const machines = (await sql`select ap.agent_id from express_backup_agent_paths ap
      join express_backup_agents a on a.id = ap.agent_id
      where ap.client_id=${c.client_id} and a.status <> 'revoked' and a.revoked_at is null`) as {
      agent_id: string;
    }[];
    if (machines.length === 0) {
      await sql`insert into express_backup_jobs (client_id, status, trigger_type)
        values (${c.client_id}, 'pending', 'manual')`;
      created++;
    } else {
      for (const m of machines) {
        await sql`insert into express_backup_jobs (client_id, target_agent_id, status, trigger_type)
          values (${c.client_id}, ${String(m.agent_id)}, 'pending', 'manual')`;
        created++;
      }
    }
  }
  return { created, skipped };
}

export async function cancelBackupJob(jobId: string): Promise<void> {
  await requireUser();
  await sql`update express_backup_jobs set status='cancelled', completed_at=now()
    where id=${jobId} and status in ('pending','running')`;
}

/** Delete a finished job: removes the R2 object (if any) then the DB row. */
export async function deleteBackupJob(jobId: string): Promise<void> {
  await requireUser();
  const rows = (await sql`select id, status, storage_key from express_backup_jobs
    where id=${jobId}`) as { id: string; status: string; storage_key: string | null }[];
  const job = rows[0];
  if (!job) throw new Error("ไม่พบงานสำรองข้อมูล");
  if (job.status === "pending" || job.status === "running")
    throw new Error("งานกำลังดำเนินการอยู่ ให้ยกเลิกก่อนลบ");
  const key = job.storage_key ? String(job.storage_key) : null;
  if (key) {
    if (key.includes("..") || !key.startsWith("express-backups/"))
      throw new Error("คีย์ไฟล์ไม่ถูกต้อง");
    const { r2, R2_BUCKET } = await import("@/lib/r2");
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  }
  await sql`delete from express_backup_jobs where id=${jobId}`;
}

export async function getBackupJob(jobId: string): Promise<ExpressBackupJob> {
  await requireUser();
  const rows = (await sql`select j.*, a.agent_name from express_backup_jobs j
    left join express_backup_agents a on a.id = j.agent_id
    where j.id=${jobId}`) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("ไม่พบงานสำรองข้อมูล");
  return toJob(rows[0]);
}

export type StorageStats = {
  total_files: number;
  total_bytes: number;
  per_client: { client_id: string; client_name: string; files: number; bytes: number }[];
};

export async function getBackupStorageStats(): Promise<StorageStats> {
  await requireUser();
  const totals = (await sql`select count(*)::text as files,
      coalesce(sum(backup_size_bytes),0)::text as bytes
    from express_backup_jobs where status='success' and backup_size_bytes is not null`) as {
    files: string;
    bytes: string;
  }[];
  const per = (await sql`select j.client_id, c.name as client_name,
      count(*)::text as files, coalesce(sum(j.backup_size_bytes),0)::text as bytes
    from express_backup_jobs j join clients c on c.id = j.client_id
    where j.status='success' and j.backup_size_bytes is not null
    group by j.client_id, c.name order by c.name`) as {
    client_id: string;
    client_name: string;
    files: string;
    bytes: string;
  }[];
  return {
    total_files: num(totals[0]?.files),
    total_bytes: num(totals[0]?.bytes),
    per_client: per.map((r) => ({
      client_id: String(r.client_id),
      client_name: r.client_name,
      files: num(r.files),
      bytes: num(r.bytes),
    })),
  };
}

export async function getAgents(): Promise<ExpressBackupAgent[]> {
  await requireUser();
  const rows = (await sql`select a.*, c.name as client_name from express_backup_agents a
    left join clients c on c.id = a.client_id order by a.created_at desc`) as Record<
    string,
    unknown
  >[];
  return rows.map((r) => toAgent(r, r.client_name == null ? null : String(r.client_name)));
}

/**
 * Register a machine: creates the agent row + a one-time token.
 * The owner types the token into the Windows agent once; the agent
 * exchanges it for a long-lived secret (hash stored server-side).
 */
export async function registerAgent(form: {
  agent_name: string;
  machine_name: string;
}): Promise<{ id: string; registration_token: string }> {
  await requireUser();
  const agentName = form.agent_name.trim();
  const machineName = form.machine_name.trim();
  if (!agentName || !machineName) throw new Error("กรุณาระบุชื่อเครื่อง");
  const token = newRegistrationToken();
  const rows = (await sql`insert into express_backup_agents
      (agent_name, machine_name, status, registration_token_hash)
    values (${agentName}, ${machineName}, 'offline', ${sha256Hex(token)}) returning id`) as {
    id: string;
  }[];
  return { id: String(rows[0].id), registration_token: token };
}

export async function revokeAgent(agentId: string): Promise<void> {
  await requireUser();
  await sql`update express_backup_agents
    set status='revoked', revoked_at=now(), registration_token_hash=null, updated_at=now()
    where id=${agentId}`;
}

/** Re-queue jobs whose agent died mid-run (running > 2h with no heartbeat). Documented lease. */
export async function reclaimStaleJobs(): Promise<{ reclaimed: number }> {
  await requireUser();
  const rows = (await sql`update express_backup_jobs j set status='pending', agent_id=null, started_at=null
    where j.status='running' and j.started_at < now() - interval '2 hours'
    and (j.agent_id is null or not exists (
      select 1 from express_backup_agents a
      where a.id = j.agent_id and a.last_seen_at > now() - interval '3 minutes'
        and a.status <> 'revoked' and a.revoked_at is null))
    returning j.id`) as { id: string }[];
  return { reclaimed: rows.length };
}

/** Exchange a one-time registration token for a long-lived agent secret (user-authenticated). */
export async function issueAgentSecret(agentId: string): Promise<{ secret: string }> {
  await requireUser();
  const secret = newAgentSecret();
  const rows = (await sql`update express_backup_agents
    set token_hash=${sha256Hex(secret)}, updated_at=now() where id=${agentId} returning id`) as {
    id: string;
  }[];
  if (!rows[0]) throw new Error("ไม่พบเครื่อง");
  return { secret: `${agentId}.${secret}` };
}
