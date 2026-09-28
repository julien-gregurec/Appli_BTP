-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — SURFACE DE LA PIÈCE SYNCHRONISÉE DEPUIS LE PLAN (migration 20260928000601)
--
-- Qualifie sous RLS réelle (train canonique V6, décision produit §6) :
--   A1–A6   schéma et droits : autorisation liée à la transaction inaccessible, fonctions internes non
--           exécutables par l'application, déclencheur présent ;
--   G1–G5   garde Lot 3 préservée : écriture directe client ignorée (insertion et mise à jour), dépôt
--           d'autorisation et appel direct refusés, autorisation d'une autre transaction sans effet ;
--   Y1–Y9   synchronisation serveur : surface = contour du plan de référence (recalculée), volume réservé,
--           journal (source, plan, avant / après, auteur), autorisation retirée, suivi des modifications,
--           enregistrement sans contour modifié sans effet, contour retiré → valeur conservée ;
--   F1–F6   versions : plan figé → valeur stable, plan dérivé (corrigé) source, figé et instantané de version
--           intacts, plan projeté ignoré ;
--   P1–P6   pièce supprimée non écrite, autre tenant refusé (écriture et lecture), lecture sous RLS,
--           idempotence, suppression des plans récents → retour au plan de référence précédent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006']::uuid[]) u;

-- Rectangle w × h (mm) en contour de pièce.
create function pg_temp.rect(piece text, w int, h int) returns jsonb language sql as $$
  select jsonb_build_object('pieceId', piece, 'points', jsonb_build_array(
    jsonb_build_object('x', 0, 'y', 0), jsonb_build_object('x', w, 'y', 0),
    jsonb_build_object('x', w, 'y', h), jsonb_build_object('x', 0, 'y', h))) $$;
grant execute on function pg_temp.rect(text, int, int) to authenticated, service_role;
create function pg_temp.rev(p uuid) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p $$;
grant execute on function pg_temp.rev(uuid) to authenticated, service_role;
create function pg_temp.save(p uuid, mods jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_enregistrer(p, pg_temp.rev(p), mods) $$;
grant execute on function pg_temp.save(uuid, jsonb) to authenticated, service_role;
create function pg_temp.surface(p text) returns numeric language sql security definer as $$
  select surface_calculee_mm2 from public.tools_releves_pieces where id = p::uuid $$;
grant execute on function pg_temp.surface(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- A. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select has_table('platform', 'tools_releve_surface_autorisations', 'A1. autorisation liée à la transaction');
select ok((select relrowsecurity from pg_class where oid = 'platform.tools_releve_surface_autorisations'::regclass)
          and not has_table_privilege('authenticated', 'platform.tools_releve_surface_autorisations', 'INSERT')
          and not has_table_privilege('anon', 'platform.tools_releve_surface_autorisations', 'SELECT')
          and not has_table_privilege('service_role', 'platform.tools_releve_surface_autorisations', 'INSERT'),
  'A2. autorisations : RLS, aucun droit pour anon / authenticated / service_role');
select ok(not has_function_privilege('authenticated', 'public.tools_releve_pieces_surface_synchroniser(uuid, uuid[])', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_pieces_surface_synchroniser(uuid, uuid[])', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.tools_releve_pieces_surface_synchroniser(uuid, uuid[])', 'EXECUTE'),
  'A3. synchronisation : non exécutable par l''application');
select ok((select prosecdef from pg_proc where proname = 'tools_releve_pieces_surface_synchroniser')
          and (select prosecdef from pg_proc where proname = 'tools_releve_structure_garde'),
  'A4. synchronisation et garde Lot 3 : SECURITY DEFINER');
select has_trigger('public', 'tools_releves_plans', 'tools_releves_plans_surface_sync', 'A5. déclencheur sur les plans');
select ok(not has_function_privilege('authenticated', 'public.tools_releve_plan_surface_sync()', 'EXECUTE'),
  'A6. fonction du déclencheur non exécutable par l''application');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur 10…03 (tenant A), étage RDC, 3 pièces.
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('d7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé surface', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'd7000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('d7300000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage, hauteur_sous_plafond_mm, surface_calculee_mm2) values
  ('d7500000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7300000-0000-0000-0000-000000000001', 'Séjour', 'sejour', 2500, 999),
  ('d7500000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd7300000-0000-0000-0000-000000000001', 'Chambre', 'chambre', 2500, null),
  ('d7500000-0000-0000-0000-000000000003', 'd7000000-0000-0000-0000-000000000001', 'd7300000-0000-0000-0000-000000000001', 'Cellier', 'cellier', 2500, null);

-- ─────────────────────────────────────────────────────────────
-- G. Garde Lot 3 préservée
-- ─────────────────────────────────────────────────────────────
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), null, 'G1. insertion client : surface fournie ignorée');
update public.tools_releves_pieces set surface_calculee_mm2 = 5, volume_calcule_mm3 = 5, calcule_le = now()
where id = 'd7500000-0000-0000-0000-000000000001';
select is((select coalesce(surface_calculee_mm2::text, '∅') || '|' || coalesce(volume_calcule_mm3::text, '∅') || '|' || coalesce(calcule_le::text, '∅')
           from public.tools_releves_pieces where id = 'd7500000-0000-0000-0000-000000000001'),
  '∅|∅|∅', 'G2. mise à jour client : colonnes calculées ignorées');
