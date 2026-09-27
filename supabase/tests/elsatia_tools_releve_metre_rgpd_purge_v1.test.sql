-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — RECOVERY V2 — RGPD
--
-- Qualifie, sur le train canonique V3, la compatibilité des tables et du bucket Relevé
-- (migrations 20260927000601 / 20260927000602) avec la purge d'entreprise et l'export RGPD
-- existants, SANS les modifier :
--   P1–P3  export `exporter_donnees_entreprise` : les tables Relevé (toutes porteuses
--          d'`entreprise_id`) sont exportées pour leur tenant et pas pour un autre ;
--   P4–P6  rapport de purge : tables Relevé classées DELETE, ordre topologique compatible
--          avec les clés composites et l'auto-référence des versions (version de base) ;
--   P7–P13 purge réelle (déroulé de scripts/purger-entreprise.mjs) d'un tenant R qui n'utilise
--          que Relevé : complète, plus aucune ligne Relevé, objets `tools-releves` supprimés,
--          tenants A et B intacts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir fixtures/isolation_multitenant.inc

-- Tenant R : entreprise qui n'utilise que Relevé (aucun contrat GP accepté, qui bloquerait la
-- purge pour une raison étrangère à ce lot — DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE).
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
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006',
                   '40000000-0000-0000-0000-000000000006']::uuid[]) u;

-- Jeu Relevé complet dans chaque tenant, créé par le métier (authenticated, RLS active).
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
  values ('d1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'Relevé B', 'Chantier B');
insert into public.tools_releves_batiments(id, releve_id, nom)
  values ('d3000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000b', 'Bâtiment B');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau)
  values ('d4000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-00000000000b', 'RDC', 0);
insert into public.tools_releves_zones(id, releve_id, etage_id, nom)
  values ('d5000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000b', 'Logement');
insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage)
  values ('d6000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000b',
          'd5000000-0000-0000-0000-00000000000b', 'Séjour', 'sejour');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('d7000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000b', 'mur', 'd4000000-0000-0000-0000-00000000000b',
   'd6000000-0000-0000-0000-00000000000b', '{"a":{"x":0,"y":0},"b":{"x":4200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, parent_element_id, donnees) values
  ('d7000000-0000-0000-0000-0000000000bb', 'd1000000-0000-0000-0000-00000000000b', 'ouverture', 'd4000000-0000-0000-0000-00000000000b',
   'd6000000-0000-0000-0000-00000000000b', 'd7000000-0000-0000-0000-00000000000b',
   '{"decalageMm":600,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche"}');
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets) values
  ('d8000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000b', 'photos',
   'b0000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-00000000000b/photos/d8000000-0000-0000-0000-00000000000b.jpg', 'image/jpeg', 120000);
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000b', 'Existant');
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000b', 'Correction', 'corrige');
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000b', 'Projet', 'projete');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
  values ('d1000000-0000-0000-0000-00000000000e', 'e0000000-0000-0000-0000-000000000001', 'Relevé R', 'Chantier R');
insert into public.tools_releves_batiments(id, releve_id, nom)
  values ('d3000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-00000000000e', 'Bâtiment R');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau)
  values ('d4000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-00000000000e', 'd3000000-0000-0000-0000-00000000000e', 'RDC', 0);
insert into public.tools_releves_zones(id, releve_id, etage_id, nom)
  values ('d5000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-00000000000e', 'd4000000-0000-0000-0000-00000000000e', 'Logement');
insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage)
  values ('d6000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-00000000000e', 'd4000000-0000-0000-0000-00000000000e',
          'd5000000-0000-0000-0000-00000000000e', 'Séjour', 'sejour');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
  ('d7000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-00000000000e', 'mur', 'd4000000-0000-0000-0000-00000000000e',
   'd6000000-0000-0000-0000-00000000000e', '{"a":{"x":0,"y":0},"b":{"x":4200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, parent_element_id, donnees) values
  ('d7000000-0000-0000-0000-0000000000ee', 'd1000000-0000-0000-0000-00000000000e', 'ouverture', 'd4000000-0000-0000-0000-00000000000e',
   'd6000000-0000-0000-0000-00000000000e', 'd7000000-0000-0000-0000-00000000000e',
   '{"decalageMm":600,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche"}');
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets) values
  ('d8000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-00000000000e', 'photos',
   'e0000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-00000000000e/photos/d8000000-0000-0000-0000-00000000000e.jpg', 'image/jpeg', 120000);
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000e', 'Existant');
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000e', 'Correction', 'corrige');
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000e', 'Projet', 'projete');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
  values ('d1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'Relevé A', 'Chantier A');
insert into public.tools_releves_batiments(id, releve_id, nom)
  values ('d3000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000a', 'Bâtiment A');
insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets) values
  ('d8000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000a', 'photos',
   'a0000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-00000000000a/photos/d8000000-0000-0000-0000-00000000000a.jpg', 'image/jpeg', 120000);
select id from public.tools_releve_creer_version('d1000000-0000-0000-0000-00000000000a', 'Existant');
reset role;

