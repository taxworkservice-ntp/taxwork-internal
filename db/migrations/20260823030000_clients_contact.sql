alter table public.clients
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;
