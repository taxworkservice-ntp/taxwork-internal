-- Payment reconciliation for report rounds: multiple payments per round (a
-- round can be paid partially / from several banks).

create table if not exists report_payments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references monthly_reports(id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  method text,
  note text,
  paid_at timestamptz not null default now(),
  recorded_by text,
  created_at timestamptz not null default now()
);

create index if not exists report_payments_report_idx on report_payments (report_id);

alter table report_payments enable row level security;

-- Only add the authenticated policy where that role exists (these Neon
-- databases connect as owner and have no such role).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "authenticated all report_payments" on report_payments;
    create policy "authenticated all report_payments" on report_payments
      for all to authenticated using (true) with check (true);
  end if;
end $$;
