-- Vérifie le correctif de la migration 20260922000191 : quatre relations de public.factures
-- (client_id, devis_origine_id, facture_origine_id, facture_parente_id) sont désormais
-- protégées par une clé étrangère composite (colonne, entreprise_id), sur le modèle déjà en
-- place pour chantier_id.
--
-- Portage adapté du test source (`fixtures/isolation_multitenant.inc` absent de ce dépôt,
-- même constat que les portages précédents) : introspection de pg_constraint plutôt que
-- simulation comportementale à deux entreprises, dans le style déjà en usage sur cette
-- branche pour les correctifs de ce type (voir correctif_rls_ecriture_chantiers.test.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  (select 1 from pg_constraint where conname = 'factures_client_entreprise_fkey') is not null,
  'la FK composite client_id/entreprise_id existe sur factures'
);
select ok(
  (select 1 from pg_constraint where conname = 'factures_devis_origine_entreprise_fkey') is not null,
  'la FK composite devis_origine_id/entreprise_id existe sur factures'
);
select ok(
  (select 1 from pg_constraint where conname = 'factures_facture_origine_entreprise_fkey') is not null,
  'la FK composite facture_origine_id/entreprise_id existe sur factures'
);
select ok(
  (select 1 from pg_constraint where conname = 'factures_facture_parente_entreprise_fkey') is not null,
  'la FK composite facture_parente_id/entreprise_id existe sur factures'
);

-- Chaque contrainte référence bien la paire (colonne, entreprise_id), pas seulement la colonne.
select is(
  (select array_length(conkey, 1) from pg_constraint where conname = 'factures_client_entreprise_fkey'),
  2, 'la FK client_id/entreprise_id porte bien sur 2 colonnes'
);
select is(
  (select array_length(conkey, 1) from pg_constraint where conname = 'factures_devis_origine_entreprise_fkey'),
  2, 'la FK devis_origine_id/entreprise_id porte bien sur 2 colonnes'
);
select is(
  (select array_length(conkey, 1) from pg_constraint where conname = 'factures_facture_origine_entreprise_fkey'),
  2, 'la FK facture_origine_id/entreprise_id porte bien sur 2 colonnes'
);
select is(
  (select array_length(conkey, 1) from pg_constraint where conname = 'factures_facture_parente_entreprise_fkey'),
  2, 'la FK facture_parente_id/entreprise_id porte bien sur 2 colonnes'
);

-- Les index uniques nécessaires comme cibles des FK composites existent.
select has_index('public', 'devis', 'devis_id_entreprise_unique', 'index unique (id, entreprise_id) sur devis');
select has_index('public', 'factures', 'factures_id_entreprise_unique', 'index unique (id, entreprise_id) sur factures');

select * from finish();
rollback;
