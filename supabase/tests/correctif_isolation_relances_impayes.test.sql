-- Vérifie le correctif de la migration 20260922000193 :
-- public.relances_impayes.facture_id est désormais protégé par une clé étrangère composite
-- (facture_id, entreprise_id).
--
-- Portage adapté (introspection de pg_constraint, `fixtures/isolation_multitenant.inc` absent
-- de ce dépôt) — voir correctif_isolation_factures.test.sql pour la même note.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select ok(
  (select 1 from pg_constraint where conname = 'relances_impayes_facture_entreprise_fkey') is not null,
  'la FK composite facture_id/entreprise_id existe sur relances_impayes'
);
select is(
  (select array_length(conkey, 1) from pg_constraint where conname = 'relances_impayes_facture_entreprise_fkey'),
  2, 'la FK facture_id/entreprise_id porte bien sur 2 colonnes'
);

select * from finish();
rollback;
