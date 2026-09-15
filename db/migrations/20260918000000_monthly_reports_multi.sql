-- Multiple report rounds per month.
-- A monthly_reports row is one round/batch (ครั้งที่ N) for a client+period.
-- Filings and saved report files reference their round. Additive and nullable,
-- so legacy code paths keep working (report_id NULL = legacy period-only).

create table monthly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  period_label text not null,
  seq int not null default 1,
  report_no text,
  public_id text,
  label text,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, period_label, seq)
);

alter table monthly_filings
  add column if not exists report_id uuid references monthly_reports(id) on delete cascade;

alter table files
  add column if not exists report_id uuid references monthly_reports(id) on delete set null;

-- Backfill: one report per existing (client, period), numbered ครั้งที่ 1.
insert into monthly_reports (client_id, period_label, seq, report_no, label)
select client_id,
       period_label,
       1,
       case
         when period_label ~ '^\d{4}-\d{2}$'
           then 'TW-' || to_char(to_date(period_label || '-01', 'YYYY-MM-DD') + interval '543 years', 'YYMM') || '-01'
         else 'TW-' || regexp_replace(period_label, '[^0-9A-Za-z]', '', 'g') || '-01'
       end,
       'ครั้งที่ 1'
from monthly_filings
group by client_id, period_label
on conflict (client_id, period_label, seq) do nothing;

update monthly_reports
set public_id = upper(substr(md5(id::text || clock_timestamp()::text), 1, 10))
where public_id is null;

alter table monthly_reports alter column public_id set not null;
create unique index if not exists monthly_reports_public_id_key on monthly_reports (public_id);

update monthly_filings f
set report_id = r.id
from monthly_reports r
where f.report_id is null
  and f.client_id = r.client_id
  and f.period_label = r.period_label
  and r.seq = 1;

create index if not exists monthly_reports_client_period_idx on monthly_reports (client_id, period_label);
create index if not exists monthly_filings_report_idx on monthly_filings (report_id);
create index if not exists files_report_idx on files (report_id);

alter table monthly_reports enable row level security;
create policy "authenticated all monthly_reports" on monthly_reports
  for all to authenticated using (true) with check (true);
