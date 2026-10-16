-- Phase 3: capture the prospect's signature + signer name on the intake form.
-- The drawn signature image is stored in R2 (path) with a server-set timestamp
-- and IP for a light audit trail. Apply manually (psql / Neon SQL editor).

alter table public.intake_submissions
  add column if not exists signer_name text,
  add column if not exists signature_path text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_ip text;
