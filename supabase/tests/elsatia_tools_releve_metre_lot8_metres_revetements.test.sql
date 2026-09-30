-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 8 — DIMENSIONS, SURFACES, VOLUMES & REVÊTEMENTS (migration 20260928000809)
--
-- Qualifie sous RLS réelle, avec des VALEURS EXACTES (les mêmes que la parité Vitest `metre.test.ts`) :
--   S1–S6   schéma et droits : table des ajustements (lecture seule), RPC, calcul interne non exécutable, anonyme ;
--   C1–C9   cotes : libre calculée, calculée fausse refusée, relevée à la main, hauteur ponctuelle, type inconnu,
--           état projeté inconnu, écriture directe contrôlée ;
--   M1–M16  métré serveur : surface brute / nette, plafond, périmètre brut / utile, faces (mur retrouvé), déductions,
--           ouvertures, franchissables, hauteur inconnue → volume et murs non calculables, hauteur de l'étage puis de la
--           pièce, volume, option « petites ouvertures », hauteurs ponctuelles, surface client ignorée ;
--   R1–R10  revêtements : sol / murs / plafond / plinthe / corniche / murs choisis / zone, perte, refus (famille, unité,
--           perte, pièce, mur absent), suppression ;
--   A1–A8   ajustements : valeur calculée par le serveur, valeur retenue propagée, remplacement tracé, retrait, journal,
--           raison obligatoire, immuabilité ;
--   V1–V9   versioning : gel (métré figé, immuable, pièce modifiée après gel sans effet), empreinte, dérivé (copies,
--           murs reportés, ajustements non copiés), projeté (existant / dépose / neuf) ;
--   T1–T6   isolation : consultation, autre tenant, anonyme.
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006']::uuid[]) u;

create function pg_temp.mur(id text, ax int, ay int, bx int, by_ int) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'pieceId', null, 'donnees', jsonb_build_object(
    'a', jsonb_build_object('x', ax, 'y', ay), 'b', jsonb_build_object('x', bx, 'y', by_),
    'epaisseurMm', 200, 'hauteurMm', 2500, 'typeMur', 'porteur')) $$;
grant execute on function pg_temp.mur(text, int, int, int, int) to authenticated, service_role;
create function pg_temp.ouv(id text, mur text, type text, d int, l int, h int, allege int) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'murId', mur, 'donnees', jsonb_build_object('decalageMm', d, 'largeurMm', l, 'hauteurMm', h,
    'allegeMm', allege, 'typeOuverture', type, 'sens', 'gauche')) $$;
grant execute on function pg_temp.ouv(text, text, text, int, int, int, int) to authenticated, service_role;
create function pg_temp.cote(id text, extra jsonb, piece text default null) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'pieceId', piece, 'donnees', jsonb_build_object(
    'cible', jsonb_build_object('kind', 'etage', 'id', 'd8300000-0000-0000-0000-000000000001'), 'typeMesure', 'longueur', 'unite', 'mm',
    'source', 'calcule', 'precisionMm', null, 'priseLe', '2026-09-28T10:00:00Z', 'typeCote', 'libre',
    'a', jsonb_build_object('x', 100, 'y', 100), 'b', jsonb_build_object('x', 3900, 'y', 100), 'valeur', 3800, 'decalageMm', -300) || extra) $$;
