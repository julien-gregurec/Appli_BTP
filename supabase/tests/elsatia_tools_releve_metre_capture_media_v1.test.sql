-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 4 — CAPTURE TERRAIN PHOTO & MÉDIAS V1
--
-- Qualifie la migration 20260928000801_tools_releve_metre_capture_media_v1 sous RLS réelle
-- (`set local role authenticated` + `request.jwt.claim.sub`) :
--   M1–M7   métadonnées de photo : valides acceptées, géolocalisation / clé inconnue / empreinte
--           absente refusées, '{}' admis (lignes antérieures) ;
--   I1–I3   immuabilité d'un média déposé, suppression douce permise ;
--   V1–V8   validateur d'éléments : repères, ancre plan, annotations sur photo, formes 604 admises ;
--   R1–R6   RPC de retrait : média + ancres + annotations ; refus autre tenant, consultation, anon ;
--   P1–P4   RPC de remplacement ;
--   S1–S9   Storage (policies réelles de storage.objects) : dépôt, lecture, cross-tenant, suppression
--           par le propriétaire du relevé, par l'auteur du dépôt, refus pour un autre métreur ;
--   G1–G3   RGPD : manifeste de fichiers et export incluent le bucket et les métadonnées.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004',
                  '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006']::uuid[]) u;

-- Métadonnées de référence (ce que produit buildPhotoMetadata côté client).
create temporary table _meta on commit drop as select jsonb_build_object(
  'source', 'camera_appareil', 'priseLe', '2026-09-27T14:05:33+02:00', 'priseLeSource', 'exif', 'orientation', 'paysage',
  'orientationExif', 1, 'largeurPx', 3072, 'hauteurPx', 2304, 'largeurOriginePx', 4032, 'hauteurOriginePx', 3024,
  'tailleOrigineOctets', 4200000, 'compressionQualite', 0.85, 'compressionCoteMaxPx', 3072,
  'empreinteSha256', repeat('ab', 32), 'gpsRetire', true, 'remplaceMediaId', null) as m;
grant select on _meta to authenticated;

set local role authenticated;
-- ── Métreur A (propriétaire) : relevé partagé, structure, mur ─────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom, visibilite)
  values ('c4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé photos', 'Site', 'entreprise');
insert into public.tools_releves_batiments(id, releve_id, nom) values ('c4100000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'Bât');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau)
  values ('c4200000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c4100000-0000-0000-0000-000000000001', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage)
  values ('c4300000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c4200000-0000-0000-0000-000000000001', 'Séjour', 'sejour');

-- ─────────────────────────────────────────────────────────────
-- Métadonnées
-- ─────────────────────────────────────────────────────────────
select lives_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
  select 'c4500000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'photos',
         'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000001.jpg',
         'image/jpeg', 1500000, m from _meta $$,
  'M1. métreur : photo déposée avec métadonnées de preuve complètes');
select is(
  (select created_by::text || '|' || (metadata->>'priseLe') from public.tools_releves_medias where id = 'c4500000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000003|2026-09-27T14:05:33+02:00',
  'M2. auteur imposé par le serveur (created_by) ; date et heure de prise de vue conservées');
select throws_ok($$
  insert into public.tools_releves_medias(releve_id, categorie, storage_path, mime_type, taille_octets, metadata, id)
  select 'c4000000-0000-0000-0000-000000000001', 'photos',
         'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-0000000000f1.jpg',
         'image/jpeg', 100, m || '{"latitude": 48.58, "longitude": 7.75}', 'c4500000-0000-0000-0000-0000000000f1' from _meta $$,
  '23514', null, 'M3. géolocalisation refusée par le CHECK (liste de clés fermée)');
select throws_ok($$
  insert into public.tools_releves_medias(releve_id, categorie, storage_path, mime_type, taille_octets, metadata, id)
  select 'c4000000-0000-0000-0000-000000000001', 'photos',
         'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-0000000000f2.jpg',
         'image/jpeg', 100, m || '{"appareil": "iPhone 15"}', 'c4500000-0000-0000-0000-0000000000f2' from _meta $$,
  '23514', null, 'M4. clé inconnue refusée (modèle d''appareil non conservé)');
select throws_ok($$
  insert into public.tools_releves_medias(releve_id, categorie, storage_path, mime_type, taille_octets, metadata, id)
  select 'c4000000-0000-0000-0000-000000000001', 'photos',
         'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-0000000000f3.jpg',
         'image/jpeg', 100, m - 'empreinteSha256', 'c4500000-0000-0000-0000-0000000000f3' from _meta $$,
  '23514', null, 'M5. empreinte SHA-256 obligatoire pour une photo documentée');
select throws_ok($$
  insert into public.tools_releves_medias(releve_id, categorie, storage_path, mime_type, taille_octets, metadata, id)
  select 'c4000000-0000-0000-0000-000000000001', 'photos',
         'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-0000000000f4.jpg',
         'image/jpeg', 100, m || '{"source": "drone", "orientationExif": 12}', 'c4500000-0000-0000-0000-0000000000f4' from _meta $$,
  '23514', null, 'M6. source inconnue et orientation EXIF hors 1–8 refusées');
select lives_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets)
  values ('c4500000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001', 'photos',
          'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000002.jpg',
          'image/jpeg', 800000) $$,
  'M7. média sans métadonnées (forme antérieure au Lot 4) toujours admis ({} par défaut)');

