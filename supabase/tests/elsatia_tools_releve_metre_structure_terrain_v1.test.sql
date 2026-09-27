-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 3 — STRUCTURE TERRAIN & RELEVÉ MÉTIER V1
--
-- Qualifie la migration 20260928000701 sous RLS réelle (`set local role` + `request.jwt.claim.sub`) :
--   H1–H8    hiérarchie métier : chantier (client, référence, description, date, statut), étage libre
--            (combles sans niveau, demi-niveau), zones et pièces terrain (types, statut, commentaire, surface) ;
--   D1–D4    déplacements cohérents (pièce ↔ zone du même étage), refus inter-étage ;
--   O1–O5    réordre (RPC) : complet, incomplet, parents mélangés, regroupement des pièces par zone ;
--   U1–U6    duplication (RPC) : structure copiée, jamais les éléments ; niveau suivant ; refus hors droits ;
--   A1–A5    audit : création, renommage, déplacement, réordre, suppression, restauration, duplication ;
--   C1–C4    cascade et détachement : étage → zones/pièces, zone → pièces détachées, restauration ;
--   V1–V3    versions : INITIALE réelle (instantané Lot 3), unicité, corrigée ;
--   S1–S5    recherche (RPC) : relevé / chantier / bâtiment / pièce, filtres, isolation ;
--   R1–R9    RLS : owner, org manager, membre autorisé, consultation, autre organisation,
--            authentifié non autorisé, anonyme, service_role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'tools', 'tools_pro', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004',
                  '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006']::uuid[]) u;
-- 10…02 : Tools Pro SANS l'add-on Relevé (authentifié non autorisé).
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
  values ('10000000-0000-0000-0000-000000000002', 'tools', 'pro', public.tools_capabilities_pro(), 'web');

-- Identifiants lisibles : 3a… relevé / chantier / bâtiments / étages / zones / pièces.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

-- ─────────────────────────────────────────────────────────────
-- H. Hiérarchie métier
-- ─────────────────────────────────────────────────────────────
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom, reference, client_nom)
  values ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Résidence Tilleuls', 'Site Tilleuls', 'REL-042', 'SCI Tilleuls');
select lives_ok($$
  insert into public.tools_releves_chantiers(id, releve_id, nom, client_nom, adresse, code_postal, ville, reference, description, date_releve, statut)
  values ('3a100000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', 'Chantier Nord', 'SCI Tilleuls', '3 rue des Lilas', '68000', 'Colmar',
          'CH-01', 'Relevé avant rénovation', '2026-09-28', 'en_cours') $$,
  'H1. chantier : nom, client, adresse, CP, ville, référence, description, date, statut');
