-- Logos d'entreprise publics (nécessaires dans l'application et les documents imprimables).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('entreprise-assets','entreprise-assets',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "logos publics" on storage.objects;
create policy "logos publics" on storage.objects for select using(bucket_id='entreprise-assets');
drop policy if exists "membres gerent logo entreprise" on storage.objects;
create policy "membres gerent logo entreprise" on storage.objects for all to authenticated
 using(bucket_id='entreprise-assets' and public.est_membre_actif(((storage.foldername(name))[1])::uuid))
 with check(bucket_id='entreprise-assets' and public.est_membre_actif(((storage.foldername(name))[1])::uuid));
drop policy if exists "prototype gere logos" on storage.objects;
create policy "prototype gere logos" on storage.objects for all to anon
 using(bucket_id='entreprise-assets') with check(bucket_id='entreprise-assets');
grant select,insert,update,delete on storage.objects to anon,authenticated;
notify pgrst,'reload schema';
