alter table public.files
  add column if not exists uploaded_by text;
