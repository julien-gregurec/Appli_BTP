-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 3 — STRUCTURE TERRAIN & RELEVÉ MÉTIER V1
--
-- Qualifie la migration 20260927000701_tools_releve_metre_lot3_structure_terrain :
--   H1–H12  hiérarchie : champs chantier / étage / zone / pièce, parents immuables, déplacements maîtrisés ;
--   D1–D7   duplication : sous-structure copiée, AUCUN élément ni média, constats de terrain non recopiés ;
--   O1–O4   réordonnancement atomique ;
--   C1–C5   cascade de suppression douce et restauration sous parent actif ;
--   V1–V4   versions : initiale, corrigée, projetée, tel que construit ;
--   J1–J5   audit : création, renommage, déplacement, réordonnancement, suppression, restauration, duplication ;
--   S1–S4   recherche ;
--   P1–P16  permissions view/create/edit/delete : propriétaire, manager d'organisation (admin Relevé),
--           membre (métreur non propriétaire, consultation), autre tenant, Tools Pro sans add-on, anonyme.
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'tools', 'tools_pro', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003',
                  '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005',
                  '20000000-0000-0000-0000-000000000006']::uuid[]) u;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
  values ('10000000-0000-0000-0000-000000000004', 'tools', 'pro', public.tools_capabilities_pro(), 'web');

set local role authenticated;

-- ── Propriétaire (métreur 10…03) : structure de référence ─────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('f3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Résidence Les Tilleuls', 'Site principal'),
  ('f3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Relevé partagé', 'Site partagé');
