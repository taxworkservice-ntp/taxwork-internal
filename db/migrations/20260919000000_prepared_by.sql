-- Dedicated "prepared by" name shown in the report cover meta grid.
-- Falls back to firm_name when empty.

alter table app_settings
  add column if not exists prepared_by text;
