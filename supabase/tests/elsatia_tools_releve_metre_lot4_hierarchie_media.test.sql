-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 4 — CAPTURE MÉDIA SUR LA HIÉRARCHIE DU LOT 3
--
-- Qualifie la partie « Lot 3 → Lot 4 » de la migration 20260927000801 sous RLS réelle :
--   H1–H17  rattachement photo sur la hiérarchie réelle (relevé, chantier, bâtiment, étage, zone,
--           pièce, mur, équipement, point du plan) ; cibles incohérentes / retirées / d'un autre
--           relevé refusées ; annotations portées par un PhotoAnchor cohérent ;
--   C1–C9   colonnes Lot 4 : version de référence imposée, commentaire (≠ annotation) journalisé
--           sans contenu, état documenté, révision optimiste, doublon SHA-256, miniature ;
--   K1–K8   cascade contrôlée : zone, bâtiment, chantier, mur, PhotoAnchor → rattachements et
--           annotations ; restauration symétrique ;
--   D1–D2   duplication Lot 3 : aucune photo ni annotation recopiée ;
--   V1–V7   versions : une nouvelle version ne touche pas aux photos ; fichier figé par une
--           version jamais supprimé par un utilisateur ;
--   P1–P14  RLS : propriétaire, responsable (admin), membre autorisé, consultation, authentifié
--           non autorisé, autre tenant, anonyme, service_role ; relevé privé ;
--   X1–X3   relevé supprimé : aucun dépôt, lecture réservée à la corbeille ;
--   G1–G7   RGPD : export (commentaire, métadonnées, annotations), manifeste et inventaire
--           Storage (miniatures), purge réelle (lignes + fichiers), autres tenants intacts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

\ir fixtures/isolation_multitenant.inc

-- Tenant R : n'utilise que Relevé (purge RGPD réelle en fin de fichier).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated',
   'dirigeant-r@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now());
insert into public.utilisateurs (id, prenom, nom) values ('40000000-0000-0000-0000-000000000006', 'Dirigeant', 'R')
  on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;
insert into public.entreprises (id, nom, code_adhesion) values ('e0000000-0000-0000-0000-000000000001', 'Entreprise Relevé R', 'ISOR0001');
insert into public.postes (id, entreprise_id, nom) values ('e1000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'Dirigeant R');
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
  values ('40000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000006', 'actif');

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('e0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
-- 10…03 métreur propriétaire ; 10…02 métreur membre ; 10…06 responsable (admin Relevé) ;
-- 10…05 consultation ; 10…01 authentifié de l'entreprise SANS habilitation Relevé.
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
                  '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006']::uuid[]) u;

create temporary table _meta on commit drop as select jsonb_build_object(
  'source', 'import', 'priseLe', '2026-09-27T10:00:00+02:00', 'priseLeSource', 'exif', 'orientation', 'paysage',
  'orientationExif', 1, 'largeurPx', 3072, 'hauteurPx', 2304, 'largeurOriginePx', 4032, 'hauteurOriginePx', 3024,
  'tailleOrigineOctets', 4200000, 'compressionQualite', 0.85, 'compressionCoteMaxPx', 3072,
  'empreinteSha256', repeat('00', 32), 'gpsRetire', false, 'remplaceMediaId', null) as m;
grant select on _meta to authenticated, service_role;
-- Métadonnées d'une photo n (empreinte distincte par photo).
create function pg_temp.meta(n int) returns jsonb language sql as $$
  select m || jsonb_build_object('empreinteSha256', repeat(lpad(to_hex(n), 2, '0'), 32)) from _meta $$;
create function pg_temp.chemin(r text, id text, ext text default 'jpg') returns text language sql as $$
  select 'a0000000-0000-0000-0000-000000000001/' || r || '/photos/' || id || '.' || ext $$;
grant execute on function pg_temp.meta(int), pg_temp.chemin(text, text, text) to authenticated, service_role;

set local role authenticated;
-- ── Propriétaire (10…03) : relevé partagé R, relevé R2, relevé privé R3 ─────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('c6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé photos', 'Site'),
  ('c6000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Autre relevé', 'Site 2'),
  ('c6000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Relevé privé', 'Site 3');
update public.tools_releves set visibilite = 'entreprise' where id in ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002');
insert into public.tools_releves_chantiers(id, releve_id, nom) values
  ('c6100000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Chantier Nord'),
  ('c6100000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000002', 'Chantier 2');