update public.tools_releves set visibilite = 'entreprise' where id = 'f3000000-0000-0000-0000-000000000002';
insert into public.tools_releves_chantiers(id, releve_id, nom) values
  ('f3100000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'Chantier Nord'),
  ('f3100000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'Chantier Sud'),
  ('f3100000-0000-0000-0000-000000000010', 'f3000000-0000-0000-0000-000000000002', 'Chantier partagé');
insert into public.tools_releves_batiments(id, releve_id, chantier_id, nom, ordre) values
  ('f3200000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f3100000-0000-0000-0000-000000000001', 'Bâtiment A', 0),
  ('f3200000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'f3100000-0000-0000-0000-000000000001', 'Extension', 1),
  ('f3200000-0000-0000-0000-000000000010', 'f3000000-0000-0000-0000-000000000002', 'f3100000-0000-0000-0000-000000000010', 'Maison principale', 0);
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau, type_niveau, ordre) values
  ('f3300000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-000000000001', 'RDC', 0, 'rdc', 0),
  ('f3300000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-000000000001', 'R+1', 1, 'etage', 1),
  ('f3300000-0000-0000-0000-000000000010', 'f3000000-0000-0000-0000-000000000002', 'f3200000-0000-0000-0000-000000000010', 'RDC', 0, 'rdc', 0);
insert into public.tools_releves_zones(id, releve_id, etage_id, nom, type, ordre) values
  ('f3400000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000002', 'Appartement 12', 'appartement', 0),
  ('f3400000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000002', 'Aile Est', 'aile', 1),
  ('f3400000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000001', 'Plateau RDC', 'plateau', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage, ordre, commentaire, statut) values
  ('f3500000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000002', 'f3400000-0000-0000-0000-000000000001', 'Bureau 12', 'bureau', 0, 'Fissure mur nord', 'releve'),
  ('f3500000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000002', null, 'Séjour', 'sejour', 1, null, 'en_cours'),
  ('f3500000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000001', 'f3400000-0000-0000-0000-000000000003', 'WC', 'wc', 0, null, 'a_relever'),
  ('f3500000-0000-0000-0000-000000000010', 'f3000000-0000-0000-0000-000000000002', 'f3300000-0000-0000-0000-000000000010', null, 'Cuisine', 'cuisine', 0, null, 'a_relever');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('f3600000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'mur', 'f3300000-0000-0000-0000-000000000002', 'f3500000-0000-0000-0000-000000000001',
   '{"a":{"x":0,"y":0},"b":{"x":4200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}');

-- ── Hiérarchie ────────────────────────────────────────────────────────────────
with up as (
  update public.tools_releves_chantiers
  set client_nom = 'SCI Tilleuls', reference = 'CH-2026-014', description = 'Réhabilitation R+1',
      date_releve = '2026-09-27', statut = 'a_relever', code_postal = '67000', ville = 'Strasbourg', adresse = '3 rue des Tilleuls'
  where id = 'f3100000-0000-0000-0000-000000000001' and revision = 1
  returning client_nom || '|' || reference || '|' || date_releve || '|' || statut || '|' || revision)
select is((select * from up), 'SCI Tilleuls|CH-2026-014|2026-09-27|a_relever|2',
  'H1. chantier : client, référence, description, date, statut, adresse (contrôle de révision)');
select throws_ok($$update public.tools_releves_chantiers set statut = 'inconnu' where id = 'f3100000-0000-0000-0000-000000000001'$$,
  '23514', null, 'H2. chantier : statut hors liste refusé');
select lives_ok($$insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau, type_niveau, altitude_mm, ordre) values
  ('f3300000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-000000000001', 'Combles', 2, 'combles', 5600, 2),
  ('f3300000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-000000000001', 'Sous-sol', -1, 'sous_sol', -2800, 3)$$,
  'H3. étage : sous-sol, combles, altitude — sans structure uniquement numérique');
select throws_ok($$update public.tools_releves_etages set type_niveau = 'grenier' where id = 'f3300000-0000-0000-0000-000000000003'$$,
  '23514', null, 'H4. étage : type de niveau hors liste refusé');
select is((select string_agg(type, ',' order by ordre) from public.tools_releves_zones where etage_id = 'f3300000-0000-0000-0000-000000000002'),
  'appartement,aile', 'H5. zone : types aile / appartement / plateau acceptés');
select lives_ok($$insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage, ordre) values
  ('f3500000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000002', 'Couloir', 'circulation', 2),
  ('f3500000-0000-0000-0000-000000000005', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000002', 'Local chaufferie', 'local_technique', 3),
  ('f3500000-0000-0000-0000-000000000006', 'f3000000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000004', 'Réserve', 'stockage', 0)$$,
  'H6. pièce : types circulation, local technique, stockage');
select throws_ok($$update public.tools_releves_pieces set statut = 'fini' where id = 'f3500000-0000-0000-0000-000000000001'$$,
  '23514', null, 'H7. pièce : statut hors liste refusé');
with up as (
  update public.tools_releves_pieces set surface_calculee_mm2 = 1, volume_calcule_mm3 = 1, calcule_le = now(), hauteur_sous_plafond_mm = 2500
  where id = 'f3500000-0000-0000-0000-000000000001'
  returning coalesce(surface_calculee_mm2::text, 'null') || '|' || coalesce(volume_calcule_mm3::text, 'null') || '|' || hauteur_sous_plafond_mm)
select is((select * from up), 'null|null|2500.0', 'H8. pièce : surface / volume calculés réservés au serveur, hauteur éditable');
select throws_ok($$update public.tools_releves_etages set batiment_id = 'f3200000-0000-0000-0000-000000000002' where id = 'f3300000-0000-0000-0000-000000000002'$$,
  '42501', null, 'H9. étage : changement de bâtiment refusé (éléments rattachés à l''étage)');
select throws_ok($$update public.tools_releves_pieces set etage_id = 'f3300000-0000-0000-0000-000000000001', zone_id = null where id = 'f3500000-0000-0000-0000-000000000002'$$,
  '42501', null, 'H10. pièce : changement d''étage refusé');
select throws_ok($$update public.tools_releves_pieces set zone_id = 'f3400000-0000-0000-0000-000000000003' where id = 'f3500000-0000-0000-0000-000000000002'$$,
  '23503', null, 'H11. pièce : zone d''un autre étage refusée (clé composite)');
select lives_ok($$
  update public.tools_releves_pieces set zone_id = 'f3400000-0000-0000-0000-000000000002' where id = 'f3500000-0000-0000-0000-000000000002';
  update public.tools_releves_batiments set chantier_id = 'f3100000-0000-0000-0000-000000000002' where id = 'f3200000-0000-0000-0000-000000000002';
$$, 'H12. déplacements ouverts : pièce vers une zone du même étage, bâtiment vers un autre chantier du relevé');

-- ── Journal (renommage, déplacement) ─────────────────────────────────────────
update public.tools_releves_pieces set nom = 'Bureau 12 bis' where id = 'f3500000-0000-0000-0000-000000000001';
select is((select action from public.tools_releves_journal where entite_id = 'f3500000-0000-0000-0000-000000000001' order by id desc limit 1),
  'renommage', 'J1. audit : renommage tracé comme tel');
select is((select action || '|' || (details->>'champ') || '|' || (details->>'vers')
           from public.tools_releves_journal where entite_id = 'f3500000-0000-0000-0000-000000000002' and action = 'deplacement'),
  'deplacement|zone_id|f3400000-0000-0000-0000-000000000002', 'J2. audit : déplacement tracé avec origine / destination');
select is((select count(*)::int from public.tools_releves_journal where entite_id = 'f3500000-0000-0000-0000-000000000004' and action = 'creation'),
  1, 'J3. audit : création tracée');

-- ── Duplication ──────────────────────────────────────────────────────────────
select is(public.tools_releve_dupliquer_noeud('batiment', 'f3200000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-0000000000d1', 'Bâtiment B'),
  'f3200000-0000-0000-0000-0000000000d1'::uuid, 'D1. duplication d''un bâtiment avec identifiant généré côté client');
select is((select count(*)::int || '|' || (select count(*) from public.tools_releves_zones z join public.tools_releves_etages e on e.id = z.etage_id where e.batiment_id = 'f3200000-0000-0000-0000-0000000000d1')
                  || '|' || (select count(*) from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id where e.batiment_id = 'f3200000-0000-0000-0000-0000000000d1')
           from public.tools_releves_etages where batiment_id = 'f3200000-0000-0000-0000-0000000000d1'),
  '4|3|6', 'D2. sous-structure copiée : 4 étages, 3 zones, 6 pièces');
select is((select count(*)::int from public.tools_releves_elements x join public.tools_releves_etages e on e.id = x.etage_id
           where e.batiment_id = 'f3200000-0000-0000-0000-0000000000d1'),
  0, 'D3. aucun élément métier (mur, mesure, photo…) dupliqué');
select is((select count(*)::int from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id
           where e.batiment_id = 'f3200000-0000-0000-0000-0000000000d1'
             and (p.commentaire is not null or p.statut <> 'a_relever'
                  or (p.zone_id is not null and not exists (select 1 from public.tools_releves_zones z where z.id = p.zone_id and z.etage_id = p.etage_id)))),
  0, 'D4. pièces copiées : constats non recopiés, zones remappées sur le nouvel étage');
select public.tools_releve_dupliquer_noeud('etage', 'f3300000-0000-0000-0000-000000000002') as dup_etage \gset
select is((select e.nom || '|' || e.niveau || '|' || e.type_niveau from public.tools_releves_etages e where e.id = :'dup_etage'),
  'R+3|3|etage', 'D5. duplication d''un étage : devient le niveau suivant du bâtiment');
select public.tools_releve_dupliquer_noeud('piece', 'f3500000-0000-0000-0000-000000000001', 'f3500000-0000-0000-0000-0000000000d1') as dup_piece \gset
select is((select p.nom || '|' || p.ordre || '|' || coalesce(p.zone_id::text, 'null') from public.tools_releves_pieces p where p.id = :'dup_piece'),
  'Bureau 12 bis (copie)|4|f3400000-0000-0000-0000-000000000001', 'D6. duplication d''une pièce : en fin de liste, même zone');
select is((select (details->>'noeuds') || '|' || (details->>'elements_copies') || '|' || (details->>'source_id')
           from public.tools_releves_journal where entite_id = 'f3200000-0000-0000-0000-0000000000d1' and action = 'duplication'),
  '14|0|f3200000-0000-0000-0000-000000000001', 'D7 / J4. duplication tracée (source, nombre de nœuds, 0 élément)');

-- ── Réordonnancement ─────────────────────────────────────────────────────────
select is(public.tools_releve_reordonner('batiment', array['f3200000-0000-0000-0000-0000000000d1', 'f3200000-0000-0000-0000-000000000001']::uuid[]),
  2, 'O1. réordonnancement atomique des bâtiments d''un chantier');
select is((select string_agg(nom, ',' order by ordre) from public.tools_releves_batiments where chantier_id = 'f3100000-0000-0000-0000-000000000001' and deleted_at is null),
  'Bâtiment B,Bâtiment A', 'O2. ordre persistant, identifiants inchangés');
select throws_ok($$select public.tools_releve_reordonner('batiment', array['f3200000-0000-0000-0000-000000000001']::uuid[])$$,
  '40001', null, 'O3. liste incomplète (frère ajouté ailleurs) refusée');
select throws_ok($$select public.tools_releve_reordonner('piece', array['f3500000-0000-0000-0000-000000000001', 'f3500000-0000-0000-0000-000000000003']::uuid[])$$,
  '42501', null, 'O4. fratries de parents différents refusées');
select ok((select count(*) from public.tools_releves_journal where entite_id = 'f3200000-0000-0000-0000-0000000000d1'
           and action = 'reordonnancement' and details ? 'vers') = 1, 'J5. réordonnancement tracé');

-- ── Cascade ──────────────────────────────────────────────────────────────────
update public.tools_releves_batiments set deleted_at = now() where id = 'f3200000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id
           where e.batiment_id = 'f3200000-0000-0000-0000-000000000001' and p.deleted_at is null),
  0, 'C1. suppression d''un bâtiment : étages et pièces retirés en cascade (suppression douce)');
