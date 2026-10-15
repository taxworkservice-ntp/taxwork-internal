-- Outbound report emails (client delivery via Resend). One row per send
-- attempt so we can enforce a hard monthly quota (successful sends only) and
-- keep an audit trail. Failed attempts are recorded but never count toward the
-- quota. Apply manually via psql or the Neon SQL editor (see MASTER.md §10).
create table if not exists public.report_emails (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.monthly_reports(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  to_email text not null,
  subject text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_message_id text,
  error text,
  sent_by text,
  sent_at timestamptz not null default now()
);

create index if not exists report_emails_sent_at_idx on public.report_emails (sent_at);
create index if not exists report_emails_report_idx on public.report_emails (report_id);

alter table public.report_emails enable row level security;

-- Plain Neon has no `authenticated` role, so guard the permissive policy.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "authenticated full access report_emails" on public.report_emails;
    create policy "authenticated full access report_emails" on public.report_emails
      for all to authenticated using (true) with check (true);
  end if;
end $$;