insert into public.tools_releves_batiments(id, releve_id, chantier_id, nom) values
  ('c6200000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000001', 'Bâtiment A'),
  ('c6200000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000002', 'c6100000-0000-0000-0000-000000000002', 'Bâtiment 2');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau, type_niveau) values
  ('c6300000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'c6200000-0000-0000-0000-000000000001', 'RDC', 0, 'rdc'),
  ('c6300000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 'c6200000-0000-0000-0000-000000000001', 'R+1', 1, 'etage'),
  ('c6300000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000002', 'c6200000-0000-0000-0000-000000000002', 'RDC', 0, 'rdc');
insert into public.tools_releves_zones(id, releve_id, etage_id, nom, type) values
  ('c6400000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001', 'Appartement 1', 'appartement');
insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage) values
  ('c6500000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001', 'c6400000-0000-0000-0000-000000000001', 'Séjour', 'sejour'),
  ('c6500000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001', null, 'WC', 'wc'),
  ('c6500000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000002', 'c6300000-0000-0000-0000-000000000003', null, 'Cuisine', 'cuisine');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6600000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'mur', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"a":{"x":0,"y":0},"b":{"x":4200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}'),
  ('c6600000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 'equipement', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"categorie":"electricite","position":{"x":100,"y":100},"libelle":"Tableau électrique"}');

-- Photos du relevé R (fichier + ligne, comme la file de synchronisation).
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, miniature_storage_path, mime_type, taille_octets, metadata, version_reference_id)
select ('c6700000-0000-0000-0000-00000000000' || n)::uuid, 'c6000000-0000-0000-0000-000000000001', 'photos',
       pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-00000000000' || n),
       pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6710000-0000-0000-0000-00000000000' || n),
       'image/jpeg', 900000, pg_temp.meta(n),
       -- valeur déclarée par le client : ignorée par le serveur (C1)
       null
  from generate_series(1, 9) n;
insert into storage.objects(bucket_id, name, owner, metadata)
select 'tools-releves', p, auth.uid(), '{"size":900000}'
  from (select storage_path p from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001'
        union all select miniature_storage_path from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001') x;

-- ─────────────────────────────────────────────────────────────
-- H. Rattachement sur la hiérarchie Lot 3
-- ─────────────────────────────────────────────────────────────
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6800000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null,"ordre":0}') $$,
  'H1. photo rattachée à une pièce (étage et pièce de la pièce)');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, donnees) values
  ('c6800000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c6700000-0000-0000-0000-000000000002","ancre":{"kind":"entite","ref":{"kind":"releve","id":"c6000000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  'H2. photo rattachée au relevé');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, donnees) values
  ('c6800000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c6700000-0000-0000-0000-000000000003","ancre":{"kind":"entite","ref":{"kind":"chantier","id":"c6100000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  'H3. photo rattachée à un chantier (Lot 3)');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, donnees) values
  ('c6800000-0000-0000-0000-000000000004', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c6700000-0000-0000-0000-000000000004","ancre":{"kind":"entite","ref":{"kind":"batiment","id":"c6200000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  'H4. photo rattachée à un bâtiment');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('c6800000-0000-0000-0000-000000000005', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000005","ancre":{"kind":"entite","ref":{"kind":"etage","id":"c6300000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  'H5. photo rattachée à un étage');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('c6800000-0000-0000-0000-000000000006', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000006","ancre":{"kind":"entite","ref":{"kind":"zone","id":"c6400000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  'H6. photo rattachée à une zone (étage de la zone)');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6800000-0000-0000-0000-000000000007', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000007","ancre":{"kind":"entite","ref":{"kind":"element","id":"c6600000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}'),
  ('c6800000-0000-0000-0000-000000000008', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000008","ancre":{"kind":"entite","ref":{"kind":"element","id":"c6600000-0000-0000-0000-000000000002"}},"directionRad":null,"legende":null}') $$,
  'H7. photos rattachées à un mur et à un équipement (étage et pièce de l''élément)');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('c6800000-0000-0000-0000-000000000009', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000009","ancre":{"kind":"plan","etageId":"c6300000-0000-0000-0000-000000000001","x":0.3,"y":0.7},"directionRad":null,"legende":null}') $$,
  'H8. photo rattachée à un point du plan futur');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  '23514', null, 'H9. rattachement ambigu refusé : pièce ciblée mais colonne piece_id absente');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000002',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"zone","id":"c6400000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  '23514', null, 'H10. zone ciblée avec l''étage d''un autre niveau : refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, piece_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000003', 'c6500000-0000-0000-0000-000000000003',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-000000000003"}},"directionRad":null,"legende":null}') $$,
  null, null, 'H11. pièce d''un autre relevé : refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c6000000-0000-0000-0000-000000000002', 'photo_anchor',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"releve","id":"c6000000-0000-0000-0000-000000000002"}},"directionRad":null,"legende":null}') $$,
  '23514', null, 'H12. photo d''un autre relevé : refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"ouvrage","id":"c6000000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  '23514', null, 'H13. nature de cible inconnue : refusé');