select throws_ok($$ insert into platform.tools_releve_surface_autorisations values (txid_current(), 'd7500000-0000-0000-0000-000000000001') $$,
  '42501', null, 'G3. le client ne dépose pas d''autorisation');
select throws_ok($$ select public.tools_releve_pieces_surface_synchroniser('d7300000-0000-0000-0000-000000000001', array['d7500000-0000-0000-0000-000000000001'::uuid]) $$,
  '42501', null, 'G4. le client n''appelle pas la synchronisation');
reset role;
insert into platform.tools_releve_surface_autorisations values (1, 'd7500000-0000-0000-0000-000000000001');
set local role authenticated;
update public.tools_releves_pieces set surface_calculee_mm2 = 7 where id = 'd7500000-0000-0000-0000-000000000001';
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), null, 'G5. autorisation d''une autre transaction : sans effet');
reset role;
delete from platform.tools_releve_surface_autorisations;
set local role authenticated;

-- ─────────────────────────────────────────────────────────────
-- Y. Synchronisation serveur
-- ─────────────────────────────────────────────────────────────
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('d7300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role;
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), null, 'Y1. plan sans contour : rien n''est écrit');
select pg_temp.save((select id from _p), jsonb_build_object('contours', jsonb_build_array(
  pg_temp.rect('d7500000-0000-0000-0000-000000000001', 3000, 4000), pg_temp.rect('d7500000-0000-0000-0000-000000000002', 2500, 3000))));
select is((select surface_calculee_mm2::text || '|' || (calcule_le is not null)::text || '|' || coalesce(volume_calcule_mm3::text, '∅')
           from public.tools_releves_pieces where id = 'd7500000-0000-0000-0000-000000000001'),
  '12000000.0|true|∅', 'Y2. contour enregistré : surface serveur (12 m²), horodatage ; volume réservé');
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000002'), 7500000.0, 'Y3. seconde pièce : 7,5 m²');
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000003'), null, 'Y4. pièce sans contour : inchangée');
select is((select (details->>'source') || '|' || (details->>'plan_id' = (select id::text from _p))::text || '|' || (details->>'plan_numero')
                  || '|' || coalesce(details->>'avant_mm2', '∅') || '|' || (details->>'apres_mm2') || '|' || array_to_string(champs, ',')
                  || '|' || (auteur_id = '10000000-0000-0000-0000-000000000003')::text
           from public.tools_releves_journal where entite = 'piece' and entite_id = 'd7500000-0000-0000-0000-000000000001'
             and details ? 'source' order by id desc limit 1),
  'plan|true|1|∅|12000000.0|calcule_le,surface_calculee_mm2|true', 'Y5. journal : source plan, numéro, avant / après, auteur');
reset role;
select is((select count(*)::int from platform.tools_releve_surface_autorisations), 0, 'Y6. aucune autorisation résiduelle');
set local role authenticated;
select pg_temp.save((select id from _p), jsonb_build_object('contours', jsonb_build_array(
  pg_temp.rect('d7500000-0000-0000-0000-000000000001', 3000, 5000), pg_temp.rect('d7500000-0000-0000-0000-000000000002', 2500, 3000))));
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 15000000.0, 'Y7. contour modifié : surface suivie (15 m²)');
create temporary table _rev on commit drop as select id, revision from public.tools_releves_pieces where releve_id = 'd7000000-0000-0000-0000-000000000001';
grant select on _rev to authenticated;
select pg_temp.save((select id from _p), '{"cadre":{"minX":0,"minY":0,"maxX":30000,"maxY":20000}}');
select pg_temp.save((select id from _p), jsonb_build_object('contours', jsonb_build_array(pg_temp.rect('d7500000-0000-0000-0000-000000000002', 2500, 3000))));
select is((select count(*)::int from public.tools_releves_pieces p join _rev r using (id) where p.revision <> r.revision), 0,
  'Y8. enregistrement sans contour modifié, ou contour retiré : aucune pièce réécrite');
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 15000000.0, 'Y9. contour retiré : valeur existante conservée (pas d''effacement)');

