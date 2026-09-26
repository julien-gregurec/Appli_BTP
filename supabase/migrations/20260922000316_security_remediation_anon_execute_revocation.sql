-- ELSATIA-SECURITY-BLOCKERS-REMEDIATION-V1 — révoque deux privilèges EXECUTE
-- involontaires accordés à `anon`, détectés par
-- `supabase/tests/isolation_multitenant_surface.test.sql` (assertion « Aucune
-- fonction SECURITY DEFINER métier n'est exécutable par anon », hors les deux
-- exceptions documentées et nommément exclues : `document_commercial_par_token`
-- et `reserves_invitation_consulter`).
--
-- Constat (vérifié directement sur une base fraîche) : `public.entreprises`,
-- `public.utilisateurs_entreprises` et `public.permissions_poste` n'ont AUCUN
-- grant `anon` (seuls 4 catalogues tarifaires publics en ont un, en lecture
-- seule — cf. PRODUCTION_CHECKLIST.md). `anon` ne peut donc jamais atteindre
-- ces tables directement. Mais les deux fonctions ci-dessous sont `SECURITY
-- DEFINER` (elles contournent RLS) et leur ACL est restée au défaut Postgres
-- (`GRANT EXECUTE ... TO PUBLIC` implicite, jamais révoqué) — contrairement à
-- la convention explicite déjà suivie ailleurs dans ce dépôt pour toute
-- fonction SECURITY DEFINER volontairement publique (ex.
-- `document_commercial_par_token`, `document_commercial_public_par_token`,
-- qui font toutes deux un `revoke ... from public` explicite avant un `grant`
-- ciblé). Aucun appelant, application ou base, n'utilise ces deux fonctions
-- autrement qu'en interne (trigger/RLS, tous deux déjà `SECURITY DEFINER`
-- propriétaire `postgres`, donc jamais dépendants d'un grant `anon`/PUBLIC) —
-- confirmé par recherche exhaustive dans `src/` et `supabase/`.
--
-- 1. `construire_entreprise_snapshot(uuid)` — projection jsonb complète d'une
--    fiche entreprise (nom, raison sociale, SIRET, adresse, numéros
--    d'assurance décennale/RC pro). Exposée à `anon` sans aucun contrôle
--    d'appartenance interne : un appelant anonyme pouvait lire ces données
--    pour N'IMPORTE QUEL `entreprise_id`, par simple appel RPC PostgREST.
--    Fuite d'information cross-tenant réelle si exposée via l'API REST.
--    Seuls appelants réels : le trigger `capturer_entreprise_snapshot_devis`
--    (SECURITY DEFINER, propriétaire postgres) et un UPDATE de rétro-remplissage
--    exécuté par la migration elle-même (rôle propriétaire) — aucun des deux
--    ne nécessite de grant PUBLIC/anon.
-- 2. `est_membre_actif_reel(uuid)` — vérifie `auth.uid()` en interne : un appel
--    anonyme (`auth.uid()` NULL) renvoie toujours `false`, donc aucune fuite de
--    données réelle par cette voie précise aujourd'hui. Exposition non
--    nécessaire tout de même : utilisée uniquement à l'intérieur de policies
--    RLS sur `utilisateurs_entreprises`/`permissions_poste`, réservées au rôle
--    `authenticated` (`anon` n'a aucun grant table sur ces deux tables, donc
--    n'atteint jamais ces policies). Seul `authenticated` a besoin d'un accès
--    direct à cette fonction pour que ses propres requêtes RLS s'évaluent.
--
-- Durcissement minimal : révoque le grant PUBLIC implicite sur les deux, sans
-- toucher au corps des fonctions ni à leur usage interne existant.

revoke execute on function public.construire_entreprise_snapshot(uuid) from public;

revoke execute on function public.est_membre_actif_reel(uuid) from public;
grant execute on function public.est_membre_actif_reel(uuid) to authenticated;

notify pgrst, 'reload schema';
