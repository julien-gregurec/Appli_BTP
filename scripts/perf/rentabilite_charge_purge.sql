-- ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — retire le jeu de charge
-- scripts/perf/rentabilite_charge.sql (pour recharger avec un autre volume).
-- Superutilisateur, base de test uniquement : les triggers métier (factures
-- émises immuables, stock…) sont désactivés le temps de la purge.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
delete from public.pointages where tache = 'CHARGE-RENT-V1';
delete from public.affectations where tache like 'CHARGE-RENT-V1 #%';
delete from public.notes_frais where reference like 'CHR-NDF-%';
delete from public.mouvements_stock where motif = 'CHARGE-RENT-V1';
delete from public.articles_stock where reference = 'CHR-STK-01';
delete from public.depenses_fournisseurs where numero_piece like 'CHR-DEP-%';
delete from public.factures where numero like 'CHR-FAC-%';
delete from public.devis where numero like 'CHR-DEV-%';
delete from public.employes_cout_horaire c using public.employes e where e.id = c.employe_id and e.numero_inscription like 'CHARGE-RENT-V1-%';
delete from public.employes where numero_inscription like 'CHARGE-RENT-V1-%';
delete from public.chantiers where nom like 'Charge rentabilité V1 - %';
delete from public.fournisseurs where reference = 'CHR-FOU-01' and nom = 'Fournisseur charge rentabilité V1';
delete from public.clients where nom = 'Client charge rentabilité V1';
commit;
