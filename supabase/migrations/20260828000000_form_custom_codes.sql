-- User-defined form codes persist as dropdown options for the แบบฟอร์ม field.

create table if not exists form_custom_codes (
  code text primary key,
  created_at timestamptz not null default now()
);

alter table form_custom_codes enable row level security;

create policy "authenticated all form_custom_codes" on form_custom_codes
  for all to authenticated using (true) with check (true);

-- Seed from every code already used in filings.
insert into form_custom_codes (code)
select distinct trim(form_code)
from monthly_filings
where length(trim(form_code)) > 0
on conflict do nothing;
