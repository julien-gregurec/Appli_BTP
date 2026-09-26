-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 : les 4 RPC de liste/recherche
-- (devis_liste_paginee, factures_liste_paginee, clients_liste_paginee,
-- chantiers_liste_paginee) sont SECURITY DEFINER, possédées par le rôle
-- migrateur — dans l'environnement réel (voir § environnement du rapport de
-- mission : la migration 20260908000275 pose `force row level security`
-- sur une table sans policy INSERT et y insère directement, ce qui exige
-- structurellement que ce rôle ait `bypassrls`), elles CONTOURNENT donc la
-- RLS de `devis`/`factures`/`clients`/`chantiers`. Leur seule protection
-- de cloisonnement est alors la vérification manuelle
-- `a_permission(p_entreprise_id, ...)` en tête de fonction — jamais testée
-- explicitement jusqu'ici (aucun test existant pour ces 4 RPC malgré leur
-- usage sur les 4 pages de liste principales de l'application).
--
-- Ce test verrouille cette propriété : un utilisateur de l'entreprise A ne
-- peut, par aucun de ces 4 chemins, obtenir une ligne de l'entreprise B —
-- ni en passant le bon p_entreprise_id (rejeté explicitement), ni via une
-- recherche assez large pour matcher les données B (le filtre
-- entreprise_id du corps de la fonction les exclut avant tout).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir fixtures/isolation_multitenant.inc

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1-4. p_entreprise_id = B depuis un contexte utilisateur A : rejeté par
-- chacune des 4 RPC, jamais un résultat vide silencieux (un `Accès refusé`
-- explicite est plus sûr qu'un total à 0 qui masquerait un bug de filtre).
select throws_like(
  $$select public.devis_liste_paginee('b0000000-0000-0000-0000-000000000001', '', '', 1, 25)$$,
  'Accès refusé', '1. devis_liste_paginee(entreprise B) refusé pour un utilisateur A'
);
select throws_like(
  $$select public.factures_liste_paginee('b0000000-0000-0000-0000-000000000001', '', '', 1, 25)$$,
  'Accès refusé', '2. factures_liste_paginee(entreprise B) refusé pour un utilisateur A'
);
select throws_like(
  $$select public.clients_liste_paginee('b0000000-0000-0000-0000-000000000001', '', '', '', 1, 25)$$,
  'Accès refusé', '3. clients_liste_paginee(entreprise B) refusé pour un utilisateur A'
);
select throws_like(
  $$select public.chantiers_liste_paginee('b0000000-0000-0000-0000-000000000001', '', '', 1, 25)$$,
  'Accès refusé', '4. chantiers_liste_paginee(entreprise B) refusé pour un utilisateur A'
);

-- 5-8. Avec le bon p_entreprise_id (A) mais une recherche qui matcherait
-- les données B si le filtre entreprise_id de la fonction était absent :
-- toujours 0 résultat, jamais de fuite cross-tenant par la recherche.
select is(
  (select (public.devis_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_B', '', 1, 25))->>'total')::int,
  0, '5. Recherche "TEST_B" depuis le contexte A (devis) : 0 résultat'
);
select is(
  (select (public.factures_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_B', '', 1, 25))->>'total')::int,
  0, '6. Recherche "TEST_B" depuis le contexte A (factures) : 0 résultat'
);
select is(
  (select (public.clients_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_B', '', '', 1, 25))->>'total')::int,
  0, '7. Recherche "TEST_B" depuis le contexte A (clients) : 0 résultat'
);
select is(
  (select (public.chantiers_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_B', '', 1, 25))->>'total')::int,
  0, '8. Recherche "TEST_B" depuis le contexte A (chantiers) : 0 résultat'
);

-- 9-12. À l'inverse, la recherche trouve bien les données du bon tenant
-- (la fonction reste utilisable, ce n'est pas juste "tout est bloqué").
select is(
  (select (public.devis_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV', '', 1, 25))->>'total')::int,
  1, '9. Recherche "TEST_A_DEV" depuis le contexte A (devis) : 1 résultat'
);
select is(
  (select (public.factures_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_A_FAC', '', 1, 25))->>'total')::int,
  1, '10. Recherche "TEST_A_FAC" depuis le contexte A (factures) : 1 résultat'
);
select is(
  (select (public.clients_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_A_Client secret', '', '', 1, 25))->>'total')::int,
  1, '11. Recherche "TEST_A_Client secret" depuis le contexte A (clients) : 1 résultat'
);
select is(
  (select (public.chantiers_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_A_Chantier assigné', '', 1, 25))->>'total')::int,
  1, '12. Recherche "TEST_A_Chantier assigné" depuis le contexte A (chantiers) : 1 résultat'
);

-- 13-14. Recherche insensible à la casse (ILIKE) : même résultat en
-- minuscule/majuscule — comportement attendu, non régressé par ce lot.
select is(
  (select (public.devis_liste_paginee('a0000000-0000-0000-0000-000000000001', 'test_a_dev', '', 1, 25))->>'total')::int,
  1, '13. Recherche insensible à la casse (devis, minuscule)'
);
select is(
  (select (public.clients_liste_paginee('a0000000-0000-0000-0000-000000000001', 'TEST_A_CLIENT SECRET', '', '', 1, 25))->>'total')::int,
  1, '14. Recherche insensible à la casse (clients, majuscule)'
);

select * from finish();
rollback;
