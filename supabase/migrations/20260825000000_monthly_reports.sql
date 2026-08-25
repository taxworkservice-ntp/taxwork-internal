-- Monthly report feature: filings per client/period, attachments (slip/QR/docs), bank accounts for service-fee invoices.

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  bank_name text not null,
  account_no text not null,
  account_name text not null,
  promptpay_id text,
  created_at timestamptz not null default now()
);

create table monthly_filings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  period_label text not null,
  form_code text not null default '',
  description text,
  amount numeric(12, 2) not null default 0,
  due_date date,
  bank_account_id uuid references bank_accounts(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table filing_attachments (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null references monthly_filings(id) on delete cascade,
  kind text not null check (kind in ('slip', 'qr', 'document')),
  storage_path text not null,
  file_name text not null,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create index monthly_filings_client_period_idx on monthly_filings (client_id, period_label);
create index filing_attachments_filing_idx on filing_attachments (filing_id);

alter table bank_accounts enable row level security;
alter table monthly_filings enable row level security;
alter table filing_attachments enable row level security;

create policy "authenticated all bank_accounts" on bank_accounts
  for all to authenticated using (true) with check (true);
create policy "authenticated all monthly_filings" on monthly_filings
  for all to authenticated using (true) with check (true);
create policy "authenticated all filing_attachments" on filing_attachments
  for all to authenticated using (true) with check (true);