update public.tools_releves_pieces set deleted_at = now() where id = 'c6500000-0000-0000-0000-000000000002';
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, piece_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000002',
   '{"mediaId":"c6700000-0000-0000-0000-000000000001","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-000000000002"}},"directionRad":null,"legende":null}') $$,
  '23514', null, 'H14. pièce à la corbeille : aucun nouveau rattachement');
update public.tools_releves_pieces set deleted_at = null where id = 'c6500000-0000-0000-0000-000000000002';
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6900000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'annotation', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c6800000-0000-0000-0000-000000000001"}},"texte":"Fissure","forme":"cercle","geometrie":{"espace":"photo","cx":0.5,"cy":0.5,"r":0.1,"couleur":"rouge"},"mediaAudioId":null}'),
  ('c6900000-0000-0000-0000-000000000006', 'c6000000-0000-0000-0000-000000000001', 'annotation', 'c6300000-0000-0000-0000-000000000001', null,
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c6800000-0000-0000-0000-000000000006"}},"texte":"","forme":"fleche","geometrie":{"espace":"photo","x1":0.1,"y1":0.1,"x2":0.4,"y2":0.4,"couleur":"jaune"},"mediaAudioId":null}'),
  ('c6900000-0000-0000-0000-000000000004', 'c6000000-0000-0000-0000-000000000001', 'annotation', null, null,
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c6800000-0000-0000-0000-000000000004"}},"texte":"Façade","forme":"texte","geometrie":{"espace":"photo","x":0.2,"y":0.2,"couleur":"blanc"},"mediaAudioId":null}') $$,
  'H15. annotations sur photo portées par leur PhotoAnchor (mêmes colonnes étage / pièce)');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'annotation', 'c6300000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c6800000-0000-0000-0000-000000000001"}},"texte":"X","forme":"texte","geometrie":{"espace":"photo","x":0.2,"y":0.2},"mediaAudioId":null}') $$,
  '23514', null, 'H16. annotation incohérente avec la photo annotée (pièce manquante) : refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, piece_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'annotation', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c6600000-0000-0000-0000-000000000001"}},"texte":"X","forme":"texte","geometrie":{"espace":"photo","x":0.2,"y":0.2},"mediaAudioId":null}') $$,
  '23514', null, 'H17. annotation « sur photo » portée par un mur (pas une photo) : refusé');

