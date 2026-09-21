begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc
reset elsatia.capacite_personnes_bypass;

-- Entreprise A : abonnée, capacité effective 10, baisse programmée à venir.
update public.entreprises
set abonnement_offre = 'pro', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_D', capacite_personnes_supplementaire = 10
where id = 'a0000000-0000-0000-0000-000000000001';
-- Entreprise B : baisse programmée déjà échue (cas « trop tard »).
update public.entreprises
set abonnement_offre = 'mini', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_E', capacite_personnes_supplementaire = 6
where id = 'b0000000-0000-0000-0000-000000000001';

-- ── structure + ACL ─────────────────────────────────────────────────────────
select has_function('public','annuler_baisse_capacite_planifiee','RPC d''annulation présente');
select ok(
  has_function_privilege('authenticated','public.annuler_baisse_capacite_planifiee(uuid)','EXECUTE'),
  'authenticated peut exécuter (chemin action serveur)');
select ok(
  not has_function_privilege('anon','public.annuler_baisse_capacite_planifiee(uuid)','EXECUTE'),
  'anon exclu');

-- ── mise en place d'une baisse « scheduled » via le chemin de service ────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$
  select public.synchroniser_capacite_stripe_service(
    'a0000000-0000-0000-0000-000000000001','baisse',10,4,'pro','mensuel','price_cap_pro_m',
    'sub_test_D','si_d','capacite:baisse:D:sub_test_D:4','completed', null,
    now() + interval '10 days', null, null, 'systeme')
$$, 'baisse programmée enregistrée (A)');
select lives_ok($$
  select public.synchroniser_capacite_stripe_service(
    'b0000000-0000-0000-0000-000000000001','baisse',6,2,'mini','mensuel','price_cap_mini_m',
    'sub_test_E','si_e','capacite:baisse:E:sub_test_E:2','completed', null,
    now() + interval '10 days', null, null, 'systeme')
$$, 'baisse programmée enregistrée (B)');
reset role;

-- Force l'échéance de B dans le passé (cron non encore passé).
update public.entreprises set capacite_personnes_planifiee_effet_at = now() - interval '1 hour'
where id = 'b0000000-0000-0000-0000-000000000001';

-- préconditions
select is(
  (select capacite_personnes_supplementaire_planifiee from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  4, 'A : capacité planifiée = 4 avant annulation');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key='capacite:baisse:D:sub_test_D:4'),
  'scheduled', 'A : opération liée = scheduled');
select is(
  (select count(*)::int from public.employes where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  4, 'A : 4 personnes enregistrées (témoin « aucune suppression »)');

-- ── annulation par un membre habilité de l'entreprise A ─────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}', true);

select is(
  public.annuler_baisse_capacite_planifiee('a0000000-0000-0000-0000-000000000001'),
  true, 'annulation effectuée (retour true)');

-- rejeu idempotent : plus rien à annuler
select is(
  public.annuler_baisse_capacite_planifiee('a0000000-0000-0000-0000-000000000001'),
  false, 'second appel → false (idempotent)');
reset role;

-- ── effets ─────────────────────────────────────────────────────────────────
select is(
  (select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  10, 'capacité EFFECTIVE inchangée (10)');
select is(
  (select capacite_personnes_supplementaire_planifiee from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  null, 'capacité planifiée nettoyée');
select is(
  (select capacite_personnes_planifiee_effet_at from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  null, 'date d''effet planifiée nettoyée');
select is(
  (select capacite_personnes_planifiee_operation_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  null, 'référence d''opération planifiée nettoyée');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key='capacite:baisse:D:sub_test_D:4'),
  'failed', 'opération planifiée fermée proprement (failed)');
select ok(
  (select erreur_courte from public.operations_capacite_stripe where idempotency_key='capacite:baisse:D:sub_test_D:4')
    like '%annulée avant échéance%',
  'motif de fermeture explicite');
select is(
  (select count(*) from public.historique_capacite_personnes
   where entreprise_id='a0000000-0000-0000-0000-000000000001'
     and source='systeme' and motif like '%Annulation%'), 1::bigint,
  'journal append-only : une entrée d''annulation');
select is(
  (select count(*)::int from public.employes where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  4, 'aucune personne supprimée');
select ok(
  (select count(*) from public.capacite_stripe_operations_a_reprendre(50)
   where entreprise_id='a0000000-0000-0000-0000-000000000001') = 0,
  'opération annulée absente de la file de reprise cron');

-- ── garde « trop tard » : baisse déjà échue → pas d'annulation ──────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","email":"admin-b@invalid.local","role":"authenticated","aal":"aal2"}', true);
select is(
  public.annuler_baisse_capacite_planifiee('b0000000-0000-0000-0000-000000000001'),
  false, 'B : échéance atteinte → annulation refusée (false)');
select is(
  (select capacite_personnes_supplementaire_planifiee from public.entreprises where id='b0000000-0000-0000-0000-000000000001'),
  2, 'B : planification conservée (le cron appliquera)');

-- ── tenant-safe : un membre de B ne peut pas annuler pour A ────────────────
select throws_ok($$
  select public.annuler_baisse_capacite_planifiee('a0000000-0000-0000-0000-000000000001')
$$, '42501', 'Accès refusé', 'membre d''une autre entreprise → refus');
reset role;

-- ── aucune baisse planifiée → false ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}', true);
select is(
  public.annuler_baisse_capacite_planifiee('a0000000-0000-0000-0000-000000000001'),
  false, 'aucune baisse planifiée → false (sans erreur)');
reset role;

select * from finish();
rollback;