select throws_ok($$ update public.tools_releves_chantiers set statut = 'perdu' where id = '3a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'H2. statut de chantier inconnu refusé');
insert into public.tools_releves_batiments(id, releve_id, chantier_id, nom, ordre) values
  ('3a200000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '3a100000-0000-0000-0000-000000000001', 'Bâtiment A', 0),
  ('3a200000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000001', '3a100000-0000-0000-0000-000000000001', 'Bâtiment B', 1);
select lives_ok($$
  insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau, categorie_niveau, ordre) values
  ('3a300000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '3a200000-0000-0000-0000-000000000001', 'Sous-sol', -1, 'sous_sol', 0),
  ('3a300000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000001', '3a200000-0000-0000-0000-000000000001', 'RDC', 0, 'rdc', 1),
  ('3a300000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000001', '3a200000-0000-0000-0000-000000000001', 'R+1', 1, 'etage', 2),
  ('3a300000-0000-0000-0000-000000000004', '3a000000-0000-0000-0000-000000000001', '3a200000-0000-0000-0000-000000000001', 'Combles', null, 'combles', 3),
  ('3a300000-0000-0000-0000-000000000005', '3a000000-0000-0000-0000-000000000001', '3a200000-0000-0000-0000-000000000001', 'Entresol', 0.5, 'entresol', 4) $$,
  'H3. étages libres : sous-sol, RDC, R+1, combles SANS niveau, entresol à 0,5');
select throws_ok($$
  insert into public.tools_releves_etages(releve_id, batiment_id, nom, niveau, categorie_niveau)
  values ('3a000000-0000-0000-0000-000000000001', '3a200000-0000-0000-0000-000000000001', 'Grenier', 1, 'grenier') $$,
  '23514', null, 'H4. catégorie de niveau inconnue refusée');
select lives_ok($$
  insert into public.tools_releves_zones(id, releve_id, etage_id, nom, type) values
  ('3a400000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000003', 'Appartement 12', 'appartement'),
  ('3a400000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000003', 'Aile est', 'aile'),
  ('3a400000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000002', 'Zone technique', 'zone_technique') $$,
  'H5. zones terrain : appartement, aile, zone technique');
select lives_ok($$
  insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, commentaire, statut, surface_declaree_mm2, ordre) values
  ('3a500000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000003', '3a400000-0000-0000-0000-000000000001', 'Séjour', 'sejour', 2500, 'Parquet ancien', 'en_cours', 24500000, 0),
  ('3a500000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000003', '3a400000-0000-0000-0000-000000000001', 'Chambre', 'chambre', null, null, 'a_relever', null, 1),
  ('3a500000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000003', null, 'Palier', 'circulation', null, null, 'a_relever', null, 2),
  ('3a500000-0000-0000-0000-000000000004', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000002', '3a400000-0000-0000-0000-000000000003', 'Chaufferie', 'local_technique', 2200, null, 'relevee', null, 0),
  ('3a500000-0000-0000-0000-000000000005', '3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000002', null, 'Réserve', 'stockage', null, null, 'verifiee', null, 1) $$,
  'H6. fiches pièces : types terrain, hauteur, commentaire, statut, surface déclarée');
select throws_ok($$ update public.tools_releves_pieces set statut = 'finie' where id = '3a500000-0000-0000-0000-000000000001' $$,
  '23514', null, 'H7. statut de pièce inconnu refusé');
select throws_ok($$ update public.tools_releves_pieces set surface_declaree_mm2 = 0 where id = '3a500000-0000-0000-0000-000000000001' $$,
  '23514', null, 'H8. surface déclarée nulle ou négative refusée');

-- ─────────────────────────────────────────────────────────────
-- D. Déplacements cohérents
-- ─────────────────────────────────────────────────────────────
select lives_ok($$ update public.tools_releves_pieces set zone_id = '3a400000-0000-0000-0000-000000000002' where id = '3a500000-0000-0000-0000-000000000003' $$,
  'D1. pièce déplacée vers une autre zone du même étage');
select throws_ok($$ update public.tools_releves_pieces set zone_id = '3a400000-0000-0000-0000-000000000003' where id = '3a500000-0000-0000-0000-000000000003' $$,
  '23503', null, 'D2. pièce vers une zone d''un autre étage refusée (clé composite)');
select throws_ok($$ update public.tools_releves_pieces set etage_id = '3a300000-0000-0000-0000-000000000002', zone_id = null where id = '3a500000-0000-0000-0000-000000000003' $$,
  '42501', null, 'D3. une pièce ne change pas d''étage (ses éléments y sont rattachés)');
select throws_ok($$ update public.tools_releves_zones set etage_id = '3a300000-0000-0000-0000-000000000002' where id = '3a400000-0000-0000-0000-000000000002' $$,
  '42501', null, 'D4. une zone ne change pas d''étage');
update public.tools_releves_pieces set zone_id = null where id = '3a500000-0000-0000-0000-000000000003';

-- ─────────────────────────────────────────────────────────────
-- O. Réordre
-- ─────────────────────────────────────────────────────────────
select is(public.tools_releve_reordonner('batiment', array['3a200000-0000-0000-0000-000000000002','3a200000-0000-0000-0000-000000000001']::uuid[]),
  2, 'O1. bâtiments réordonnés (liste complète)');
select is((select string_agg(nom, ',' order by ordre) from public.tools_releves_batiments where releve_id = '3a000000-0000-0000-0000-000000000001'),
  'Bâtiment B,Bâtiment A', 'O2. nouvel ordre persisté, relations intactes');
select throws_ok($$ select public.tools_releve_reordonner('etage', array['3a300000-0000-0000-0000-000000000002']::uuid[]) $$,
  '22023', null, 'O3. liste incomplète refusée (aucun réordre partiel)');
select throws_ok($$ select public.tools_releve_reordonner('piece', array['3a500000-0000-0000-0000-000000000001','3a500000-0000-0000-0000-000000000003']::uuid[]) $$,
  '22023', null, 'O4. pièces de regroupements différents (zone / sans zone) refusées');
select is(public.tools_releve_reordonner('piece', array['3a500000-0000-0000-0000-000000000002','3a500000-0000-0000-0000-000000000001']::uuid[]),
  2, 'O5. pièces réordonnées au sein de leur zone');

-- ─────────────────────────────────────────────────────────────
-- U. Duplication (structure seule)
-- ─────────────────────────────────────────────────────────────
insert into public.tools_releves_elements(releve_id, type, etage_id, piece_id, donnees) values
  ('3a000000-0000-0000-0000-000000000001', 'mur', '3a300000-0000-0000-0000-000000000003', '3a500000-0000-0000-0000-000000000001',
   '{"a":{"x":0,"y":0},"b":{"x":4200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}');
create temporary table _dup on commit drop as
  select public.tools_releve_dupliquer('batiment', '3a200000-0000-0000-0000-000000000001', null) as batiment;
select is(
  (select count(*)::int from public.tools_releves_etages e join _dup on e.batiment_id = _dup.batiment) || '|' ||
  (select count(*)::int from public.tools_releves_zones z join public.tools_releves_etages e on e.id = z.etage_id join _dup on e.batiment_id = _dup.batiment) || '|' ||
  (select count(*)::int from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id join _dup on e.batiment_id = _dup.batiment),
  '5|3|5', 'U1. bâtiment dupliqué : 5 étages, 3 zones, 5 pièces');
select is(
  (select count(*)::int from public.tools_releves_elements x join public.tools_releves_etages e on e.id = x.etage_id join _dup on e.batiment_id = _dup.batiment),
  0, 'U2. aucun élément (mur, mesure, photo…) recopié');
select is(
  (select string_agg(p.statut || ':' || coalesce(p.commentaire, '-') || ':' || coalesce(p.surface_declaree_mm2::text, '-'), ',' order by p.nom)
     from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id join _dup on e.batiment_id = _dup.batiment where p.etage_id is not null and e.nom = 'R+1'),
  'a_relever:-:-,a_relever:-:-,a_relever:-:-', 'U3. pièces copiées « à relever », sans commentaire ni surface déclarée');
create temporary table _dup2 on commit drop as
  select public.tools_releve_dupliquer('etage', '3a300000-0000-0000-0000-000000000003', 'R+2') as etage,
         public.tools_releve_dupliquer('piece', '3a500000-0000-0000-0000-000000000001') as piece;
select is(
  (select nom || '|' || niveau from public.tools_releves_etages e join _dup2 on e.id = _dup2.etage),
  'R+2|2.0', 'U4. étage dupliqué au niveau suivant');
select is(
  (select nom || '|' || coalesce(zone_id::text, '-') from public.tools_releves_pieces p join _dup2 on p.id = _dup2.piece),
  'Séjour (copie)|3a400000-0000-0000-0000-000000000001', 'U5. pièce dupliquée dans la même zone');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
update public.tools_releves set visibilite = 'entreprise' where id = '3a000000-0000-0000-0000-000000000001'; -- sans effet (consultation) : partagé plus bas
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
update public.tools_releves set visibilite = 'entreprise' where id = '3a000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.tools_releve_dupliquer('piece', '3a500000-0000-0000-0000-000000000001') $$,
  '42501', null, 'U6. consultation : duplication refusée (RLS à l''insertion)');

-- ─────────────────────────────────────────────────────────────
-- A. Audit
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
update public.tools_releves_batiments set nom = 'Bâtiment Nord' where id = '3a200000-0000-0000-0000-000000000001';
update public.tools_releves_pieces set zone_id = '3a400000-0000-0000-0000-000000000002' where id = '3a500000-0000-0000-0000-000000000003';
update public.tools_releves_pieces set nom = nom where id = '3a500000-0000-0000-0000-000000000005';
select is(
  (select action from public.tools_releves_journal where entite_id = '3a200000-0000-0000-0000-000000000001' order by id desc limit 1),
  'renommage', 'A1. renommage tracé comme tel');
select is(
  (select action from public.tools_releves_journal where entite_id = '3a500000-0000-0000-0000-000000000003' order by id desc limit 1),
  'deplacement', 'A2. déplacement de pièce tracé');
select ok(
  exists (select 1 from public.tools_releves_journal where entite_id = '3a200000-0000-0000-0000-000000000002' and action = 'reordre' and champs = array['ordre']),
  'A3. réordre tracé (champ ordre)');
select ok(
  exists (select 1 from public.tools_releves_journal where action = 'duplication' and champs = array['source:3a200000-0000-0000-0000-000000000001']),
  'A4. duplication tracée avec sa source');
select is(
  (select count(*)::int from public.tools_releves_journal where entite_id = '3a500000-0000-0000-0000-000000000005' and action <> 'creation'),
  0, 'A5. écriture sans changement : aucune ligne d''audit parasite');

-- ─────────────────────────────────────────────────────────────
-- C. Cascade et détachement
-- ─────────────────────────────────────────────────────────────
update public.tools_releves_etages set deleted_at = now() where id = '3a300000-0000-0000-0000-000000000003';
select is(
  (select count(*)::int from public.tools_releves_pieces where etage_id = '3a300000-0000-0000-0000-000000000003' and deleted_at is null)
   + (select count(*)::int from public.tools_releves_zones where etage_id = '3a300000-0000-0000-0000-000000000003' and deleted_at is null)
   + (select count(*)::int from public.tools_releves_elements where etage_id = '3a300000-0000-0000-0000-000000000003' and deleted_at is null),
  0, 'C1. étage supprimé : zones, pièces et éléments retirés en cascade (suppression douce)');
select ok(
  exists (select 1 from public.tools_releves_journal where entite_id = '3a300000-0000-0000-0000-000000000003' and action = 'suppression'),
  'C2. suppression tracée');
update public.tools_releves_etages set deleted_at = null where id = '3a300000-0000-0000-0000-000000000003';
select is(
  (select count(*)::int from public.tools_releves_pieces where etage_id = '3a300000-0000-0000-0000-000000000003' and deleted_at is null),
  4, 'C3. restauration symétrique (pièces ranimées) et tracée')
  ;
update public.tools_releves_zones set deleted_at = now() where id = '3a400000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.tools_releves_pieces where zone_id = '3a400000-0000-0000-0000-000000000001' and deleted_at is null),
  3, 'C4. zone supprimée : ses pièces restent (détachées de la zone côté affichage)');
