-- Synchronisation dépenses / véhicules / outils / employés et justificatifs numérisés.
alter table public.vehicules add column if not exists employe_id uuid;
alter table public.vehicules add constraint vehicules_employe_entreprise_fk foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete set null(employe_id);
alter table public.depenses_fournisseurs add column if not exists vehicule_id uuid;
alter table public.depenses_fournisseurs add column if not exists outil_id uuid;
alter table public.depenses_fournisseurs add column if not exists employe_id uuid;
alter table public.depenses_fournisseurs add column if not exists justificatif_storage_path text;
alter table public.depenses_fournisseurs add column if not exists justificatif_nom text;
alter table public.depenses_fournisseurs add column if not exists justificatif_mime_type text;
alter table public.depenses_fournisseurs add column if not exists justificatif_taille_octets bigint;
alter table public.depenses_fournisseurs add constraint depenses_vehicule_entreprise_fk foreign key(vehicule_id,entreprise_id) references public.vehicules(id,entreprise_id) on delete set null(vehicule_id);
alter table public.depenses_fournisseurs add constraint depenses_outil_entreprise_fk foreign key(outil_id,entreprise_id) references public.outils(id,entreprise_id) on delete set null(outil_id);
alter table public.depenses_fournisseurs add constraint depenses_employe_entreprise_fk foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete set null(employe_id);
alter table public.depenses_fournisseurs add constraint depenses_un_seul_actif_check check(num_nonnulls(vehicule_id,outil_id)<=1);

create or replace function public.trg_synchroniser_depense_actif() returns trigger language plpgsql set search_path=public as $$
declare v_emp uuid;
begin
 if new.vehicule_id is not null then select employe_id into v_emp from public.vehicules where id=new.vehicule_id and entreprise_id=new.entreprise_id;if not found then raise exception 'Véhicule invalide';end if;end if;
 if new.outil_id is not null then select employe_id into v_emp from public.outils where id=new.outil_id and entreprise_id=new.entreprise_id;if not found then raise exception 'Outil invalide';end if;end if;
 if new.employe_id is null then new.employe_id:=v_emp;end if;
 return new;
end;$$;
create trigger synchroniser_depense_actif before insert or update of entreprise_id,vehicule_id,outil_id,employe_id on public.depenses_fournisseurs for each row execute function public.trg_synchroniser_depense_actif();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('factures-fournisseurs','factures-fournisseurs',false,20971520,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "membres factures fournisseurs" on storage.objects;
create policy "membres factures fournisseurs" on storage.objects for all to authenticated using(bucket_id='factures-fournisseurs' and public.est_membre_actif(((storage.foldername(name))[1])::uuid)) with check(bucket_id='factures-fournisseurs' and public.est_membre_actif(((storage.foldername(name))[1])::uuid));
drop policy if exists "prototype factures fournisseurs" on storage.objects;
create policy "prototype factures fournisseurs" on storage.objects for all to anon using(bucket_id='factures-fournisseurs') with check(bucket_id='factures-fournisseurs');
grant select,insert,update,delete on storage.objects to anon,authenticated;

create or replace function public.lier_justificatif_depense(p_entreprise_id uuid,p_depense_id uuid,p_path text,p_nom text,p_mime text,p_taille bigint)
returns text language plpgsql security definer set search_path=public as $$
declare v_ancien text;
begin if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
 update public.depenses_fournisseurs set justificatif_storage_path=p_path,justificatif_nom=p_nom,justificatif_mime_type=p_mime,justificatif_taille_octets=p_taille,updated_at=now() where id=p_depense_id and entreprise_id=p_entreprise_id returning justificatif_storage_path into v_ancien;
 if not found then raise exception 'Dépense introuvable';end if;return v_ancien;end;$$;
revoke all on function public.lier_justificatif_depense(uuid,uuid,text,text,text,bigint) from public;
grant execute on function public.lier_justificatif_depense(uuid,uuid,text,text,text,bigint) to anon,authenticated;
revoke all on function public.trg_synchroniser_depense_actif() from public,anon,authenticated;
notify pgrst,'reload schema';
