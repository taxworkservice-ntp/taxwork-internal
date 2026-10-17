-- Temporary diagnostic store for the LINE webhook: records sender user IDs so
-- staff can discover the correct ADMIN_LINE_USER_IDS value. Safe to drop after.
-- Apply manually (psql / Neon SQL editor).

create table if not exists public.line_contacts (
  user_id text primary key,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.line_contacts enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "authenticated full access line_contacts" on public.line_contacts;
    create policy "authenticated full access line_contacts" on public.line_contacts
      for all to authenticated using (true) with check (true);
  end if;
end $$;
