-- Régression pour le blocker upgrade exact-tip de la migration
-- 20260921000300 (cf. docs/qualification/
-- ELSATIA_HISTORICAL_DATA_UPGRADE_HARDENING_V1.md) : le backfill de
-- `lignes_factures.entreprise_id` doit rester possible même quand une
-- facture est déjà émise, sans jamais affaiblir l'immuabilité de ses
-- lignes pour les écritures applicatives normales.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/isolation_multitenant.inc

-- Facture émise avec lignes déjà backfillées par la migration ledger
-- (Fresh applique 20260921000300 après cette fixture) : entreprise_id doit
-- déjà être présent, non nul, et cohérent avec la facture parente.
insert into public.factures (
  id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc
) values (
  'f2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
  null, 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
  'brouillon', 0, 0, 0
);

insert into public.lignes_factures (
  id, facture_id, designation, quantite, prix_unitaire_ht, taux_tva, ordre
) values (
  'f2100000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
  'Ligne test régression', 1, 1000, 20, 1
);

select is(
  (select entreprise_id from public.lignes_factures where id = 'f2100000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'entreprise_id est fixé automatiquement à l''insertion (trigger fixer_entreprise_ligne_facture)'
);

-- Émission : passage à "envoyee", verrouille les lignes.
update public.factures set statut = 'envoyee' where id = 'f2000000-0000-0000-0000-000000000001';

-- Le comportement applicatif de la migration 7 reste strictement inchangé :
-- une fois émise, une ligne de facture ne peut plus être ni modifiée...
select throws_like(
  $$update public.lignes_factures set designation = 'Modifiée' where id = 'f2100000-0000-0000-0000-000000000001'$$,
  '%ne peuvent plus être modifiées%',
  'une ligne de facture émise reste verrouillée après la migration 300 (designation)'
);

-- ...ni insérée...
select throws_like(
  $$insert into public.lignes_factures (facture_id, designation, quantite, prix_unitaire_ht, taux_tva, ordre)
    values ('f2000000-0000-0000-0000-000000000001', 'Ajout tardif', 1, 10, 20, 2)$$,
  '%ne peuvent plus être modifiées%',
  'impossible d''ajouter une ligne à une facture déjà émise'
);

-- ...ni supprimée.
select throws_like(
  $$delete from public.lignes_factures where id = 'f2100000-0000-0000-0000-000000000001'$$,
  '%ne peuvent plus être modifiées%',
  'impossible de supprimer une ligne d''une facture déjà émise'
);

-- Le trigger d'immuabilité est bien réactivé après la migration (pas laissé
-- désactivé par le backfill) : vérification directe du catalogue.
select ok(
  (select tgenabled = 'O' from pg_trigger
     where tgrelid = 'public.lignes_factures'::regclass
       and tgname = 'lignes_factures_brouillon_only'),
  'le trigger lignes_factures_brouillon_only est actif (non laissé désactivé par le backfill)'
);

-- Schéma attendu après le correctif upgrade-safe : colonne NOT NULL, FK
-- composite, index dédié — identique à Fresh, qu'on parte d'une base vide
-- ou d'une base historique avec factures déjà émises.
select col_not_null('public', 'lignes_factures', 'entreprise_id',
  'lignes_factures.entreprise_id est NOT NULL après le correctif upgrade-safe');

select has_index('public', 'lignes_factures', 'lignes_factures_entreprise_idx',
  'l''index de performance RLS existe sur lignes_factures.entreprise_id');

select col_not_null('public', 'lignes_devis', 'entreprise_id',
  'lignes_devis.entreprise_id est NOT NULL après le correctif upgrade-safe');

-- Isolation tenant : aucune ligne ne peut porter un entreprise_id différent
-- de celui de sa facture parente, y compris après backfill sur base
-- historique multi-tenant.
select is(
  (select count(*)::integer from public.lignes_factures lf
     join public.factures f on f.id = lf.facture_id
     where lf.entreprise_id is distinct from f.entreprise_id),
  0,
  'aucune ligne_facture n''a un entreprise_id divergent de sa facture parente'
);

select is(
  (select count(*)::integer from public.lignes_devis ld
     join public.devis d on d.id = ld.devis_id
     where ld.entreprise_id is distinct from d.entreprise_id),
  0,
  'aucune ligne_devis n''a un entreprise_id divergent de son devis parent'
);

select * from finish();
rollback;