update public.tools_releves_zones set deleted_at = null where id = '3a400000-0000-0000-0000-000000000001';

-- ─────────────────────────────────────────────────────────────
-- V. Versions
-- ─────────────────────────────────────────────────────────────
create temporary table _v on commit drop as
  select * from public.tools_releve_creer_version('3a000000-0000-0000-0000-000000000001', 'Relevé initial', 'initial');
select is(
  (select type_version || '|' || numero || '|' || (contenu->'chantiers'->0->>'client_nom') || '|' ||
          (select count(*) from jsonb_array_elements(contenu->'etages') e where e->>'categorie_niveau' = 'combles' and e->>'niveau' is null) from _v),
  'initial|1|SCI Tilleuls|2', 'V1. version INITIALE réelle : instantané avec les champs Lot 3 (client ; combles sans niveau, original et copie)');
select throws_ok($$ select public.tools_releve_creer_version('3a000000-0000-0000-0000-000000000001', null, 'initial') $$,
  '23505', null, 'V2. INITIALE unique');
select is(
  (select type_version || '|' || numero from public.tools_releve_creer_version('3a000000-0000-0000-0000-000000000001', null, 'corrige')),
  'corrige|2', 'V3. version corrigée typée (projetée / tel que construit préparées)');

-- ─────────────────────────────────────────────────────────────
-- S. Recherche
-- ─────────────────────────────────────────────────────────────
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom, statut)
  values ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Entrepôt archivé', 'Entrepôt', 'archive');