-- ─────────────────────────────────────────────────────────────
-- F. Versions et plans dérivés
-- ─────────────────────────────────────────────────────────────
select pg_temp.save((select id from _p), jsonb_build_object('contours', jsonb_build_array(
  pg_temp.rect('d7500000-0000-0000-0000-000000000001', 4000, 4000), pg_temp.rect('d7500000-0000-0000-0000-000000000002', 2500, 3000))));
create temporary table _fige on commit drop as select * from public.tools_releve_plan_figer((select id from _p), pg_temp.rev((select id from _p)), 'Existant');
grant select on _fige to authenticated;
create temporary table _v on commit drop as
  select v.id, md5(v.contenu::text) as h, v.empreinte from public.tools_releves_versions v where v.id = (select version_id from _fige);
grant select on _v to authenticated;
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 16000000.0, 'F1. plan figé : surface stable (16 m²)');
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('d7300000-0000-0000-0000-000000000001', 'corrige');
grant select on _c to authenticated;
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 16000000.0, 'F2. plan corrigé dérivé (contours copiés) : même surface');
select pg_temp.save((select id from _c), jsonb_build_object('contours', jsonb_build_array(
  pg_temp.rect('d7500000-0000-0000-0000-000000000001', 4000, 4500), pg_temp.rect('d7500000-0000-0000-0000-000000000002', 2500, 3000))));
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 18000000.0, 'F3. plan corrigé modifié : il devient la source (18 m²)');
select ok((select (p.contours->0->>'surfaceMm2')::numeric = 16000000 and p.revision = (select revision from _fige) and p.contours = (select contours from _fige)
           from public.tools_releves_plans p where p.id = (select id from _p)), 'F4. plan figé : contours et révision intacts');
select is((select md5(v.contenu::text) || v.empreinte from public.tools_releves_versions v where v.id = (select id from _v)),
  (select h || empreinte from _v), 'F5. instantané de version figé : contenu et empreinte intacts');
create temporary table _pj on commit drop as select * from public.tools_releve_plan_creer('d7300000-0000-0000-0000-000000000001', 'projete');
grant select on _pj to authenticated;
select pg_temp.save((select id from _pj), jsonb_build_object('contours', jsonb_build_array(pg_temp.rect('d7500000-0000-0000-0000-000000000001', 6000, 6000))));
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 18000000.0, 'F6. plan projeté (travaux à venir) : ignoré');

-- ─────────────────────────────────────────────────────────────
-- P. Pièce supprimée, autre tenant, lecture, idempotence, retour arrière
-- ─────────────────────────────────────────────────────────────
update public.tools_releves_pieces set deleted_at = now() where id = 'd7500000-0000-0000-0000-000000000002';
-- Contour d'une pièce supprimée : écriture serveur directe (l'enregistrement client le refuse déjà).
reset role;
update public.tools_releves_plans set contours = jsonb_build_array(
  pg_temp.rect('d7500000-0000-0000-0000-000000000001', 4000, 4500), pg_temp.rect('d7500000-0000-0000-0000-000000000002', 5000, 5000))
where id = (select id from _c);
set local role authenticated;
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000002'), 7500000.0, 'P1. pièce supprimée : non écrite');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 1, '{"contours":[]}') $$, (select id from _c)),
  '42501', null, 'P2. autre tenant : aucun enregistrement, donc aucune synchronisation');
select is((select count(*)::int from public.tools_releves_pieces where releve_id = 'd7000000-0000-0000-0000-000000000001'), 0,
  'P3. autre tenant : surface illisible (RLS inchangée)');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select surface_calculee_mm2 from public.tools_releves_pieces where id = 'd7500000-0000-0000-0000-000000000001'), 18000000.0,
  'P4. métreur : surface lisible sous RLS dans la fiche pièce');
reset role;
select is(public.tools_releve_pieces_surface_synchroniser('d7300000-0000-0000-0000-000000000001',
  array['d7500000-0000-0000-0000-000000000001'::uuid, 'd7500000-0000-0000-0000-000000000003'::uuid]), 0,
  'P5. resynchronisation : idempotente (aucune écriture si la valeur est déjà à jour)');
update public.tools_releves_plans set deleted_at = now() where id in ((select id from _c), (select id from _pj));
select is(pg_temp.surface('d7500000-0000-0000-0000-000000000001'), 16000000.0, 'P6. plans corrigé et projeté supprimés : retour au plan figé (16 m²)');

select * from finish();
rollback;
