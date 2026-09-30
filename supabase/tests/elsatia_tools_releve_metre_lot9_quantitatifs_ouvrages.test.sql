-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 9 — QUANTITATIFS, OUVRAGES & TAKEOFF (migration 20260929001301)
--
-- Qualifie sous RLS réelle, avec des VALEURS EXACTES :
--   S1–S8   schéma et droits : tables en lecture seule, RPC SECURITY DEFINER, calcul interne non exposé,
--           anonyme, aucune colonne de prix, quantitatif figé ;
--   F1–F12  contrat d'un ouvrage : catalogue valide, unité incohérente, formule invalide (opération inconnue,
--           entraxe nul, trop d'opérations), prix refusé, clé inconnue, kg sans valeur, forfait, filtre, arrondi ;
--   E1–E4   moteur : arrondi moitié loin de zéro exact, chaîne d'opérations, P1 PARITÉ avec le miroir TypeScript
--           (jeu déterministe packages/releve-domain/src/quantitatif-parite.fixture.json) ;
--   Q1–Q18  takeoff sur un vrai plan : peinture, plinthes, stratifié (arrondi 0,01), portes, carrelage + perte,
--           faïence, panneaux décoratifs, murs, montants selon entraxe (par mur), plaques BA13, barrière
--           phonique, ragréage (kg), volume, forfait, origine auto / manuelle, audit ;
--   D1–D6   existant / dépose / neuf / déplacé sur un plan projeté (lignes séparées par état) ;
--   A1–A9   ajustements : quantité calculée par le serveur, retenue, raison, remplacement tracé, retrait,
--           journal, aucune écriture directe, ajustement périmé → anomalie « métré obsolète » ;
--   X1–X4   anomalies : pièce sans contour, pièce supprimée, quantité négative, ajustement orphelin ;
--   V1–V8   versioning : gel (quantitatif figé, immuable, insensible aux modifications), dérivé (ouvrages
--           copiés avec lignée, ajustements non copiés, recalcul indépendant) ;
--   B1–B7   bibliothèque : enregistrement, lecture, prix refusé, pièces refusées, code unique, droits ;
--   T1–T7   isolation : consultation, autre tenant, anonyme.
begin;
create extension if not exists pgtap with schema extensions;
select plan(84);

