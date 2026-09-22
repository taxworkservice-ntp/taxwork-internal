# Taxwork Internal — Express Backup Module

Implement an **Express Backup** module inside the existing Taxwork Internal repository.

This is an ADDITION to the existing application.

**DO NOT create a separate web application.**

The existing application is the source of truth for authentication, clients, UI conventions, database access, and file storage.

---

# 0. Existing Project Context

The application is:

* Next.js 15 App Router
* TypeScript
* Tailwind CSS v4
* Neon Postgres
* better-auth
* Cloudflare R2
* Vercel
* Server Actions in `lib/actions/`
* API routes protected by `requireUserApi()`
* Server Actions protected by `requireUser()`
* Raw SQL via `@neondatabase/serverless`
* No new UI component library
* Thai UI
* Existing `clients` table

Read these files before making changes:

```text
MASTER.md
```

and the project's existing master prompt/context.

Inspect the existing repository before writing code.

---

# 1. Objective

Add a new section:

```text
Express Backup
```

to Taxwork Internal.

The purpose is to monitor and manage backups of Express Accounting Software data belonging to Taxwork's clients.

The web application should allow the owner to:

* configure Express backup settings per client
* see backup status
* see last successful backup
* see backup history
* trigger a manual backup
* see Windows backup-agent status
* download previous backups
* view backup errors
* configure retention
* see storage usage

The actual access to Express data happens on a Windows computer.

Therefore the system consists of:

```text
Existing Taxwork Internal
        │
        ├── Neon
        └── Cloudflare R2
                ▲
                │
                │ HTTPS
                │
        Windows Backup Agent
                │
                ▼
        Express data folder
```

---

# 2. Critical Architecture Rule

The browser must NEVER directly access the Windows filesystem.

The web application cannot read:

```text
C:\...
D:\...
```

The Windows agent is responsible for local filesystem access.

The web application is responsible for:

```text
configuration
job creation
monitoring
backup history
download
retention management
```

The Windows agent is responsible for:

```text
filesystem access
backup creation
checksum
upload
job execution
heartbeat
```

---

# 3. Before Coding

First inspect the repository.

Identify:

* existing navigation/sidebar implementation
* existing page patterns
* existing client actions
* existing database helper functions
* existing API route patterns
* existing R2 utilities
* existing file signing implementation
* existing authentication helpers
* existing TypeScript conventions
* existing CSS component classes

Especially inspect:

```text
lib/session.ts
lib/db/index.ts
lib/actions/
app/(app)/
components/sidebar.tsx
/api/files/*
app/globals.css
```

Reuse existing code wherever possible.

Do NOT duplicate existing functionality.

---

# 4. Existing Client Relationship

Use the existing:

```text
clients
```

table.

Do NOT create:

```text
express_clients
backup_clients
companies
```

if the existing `clients` table can be used.

Every Express Backup configuration should reference:

```text
clients.id
```

Relationship:

```text
clients
   │
   └── express_backup_configs
             │
             └── express_backup_jobs
```

---

# 5. Database Migration

Create a new migration under:

```text
supabase/migrations/
```

Use the existing migration naming convention.

The migration is for Neon Postgres and exists as the schema record.

Do NOT use Supabase-specific functionality.

Do NOT use RLS-specific assumptions from the old Supabase project.

However, follow the repository's current convention described in `MASTER.md` for new tables.

---

# 6. Table: express_backup_configs

Create:

```sql
CREATE TABLE express_backup_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id UUID NOT NULL
        REFERENCES clients(id)
        ON DELETE CASCADE,

    source_path TEXT NOT NULL,

    enabled BOOLEAN NOT NULL DEFAULT true,

    schedule_type TEXT NOT NULL DEFAULT 'daily',

    schedule_time TIME NOT NULL DEFAULT '23:00:00',

    timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',

    retention_days INTEGER NOT NULL DEFAULT 30,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(client_id)
);
```

Use the actual `clients.id` data type from the existing schema if it differs.

