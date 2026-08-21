-- Storage: buckety a RLS policies.
-- Do baseline se nedostaly (pg_dump --schema public storage nezahrnuje).
-- Idempotentní - lze pustit opakovaně.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg','image/png','image/gif','image/webp']),
  ('recipe-images', 'recipe-images', true, 5242880,
   array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- avatars: verejne cteni, zapis jen do vlastni slozky (prefix = auth.uid())
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_authenticated_upload on storage.objects;
create policy avatars_authenticated_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists avatars_own_update_delete on storage.objects;
create policy avatars_own_update_delete on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  )
  with check (bucket_id = 'avatars');

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- recipe-images: verejne cteni, zapis jen service_role
drop policy if exists recipe_images_public_read on storage.objects;
create policy recipe_images_public_read on storage.objects
  for select to public
  using (bucket_id = 'recipe-images');

drop policy if exists recipe_images_service_all on storage.objects;
create policy recipe_images_service_all on storage.objects
  for all to service_role
  using (bucket_id = 'recipe-images')
  with check (bucket_id = 'recipe-images');
