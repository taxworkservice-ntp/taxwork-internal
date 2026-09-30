-- WHT export history: form-value snapshots so past certificates can be
-- edited or copied into new ones. Bytes stay in R2 under the files row;
-- signature uploads are NOT snapshotted (re-upload or re-type on reuse).
-- Apply manually via psql or the Neon SQL editor (see MASTER.md §10).
create table if not exists public.wht_history (
  id uuid primary key default gen_random_uuid(),
  form_type text not null default 'pnd3',
  certificate_no text not null default '',
  payer_name text not null default '',
  payer_tax_id text not null default '',
  payer_address text not null default '',
  payee_name text not null default '',
  payee_tax_id text not null default '',
  payee_address text not null default '',
  description text not null default '',
  issue_date text not null default '',
  amount text not null default '',
  wht_rate text not null default '',
  signature_text text not null default '',
  file_id uuid references public.files(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wht_history_created on public.wht_history(created_at desc);

alter table public.wht_history enable row level security;

drop policy if exists "authenticated full access wht_history" on public.wht_history;
create policy "authenticated full access wht_history" on public.wht_history
  for all to authenticated using (true) with check (true);
