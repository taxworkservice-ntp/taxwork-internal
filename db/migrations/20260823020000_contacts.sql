create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  firm text,
  type text not null default 'accountant' check (type in ('auditor', 'accountant', 'both')),
  tax_id text,
  license_no text,
  phone text,
  email text,
  line_id text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "authenticated full access contacts" on public.contacts
  for all to authenticated using (true) with check (true);