grant execute on function pg_temp.cote(text, jsonb, text) to authenticated, service_role;
create function pg_temp.rev(p text) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p::uuid $$;
grant execute on function pg_temp.rev(text) to authenticated, service_role;
create function pg_temp.save(p text, mods jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_enregistrer(p::uuid, pg_temp.rev(p), mods) $$;
grant execute on function pg_temp.save(text, jsonb) to authenticated, service_role;
create function pg_temp.revet(p text, id text, extra jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_revetement_enregistrer(p::uuid, id::uuid, 'd8500000-0000-0000-0000-000000000001',
    jsonb_build_object('libelle', 'Revêtement', 'categorie', 'sol', 'unite', 'm2', 'pertePourcent', 10, 'gpPrestationRef', null, 'revetement', 'carrelage') || extra) $$;
grant execute on function pg_temp.revet(text, text, jsonb) to authenticated, service_role;
-- Métré de la pièce Séjour (première pièce) et d'un revêtement.
create function pg_temp.m(p text) returns jsonb language sql as $$ select public.tools_releve_plan_metre(p::uuid) $$;
grant execute on function pg_temp.m(text) to authenticated, service_role;
create function pg_temp.room(p text) returns jsonb language sql as $$
  select value from jsonb_array_elements(pg_temp.m(p)->'pieces') where value->>'pieceId' = 'd8500000-0000-0000-0000-000000000001' $$;
grant execute on function pg_temp.room(text) to authenticated, service_role;
create function pg_temp.rv(p text, id text) returns jsonb language sql as $$
  select value from jsonb_array_elements(pg_temp.m(p)->'revetements') where value->>'id' = id $$;
grant execute on function pg_temp.rv(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select has_table('public', 'tools_releves_metre_ajustements', 'S1. table des ajustements de métré');
select ok((select pg_get_constraintdef(oid) like '%mesure%' and pg_get_constraintdef(oid) like '%materiau%' from pg_constraint where conname = 'tools_releves_elements_plan_type'),
  'S2. cotes (mesure) et revêtements (matériau) appartiennent à un plan');
select ok(has_table_privilege('authenticated', 'public.tools_releves_metre_ajustements', 'SELECT')
          and not has_table_privilege('authenticated', 'public.tools_releves_metre_ajustements', 'INSERT')
          and not has_table_privilege('authenticated', 'public.tools_releves_metre_ajustements', 'UPDATE')
          and not has_table_privilege('anon', 'public.tools_releves_metre_ajustements', 'SELECT'),
  'S3. ajustements : lecture seule pour les utilisateurs, écriture par RPC');
select ok(not has_function_privilege('authenticated', 'public.tools_releve_plan_metre_calcul(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_plan_metre(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_plan_metre(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_metre_ajuster(uuid, uuid, uuid, text, numeric, text)', 'EXECUTE'),
  'S4. calcul interne non exposé ; lecture pour authentifiés ; rien pour anonyme');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('tools_releve_plan_metre','tools_releve_metre_synthese','tools_releve_metre_ajuster',
  'tools_releve_metre_ajustement_retirer','tools_releve_plan_revetement_enregistrer','tools_releve_plan_revetement_supprimer','tools_releve_plan_metre_regler')),
  'S5. RPC SECURITY DEFINER (contrôle explicite des droits)');
select ok(public.tools_releve_element_donnees_valides('materiau', '{"libelle":"Résine","categorie":"sol","unite":"m2","revetement":"resine"}')
          and public.tools_releve_element_donnees_valides('materiau', '{"libelle":"Plâtre","categorie":"mur","unite":"m2","revetement":"enduit"}')
          and not public.tools_releve_element_donnees_valides('materiau', '{"libelle":"X","categorie":"sol","unite":"m2","revetement":"marbre"}'),
  'S6. contrat générique : familles Lot 8 admises, inconnue refusée, Recovery V2 toujours valide');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur (tenant A), un étage, pièce 4 × 3 m à l'axe, murs de 20 cm → intérieur 3,80 × 2,80 m.
-- Porte 90 × 210 (sud), fenêtre 120 × 100 allège 100 (nord), petite fenêtre 40 × 40 allège 120 (est).
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('d8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 8', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'd8000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('d8200000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('d8300000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'd8200000-0000-0000-0000-000000000001', 'RDC', 0),
  ('d8300000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000001', 'd8200000-0000-0000-0000-000000000001', 'R+1', 1);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage) values
  ('d8500000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'd8300000-0000-0000-0000-000000000001', 'Séjour', 'sejour'),
  ('d8500000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000001', 'd8300000-0000-0000-0000-000000000002', 'Chambre', 'chambre');
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('d8300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role, anon;
select pg_temp.save((select id::text from _p), jsonb_build_object(
  'murs', jsonb_build_array(
    pg_temp.mur('d8600000-0000-0000-0000-000000000001', 0, 0, 4000, 0), pg_temp.mur('d8600000-0000-0000-0000-000000000002', 4000, 0, 4000, 3000),
    pg_temp.mur('d8600000-0000-0000-0000-000000000003', 4000, 3000, 0, 3000), pg_temp.mur('d8600000-0000-0000-0000-000000000004', 0, 3000, 0, 0)),
  'ouvertures', jsonb_build_array(
    pg_temp.ouv('d8700000-0000-0000-0000-000000000001', 'd8600000-0000-0000-0000-000000000001', 'porte', 1000, 900, 2100, 0),
    pg_temp.ouv('d8700000-0000-0000-0000-000000000002', 'd8600000-0000-0000-0000-000000000003', 'fenetre', 1500, 1200, 1000, 1000),
    pg_temp.ouv('d8700000-0000-0000-0000-000000000003', 'd8600000-0000-0000-0000-000000000002', 'fenetre', 1000, 400, 400, 1200)),
  -- surfaceMm2 envoyée par le client : ignorée (le serveur recalcule).
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'd8500000-0000-0000-0000-000000000001',
    'points', '[{"x":100,"y":100},{"x":3900,"y":100},{"x":3900,"y":2900},{"x":100,"y":2900}]'::jsonb,
    'murIds', '["d8600000-0000-0000-0000-000000000001","d8600000-0000-0000-0000-000000000002","d8600000-0000-0000-0000-000000000003","d8600000-0000-0000-0000-000000000004"]'::jsonb,
    'graine', '{"x":2000,"y":1500}'::jsonb, 'surfaceMm2', 1))));

-- ─────────────────────────────────────────────────────────────
-- C. Cotes (éléments `mesure` du plan)
-- ─────────────────────────────────────────────────────────────
select is((pg_temp.save((select id::text from _p), jsonb_build_object('cotes', jsonb_build_array(
    pg_temp.cote('d8800000-0000-0000-0000-000000000001', '{}'),
    pg_temp.cote('d8800000-0000-0000-0000-000000000002', '{"source":"laser","valeur":3795,"typeCote":"interieure"}'),
    pg_temp.cote('d8800000-0000-0000-0000-000000000003', '{"typeCote":"hauteur","typeMesure":"hauteur","source":"manuel","valeur":2480,"b":null,"decalageMm":null}', 'd8500000-0000-0000-0000-000000000001'))))->>'cotes')::int, 3,
  'C1. cote libre calculée, cote intérieure relevée au laser, hauteur ponctuelle');
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _p) and type = 'mesure' and deleted_at is null), 3, 'C2. cotes rattachées au plan');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('cotes', jsonb_build_array(pg_temp.cote('d8800000-0000-0000-0000-000000000009', '{"valeur":3700}')))) $$, (select id from _p)),
  '22023', 'Valeur de cote invalide.', 'C3. cote « calculée » dont la valeur n''est pas la longueur : refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('cotes', jsonb_build_array(pg_temp.cote('d8800000-0000-0000-0000-000000000009', '{"typeCote":"oblique"}')))) $$, (select id from _p)),
  '22023', 'Type de cote inconnu.', 'C4. type de cote inconnu refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('cotes', jsonb_build_array(pg_temp.cote('d8800000-0000-0000-0000-000000000009', '{"b":{"x":100,"y":100}}')))) $$, (select id from _p)),
  '22023', 'Cote invalide : deux points distincts du repère sont attendus.', 'C5. cote de longueur nulle refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('cotes', jsonb_build_array(pg_temp.cote('d8800000-0000-0000-0000-000000000009', '{"etatProjet":"demoli"}')))) $$, (select id from _p)),
  '22023', 'État projeté inconnu.', 'C6. état projeté inconnu refusé');
