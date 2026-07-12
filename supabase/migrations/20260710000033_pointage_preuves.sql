-- Preuves terrain des pointages : géolocalisation, photo et validation hiérarchique.
alter table public.pointages add column if not exists latitude numeric(9,6);
alter table public.pointages add column if not exists longitude numeric(9,6);
alter table public.pointages add column if not exists precision_metres numeric(8,2);
alter table public.pointages add column if not exists photo_storage_path text;
alter table public.pointages add column if not exists verification_statut text not null default 'sans_preuve';
alter table public.pointages add column if not exists verification_at timestamptz;
alter table public.pointages add column if not exists verification_par uuid references public.utilisateurs(id) on delete set null;
alter table public.pointages add column if not exists commentaire_verification text;
alter table public.pointages drop constraint if exists pointages_verification_statut_check;
alter table public.pointages add constraint pointages_verification_statut_check check(verification_statut in('sans_preuve','a_verifier','valide','rejete'));
alter table public.pointages drop constraint if exists pointages_coordonnees_check;
alter table public.pointages add constraint pointages_coordonnees_check check((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180));

insert into public.permissions_disponibles(cle,module,description) values('valider_pointages','Pointage','Valider ou rejeter les preuves terrain') on conflict(cle) do update set module=excluded.module,description=excluded.description;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise) select entreprise_id,id,'valider_pointages',true from public.postes on conflict do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pointage-preuves','pointage-preuves',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "membres preuves pointage" on storage.objects;
create policy "membres preuves pointage" on storage.objects for all to authenticated
 using(bucket_id='pointage-preuves' and public.est_membre_actif(((storage.foldername(name))[1])::uuid))
 with check(bucket_id='pointage-preuves' and public.est_membre_actif(((storage.foldername(name))[1])::uuid));
drop policy if exists "prototype preuves pointage" on storage.objects;
create policy "prototype preuves pointage" on storage.objects for all to anon using(bucket_id='pointage-preuves') with check(bucket_id='pointage-preuves');
grant select,insert,update,delete on storage.objects to anon,authenticated;

create or replace function public.valider_preuve_pointage(p_entreprise_id uuid,p_pointage_id uuid,p_statut text,p_commentaire text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_autorise boolean;
begin
 if p_statut not in('valide','rejete') then raise exception 'Statut invalide';end if;
 select auth.role()='anon' or exists(select 1 from public.utilisateurs_entreprises ue join public.permissions_poste pp on pp.entreprise_id=ue.entreprise_id and pp.poste_id=ue.poste_id and pp.cle_permission='valider_pointages' and pp.autorise where ue.utilisateur_id=auth.uid() and ue.entreprise_id=p_entreprise_id and ue.statut='actif') into v_autorise;
 if not v_autorise then raise exception 'Accès refusé';end if;
 update public.pointages set verification_statut=p_statut,verification_at=now(),verification_par=case when auth.role()='anon' then null else auth.uid() end,commentaire_verification=nullif(trim(p_commentaire),'') where id=p_pointage_id and entreprise_id=p_entreprise_id and photo_storage_path is not null;
 if not found then raise exception 'Pointage avec preuve introuvable';end if;
end;$$;
revoke all on function public.valider_preuve_pointage(uuid,uuid,text,text) from public;
grant execute on function public.valider_preuve_pointage(uuid,uuid,text,text) to anon,authenticated;
notify pgrst,'reload schema';