\ir fixtures/isolation_multitenant.inc
\set parite `cat ../../packages/releve-domain/src/quantitatif-parite.fixture.json`

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
create function pg_temp.rev(p text) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p::uuid $$;
grant execute on function pg_temp.rev(text) to authenticated, service_role;
create function pg_temp.save(p text, mods jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_enregistrer(p::uuid, pg_temp.rev(p), mods) $$;
grant execute on function pg_temp.save(text, jsonb) to authenticated, service_role;
create function pg_temp.revet(p text, id text, extra jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_revetement_enregistrer(p::uuid, id::uuid, 'd9500000-0000-0000-0000-000000000001',
    jsonb_build_object('libelle', 'Revêtement', 'categorie', 'sol', 'unite', 'm2', 'pertePourcent', 0, 'gpPrestationRef', null, 'revetement', 'carrelage') || extra) $$;
grant execute on function pg_temp.revet(text, text, jsonb) to authenticated, service_role;
-- Ouvrage minimal (surchargé par `extra`).
create function pg_temp.o(extra jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('nom', 'Ouvrage', 'categorie', 'peinture', 'unite', 'm2', 'regle', jsonb_build_object('source', 'surface_sol'),
    'pertePourcent', 0, 'arrondi', jsonb_build_object('mode', 'aucun'), 'etatTravaux', 'nouveau', 'etats', jsonb_build_array('existant','nouveau')) || extra $$;
grant execute on function pg_temp.o(jsonb) to authenticated, service_role;
create function pg_temp.enr(p text, id text, extra jsonb) returns jsonb language sql as $$
  select public.tools_releve_ouvrage_enregistrer(p::uuid, id::uuid, pg_temp.o(extra)) $$;
grant execute on function pg_temp.enr(text, text, jsonb) to authenticated, service_role;
create function pg_temp.q(p text) returns jsonb language sql as $$ select public.tools_releve_plan_quantitatif(p::uuid) $$;
grant execute on function pg_temp.q(text) to authenticated, service_role;
-- Quantités d'un ouvrage : « pièce|état=retenue » triées (étage = « etage »).
create function pg_temp.ql(p text, ouvrage text) returns text language sql as $$
  select string_agg(coalesce(case when l->>'pieceId' = 'd9500000-0000-0000-0000-000000000001' then 'sejour' else l->>'pieceId' end, 'etage')
         || '|' || (l->>'etatProjet') || '=' || coalesce((l->>'quantiteRetenue')::numeric::text, 'null'), ',' order by l->>'pieceId', l->>'etatProjet')
  from jsonb_array_elements(pg_temp.q(p)->'lignes') l where l->>'ouvrageId' = ouvrage $$;
grant execute on function pg_temp.ql(text, text) to authenticated, service_role;
create function pg_temp.an(p text, code text) returns int language sql as $$
  select count(*)::int from jsonb_array_elements(pg_temp.q(p)->'anomalies') a where a->>'code' = code $$;
grant execute on function pg_temp.an(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select ok(to_regclass('public.tools_releves_ouvrages') is not null and to_regclass('public.tools_releves_ouvrages_bibliotheque') is not null
          and to_regclass('public.tools_releves_quantitatif_ajustements') is not null, 'S1. tables ouvrages, bibliothèque, ajustements de quantité');
select ok(has_table_privilege('authenticated', 'public.tools_releves_ouvrages', 'SELECT')
          and not has_table_privilege('authenticated', 'public.tools_releves_ouvrages', 'INSERT')
          and not has_table_privilege('authenticated', 'public.tools_releves_ouvrages_bibliotheque', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.tools_releves_quantitatif_ajustements', 'INSERT')
          and not has_table_privilege('anon', 'public.tools_releves_ouvrages', 'SELECT'),
  'S2. lecture seule pour les utilisateurs, écriture par RPC, rien pour anonyme');
select ok(not has_function_privilege('authenticated', 'public.tools_releve_plan_quantitatif_calcul(uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.tools_releve_quantitatif_entree(uuid, jsonb)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_plan_quantitatif(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_quantitatif_evaluer(jsonb)', 'EXECUTE'),
  'S3. calcul interne (lecture des tables) non exposé ; moteur pur et lecture contrôlée exposés');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('tools_releve_plan_quantitatif','tools_releve_quantitatif_synthese','tools_releve_ouvrage_enregistrer',
  'tools_releve_ouvrages_importer','tools_releve_ouvrage_supprimer','tools_releve_quantitatif_ajuster','tools_releve_quantitatif_ajustement_retirer',
  'tools_releve_bibliotheque','tools_releve_bibliotheque_enregistrer','tools_releve_bibliotheque_supprimer')),
  'S4. RPC SECURITY DEFINER (contrôle explicite des droits)');
select ok(not has_function_privilege('anon', 'public.tools_releve_plan_quantitatif(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_ouvrage_enregistrer(uuid, uuid, jsonb, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_quantitatif_evaluer(jsonb)', 'EXECUTE'), 'S5. anonyme : aucune RPC');
select is((select count(*)::int from information_schema.columns where table_schema = 'public'
           and table_name in ('tools_releves_ouvrages','tools_releves_ouvrages_bibliotheque','tools_releves_quantitatif_ajustements')
           and column_name ~* '(prix|price|tarif|montant|cout)'), 0, 'S6. aucune colonne de prix dans Tools');
select has_column('public', 'tools_releves_plans', 'quantitatif', 'S7. quantitatif figé porté par le plan');
select ok((select provolatile = 'i' from pg_proc where proname = 'tools_releve_quantitatif_evaluer'), 'S8. moteur déclaré IMMUTABLE (fonction pure)');

-- ─────────────────────────────────────────────────────────────
-- F. Contrat d'un ouvrage (formules sûres, unités)
-- ─────────────────────────────────────────────────────────────
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{}')), null, 'F1. ouvrage simple valide');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"ml"}')), 'unite_incoherente', 'F2. m² déclaré ml : unité incohérente (aucune conversion implicite)');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"regle":{"source":"surface_sol","operations":[{"op":"eval","valeur":1}]}}')), 'formule_invalide',
  'F3. opération inconnue : formule invalide (aucun code exécuté)');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"u","regle":{"source":"perimetre_utile","operations":[{"op":"entraxe","valeur":0}]}}')), 'formule_invalide',
  'F4. entraxe nul : division interdite');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"regle":{"source":"surface_sol","operations":[{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1},{"op":"coefficient","valeur":1}]}}')),
  'formule_invalide', 'F5. plus de 8 opérations refusées');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"prixUnitaireHt":12.5}')), 'prix', 'F6. prix refusé dans un ouvrage');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"script":"1+1"}')), 'invalide', 'F7. clé inconnue refusée');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"kg"}')) || '|' ||
          coalesce(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"kg","regle":{"source":"surface_sol","operations":[{"op":"ratio_kg","valeur":4.5}]}}')), 'ok') || '|' ||
          coalesce(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"kg","regle":{"source":"saisie","valeur":120}}')), 'ok'),
  'unite_incoherente|ok|ok', 'F8. kg seulement si une valeur est fournie (ratio ou saisie)');
