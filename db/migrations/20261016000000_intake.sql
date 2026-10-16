-- Client intake / onboarding: a staff-generated, tokenized public form where a
-- prospect submits their company registration details + supporting documents.
-- Nothing touches `clients` until staff approve a submission. Apply manually
-- via psql or the Neon SQL editor (see MASTER.md §10).

create table if not exists public.intake_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.intake_links(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  entity_type text not null default 'บริษัทจำกัด',
  name_th text not null,
  name_en text,
  name_th2 text,
  name_en2 text,
  juristic_id text not null,
  reg_date date,
  capital_registered numeric,
  capital_paid numeric,
  business_desc text,
  addr_line text,
  addr_moo text,
  addr_soi text,
  addr_road text,
  addr_subdistrict text,
  addr_district text,
  addr_province text,
  addr_postcode text,
  company_house_path text,
  vat_registered boolean not null default false,
  vat_reg_date date,
  vat_place text,
  fiscal_year_end text,
  filings text[] not null default '{}',
  has_prev_accountant boolean,
  prev_accountant text,
  contact_name text not null,
  contact_position text,
  contact_phone text not null,
  contact_email text not null,
  shareholders jsonb not null default '[]'::jsonb,
  consent_at timestamptz,
  consent_version text,
  notes text,
  raw jsonb,
  client_id uuid references public.clients(id) on delete set null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists intake_submissions_link_idx on public.intake_submissions (link_id);
create index if not exists intake_submissions_status_idx on public.intake_submissions (status);

alter table public.intake_links enable row level security;
alter table public.intake_submissions enable row level security;

-- Plain Neon has no `authenticated` role, so guard the permissive policy.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists "authenticated full access intake_links" on public.intake_links;
    create policy "authenticated full access intake_links" on public.intake_links
      for all to authenticated using (true) with check (true);
    drop policy if exists "authenticated full access intake_submissions" on public.intake_submissions;
    create policy "authenticated full access intake_submissions" on public.intake_submissions
      for all to authenticated using (true) with check (true);
  end if;
end $$;