select throws_ok($$ update public.tools_releves_elements set donnees = donnees || '{"typeCote":"x"}' where id = 'd8800000-0000-0000-0000-000000000001' $$,
  '22023', 'Type de cote inconnu.', 'C7. écriture directe contrôlée (garde de ligne)');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d8600000-0000-0000-0000-000000000001', 0, 0, 4000, 0)
    || jsonb_build_object('donnees', (pg_temp.mur('d8600000-0000-0000-0000-000000000001', 0, 0, 4000, 0)->'donnees') || '{"etatProjet":"casse"}'))))  $$, (select id from _p)),
  '22023', 'État projeté inconnu.', 'C8. état projeté d''un mur contrôlé');
select lives_ok(format($$ select pg_temp.save(%L, '{"supprimes":["d8800000-0000-0000-0000-000000000001"]}'::jsonb) $$, (select id from _p)),
  'C9. cote supprimée (suppression douce générique)');

-- ─────────────────────────────────────────────────────────────
-- M. Métré serveur
-- ─────────────────────────────────────────────────────────────
select is((select (value->>'surfaceMm2')::numeric from jsonb_array_elements((select contours from public.tools_releves_plans where id = (select id from _p)))), 10640000.0,
  'M0. surface du contour recalculée par le serveur (valeur client 1 ignorée)');
