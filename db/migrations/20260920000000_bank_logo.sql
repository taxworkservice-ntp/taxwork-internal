-- Optional bank logo shown after the payment-method text in the report.
alter table bank_accounts
  add column if not exists logo_path text,
  add column if not exists logo_mime_type text;