select is(coalesce(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"forfait","regle":{"source":"forfait"}}')), 'ok') || '|' ||
          public.tools_releve_ouvrage_anomalie(pg_temp.o('{"unite":"forfait","regle":{"source":"forfait","operations":[{"op":"entraxe","valeur":1}]}}')),
  'ok|unite_incoherente', 'F9. forfait : pas d''opération dimensionnelle');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"regle":{"source":"surface_sol","filtre":{"typesOuverture":["porte"]}}}')) || '|' ||
          public.tools_releve_ouvrage_anomalie(pg_temp.o('{"regle":{"source":"quantite_revetement"}}')),
  'filtre|filtre', 'F10. filtre incompatible avec la source ; support de revêtement obligatoire');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"arrondi":{"mode":"superieur"}}')) || '|' ||
          public.tools_releve_ouvrage_anomalie(pg_temp.o('{"arrondi":{"mode":"superieur","pas":0.0000001}}')) || '|' ||
          public.tools_releve_ouvrage_anomalie(pg_temp.o('{"pertePourcent":10.555}')),
  'arrondi|arrondi|perte', 'F11. arrondi sans pas ou trop précis ; perte à deux décimales');
select is(public.tools_releve_ouvrage_message('unite_incoherente'), 'Unité incohérente : la formule ne produit pas l''unité déclarée (aucune conversion implicite).',
  'F12. messages identiques au domaine');

-- ─────────────────────────────────────────────────────────────
-- E. Moteur pur
-- ─────────────────────────────────────────────────────────────
select is(public.tools_releve_qt_rdiv(5, 2)::text || '|' || public.tools_releve_qt_rdiv(-5, 2)::text || '|' || public.tools_releve_qt_rdiv(7, 3)::text || '|' || public.tools_releve_qt_rdiv(-7, 3)::text,
  '3|-3|2|-2', 'E1. division arrondie moitié loin de zéro, exacte');
select is(public.tools_releve_qt_appliquer(4000000, '{"operations":[{"op":"entraxe","valeur":0.6},{"op":"ajouter","valeur":1}]}', 0, '{"mode":"superieur","pas":1}')::text,
  '{7666667,7666667,8000}', 'E2. montants : 4,00 m ÷ 0,60 + 1 = 7,666667 → arrondi supérieur 8');
select is(public.tools_releve_qt_appliquer(10640000, '{}', 7, '{"mode":"superieur","pas":0.01}')::text, '{10640000,11384800,11390}',
  'E3. perte puis arrondi : 10,64 × 1,07 = 11,3848 → 11,39');
select is((select count(*)::int from jsonb_array_elements((:'parite')::jsonb->'cas') c
           where public.tools_releve_quantitatif_evaluer(c->'entree') is distinct from c->'attendu'), 0,
  'P1. parité : le serveur reproduit exactement le jeu déterministe vérifié par le miroir TypeScript');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur (tenant A). Pièce 4 × 3 m à l'axe, murs de 20 cm (h 2,50) → intérieur 3,80 × 2,80.
-- Porte 90 × 210 (sud), fenêtre 120 × 100 allège 100 (nord), petite fenêtre 40 × 40 allège 120 (est).
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('d9000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 9', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'd9000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('d9200000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('d9300000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', 'd9200000-0000-0000-0000-000000000001', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage, hauteur_sous_plafond_mm) values
  ('d9500000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', 'd9300000-0000-0000-0000-000000000001', 'Séjour', 'sejour', 2500),
  ('d9500000-0000-0000-0000-000000000002', 'd9000000-0000-0000-0000-000000000001', 'd9300000-0000-0000-0000-000000000001', 'Cellier', 'autre', null);
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('d9300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role, anon;
select pg_temp.save((select id::text from _p), jsonb_build_object(
  'murs', jsonb_build_array(
    pg_temp.mur('d9600000-0000-0000-0000-000000000001', 0, 0, 4000, 0), pg_temp.mur('d9600000-0000-0000-0000-000000000002', 4000, 0, 4000, 3000),
    pg_temp.mur('d9600000-0000-0000-0000-000000000003', 4000, 3000, 0, 3000), pg_temp.mur('d9600000-0000-0000-0000-000000000004', 0, 3000, 0, 0)),
  'ouvertures', jsonb_build_array(
    pg_temp.ouv('d9700000-0000-0000-0000-000000000001', 'd9600000-0000-0000-0000-000000000001', 'porte', 1000, 900, 2100, 0),
    pg_temp.ouv('d9700000-0000-0000-0000-000000000002', 'd9600000-0000-0000-0000-000000000003', 'fenetre', 1500, 1200, 1000, 1000),
    pg_temp.ouv('d9700000-0000-0000-0000-000000000003', 'd9600000-0000-0000-0000-000000000002', 'fenetre', 1000, 400, 400, 1200)),
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'd9500000-0000-0000-0000-000000000001',
    'points', '[{"x":100,"y":100},{"x":3900,"y":100},{"x":3900,"y":2900},{"x":100,"y":2900}]'::jsonb,
    'murIds', '["d9600000-0000-0000-0000-000000000001","d9600000-0000-0000-0000-000000000002","d9600000-0000-0000-0000-000000000003","d9600000-0000-0000-0000-000000000004"]'::jsonb,
    'graine', '{"x":2000,"y":1500}'::jsonb))));