select is((select count(*)::int from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id
           where e.batiment_id = 'f3200000-0000-0000-0000-0000000000d1' and p.deleted_at is null),
  6, 'C2. la copie est indépendante de l''original');
select throws_ok($$update public.tools_releves_pieces set deleted_at = null where id = 'f3500000-0000-0000-0000-000000000001'$$,
  '42501', null, 'C3. restauration d''une pièce sous un étage supprimé refusée');
update public.tools_releves_batiments set deleted_at = null where id = 'f3200000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id
           where e.batiment_id = 'f3200000-0000-0000-0000-000000000001' and p.deleted_at is null),
  11, 'C4. restauration du bâtiment : toute la sous-structure revient');
update public.tools_releves_chantiers set deleted_at = now() where id = 'f3100000-0000-0000-0000-000000000002';
select throws_ok($$update public.tools_releves_batiments set deleted_at = null where id = 'f3200000-0000-0000-0000-000000000002'$$,
  '42501', null, 'C5. chantier supprimé : ses bâtiments ne se restaurent pas seuls');
update public.tools_releves_chantiers set deleted_at = null where id = 'f3100000-0000-0000-0000-000000000002';
select is((select string_agg(action, ',' order by id) from public.tools_releves_journal where entite_id = 'f3200000-0000-0000-0000-000000000002' and action in ('suppression','restauration')),
  'suppression,restauration', 'J6. audit : suppression et restauration tracées (cascade comprise)');

