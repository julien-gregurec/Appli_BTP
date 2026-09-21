-- GP-EXTERNAL-PILOT-CLOSURE-V1 — le manifeste de fichiers de l'export RGPD
-- liste les fichiers de l'entreprise appelante, jamais ceux d'une autre, et
-- exporter_donnees_entreprise l'inclut sous 'manifeste_fichiers'. Voir
-- 20260922000310_gp_pilot_rgpd_manifeste_fichiers.sql.
--
-- Corrigé lors de la revue ELSATIA-EXTERNAL-PILOT-FULL-REHEARSAL-V2 (jamais
-- exécuté avant cette mission) : les contrôles qualitatifs (2-5 ci-dessous)
-- appelaient `manifeste_fichiers_entreprise` directement en tant
-- qu'`authenticated`, ce que son propre `revoke` (vérifié par le test 6, qui
-- passait déjà) interdit explicitement — la fonction n'est atteignable que
-- depuis `exporter_donnees_entreprise` (exécution SECURITY DEFINER, sous
-- l'identité du propriétaire). Reproduits ici via le chemin réellement
-- exposé, `exporter_donnees_entreprise(...) -> 'manifeste_fichiers' ->
-- 'fichiers'`, déjà utilisé par les tests 7-8 de ce même fichier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures/isolation_multitenant.inc

select has_function(
  'public', 'manifeste_fichiers_entreprise', array['uuid'],
  'la fonction de manifeste existe'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select is(
  jsonb_array_length(public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers'),
  2,
  'les deux documents_chantier de A (visible + privé) sont listés'
);
select ok(
  position('secret.pdf' in (public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers')::text) > 0,
  'un document « privé » (audience gestionnaires) reste dans le manifeste : c''est un inventaire, pas un contrôle de visibilité UI'
);
select ok(
  position('Plan visible B' in (public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers')::text) = 0
  and position('/b4000000-0000-0000-0000-000000000001/' in (public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers')::text) = 0,
  'aucun fichier de l''entreprise B ne fuite dans le manifeste de A'
);
select ok(
  (select bool_and((f ->> 'table') is not null and (f ->> 'bucket') is not null and (f ->> 'storage_path') is not null)
   from jsonb_array_elements(public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers') f),
  'chaque entrée porte au minimum table/bucket/storage_path (inventaire exploitable)'
);

-- Gérant B, appelant avec l'ID de A en paramètre : la fonction elle-même ne
-- fait pas de contrôle de droit (elle est interne, jamais grantée directement
-- à authenticated — voir revoke ci-dessous) ; le contrôle vit dans
-- exporter_donnees_entreprise, qui l'appelle après avoir déjà vérifié
-- a_permission(p_entreprise_id, 'gerer_parametres'). On le prouve ici.
select ok(
  not has_function_privilege('authenticated', 'public.manifeste_fichiers_entreprise(uuid)', 'EXECUTE'),
  'manifeste_fichiers_entreprise n''est pas exécutable directement par authenticated (pas de contrôle de droit propre)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select ok(
  (public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers') is not null,
  'exporter_donnees_entreprise inclut bien manifeste_fichiers.fichiers'
);
select is(
  jsonb_array_length(public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') -> 'manifeste_fichiers' -> 'fichiers'),
  2,
  'le manifeste inclus dans l''export complet retrouve les mêmes 2 fichiers'
);

-- Ouvrier A (pas gerer_parametres) : l'export entier reste refusé, manifeste inclus.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001')$$,
  '%Accès refusé%',
  'un membre sans gerer_parametres ne peut toujours pas déclencher l''export (manifeste inclus)'
);

reset role;
select * from finish();
rollback;
