-- Chaque salarié soumet uniquement ses propres notes de frais.
-- Les responsables disposant du droit dédié peuvent ensuite les valider,
-- refuser, rembourser et consulter les justificatifs de l'équipe.

insert into public.permissions_disponibles(cle,module,description)
values
  ('saisir_ses_notes_frais','Notes de frais','Créer et consulter uniquement ses propres notes de frais'),
  ('gerer_notes_frais','Notes de frais','Consulter, valider, refuser et rembourser les notes de frais de l’équipe')
on conflict(cle) do update
set module=excluded.module,description=excluded.description;

-- Tout poste peut déposer ses propres frais.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'saisir_ses_notes_frais',true
from public.postes p
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

-- Les postes qui géraient déjà les achats deviennent gestionnaires des notes.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select pp.entreprise_id,pp.poste_id,'gerer_notes_frais',true
from public.permissions_poste pp
where pp.cle_permission='gerer_achats' and pp.autorise
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

alter table public.notes_frais
  add column if not exists cree_par_utilisateur_id uuid
    references public.utilisateurs(id) on delete set null;

create or replace function public.est_employe_du_compte(
  p_entreprise_id uuid,
  p_employe_id uuid
)
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select auth.role()='anon' or exists(
    select 1
    from public.employes e
    where e.id=p_employe_id
      and e.entreprise_id=p_entreprise_id
      and e.utilisateur_id=auth.uid()
      and e.statut not in ('sorti','suspendu')
  );
$$;

revoke all on function public.est_employe_du_compte(uuid,uuid) from public,anon;
grant execute on function public.est_employe_du_compte(uuid,uuid) to authenticated;

drop policy if exists "membres notes frais" on public.notes_frais;
drop policy if exists notes_frais_select_authenticated on public.notes_frais;
drop policy if exists notes_frais_insert_authenticated on public.notes_frais;
drop policy if exists notes_frais_update_authenticated on public.notes_frais;
drop policy if exists notes_frais_delete_authenticated on public.notes_frais;

create policy notes_frais_select_authenticated on public.notes_frais
for select to authenticated
using(
  public.est_membre_actif(entreprise_id)
  and (
    public.a_permission(entreprise_id,'gerer_notes_frais')
    or (
      public.a_permission(entreprise_id,'saisir_ses_notes_frais')
      and public.est_employe_du_compte(entreprise_id,employe_id)
    )
  )
);

create policy notes_frais_insert_authenticated on public.notes_frais
for insert to authenticated
with check(
  public.est_membre_actif(entreprise_id)
  and public.a_permission(entreprise_id,'saisir_ses_notes_frais')
  and public.est_employe_du_compte(entreprise_id,employe_id)
  and cree_par_utilisateur_id=auth.uid()
);

create policy notes_frais_update_authenticated on public.notes_frais
for update to authenticated
using(public.a_permission(entreprise_id,'gerer_notes_frais'))
with check(public.a_permission(entreprise_id,'gerer_notes_frais'));

create policy notes_frais_delete_authenticated on public.notes_frais
for delete to authenticated
using(public.a_permission(entreprise_id,'gerer_notes_frais'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'notes-frais','notes-frais',false,10485760,
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists notes_frais_documents_select on storage.objects;
drop policy if exists notes_frais_documents_insert on storage.objects;
drop policy if exists notes_frais_documents_update on storage.objects;
drop policy if exists notes_frais_documents_delete on storage.objects;
drop policy if exists notes_frais_documents_prototype on storage.objects;

create policy notes_frais_documents_select on storage.objects
for select to authenticated
using(
  bucket_id='notes-frais'
  and (
    public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_notes_frais')
    or (
      public.a_permission(((storage.foldername(name))[1])::uuid,'saisir_ses_notes_frais')
      and public.est_employe_du_compte(
        ((storage.foldername(name))[1])::uuid,
        ((storage.foldername(name))[2])::uuid
      )
    )
  )
);

create policy notes_frais_documents_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='notes-frais'
  and (
    public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_notes_frais')
    or (
      public.a_permission(((storage.foldername(name))[1])::uuid,'saisir_ses_notes_frais')
      and public.est_employe_du_compte(
        ((storage.foldername(name))[1])::uuid,
        ((storage.foldername(name))[2])::uuid
      )
    )
  )
);

create policy notes_frais_documents_update on storage.objects
for update to authenticated
using(
  bucket_id='notes-frais'
  and (
    public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_notes_frais')
    or public.est_employe_du_compte(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  )
)
with check(
  bucket_id='notes-frais'
  and (
    public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_notes_frais')
    or public.est_employe_du_compte(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  )
);

create policy notes_frais_documents_delete on storage.objects
for delete to authenticated
using(
  bucket_id='notes-frais'
  and (
    public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_notes_frais')
    or public.est_employe_du_compte(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  )
);

create policy notes_frais_documents_prototype on storage.objects
for all to anon
using(bucket_id='notes-frais')
with check(bucket_id='notes-frais');

grant select,insert,update,delete on storage.objects to anon,authenticated;
notify pgrst,'reload schema';