-- ── Versions ─────────────────────────────────────────────────────────────────
select is((public.tools_releve_creer_version('f3000000-0000-0000-0000-000000000001', 'Relevé initial')).type_version,
  'initial', 'V1. première version : INITIAL');
select is((select (contenu->'chantiers'->0->>'reference') || '|' ||
                  (select p->>'statut' from jsonb_array_elements(contenu->'pieces') p where p->>'id' = 'f3500000-0000-0000-0000-000000000001')
           from public.tools_releves_versions where releve_id = 'f3000000-0000-0000-0000-000000000001' and numero = 1),
  'CH-2026-014|releve', 'V2. l''instantané contient les champs terrain du Lot 3');
select is((select v.type_version || '|' || v.numero || '|' || (v.version_base_id = (select id from public.tools_releves_versions where releve_id = v.releve_id and numero = 1))
           from public.tools_releve_creer_version('f3000000-0000-0000-0000-000000000001', null, 'corrige') v),
  'corrige|2|true', 'V3. version CORRIGÉE préparée');
select lives_ok($$select public.tools_releve_creer_version('f3000000-0000-0000-0000-000000000001', null, 'projete');
                  select public.tools_releve_creer_version('f3000000-0000-0000-0000-000000000001', null, 'as_built')$$,
  'V4. versions PROJETÉE et TEL QUE CONSTRUIT préparées');