select pg_temp.revet((select id::text from _p), 'd9900000-0000-0000-0000-000000000001', '{"libelle":"Faïence","categorie":"mur","revetement":"faience","application":{"mode":"zone","murId":"d9600000-0000-0000-0000-000000000002","debutMm":500,"finMm":2500,"basMm":0,"hautMm":1500}}');
select pg_temp.revet((select id::text from _p), 'd9900000-0000-0000-0000-000000000002', '{"libelle":"Panneaux sud","categorie":"mur","revetement":"panneau_decoratif","application":{"mode":"murs","murIds":["d9600000-0000-0000-0000-000000000001"]}}');

-- ─────────────────────────────────────────────────────────────
-- Q. Takeoff sur un vrai plan (valeurs exactes)
-- ─────────────────────────────────────────────────────────────
select is(public.tools_releve_ouvrages_importer((select id from _p), jsonb_build_array(
    jsonb_build_object('id', 'd9b00000-0000-0000-0000-000000000001', 'donnees', pg_temp.o('{"nom":"Peinture murs","code":"PEI-MUR","regle":{"source":"surface_murs"},"pertePourcent":5}')),
    jsonb_build_object('id', 'd9b00000-0000-0000-0000-000000000002', 'donnees', pg_temp.o('{"nom":"Plinthes","categorie":"plinthes","unite":"ml","regle":{"source":"perimetre_utile"},"pertePourcent":5}')),
    jsonb_build_object('id', 'd9b00000-0000-0000-0000-000000000003', 'donnees', pg_temp.o('{"nom":"Stratifié","categorie":"sols","pertePourcent":7,"arrondi":{"mode":"superieur","pas":0.01}}')),
    jsonb_build_object('id', 'd9b00000-0000-0000-0000-000000000004', 'donnees', pg_temp.o('{"nom":"Portes","categorie":"portes","unite":"u","regle":{"source":"nombre_ouvertures","filtre":{"typesOuverture":["porte"]}}}')),
    jsonb_build_object('id', 'd9b00000-0000-0000-0000-000000000005', 'donnees', pg_temp.o('{"nom":"Carrelage","categorie":"carrelage","pertePourcent":10}'))
  )), 5, 'Q1. import en lot (catalogue) : 5 ouvrages');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000001'), 'sejour|nouveau=31.238',
  'Q2. m² de peinture : murs nets 29,75 m² + 5 % = 31,238 m²');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000002'), 'sejour|nouveau=12.915',
  'Q3. ml de plinthes : périmètre utile 12,30 m + 5 % = 12,915 ml');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000003'), 'sejour|nouveau=11.390',
  'Q4. m² de stratifié : 10,64 m² + 7 % = 11,3848 → arrondi 0,01 supérieur = 11,39 m²');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000004'), 'sejour|existant=1.000',
  'Q5. nombre de portes : 1 (existante)');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000005'), 'sejour|nouveau=11.704', 'Q6. carrelage + perte 10 % = 11,704 m²');
