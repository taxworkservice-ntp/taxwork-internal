-- Report renderer selection + persisted Part 2 documents.
--
-- report_renderer lets the PDF generator be switched between the legacy
-- client-side renderer ('legacy') and the new server-side HTML->PDF renderer
-- ('server') at runtime, without a redeploy. Default stays 'legacy' so nothing
-- changes until explicitly opted in (safe rollback).

alter table app_settings
  add column if not exists report_renderer text not null default 'legacy';

-- Part 2 documents were previously session-local in the browser. Persist them
-- so the server-side renderer can append the same documents after the cover.
create table if not exists report_documents (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references monthly_reports(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size_bytes bigint,
  mime_type text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists report_documents_report_idx on report_documents (report_id);

alter table report_documents enable row level security;

-- Only add the authenticated policy where that role exists (this project's
-- Neon databases connect as the owner and have no such role, matching the
-- other migrations' intent without failing).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "authenticated all report_documents" on report_documents;
    create policy "authenticated all report_documents" on report_documents
      for all to authenticated using (true) with check (true);
  end if;
end $$;
