-- User-defined payment methods persist as dropdown options for the วิธีชำระ field.

create table if not exists payment_method_presets (
  code text primary key,
  created_at timestamptz not null default now()
);

alter table payment_method_presets enable row level security;

create policy "authenticated all payment_method_presets" on payment_method_presets
  for all to authenticated using (true) with check (true);

-- Seed from every method already used in filings.
insert into payment_method_presets (code)
select distinct trim(payment_method)
from monthly_filings
where payment_method is not null and length(trim(payment_method)) > 0
on conflict do nothing;