select lives_ok(format($$
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-000000000006', '{"nom":"Faïence","categorie":"faience","regle":{"source":"quantite_revetement","filtre":{"support":"mur","familles":["faience"]}},"pertePourcent":10}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-000000000007', '{"nom":"Panneaux décoratifs","categorie":"doublages","unite":"u","regle":{"source":"quantite_revetement","filtre":{"support":"mur","familles":["panneau_decoratif"]},"operations":[{"op":"surface_unitaire","valeur":0.72}]},"pertePourcent":5,"arrondi":{"mode":"superieur","pas":1}}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-000000000008', '{"nom":"Murs","categorie":"cloisons","regle":{"source":"surface_murs_plan"},"etats":["existant","a_deposer","nouveau","deplace"]}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-000000000009', '{"nom":"Montants","categorie":"cloisons","unite":"u","regle":{"source":"longueur_murs","operations":[{"op":"entraxe","valeur":0.6},{"op":"ajouter","valeur":1}]},"arrondi":{"mode":"superieur","pas":1}}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-00000000000a', '{"nom":"Plaques BA13","categorie":"cloisons","unite":"u","regle":{"source":"surface_murs_plan","operations":[{"op":"coefficient","valeur":2},{"op":"surface_unitaire","valeur":3}]},"pertePourcent":10,"arrondi":{"mode":"superieur","pas":1}}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-00000000000b', '{"nom":"Barrière phonique","categorie":"cloisons","regle":{"source":"longueur_murs","operations":[{"op":"hauteur","valeur":0.5}]},"pertePourcent":5}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-00000000000c', '{"nom":"Ragréage","categorie":"sols","unite":"kg","regle":{"source":"surface_sol","operations":[{"op":"ratio_kg","valeur":4.5}]},"arrondi":{"mode":"superieur","pas":25}}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-00000000000d', '{"nom":"Volume traité","categorie":"cvc","unite":"m3","regle":{"source":"volume"}}');
  select pg_temp.enr(%1$L, 'd9b00000-0000-0000-0000-00000000000e', '{"nom":"Nettoyage","categorie":"autre","unite":"forfait","regle":{"source":"forfait"}}') $$, (select id from _p)),
  'Q7. ouvrages enregistrés un par un (RPC)');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000006'), 'sejour|existant=3.168',
  'Q8. faïence : zone 2,88 m² (Lot 8) + 10 % = 3,168 m²');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000007'), 'sejour|existant=12.000',
  'Q9. panneaux décoratifs 0,72 m² : 7,61 ÷ 0,72 × 1,05 = 11,098 → 12 u');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000008'), 'sejour|existant=35.000',
  'Q10. m² de murs (longueur × hauteur du mur) : 14,00 m × 2,50 = 35,00 m²');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-000000000009'), 'sejour|existant=28.000',
  'Q11. montants selon entraxe 0,60 + 1 par mur, arrondis PAR MUR : 8 + 6 + 8 + 6 = 28');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-00000000000a'), 'sejour|existant=28.000',
  'Q12. plaques selon surface (2 faces ÷ 3 m², +10 %, par mur) : 8 + 6 + 8 + 6 = 28');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-00000000000b'), 'sejour|existant=7.350',
  'Q13. barrière phonique : 14,00 ml × 0,50 m = 7,00 m² + 5 % = 7,35 m²');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-00000000000c'), 'sejour|nouveau=50.000',
  'Q14. ragréage : 10,64 m² × 4,5 kg = 47,88 kg → sacs de 25 kg = 50 kg');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-00000000000d'), 'sejour|nouveau=26.600', 'Q15. volume : 26,60 m³');
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-00000000000e'), 'etage|nouveau=1.000', 'Q16. forfait global : 1 (ligne d''étage)');
select is((select string_agg(origine, ',' order by id) from public.tools_releves_ouvrages where plan_id = (select id from _p) and id in
           ('d9b00000-0000-0000-0000-000000000001', 'd9b00000-0000-0000-0000-00000000000e')), 'auto,manuelle',
  'Q17. origine dérivée de la source : automatique / manuelle');
select ok((select bool_and(a->>'createdBy' = '10000000-0000-0000-0000-000000000003' and (a->>'revision')::int = 1) from jsonb_array_elements(pg_temp.q((select id::text from _p))->'audit') a)
          and (select count(*) from public.tools_releves_journal where releve_id = 'd9000000-0000-0000-0000-000000000001' and 'ouvrages' = any(champs)) = 10,
  'Q18. audit : auteur et révision par ouvrage, journal de chaque écriture');

-- ─────────────────────────────────────────────────────────────
-- D. Existant / dépose / neuf (plan projeté dérivé)
-- ─────────────────────────────────────────────────────────────
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('d9300000-0000-0000-0000-000000000001', 'projete');
grant select on _c to authenticated, service_role, anon;
select is((select count(*)::int from public.tools_releves_ouvrages where plan_id = (select id from _c) and origine_ouvrage_id is not null and deleted_at is null), 14,
  'D1. plan dérivé : 14 ouvrages copiés avec leur lignée');
select lives_ok(format($$ select pg_temp.save(%1$L, jsonb_build_object('murs', (
    select jsonb_agg(jsonb_build_object('id', x.id, 'pieceId', x.piece_id, 'donnees', x.donnees || '{"etatProjet":"a_deposer"}'))
    from public.tools_releves_elements x where x.plan_id = %1$L and x.type = 'mur' and x.donnees->>'origineId' = 'd9600000-0000-0000-0000-000000000002')
    || jsonb_build_array(pg_temp.mur('d9600000-0000-0000-0000-0000000000a1', 2000, 100, 2000, 2900)
       || jsonb_build_object('donnees', (pg_temp.mur('x', 2000, 100, 2000, 2900)->'donnees') || '{"etatProjet":"nouveau","typeMur":"cloison"}')))) $$, (select id from _c)),
  'D2. projeté : un mur à déposer, une cloison neuve');
select is(pg_temp.ql((select id::text from _c), (select id::text from public.tools_releves_ouvrages where plan_id = (select id from _c) and origine_ouvrage_id = 'd9b00000-0000-0000-0000-000000000008')),
  'sejour|a_deposer=7.500,sejour|existant=27.500,etage|nouveau=7.000',
  'D3. m² de murs séparés : conservé 27,50 · à déposer 7,50 · à créer 7,00 (cloison hors contour → étage)');