-- ─────────────────────────────────────────────────────────────
-- C. Colonnes Lot 4
-- ─────────────────────────────────────────────────────────────
select is((select count(*)::int from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001' and version_reference_id is null),
  9, 'C1. sans version figée, version de référence nulle (jamais déclarative)');
with up as (update public.tools_releves_medias set commentaire = 'Humidité en pied de mur' where id = 'c6700000-0000-0000-0000-000000000001' and revision = 1
            returning revision)
select is((select revision::int from up), 2, 'C2. commentaire de photo modifiable (révision incrémentée)');
select is(
  (select array_to_string(champs, ',') || '|' || coalesce(details::text, 'null') from public.tools_releves_journal
    where entite = 'media' and entite_id = 'c6700000-0000-0000-0000-000000000001' and action = 'modification' order by id desc limit 1),
  'commentaire|null', 'C3. journal : le champ est tracé, jamais le contenu du commentaire');
with up as (update public.tools_releves_medias set commentaire = 'Autre' where id = 'c6700000-0000-0000-0000-000000000001' and revision = 1 returning 1)
select is((select count(*)::int from up), 0, 'C4. écriture concurrente (révision périmée) : aucune ligne écrasée');
select throws_ok($$update public.tools_releves_medias set commentaire = '   ' where id = 'c6700000-0000-0000-0000-000000000001'$$,
  '23514', null, 'C5. commentaire vide refusé (null pour effacer)');
select lives_ok($$update public.tools_releves_medias set etat_documente = 'as_built' where id = 'c6700000-0000-0000-0000-000000000009'$$,
  'C6. état documenté modifiable (tel que construit)');
select throws_ok($$update public.tools_releves_medias set etat_documente = 'apres' where id = 'c6700000-0000-0000-0000-000000000009'$$,
  '23514', null, 'C7. état documenté hors liste refusé');
select throws_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
  values ('c6700000-0000-0000-0000-0000000000d1', 'c6000000-0000-0000-0000-000000000001', 'photos',
          pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-0000000000d1'), 'image/jpeg', 900000, pg_temp.meta(1)) $$,
  '23505', null, 'C8. doublon : même photo (même SHA-256) déjà active dans ce relevé');
select is(
  (select count(*)::int from public.tools_releves_medias
    where releve_id = 'c6000000-0000-0000-0000-000000000001' and miniature_storage_path like '%/photos/c6710000-%.jpg'),
  9, 'C9. miniatures : chemin canonique dans le dossier photos du relevé');

-- Miniature : forme canonique, unicité, immuabilité.
select throws_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, miniature_storage_path, mime_type, taille_octets, metadata)
  values ('c6700000-0000-0000-0000-0000000000d2', 'c6000000-0000-0000-0000-000000000001', 'photos',
          pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-0000000000d2'),
          pg_temp.chemin('c6000000-0000-0000-0000-000000000002', 'c6710000-0000-0000-0000-0000000000d2'), 'image/jpeg', 900000, pg_temp.meta(210)) $$,
  '23514', null, 'C10. miniature hors du dossier photos du relevé : refusée');
select throws_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, miniature_storage_path, mime_type, taille_octets, metadata)
  values ('c6700000-0000-0000-0000-0000000000d3', 'c6000000-0000-0000-0000-000000000001', 'photos',
          pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-0000000000d3'),
          pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-000000000002'), 'image/jpeg', 900000, pg_temp.meta(211)) $$,
  '23505', null, 'C11. miniature désignant le fichier d''une autre photo : refusée');
select throws_ok($$update public.tools_releves_medias set miniature_storage_path = null where id = 'c6700000-0000-0000-0000-000000000002'$$,
  '42501', null, 'C12. miniature immuable après dépôt');

-- ─────────────────────────────────────────────────────────────
-- K. Cascade contrôlée
-- ─────────────────────────────────────────────────────────────
update public.tools_releves_zones set deleted_at = now() where id = 'c6400000-0000-0000-0000-000000000001';
select is(
  (select string_agg(id::text || ':' || (deleted_at is not null)::text, ',' order by id) from public.tools_releves_elements
    where id in ('c6800000-0000-0000-0000-000000000006', 'c6900000-0000-0000-0000-000000000006', 'c6800000-0000-0000-0000-000000000001')),
  'c6800000-0000-0000-0000-000000000001:false,c6800000-0000-0000-0000-000000000006:true,c6900000-0000-0000-0000-000000000006:true',
  'K1. zone à la corbeille : sa photo et l''annotation suivent ; la pièce (détachée par le Lot 3) garde les siennes');
update public.tools_releves_zones set deleted_at = null where id = 'c6400000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.tools_releves_elements
    where id in ('c6800000-0000-0000-0000-000000000006', 'c6900000-0000-0000-0000-000000000006') and deleted_at is null),
  2, 'K2. zone restaurée : photo et annotation restaurées');
update public.tools_releves_batiments set deleted_at = now() where id = 'c6200000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.tools_releves_elements
    where releve_id = 'c6000000-0000-0000-0000-000000000001' and type in ('photo_anchor', 'annotation') and deleted_at is not null),
  10, 'K3. bâtiment à la corbeille : photos du bâtiment, de ses étages, zones, pièces, murs, équipements, plan, et annotations');
update public.tools_releves_batiments set deleted_at = null where id = 'c6200000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.tools_releves_elements
    where releve_id = 'c6000000-0000-0000-0000-000000000001' and type in ('photo_anchor', 'annotation') and deleted_at is not null),
  0, 'K4. bâtiment restauré : tout est restauré');
update public.tools_releves_chantiers set deleted_at = now() where id = 'c6100000-0000-0000-0000-000000000001';
select is(
  (select deleted_at is not null from public.tools_releves_elements where id = 'c6800000-0000-0000-0000-000000000003'),
  true, 'K5. chantier à la corbeille : sa photo suit');
