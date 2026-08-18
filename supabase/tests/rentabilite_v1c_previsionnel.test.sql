-- RENTABILITÉ-V1C : le prévisionnel (CA prévu, heures prévues, sous-traitance
-- prévue) s'appuie sur des tables et policies RLS déjà existantes et déjà
-- auditées (lignes_devis via la policy de devis, sous_traitants_chantiers).
-- Ce test vérifie que l'isolation cross-tenant tient toujours sur ces deux
-- tables, exactement comme pour le reste de la chaîne réalisée (V1B).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir fixtures/isolation_multitenant.inc

-- Lignes de devis "main d'œuvre en heures" (source du prévisionnel d'heures).
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('a9000000-0000-0000-0000-000000000001', 'TEST_A_Pose', 'main_oeuvre', 40, 'h', 35, 1),
  ('b9000000-0000-0000-0000-000000000001', 'TEST_B_Pose', 'main_oeuvre', 60, 'h', 35, 1)
on conflict do nothing;

update public.fournisseurs set type_tiers = 'sous_traitant' where id in ('ab000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001');

-- Sous-traitance prévisionnelle (source de coût prévu réellement dédiée).
insert into public.sous_traitants_chantiers (id, entreprise_id, fournisseur_id, chantier_id, mission, montant_previsionnel_ht, statut) values
  ('ac000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'TEST_A mission', 1500, 'prevue'),
  ('bc000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'TEST_B mission', 2500, 'prevue')
on conflict (id) do nothing;

set local role authenticated;

-- Admin A : lit ses lignes de devis (via le join sur devis) et sa sous-traitance prévue, jamais celles de B.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select count(*) from public.lignes_devis ld join public.devis d on d.id = ld.devis_id where ld.designation like 'TEST_%'),
  1::bigint,
  'admin A ne voit qu’une ligne de devis marquée TEST (la sienne)'
);
select is(
  (select ld.designation from public.lignes_devis ld join public.devis d on d.id = ld.devis_id where ld.designation like 'TEST_%'),
  'TEST_A_Pose',
  'admin A voit bien sa propre ligne, jamais celle de B'
);
select is((select count(*) from public.sous_traitants_chantiers where mission like 'TEST_%'), 1::bigint, 'admin A ne voit qu’une mission de sous-traitance marquée TEST (la sienne)');
select is((select montant_previsionnel_ht from public.sous_traitants_chantiers where mission like 'TEST_%'), 1500::numeric, 'admin A lit le bon montant prévisionnel (1500), jamais celui de B (2500)');

-- Ouvrier A (sans droit gestion devis/sous-traitants dans ce fixture) : aucun accès.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select is((select count(*) from public.lignes_devis ld join public.devis d on d.id = ld.devis_id where ld.designation like 'TEST_%'), 0::bigint, 'ouvrier A sans droit ne lit aucune ligne de devis');
select is((select count(*) from public.sous_traitants_chantiers where mission like 'TEST_%'), 0::bigint, 'ouvrier A sans droit ne lit aucune mission de sous-traitance');

-- Admin B : miroir symétrique.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select ld.designation from public.lignes_devis ld join public.devis d on d.id = ld.devis_id where ld.designation like 'TEST_%'),
  'TEST_B_Pose',
  'admin B voit sa propre ligne, jamais celle de A'
);
select is((select montant_previsionnel_ht from public.sous_traitants_chantiers where mission like 'TEST_%'), 2500::numeric, 'admin B lit son propre montant prévisionnel (2500), jamais celui de A');

reset role;

select * from finish();
rollback;