select is(pg_temp.room((select id::text from _p))->>'surfaceSolBruteMm2', '10640000', 'M1. surface brute = 3,80 × 2,80 = 10,64 m²');
select is(pg_temp.room((select id::text from _p))->>'surfaceSolNetteMm2', '10640000', 'M2. surface nette sol = brute (aucune déduction de sol, D3)');
select is(pg_temp.room((select id::text from _p))->>'surfacePlafondMm2', '10640000', 'M3. plafond = sol (plafond horizontal)');
select is(pg_temp.room((select id::text from _p))->>'perimetreBrutMm', '13200.0', 'M4. périmètre brut = 13,20 m');
select is(pg_temp.room((select id::text from _p))->>'perimetreUtileMm', '12300.0', 'M5. périmètre utile = brut − porte (0,90 m)');
select is((select string_agg(coalesce(f->>'murId', '-'), ',' order by (f->>'index')::int) from jsonb_array_elements(pg_temp.room((select id::text from _p))->'faces') f),
  'd8600000-0000-0000-0000-000000000001,d8600000-0000-0000-0000-000000000002,d8600000-0000-0000-0000-000000000003,d8600000-0000-0000-0000-000000000004',
  'M6. chaque arête du contour est rattachée à son mur (géométrie serveur)');
select ok(pg_temp.room((select id::text from _p))->'hauteurMm' = 'null'::jsonb and pg_temp.room((select id::text from _p))->'volumeMm3' = 'null'::jsonb
          and pg_temp.room((select id::text from _p))->'surfaceMursBruteMm2' = 'null'::jsonb and pg_temp.room((select id::text from _p))->>'deductionsMm2' = '3250000',
  'M7. hauteur inconnue : volume et surfaces murales NON calculables (jamais de hauteur inventée) ; déductions connues');
update public.tools_releves_etages set hauteur_sous_plafond_mm = 2600 where id = 'd8300000-0000-0000-0000-000000000001';
select is((pg_temp.room((select id::text from _p))->>'hauteurMm')::numeric::text || '|' || (pg_temp.room((select id::text from _p))->>'hauteurSource'), '2600.0|etage',
  'M8. hauteur de l''étage saisie : utilisée, source affichée');
update public.tools_releves_pieces set hauteur_sous_plafond_mm = 2500 where id = 'd8500000-0000-0000-0000-000000000001';
select is((pg_temp.room((select id::text from _p))->>'hauteurMm')::numeric::text || '|' || (pg_temp.room((select id::text from _p))->>'hauteurSource'), '2500.0|piece',
  'M9. hauteur de la pièce prioritaire');
select is(pg_temp.room((select id::text from _p))->>'volumeMm3', '26600000000', 'M10. volume = 10,64 × 2,50 = 26,60 m³');
select is(pg_temp.room((select id::text from _p))->>'surfaceMursBruteMm2' || '|' || (pg_temp.room((select id::text from _p))->>'deductionsMm2') || '|' || (pg_temp.room((select id::text from _p))->>'surfaceMursNetteMm2'),
  '33000000|3250000|29750000', 'M11. murs : brute 33,00 m² − déductions 3,25 m² (porte 1,89 + fenêtre 1,20 + petite 0,16) = 29,75 m²');
select is((select string_agg((o->>'typeOuverture') || ':' || (o->>'surfaceMm2') || ':' || (o->>'franchissable'), ',' order by o->>'id') from jsonb_array_elements(pg_temp.room((select id::text from _p))->'ouvertures') o),
  'porte:1890000:true,fenetre:1200000:false,fenetre:160000:false', 'M12. ouvertures de la pièce : largeur × hauteur, franchissables');
select is((select (f->>'surfaceNetteMm2')::numeric from jsonb_array_elements(pg_temp.room((select id::text from _p))->'faces') f where (f->>'index')::int = 0), 7610000::numeric,
  'M13. face sud : 3,80 × 2,50 − porte = 7,61 m²');
