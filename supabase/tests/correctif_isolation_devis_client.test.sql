-- Vérifie le correctif de la migration 20260806000198 : clé étrangère composite
-- garantissant que public.devis.client_id appartient à la même entreprise que le devis.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\ir fixtures/isolation_multitenant.inc

-- Contournement local uniquement : sur cette instance de développement, le rôle
-- authenticated n'a pas les grants sur lignes_devis (a l'inverse de elsatia-preview, ou ils
-- sont presents) ; sans effet hors de cette transaction, annulee par le rollback final.
grant insert, select, update, delete on public.lignes_devis to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1-4. Insertions interdites
select throws_like(
  $$insert into public.devis (entreprise_id, client_id) values ('a0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001')$$,
  '%violates%', '1. A ne peut pas creer un devis A avec un client B'
);

select throws_like(
  $$insert into public.devis (entreprise_id, client_id, chantier_id) values ('a0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001')$$,
  '%violates%', '3. A ne peut pas creer un devis A avec un client B meme si le chantier appartient a A'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

select throws_like(
  $$insert into public.devis (entreprise_id, client_id) values ('b0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001')$$,
  '%violates%', '2. B ne peut pas creer un devis B avec un client A'
);

select throws_like(
  $$insert into public.devis (entreprise_id, client_id, chantier_id) values ('b0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001')$$,
  '%violates%', '4. B ne peut pas creer un devis B avec un client A meme si le chantier appartient a B'
);

-- 5-8. Insertions autorisees
select lives_ok(
  $$insert into public.devis (id, entreprise_id, client_id) values ('d9000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001')$$,
  '6. B peut creer un devis B avec un client B'
);

select lives_ok(
  $$insert into public.devis (id, entreprise_id, client_id, chantier_id) values ('d9000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001')$$,
  '8. Un devis B avec client B et chantier B reste valide'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$insert into public.devis (id, entreprise_id, client_id) values ('d9000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001')$$,
  '5. A peut creer un devis A avec un client A'
);

select lives_ok(
  $$insert into public.devis (id, entreprise_id, client_id, chantier_id) values ('d9000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001')$$,
  '7. Un devis A avec client A et chantier A reste valide'
);

-- 9-11. Updates interdites sur les devis brouillon créés plus haut. Les devis de la
-- fixture sont acceptés et désormais immuables : les utiliser ici testerait le verrou
-- métier avant d'atteindre les contraintes d'isolation client/entreprise.
select throws_like(
  $$update public.devis set client_id = 'b3000000-0000-0000-0000-000000000001' where id = 'd9000000-0000-0000-0000-000000000003'$$,
  '%violates%', '9. A ne peut pas modifier un devis A pour lui affecter un client B'
);

select throws_like(
  $$update public.devis set entreprise_id = 'b0000000-0000-0000-0000-000000000001' where id = 'd9000000-0000-0000-0000-000000000003'$$,
  '%violates%', '11. Un devis ne peut pas changer d''entreprise en conservant un client devenu incompatible (refus RLS ou FK)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

select throws_like(
  $$update public.devis set client_id = 'a3000000-0000-0000-0000-000000000001' where id = 'd9000000-0000-0000-0000-000000000001'$$,
  '%violates%', '10. B ne peut pas modifier un devis B pour lui affecter un client A'
);

-- 12-13. Updates autorisees
select lives_ok(
  $$update public.devis set client_id = 'b3000000-0000-0000-0000-000000000003' where id = 'd9000000-0000-0000-0000-000000000001'$$,
  '13. B peut remplacer son client par un autre client B valide'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$update public.devis set client_id = 'a3000000-0000-0000-0000-000000000003' where id = 'd9000000-0000-0000-0000-000000000003'$$,
  '12. A peut remplacer un client A par un autre client A valide'
);

-- 14-15. Non-regression des RPC de creation/modification (memes chemins que les Server Actions)
select lives_ok(
  $$select public.creer_devis_brouillon(
      'a0000000-0000-0000-0000-000000000001'::uuid,
      jsonb_build_object('client_id','a3000000-0000-0000-0000-000000000001'),
      '[]'::jsonb
    )$$,
  '14. creer_devis_brouillon reste fonctionnelle avec un client de la meme entreprise'
);

select lives_ok(
  $$select public.modifier_devis_brouillon(
      'd9000000-0000-0000-0000-000000000003'::uuid,
      jsonb_build_object('client_id','a3000000-0000-0000-0000-000000000001'),
      '[]'::jsonb
    )$$,
  '15. modifier_devis_brouillon reste fonctionnelle avec un client de la meme entreprise'
);

-- 16. La relation composite sur chantier_id reste presente et fonctionnelle
reset role;
select is(
  (select count(*)::int from pg_constraint where conname = 'devis_chantier_entreprise_fkey'), 1,
  '16a. La contrainte composite devis_chantier_entreprise_fkey est toujours presente'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$insert into public.devis (entreprise_id, client_id, chantier_id) values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001')$$,
  '%violates%', '16b. La contrainte composite chantier_id bloque toujours un chantier etranger'
);

-- 17. Les policies RLS de devis restent inchangees (5 policies : 1 PERMISSIVE + 4 RESTRICTIVE)
reset role;
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='devis'), 5,
  '17. Les policies RLS existantes sur devis restent inchangees (5 policies)'
);

-- 18. Les baselines A et B (fixture) restent intactes
select is(
  (select count(*) from public.devis where entreprise_id='a0000000-0000-0000-0000-000000000001') >= 1
  and (select count(*) from public.devis where entreprise_id='b0000000-0000-0000-0000-000000000001') >= 1,
  true,
  '18. Les baselines A et B (fixture) restent intactes apres les operations de test'
);

select * from finish();
rollback;