-- ── Recherche ────────────────────────────────────────────────────────────────
select is((select string_agg(entite || ':' || libelle, ',' order by libelle) from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'bureau')),
  'piece:Bureau 12 bis,piece:Bureau 12 bis,piece:Bureau 12 bis,piece:Bureau 12 bis (copie)', 'S1. recherche d''une pièce (original, copies de bâtiment et d''étage, copie de pièce)');
select is((select string_agg(distinct entite || ':' || libelle, ',') from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'SEJOUR')),
  'piece:Séjour', 'S2. recherche insensible à la casse et aux accents');
select is((select string_agg(entite, ',') from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'CH-2026')),
  'chantier', 'S3. recherche d''un chantier par référence');
select is((select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'b')),
  0, 'S4. requête trop courte : aucun résultat');

-- ── Permissions : manager d'organisation (admin Relevé 10…06) ──────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_pieces where releve_id = 'f3000000-0000-0000-0000-000000000001'),
  (select count(*)::int from public.tools_releves_pieces where releve_id = 'f3000000-0000-0000-0000-000000000001'),
  'P1. manager : voit la structure d''un relevé privé d''un métreur');
select ok(public.tools_releve_dupliquer_noeud('piece', 'f3500000-0000-0000-0000-000000000002') is not null,
  'P2. manager : peut dupliquer dans le relevé d''autrui');
with up as (update public.tools_releves_pieces set commentaire = 'Contrôlé' where id = 'f3500000-0000-0000-0000-000000000002' returning 1)
select is((select count(*)::int from up), 1, 'P3. manager : peut éditer');
select lives_ok($$update public.tools_releves set deleted_at = now() where id = 'f3000000-0000-0000-0000-000000000002';
                  update public.tools_releves set deleted_at = null where id = 'f3000000-0000-0000-0000-000000000002'$$,
  'P4. manager : peut supprimer puis restaurer un relevé');

-- ── Permissions : membre métreur non propriétaire (10…02) ──────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.tools_releves_pieces where releve_id = 'f3000000-0000-0000-0000-000000000001'),
  0, 'P5. membre : ne voit pas le relevé privé d''un autre');
select is((select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'bureau')),
  0, 'P6. membre : la recherche ne révèle pas un relevé privé');
select throws_ok($$select public.tools_releve_dupliquer_noeud('piece', 'f3500000-0000-0000-0000-000000000001')$$,
  '42501', null, 'P7. membre : duplication refusée sur un relevé privé d''autrui');
select throws_ok($$select public.tools_releve_reordonner('batiment', array['f3200000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-0000000000d1']::uuid[])$$,
  '42501', null, 'P8. membre : réordonnancement refusé sur un relevé privé d''autrui');
with up as (update public.tools_releves_pieces set nom = 'Cuisine ouverte' where id = 'f3500000-0000-0000-0000-000000000010' returning 1)
select is((select count(*)::int from up), 1, 'P9. membre : édite un relevé partagé');
select ok(public.tools_releve_dupliquer_noeud('piece', 'f3500000-0000-0000-0000-000000000010') is not null,
  'P10. membre : duplique dans un relevé partagé');
select throws_ok($$update public.tools_releves set deleted_at = now() where id = 'f3000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'P11. membre : ne supprime pas le relevé partagé d''un autre');
select lives_ok($$insert into public.tools_releves(entreprise_id, nom, chantier_nom) values ('a0000000-0000-0000-0000-000000000001', 'Relevé membre', 'Site')$$,
  'P12. membre : crée son propre relevé');

-- ── Permissions : consultation (10…05) ────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'cuisine')),
  2, 'P13. consultation : voit et recherche le relevé partagé');
select throws_ok($$select public.tools_releve_dupliquer_noeud('piece', 'f3500000-0000-0000-0000-000000000010')$$,
  '42501', null, 'P14. consultation : duplication refusée');