update public.tools_releves_chantiers set deleted_at = null where id = 'c6100000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.tools_releves_elements
    where releve_id = 'c6000000-0000-0000-0000-000000000001' and type in ('photo_anchor', 'annotation') and deleted_at is not null),
  0, 'K6. chantier restauré : photos du chantier et de toute sa descendance restaurées');
update public.tools_releves_elements set deleted_at = now() where id = 'c6600000-0000-0000-0000-000000000001';
update public.tools_releves_elements set deleted_at = null where id = 'c6600000-0000-0000-0000-000000000001';
select is(
  (select deleted_at is null from public.tools_releves_elements where id = 'c6800000-0000-0000-0000-000000000007'),
  true, 'K7. mur retiré puis restauré : sa photo suit dans les deux sens');
update public.tools_releves_elements set deleted_at = now() where id = 'c6800000-0000-0000-0000-000000000001';
select is(
  (select deleted_at is not null from public.tools_releves_elements where id = 'c6900000-0000-0000-0000-000000000001'),
  true, 'K8. PhotoAnchor retiré : ses annotations suivent');
update public.tools_releves_elements set deleted_at = null where id = 'c6800000-0000-0000-0000-000000000001';

-- ─────────────────────────────────────────────────────────────
-- D. Duplication Lot 3 : jamais de photo recopiée
-- ─────────────────────────────────────────────────────────────
create temporary table _copie on commit drop as
  select public.tools_releve_dupliquer_noeud('piece', 'c6500000-0000-0000-0000-000000000001') as id;
select is(
  (select count(*)::int from public.tools_releves_elements where piece_id = (select id from _copie)),
  0, 'D1. pièce dupliquée : aucun PhotoAnchor, annotation ni élément recopié');
create temporary table _copie_etage on commit drop as
  select public.tools_releve_dupliquer_noeud('etage', 'c6300000-0000-0000-0000-000000000001') as id;
select is(
  (select count(*)::int from public.tools_releves_elements where etage_id = (select id from _copie_etage))
   + (select count(*)::int from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001') - 9,
  0, 'D2. étage dupliqué : aucune photo recopiée, aucun média créé');

-- ─────────────────────────────────────────────────────────────
-- V. Versions
-- ─────────────────────────────────────────────────────────────
create temporary table _avant on commit drop as
  select id, revision, updated_at from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001';
create temporary table _v1 on commit drop as
  select (public.tools_releve_creer_version('c6000000-0000-0000-0000-000000000001', 'Existant')).id as id;
select is(
  (select count(*)::int from public.tools_releves_medias m join _avant a using (id) where m.revision <> a.revision or m.updated_at <> a.updated_at),
  0, 'V1. créer une version ne modifie aucune photo');
select is(
  (select jsonb_array_length(contenu->'medias') || '|' ||
          (select count(*) from jsonb_array_elements(contenu->'elements') e where e->>'type' = 'photo_anchor')
     from public.tools_releves_versions where id = (select id from _v1)),
  '9|9', 'V2. la version initiale fige les 9 photos et leurs 9 rattachements');
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata, version_reference_id, etat_documente)
values ('c6700000-0000-0000-0000-00000000000a', 'c6000000-0000-0000-0000-000000000001', 'photos',
        pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-00000000000a'), 'image/jpeg', 900000, pg_temp.meta(10),
        'c6000000-0000-0000-0000-000000000001', 'corrige');