Do not blindly copy this SQL if the existing schema uses another ID type.

Constraints:

```text
schedule_type:
daily
```

For V1, only daily scheduling is required.

Validate:

```text
retention_days > 0
```

---

# 7. Table: express_backup_agents

Create:

```sql
CREATE TABLE express_backup_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_name TEXT NOT NULL,

    machine_name TEXT NOT NULL,

    client_id UUID
        REFERENCES clients(id)
        ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'offline',

    version TEXT,

    last_seen_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A single Windows machine may eventually handle multiple clients.

Do not assume:

```text
1 agent = 1 client
```

The `client_id` is optional metadata, not the fundamental relationship.

---

# 8. Table: express_backup_jobs

Create:

```sql
CREATE TABLE express_backup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id UUID NOT NULL
        REFERENCES clients(id)
        ON DELETE CASCADE,

    agent_id UUID
        REFERENCES express_backup_agents(id)
        ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    trigger_type TEXT NOT NULL DEFAULT 'scheduled',

    started_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    source_file_count INTEGER,

    source_size_bytes BIGINT,

    backup_size_bytes BIGINT,

    file_name TEXT,

    storage_key TEXT,

    checksum TEXT,

    error_code TEXT,

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Statuses:

```text
pending
running
success
failed
cancelled
```

Trigger types:

```text
scheduled
manual
retry
```

Add appropriate indexes:

```text
client_id
status
created_at
```

and any indexes needed for efficient "latest successful backup" queries.

---

# 9. Optional Job Log Table

If the existing application has no suitable logging mechanism, create:

```sql
express_backup_job_logs
```

with:

```text
id
job_id
level
message
created_at
```

Levels:

```text
info
warning
error
```

Do not over-engineer logging if the existing architecture already has a suitable pattern.

---

# 10. Database Security

Follow the repository's current database/security convention.

Every new data-access path must be protected with:

```text
requireUser()
```

for Server Actions.

API routes must use:

```text
requireUserApi()
```

The Windows agent is different from a browser user.

Agent API endpoints must use a dedicated agent authentication mechanism.

Do NOT expose:

```text
DATABASE_URL
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
BETTER_AUTH_SECRET
```

to the browser or Windows agent unless absolutely necessary.

The Windows agent should never receive the R2 master secret.

---

# 11. R2 Storage Structure

Use the existing Cloudflare R2 bucket:

```text
internal-waxwork
```

Do NOT create another bucket.

Store Express backups under:

```text
express-backups/{clientId}/{YYYY}/{MM}/{filename}
```

Example:

```text
express-backups/
  123abc/
    2026/
      09/
        123abc_2026-09-09_230500.zip
```

Never use the raw company name as the storage path.

Sanitize/derive filenames safely.

---

# 12. R2 Metadata

The database record should contain:

```text
file_name
backup_size_bytes
storage_key
checksum
```

R2 contains the actual backup.

Neon contains metadata.

Do not put backup binary data into Postgres.

---

# 13. R2 Credentials

The Windows agent must NOT contain:

```text
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

Instead use the existing application as the secure upload broker.

Preferred V1 flow:

```text
Windows Agent
     │
     │ authenticated request
     ▼
Taxwork API
     │
     │ creates presigned PUT
     ▼
Windows Agent
     │
     │ direct upload
     ▼
Cloudflare R2
```

The backend generates a short-lived presigned URL.

The agent uploads directly to R2.

The R2 secret stays server-side.

---

# 14. Upload Flow

For each backup:

```text
Windows Agent
    │
    ├── create local backup
    │
    ├── calculate SHA-256
    │
    ├── request upload URL
    │
    ▼
Taxwork API
    │
    ├── verify agent
    ├── verify job
    └── generate R2 presigned PUT
    │
    ▼
Windows Agent
    │
    └── PUT backup directly to R2
    │
    ▼
R2
    │
    ▼
Windows Agent
    │
    └── report upload complete
    │
    ▼
Taxwork API
    │
    └── mark job success
