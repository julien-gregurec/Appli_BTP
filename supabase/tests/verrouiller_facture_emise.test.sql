-- FINAL-FIX-P1-V1 (P1-4) : preuve d'exécution réelle du déclencheur
-- d'immutabilité des factures émises, désormais versionné
-- (20260822000222_verrouiller_facture_emise.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/isolation_multitenant.inc

-- Une facture brouillon reste librement modifiable et supprimable.
insert into public.factures (
  id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc
) values (
  'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
  'TEST-VERROU-001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
  'brouillon', 100, 20, 120
);

select lives_ok(
  $$update public.factures set montant_ht = 150, montant_tva = 30, montant_ttc = 180 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'une facture brouillon reste librement modifiable'
);

-- Émission : passage à "envoyee".
update public.factures set statut = 'envoyee' where id = 'f1000000-0000-0000-0000-000000000001';

-- Une fois émise, le contenu (montant) ne peut plus être modifié.
select throws_like(
  $$update public.factures set montant_ht = 999 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '%déjà été émise%',
  'une facture émise ne peut plus voir son montant modifié'
);

-- Un champ "libre" (montant_paye, mise à jour de règlement) reste modifiable.
select lives_ok(
  $$update public.factures set montant_paye = 50 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'le suivi de règlement (montant_paye) reste modifiable sur une facture émise'
);

-- Impossible de la faire revenir en brouillon.
select throws_like(
  $$update public.factures set statut = 'brouillon' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '%ne peut pas redevenir brouillon%',
  'une facture émise ne peut pas redevenir brouillon'
);

-- Impossible de la supprimer.
select throws_like(
  $$delete from public.factures where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '%ne peut plus être supprimée%',
  'une facture émise ne peut pas être supprimée'
);

-- Elle reste bien présente après la tentative de suppression refusée.
select is(
  (select count(*)::integer from public.factures where id = 'f1000000-0000-0000-0000-000000000001'),
  1,
  'la facture émise existe toujours après la tentative de suppression refusée'
);

select * from finish();
rollback;
