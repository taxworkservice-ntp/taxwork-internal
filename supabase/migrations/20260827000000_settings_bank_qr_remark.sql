-- Company settings (logo watermark), bank-account QR images, filing remarks.

create table app_settings (
  id int primary key default 1 check (id = 1),
  company_logo_path text,
  company_logo_file_name text,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;
create policy "authenticated all app_settings" on app_settings
  for all to authenticated using (true) with check (true);

alter table bank_accounts
  add column if not exists qr_path text,
  add column if not exists qr_mime_type text;

alter table monthly_filings
  add column if not exists remark text;
