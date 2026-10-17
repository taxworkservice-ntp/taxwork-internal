-- Onboarding polish: company email/phone + company-location map; stop requiring
-- VAT on the public form (staff decides at review). Apply manually (psql/Neon).

alter table public.intake_submissions
  add column if not exists company_email text,
  add column if not exists company_phone text,
  add column if not exists company_map_path text,
  add column if not exists company_map_desc text;

-- VAT is now decided by staff, so it may be "unknown" (null).
alter table public.intake_submissions alter column vat_registered drop not null;
alter table public.intake_submissions alter column vat_registered drop default;
