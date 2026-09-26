-- FA-08 : bascule automatique envoyee -> en_retard après échéance dépassée
-- (marquer_factures_en_retard, 20260923000328), appelée chaque jour par le cron
-- /api/cron/abonnements avec le service_role.
--
-- Matrice : seule une facture `envoyee` à échéance strictement dépassée et non
-- soldée bascule ; jamais `payee_partiel` (recalc_paiements_facture fait primer
-- le règlement partiel), ni statut terminal, ni brouillon, ni échéance du jour
-- ou future ; fonction réservée au service_role ; idempotente ; cohérente avec
-- recalc_paiements_facture ; lecture du résultat toujours cloisonnée par tenant.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into public.factures (id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc, montant_paye, date_echeance) values
  ('fa080000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','FA08_A_ECHUE','a3000000-0000-0000-0000-000000000001','envoyee',100,20,120,0,current_date - 5),
  ('fa080000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','FA08_A_JOUR','a3000000-0000-0000-0000-000000000001','envoyee',100,20,120,0,current_date),
  ('fa080000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','FA08_A_FUTURE','a3000000-0000-0000-0000-000000000001','envoyee',100,20,120,0,current_date + 10),
  ('fa080000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','FA08_A_PARTIEL','a3000000-0000-0000-0000-000000000001','payee_partiel',100,20,120,50,current_date - 5),
  ('fa080000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','FA08_A_PAYEE','a3000000-0000-0000-0000-000000000001','payee',100,20,120,120,current_date - 5),
  ('fa080000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','FA08_A_BROUILLON','a3000000-0000-0000-0000-000000000001','brouillon',100,20,120,0,current_date - 5),
  ('fa080000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','FA08_A_ANNULEE','a3000000-0000-0000-0000-000000000001','annulee',100,20,120,0,current_date - 5),
  ('fa080000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','FA08_A_SANS_ECH','a3000000-0000-0000-0000-000000000001','envoyee',100,20,120,0,null),
  ('fa080000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','FA08_B_ECHUE','b3000000-0000-0000-0000-000000000001','envoyee',200,40,240,0,current_date - 3);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Avant : rien ne bascule par le seul passage du temps (le défaut reproduit).
-- ───────────────────────────────────────────────────────────────────────────
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000001'), 'envoyee',
  '1. avant bascule : une facture échue reste envoyee (défaut FA-08 reproduit)');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Réservée au service_role.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.marquer_factures_en_retard()$$, '42501', null,
  '2. un utilisateur authentifié, même dirigeant (tous droits), ne peut pas déclencher la bascule');
reset role;
set local role anon;
select throws_ok($$select public.marquer_factures_en_retard()$$, '42501', null, '3. anon refusé');
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Bascule par le service_role (chemin du cron).
-- ───────────────────────────────────────────────────────────────────────────
set local role service_role;
select is(public.marquer_factures_en_retard(), 2, '4. service_role : exactement 2 factures basculées (A échue + B échue)');
reset role;

select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000001'), 'en_retard', '5. positive witness : envoyee + échéance dépassée -> en_retard');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000009'), 'en_retard', '6. entreprise B traitée par le même job (cron global)');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000002'), 'envoyee', '7. échéance du jour : pas encore en retard');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000003'), 'envoyee', '8. échéance future : inchangée');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000004'), 'payee_partiel', '9. payee_partiel : inchangée (même précédence que recalc_paiements_facture)');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000005'), 'payee', '10. payee : jamais en retard');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000006'), 'brouillon', '11. brouillon : inchangé');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000007'), 'annulee', '12. annulee : inchangée');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000008'), 'envoyee', '13. sans échéance : inchangée');
select is((select montant_ttc from public.factures where id='fa080000-0000-0000-0000-000000000001'), 120::numeric, '14. seul le statut change (verrou des factures émises respecté)');

set local role service_role;
select is(public.marquer_factures_en_retard(), 0, '15. idempotente : un second passage ne bascule rien');
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Cohérence avec recalc_paiements_facture (les deux chemins ne se contredisent pas).
-- ───────────────────────────────────────────────────────────────────────────
select public.recalc_paiements_facture('fa080000-0000-0000-0000-000000000001');
select is((select statut from public.factures where id='fa080000-0000-0000-0000-000000000001'), 'en_retard', '16. recalc sans règlement confirme en_retard');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Lecture du résultat : cloisonnée par tenant.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.factures where statut='en_retard' and numero like 'FA08_%'), 1, '17. dirigeant A voit sa facture en retard, pas celle de B');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.factures where numero like 'FA08_A_%'), 0, '18. cross-tenant : dirigeant B ne lit aucune facture de A');
reset role;

select * from finish();
rollback;
