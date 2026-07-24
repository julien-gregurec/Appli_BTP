-- Rétablit les opérations de gestion supprimées lors du durcissement de la
-- lecture des documents chantier (migration 81).
--
-- La lecture reste filtrée par peut_voir_document_chantier(). Les écritures
-- sont réservées aux membres actifs disposant du droit gerer_chantiers.

drop policy if exists documents_chantier_ajout on public.documents_chantier;
create policy documents_chantier_ajout
  on public.documents_chantier
  for insert
  to authenticated
  with check (
    public.est_membre_actif(entreprise_id)
    and public.a_permission(entreprise_id, 'gerer_chantiers')
  );

drop policy if exists documents_chantier_modification on public.documents_chantier;
create policy documents_chantier_modification
  on public.documents_chantier
  for update
  to authenticated
  using (
    public.est_membre_actif(entreprise_id)
    and public.a_permission(entreprise_id, 'gerer_chantiers')
  )
  with check (
    public.est_membre_actif(entreprise_id)
    and public.a_permission(entreprise_id, 'gerer_chantiers')
  );

drop policy if exists documents_chantier_suppression on public.documents_chantier;
create policy documents_chantier_suppression
  on public.documents_chantier
  for delete
  to authenticated
  using (
    public.est_membre_actif(entreprise_id)
    and public.a_permission(entreprise_id, 'gerer_chantiers')
  );

notify pgrst, 'reload schema';