select lives_ok(format($$ select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000c1', '{"nom":"Montants neufs","categorie":"cloisons","unite":"u","regle":{"source":"longueur_murs","operations":[{"op":"entraxe","valeur":0.6},{"op":"ajouter","valeur":1}]},"arrondi":{"mode":"superieur","pas":1},"etats":["nouveau"]}');
  select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000c2', '{"nom":"Démolition","categorie":"demolition","regle":{"source":"surface_murs_plan"},"etatTravaux":"a_deposer","etats":["a_deposer"]}') $$,
  (select id from _c), (select id from _c)), 'D4. ouvrages du projeté : montants neufs, démolition');
select is(pg_temp.ql((select id::text from _c), 'd9b00000-0000-0000-0000-0000000000c1') || ' ; ' || pg_temp.ql((select id::text from _c), 'd9b00000-0000-0000-0000-0000000000c2'),
  'etage|nouveau=6.000 ; sejour|a_deposer=7.500', 'D5. à créer : 2,80 ÷ 0,60 + 1 → 6 montants ; à déposer : 7,50 m²');
select is((select string_agg(a, ',' order by a) from jsonb_array_elements(pg_temp.q((select id::text from _c))->'lignes') l, jsonb_array_elements_text(l->'annotations') a
           where l->>'ouvrageId' = 'd9b00000-0000-0000-0000-0000000000c1'), 'hors_piece', 'D6. élément hors contour annoté (jamais attribué à tort)');

-- ─────────────────────────────────────────────────────────────
-- A. Ajustements (quantité calculée jamais écrasée)
-- ─────────────────────────────────────────────────────────────
create temporary table _a on commit drop as select * from public.tools_releve_quantitatif_ajuster((select id from _c), 'd9b00000-0000-0000-0000-0000000000c1', null, 'nouveau', 8, 'Renforts de porte');
grant select on _a to authenticated, service_role;
select is((select valeur_calculee::text || '|' || valeur_retenue::text || '|' || created_by::text from _a), '6.000|8|10000000-0000-0000-0000-000000000003',
  'A1. quantité calculée PAR LE SERVEUR, quantité retenue, auteur');
select is((select (l->>'quantiteCalculee') || '|' || (l->>'quantiteRetenue') || '|' || (l->'ajustement'->>'raison') from jsonb_array_elements(pg_temp.q((select id::text from _c))->'lignes') l
           where l->>'ouvrageId' = 'd9b00000-0000-0000-0000-0000000000c1'), '6.000|8|Renforts de porte', 'A2. la quantité calculée reste visible à côté de la retenue');
select throws_ok(format($$ select public.tools_releve_quantitatif_ajuster(%L, 'd9b00000-0000-0000-0000-0000000000c1', null, 'nouveau', 9, ' ') $$, (select id from _c)),
  '22023', 'La raison de l''ajustement est obligatoire.', 'A3. raison obligatoire');
select throws_ok(format($$ select public.tools_releve_quantitatif_ajuster(%L, 'd9b00000-0000-0000-0000-0000000000c1', null, 'nouveau', 9.0001, 'Trop précis') $$, (select id from _c)),
  '22023', null, 'A4. quantité retenue à trois décimales au plus');
select throws_ok(format($$ select public.tools_releve_quantitatif_ajuster(%L, 'd9b00000-0000-0000-0000-0000000000c1', null, 'existant', 9, 'Ligne absente') $$, (select id from _c)),
  '42501', 'Ligne de quantitatif absente du plan', 'A5. ajustement d''une ligne inexistante refusé');
select lives_ok(format($$ select public.tools_releve_quantitatif_ajuster(%L, 'd9b00000-0000-0000-0000-0000000000c1', null, 'nouveau', 9, 'Renforts + chevêtre') $$, (select id from _c)),
  'A6. nouvel ajustement : le précédent est retiré (tracé), jamais écrasé');
select is((select count(*)::text || '|' || count(*) filter (where retire_le is not null)::text from public.tools_releves_quantitatif_ajustements
           where ouvrage_id = 'd9b00000-0000-0000-0000-0000000000c1'), '2|1', 'A7. historique conservé');
select throws_ok($$ update public.tools_releves_quantitatif_ajustements set valeur_retenue = 1 $$, '42501', null, 'A8. aucune écriture directe');
-- La cloison neuve s'allonge (2,80 → 3,30 m, montants 7) : l'ajustement devient périmé.
select pg_temp.save((select id::text from _c), jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d9600000-0000-0000-0000-0000000000a1', 2000, 0, 2000, 3300)
  || jsonb_build_object('donnees', (pg_temp.mur('x', 2000, 0, 2000, 3300)->'donnees') || '{"etatProjet":"nouveau","typeMur":"cloison"}'))));
select is((select (l->>'quantiteCalculee') || '|' || (l->>'quantiteRetenue') || '|' || (l->'ajustement'->>'perime') from jsonb_array_elements(pg_temp.q((select id::text from _c))->'lignes') l
           where l->>'ouvrageId' = 'd9b00000-0000-0000-0000-0000000000c1') || '|' || pg_temp.an((select id::text from _c), 'metre_obsolete')::text,
  '7.000|9|true|1', 'A9. calcul changé : ajustement périmé signalé (métré obsolète), jamais remplacé en silence');

