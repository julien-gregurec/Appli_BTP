-- =====================================================================================================
-- PREUVE pgTAP — GP V1, totaux de devis recalculés par instruction (migration 20260913000292).
-- Le résultat est identique au recalcul par ligne ; le déclencheur par ligne a disparu.
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc, remise_globale)
values ('a9000000-0000-0000-0000-000000000292', 'a0000000-0000-0000-0000-000000000001', 'PGTAP-A-292', 'a3000000-0000-0000-0000-000000000001', null, 'brouillon', 0, 0, 0, 0);

select hasnt_trigger('public', 'lignes_devis', 'recalc_devis_apres_ligne', 'le déclencheur par ligne a disparu');
select has_trigger('public', 'lignes_devis', 'recalc_devis_apres_lignes_insertion', 'déclencheur par instruction (insertion)');
select has_trigger('public', 'lignes_devis', 'recalc_devis_apres_lignes_suppression', 'déclencheur par instruction (suppression)');
select has_trigger('public', 'lignes_devis', 'recalc_devis_apres_lignes_modification', 'déclencheur par instruction (modification)');
select hasnt_function('public', 'trg_recalc_devis', 'l''ancienne fonction par ligne est retirée');

-- Trois lignes en UNE instruction : 3 × 10 + 2 × 5,50 + 1 × 100 = 141 HT, TVA 20 % = 28,20.
insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, taux_tva, ordre, cle_ligne)
values ('a9000000-0000-0000-0000-000000000292', 'L1', 3, 10, 20, 1, 'l1'),
       ('a9000000-0000-0000-0000-000000000292', 'L2', 2, 5.5, 20, 2, 'l2'),
       ('a9000000-0000-0000-0000-000000000292', 'L3', 1, 100, 20, 3, 'l3');
select is((select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 141.00::numeric, 'HT après insertion groupée');
select is((select montant_tva from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 28.20::numeric, 'TVA après insertion groupée');
select is((select montant_ttc from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 169.20::numeric, 'TTC après insertion groupée');

-- Modification groupée : quantités doublées → 282 HT.
update public.lignes_devis set quantite = quantite * 2 where devis_id = 'a9000000-0000-0000-0000-000000000292';
select is((select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 282.00::numeric, 'HT après modification groupée');

-- Suppression groupée de deux lignes → reste L3 : 2 × 100 = 200 HT.
delete from public.lignes_devis where devis_id = 'a9000000-0000-0000-0000-000000000292' and cle_ligne in ('l1', 'l2');
select is((select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 200.00::numeric, 'HT après suppression groupée');

-- Instruction sans ligne touchée : totaux inchangés, aucune erreur.
select lives_ok($$delete from public.lignes_devis where devis_id = 'a9000000-0000-0000-0000-000000000292' and cle_ligne = 'absente'$$, 'suppression à vide : sans erreur');
select is((select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 200.00::numeric, 'HT inchangé après instruction à vide');

-- Remise globale : le recalcul la respecte (10 % → 180 HT).
update public.devis set remise_globale = 10 where id = 'a9000000-0000-0000-0000-000000000292';
update public.lignes_devis set ordre = ordre where devis_id = 'a9000000-0000-0000-0000-000000000292';
select is((select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000292'), 180.00::numeric, 'HT avec remise globale après recalcul par instruction');

select * from finish();
rollback;
