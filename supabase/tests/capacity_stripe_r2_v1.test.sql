begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc
reset elsatia.capacite_personnes_bypass;

update public.entreprises
set abonnement_offre = 'pro', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_A', stripe_customer_id = 'cus_test_A'
where id = 'a0000000-0000-0000-0000-000000000001';
update public.entreprises
set abonnement_offre = 'mini', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_B'
where id = 'b0000000-0000-0000-0000-000000000001';

-- ── structure (superuser) ───────────────────────────────────────────────────
select has_table('public', 'operations_capacite_stripe', 'table saga créée');
select has_column('public', 'entreprises', 'capacite_personnes_supplementaire_planifiee', 'colonne capacité planifiée');
select has_column('public', 'entreprises', 'capacite_personnes_planifiee_effet_at', 'colonne échéance planifiée');
select col_is_null('public', 'entreprises', 'capacite_personnes_supplementaire_planifiee', 'planifiée nullable');
select index_is_unique('public', 'operations_capacite_stripe', 'operations_capacite_stripe_idem_idx', 'idempotency_key unique');
select index_is_unique('public', 'operations_capacite_stripe', 'operations_capacite_stripe_active_unique_idx', 'au plus une opération active par entreprise');
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 4, 'R1 compteur intact');
select is(public.capacite_personnes_base('a0000000-0000-0000-0000-000000000001'), 15, 'R1 base pro = 15 intact');
select is(public.capacite_personnes_totale('a0000000-0000-0000-0000-000000000001'), 15, 'R1 totale = 15 (supplément 0)');

-- ── contrôle d'accès : superuser sans JWT → Accès refusé ─────────────────────
select throws_ok($$
  select public.enregistrer_operation_capacite_stripe(
    'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','mensuel',
    'price_cap_pro_m','sub_test_A','k-super',null,'plateforme',null)
$$, '42501', 'Accès refusé', 'enregistrement refusé sans contexte membre/plateforme');

-- ── acteur = admin plateforme (fixture) ─────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email','plateforme@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);

select lives_ok($$
  select public.enregistrer_operation_capacite_stripe(
    'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','mensuel',
    'price_cap_pro_m','sub_test_A','capacite:hausse:A:sub_test_A:5',null,'plateforme','test hausse')
$$, 'enregistrement opération hausse (plateforme)');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
  'pending', 'hausse → statut pending');