-- ─────────────────────────────────────────────────────────────
-- Immuabilité
-- ─────────────────────────────────────────────────────────────
select throws_ok($$ update public.tools_releves_medias set metadata = metadata || '{"gpsRetire": false}' where id = 'c4500000-0000-0000-0000-000000000001' $$,
  '42501', null, 'I1. métadonnées d''un média déposé non modifiables');
select throws_ok($$ update public.tools_releves_medias set taille_octets = 1 where id = 'c4500000-0000-0000-0000-000000000001' $$,
  '42501', null, 'I2. taille / chemin / type d''un média déposé non modifiables');
select lives_ok($$ update public.tools_releves_medias set nom_fichier = 'facade-nord.jpg' where id = 'c4500000-0000-0000-0000-000000000002' $$,
  'I3. le nom affiché reste modifiable');

-- ─────────────────────────────────────────────────────────────
-- Validateur d'éléments (605)
-- ─────────────────────────────────────────────────────────────
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c4600000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'photo_anchor', 'c4200000-0000-0000-0000-000000000001', 'c4300000-0000-0000-0000-000000000001',
   '{"mediaId":"c4500000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c4300000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":"Mur nord","ordre":0,
     "reperes":[{"id":"c4900000-0000-0000-0000-000000000001","x":0.25,"y":0.5,"label":"Tableau","ordre":0,"cible":{"kind":"piece","id":"c4300000-0000-0000-0000-000000000001"}},
                {"id":"c4900000-0000-0000-0000-000000000002","x":1,"y":0,"label":"Angle","ordre":1,"cible":null}]}') $$,
  'V1. PhotoAnchor avec ordre et repères (x/y normalisés, objet lié, libellé, ordre)');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('c4600000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001', 'photo_anchor', 'c4200000-0000-0000-0000-000000000001',
   '{"mediaId":"c4500000-0000-0000-0000-000000000001","ancre":{"kind":"plan","etageId":"c4200000-0000-0000-0000-000000000001","x":0.42,"y":0.18},"directionRad":null,"legende":null}') $$,
  'V2. ancre « point du plan futur » (x/y ∈ [0, 1])');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, donnees) values
  ('c4000000-0000-0000-0000-000000000001', 'photo_anchor', 'c4200000-0000-0000-0000-000000000001',
   '{"mediaId":"c4500000-0000-0000-0000-000000000001","ancre":{"kind":"plan","etageId":"c4200000-0000-0000-0000-000000000001","x":1.5,"y":0.18},"directionRad":null,"legende":null}') $$,
  '23514', null, 'V3. ancre plan hors [0, 1] refusée');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c4000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c4500000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"releve","id":"c4000000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null,
     "reperes":[{"id":"c4900000-0000-0000-0000-000000000001","x":0.2,"y":0.2,"label":"A","ordre":0},{"id":"c4900000-0000-0000-0000-000000000001","x":0.3,"y":0.3,"label":"B","ordre":1}]}') $$,
  '23514', null, 'V4. repères : identifiant en double refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c4000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c4500000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"releve","id":"c4000000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null,
     "reperes":[{"id":"c4900000-0000-0000-0000-000000000003","x":0.2,"y":-0.1,"label":" ","ordre":0}]}') $$,
  '23514', null, 'V5. repères : coordonnée hors bornes et libellé vide refusés');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c4700000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'annotation', 'c4200000-0000-0000-0000-000000000001', 'c4300000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c4600000-0000-0000-0000-000000000001"}},"texte":"","forme":"fleche","geometrie":{"espace":"photo","x1":0.1,"y1":0.1,"x2":0.5,"y2":0.4,"couleur":"rouge"},"mediaAudioId":null}'),
  ('c4700000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001', 'annotation', 'c4200000-0000-0000-0000-000000000001', 'c4300000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c4600000-0000-0000-0000-000000000001"}},"texte":"Fissure","forme":"cercle","geometrie":{"espace":"photo","cx":0.5,"cy":0.5,"r":0.1,"couleur":"jaune"},"mediaAudioId":null}'),
  ('c4700000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'annotation', 'c4200000-0000-0000-0000-000000000001', 'c4300000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c4600000-0000-0000-0000-000000000001"}},"texte":"Humidité","forme":"texte","geometrie":{"espace":"photo","x":0.7,"y":0.2,"couleur":"blanc"},"mediaAudioId":null}') $$,
  'V6. annotations sur photo : flèche, cercle, texte');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c4000000-0000-0000-0000-000000000001', 'annotation',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c4600000-0000-0000-0000-000000000001"}},"texte":"","forme":"cercle","geometrie":{"espace":"photo","cx":0.5,"cy":0.5,"r":0},"mediaAudioId":null}') $$,
  '23514', null, 'V7. cercle de rayon nul refusé ; forme non dessinable sur photo refusée');