with up as (update public.tools_releves_pieces set nom = 'X' where id = 'f3500000-0000-0000-0000-000000000010' returning 1)
select is((select count(*)::int from up), 0, 'P15. consultation : aucune édition');
select throws_ok($$select public.tools_releve_reordonner('piece', (select array_agg(id order by ordre desc) from public.tools_releves_pieces where etage_id = 'f3300000-0000-0000-0000-000000000010' and deleted_at is null))$$,
  '42501', null, 'P16. consultation : réordonnancement refusé');
select throws_ok($$insert into public.tools_releves(entreprise_id, nom, chantier_nom) values ('a0000000-0000-0000-0000-000000000001', 'Interdit', 'Site')$$,
  '42501', null, 'P17. consultation : création refusée');

-- ── Permissions : Tools Pro sans add-on (10…04) ──────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.tools_releves_pieces), 0, 'P18. Tools Pro sans Relevé : aucune pièce visible');
select throws_ok($$select public.tools_releve_dupliquer_noeud('piece', 'f3500000-0000-0000-0000-000000000010')$$,
  '42501', null, 'P19. Tools Pro sans Relevé : duplication refusée');

-- ── Permissions : autre tenant (admin Relevé B 20…06) ─────────────────────────
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_pieces where releve_id in ('f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002')),
  0, 'P20. autre tenant : aucune ligne visible');
select is((select count(*)::int from public.tools_releve_rechercher('a0000000-0000-0000-0000-000000000001', 'cuisine'))
          + (select count(*)::int from public.tools_releve_rechercher('b0000000-0000-0000-0000-000000000001', 'cuisine')),
  0, 'P21. autre tenant : recherche vide, même en visant l''entreprise A');
select throws_ok($$select public.tools_releve_dupliquer_noeud('batiment', 'f3200000-0000-0000-0000-000000000010')$$,
  '42501', 'Élément introuvable ou non modifiable', 'P22. autre tenant : duplication refusée sans oracle d''existence');
select throws_ok($$select public.tools_releve_reordonner('batiment', array['f3200000-0000-0000-0000-000000000010']::uuid[])$$,
  '42501', null, 'P23. autre tenant : réordonnancement refusé');
with up as (update public.tools_releves_chantiers set statut = 'archive' where id = 'f3100000-0000-0000-0000-000000000010' returning 1)
select is((select count(*)::int from up), 0, 'P24. autre tenant : aucune édition');
select throws_ok($$insert into public.tools_releves_batiments(releve_id, chantier_id, nom) values
  ('f3000000-0000-0000-0000-000000000002', 'f3100000-0000-0000-0000-000000000010', 'Intrus')$$,
  '42501', null, 'P25. autre tenant : création dans le relevé de A refusée');

-- ── Permissions : anonyme ────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.tools_releve_dupliquer_noeud(text,uuid,uuid,text)', 'execute')
      and not has_function_privilege('anon', 'public.tools_releve_reordonner(text,uuid[])', 'execute')
      and not has_function_privilege('anon', 'public.tools_releve_rechercher(uuid,text,integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.tools_releve_structure_garde()', 'execute'),
  'P26. anonyme : aucune RPC Lot 3 exécutable ; fonction de garde jamais appelable');
select ok(not has_table_privilege('anon', 'public.tools_releves_pieces', 'select')
      and not has_table_privilege('anon', 'public.tools_releves_chantiers', 'update'),
  'P27. anonyme : aucune lecture ni écriture sur la structure');

-- ── Propriétaire : suppression / restauration de son relevé ───────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok($$update public.tools_releves set deleted_at = now() where id = 'f3000000-0000-0000-0000-000000000001';
                  update public.tools_releves set deleted_at = null where id = 'f3000000-0000-0000-0000-000000000001'$$,
  'P28. propriétaire : met son relevé à la corbeille et le restaure');
select is((select count(*)::int from public.tools_releves_journal where releve_id = 'f3000000-0000-0000-0000-000000000001'
           and entite = 'releve' and action in ('suppression','restauration')),
  2, 'J7. audit : suppression et restauration du relevé tracées');

select * from finish();
rollback;
