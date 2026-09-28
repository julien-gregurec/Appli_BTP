-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 6 — OUVERTURES, JONCTIONS & GÉOMÉTRIE BÂTIMENT (migration 20260928000401)
--
-- Qualifie sous RLS réelle :
--   S1–S4   schéma et droits : fonctions de contrôle, droits (anon / authenticated), RPC inchangée (SECURITY DEFINER) ;
--   O1–O8   attributs de menuiserie : vantaux, poussée, modèle enregistrés et relus ; valeurs inconnues refusées ;
--           ouvertures du Lot 5 (sans attributs) inchangées ;
--   V1–V12  validations serveur : largeur nulle, plus large que le mur, hors mur (mur raccourci sans ses
--           ouvertures), chevauchement (dans le lot, avec une ouverture existante), hauteur / allège
--           incohérentes (mur abaissé), mur sans hauteur ; lot entier annulé (révision inchangée) ;
--   D1–D4   versioning : ouverture dans la version du plan, copie dans le plan dérivé (attributs et lignée),
--           plan figé immuable (RPC et écriture directe), dérivé modifiable sans toucher au figé ;
--   T1–T5   isolation : consultation, autre tenant (lecture et écriture), anonyme, ouverture sur un mur d'un
--           autre plan ;
--   L1–L4   lecture de la géométrie par RPC : mêmes lignes que la RLS, consultation autorisée, autre
--           tenant et anonyme refusés.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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

create function pg_temp.mur(id text, ax int, ay int, bx int, by_ int, hauteur int default 2500) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'pieceId', null, 'donnees', jsonb_build_object(
    'a', jsonb_build_object('x', ax, 'y', ay), 'b', jsonb_build_object('x', bx, 'y', by_),
    'epaisseurMm', 200, 'hauteurMm', hauteur, 'typeMur', 'porteur')) $$;
grant execute on function pg_temp.mur(text, int, int, int, int, int) to authenticated, service_role;
create function pg_temp.ouv(id text, mur text, decalage int, largeur int, extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'murId', mur, 'donnees', jsonb_build_object('decalageMm', decalage, 'largeurMm', largeur,
    'hauteurMm', 2040, 'allegeMm', null, 'typeOuverture', 'porte', 'sens', 'gauche') || extra) $$;
grant execute on function pg_temp.ouv(text, text, int, int, jsonb) to authenticated, service_role;
create function pg_temp.rev(p text) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p::uuid $$;
grant execute on function pg_temp.rev(text) to authenticated, service_role;
create function pg_temp.save(p text, mods jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_enregistrer(p::uuid, pg_temp.rev(p), mods) $$;
grant execute on function pg_temp.save(text, jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select has_function('public', 'tools_releve_plan_ouverture_anomalie', array['jsonb', 'numeric', 'numeric'], 'S1. contrôle d''une ouverture');
select has_function('public', 'tools_releve_plan_murs_anomalie', array['uuid', 'uuid[]'], 'S2. contrôle des ouvertures des murs touchés');
select ok(not has_function_privilege('anon', 'public.tools_releve_plan_enregistrer(uuid, bigint, jsonb)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_plan_enregistrer(uuid, bigint, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.tools_releve_plan_murs_anomalie(uuid, uuid[])', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_plan_ouverture_anomalie(jsonb, numeric, numeric)', 'EXECUTE'),
  'S3. droits : RPC réservée aux authentifiés, contrôle des murs interne, rien pour anonyme');
select ok((select prosecdef from pg_proc where proname = 'tools_releve_plan_enregistrer'), 'S4. enregistrement toujours SECURITY DEFINER (contrôle explicite des droits)');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur 10…03 (tenant A), plan initial, mur de 4 m (hauteur 2,50 m).
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('d6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 6', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'd6000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('d6200000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('d6300000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'RDC', 0),
  ('d6300000-0000-0000-0000-000000000002', 'd6000000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'R+1', 1);
-- Ouverture « Lot 5 » (sans attributs de menuiserie) sur un mur antérieur.
insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('d6600000-0000-0000-0000-0000000000a0', 'd6000000-0000-0000-0000-000000000001', 'mur', 'd6300000-0000-0000-0000-000000000001',
   '{"a":{"x":0,"y":5000},"b":{"x":3000,"y":5000},"epaisseurMm":100,"hauteurMm":2500,"typeMur":"cloison"}');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, parent_element_id, donnees) values
  ('d6700000-0000-0000-0000-0000000000a0', 'd6000000-0000-0000-0000-000000000001', 'ouverture', 'd6300000-0000-0000-0000-000000000001',
   'd6600000-0000-0000-0000-0000000000a0', '{"decalageMm":500,"largeurMm":800,"hauteurMm":2040,"allegeMm":null,"typeOuverture":"porte","sens":"gauche"}');
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('d6300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role;
create temporary table _legacy on commit drop as select donnees from public.tools_releves_elements where id = 'd6700000-0000-0000-0000-0000000000a0';
select pg_temp.save((select id::text from _p), jsonb_build_object('murs', jsonb_build_array(
  pg_temp.mur('d6600000-0000-0000-0000-000000000001', 0, 0, 4000, 0), pg_temp.mur('d6600000-0000-0000-0000-000000000002', 0, 1000, 4000, 1000, null))));

-- ─────────────────────────────────────────────────────────────
-- O. Attributs de menuiserie
-- ─────────────────────────────────────────────────────────────
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(
    pg_temp.ouv('d6700000-0000-0000-0000-000000000001', 'd6600000-0000-0000-0000-000000000001', 200, 1400, '{"vantaux":2,"poussee":"poussant","modele":"battant"}'),
    pg_temp.ouv('d6700000-0000-0000-0000-000000000002', 'd6600000-0000-0000-0000-000000000001', 2000, 830, '{"sens":"coulissant","modele":"coulissant","vantaux":1}')))) $$, (select id from _p)),
  'O1. porte double poussante et porte coulissante enregistrées');
select is((select donnees->>'vantaux' || '|' || (donnees->>'poussee') || '|' || (donnees->>'modele') from public.tools_releves_elements where id = 'd6700000-0000-0000-0000-000000000001'),
  '2|poussant|battant', 'O2. attributs relus à l''identique');
select is((select donnees->>'modele' || '|' || (donnees->>'sens') from public.tools_releves_elements where id = 'd6700000-0000-0000-0000-000000000002'),
  'coulissant|coulissant', 'O3. porte coulissante : modèle et sens');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000003', 'd6600000-0000-0000-0000-000000000001', 3000, 600, '{"vantaux":3}')))) $$, (select id from _p)),
  '22023', 'Ouverture invalide.', 'O4. trois vantaux refusés');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000003', 'd6600000-0000-0000-0000-000000000001', 3000, 600, '{"poussee":"lateral"}')))) $$, (select id from _p)),
  '22023', 'Ouverture invalide.', 'O5. poussée inconnue refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000003', 'd6600000-0000-0000-0000-000000000001', 3000, 600, '{"modele":"guillotine"}')))) $$, (select id from _p)),
  '22023', 'Ouverture invalide.', 'O6. modèle inconnu refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000003', 'd6600000-0000-0000-0000-000000000001', 3000, 600, '{"sens":"haut"}')))) $$, (select id from _p)),
  '22023', 'Ouverture invalide.', 'O7. sens inconnu refusé');