select lives_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c4000000-0000-0000-0000-000000000001', 'annotation',
   '{"ancre":{"kind":"point","etageId":"c4200000-0000-0000-0000-000000000001","point":{"x":10,"y":20}},"texte":"","forme":"zone","geometrie":{"points":[[0,0],[1,1]]},"mediaAudioId":null}') $$,
  'V8. formes 604 inchangées : zone sur plan avec géométrie libre toujours admise');

-- ─────────────────────────────────────────────────────────────
-- Storage (policies réelles de storage.objects)
-- ─────────────────────────────────────────────────────────────
select lives_ok($$
  insert into storage.objects(bucket_id, name, owner, metadata) values
  ('tools-releves', 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000001.jpg', auth.uid(), '{"size":1500000}'),
  ('tools-releves', 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000002.jpg', auth.uid(), '{"size":800000}') $$,
  'S1. métreur : dépôt dans le bucket privé sous le chemin canonique de son relevé');

-- Autre métreur A : dépose sa propre photo sur le relevé partagé.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
  select 'c4500000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'photos',
         'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000003.jpg', 'image/jpeg', 700000, m from _meta;
  insert into storage.objects(bucket_id, name, owner, metadata) values
  ('tools-releves', 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000003.jpg', auth.uid(), '{"size":700000}') $$,
  'S2. second métreur : dépôt sur un relevé partagé');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/%'),
  3, 'S3. second métreur : lit les fichiers du relevé partagé (base de l''URL signée)');
with d as (delete from storage.objects where bucket_id = 'tools-releves'
           and name = 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000001.jpg' returning 1)
select is((select count(*)::int from d), 0, 'S4. second métreur : ne supprime PAS le fichier déposé par un autre (ni propriétaire ni auteur)');
with d as (delete from storage.objects where bucket_id = 'tools-releves'
           and name = 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000003.jpg' returning 1)
select is((select count(*)::int from d), 1, 'S5. auteur du dépôt : supprime son propre fichier sur le relevé partagé');

-- Consultation A : lecture, aucun dépôt.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from storage.objects where bucket_id = 'tools-releves'), 2, 'S6. consultation : lit les fichiers du relevé partagé');
select throws_ok($$
  insert into storage.objects(bucket_id, name, owner) values
  ('tools-releves', 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-0000000000c1.jpg', auth.uid()) $$,
  '42501', null, 'S7. consultation : dépôt refusé');

-- Admin B : autre tenant.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'tools-releves') + (select count(*)::int from public.tools_releves_medias),
  0, 'S8. autre tenant : aucun fichier ni média visible (base de toute URL signée : refusée)');
with d as (delete from storage.objects where bucket_id = 'tools-releves' returning 1)
select is((select count(*)::int from d), 0, 'S9. autre tenant : aucune suppression possible');

