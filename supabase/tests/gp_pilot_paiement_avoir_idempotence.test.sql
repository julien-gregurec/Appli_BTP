-- GP-EXTERNAL-PILOT-CLOSURE-V1 — enregistrer_paiement_facture() empêche le
-- dépassement du reste dû même en cas de double appel, et creer_facture_avancee
-- résout un deuxième avoir identique vers celui déjà créé au lieu d'en émettre
-- un second. Voir 20260922000306_gp_pilot_paiement_avoir_idempotence.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir fixtures/isolation_multitenant.inc

-- Décor fourni par la fixture : TEST_A_FAC_001 (aa…01) entreprise A, 'envoyee',
-- 100 HT / 120 TTC, montant_paye = 0 ; devis TEST_A_DEV_001 (a9…01) 'accepte',
-- montant_ht = 100, lié à cette même facture (devis_origine_id).

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- ── 1. Paiement : le premier passe, le reste dû se met à jour ──
select lives_ok(
  $$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 100, current_date, 'virement', 'REF-1')$$,
  'un premier paiement de 100 sur une facture de 120 TTC est accepté'
);

-- ── 2. Un deuxième paiement qui dépasserait le reste dû (20) est refusé ──
select throws_like(
  $$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 30, current_date, 'virement', 'REF-2')$$,
  '%dépasse le reste dû%',
  'un paiement qui dépasserait le reste dû (20 restants) est refusé'
);

-- ── 3. Un paiement exact du reste dû est accepté ──
select lives_ok(
  $$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 20, current_date, 'virement', 'REF-3')$$,
  'un paiement couvrant exactement le reste dû est accepté'
);

select is(
  (select count(*)::int from public.paiements p join public.factures f on f.id = p.facture_id where f.id = 'aa000000-0000-0000-0000-000000000001'),
  2,
  'exactement deux paiements ont été enregistrés (100 + 20), pas de doublon'
);

-- ── 4. Une facture insuffisamment couverte ne peut plus recevoir de paiement dépassant 0 restant ──
select throws_like(
  $$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 0.01, current_date, 'virement', null)$$,
  '%dépasse le reste dû%',
  'plus aucun paiement possible une fois la facture soldée'
);

-- ── 5. Cross-tenant : gérant B ne peut pas payer une facture de A ──
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 1, current_date, 'virement', null)$$,
  '%Accès refusé%',
  'le gérant de B ne peut pas invoquer la RPC sur l''entreprise A (a_permission refuse)'
);

-- ── 6. INSERT direct dans paiements refusé pour authenticated (le bypass PostgREST trouvé en revue est fermé) ──
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_ok(
  $$insert into public.paiements(facture_id, montant) values ('aa000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  null,
  'authenticated ne peut plus insérer directement dans paiements (revoke insert, seule la RPC verrouillée le peut)'
);

-- ── 7. Avoir : création puis idempotence ──
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001'::uuid, 'a9000000-0000-0000-0000-000000000001'::uuid, 'avoir', 100, false, 'aa000000-0000-0000-0000-000000000001'::uuid)$$,
  'un premier avoir contre cette facture est créé'
);
select is(
  (select count(*)::int from public.factures where facture_origine_id = 'aa000000-0000-0000-0000-000000000001' and type = 'avoir'),
  1,
  'exactement un avoir existe pour cette facture d''origine'
);

select throws_like(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001'::uuid, 'a9000000-0000-0000-0000-000000000001'::uuid, 'avoir', 100, false, 'aa000000-0000-0000-0000-000000000001'::uuid)$$,
  '%avoir_existant:%',
  'un deuxième appel identique (double clic) résout vers l''avoir déjà créé au lieu d''en émettre un second'
);
select is(
  (select count(*)::int from public.factures where facture_origine_id = 'aa000000-0000-0000-0000-000000000001' and type = 'avoir'),
  1,
  'toujours exactement un avoir après la tentative de doublon : pas de double crédit'
);

reset role;
select * from finish();
rollback;
