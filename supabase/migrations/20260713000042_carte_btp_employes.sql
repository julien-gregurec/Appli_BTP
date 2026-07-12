-- Carte d'identification professionnelle BTP numérisée par employé.
alter table public.employes add column if not exists carte_btp_storage_path text;
alter table public.employes add column if not exists carte_btp_nom text;
alter table public.employes add column if not exists carte_btp_mime_type text;
alter table public.employes add column if not exists carte_btp_taille_octets bigint;
alter table public.employes add column if not exists carte_btp_numero text;
alter table public.employes add column if not exists carte_btp_expiration date;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents-employes','documents-employes',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "membres documents employés" on storage.objects;
create policy "membres documents employés" on storage.objects for all to authenticated
using(bucket_id='documents-employes' and public.est_membre_actif(((storage.foldername(name))[1])::uuid))
with check(bucket_id='documents-employes' and public.est_membre_actif(((storage.foldername(name))[1])::uuid));
drop policy if exists "prototype documents employés" on storage.objects;
create policy "prototype documents employés" on storage.objects for all to anon using(bucket_id='documents-employes') with check(bucket_id='documents-employes');
grant select,insert,update,delete on storage.objects to anon,authenticated;
notify pgrst,'reload schema';