insert into storage.objects(bucket_id, name, owner, metadata)
values ('tools-releves', pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-00000000000a'), auth.uid(), '{"size":900000}');
select is(
  (select (version_reference_id = (select id from _v1))::text || '|' || etat_documente from public.tools_releves_medias where id = 'c6700000-0000-0000-0000-00000000000a'),
  'true|corrige', 'V3. photo déposée après la version 1 : version de référence imposée par le serveur, état « corrigé »');
select is(
  public.tools_releve_media_fige('c6700000-0000-0000-0000-000000000002')::text || '|' || public.tools_releve_media_fige('c6700000-0000-0000-0000-00000000000a')::text,
  'true|false', 'V4. photo figée par une version / photo postérieure non figée');
select is(public.tools_releve_retirer_photo('c6700000-0000-0000-0000-000000000002')->>'fige', 'true',
  'V5. retrait d''une photo figée : le serveur signale que le fichier doit être conservé');
with d as (delete from storage.objects where bucket_id = 'tools-releves'
           and name in (pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-000000000002'),
                        pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6710000-0000-0000-0000-000000000002')) returning 1)
select is((select count(*)::int from d), 0, 'V6. fichier et miniature figés : suppression refusée même au propriétaire (la version reste lisible)');
select is(public.tools_releve_retirer_photo('c6700000-0000-0000-0000-00000000000a')->>'fige', 'false', 'V7a. photo postérieure : non figée');
with d as (delete from storage.objects where bucket_id = 'tools-releves'
           and name = pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-00000000000a') returning 1)
select is((select count(*)::int from d), 1, 'V7. photo non figée : fichier supprimé par son auteur');
select lives_ok($$select public.tools_releve_creer_version('c6000000-0000-0000-0000-000000000001', 'Correction', 'corrige')$$,
  'V8. nouvelle version après retrait');
select is(
  (select string_agg(numero || ':' || (contenu->'medias' @> '[{"id":"c6700000-0000-0000-0000-000000000002"}]')::text, ',' order by numero)
     from public.tools_releves_versions where releve_id = 'c6000000-0000-0000-0000-000000000001'),
  '1:true,2:false', 'V9. l''ancienne version garde la photo retirée ; la nouvelle ne la contient plus');

-- ─────────────────────────────────────────────────────────────
-- P. RLS
-- ─────────────────────────────────────────────────────────────
select is((select count(*)::int from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001'),
  10, 'P1. propriétaire : voit toutes les photos (retirées comprises, pour la corbeille)');
-- Relevé privé R3 : une photo.
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
values ('c6700000-0000-0000-0000-0000000000e3', 'c6000000-0000-0000-0000-000000000003', 'photos',
        pg_temp.chemin('c6000000-0000-0000-0000-000000000003', 'c6700000-0000-0000-0000-0000000000e3'), 'image/jpeg', 900000, pg_temp.meta(227));
insert into storage.objects(bucket_id, name, owner, metadata)
values ('tools-releves', pg_temp.chemin('c6000000-0000-0000-0000-000000000003', 'c6700000-0000-0000-0000-0000000000e3'), auth.uid(), '{"size":900000}');

-- Responsable (admin Relevé) de l'entreprise.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
with up as (update public.tools_releves_medias set commentaire = 'Vu par le responsable' where id = 'c6700000-0000-0000-0000-000000000003' returning 1)
select is((select count(*)::int from up) + (select count(*)::int from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000003'),
  2, 'P2. responsable : modifie un commentaire et voit aussi le relevé privé');

-- Métreur membre (relevé partagé).
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
  values ('c6700000-0000-0000-0000-0000000000b1', 'c6000000-0000-0000-0000-000000000001', 'photos',
          pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-0000000000b1'), 'image/jpeg', 900000, pg_temp.meta(177));
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6800000-0000-0000-0000-0000000000b1', 'c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000002',
   '{"mediaId":"c6700000-0000-0000-0000-0000000000b1","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-000000000002"}},"directionRad":null,"legende":null}');
  insert into storage.objects(bucket_id, name, owner, metadata)
  values ('tools-releves', pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-0000000000b1'), auth.uid(), '{"size":900000}') $$,
  'P3. membre autorisé : ajoute une photo à une pièce du relevé partagé (fichier, ligne, rattachement)');
select is((select count(*)::int from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000003')
          + (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like '%/c6000000-0000-0000-0000-000000000003/%'),
  0, 'P4. membre : ne voit ni les photos ni les fichiers d''un relevé privé d''un collègue');
with d as (delete from storage.objects where bucket_id = 'tools-releves'
           and name = pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-000000000003') returning 1)
select is((select count(*)::int from d), 0, 'P5. membre : ne supprime pas le fichier d''un collègue');

-- Consultation.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releves_medias where releve_id = 'c6000000-0000-0000-0000-000000000001'),
  11, 'P6. consultation : voit les photos du relevé partagé');
with up as (update public.tools_releves_medias set commentaire = 'Tentative' where id = 'c6700000-0000-0000-0000-000000000004' returning 1)
select is((select count(*)::int from up), 0, 'P7. consultation : ne modifie pas un commentaire');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor',
   '{"mediaId":"c6700000-0000-0000-0000-000000000004","ancre":{"kind":"entite","ref":{"kind":"releve","id":"c6000000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  '42501', null, 'P8. consultation : aucun rattachement');

-- Authentifié de l'entreprise, sans habilitation Relevé.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::int from public.tools_releves_medias) + (select count(*)::int from public.tools_releves_elements)
   + (select count(*)::int from storage.objects where bucket_id = 'tools-releves'),
  0, 'P9. authentifié non habilité : aucune photo, aucun rattachement, aucun fichier');
select throws_ok($$
  insert into storage.objects(bucket_id, name, owner) values
  ('tools-releves', pg_temp.chemin('c6000000-0000-0000-0000-000000000001', 'c6700000-0000-0000-0000-0000000000f9'), auth.uid()) $$,
  '42501', null, 'P10. authentifié non habilité : aucun dépôt');

-- Autre tenant.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is(
  (select count(*)::int from public.tools_releves_medias) + (select count(*)::int from public.tools_releves_elements where type in ('photo_anchor', 'annotation'))
   + (select count(*)::int from storage.objects where bucket_id = 'tools-releves'),
  0, 'P11. autre tenant : aucune photo, annotation ni fichier (aucune URL signée possible)');
select throws_ok($$ select public.tools_releve_retirer_photo('c6700000-0000-0000-0000-000000000004') $$,
  'P0002', null, 'P12. autre tenant : retrait impossible');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.tools_releves_medias $$, '42501', null, 'P13. anonyme : aucune lecture');
reset role;

set local role service_role;
select is(
  (select count(*)::int from public.tools_releves_medias where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and releve_id::text like 'c6%'),
  12, 'P14a. service_role : lecture technique complète (hors RLS, jamais exposé au client)');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, donnees) values
  ('c6000000-0000-0000-0000-000000000001', 'photo_anchor', 'c6300000-0000-0000-0000-000000000001',
   '{"mediaId":"c6700000-0000-0000-0000-000000000004","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-000000000001"}},"directionRad":null,"legende":null}') $$,
  '23514', null, 'P14. service_role : l''intégrité des rattachements s''applique aussi (pas seulement la RLS)');
reset role;

-- ─────────────────────────────────────────────────────────────
-- X. Relevé à la corbeille
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
update public.tools_releves set deleted_at = now() where id = 'c6000000-0000-0000-0000-000000000002';
select throws_ok($$
  insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets, metadata)
  values ('c6700000-0000-0000-0000-0000000000a2', 'c6000000-0000-0000-0000-000000000002', 'photos',
          pg_temp.chemin('c6000000-0000-0000-0000-000000000002', 'c6700000-0000-0000-0000-0000000000a2'), 'image/jpeg', 900000, pg_temp.meta(162)) $$,
  '42501', null, 'X1. relevé à la corbeille : aucune nouvelle photo');
select throws_ok($$
  insert into storage.objects(bucket_id, name, owner) values
  ('tools-releves', pg_temp.chemin('c6000000-0000-0000-0000-000000000002', 'c6700000-0000-0000-0000-0000000000a2'), auth.uid()) $$,
  '42501', null, 'X2. relevé à la corbeille : aucun dépôt de fichier');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.tools_releves where id = 'c6000000-0000-0000-0000-000000000002'),
  0, 'X3. relevé à la corbeille : invisible pour un membre (seuls propriétaire et responsable le restaurent)');