```

Do not mark the job `success` before the agent confirms the upload completed.

---

# 15. Upload Verification

The agent must calculate:

```text
SHA-256
```

of the local backup.

The completion request should send:

```text
checksum
file size
file name
storage key
```

The server should validate the job and record the checksum.

If practical with the existing R2 implementation, verify the uploaded object metadata/size before marking the job successful.

If exact checksum verification against R2 is not reliable through the available S3 API, document this clearly rather than pretending verification occurred.

---

# 16. Server Actions

Create:

```text
lib/actions/express-backup.ts
```

or follow the repository's naming convention.

All actions must call:

```text
requireUser()
```

before accessing data.

Implement approximately:

```text
getExpressBackupOverview()
getExpressBackupConfig(clientId)
saveExpressBackupConfig(...)
getExpressBackupHistory(clientId, ...)
createManualBackupJob(clientId)
cancelBackupJob(jobId)
getBackupJob(jobId)
```

Also provide functions for:

```text
getBackupStorageStats()
getAgents()
getAgent(...)
```

Only implement actions actually required by the UI.

Avoid creating unused abstractions.

---

# 17. API Routes

Create agent-only endpoints under something like:

```text
/api/express-backup/agent/*
```

Suggested endpoints:

```text
POST /api/express-backup/agent/register
POST /api/express-backup/agent/heartbeat
GET  /api/express-backup/agent/jobs
POST /api/express-backup/agent/jobs/:id/claim
POST /api/express-backup/agent/jobs/:id/upload-url
POST /api/express-backup/agent/jobs/:id/complete
POST /api/express-backup/agent/jobs/:id/fail
```

Follow the existing route-handler conventions.

Do NOT use `requireUserApi()` for agent authentication because the Windows agent does not use a browser session.

Instead implement dedicated agent authentication.

---

# 18. Agent Authentication

Design a secure registration mechanism.

V1 approach:

Owner opens:

```text
Express Backup
→ เครื่อง / Agent
→ เพิ่มเครื่อง
```

The server generates a one-time registration token.

Example:

```text
ABC-123-XYZ
```

The Windows agent uses this token once to register.

The server then issues a long-lived agent credential.

Do not store the raw long-lived credential unnecessarily.

Prefer storing a hash of the agent secret.

The agent stores its credential locally in a protected Windows location.

Do NOT put it into Git or frontend environment variables.

---

# 19. Agent Credential Rules

Agent credentials must:

* identify the agent
* be revocable
* be rotatable
* not grant normal user access
* not grant arbitrary R2 access
* only allow agent-specific endpoints

Add an option in the dashboard:

```text
เพิกถอนเครื่อง
```

Revoked agents must immediately stop being able to create/complete jobs.

---

# 20. Express Backup Page

Add a new navigation item:

```text
Express Backup
```

Use the existing sidebar implementation.

Route:

```text
/express-backup
```

Use the existing `(app)` layout.

All UI text must be Thai.

---

# 21. Main UI

Keep the design consistent with the existing application.

Do not add a UI library.

Use existing classes such as:

```text
.btn
.btn-primary
.btn-danger
.input
.label
.card
.table-base
```

Main page:

```text
Express Backup

[ สำรองข้อมูลทั้งหมด ]   [ เพิ่มเครื่อง ]

สถานะโดยรวม

บริษัททั้งหมด     21
สำรองสำเร็จล่าสุด  20
มีปัญหา             1
เครื่องออนไลน์      1

--------------------------------------

บริษัท
สำรองข้อมูลล่าสุด
สถานะ
ขนาด
เครื่อง
การทำงาน
```

Use the actual existing client list.

---

# 22. Client Backup Status

For each client:

```text
บริษัท ABC จำกัด

สำรองล่าสุด
9 ก.ย. 2569 23:05

สถานะ
✓ ปกติ
```

Possible statuses:

```text
ปกติ
รอดำเนินการ
กำลังสำรอง
ล่าช้า
ล้มเหลว
ยังไม่ได้ตั้งค่า
```

Use existing badge/status styling if available.

---

# 23. Client Detail / Backup Detail

Clicking a client should show:

```text
Express Backup

บริษัท ABC จำกัด

สถานะ:
ปกติ

สำรองล่าสุด:
9 ก.ย. 2569 23:05

แหล่งข้อมูล:
D:\Express\ABC

กำหนดเวลา:
ทุกวัน 23:00

เก็บข้อมูล:
30 วัน
```

Actions:

```text
[ สำรองข้อมูลตอนนี้ ]
[ แก้ไขการตั้งค่า ]
```

---

# 24. Backup History

Show:

```text
ประวัติการสำรองข้อมูล

วันที่
ขนาด
สถานะ
ประเภท
ไฟล์
การทำงาน
```

Actions:

```text
ดาวน์โหลด
รายละเอียด
```

Use pagination if necessary.

Do not load thousands of records into the browser.

---

# 25. Download Flow

Use the existing R2 presigned download architecture.

Browser:

```text
GET /api/files/sign-download
```

or create an Express-specific route if the existing route does not safely support this storage namespace.

Never expose R2 credentials.

Prefer a short-lived signed URL.

---

# 26. Manual Backup

When the owner clicks:

```text
สำรองข้อมูลตอนนี้
```

create:

```text
express_backup_jobs.status = 'pending'
trigger_type = 'manual'
```

Then the Windows agent will pick it up.

The UI should immediately show:

```text
รอเครื่องดำเนินการ
```

Do not pretend that the backup has started until the agent actually claims it.

---

# 27. "Backup All"

Provide:

```text
สำรองข้อมูลทั้งหมด
```

This should create pending jobs only for clients that:

* have Express Backup enabled
* have an available configuration

Do not create duplicate pending/running jobs for the same client.

If a client already has:

```text
pending
running
```

do not create another job.

---

# 28. Job Claiming

Agent job claiming must be atomic.

Two agents must never successfully claim the same job.

Use a transaction/atomic SQL update such as:

```text
UPDATE ...
SET status = 'running',
    agent_id = ...
WHERE id = ...
  AND status = 'pending'
RETURNING ...
```

If zero rows are returned, the job was already claimed.

---

# 29. Agent Polling

For V1 the Windows agent may poll:

```text
every 30 seconds
```

Flow:

```text
GET jobs
    ↓
claim job
    ↓
execute
```

Do not build WebSockets unless there is a real need.

Polling is sufficient for this small internal application.

---

# 30. Heartbeat

Agent heartbeat:

```text
every 60 seconds
```

Update:

```text
last_seen_at
status = online
```

If:

```text
last_seen_at > 3 minutes
```

show:

```text
ออฟไลน์
```

Do not require a separate monitoring infrastructure.

---

# 31. Windows Agent

Create a separate directory:

```text
agent/
```

Do not mix agent code into the Next.js frontend.

Recommended implementation:

```text
Python
```

Package eventually as:

```text
TaxworkExpressBackupAgent.exe
```

The agent should support:

```text
agent/
  main.py
  config.py
  api.py
  backup.py
  storage.py
  checksum.py
  scheduler.py
  logger.py
```

Adjust this structure if a better minimal design fits the project.

---

# 32. Agent Configuration

The agent needs:

```text
server URL
agent ID
agent secret
poll interval
heartbeat interval
```

It also needs local backup settings supplied by the server.

Do not hard-code client paths into the executable.

---

# 33. Source Path

Each client's backup configuration contains something like:

```text
D:\ExpressData\ABC
```

The Windows agent receives the path for the job.

Before running:

```text
check path exists
check permissions
check available disk space
```

If source path is missing:

```text
error_code = SOURCE_NOT_FOUND
status = failed
```

---

# 34. What Exactly Is Being Backed Up?

IMPORTANT:

Do not assume an Express-specific proprietary backup format unless the repository/user has explicitly defined it.

Initially implement the backup worker as:

```text
configured source directory
        ↓
archive its contents
        ↓
ZIP
        ↓
SHA-256
        ↓
upload
```

Do not modify the source directory.

If later we confirm Express has a specific official backup procedure, isolate that logic behind:

```text
backup_strategy
```

so it can be replaced without redesigning the system.

---

# 35. Local Temporary Backup

The agent should create temporary files in:

```text
%LOCALAPPDATA%\TaxworkExpressBackup\pending\
```

Example:

```text
pending/
  job-abc123.zip
```

After successful upload:

```text
delete temporary file
```

If upload fails:

```text
keep temporary file
```

so it can be retried.

---

# 36. Backup Process

Implement:

```text
1. Claim job
2. Validate source path
3. Validate disk space
4. Enumerate source
5. Create ZIP
6. Calculate SHA-256
7. Request R2 presigned upload URL
8. Upload directly to R2
9. Report completion
10. Delete temporary ZIP
```

Never modify the original Express files.

---

# 37. Failure Handling

Use explicit error codes:

```text
SOURCE_NOT_FOUND
ACCESS_DENIED
DISK_FULL
ARCHIVE_FAILED
NETWORK_ERROR
UPLOAD_FAILED
CHECKSUM_ERROR
JOB_EXPIRED
AUTH_FAILED
UNKNOWN_ERROR
```

Store both:

```text
error_code
error_message
```

The UI should display a human-readable Thai message.

Example:

```text
ไม่พบโฟลเดอร์ข้อมูล Express
```

while retaining the technical error internally.

---

# 38. Retry

Network/upload failures should retry.

Suggested:

```text
attempt 1
wait 30 sec

attempt 2
wait 2 min

attempt 3
wait 5 min
```

Do not retry permanent errors such as:

```text
SOURCE_NOT_FOUND
ACCESS_DENIED
```

unless manually retried.

---

# 39. Retention

V1:

```text
retention_days
```

Example:

```text
30 วัน
```

The system should eventually remove R2 backups older than the configured retention period.

IMPORTANT:

Never delete the most recent successful backup merely because it is old.

Never delete a backup that is the only successful backup for a client.

Implement safe retention logic.

If retention deletion is implemented through the web server, it must be authenticated server-side.

If it requires a scheduled process, document how it runs on Vercel/Neon.

Do not assume a continuously running Node process exists on Vercel.

For V1 it is acceptable to implement retention as a manual action or defer automatic cleanup until a reliable scheduler is selected.

---

# 40. Storage Statistics

Show:

```text
พื้นที่จัดเก็บทั้งหมด
จำนวนไฟล์
ขนาดรวม
```

Optionally show per client.

Do not scan all R2 files on every page request.

Use database metadata where possible.

---

# 41. Date Handling

Never send JavaScript `Date` objects across the server/client boundary.

Return ISO strings.

Example:

```text
2026-09-09T23:05:00.000Z
```

Format in the client using:

```text
toLocaleDateString("th-TH")
```

and appropriate Thai date/time formatting.

---

# 42. Numeric Handling

BIGINT/numeric values crossing HTTP must be treated as strings.

Use the repository's existing:

```text
num()
```

helper if available.

Do not assume Postgres BIGINT arrives as a JavaScript number.

---

# 43. UI Error / Loading States

Every data-driven section needs:

```text
loading state
empty state
error state
```

Example empty state:

```text
ยังไม่มีการตั้งค่า Express Backup
```

Do not leave blank screens.

---

# 44. Responsive Design

Follow the existing mobile-first design.

The desktop sidebar and mobile bottom navigation must continue working.

The Express Backup tables should use:

```text
overflow-x-auto
```

and the same table conventions already used by the application.

Never allow table content to overlap.

---

# 45. Navigation

Add:

```text
Express Backup
```

to the existing sidebar.

Do not modify unrelated navigation items.

Use an appropriate existing icon if the project already has icons.

If the project does not use an icon library, do not add one just for this page.

---

# 46. Security Model

There are two separate security layers.

## Human user

Uses:

```text
better-auth
requireUser()
requireUserApi()
```

## Windows agent

Uses:

```text
agent ID + agent secret
```

Never treat an agent credential as a human session.

Agent endpoints must only permit:

```text
heartbeat
job retrieval
job claiming
upload URL generation
job completion
job failure
```

An agent must NOT be able to:

```text
read clients
read credentials
read accounting tasks
change client data
access arbitrary files
```

---

# 47. Critical Security Rule

The Windows agent must never receive:

```text
all client credentials
all R2 credentials
DATABASE_URL
BETTER_AUTH_SECRET
```

The agent receives only the information necessary to perform its current backup job.

---

# 48. R2 Path Authorization

Never allow the agent to submit an arbitrary R2 key.

The server should derive the expected storage key from:

```text
job
client_id
timestamp
```

The client/agent should not be able to upload to:

```text
files/
credentials/
arbitrary/
```

Only:

```text
express-backups/{clientId}/...
```

---

# 49. Agent Job Authorization

When the agent requests a job:

The server must verify:

```text
agent is valid
agent is not revoked
job is pending
job is assigned/available
```

When the agent completes a job:

Verify:

```text
job belongs to that agent
```

or otherwise use a secure claim/lease mechanism.

Do not allow:

```text
agent A
```

to complete:

```text
agent B's job
```

---

# 50. Job Lease

To prevent a crashed agent from leaving jobs stuck forever:

Add a lease concept if practical.

For example:

```text
claimed_at
```

or use:

```text
started_at
```

If a job remains:

```text
running
```

for an unusually long period, it can eventually be returned to:

```text
pending
```

Do not automatically retry immediately without considering whether the original agent is still working.

Document the chosen behavior.

---

# 51. Windows Agent Installation

Create:

```text
agent/README.md
```

Explain:

1. Install Python for development OR use packaged EXE.
2. Register the machine.
3. Configure the agent.
4. Start the agent.
5. Confirm heartbeat.
6. Run a manual backup.
7. Verify the backup in the web app.

For production, document how to run it automatically on Windows startup.

A Windows Task Scheduler approach is acceptable for V1.

Do NOT require a Windows Service unless necessary.

---

# 52. Development Mode

The agent must be testable without touching real Express production data.

Allow:

```text
TEST_SOURCE_PATH
```

or equivalent configuration.

Use a dummy directory for testing.

Never point tests at real accounting data.

---

# 53. Local Development

The web app uses:

```text
neondev
```

for local development.

Never write test data to production `neondb`.

Use the existing `.env.local`.

Do not commit secrets.

---

# 54. Environment Variables

Do not add unnecessary environment variables.

Existing R2 variables remain server-only:

```text
R2_ACCOUNT_ID
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The browser must never receive them.

The agent should only receive:

```text
Taxwork API URL
agent ID
agent secret
```

---

# 55. UI Language

EVERY new UI string must be Thai.

Examples:

```text
Express Backup

สำรองข้อมูลตอนนี้
ประวัติการสำรองข้อมูล
การตั้งค่า
สถานะ
สำรองล่าสุด
ปกติ
ล้มเหลว
กำลังสำรอง
รอดำเนินการ
เครื่องออนไลน์
เครื่องออฟไลน์
ดาวน์โหลด
รายละเอียด
ลองใหม่
```

Technical errors may remain in server logs in English, but user-facing messages must be Thai.

---

# 56. Existing UI Philosophy

Do NOT create:

* fancy dashboards
* charts unless genuinely useful
* animations
* new component libraries
* unnecessary cards
* complicated filtering systems

This is an internal accounting tool.

Prioritize:

```text
clarity
speed
reliability
```

---

# 57. Files to Add / Modify

Expected structure:

```text
app/
  (app)/
    express-backup/
      page.tsx
      [clientId]/
        page.tsx

lib/
  actions/
    express-backup.ts

app/api/
  express-backup/
    agent/
      register/
        route.ts
      heartbeat/
        route.ts
      jobs/
        route.ts
      jobs/[id]/
        claim/
          route.ts
        upload-url/
          route.ts
        complete/
          route.ts
        fail/
          route.ts

agent/
  ...

supabase/
  migrations/
    YYYYMMDDHHMMSS_add_express_backup.sql
```

Adapt this to the actual repository conventions.

Do not create files unnecessarily.

---

# 58. Do Not Duplicate Existing R2 Code

Before implementing upload/download:

Inspect:

```text
/api/files/sign-upload
/api/files/sign-download
/api/files/delete
/api/files/fetch
```

If existing R2 utilities can safely be reused, reuse them.

Create Express-specific wrappers only when necessary for authorization or different behavior.

---

# 59. Do Not Duplicate Client Queries

Inspect existing client actions.

If there is already:

```text
getClients()
```

or equivalent, reuse it.

Do not create a second client query implementation unnecessarily.

---

# 60. TypeScript

Use strict typing.

Create types for:

```text
ExpressBackupConfig
ExpressBackupJob
ExpressBackupAgent
ExpressBackupStatus
```

Avoid:

```text
any
```

unless there is a documented reason.

---

# 61. SQL

Use the project's existing raw SQL conventions.

Do not introduce Drizzle for application tables.

Drizzle remains for better-auth.

Use:

```text
@neondatabase/serverless
```

for Express Backup queries.

---

# 62. Testing

Test at least:

## Database

* create config
* update config
* delete client cascades config/jobs
* duplicate config prevented

## Authorization

* unauthenticated user cannot access page data
* Server Actions require user
* normal API requires user
* invalid agent cannot access agent API
* revoked agent cannot access agent API

## Jobs

* manual job creation
* scheduled job creation
* duplicate job prevention
* atomic claim
* completion
* failure

## R2

* signed upload URL
* correct storage path
* signed download
* unauthorized storage access blocked

## Agent

* heartbeat
* polling
* claim
* backup
* checksum
* upload
* completion
* network failure
* source not found

---

# 63. Build Checks

After implementation:

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Fix all errors.

Do not leave known TypeScript/lint/build errors.

---

# 64. Migration Safety

Before applying the migration:

1. Inspect existing schema.
2. Confirm `clients.id` type.
3. Confirm naming conventions.
4. Confirm migration history.
5. Test migration against `neondev`.

Do NOT apply experimental schema changes directly to production.

After testing, production migration can be applied using the project's established process.

---

# 65. Git

When the implementation is complete:

```bash
git status
git diff
```

Confirm no secrets or unwanted files are included.

Never commit:

```text
.env.local
*.xlsx
import.sql
agent credentials
R2 credentials
test backup files
real Express accounting data
```

Then commit with a concise message such as:

```text
Add Express backup management
```

Push to:

```text
main
```

only after:

```text
typecheck
lint
build
```

pass.

---

# 66. Documentation

Add/update:

```text
docs/EXPRESS_BACKUP.md
agent/README.md
```

Document:

* architecture
* database tables
* R2 structure
* agent registration
* agent installation
* backup flow
* troubleshooting
* restore procedure
* security model
* retention behavior

---

# 67. Restore

V1 MUST NOT automatically overwrite production Express data.

Implement download first.

If restore is later added:

```text
R2 backup
    ↓
download
    ↓
local restore folder
    ↓
manual verification
    ↓
manual replacement
```

Never silently replace the production Express directory.

---

# 68. Important Unknown

Do not make assumptions about the proprietary/internal structure of Express Accounting Software.

The backup implementation should treat the configured source as a directory unless an official/known Express backup procedure is provided.

Keep backup creation isolated:

```text
agent/backup.py
```

so the backup strategy can later be changed without modifying:

```text
authentication
job system
R2
database
web UI
```

---

# 69. Implementation Order

Follow exactly this order.

## Phase 1 — Repository Analysis

Do not code.

Produce:

```text
EXPRESS_BACKUP_PLAN.md
```

containing:

* existing architecture findings
* tables to reuse
* new tables
* R2 integration
* Server Actions
* API routes
* UI routes
* agent architecture
* security model
* risks

---

## Phase 2 — Database

Create migration.

Test against:

```text
neondev
```

Verify:

```text
clients → backup config
clients → backup jobs
agents → jobs
```

---

## Phase 3 — Web UI

Implement:

```text
/express-backup
```

with:

* client overview
* status
* latest backup
* agent status
* manual backup

Then implement:

```text
/express-backup/[clientId]
```

with:

* settings
* history
* manual backup
* download
* error details

---

## Phase 4 — Server Actions

Implement secure database operations.

Every action:

```text
requireUser()
```

---

## Phase 5 — Agent API

Implement:

```text
register
heartbeat
jobs
claim
upload-url
complete
fail
```

with dedicated agent authentication.

---

## Phase 6 — Windows Agent

Implement:

```text
poll
claim
backup
checksum
upload
complete
heartbeat
retry
```

Test with a dummy folder.

---

## Phase 7 — R2 Integration

Verify:

```text
agent
→ signed upload
→ R2
→ completion
→ database
→ UI
```

---

## Phase 8 — End-to-End Test

Test:

```text
Create client backup config
        ↓
Click "สำรองข้อมูลตอนนี้"
        ↓
Pending job
        ↓
Windows agent claims job
        ↓
Creates ZIP
        ↓
Uploads to R2
        ↓
Reports completion
        ↓
Database updated
        ↓
Web UI shows success
        ↓
Download backup
```

---

# 70. Final Acceptance Criteria

The feature is complete only when all of these work:

### Web

* [ ] Express Backup appears in navigation
* [ ] Thai UI
* [ ] Existing authentication works
* [ ] Existing clients are displayed
* [ ] Backup settings can be configured
* [ ] Manual backup can be requested
* [ ] Backup history works
* [ ] Status works
* [ ] Download works
* [ ] Agent status works

### Database

* [ ] Migration works on `neondev`
* [ ] Foreign keys work
* [ ] Duplicate configs prevented
* [ ] Job status transitions work
* [ ] Indexes exist
* [ ] No unnecessary duplicate client table

### Security

* [ ] Server Actions use `requireUser()`
* [ ] User APIs use `requireUserApi()`
* [ ] Agent APIs use dedicated authentication
* [ ] Agent credentials are revocable
* [ ] R2 secrets remain server-side
* [ ] Agent cannot access arbitrary client data
* [ ] Agent cannot access arbitrary R2 paths

### Backup

* [ ] Source is never modified
* [ ] Missing source produces failure
* [ ] Backup creates correctly
* [ ] SHA-256 is recorded
* [ ] Upload succeeds
* [ ] Upload failure is handled
* [ ] Temporary files are cleaned only after successful upload
* [ ] Backup history is accurate

### Reliability

* [ ] Duplicate jobs prevented
* [ ] Atomic job claim
* [ ] Heartbeat works
* [ ] Offline agent detected
* [ ] Network retry works
* [ ] Failed jobs are visible

### Code Quality

* [ ] `npx tsc --noEmit` passes
* [ ] `npx eslint .` passes
* [ ] `npm run build` passes
* [ ] No secrets committed
* [ ] Documentation updated

---

# 71. Most Important Instruction

This is an existing production application.

**Do not rebuild it.**

**Do not replace its architecture.**

**Do not introduce Supabase.**

**Do not introduce another authentication system.**

**Do not create a separate web application.**

**Do not create duplicate client/company tables.**

**Do not expose R2 credentials.**

**Do not allow the browser to access Windows files.**

Add the Express Backup feature using the existing architecture.

When uncertain, inspect the existing implementation and follow its established pattern rather than inventing a new one.

The priority is:

```text
1. Protect accounting data
2. Reliable backups
3. Reliable recovery/download
4. Secure communication
5. Clear monitoring
6. Simple UI
```
