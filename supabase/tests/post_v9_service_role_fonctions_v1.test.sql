-- ELSATIA POST-V9 HARDENING V1 — Lot A : fonctions `*_service` appelées par le code
-- mais absentes du train V9 (audit Security V2 §7, « RPC service_role manquantes »).
--
-- Témoin : ROUGE sur le train V9 (6392131a, 389 migrations) — fonctions absentes ;
-- VERT après 20261002001301_post_v9_service_role_fonctions_manquantes_v1.
--
-- Couvre, pour les 9 fonctions : présence et signature exacte, SECURITY DEFINER avec
-- search_path figé, EXECUTE réservé à service_role (ni PUBLIC, ni anon, ni authenticated),
-- flux légitimes rejoués sous service_role (décompte Stripe, relances, nouveau lien,
-- push) et isolation multi-tenant (aucune donnée d'une autre entreprise ne sort).
--
-- Lancer depuis supabase/tests (\ir relatif), en -At :
--   scripts/qualification/pgtap-run-v3.sh <base> post_v9_service_role_fonctions_v1.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- ── Données propres au lot (propriétaire, avant tout changement de rôle) ──────────────
update public.clients set email = 'client-a@invalid.local' where id = 'a3000000-0000-0000-0000-000000000001';
update public.employes set compte_application_statut = 'actif'
 where id in ('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002');
update public.employes set compte_application_statut = 'pause' where id = 'a2000000-0000-0000-0000-000000000003';
update public.employes set compte_application_statut = 'ferme' where id = 'a2000000-0000-0000-0000-000000000004';
update public.employes set compte_application_statut = 'non_ouvert'
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
   and id not in ('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002',
                  'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000004');
update public.employes set compte_application_statut = 'actif' where entreprise_id = 'b0000000-0000-0000-0000-000000000001';

insert into public.parametres_relances(entreprise_id, devis_auto_actif, factures_auto_actif) values
  ('a0000000-0000-0000-0000-000000000001', true, false),
  ('b0000000-0000-0000-0000-000000000001', false, false)
on conflict (entreprise_id) do update
  set devis_auto_actif = excluded.devis_auto_actif, factures_auto_actif = excluded.factures_auto_actif;

insert into public.devis(id, entreprise_id, numero, client_id, chantier_id, statut, date_emission,
                         montant_ht, montant_tva, montant_ttc) values
  ('a9000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_PV9',
   'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'envoye',
   current_date - 30, 100, 20, 120);
insert into public.relances_documents(entreprise_id, type_document, document_id, niveau, statut, date_envoi) values
  ('a0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-0000000000e1', 1, 'envoyee', now() - interval '10 days');

insert into public.notifications_utilisateurs(id, entreprise_id, utilisateur_id, type, titre) values
  ('ae000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pv9_test', 'Titre PV9'),
  ('be000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'pv9_test', 'Titre PV9 B');
insert into public.preferences_notifications_push(entreprise_id, utilisateur_id, type, actif) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pv9_test', false);
insert into public.push_abonnements(id, entreprise_id, utilisateur_id, endpoint, p256dh, auth) values
  ('af000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'https://push.invalid/pv9-a', 'p256dh-a', 'auth-a'),
  ('bf000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'https://push.invalid/pv9-b', 'p256dh-b', 'auth-b');

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Présence et signatures exactes (celles qu'appelle le code)
-- ─────────────────────────────────────────────────────────────────────────────
create temp table pv9_fonctions(signature text primary key) on commit drop;
insert into pv9_fonctions values
  ('public.compter_comptes_application_service(uuid)'),
  ('public.relances_auto_parametres_service()'),
  ('public.relances_auto_candidats_service(uuid, text, integer)'),
  ('public.relance_document_service(uuid, text, uuid)'),
  ('public.relance_nouveau_lien_partage_service(uuid, text, uuid, text, timestamp with time zone)'),
  ('public.push_notifications_en_attente_service(timestamp with time zone, integer)'),
  ('public.push_preparer_notification_service(uuid)'),
  ('public.push_marquer_notification_envoyee_service(uuid)'),
  ('public.push_supprimer_abonnement_service(uuid, uuid)');
grant select on pv9_fonctions to service_role, authenticated, anon;

create temp view pv9_resolues as
  select f.signature, to_regprocedure(f.signature) as oid_fonction from pv9_fonctions f;
grant select on pv9_resolues to service_role, authenticated, anon;

select is((select count(*)::int from pv9_resolues where oid_fonction is not null), 9,
  'Lot A : les 9 fonctions *_service existent avec la signature appelée par le code');
select is((select count(*)::int from pv9_resolues r join pg_proc p on p.oid = r.oid_fonction
           where p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public, pg_temp')), 9,
  'Lot A : SECURITY DEFINER et search_path figé (public, pg_temp)');
select is((select count(*)::int from pv9_resolues where oid_fonction is not null
           and has_function_privilege('service_role', oid_fonction, 'EXECUTE')), 9,
  'Lot A : service_role exécute les 9 fonctions');
select is((select count(*)::int from pv9_resolues where oid_fonction is not null
           and has_function_privilege('authenticated', oid_fonction, 'EXECUTE')), 0,
  'Lot A : authenticated n''exécute aucune des 9 fonctions');
select is((select count(*)::int from pv9_resolues where oid_fonction is not null
           and has_function_privilege('anon', oid_fonction, 'EXECUTE')), 0,
  'Lot A : anon n''exécute aucune des 9 fonctions');
select is((select count(*)::int from pv9_resolues r join pg_proc p on p.oid = r.oid_fonction,
                  lateral aclexplode(p.proacl) a where a.grantee = 0), 0,
  'Lot A : PUBLIC n''a l''EXECUTE sur aucune des 9 fonctions');
select is((select count(*)::int from pv9_resolues r join pg_proc p on p.oid = r.oid_fonction
           where p.proowner <> 'postgres'::regrole), 0,
  'Lot A : propriétaire postgres (comme le reste du train)');

-- Aucun doublon : une seule surcharge par nom.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'compter_comptes_application_service', 'relances_auto_parametres_service',
             'relances_auto_candidats_service', 'relance_document_service',
             'relance_nouveau_lien_partage_service', 'push_notifications_en_attente_service',
             'push_preparer_notification_service', 'push_marquer_notification_envoyee_service',
             'push_supprimer_abonnement_service')), 9,
  'Lot A : aucune surcharge en double');

-- Les fonctions d'import paie restent volontairement absentes (SEC-6 : DECISION_REQUIRED).
select ok(to_regprocedure('public.paie_import_preparer_bulletin_service(uuid, text, date)') is null,
  'SEC-6 : import paie non réouvert (fonction de préparation absente)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Flux légitimes rejoués sous service_role (claims PostgREST)
-- ─────────────────────────────────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1a. Décompte Stripe des comptes facturables (reconcilierAbonnementStripe)
select is(public.compter_comptes_application_service('a0000000-0000-0000-0000-000000000001'), 3,
  'Stripe : A = 2 actifs + 1 en pause (fermé et non ouvert exclus)');
select ok(public.compter_comptes_application_service('b0000000-0000-0000-0000-000000000001') > 0,
  'Stripe : B compte ses propres comptes actifs');
select is(public.compter_comptes_application_service('c0000000-0000-0000-0000-0000000000ff'), 0,
  'Stripe : entreprise inconnue = 0');
select throws_ok($$select count(*) from public.employes$$, '42501', null,
  'Stripe : toujours aucune lecture directe des salariés par service_role');

-- 1b. Relances automatiques
select is((select count(*)::int from public.relances_auto_parametres_service()
           where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 1, 'Relances : A (devis auto) chargée');
select is((select count(*)::int from public.relances_auto_parametres_service()
           where entreprise_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'Relances : B (aucun volet auto) ignorée');
select ok('a9000000-0000-0000-0000-0000000000e1'::uuid in
          (select id from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'devis', 200)),
  'Relances : devis envoyé candidat');
select ok('a9000000-0000-0000-0000-000000000001'::uuid not in
          (select id from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'devis', 200)),
  'Relances : devis accepté non candidat');
select is((select count(*)::int from public.relances_auto_candidats_service('b0000000-0000-0000-0000-000000000001', 'devis', 200)
           where id = 'a9000000-0000-0000-0000-0000000000e1'), 0,
  'Relances : multi-tenant — aucun candidat d''une autre entreprise');
select ok('aa000000-0000-0000-0000-000000000001'::uuid in
          (select id from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'facture', 200)),
  'Relances : facture envoyée candidate');
select is((select count(*)::int from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'devis', 0)), 0,
  'Relances : plafond respecté (0)');
select throws_ok($$select * from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'chantier', 200)$$,
  '22023', null, 'Relances : type de document invalide refusé');
select is(public.relance_document_service('a0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-0000000000e1') -> 'client' ->> 'email',
  'client-a@invalid.local', 'Relances : e-mail du client courant');
select is(public.relance_document_service('a0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-0000000000e1') ->> 'relances_envoyees',
  '1', 'Relances : historique compté');
select ok(public.relance_document_service('a0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-0000000000e1') ->> 'derniere_relance_envoyee' is not null,
  'Relances : date de la dernière relance');
select ok(public.relance_document_service('b0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-0000000000e1') is null,
  'Relances : multi-tenant — document d''une autre entreprise → null');
select ok(public.relance_document_service('a0000000-0000-0000-0000-000000000001', 'facture', 'aa000000-0000-0000-0000-000000000001') ? 'montant_paye',
  'Relances : facture avec montant payé');
select throws_ok($$select id from public.devis$$, '42501', null, 'Relances : toujours aucune lecture directe des devis');

-- 1c. Nouveau lien de partage émis par le cron
select lives_ok($$select public.relance_nouveau_lien_partage_service('a0000000-0000-0000-0000-000000000001', 'devis',
                   'a9000000-0000-0000-0000-0000000000e1', repeat('a', 64), now() + interval '60 days')$$, 'Nouveau lien : premier lien');
select lives_ok($$select public.relance_nouveau_lien_partage_service('a0000000-0000-0000-0000-000000000001', 'devis',
                   'a9000000-0000-0000-0000-0000000000e1', repeat('b', 64), now() + interval '60 days')$$, 'Nouveau lien : lien remplacé');
select throws_ok($$select public.relance_nouveau_lien_partage_service('a0000000-0000-0000-0000-000000000001', 'devis',
                    'a9000000-0000-0000-0000-0000000000e1', 'pas-une-empreinte', now())$$, '22023', null, 'Nouveau lien : empreinte invalide refusée');
select throws_ok($$select public.relance_nouveau_lien_partage_service('b0000000-0000-0000-0000-000000000001', 'devis',
                    'a9000000-0000-0000-0000-0000000000e1', repeat('c', 64), now())$$, 'P0002', null,
  'Nouveau lien : multi-tenant — document d''une autre entreprise refusé');
select throws_ok($$select id from public.acces_externes_documents$$, '42501', null, 'Nouveau lien : aucune lecture des empreintes');
reset role;
select is((select count(*)::int from public.acces_externes_documents
           where document_id = 'a9000000-0000-0000-0000-0000000000e1' and revoque_le is null), 1, 'Nouveau lien : un seul lien actif');
select is((select token_hash from public.acces_externes_documents
           where document_id = 'a9000000-0000-0000-0000-0000000000e1' and revoque_le is null), repeat('b', 64), 'Nouveau lien : le lien actif est le dernier');
select ok((select cree_par is null from public.acces_externes_documents
           where document_id = 'a9000000-0000-0000-0000-0000000000e1' and revoque_le is null), 'Nouveau lien : lien automatique sans auteur humain');

-- 1d. Notifications push
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok('ae000000-0000-0000-0000-000000000001'::uuid in
          (select id from public.push_notifications_en_attente_service(now() - interval '25 hours', 200)), 'Push : notification en attente listée');
select is((select count(*)::int from public.push_notifications_en_attente_service(now() - interval '25 hours', 0)), 0, 'Push : plafond respecté (0)');
select is(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') ->> 'titre', 'Titre PV9', 'Push : contenu');
select is(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') ->> 'preference_active', 'false', 'Push : préférence respectée');
select is(jsonb_array_length(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') -> 'abonnements'), 1,
  'Push : multi-tenant — seuls les abonnements du destinataire');
select is(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') -> 'abonnements' -> 0 ->> 'endpoint',
  'https://push.invalid/pv9-a', 'Push : abonnement du destinataire, pas celui de B');
select lives_ok($$select public.push_supprimer_abonnement_service('af000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$,
  'Push : suppression par un autre utilisateur sans effet (ne lève pas)');
select is(jsonb_array_length(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') -> 'abonnements'), 1,
  'Push : abonnement intact après tentative croisée');
select lives_ok($$select public.push_supprimer_abonnement_service('af000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$,
  'Push : abonnement expiré supprimé par son propriétaire');
select is(jsonb_array_length(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') -> 'abonnements'), 0, 'Push : abonnement supprimé');
select lives_ok($$select public.push_marquer_notification_envoyee_service('ae000000-0000-0000-0000-000000000001')$$, 'Push : notification marquée');
select ok(public.push_preparer_notification_service('ae000000-0000-0000-0000-000000000001') is null, 'Push : notification traitée → null');
select ok('ae000000-0000-0000-0000-000000000001'::uuid not in
          (select id from public.push_notifications_en_attente_service(now() - interval '25 hours', 200)), 'Push : plus listée');
select throws_ok($$select endpoint from public.push_abonnements$$, '42501', null, 'Push : toujours aucune lecture directe des abonnements');
reset role;
select is((select count(*)::int from public.push_abonnements where id = 'bf000000-0000-0000-0000-000000000001'), 1,
  'Push : multi-tenant — abonnement de B intact');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Aucun point d'entrée pour authenticated ni anon
-- ─────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.compter_comptes_application_service('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'authenticated : comptage refusé');
select throws_ok($$select * from public.relances_auto_parametres_service()$$, '42501', null, 'authenticated : paramètres relances refusés');
select throws_ok($$select public.relance_document_service('b0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-0000000000e1')$$,
  '42501', null, 'authenticated : lecture relance refusée');
select throws_ok($$select public.push_preparer_notification_service('be000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'authenticated : lecture push refusée');
select throws_ok($$select public.push_supprimer_abonnement_service('bf000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'authenticated : suppression push refusée');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.relance_nouveau_lien_partage_service('a0000000-0000-0000-0000-000000000001', 'devis',
                    'a9000000-0000-0000-0000-0000000000e1', repeat('d', 64), now())$$, '42501', null, 'anon : nouveau lien refusé');
select throws_ok($$select * from public.push_notifications_en_attente_service(now() - interval '1 day', 10)$$,
  '42501', null, 'anon : liste push refusée');
reset role;

select * from finish();
rollback;