-- ─────────────────────────────────────────────────────────────
-- X. Anomalies (futur module Erreurs)
-- ─────────────────────────────────────────────────────────────
select lives_ok(format($$ select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000d1', '{"nom":"Cellier","pieceIds":["d9500000-0000-0000-0000-000000000002"]}');
  select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000d2', '{"nom":"Négatif","unite":"u","regle":{"source":"saisie","valeur":1,"operations":[{"op":"ajouter","valeur":-5}]}}') $$,
  (select id from _c), (select id from _c)), 'X1. ouvrage visant une pièce sans contour ; ouvrage à quantité négative');
select is((select string_agg(a->>'detail', ',' order by a->>'detail') from jsonb_array_elements(pg_temp.q((select id::text from _c))->'anomalies') a
           where a->>'ouvrageId' = 'd9b00000-0000-0000-0000-0000000000d1') || '|' || pg_temp.an((select id::text from _c), 'quantite_negative')::text,
  'aucune_donnee,piece_sans_contour|1', 'X2. source absente (pièce sans contour, aucune donnée) et quantité négative détectées');
update public.tools_releves_pieces set deleted_at = now() where id = 'd9500000-0000-0000-0000-000000000002';
select is((select a->>'code' || '|' || (a->>'detail') || '|' || (a->>'gravite') from jsonb_array_elements(pg_temp.q((select id::text from _c))->'anomalies') a
           where a->>'ouvrageId' = 'd9b00000-0000-0000-0000-0000000000d1' and a->>'pieceId' is not null), 'objet_supprime|piece_supprimee|erreur',
  'X3. pièce visée supprimée : objet supprimé (erreur)');
select lives_ok(format($$ select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000c1', '{"nom":"Montants neufs","categorie":"cloisons","unite":"u","regle":{"source":"longueur_murs","operations":[{"op":"entraxe","valeur":0.6},{"op":"ajouter","valeur":1}]},"arrondi":{"mode":"superieur","pas":1},"etats":["existant"]}') $$,
  (select id from _c)), 'X4a. règle modifiée : la ligne « neuf » ajustée disparaît');
select is((select count(*)::int from jsonb_array_elements(pg_temp.q((select id::text from _c))->'anomalies') a where a->>'detail' = 'ajustement_orphelin'), 1,
  'X4. ajustement orphelin signalé (objet supprimé), jamais perdu');

-- ─────────────────────────────────────────────────────────────
-- V. Versioning
-- ─────────────────────────────────────────────────────────────
create temporary table _f on commit drop as select * from public.tools_releve_plan_figer((select id from _p), pg_temp.rev((select id::text from _p)), 'Existant');
select ok((select quantitatif is not null and jsonb_array_length(quantitatif->'lignes') > 0 and quantitatif ? 'calculeLe' from public.tools_releves_plans where id = (select id from _p)),
  'V1. gel : quantitatif figé avec le plan');
update public.tools_releves_pieces set hauteur_sous_plafond_mm = 3000 where id = 'd9500000-0000-0000-0000-000000000001';
select is(pg_temp.ql((select id::text from _p), 'd9b00000-0000-0000-0000-00000000000d') || '|' || (pg_temp.q((select id::text from _p))->>'source'), 'sejour|nouveau=26.600|gel',
  'V2. hauteur modifiée APRÈS le gel : quantitatif figé inchangé');