-- ─────────────────────────────────────────────────────────────
-- RPC de retrait
-- ─────────────────────────────────────────────────────────────
select throws_ok($$ select public.tools_releve_retirer_photo('c4500000-0000-0000-0000-000000000001') $$,
  'P0002', null, 'R1. autre tenant : retrait impossible (média invisible sous RLS)');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.tools_releve_retirer_photo('c4500000-0000-0000-0000-000000000001') $$,
  'P0002', null, 'R2. consultation : retrait impossible');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(public.tools_releve_retirer_photo('c4500000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000001.jpg',
  'R3. propriétaire : retrait, chemin du fichier renvoyé pour suppression');
select is(
  (select count(*)::int from public.tools_releves_elements
    where id in ('c4600000-0000-0000-0000-000000000001','c4600000-0000-0000-0000-000000000002',
                 'c4700000-0000-0000-0000-000000000001','c4700000-0000-0000-0000-000000000002','c4700000-0000-0000-0000-000000000003')
      and deleted_at is not null),
  5, 'R4. retrait atomique : les 2 ancres et les 3 annotations dessinées sont retirées');
with d as (delete from storage.objects where bucket_id = 'tools-releves'
           and name = 'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000001.jpg' returning 1)
select is((select count(*)::int from d), 1, 'R5. propriétaire : suppression du fichier retiré (Storage)');
reset role;
set local role anon;
select throws_ok($$ select public.tools_releve_retirer_photo('c4500000-0000-0000-0000-000000000002') $$,
  '42501', null, 'R6. anon : RPC non exécutable');
reset role;

-- ─────────────────────────────────────────────────────────────
-- RPC de remplacement
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('c4600000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'photo_anchor', 'c4200000-0000-0000-0000-000000000001',
   '{"mediaId":"c4500000-0000-0000-0000-000000000002","ancre":{"kind":"entite","ref":{"kind":"etage","id":"c4200000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":"Palier","ordre":0,
     "reperes":[{"id":"c4900000-0000-0000-0000-000000000009","x":0.5,"y":0.5,"label":"Axe","ordre":0}]}');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('c4700000-0000-0000-0000-000000000009', 'c4000000-0000-0000-0000-000000000001', 'annotation', 'c4200000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c4600000-0000-0000-0000-000000000003"}},"texte":"Ici","forme":"texte","geometrie":{"espace":"photo","x":0.5,"y":0.5},"mediaAudioId":null}');
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
select 'c4500000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000001', 'photos',
       'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000004.jpg', 'image/jpeg', 900000,
       m || '{"remplaceMediaId":"c4500000-0000-0000-0000-000000000002"}' from _meta;
select throws_ok($$ select public.tools_releve_remplacer_photo('c4500000-0000-0000-0000-000000000002', 'c4500000-0000-0000-0000-000000000002') $$,
  '22023', null, 'P1. une photo ne se remplace pas par elle-même');
select is(public.tools_releve_remplacer_photo('c4500000-0000-0000-0000-000000000002', 'c4500000-0000-0000-0000-000000000004'),
  'a0000000-0000-0000-0000-000000000001/c4000000-0000-0000-0000-000000000001/photos/c4500000-0000-0000-0000-000000000002.jpg',
  'P2. remplacement : chemin de l''ancien fichier renvoyé');
select is(
  (select (donnees->>'mediaId') || '|' || jsonb_array_length(donnees->'reperes') || '|' || (donnees->>'legende') from public.tools_releves_elements where id = 'c4600000-0000-0000-0000-000000000003'),
  'c4500000-0000-0000-0000-000000000004|0|Palier',
  'P3. l''ancre suit la nouvelle photo (légende conservée, repères de l''ancienne image remis à zéro)');
select is(
  (select (select deleted_at is not null from public.tools_releves_medias where id = 'c4500000-0000-0000-0000-000000000002')::text
       || '|' || (select deleted_at is not null from public.tools_releves_elements where id = 'c4700000-0000-0000-0000-000000000009')::text),
  'true|true', 'P4. ancienne photo et annotations de l''ancienne image retirées');
reset role;

-- ─────────────────────────────────────────────────────────────
-- RGPD
-- ─────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from jsonb_array_elements(public.manifeste_fichiers_entreprise('a0000000-0000-0000-0000-000000000001')) f
    where f->>'bucket' = 'tools-releves' and f->'proprietaire'->>'type' = 'releve'),
  4, 'G1. manifeste RGPD : les 4 fichiers Relevé du tenant (y compris retirés non purgés) sont inventoriés');
select is(
  (select count(*)::int from jsonb_array_elements(public.manifeste_fichiers_entreprise('b0000000-0000-0000-0000-000000000001')) f
    where f->>'bucket' = 'tools-releves'),
  0, 'G2. manifeste RGPD : aucun fichier Relevé d''un autre tenant');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(
  (select bool_and(m ? 'metadata') and bool_or(m->'metadata'->>'priseLe' = '2026-09-27T14:05:33+02:00')
     from jsonb_array_elements(public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001')->'donnees'->'tools_releves_medias') m),
  'G3. export RGPD : médias exportés avec leurs métadonnées de preuve');
reset role;

select * from finish();
rollback;
