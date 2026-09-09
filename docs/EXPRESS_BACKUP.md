# Express Backup

Monitor and manage backups of clients' **Express Accounting Software** data.
The web app configures/monitors; a small Windows agent (`agent/`) does the filesystem work.

```
Express data folder (Windows)
        │ read-only ZIP + SHA-256
Windows agent ──HTTPS Bearer──▶ Taxwork Internal ──presigned PUT──▶ R2 express-backups/...
        │                                                   │
        └─ heartbeat / claim / complete / fail              └─ Neon metadata (jobs/configs/agents)
```

## Database (Neon, migration `supabase/migrations/20260909000000_express_backup.sql`)

- `express_backup_configs` — one row per client (`client_id UNIQUE → clients.id CASCADE`):
  `source_path` (Windows path, e.g. `D:\ExpressData\ABC`), `enabled`, `schedule_type='daily'` (V1),
  `schedule_time`, `timezone='Asia/Bangkok'`, `retention_days > 0`.
- `express_backup_agents` — machines: `agent_name`, `machine_name`, optional `client_id` metadata,
  `status` (`online`/`offline`/`revoked`), `version`, `last_seen_at`,
  `token_hash` (sha256 of long-lived secret), `registration_token_hash` (one-time, cleared on use),
  `revoked_at`.
- `express_backup_jobs` — `client_id → clients CASCADE`, `agent_id → agents SET NULL`,
  `status` (`pending`→`running`→`success`/`failed`/`cancelled`), `trigger_type`
  (`manual`/`scheduled`/`retry`), sizes, `file_name`, `storage_key`, `checksum` (SHA-256),
  `error_code` + `error_message`. Indexes on `(client_id, created_at)`, `status`,
  partial `pending/running`.

No RLS (Neon convention) — every data path requires auth (see below).

## Web UI (Thai, existing `.btn/.card/.table-base` only)

- `/express-backup` — summary cards, `[สำรองข้อมูลทั้งหมด]`, `[เพิ่มเครื่อง]`, per-client table
  (บริษัท/สำรองล่าสุด/สถานะ/ขนาด/การทำงาน), machine list with online/offline + เพิกถอนเครื่อง.
- `/express-backup/[clientId]` — status, settings form (source path/time/retention/enabled),
  `[สำรองข้อมูลตอนนี้]`, history (วันที่/ขนาด/สถานะ/ประเภท/ไฟล์) with ดาวน์โหลด/รายละเอียด/ยกเลิก,
  Thai error text (`ไม่พบโฟลเดอร์ข้อมูล Express`, …).
- Status: ปกติ (success within ~26 h) / รอดำเนินการ / กำลังสำรอง / ล่าช้า / ล้มเหลว / ยังไม่ได้ตั้งค่า.
  Logic: `computeStatus()` in `lib/express-backup.ts`.

## Server Actions (`lib/actions/express-backup.ts`, all `requireUser()`)

`getExpressBackupOverview`, `getExpressBackupDetail`, `saveExpressBackupConfig`,
`createManualBackupJob`, `createBackupAllJobs` (skips clients with pending/running jobs),
`cancelBackupJob`, `getBackupJob`, `getBackupStorageStats` (DB metadata only, no R2 scan),
`getAgents`, `registerAgent` (one-time `ABC-123-XYZ` token), `revokeAgent`,
`reclaimStaleJobs` (running > 2 h + dead agent → pending), `issueAgentSecret`.

## API routes

User (`requireUserApi()`):

- `POST /api/express-backup/jobs` `{clientId}` — same guards as the action (configured, enabled, no duplicate).
- `POST /api/express-backup/sign-download` `{jobId}` — only `success` jobs, key must start with
  `express-backups/`; returns short-lived SigV4 GET URL (mirrors `/api/files/sign-download`).

Agent (`Authorization: Bearer <agentId>.<secret>`, sha256-compared, revoked rejected):

- `POST /api/express-backup/agent/register` `{agentId, registrationToken, version?}` → `{credential}` (once).
- `POST /api/express-backup/agent/heartbeat` → updates `last_seen_at`, online.
- `GET /api/express-backup/agent/jobs` → up to 10 pending jobs with `sourcePath` only.
- `POST /api/express-backup/agent/jobs/[id]/claim` — atomic `UPDATE … WHERE status='pending' RETURNING` (409 if taken).
- `POST /api/express-backup/agent/jobs/[id]/upload-url` — owner-only; server derives
  `express-backups/{clientId}/{YYYY}/{MM}/{clientId}_{stamp}_{job8}.zip`, returns presigned PUT (600 s).
- `POST /api/express-backup/agent/jobs/[id]/complete` — owner-only; requires sha256 + size; sets `success`.
- `POST /api/express-backup/agent/jobs/[id]/fail` — `{errorCode, errorMessage}` → `failed`.

Online = heartbeat within 3 min. Lease: `reclaimStaleJobs` re-queues `running` jobs whose agent died.

## R2

Shared bucket `internal-waxwork`, prefix `express-backups/{clientId}/{YYYY}/{MM}/…zip`.
Neon holds metadata; R2 holds bytes. R2 secrets server-side only — agent uploads via presigned URLs.

## Retention (V1)

`retention_days` is recorded and displayed; **no automatic deletion yet** (V1 manual).
Rules when automation lands: never delete the latest or only successful backup; server-side only.

## Restore (V1)

Download-only. Future restore = download → local restore folder → manual verify → manual replace.
Never auto-overwrite production Express data.

## Security model

- Human: better-auth + `requireUser()`/`requireUserApi()`. Agent credential ≠ user session.
- Agent endpoints allow only heartbeat/job-claim/upload-url/complete/fail. No client/credential/task reads,
  no arbitrary R2 keys, no DB/R2 secrets on the machine.

## Troubleshooting

- Backup late → agent offline? Check เครื่องออนไลน์ / เห็นล่าสุด.
- `SOURCE_NOT_FOUND` → fix แหล่งข้อมูล path in settings, then สำรองข้อมูลตอนนี้.
- Stuck กำลังสำรอง → crashed agent; reclaimed automatically after ~2 h, or cancel + retry.