select is(pg_temp.room((select id::text from _p))->'hauteursPonctuelles'->0->>'valeurMm', '2480', 'M14. hauteur ponctuelle rattachée à la pièce');
select lives_ok(format($$ select public.tools_releve_plan_metre_regler(%L, pg_temp.rev(%L), 200000) $$, (select id from _p), (select id from _p)),
  'M15. option « petites ouvertures » : seuil choisi par l''utilisateur (0,20 m²)');
select is(pg_temp.room((select id::text from _p))->>'surfaceMursNetteMm2', '29910000', 'M16. petite fenêtre (0,16 m²) non déduite : 29,91 m²');
select public.tools_releve_plan_metre_regler((select id from _p), pg_temp.rev((select id::text from _p)), null);

-- ─────────────────────────────────────────────────────────────
-- R. Revêtements
-- ─────────────────────────────────────────────────────────────
select lives_ok(format($$ select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000001', '{"libelle":"Carrelage 60×60","format":"60x60","sensPose":"droit"}');
  select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000002', '{"libelle":"Peinture murs","categorie":"mur","revetement":"peinture","pertePourcent":5}');
  select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000003', '{"libelle":"Peinture plafond","categorie":"plafond","revetement":"peinture","pertePourcent":0}');
  select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000004', '{"libelle":"Plinthes","categorie":"plinthe","unite":"ml","revetement":"plinthe","pertePourcent":0}');
  select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000005', '{"libelle":"Corniche","categorie":"plinthe","unite":"ml","revetement":"corniche","pertePourcent":0}');
  select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000006', '{"libelle":"Papier peint sud","categorie":"mur","revetement":"papier_peint","pertePourcent":0,"application":{"mode":"murs","murIds":["d8600000-0000-0000-0000-000000000001"]}}');
  select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000007', '{"libelle":"Faïence","categorie":"mur","revetement":"faience","pertePourcent":12.5,"application":{"mode":"zone","murId":"d8600000-0000-0000-0000-000000000002","debutMm":500,"finMm":2500,"basMm":0,"hautMm":1500}}') $$,
  (select id from _p), (select id from _p), (select id from _p), (select id from _p), (select id from _p), (select id from _p), (select id from _p)),
  'R1. revêtements de sol, murs (tous, choisis, zone), plafond, plinthe, corniche');
select is(pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000001')->>'quantite' || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000001')->>'quantiteAvecPerte'),
  '10640000|11704000', 'R2. sol : 10,64 m², perte 10 % → 11,704 m²');
select is(pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000002')->>'quantite' || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000002')->>'quantiteAvecPerte'),
  '29750000|31237500', 'R3. peinture murs : 29,75 m² nets, perte 5 %');
select is((pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000003')->>'quantite') || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000004')->>'quantite')
          || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000005')->>'quantite'),
  '10640000|12300.0|13200.0', 'R4. plafond 10,64 m² ; plinthe = périmètre utile ; corniche = périmètre brut');
select is((pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000006')->>'quantite') || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000007')->>'quantite')
          || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000007')->>'quantiteAvecPerte'),
  '7610000|2880000|3240000', 'R5. murs choisis (sud) 7,61 m² ; zone 2,00 × 1,50 − fenêtre 0,40 × 0,30 = 2,88 m², perte 12,5 %');
