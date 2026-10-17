-- Registration reframe: the 13-digit ID is issued by DBD *after* filing, so staff
-- fill it back manually once available. Apply manually (psql / Neon SQL editor).

alter table public.intake_submissions
  add column if not exists tax_id_issued text;
