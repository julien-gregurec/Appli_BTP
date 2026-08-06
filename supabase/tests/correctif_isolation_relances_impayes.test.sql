-- Vérifie le correctif de la migration 20260806000199 : clé étrangère composite
-- garantissant que public.relances_impayes.facture_id appartient à la même entreprise
-- que la relance elle-même.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/isolation_multitenant.inc

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1. A ne peut pas creer une relance A liee a une facture B
select throws_like(
  $$insert into public.relances_impayes (entreprise_id, facture_id, niveau, canal, statut, date_prevue)
    values ('a0000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000001',1,'email','preparee',current_date)$$,
  '%violates%', '1. A ne peut pas creer une relance A liee a une facture B'
);

-- 5. Une relance A liee a une facture A reste possible
select lives_ok(
  $$insert into public.relances_impayes (id, entreprise_id, facture_id, niveau, canal, statut, date_prevue)
    values ('e9000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',1,'email','preparee',current_date)$$,
  '5. Une relance A liee a une facture A reste possible'
);

-- 3. A ne peut pas deplacer la relance A vers une facture B
select throws_like(
  $$update public.relances_impayes set facture_id = 'ba000000-0000-0000-0000-000000000001'
    where id = 'e9000000-0000-0000-0000-000000000001'$$,
  '%violates%', '3. A ne peut pas deplacer une relance vers une facture B'
);

-- 7. Changement d'entreprise avec facture incompatible : refuse (WITH CHECK gestion_update, non-regression)
select throws_like(
  $$update public.relances_impayes set entreprise_id = 'b0000000-0000-0000-0000-000000000001'
    where id = 'e9000000-0000-0000-0000-000000000001'$$,
  '%', '7. Le changement d''entreprise avec facture incompatible reste refuse'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

-- 2. B ne peut pas creer une relance B liee a une facture A
select throws_like(
  $$insert into public.relances_impayes (entreprise_id, facture_id, niveau, canal, statut, date_prevue)
    values ('b0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',1,'email','preparee',current_date)$$,
  '%violates%', '2. B ne peut pas creer une relance B liee a une facture A'
);

-- 6. Une relance B liee a une facture B reste possible
select lives_ok(
  $$insert into public.relances_impayes (id, entreprise_id, facture_id, niveau, canal, statut, date_prevue)
    values ('e9000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000001',1,'email','preparee',current_date)$$,
  '6. Une relance B liee a une facture B reste possible'
);

-- 4. B ne peut pas deplacer la relance B vers une facture A
select throws_like(
  $$update public.relances_impayes set facture_id = 'aa000000-0000-0000-0000-000000000001'
    where id = 'e9000000-0000-0000-0000-000000000002'$$,
  '%violates%', '4. B ne peut pas deplacer une relance vers une facture A'
);

reset role;

-- 8. Les policies RLS existantes restent dans l'etat attendu (5 policies)
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='relances_impayes'), 5,
  '8. Les policies RLS existantes sur relances_impayes restent inchangees (5 policies)'
);

-- 9. Le parcours normal de preparation de relance (memes colonnes que creerRelanceAction) reste compatible
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok(
  $$insert into public.relances_impayes (entreprise_id, facture_id, niveau, canal, statut, date_prevue, destinataire, sujet, message, created_by)
    values ('a0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',2,'email','preparee',current_date,'client@example.com','Rappel','Bonjour','10000000-0000-0000-0000-000000000001')$$,
  '9. Le parcours normal de creerRelanceAction (memes colonnes) reste compatible'
);
reset role;

-- 10. Baselines : les factures fixture A et B restent intactes apres les operations de test
select is(
  (select count(*) from public.factures where entreprise_id='a0000000-0000-0000-0000-000000000001') >= 1
  and (select count(*) from public.factures where entreprise_id='b0000000-0000-0000-0000-000000000001') >= 1,
  true,
  '10. Les baselines A et B (fixture) restent intactes apres les operations de test'
);

select * from finish();
rollback;