select throws_ok(format($$ select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000009', '{"categorie":"plafond","revetement":"parquet"}') $$, (select id from _p)),
  '22023', 'Famille de revêtement inconnue pour ce support.', 'R6. famille incompatible avec le support refusée');
select throws_ok(format($$ select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000009', '{"pertePourcent":150}') $$, (select id from _p)),
  '22023', 'Perte entre 0 et 100 % (deux décimales au plus).', 'R7. perte hors bornes refusée');
select throws_ok(format($$ select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000009', '{"categorie":"plinthe","revetement":"plinthe","unite":"m2"}') $$, (select id from _p)),
  '22023', 'Unité incohérente : m² pour une surface, ml pour un linéaire.', 'R8. unité incohérente refusée');
select throws_ok(format($$ select public.tools_releve_plan_revetement_enregistrer(%L, 'd8900000-0000-0000-0000-000000000009', 'd8500000-0000-0000-0000-000000000002',
    '{"libelle":"X","categorie":"sol","unite":"m2","pertePourcent":0,"revetement":"parquet"}') $$, (select id from _p)),
  '42501', null, 'R9. pièce d''un autre étage refusée');
select throws_ok(format($$ select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000009', '{"categorie":"mur","revetement":"peinture","application":{"mode":"murs","murIds":["d8600000-0000-0000-0000-0000000000ff"]}}') $$, (select id from _p)),
  '22023', 'Le revêtement vise un mur absent du plan.', 'R10. mur absent du plan refusé');

-- ─────────────────────────────────────────────────────────────
-- A. Ajustements (valeur calculée ≠ valeur retenue, audités)
-- ─────────────────────────────────────────────────────────────
create temporary table _a on commit drop as
  select * from public.tools_releve_metre_ajuster((select id from _p), 'd8500000-0000-0000-0000-000000000001', null, 'surface_sol', 10500000, 'Déduction d''un poteau 0,38 × 0,37');
grant select on _a to authenticated, service_role;
select is((select valeur_calculee::text || '|' || valeur_retenue::text || '|' || unite || '|' || created_by::text from _a),
  '10640000|10500000|mm2|10000000-0000-0000-0000-000000000003', 'A1. valeur calculée PAR LE SERVEUR, valeur retenue, auteur');
select is(pg_temp.room((select id::text from _p))->>'surfaceSolNetteMm2' || '|' || (pg_temp.room((select id::text from _p))->'retenu'->>'surface_sol'),
  '10640000|10500000', 'A2. la valeur calculée n''est pas écrasée ; la valeur retenue est exposée à côté');
select is(pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000001')->>'quantite' || '|' || (pg_temp.rv((select id::text from _p), 'd8900000-0000-0000-0000-000000000001')->>'quantiteAvecPerte'),
  '10500000|11550000', 'A3. le revêtement de sol suit la valeur retenue');
select throws_ok(format($$ select public.tools_releve_metre_ajuster(%L, 'd8500000-0000-0000-0000-000000000001', null, 'surface_sol', 1, ' ') $$, (select id from _p)),
  '22023', 'La raison de l''ajustement est obligatoire.', 'A4. raison obligatoire');
select lives_ok(format($$ select public.tools_releve_metre_ajuster(%L, 'd8500000-0000-0000-0000-000000000001', null, 'surface_sol', 10400000, 'Second poteau');
  select public.tools_releve_metre_ajuster(%L, null, 'd8900000-0000-0000-0000-000000000002', 'quantite', 30000000, 'Arrondi commande') $$, (select id from _p), (select id from _p)),
  'A5. nouvel ajustement (le précédent est retiré, pas écrasé) ; ajustement d''une quantité de revêtement');
select is((select count(*)::text || '|' || count(*) filter (where retire_le is not null)::text || '|' || string_agg(raison_retrait, '') from public.tools_releves_metre_ajustements
           where plan_id = (select id from _p) and grandeur = 'surface_sol'), '2|1|Remplacé par un nouvel ajustement', 'A6. historique conservé : 2 ajustements, 1 retiré (tracé)');
select throws_ok($$ update public.tools_releves_metre_ajustements set valeur_retenue = 1 $$, '42501', null, 'A7. aucune écriture directe');
select is((select count(*)::int from public.tools_releves_journal where releve_id = 'd8000000-0000-0000-0000-000000000001' and action = 'ajustement'), 3,
  'A8. journal : chaque ajustement tracé');

-- ─────────────────────────────────────────────────────────────
-- V. Versioning & projeté
-- ─────────────────────────────────────────────────────────────
create temporary table _f on commit drop as select * from public.tools_releve_plan_figer((select id from _p), pg_temp.rev((select id::text from _p)), 'Existant');
select ok((select metre is not null and metre->'pieces'->0->>'surfaceMursNetteMm2' = '29750000' from public.tools_releves_plans where id = (select id from _p)),
  'V1. gel : métré figé avec le plan');
update public.tools_releves_pieces set hauteur_sous_plafond_mm = 3000 where id = 'd8500000-0000-0000-0000-000000000001';
select is(pg_temp.room((select id::text from _p))->>'volumeMm3' || '|' || (pg_temp.m((select id::text from _p))->>'source'), '26600000000|gel',
  'V2. hauteur de la pièce modifiée APRÈS le gel : métré figé inchangé');
select throws_ok(format($$ select public.tools_releve_metre_ajuster(%L, 'd8500000-0000-0000-0000-000000000001', null, 'volume', 1, 'Après gel') $$, (select id from _p)),
  '42501', null, 'V3. plan figé : aucun ajustement');
select throws_ok(format($$ select pg_temp.revet(%L, 'd8900000-0000-0000-0000-000000000001', '{}') $$, (select id from _p)),
  '42501', null, 'V4. plan figé : revêtement non modifiable');
reset role;
select throws_ok(format($$ update public.tools_releves_plans set metre = '{}'::jsonb where id = %L $$, (select id from _p)),
  '42501', null, 'V5. métré figé immuable (même pour le propriétaire des tables)');
select ok((select public.tools_releve_plan_contenu(id) ? 'cotes' and public.tools_releve_plan_contenu(id) ? 'revetements'
           and empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(id)::text, 'UTF8'), 'sha256'), 'hex')
           from public.tools_releves_plans where id = (select id from _p)),
  'V6. cotes et revêtements dans l''empreinte (recalculable)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('d8300000-0000-0000-0000-000000000001', 'projete');
grant select on _c to authenticated, service_role, anon;
select is((select count(*) filter (where type = 'mesure')::text || '|' || count(*) filter (where type = 'materiau')::text || '|' || coalesce(max(metre_null), '')
           from public.tools_releves_elements, (select (metre is null)::text as metre_null from public.tools_releves_plans where id = (select id from _c)) m
           where plan_id = (select id from _c)), '2|7|true',
  'V7. plan dérivé : cotes et revêtements copiés ; métré non figé');
select is((select (m.donnees->>'origineId') from public.tools_releves_elements r
           join public.tools_releves_elements m on m.id::text = r.donnees->'application'->'murIds'->>0
           where r.plan_id = (select id from _c) and r.donnees->>'libelle' = 'Papier peint sud'), 'd8600000-0000-0000-0000-000000000001',
  'V8. revêtement « murs choisis » reporté sur la copie du mur');
select is(pg_temp.room((select id::text from _c))->>'volumeMm3' || '|' || (pg_temp.room((select id::text from _c))->>'surfaceSolNetteMm2') || '|'
          || jsonb_array_length(pg_temp.room((select id::text from _c))->'ajustements')::text,
  '31920000000|10640000|0', 'V9. dérivé : recalcul indépendant (hauteur 3,00 m actuelle, ajustements non copiés)');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('murs', (
    select jsonb_agg(jsonb_build_object('id', x.id, 'pieceId', x.piece_id, 'donnees', x.donnees || '{"etatProjet":"a_deposer"}'))
    from public.tools_releves_elements x where x.plan_id = %L and x.type = 'mur' and x.donnees->>'origineId' = 'd8600000-0000-0000-0000-000000000002'))) $$, (select id from _c), (select id from _c)),
  'V10. plan projeté : mur à déposer');