select is(
  (select string_agg(type || ':' || libelle, ',' order by type, libelle) from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'chambre')),
  'piece:Chambre,piece:Chambre,piece:Chambre', 'S1. recherche d''une pièce (originale + 2 copies de structure)');
select is(
  (select string_agg(distinct type, ',') from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'colmar')),
  'chantier', 'S2. recherche d''un chantier (ville)');
select is(
  (select string_agg(libelle, ',') from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', '', 'archive')),
  'Entrepôt archivé', 'S3. filtre archivé');
select is(
  (select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'Bâtiment%', 'actif')),
  0, 'S4. les jokers saisis sont échappés (recherche littérale)');
select is(
  (select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', '', 'recent')),
  2, 'S5. filtre récent');

-- ─────────────────────────────────────────────────────────────
-- R. Matrice RLS
-- ─────────────────────────────────────────────────────────────
-- Admin Relevé A (org manager)
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select lives_ok($$ update public.tools_releves_pieces set commentaire = 'Vu par l''admin' where id = '3a500000-0000-0000-0000-000000000004' $$,
  'R1. org manager (admin Relevé) : modifie la fiche pièce');
-- Second métreur A (membre autorisé, relevé partagé)
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(public.tools_releve_reordonner('zone', array['3a400000-0000-0000-0000-000000000002','3a400000-0000-0000-0000-000000000001']::uuid[]),
  1, 'R2. membre autorisé (métreur, relevé partagé) : réordonne (1 rang modifié)');
-- Consultation A
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releves_pieces where releve_id = '3a000000-0000-0000-0000-000000000001' and deleted_at is null), 14,
  'R3. consultation : lit la structure partagée');
