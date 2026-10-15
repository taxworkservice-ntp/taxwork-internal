-- Firm contact details shown in the report email footer (and reusable
-- elsewhere). All optional; null hides the corresponding line.
-- Apply manually via psql or the Neon SQL editor (see MASTER.md §10).

alter table app_settings
  add column if not exists firm_phone text,
  add column if not exists firm_line text,
  add column if not exists firm_address text;
