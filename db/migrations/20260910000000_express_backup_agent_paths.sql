-- Express Backup: per-machine source paths + targeted jobs.
-- Record-only migration. No RLS (Neon convention: auth enforced in
-- Server Actions / API routes via requireUser()).
-- Same client may exist on several Windows machines with totally different
-- folders ("back up both" semantics). Each (agent, client) pair gets its own
-- source_path; jobs can target a specific agent.

-- 1. Per-(agent, client) source path overrides.
-- Empty = agent falls back to express_backup_configs.source_path.
create table if not exists public.express_backup_agent_paths (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.express_backup_agents(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source_path text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, client_id)
);
create index if not exists idx_express_backup_agent_paths_client
  on public.express_backup_agent_paths(client_id);
create index if not exists idx_express_backup_agent_paths_agent
  on public.express_backup_agent_paths(agent_id);

-- 2. Targeted jobs: a job may name the agent that must run it.
-- NULL = any agent (legacy behavior, preserved for old rows).
alter table public.express_backup_jobs
  add column if not exists target_agent_id uuid
  references public.express_backup_agents(id) on delete set null;
create index if not exists idx_express_backup_jobs_target
  on public.express_backup_jobs(target_agent_id, status)
  where status in ('pending', 'running');

-- 3. Audit: which folder a run actually zipped (machines differ).
alter table public.express_backup_jobs
  add column if not exists source_path_used text;