reset role;

-- ─────────────────────────────────────────────────────────────
-- G. RGPD
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
create temporary table _export_a on commit drop as
  select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') as e;
reset role;
select ok(
  (select bool_or(m->>'commentaire' = 'Humidité en pied de mur') and bool_and(m ? 'etat_documente') and bool_and(m ? 'miniature_storage_path')
          and bool_or(m->'metadata'->>'empreinteSha256' = repeat('01', 32))
     from _export_a, jsonb_array_elements(e->'donnees'->'tools_releves_medias') m),
  'G1. export RGPD : commentaire, état, miniature et métadonnées de preuve exportés');
select ok(
  (select count(*) >= 3 from _export_a, jsonb_array_elements(e->'donnees'->'tools_releves_elements') x
    where x->>'type' = 'annotation' and x->'donnees'->'geometrie'->>'espace' = 'photo'),
  'G2. export RGPD : annotations sur photo exportées');
select is(
  (select count(*)::int from jsonb_array_elements(public.manifeste_fichiers_entreprise('a0000000-0000-0000-0000-000000000001')) f
    where f->>'table' = 'tools_releves_medias.miniature'),
  9, 'G3. manifeste RGPD : miniatures inventoriées');
select is(
  (select count(*)::int from public.verifier_storage_entreprise('a0000000-0000-0000-0000-000000000001')
    where bucket_id = 'tools-releves' and categorie = 'ORPHELIN'),
  0, 'G4. inventaire Storage : photos et miniatures rattachées à leur ligne (aucun orphelin)');

