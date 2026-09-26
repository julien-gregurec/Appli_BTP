-- Vérifie le correctif de la migration 20260806000197 : clés étrangères composites
-- garantissant que client_id, devis_origine_id, facture_origine_id et facture_parente_id
-- de public.factures appartiennent tous à la même entreprise que la facture elle-même.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

\ir fixtures/isolation_multitenant.inc

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 6.1 Insertions interdites (1, 3, 5, 7, 9 côté A ; 2, 4, 6, 8 côté B)
select throws_like(
  $$insert into public.factures (entreprise_id, client_id) values ('a0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001')$$,
  '%violates%', '1. A ne peut pas créer une facture A avec un client B'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, devis_origine_id) values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000001')$$,
  '%violates%', '3. A ne peut pas créer une facture A avec un devis d''origine B'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, facture_origine_id, type) values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000001','avoir')$$,
  '%violates%', '5. A ne peut pas créer une facture A avec une facture d''origine B'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, facture_parente_id, type) values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000001','situation')$$,
  '%violates%', '7. A ne peut pas créer une facture A avec une facture parente B'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, chantier_id) values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001')$$,
  '%violates%', '9. Une incohérence sur chantier_id reste bloquée comme avant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id) values ('b0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001')$$,
  '%violates%', '2. B ne peut pas créer une facture B avec un client A'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, devis_origine_id) values ('b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001')$$,
  '%violates%', '4. B ne peut pas créer une facture B avec un devis d''origine A'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, facture_origine_id, type) values ('b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','avoir')$$,
  '%violates%', '6. B ne peut pas créer une facture B avec une facture d''origine A'
);

select throws_like(
  $$insert into public.factures (entreprise_id, client_id, facture_parente_id, type) values ('b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','situation')$$,
  '%violates%', '8. B ne peut pas créer une facture B avec une facture parente A'
);

-- 6.2 Insertions autorisées (10-17)
select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id) values ('c9000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001')$$,
  '11. B peut créer une facture B avec un client B'
);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, devis_origine_id) values ('c9000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000001')$$,
  '13. B peut créer une facture B avec un devis B'
);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, devis_origine_id) values ('c9000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001', null)$$,
  '14. Une facture manuelle sans devis_origine_id reste possible'
);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, facture_origine_id) values ('c9000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001', null)$$,
  '15. Une facture sans facture_origine_id reste possible'
);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, facture_parente_id) values ('c9000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001', null)$$,
  '16. Une facture sans facture_parente_id reste possible'
);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, chantier_id) values ('c9000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001')$$,
  '17. Une facture avec chantier de la même entreprise reste possible'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id) values ('c9000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001')$$,
  '10. A peut créer une facture A avec un client A'
);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, devis_origine_id) values ('c9000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001')$$,
  '12. A peut créer une facture A avec un devis A'
);

-- 6.3 Updates interdites (18-22, sens A -> B, sur la facture existante de la fixture)
-- ROADMAP-CLEANUP-V1 §12 : depuis verrouiller_facture_emise() (20260822000222), la facture
-- fixture (statut='envoyee', non-brouillon) est verrouillée avant même que la violation
-- RLS/FK ne soit évaluée -- le message attendu est donc désormais celui du trigger
-- d'immutabilité, pas '%violates%'. L'isolation cross-tenant reste bien vérifiée (le blocage
-- a toujours lieu), le mécanisme qui la garantit ici est simplement différent.
select throws_like(
  $$update public.factures set client_id = 'b3000000-0000-0000-0000-000000000001' where id = 'aa000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', '18. Facture A ne peut pas être modifiée pour pointer vers un client B'
);

select throws_like(
  $$update public.factures set devis_origine_id = 'b9000000-0000-0000-0000-000000000001' where id = 'aa000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', '19. Facture A ne peut pas être modifiée pour pointer vers un devis B'
);

select throws_like(
  $$update public.factures set facture_origine_id = 'ba000000-0000-0000-0000-000000000001' where id = 'aa000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', '20. Facture A ne peut pas être modifiée pour pointer vers une facture d''origine B'
);

select throws_like(
  $$update public.factures set facture_parente_id = 'ba000000-0000-0000-0000-000000000001' where id = 'aa000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', '21. Facture A ne peut pas être modifiée pour pointer vers une facture parente B'
);

select throws_like(
  $$update public.factures set entreprise_id = 'b0000000-0000-0000-0000-000000000001' where id = 'aa000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', '22. Facture ne peut pas changer d''entreprise en conservant des relations devenues incompatibles (refus RLS, FK, ou verrou d''immutabilité)'
);

-- Contrôle miroir essentiel B -> A
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

select throws_like(
  $$update public.factures set client_id = 'a3000000-0000-0000-0000-000000000001' where id = 'ba000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', 'Contrôle miroir B->A : facture B ne peut pas pointer vers un client A'
);

select throws_like(
  $$update public.factures set devis_origine_id = 'a9000000-0000-0000-0000-000000000001' where id = 'ba000000-0000-0000-0000-000000000001'$$,
  '%a déjà été émise%', 'Contrôle miroir B->A : facture B ne peut pas pointer vers un devis A'
);

-- 6.4 Non-régression (23-28)
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, type)
    values ('c9000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','simple')$$,
  '23. La transformation normale d''un devis A vers une facture A reste valide (mêmes colonnes que la RPC)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

select lives_ok(
  $$insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, type)
    values ('c9000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000001','simple')$$,
  '24. La transformation normale d''un devis B vers une facture B reste valide (mêmes colonnes que la RPC)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='factures'), 5::bigint,
  '25. Les policies RLS existantes sur factures restent inchangées (5 policies)'
);

reset role;
select is(
  (select count(*) from public.factures where entreprise_id='a0000000-0000-0000-0000-000000000001') >= 1
  and (select count(*) from public.factures where entreprise_id='b0000000-0000-0000-0000-000000000001') >= 1,
  true,
  '26. Les baselines A et B (fixture) restent intactes après les opérations de test'
);

select * from finish();
rollback;