select is(pg_temp.m((select id::text from _c))->'travaux'->'murs'->'a_deposer', '{"nombre": 1, "longueurMm": 3000.0, "sansHauteur": 0, "surfaceMm2": 7500000}'::jsonb,
  'V11. travaux : dépose 3,00 ml / 7,50 m² ; existant distingué');

-- ─────────────────────────────────────────────────────────────
-- T. Isolation
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select ok(pg_temp.room((select id::text from _c)) is not null and jsonb_array_length(public.tools_releve_metre_synthese('d8000000-0000-0000-0000-000000000001', 'projete')) = 1,
  'T1. consultation : métré et synthèse lisibles');
select throws_ok(format($$ select public.tools_releve_metre_ajuster(%L, 'd8500000-0000-0000-0000-000000000001', null, 'volume', 1, 'Consultation') $$, (select id from _c)),
  '42501', null, 'T2. consultation : aucun ajustement');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok(format($$ select public.tools_releve_plan_metre(%L) $$, (select id from _c)), '42501', null, 'T3. autre tenant : métré refusé');
select throws_ok($$ select public.tools_releve_metre_synthese('d8000000-0000-0000-0000-000000000001', 'existant') $$, '42501', null, 'T4. autre tenant : synthèse refusée');
select is((select count(*)::int from public.tools_releves_metre_ajustements where releve_id = 'd8000000-0000-0000-0000-000000000001'), 0,
  'T5. autre tenant : aucun ajustement visible');
reset role;
set local role anon;
select throws_ok(format($$ select public.tools_releve_plan_metre(%L) $$, (select id from _c)), '42501', null, 'T6. anonyme : aucune lecture');
reset role;

select * from finish();
rollback;
