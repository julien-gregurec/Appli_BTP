-- Vérifie le correctif de la migration 20260922000192 : public.devis.client_id est désormais
-- protégé par une clé étrangère composite (client_id, entreprise_id), sur le modèle déjà en
-- place pour chantier_id.
--
-- Portage adapté (introspection de pg_constraint, `fixtures/isolation_multitenant.inc` absent
-- de ce dépôt) — voir correctif_isolation_factures.test.sql pour la même note.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(
  (select 1 from pg_constraint where conname = 'devis_client_entreprise_fkey') is not null,
  'la FK composite client_id/entreprise_id existe sur devis'
);
select is(
  (select array_length(conkey, 1) from pg_constraint where conname = 'devis_client_entreprise_fkey'),
  2, 'la FK client_id/entreprise_id porte bien sur 2 colonnes'
);
select has_index('public', 'clients', 'clients_id_entreprise_unique', 'index unique (id, entreprise_id) sur clients (préexistant)');

select * from finish();
rollback;