select throws_ok(format($$ select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-000000000001', '{"nom":"Après gel"}') $$, (select id from _p)),
  '42501', 'Plan figé : son quantitatif est figé', 'V3. plan figé : ouvrage non modifiable');
select throws_ok(format($$ select public.tools_releve_quantitatif_ajuster(%L, 'd9b00000-0000-0000-0000-000000000001', 'd9500000-0000-0000-0000-000000000001', 'nouveau', 1, 'Après gel') $$, (select id from _p)),
  '42501', null, 'V4. plan figé : aucun ajustement');
select throws_ok(format($$ select public.tools_releve_ouvrage_supprimer(%L, 'd9b00000-0000-0000-0000-000000000001') $$, (select id from _p)),
  '42501', null, 'V5. plan figé : aucune suppression d''ouvrage');
reset role;
select throws_ok(format($$ update public.tools_releves_plans set quantitatif = '{}'::jsonb where id = %L $$, (select id from _p)),
  '42501', null, 'V6. quantitatif figé immuable (même pour le propriétaire des tables)');
select throws_ok($$ update public.tools_releves_ouvrages set ordre = 99 where id = 'd9b00000-0000-0000-0000-000000000001' $$,
  '42501', null, 'V7. ouvrage d''un plan figé immuable (même pour le propriétaire des tables)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(pg_temp.ql((select id::text from _c), (select id::text from public.tools_releves_ouvrages where plan_id = (select id from _c) and origine_ouvrage_id = 'd9b00000-0000-0000-0000-00000000000d')),
  'sejour|nouveau=31.920', 'V8. plan dérivé : recalcul indépendant (hauteur 3,00 m → 31,92 m³)');

-- ─────────────────────────────────────────────────────────────
-- B. Bibliothèque (sans prix)
-- ─────────────────────────────────────────────────────────────
select lives_ok($$ select public.tools_releve_bibliotheque_enregistrer('d9000000-0000-0000-0000-000000000001', 'd9c00000-0000-0000-0000-000000000001',
  pg_temp.o('{"nom":"Peinture velours","code":"PEI-VEL","regle":{"source":"surface_murs"},"pertePourcent":5}')) $$, 'B1. ouvrage enregistré dans la bibliothèque de l''entreprise');
select is((select jsonb_array_length(public.tools_releve_bibliotheque('d9000000-0000-0000-0000-000000000001'))::text || '|'
          || (public.tools_releve_bibliotheque('d9000000-0000-0000-0000-000000000001')->0->'donnees'->>'code')), '1|PEI-VEL', 'B2. bibliothèque lue par relevé');
select throws_ok($$ select public.tools_releve_bibliotheque_enregistrer('d9000000-0000-0000-0000-000000000001', 'd9c00000-0000-0000-0000-000000000002',
  pg_temp.o('{"nom":"Avec prix","tarif":10}')) $$, '22023', 'Aucun prix dans Tools : un ouvrage décrit la prestation, son unité et sa règle de quantité.', 'B3. prix refusé');
select throws_ok($$ select public.tools_releve_bibliotheque_enregistrer('d9000000-0000-0000-0000-000000000001', 'd9c00000-0000-0000-0000-000000000002',
  pg_temp.o('{"nom":"Code double","code":"PEI-VEL"}')) $$, '23505', null, 'B4. code unique par entreprise');
select throws_ok($$ select public.tools_releve_bibliotheque_enregistrer('d9000000-0000-0000-0000-000000000001', 'd9c00000-0000-0000-0000-000000000002',
  pg_temp.o('{"nom":"Pièces","pieceIds":["d9500000-0000-0000-0000-000000000001"]}')) $$, '22023', null, 'B5. la bibliothèque ne cible aucune pièce');
select lives_ok(format($$ select public.tools_releve_ouvrage_enregistrer(%L, 'd9b00000-0000-0000-0000-0000000000e1',
  (public.tools_releve_bibliotheque('d9000000-0000-0000-0000-000000000001')->0->'donnees'), 'd9c00000-0000-0000-0000-000000000001') $$, (select id from _c)),
  'B6. ouvrage du plan créé depuis la bibliothèque (lien conservé)');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.tools_releve_bibliotheque_enregistrer('d9000000-0000-0000-0000-000000000001', 'd9c00000-0000-0000-0000-000000000003', pg_temp.o('{}')) $$,
  '42501', null, 'B7. consultation : bibliothèque non modifiable');

-- ─────────────────────────────────────────────────────────────
-- T. Isolation
-- ─────────────────────────────────────────────────────────────
select ok(jsonb_array_length(pg_temp.q((select id::text from _c))->'lignes') > 0
          and jsonb_array_length(public.tools_releve_quantitatif_synthese('d9000000-0000-0000-0000-000000000001', 'projete')) = 1,
  'T1. consultation : quantitatif et synthèse lisibles');
select throws_ok(format($$ select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000f1', '{}') $$, (select id from _c)), '42501', null, 'T2. consultation : aucun ouvrage');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok(format($$ select public.tools_releve_plan_quantitatif(%L) $$, (select id from _c)), '42501', null, 'T3. autre tenant : quantitatif refusé');
select throws_ok($$ select public.tools_releve_quantitatif_synthese('d9000000-0000-0000-0000-000000000001', 'existant') $$, '42501', null, 'T4. autre tenant : synthèse refusée');
select throws_ok(format($$ select pg_temp.enr(%L, 'd9b00000-0000-0000-0000-0000000000f2', '{}') $$, (select id from _c)), '42501', null, 'T5. autre tenant : aucune écriture');
select is((select count(*)::int from public.tools_releves_ouvrages where releve_id = 'd9000000-0000-0000-0000-000000000001')
          + (select count(*)::int from public.tools_releves_ouvrages_bibliotheque where entreprise_id = 'a0000000-0000-0000-0000-000000000001')
          + (select count(*)::int from public.tools_releves_quantitatif_ajustements where releve_id = 'd9000000-0000-0000-0000-000000000001'), 0,
  'T6. autre tenant : ni ouvrage, ni bibliothèque, ni ajustement visibles');
reset role;
set local role anon;
select throws_ok(format($$ select public.tools_releve_plan_quantitatif(%L) $$, (select id from _c)), '42501', null, 'T7. anonyme : aucune lecture');
reset role;

select * from finish();
rollback;
