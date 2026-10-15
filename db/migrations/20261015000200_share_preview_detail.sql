-- Controls how much report detail is exposed in the public link preview
-- (LINE/social). One of: none | period | client | amount (cumulative).
-- Default 'amount' preserves the rich preview; lower it to hide details.
-- Apply manually via psql or the Neon SQL editor (see MASTER.md §10).

alter table app_settings
  add column if not exists share_preview_detail text not null default 'amount';