select throws_ok($$ select public.tools_releve_reordonner('zone', array['3a400000-0000-0000-0000-000000000001','3a400000-0000-0000-0000-000000000002']::uuid[]) $$,
  '42501', null, 'R4. consultation : réordre refusé explicitement');
with u as (update public.tools_releves_pieces set nom = 'Piraté' where id = '3a500000-0000-0000-0000-000000000004' returning 1)
select is((select count(*)::int from u), 0, 'R5. consultation : aucune modification');
-- Tools Pro sans add-on (authentifié non autorisé)
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.tools_releves_pieces) + (select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', '')),
  0, 'R6. authentifié sans « releve-metre » : rien de visible, recherche vide');
-- Autre organisation
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is(
  (select count(*)::int from public.tools_releves_chantiers) + (select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', '')),
  0, 'R7. autre organisation : aucune ligne, aucune recherche cross-tenant');
select throws_ok($$ select public.tools_releve_dupliquer('batiment', '3a200000-0000-0000-0000-000000000001') $$,
  'P0002', null, 'R8. autre organisation : duplication impossible (source invisible)');
reset role;
set local role anon;
select throws_ok($$ select public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', '') $$,
  '42501', null, 'R9a. anonyme : RPC de recherche non exécutable');
select throws_ok($$ select count(*) from public.tools_releves_pieces $$,
  '42501', null, 'R9b. anonyme : table inaccessible');
reset role;
set local role service_role;
select is((select count(*)::int from public.tools_releves_pieces where releve_id = '3a000000-0000-0000-0000-000000000001'), 14,
  'R10. service_role : lecture technique complète (RLS contournée, usage serveur uniquement)');
select throws_ok($$
  insert into public.tools_releves_pieces(releve_id, etage_id, entreprise_id, nom)
  values ('3a000000-0000-0000-0000-000000000001', '3a300000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Forgée') $$,
  '23503', null, 'R11. service_role : tenant non forgeable (clé composite relevé/entreprise)');
select throws_ok($$ select public.tools_releve_reordonner('batiment', array['3a200000-0000-0000-0000-000000000001']::uuid[]) $$,
  '42501', null, 'R12. service_role sans utilisateur : RPC métier refusées');
reset role;

-- Upgrade Lot 2 → Lot 3 : catégorie déduite du niveau (simulation sur une ligne ré-écrite sans catégorie).
select is(
  (select string_agg(categorie_niveau, ',' order by niveau) from public.tools_releves_etages
    where batiment_id = '3a200000-0000-0000-0000-000000000001' and niveau is not null and deleted_at is null),
  'sous_sol,rdc,entresol,etage,etage', 'M1. catégories cohérentes avec les niveaux');
select col_type_is('public', 'tools_releves_etages', 'niveau', 'numeric(5,1)', 'M2. niveau décimal');
select col_is_null('public', 'tools_releves_etages', 'niveau', 'M3. niveau facultatif');
select col_default_is('public', 'tools_releves_pieces', 'statut', 'a_relever', 'M4. statut de pièce par défaut « à relever »');

select * from finish();
rollback;
