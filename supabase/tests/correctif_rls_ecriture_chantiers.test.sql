-- Vérifie le correctif de la migration 20260922000190 : restauration du socle PERMISSIVE
-- d'écriture (insert/update/delete) sur public.chantiers, avec vérification de cohérence
-- entreprise/client, et une RESTRICTIVE dédiée `gerer_chantiers` (absente sur cette branche
-- avant ce correctif, contrairement à la branche source), sans régression des policies SELECT
-- déjà en place.
--
-- Portage adapté du test source sur `integration/gp-external-pilot-closure-v1`
-- (ancêtre du commit `8f5fca1`, commit `fee8afa`,
-- supabase/tests/correctif_rls_ecriture_chantiers.test.sql) : le test source simule des appels
-- authentifiés avec deux entreprises via un fixture `fixtures/isolation_multitenant.inc` absent
-- de ce dépôt (voir la note de portage de
-- supabase/tests/plateforme_admin_role_total_ferme_autopromotion.test.sql pour le même
-- constat). Le style de test déjà en usage sur cette branche pour les correctifs RLS
-- (durcissement_privileges_socle.test.sql, restreint_lecture_documents_sensibles.test.sql,
-- fiabilise_policy_lecture_documents_paie.test.sql) est de l'introspection de schéma/policies
-- plutôt qu'une simulation comportementale complète avec de vraies lignes `auth.users` — repris
-- ici pour la même raison : aucune base réelle n'est disponible dans cet environnement pour
-- valider un scénario comportemental construit à la main, alors que l'introspection peut être
-- vérifiée directement contre le texte du correctif.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.chantiers'::regclass),
  'RLS reste active sur public.chantiers'
);

-- Les 8 policies attendues après le correctif : les 2 SELECT préexistantes, plus les 3
-- PERMISSIVE et 3 RESTRICTIVE d'écriture ajoutées par 20260922000190.
select policies_are(
  'public',
  'chantiers',
  array[
    'chantiers_lecture_selon_droits',
    'lecture_chantiers_selon_permission',
    'membres écrivent les chantiers',
    'membres modifient les chantiers',
    'membres suppriment les chantiers',
    'role_gestion_insert',
    'role_gestion_update',
    'role_gestion_delete'
  ],
  'public.chantiers a exactement les policies SELECT préexistantes et les policies d''écriture restaurées'
);

-- Les 3 nouvelles policies d'écriture sont bien PERMISSIVE (le bug corrigé : sans policy
-- PERMISSIVE, aucune commande n'est autorisée même si une RESTRICTIVE l'accorderait).
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'chantiers'
     and policyname in ('membres écrivent les chantiers', 'membres modifient les chantiers', 'membres suppriment les chantiers')
     and permissive = 'PERMISSIVE'),
  3,
  'les 3 policies d''écriture restaurées sont bien PERMISSIVE'
);

-- Les 3 policies role_gestion_* sont RESTRICTIVE (exigent la permission gerer_chantiers en
-- plus de l'appartenance active, comme pour les tables sœurs taches/chantier_transferts).
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'chantiers'
     and policyname in ('role_gestion_insert', 'role_gestion_update', 'role_gestion_delete')
     and permissive = 'RESTRICTIVE'),
  3,
  'les 3 policies role_gestion_* sont bien RESTRICTIVE (exigent gerer_chantiers)'
);

-- Chaque policy RESTRICTIVE référence bien gerer_chantiers (et non une autre permission par erreur).
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'chantiers'
     and policyname in ('role_gestion_insert', 'role_gestion_update', 'role_gestion_delete')
     and (coalesce(qual, '') like '%gerer_chantiers%' or coalesce(with_check, '') like '%gerer_chantiers%')),
  3,
  'les 3 policies RESTRICTIVE portent bien sur la permission gerer_chantiers'
);

-- Les policies INSERT/UPDATE PERMISSIVE vérifient bien la cohérence client_id/entreprise_id
-- (et pas seulement l'appartenance active) : c'est le garde-fou anti-rattachement croisé.
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'chantiers' and policyname = 'membres écrivent les chantiers') like '%clients%',
  'la policy INSERT vérifie la cohérence client_id/entreprise_id'
);
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'chantiers' and policyname = 'membres modifient les chantiers') like '%clients%',
  'la policy UPDATE vérifie la cohérence client_id/entreprise_id'
);

-- Non-régression : les policies SELECT préexistantes ne sont pas altérées par ce correctif.
select is(
  (select cmd from pg_policies where schemaname = 'public' and tablename = 'chantiers' and policyname = 'chantiers_lecture_selon_droits'),
  'SELECT',
  'la policy de lecture historique reste une policy SELECT (non régressée)'
);
select is(
  (select permissive from pg_policies where schemaname = 'public' and tablename = 'chantiers' and policyname = 'chantiers_lecture_selon_droits'),
  'PERMISSIVE',
  'la policy de lecture historique reste PERMISSIVE (non régressée)'
);

select * from finish();
rollback;
