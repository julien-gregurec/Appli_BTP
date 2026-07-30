-- Phase 1 commercialisation :
-- les politiques Storage de la paie interrogeaient directement la table
-- utilisateurs_entreprises. PostgreSQL peut évaluer toutes les politiques
-- permissives d'une commande, y compris pour un bucket différent ; une simple
-- lecture de storage.objects échouait alors avant le filtrage du bucket.
--
-- Les fonctions a_permission et est_employe_paie_courant sont SECURITY
-- DEFINER, bornées à l'entreprise et déjà utilisées par le module paie. Elles
-- évitent d'accorder un SELECT direct sur la table sensible des appartenances.

drop policy if exists documents_paie_select on storage.objects;
create policy documents_paie_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents-paie'
    and (
      public.a_permission(
        ((storage.foldername(name))[1])::uuid,
        'voir_paie_confidentielle'
      )
      or public.a_permission(
        ((storage.foldername(name))[1])::uuid,
        'gerer_paie'
      )
      or exists (
        select 1
        from public.pieces_jointes_paie pj
        where pj.storage_path = name
          and public.est_employe_paie_courant(
            pj.entreprise_id,
            pj.employe_id
          )
      )
    )
  );

drop policy if exists documents_paie_insert on storage.objects;
create policy documents_paie_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents-paie'
    and public.a_permission(
      ((storage.foldername(name))[1])::uuid,
      'gerer_paie'
    )
  );

drop policy if exists documents_paie_delete on storage.objects;
create policy documents_paie_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents-paie'
    and public.a_permission(
      ((storage.foldername(name))[1])::uuid,
      'gerer_paie'
    )
  );

notify pgrst, 'reload schema';
