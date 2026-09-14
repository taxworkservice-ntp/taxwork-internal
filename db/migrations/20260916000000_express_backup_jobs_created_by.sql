-- Record who triggered a manual backup job (scheduled/agent jobs stay null).
alter table public.express_backup_jobs
  add column if not exists created_by text;
