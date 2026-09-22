-- Free-form note attached to an uploaded file. The dropdown of choices is
-- derived from the distinct values already stored here, so no lookup table is
-- needed.
alter table public.files add column if not exists note text;
