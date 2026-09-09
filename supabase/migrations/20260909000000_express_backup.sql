-- Express Backup module (Neon Postgres).
-- Record-only migration; no Supabase-specific features, no RLS (Neon convention:
-- auth enforced in Server Actions / API routes via requireUser()).
-- Reuses public.clients(id uuid). Test on neondev before production.

-- 1. Per-client backup configuration (one row per client)
create table if not exists public.express_backup_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  source_path text not null,
  enabled boolean not null default true,
  schedule_type text not null default 'daily' check (schedule_type in ('daily')),
  schedule_time time not null default '23:00:00',
  timezone text not null default 'Asia/Bangkok',
  retention_days integer not null default 30 check (retention_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_express_backup_configs_client on public.express_backup_configs(client_id);

-- 2. Windows backup agents (one machine may serve many clients; client_id is optional metadata)
create table if not exists public.express_backup_agents (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  machine_name text not null,
  client_id uuid references public.clients(id) on delete set null,
  status text not null default 'offline' check (status in ('online', 'offline', 'revoked')),
  version text,
  last_seen_at timestamptz,
  token_hash text not null default '',
  registration_token_hash text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_express_backup_agents_seen on public.express_backup_agents(last_seen_at);
create index if not exists idx_express_backup_agents_status on public.express_backup_agents(status);

-- 3. Backup jobs (web creates pending; agent claims -> running -> success/failed/cancelled)
create table if not exists public.express_backup_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  agent_id uuid references public.express_backup_agents(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'success', 'failed', 'cancelled')),
  trigger_type text not null default 'manual'
    check (trigger_type in ('scheduled', 'manual', 'retry')),
  started_at timestamptz,
  completed_at timestamptz,
  source_file_count integer,
  source_size_bytes bigint,
  backup_size_bytes bigint,
  file_name text,
  storage_key text,
  checksum text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_express_backup_jobs_client_created
  on public.express_backup_jobs(client_id, created_at desc);
create index if not exists idx_express_backup_jobs_status on public.express_backup_jobs(status);
create index if not exists idx_express_backup_jobs_pending
  on public.express_backup_jobs(status, created_at) where status in ('pending', 'running');
create index if not exists idx_express_backup_jobs_client_status
  on public.express_backup_jobs(client_id, status, created_at desc);
