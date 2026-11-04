-- Per-user download history for the home page "ยังไม่โหลด" indicators.
-- Apply manually via psql or the Neon SQL editor (see MASTER.md §10).
create table if not exists public.file_downloads (
  file_id uuid not null references public.files(id) on delete cascade,
  user_email text not null,
  downloaded_at timestamptz not null default now(),
  primary key (file_id, user_email)
);

create index if not exists idx_file_downloads_user
  on public.file_downloads(user_email);

alter table public.file_downloads enable row level security;

drop policy if exists "authenticated full access file_downloads" on public.file_downloads;
create policy "authenticated full access file_downloads" on public.file_downloads
  for all to authenticated using (true) with check (true);

-- Existing uploads count as already handled by the person who uploaded them.
insert into public.file_downloads (file_id, user_email)
select id, lower(trim(uploaded_by))
from public.files
where uploaded_by is not null and trim(uploaded_by) <> ''
on conflict (file_id, user_email) do nothing;
