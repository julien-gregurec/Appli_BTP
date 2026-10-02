-- Création et modification de chantier impossibles pour tous les rôles.
--
-- La migration 20260715000081 a supprimé la politique permissive
-- « membres accèdent aux chantiers » (FOR ALL) pour restreindre la lecture.
-- Les écritures ne reposaient alors plus que sur les politiques RESTRICTIVES
-- role_gestion_insert/update/delete. PostgreSQL refuse toute commande qui n'a
-- aucune politique permissive : « new row violates row-level security policy
-- for table chantiers », y compris pour le gérant.
--
-- On rétablit une base permissive limitée aux membres actifs de l'entreprise,
-- uniquement pour l'écriture. Les politiques restrictives existantes exigent
-- toujours gerer_chantiers ; la lecture reste régie par
-- chantiers_lecture_selon_droits et lecture_chantiers_selon_permission.

drop policy if exists chantiers_ecriture_membres_insert on public.chantiers;
create policy chantiers_ecriture_membres_insert on public.chantiers
  for insert to authenticated
  with check (public.est_membre_actif(entreprise_id));

drop policy if exists chantiers_ecriture_membres_update on public.chantiers;
create policy chantiers_ecriture_membres_update on public.chantiers
  for update to authenticated
  using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

drop policy if exists chantiers_ecriture_membres_delete on public.chantiers;
create policy chantiers_ecriture_membres_delete on public.chantiers
  for delete to authenticated
  using (public.est_membre_actif(entreprise_id));
