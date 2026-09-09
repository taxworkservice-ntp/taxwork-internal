// Shared Express Backup domain logic (server-only: imports sql/crypto).
// Never import this file from client components — import UI constants
// from "@/lib/express-backup-ui" instead (no Node/DB imports there).
import { createHash, randomBytes } from "crypto";
import { sql } from "@/lib/db";
import type { ExpressBackupStatus } from "./express-backup-ui";

export type { ExpressBackupStatus } from "./express-backup-ui";
export { BACKUP_ERROR_TH, STATUS_TH, thaiError } from "./express-backup-ui";

export type ExpressBackupConfig = {
  id: string;
  client_id: string;
  source_path: string;
  enabled: boolean;
  schedule_type: string;
  schedule_time: string; // "HH:MM:SS"
  timezone: string;
  retention_days: number;
  created_at: string;
  updated_at: string;
};

export type ExpressBackupJob = {
  id: string;
  client_id: string;
  agent_id: string | null;
  status: string;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  source_file_count: number | null;
  source_size_bytes: number | null;
  backup_size_bytes: number | null;
  file_name: string | null;
  storage_key: string | null;
  checksum: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  agent_name?: string | null;
};

export type ExpressBackupAgent = {
  id: string;
  agent_name: string;
  machine_name: string;
  client_id: string | null;
  client_name?: string | null;
  status: string;
  version: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Agent is considered online if heartbeat within this window. */
export const AGENT_ONLINE_MS = 3 * 60 * 1000;

/** A backup is "late" when no success within this long after the scheduled time. */
export const LATE_AFTER_MS = 26 * 60 * 60 * 1000;

/** R2 prefix for all Express backups (single shared bucket from lib/r2.ts). */
export const BACKUP_R2_PREFIX = "express-backups";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** One-time registration token shown once to the owner, e.g. "ABC-123-XYZ". */
export function newRegistrationToken(): string {
  const part = (n: number) =>
    randomBytes(n).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, n) ||
    "X".repeat(n);
  return `${part(3)}-${part(3)}-${part(3)}`;
}

/** Long-lived agent secret stored only as a hash server-side. */
export function newAgentSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Server-derived R2 key. The agent must never submit an arbitrary key —
 * upload-url endpoints derive the key from job + client + timestamp.
 */
export function jobStorageKey(clientId: string, jobId: string, at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const stamp = at.toISOString().replace(/[:-]/g, "").slice(0, 15); // YYYYMMDDTHHMMSS
  return `${BACKUP_R2_PREFIX}/${clientId}/${y}/${m}/${clientId}_${stamp}_${jobId.slice(0, 8)}.zip`;
}

export function isAgentOnline(lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return false;
  return Date.now() - new Date(lastSeenIso).getTime() < AGENT_ONLINE_MS;
}

export function computeStatus(opts: {
  enabled: boolean;
  hasConfig: boolean;
  latestJobStatus: string | null;
  latestSuccessAt: string | null;
}): ExpressBackupStatus {
  if (!opts.hasConfig || !opts.enabled) return "unconfigured";
  if (opts.latestJobStatus === "running") return "running";
  if (opts.latestJobStatus === "pending") return "pending";
  if (opts.latestJobStatus === "failed") return "failed";
  if (opts.latestSuccessAt) {
    if (Date.now() - new Date(opts.latestSuccessAt).getTime() > LATE_AFTER_MS) return "late";
    return "healthy";
  }
  return "late";
}

export type AgentAuth =
  | { ok: true; agentId: string; agentName: string }
  | { ok: false; error: string };

/**
 * Dedicated agent authentication (NOT better-auth session).
 * Expects `Authorization: Bearer <agentId>.<agentSecret>`.
 */
export async function authenticateAgent(authHeader: string | null): Promise<AgentAuth> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, error: "missing credentials" };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, error: "malformed credentials" };
  const agentId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!agentId || !secret) return { ok: false, error: "malformed credentials" };

  const rows = (await sql`select id, agent_name, token_hash, status, revoked_at
    from express_backup_agents where id=${agentId}`) as {
    id: string;
    agent_name: string;
    token_hash: string;
    status: string;
    revoked_at: unknown;
  }[];
  const agent = rows[0];
  if (!agent || !agent.token_hash) return { ok: false, error: "unknown agent" };
  if (agent.status === "revoked" || agent.revoked_at) {
    return { ok: false, error: "agent revoked" };
  }
  const digest = sha256Hex(secret);
  if (digest.length !== agent.token_hash.length || digest !== agent.token_hash) {
    return { ok: false, error: "invalid secret" };
  }
  return { ok: true, agentId: agent.id, agentName: agent.agent_name };
}