select is(
  (select nouvelle_capacite from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
  5, 'nouvelle_capacite = 5');

-- idempotence
select is(
  public.enregistrer_operation_capacite_stripe(
    'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','mensuel',
    'price_cap_pro_m','sub_test_A','capacite:hausse:A:sub_test_A:5',null,'plateforme','rejeu'),
  (select id from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
  'idempotence : même clé → même opération');
select is((select count(*) from public.operations_capacite_stripe
           where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 1::bigint,
  'aucun doublon après rejeu');

-- garde de concurrence : 2e opération active (clé différente) refusée
select throws_ok($$
  select public.enregistrer_operation_capacite_stripe(
    'a0000000-0000-0000-0000-000000000001','baisse',5,2,'pro','mensuel',
    'price_cap_pro_m','sub_test_A','capacite:baisse:A:sub_test_A:2', now()+interval '20 days','plateforme',null)
$$, 'P0001', 'OPERATION_CAPACITE_EN_COURS', 'une seule opération active par entreprise');

-- validations d'entrée
select throws_ok($$select public.enregistrer_operation_capacite_stripe(
  'a0000000-0000-0000-0000-000000000001','hausse',0,-3,'pro','mensuel','p','s','k-neg',null,'plateforme',null)$$,
  '22023', 'Capacité invalide', 'capacité négative refusée');
select throws_ok($$select public.enregistrer_operation_capacite_stripe(
  'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','trimestriel','p','s','k-per',null,'plateforme',null)$$,
  '22023', 'Périodicité invalide', 'périodicité invalide refusée');
select throws_ok($$select public.enregistrer_operation_capacite_stripe(
  'a0000000-0000-0000-0000-000000000001','fusion',0,5,'pro','mensuel','p','s','k-typ',null,'plateforme',null)$$,
  '22023', 'Type d''opération invalide', 'type d''opération invalide refusé');

-- baisse programmée sur le tenant B → scheduled
select lives_ok($$
  select public.enregistrer_operation_capacite_stripe(
    'b0000000-0000-0000-0000-000000000001','baisse',10,3,'mini','mensuel',
    'price_cap_mini_m','sub_test_B','capacite:baisse:B:sub_test_B:3', now()+interval '15 days','plateforme',null)
$$, 'enregistrement baisse programmée (tenant B)');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key = 'capacite:baisse:B:sub_test_B:3'),
  'scheduled', 'baisse avec date d''effet → scheduled');
select ok(
  (select date_effet_souhaitee from public.operations_capacite_stripe where idempotency_key = 'capacite:baisse:B:sub_test_B:3') > now(),
  'date d''effet dans le futur');

-- ── finalisation de saga : plateforme + AAL2 ────────────────────────────────
select lives_ok($$
  select public.finaliser_operation_capacite_stripe(
    (select id from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
    'stripe_applied','si_cap_A',null,
    '{"item":"si_cap_A","quantity":5,"price":"price_cap_pro_m","status":"active"}'::jsonb)
$$, 'plateforme AAL2 : saga → stripe_applied');
select is(
  (select stripe_item_id from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
  'si_cap_A', 'stripe_item_id renseigné');

-- non-plateforme : refusé
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$
  select public.finaliser_operation_capacite_stripe(
    (select id from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
    'completed',null,null,null)
$$, '42501', null, 'non-plateforme : finalisation refusée');

-- retour plateforme : terminal figé
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$
  select public.finaliser_operation_capacite_stripe(
    (select id from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
    'completed',null,null,null)
$$, 'saga → completed');
select throws_ok($$
  select public.finaliser_operation_capacite_stripe(
    (select id from public.operations_capacite_stripe where idempotency_key = 'capacite:hausse:A:sub_test_A:5'),
    'pending',null,null,null)
$$, 'P0001', 'Opération déjà finalisée (completed)', 'opération terminale non ré-ouvrable');
reset role;

-- ── RLS / ACL (superuser) ──────────────────────────────────────────────────
select ok(
  not has_table_privilege('authenticated','public.operations_capacite_stripe','INSERT')
  and not has_table_privilege('authenticated','public.operations_capacite_stripe','UPDATE')
  and not has_table_privilege('authenticated','public.operations_capacite_stripe','DELETE'),
  'operations_capacite_stripe : aucune écriture directe authenticated');
select ok(
  not has_function_privilege('service_role','public.finaliser_operation_capacite_stripe(uuid,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.enregistrer_operation_capacite_stripe(uuid,text,integer,integer,text,text,text,text,text,timestamptz,text,text)','EXECUTE'),
  'anon / service_role sans RPC saga sensibles');
select matches(
  pg_get_functiondef('public.finaliser_operation_capacite_stripe(uuid,text,text,text,jsonb)'::regprocedure),
  'plateforme_exiger_session_aal2', 'finalisation saga exige AAL2');

-- cross-tenant : membre de B ne voit pas les opérations de A
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email','admin-b@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","email":"admin-b@invalid.local","role":"authenticated","aal":"aal2"}', true);
select is(
  (select count(*) from public.operations_capacite_stripe where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint, 'RLS : B ne lit pas les opérations de A');
select ok(
  (select count(*) from public.operations_capacite_stripe where entreprise_id = 'b0000000-0000-0000-0000-000000000001') >= 1,
  'RLS : B lit ses propres opérations');
reset role;

select * from finish();
rollback;