select is((select donnees from public.tools_releves_elements where id = 'd6700000-0000-0000-0000-0000000000a0'), (select donnees from _legacy),
  'O8. ouverture antérieure (sans attributs) adoptée sans réécriture');

-- ─────────────────────────────────────────────────────────────
-- V. Validations (révision courante : 3)
-- ─────────────────────────────────────────────────────────────
select is(pg_temp.rev((select id::text from _p)), 3::bigint, 'V0. révision de départ');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000001', 3000, 0)))) $$, (select id from _p)),
  '22023', null, 'V1. largeur nulle refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000001', 0, 4500)))) $$, (select id from _p)),
  '22023', null, 'V2. ouverture plus large que son mur refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000001', 1000, 900)))) $$, (select id from _p)),
  '22023', 'Deux ouvertures se chevauchent sur ce mur.', 'V3. chevauchement avec une ouverture existante refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(
    pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000002', 100, 900),
    pg_temp.ouv('d6700000-0000-0000-0000-000000000005', 'd6600000-0000-0000-0000-000000000002', 900, 900)))) $$, (select id from _p)),
  '22023', 'Deux ouvertures se chevauchent sur ce mur.', 'V4. chevauchement dans le même lot refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d6600000-0000-0000-0000-000000000001', 0, 0, 2500, 0)))) $$, (select id from _p)),
  '22023', 'L''ouverture sort de son mur.', 'V5. mur raccourci sans ses ouvertures : ouverture hors du mur, refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000001', 3000, 600, '{"allegeMm":900,"hauteurMm":1800}')))) $$, (select id from _p)),
  '22023', 'Hauteur incohérente : allège + hauteur dépassent la hauteur du mur.', 'V6. allège + hauteur > hauteur du mur refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d6600000-0000-0000-0000-000000000001', 0, 0, 4000, 0, 2000)))) $$, (select id from _p)),
  '22023', 'Hauteur incohérente : allège + hauteur dépassent la hauteur du mur.', 'V7. mur abaissé sous ses ouvertures : refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000001', 3000, 600, '{"allegeMm":-10}')))) $$, (select id from _p)),
  '22023', null, 'V8. allège négative refusée');
