-- ELSATIA — Security Residual V2 : retrait de la clause « entreprise sans membres »
-- des policies RLS du socle comptes (train canonique V9).
--
-- Portage sémantique du point RT-02 de la red team V1 (claude/ecstatic-fermat-bcqats
-- @ 375b35dd, migration d'origine 20260928000184 basée sur main : NON reprise telle
-- quelle). Les points RT-04 (search_path de entreprise_sans_membres) et RT-05 (RLS de
-- compteurs_reference) sont déjà couverts en V8 (20260729000185) ; ils ne sont pas
-- rejoués ici.
--
-- Défaut (reproduit sur V8 + 813 + 901, docs/qualification/
-- ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md §4) : cinq policies PERMISSIVE
-- OR-aient public.entreprise_sans_membres(entreprise_id). Pour une entreprise sans
-- aucune ligne d'appartenance (entreprise créée par la plateforme en attente de son
-- dirigeant, ou tenant abandonné), TOUT utilisateur authentifié :
--   * lit ses postes et sa matrice de permissions (constaté : 10 postes, 903 lignes) ;
--   * passe le filtre permissif en écriture sur postes / permissions_poste et en
--     insertion sur utilisateurs_entreprises (auto-rattachement). En V8, l'écriture
--     est arrêtée par les seules policies RESTRICTIVE role_gestion_* (lot Employés,
--     a_permission(…, 'gerer_utilisateurs')) : la clause reste fail-open, la sécurité
--     ne tenait qu'à une seconde barrière.
--
-- Aucun parcours légitime ne dépend de la clause côté RLS : la création d'entreprise
-- (creer_entreprise_bootstrap, creer_entreprise_avec_acceptation,
-- plateforme_creer_entreprise), l'adhésion par code (rejoindre_entreprise_par_code)
-- et le rattachement d'un administrateur par la plateforme (plateforme_rattacher_admin)
-- sont SECURITY DEFINER et ne passent pas par ces policies.
--
-- Correctif : chaque policy garde EXACTEMENT son prédicat V8 de membre
-- (est_membre_actif ou est_membre_actif_reel, Billing 0803 / Per-App 0804 / support
-- 0309), sans la clause. La policy d'insertion est renommée : elle n'a plus de rôle
-- de « bootstrap ». entreprise_sans_membres() est conservée (fonction de socle, son
-- search_path et ses droits restent ceux de V8). Aucune donnée, aucun grant modifiés.

drop policy if exists "membres voient les postes" on public.postes;
create policy "membres voient les postes" on public.postes
  for select using (public.est_membre_actif(entreprise_id));

drop policy if exists "membres gèrent les postes" on public.postes;
create policy "membres gèrent les postes" on public.postes
  for all using (public.est_membre_actif(entreprise_id));

drop policy if exists "membres voient les permissions" on public.permissions_poste;
create policy "membres voient les permissions" on public.permissions_poste
  for select using (public.est_membre_actif(entreprise_id));

drop policy if exists "membres gèrent les permissions" on public.permissions_poste;
create policy "membres gèrent les permissions" on public.permissions_poste
  for all using (public.est_membre_actif_reel(entreprise_id));

drop policy if exists "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises;
drop policy if exists "invitation par un membre actif" on public.utilisateurs_entreprises;
create policy "invitation par un membre actif" on public.utilisateurs_entreprises
  for insert with check (public.est_membre_actif_reel(entreprise_id));

notify pgrst, 'reload schema';
