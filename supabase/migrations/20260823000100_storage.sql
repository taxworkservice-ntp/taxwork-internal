insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

create policy "authenticated read client-files" on storage.objects
  for select to authenticated
  using (bucket_id = 'client-files');

create policy "authenticated insert client-files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'client-files');

create policy "authenticated update client-files" on storage.objects
  for update to authenticated
  using (bucket_id = 'client-files');

create policy "authenticated delete client-files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'client-files');