select is(pg_temp.rev((select id::text from _p)), 3::bigint, 'V9. refus : rien n''a été écrit (révision inchangée, lot atomique)');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000004', 'd6600000-0000-0000-0000-000000000002', 100, 900, '{"allegeMm":2000,"hauteurMm":2150}')))) $$, (select id from _p)),
  'V10. mur sans hauteur connue : pas de contrôle de hauteur');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object(
    'murs', jsonb_build_array(pg_temp.mur('d6600000-0000-0000-0000-000000000001', 0, 0, 3400, 0)),
    'ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000002', 'd6600000-0000-0000-0000-000000000001', 2500, 830, '{"sens":"coulissant","modele":"coulissant","vantaux":1}')))) $$, (select id from _p)),
  'V11. mur raccourci AVEC ses ouvertures ramenées : accepté');
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _p) and type = 'ouverture' and deleted_at is null), 4,
  'V12. ouvertures du plan : 3 nouvelles + 1 adoptée');

-- ─────────────────────────────────────────────────────────────
-- D. Versioning
-- ─────────────────────────────────────────────────────────────
create temporary table _f on commit drop as select * from public.tools_releve_plan_figer((select id from _p), pg_temp.rev((select id::text from _p)), 'Existant');
select ok((select fige_le is not null from _f), 'D1. plan initial figé avec ses ouvertures');
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('d6300000-0000-0000-0000-000000000001', 'corrige');
grant select on _c to authenticated, service_role, anon;
select is((select donnees->>'vantaux' || '|' || (donnees->>'poussee') || '|' || (donnees->>'origineId') from public.tools_releves_elements
  where plan_id = (select id from _c) and donnees->>'origineId' = 'd6700000-0000-0000-0000-000000000001'),
  '2|poussant|d6700000-0000-0000-0000-000000000001', 'D2. plan dérivé : ouverture copiée avec ses attributs et sa lignée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000001', 'd6600000-0000-0000-0000-000000000001', 250, 1400, '{"vantaux":2}')))) $$, (select id from _p)),
  '42501', null, 'D3. plan figé : ouverture non modifiable (RPC)');
select throws_ok($$ update public.tools_releves_elements set donnees = donnees || '{"vantaux":1}' where id = 'd6700000-0000-0000-0000-000000000001' $$,
  '42501', null, 'D4. plan figé : ouverture non modifiable (écriture directe)');
-- Dérivé : l'ouverture copiée se déplace ; l'originale (plan figé) ne bouge pas.
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(jsonb_build_object('id', (select id from public.tools_releves_elements where plan_id = %L and donnees->>'origineId' = 'd6700000-0000-0000-0000-000000000001'),
    'murId', (select parent_element_id from public.tools_releves_elements where plan_id = %L and donnees->>'origineId' = 'd6700000-0000-0000-0000-000000000001'),
    'donnees', (select donnees || '{"decalageMm":300}' from public.tools_releves_elements where plan_id = %L and donnees->>'origineId' = 'd6700000-0000-0000-0000-000000000001'))))) $$,
    (select id from _c), (select id from _c), (select id from _c), (select id from _c)),
  'D5. plan dérivé : ouverture copiée déplacée');
select is((select (donnees->>'decalageMm')::int from public.tools_releves_elements where id = 'd6700000-0000-0000-0000-000000000001'), 200,
  'D6. plan figé intact (ouverture d''origine inchangée)');

-- ─────────────────────────────────────────────────────────────
-- T. Isolation
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok(format($$ select pg_temp.save(%L, '{"ouvertures":[]}'::jsonb) $$, (select id from _c)),
  '42501', null, 'T1. consultation : aucun enregistrement');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_elements where releve_id = 'd6000000-0000-0000-0000-000000000001' and type = 'ouverture'), 0,
  'T2. autre tenant : aucune ouverture visible');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 1, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-000000000009', 'd6600000-0000-0000-0000-000000000001', 100, 800)))) $$, (select id from _c)),
  '42501', null, 'T3. autre tenant : enregistrement refusé');
reset role;
set local role anon;
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 1, '{}'::jsonb) $$, (select id from _c)),
  '42501', null, 'T4. anonyme : RPC interdite');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.ouv('d6700000-0000-0000-0000-00000000000a', 'd6600000-0000-0000-0000-000000000001', 100, 800)))) $$, (select id from _c)),
  '42501', null, 'T5. ouverture sur un mur d''un autre plan (le plan figé) : refusée');

-- L. Lecture de la géométrie par RPC (même périmètre que la policy SELECT)
select is((select count(*)::int from public.tools_releve_plan_elements((select id from _c))),
  (select count(*)::int from public.tools_releves_elements where plan_id = (select id from _c) and deleted_at is null),
  'L1. RPC de lecture : mêmes lignes que la lecture sous RLS');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select ok((select count(*) from public.tools_releve_plan_elements((select id from _c))) > 0, 'L2. consultation : lecture autorisée');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok(format($$ select * from public.tools_releve_plan_elements(%L) $$, (select id from _c)), '42501', null, 'L3. autre tenant : lecture refusée');
reset role;
set local role anon;
select throws_ok(format($$ select * from public.tools_releve_plan_elements(%L) $$, (select id from _c)), '42501', null, 'L4. anonyme : RPC interdite');
reset role;

select * from finish();
rollback;
