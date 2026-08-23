-- Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  email text,
  phone text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

-- Stored credentials (e-filing portals etc.)
create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text not null,
  username text,
  password text,
  portal_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- Uploaded files metadata (actual bytes live in Storage)
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  mime_type text,
  category text,
  uploaded_at timestamptz not null default now()
);

-- Recurring task templates
create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  client_id uuid references public.clients(id) on delete cascade,
  frequency text not null check (frequency in ('monthly', 'quarterly', 'annual')),
  day_of_period int not null default 15 check (day_of_period between 1 and 31),
  months int[] not null default '{1,2,3,4,5,6,7,8,9,10,11,12}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Generated task instances
create table if not exists public.task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  period_label text not null,
  due_date date not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, period_label)
);

create index if not exists idx_credentials_client on public.credentials(client_id);
create index if not exists idx_files_client on public.files(client_id);
create index if not exists idx_task_instances_due on public.task_instances(due_date);
create index if not exists idx_clients_status on public.clients(status);

-- RLS: only authenticated users can touch anything
alter table public.clients enable row level security;
alter table public.credentials enable row level security;
alter table public.files enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_instances enable row level security;

create policy "authenticated full access clients" on public.clients
  for all to authenticated using (true) with check (true);
create policy "authenticated full access credentials" on public.credentials
  for all to authenticated using (true) with check (true);
create policy "authenticated full access files" on public.files
  for all to authenticated using (true) with check (true);
create policy "authenticated full access templates" on public.task_templates
  for all to authenticated using (true) with check (true);
create policy "authenticated full access instances" on public.task_instances
  for all to authenticated using (true) with check (true);
