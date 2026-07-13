-- Une note de frais peut être rattachée à un chantier.
-- La consultation/gestion des notes d'autres salariés exige à la fois le droit
-- de gestion des notes et le droit de voir les chiffres de l'entreprise.

alter table public.notes_frais
  add column if not exists chantier_id uuid;

alter table public.notes_frais
  drop constraint if exists notes_frais_chantier_entreprise_fkey;
alter table public.notes_frais
  add constraint notes_frais_chantier_entreprise_fkey
  foreign key(chantier_id,entreprise_id)
  references public.chantiers(id,entreprise_id)
  on delete set null(chantier_id);

create index if not exists notes_frais_chantier_idx
  on public.notes_frais(entreprise_id,chantier_id,date_frais desc);

update public.permissions_disponibles
set description='Consulter, valider, refuser et rembourser les notes de frais de l’équipe (avec accès aux chiffres)'
where cle='gerer_notes_frais';

create or replace function public.peut_voir_notes_frais_equipe(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select public.a_permission(p_entreprise_id,'gerer_notes_frais')
     and public.a_permission(p_entreprise_id,'voir_indicateurs_financiers');
$$;

revoke all on function public.peut_voir_notes_frais_equipe(uuid) from public,anon;
grant execute on function public.peut_voir_notes_frais_equipe(uuid) to authenticated;

-- Le mode prototype ne possède aucune identité individuelle : les notes de frais
-- y sont donc fermées plutôt que d'exposer les justificatifs de toute l'équipe.
drop policy if exists "prototype notes frais" on public.notes_frais;
drop policy if exists notes_frais_documents_prototype on storage.objects;
revoke select,insert,update,delete on public.notes_frais from anon;

drop policy if exists notes_frais_select_authenticated on public.notes_frais;
drop policy if exists notes_frais_update_authenticated on public.notes_frais;
drop policy if exists notes_frais_delete_authenticated on public.notes_frais;

create policy notes_frais_select_authenticated on public.notes_frais
for select to authenticated
using(
  public.est_membre_actif(entreprise_id)
  and (
    public.peut_voir_notes_frais_equipe(entreprise_id)
    or (
      public.a_permission(entreprise_id,'saisir_ses_notes_frais')
      and public.est_employe_du_compte(entreprise_id,employe_id)
    )
  )
);

create policy notes_frais_update_authenticated on public.notes_frais
for update to authenticated
using(public.peut_voir_notes_frais_equipe(entreprise_id))
with check(public.peut_voir_notes_frais_equipe(entreprise_id));

create policy notes_frais_delete_authenticated on public.notes_frais
for delete to authenticated
using(public.peut_voir_notes_frais_equipe(entreprise_id));

drop policy if exists notes_frais_documents_select on storage.objects;
drop policy if exists notes_frais_documents_insert on storage.objects;
drop policy if exists notes_frais_documents_update on storage.objects;
drop policy if exists notes_frais_documents_delete on storage.objects;

create policy notes_frais_documents_select on storage.objects
for select to authenticated
using(
  bucket_id='notes-frais'
  and (
    public.peut_voir_notes_frais_equipe(((storage.foldername(name))[1])::uuid)
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
  and public.a_permission(((storage.foldername(name))[1])::uuid,'saisir_ses_notes_frais')
  and public.est_employe_du_compte(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

create policy notes_frais_documents_update on storage.objects
for update to authenticated
using(
  bucket_id='notes-frais'
  and (
    public.peut_voir_notes_frais_equipe(((storage.foldername(name))[1])::uuid)
    or public.est_employe_du_compte(((storage.foldername(name))[1])::uuid,((storage.foldername(name))[2])::uuid)
  )
)
with check(
  bucket_id='notes-frais'
  and (
    public.peut_voir_notes_frais_equipe(((storage.foldername(name))[1])::uuid)
    or public.est_employe_du_compte(((storage.foldername(name))[1])::uuid,((storage.foldername(name))[2])::uuid)
  )
);

create policy notes_frais_documents_delete on storage.objects
for delete to authenticated
using(
  bucket_id='notes-frais'
  and (
    public.peut_voir_notes_frais_equipe(((storage.foldername(name))[1])::uuid)
    or public.est_employe_du_compte(((storage.foldername(name))[1])::uuid,((storage.foldername(name))[2])::uuid)
  )
);

notify pgrst,'reload schema';
