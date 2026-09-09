create table if not exists public.shareholders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  tax_id text,
  email text,
  phone text,
  address text,
  shares numeric,
  is_director boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.shareholders enable row level security;

create policy "authenticated full access shareholders" on public.shareholders
  for all to authenticated using (true) with check (true);

create index if not exists idx_shareholders_client on public.shareholders(client_id);