-- Tenant R : photo + miniature + rattachement + annotation + commentaire, puis purge réelle.
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
  values ('c6000000-0000-0000-0000-00000000000e', 'e0000000-0000-0000-0000-000000000001', 'Relevé R', 'Chantier R');
insert into public.tools_releves_batiments(id, releve_id, nom) values ('c6200000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000000e', 'Bât R');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau)
  values ('c6300000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000000e', 'c6200000-0000-0000-0000-00000000000e', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage)
  values ('c6500000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000000e', 'c6300000-0000-0000-0000-00000000000e', 'Séjour', 'sejour');
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, miniature_storage_path, mime_type, taille_octets, metadata, commentaire)
values ('c6700000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000000e', 'photos',
        'e0000000-0000-0000-0000-000000000001/c6000000-0000-0000-0000-00000000000e/photos/c6700000-0000-0000-0000-00000000000e.jpg',
        'e0000000-0000-0000-0000-000000000001/c6000000-0000-0000-0000-00000000000e/photos/c6710000-0000-0000-0000-00000000000e.jpg',
        'image/jpeg', 900000, pg_temp.meta(14), 'Commentaire R');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6800000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000000e', 'photo_anchor', 'c6300000-0000-0000-0000-00000000000e', 'c6500000-0000-0000-0000-00000000000e',
   '{"mediaId":"c6700000-0000-0000-0000-00000000000e","ancre":{"kind":"entite","ref":{"kind":"piece","id":"c6500000-0000-0000-0000-00000000000e"}},"directionRad":null,"legende":null}');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('c6900000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000000e', 'annotation', 'c6300000-0000-0000-0000-00000000000e', 'c6500000-0000-0000-0000-00000000000e',
   '{"ancre":{"kind":"entite","ref":{"kind":"element","id":"c6800000-0000-0000-0000-00000000000e"}},"texte":"R","forme":"texte","geometrie":{"espace":"photo","x":0.5,"y":0.5},"mediaAudioId":null}');
select id from public.tools_releve_creer_version('c6000000-0000-0000-0000-00000000000e', 'Existant');
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('tools-releves', 'e0000000-0000-0000-0000-000000000001/c6000000-0000-0000-0000-00000000000e/photos/c6700000-0000-0000-0000-00000000000e.jpg', '{"size":900000}'),
  ('tools-releves', 'e0000000-0000-0000-0000-000000000001/c6000000-0000-0000-0000-00000000000e/photos/c6710000-0000-0000-0000-00000000000e.jpg', '{"size":20000}');
create temporary table _objets_a on commit drop as
  select count(*)::int as n from storage.objects where bucket_id = 'tools-releves' and name like 'a0000000-0000-0000-0000-000000000001/%';

update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = 'e0000000-0000-0000-0000-000000000001';
select set_config('rgpd.entreprise_cible', 'e0000000-0000-0000-0000-000000000001', true);
select set_config('rgpd.run_id', 'c6f00000-0000-0000-0000-00000000000e', true);
\ir fixtures/rgpd_purge_driver.inc
reset role;

select is(current_setting('rgpd.resultat'), 'complete', 'G5. purge RGPD du tenant R complète (version figée comprise : la purge n''est pas bloquée)');
select is(
  (select count(*)::int from public.tools_releves_medias where entreprise_id = 'e0000000-0000-0000-0000-000000000001')
   + (select count(*)::int from public.tools_releves_elements where entreprise_id = 'e0000000-0000-0000-0000-000000000001')
   + (select count(*)::int from public.tools_releves_versions where entreprise_id = 'e0000000-0000-0000-0000-000000000001')
   + (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like 'e0000000-0000-0000-0000-000000000001/%'),
  0, 'G6. purge : photo, miniature, métadonnées, commentaire, rattachement, annotation et version supprimés (lignes et fichiers)');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like 'a0000000-0000-0000-0000-000000000001/%'),
  (select n from _objets_a), 'G7. isolation : fichiers du tenant A intacts');

select * from finish();
rollback;
