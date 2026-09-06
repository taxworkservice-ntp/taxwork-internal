create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  note_type text not null default 'general' check (note_type in ('general', 'call', 'meeting', 'follow_up')),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_notes_client_updated
  on public.client_notes(client_id, updated_at desc);

alter table public.client_notes enable row level security;

create policy "authenticated full access client notes" on public.client_notes
  for all to authenticated using (true) with check (true);
