-- [CONVERGENCE TRAIN] Porte depuis claude/beautiful-franklin-7hwzq0 (SHA
-- 56aa747958a480d484ddf3d71d25e1efc539d99, PERFORMANCE QUALIFIED).
-- Le correctif source (20260922000315_correctif_debordement_next_reference.sql)
-- N'A PAS ete porte : le train contient deja un correctif fonctionnellement
-- identique (meme principe greatest(p_largeur, length(v_numero::text)))
-- integre plus tot via 20260922000317_correctif_troncature_next_reference.sql
-- (NUMBERING FIX INTEGRATED). Ce test valide donc ce correctif deja present
-- dans le train, pas une nouvelle migration.
--
-- `public.next_reference()` formatait avec `lpad(v_numero::text, p_largeur,
-- '0')`, qui TRONQUE (au lieu d'étendre) une chaîne déjà plus longue que la
-- largeur demandée : `lpad('1000', 3, '0')` = '100'. Dès que le compteur
-- d'un couple (entreprise, type) dépasse 10^p_largeur - 1, le numéro généré
-- entre en collision avec un numéro déjà attribué plus tôt (ici : le
-- 1000e appel avec une largeur 3 tronque en '100', identique au 100e appel).
-- Trouvé en générant le dataset lourd de qualification perf (5000 devis
-- pour un même tenant — voir docs/qualification/
-- ELSATIA_GP_DASHBOARD_SEARCH_PERFORMANCE_V1.md).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir fixtures/isolation_multitenant.inc

-- 1-999 : aucune collision, comportement inchangé (chaîne déjà large
-- assez pour la largeur demandée).
select is(
  (select public.next_reference('a0000000-0000-0000-0000-000000000001', 'gp_perf_test_overflow', 'T', 3, false)),
  'T-001',
  '1. 1er appel : formaté sur 3 chiffres comme avant le correctif'
);

-- Avance le compteur jusqu'à 999 pour ce couple (entreprise, type) de test.
select public.next_reference('a0000000-0000-0000-0000-000000000001', 'gp_perf_test_overflow', 'T', 3, false)
  from generate_series(1, 998);

select is(
  (select dernier_numero from public.compteurs_reference
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and type = 'gp_perf_test_overflow'),
  999,
  '2. Compteur à 999 après 999 appels'
);

-- 1000e appel : avant le correctif, lpad('1000', 3, '0') tronquait en
-- '100' — collision garantie avec le 100e appel ('T-100'). Après le
-- correctif, la largeur configurée devient un plancher : 'T-1000'.
select is(
  (select public.next_reference('a0000000-0000-0000-0000-000000000001', 'gp_perf_test_overflow', 'T', 3, false)),
  'T-1000',
  '3. 1000e appel : numéro étendu à 4 chiffres, pas tronqué en collision avec le 100e'
);

-- Confirme qu'aucune collision ne s'est produite : les deux numéros
-- ('T-100' du 100e appel, 'T-1000' du 1000e) coexistent réellement, aucune
-- exception n'a interrompu la séquence ci-dessus.
select is(
  (select dernier_numero from public.compteurs_reference
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and type = 'gp_perf_test_overflow'),
  1000,
  '4. Compteur à 1000 : la séquence complète (dont le 1000e appel) s''est exécutée sans erreur'
);

select * from finish();
rollback;
