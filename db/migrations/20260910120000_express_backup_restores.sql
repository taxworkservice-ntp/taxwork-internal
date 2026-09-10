-- Express Backup: human-gated, agent-assisted restore (export to another machine).
-- Record-only migration. No RLS (Neon convention: auth enforced in
-- Server Actions / API routes via requireUser()).
--
-- Safety model: two human gates, agent does only mechanical work.
--   pending   — human requested, awaiting approval (nothing runs)
--   approved  — human approved details; target agent may download+verify+extract
--   downloading/staged — agent progress; staged = verified copy waiting
--   confirmed — human confirmed staged copy; agent may back up + place files
--   completed — files placed, .bak_path holds the rollback copy
--   rejected/cancelled/failed — terminal without placement
-- The agent NEVER overwrites live data without a confirmed restore, and every
-- placement is preceded by a .bak copy recorded in bak_path.

create table if not exists public.express_backup_restores (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.express_backup_jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  target_agent_id uuid references public.express_backup_agents(id) on delete set null,
  target_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'downloading',
      'staged', 'confirmed', 'completed', 'failed', 'cancelled')),
  requested_by text,
  approved_by text,
  confirmed_by text,
  staged_file_count integer,
  bak_path text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_express_backup_restores_client_created
  on public.express_backup_restores(client_id, created_at desc);
create index if not exists idx_express_backup_restores_target
  on public.express_backup_restores(target_agent_id, status)
  where status in ('approved', 'confirmed');