-- Objets Storage correspondants (ce que l'upload client aurait déposé).
insert into storage.objects (bucket_id, name, metadata) values
  ('tools-releves', 'b0000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-00000000000b/photos/d8000000-0000-0000-0000-00000000000b.jpg', '{"size":120000}'),
  ('tools-releves', 'e0000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-00000000000e/photos/d8000000-0000-0000-0000-00000000000e.jpg', '{"size":120000}'),
  ('tools-releves', 'a0000000-0000-0000-0000-000000000001/d1000000-0000-0000-0000-00000000000a/photos/d8000000-0000-0000-0000-00000000000a.jpg', '{"size":120000}');

create temporary table _releve_tables on commit drop as
  select c.relname::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tools\_releves%';

-- ─────────────────────────────────────────────────────────────
-- Export RGPD (droit d'accès / portabilité)
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
create temporary table _export_b on commit drop as
  select public.exporter_donnees_entreprise('b0000000-0000-0000-0000-000000000001') as e;
reset role;
select ok(
  (select (e -> 'donnees') ?& array['tools_releves','tools_releves_chantiers','tools_releves_batiments','tools_releves_etages',
                                   'tools_releves_zones','tools_releves_pieces','tools_releves_elements','tools_releves_medias',
                                   'tools_releves_versions','tools_releves_journal'] from _export_b),
  'P1. export RGPD : toutes les tables Relevé peuplées du tenant sont exportées');
select is(
  (select count(*)::int from _export_b, jsonb_array_elements(e -> 'donnees' -> 'tools_releves') r
    where r ->> 'entreprise_id' <> 'b0000000-0000-0000-0000-000000000001'),
  0, 'P2. export RGPD : aucune ligne Relevé d''un autre tenant');
select is(
  (select jsonb_array_length(e -> 'donnees' -> 'tools_releves_versions') from _export_b), 3,
  'P3. export RGPD : l''historique complet des versions est restitué');

-- ─────────────────────────────────────────────────────────────
-- Rapport de purge
-- ─────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.rapport_purge_entreprise('e0000000-0000-0000-0000-000000000001') r
    join _releve_tables t on t.t = r.table_nom where r.categorie <> 'DELETE'),
  0, 'P4. rapport de purge : aucune table Relevé n''est conservée ni anonymisée');
select ok(
  (select min(r.ordre) filter (where r.table_nom = 'tools_releves_versions')
            <= min(r.ordre) filter (where r.table_nom = 'tools_releves')
     from public.rapport_purge_entreprise('e0000000-0000-0000-0000-000000000001') r),
  'P5. rapport de purge : les versions passent avant le projet');
select is(
  (select categorie from public.verifier_storage_entreprise('e0000000-0000-0000-0000-000000000001')
    where bucket_id = 'tools-releves'),
  'A_PURGER', 'P6. Storage : la photo Relevé est référencée par tools_releves_medias (A_PURGER, pas ORPHELIN)');

-- ─────────────────────────────────────────────────────────────
-- Purge réelle du tenant R
-- ─────────────────────────────────────────────────────────────
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = 'e0000000-0000-0000-0000-000000000001';
select set_config('rgpd.entreprise_cible', 'e0000000-0000-0000-0000-000000000001', true);
select set_config('rgpd.run_id', 'd9000000-0000-0000-0000-00000000000e', true);
\ir fixtures/rgpd_purge_driver.inc

select is(
  (select coalesce(array_agg(distinct table_nom order by table_nom), '{}') from platform.purge_audit
    where run_id = 'd9000000-0000-0000-0000-00000000000e' and not ok and table_nom like 'tools\_releves%'),
  '{}'::text[], 'P7. purge : aucune étape Relevé en échec (clés composites, versions chaînées, journal)');
select is(current_setting('rgpd.resultat'), 'complete', 'P8. purge du tenant R complète');
create temporary table _restant (t text, n int) on commit drop;
do $$
declare v text; v_n int;
begin
  for v in select t from _releve_tables loop
    execute format('select count(*) from public.%I where entreprise_id = $1', v) into v_n
      using 'e0000000-0000-0000-0000-000000000001'::uuid;
    insert into _restant values (v, v_n);
  end loop;
end $$;
select is((select sum(n)::int from _restant), 0, 'P9. purge : plus aucune ligne Relevé du tenant R, dans aucune table');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like 'e0000000-0000-0000-0000-000000000001/%'),
  0, 'P10. purge : la photo Relevé du tenant R est supprimée du bucket');
select is(
  (select count(*)::int from public.tools_releves_versions where releve_id = 'd1000000-0000-0000-0000-00000000000a')
   + (select count(*)::int from public.tools_releves_medias where releve_id = 'd1000000-0000-0000-0000-00000000000a')
   + (select count(*)::int from public.tools_releves_batiments where releve_id = 'd1000000-0000-0000-0000-00000000000a'),
  3, 'P11. isolation : le Relevé du tenant A est intact');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like 'a0000000-0000-0000-0000-000000000001/%'),
  1, 'P12. isolation : la photo Relevé du tenant A est intacte');
select is(
  (select count(*)::int from public.tools_releves where entreprise_id = 'b0000000-0000-0000-0000-000000000001')
   + (select count(*)::int from storage.objects where bucket_id = 'tools-releves' and name like 'b0000000-0000-0000-0000-000000000001/%'),
  2, 'P13. isolation : le Relevé et la photo du tenant B sont intacts');

select * from finish();
rollback;
