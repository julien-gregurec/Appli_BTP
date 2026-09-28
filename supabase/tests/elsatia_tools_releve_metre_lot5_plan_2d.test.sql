-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 5 — PLAN 2D (migration 20260927000901)
--
-- Qualifie sous RLS réelle :
--   S1–S6   schéma : table, colonne plan_id, RLS, lecture seule pour `authenticated`, RPC SECURITY DEFINER ;
--   C1–C9   création : plan initial unique et premier, adoption des murs antérieurs, états refusés,
--           droits (consultation, non habilité, autre tenant, anonyme) ;
--   E1–E20  enregistrement par lot : murs, ouvertures, contours (surface calculée par le serveur),
--           révision attendue (conflit PT409 → HTTP 409, rien d'écrit), validations, éléments étrangers, suppression
--           douce et restauration (annuler), écritures inchangées ignorées, journal sans coordonnées ;
--   F1–F12  gel : empreinte, version du relevé du même type, immuabilité (RPC, écriture directe,
--           service_role), plan dérivé (copie, lignée origineId, contours remappés), états successifs ;
--   K1–K3   cascade étage → plans (figés compris), restauration symétrique ;
--   P1–P5   RLS : membre, consultation, autre tenant, anonyme ;
--   G1–G3   RGPD : export, purge réelle d'un tenant avec plan figé.
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

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

-- Charges utiles.
create function pg_temp.mur(id text, ax int, ay int, bx int, by_ int, piece text default null) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'pieceId', piece, 'donnees', jsonb_build_object(
    'a', jsonb_build_object('x', ax, 'y', ay), 'b', jsonb_build_object('x', bx, 'y', by_),
    'epaisseurMm', 200, 'hauteurMm', 2500, 'typeMur', 'porteur')) $$;
grant execute on function pg_temp.mur(text, int, int, int, int, text) to authenticated, service_role;
create function pg_temp.rect() returns jsonb language sql as $$
  select jsonb_build_array(
    pg_temp.mur('d5600000-0000-0000-0000-000000000001', 0, 0, 4200, 0, 'd5500000-0000-0000-0000-000000000001'),
    pg_temp.mur('d5600000-0000-0000-0000-000000000002', 4200, 0, 4200, 3200, 'd5500000-0000-0000-0000-000000000001'),
    pg_temp.mur('d5600000-0000-0000-0000-000000000003', 4200, 3200, 0, 3200, 'd5500000-0000-0000-0000-000000000001'),
    pg_temp.mur('d5600000-0000-0000-0000-000000000004', 0, 3200, 0, 0, 'd5500000-0000-0000-0000-000000000001')) $$;
grant execute on function pg_temp.rect() to authenticated, service_role;
-- Contour intérieur 4000 × 3000 (axes des murs de 200 mm décalés de 100 mm) : 12 m².
create function pg_temp.contour(surface numeric default 1) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('pieceId', 'd5500000-0000-0000-0000-000000000001',
    'points', '[{"x":100,"y":100},{"x":4100,"y":100},{"x":4100,"y":3100},{"x":100,"y":3100}]'::jsonb,
    'murIds', jsonb_build_array('d5600000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000002',
                                'd5600000-0000-0000-0000-000000000003', 'd5600000-0000-0000-0000-000000000004'),
    'graine', '{"x":2100,"y":1600}'::jsonb, 'surfaceMm2', surface)) $$;
grant execute on function pg_temp.contour(numeric) to authenticated, service_role;
create function pg_temp.porte(id text, mur text, decalage int, largeur int) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'murId', mur, 'donnees', jsonb_build_object('decalageMm', decalage, 'largeurMm', largeur,
    'hauteurMm', 2040, 'allegeMm', null, 'typeOuverture', 'porte', 'sens', 'gauche')) $$;
grant execute on function pg_temp.porte(text, text, int, int) to authenticated, service_role;
create function pg_temp.rev(p text) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p::uuid $$;
grant execute on function pg_temp.rev(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma
-- ─────────────────────────────────────────────────────────────
select has_table('public', 'tools_releves_plans', 'S1. table tools_releves_plans');
select has_column('public', 'tools_releves_elements', 'plan_id', 'S2. tools_releves_elements.plan_id');
select ok((select relrowsecurity from pg_class where oid = 'public.tools_releves_plans'::regclass), 'S3. RLS activée sur les plans');
select ok(not has_table_privilege('authenticated', 'public.tools_releves_plans', 'INSERT')
          and not has_table_privilege('authenticated', 'public.tools_releves_plans', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.tools_releves_plans', 'DELETE')
          and has_table_privilege('authenticated', 'public.tools_releves_plans', 'SELECT'),
  'S4. authenticated : lecture seule sur les plans (écriture par RPC uniquement)');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('tools_releve_plan_creer', 'tools_releve_plan_enregistrer', 'tools_releve_plan_figer')),
  'S5. RPC de plan SECURITY DEFINER (contrôle explicite des droits)');
select ok(not has_function_privilege('anon', 'public.tools_releve_plan_enregistrer(uuid, bigint, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.tools_releve_plan_contenu(uuid)', 'EXECUTE'),
  'S6. anonyme : aucune RPC de plan ; contenu canonique interne');

-- ─────────────────────────────────────────────────────────────
-- Données : propriétaire 10…03 (relevé partagé), un mur antérieur au Lot 5.
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('d5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé plan', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'd5000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('d5200000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'Bâtiment A');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('d5300000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'd5200000-0000-0000-0000-000000000001', 'RDC', 0),
  ('d5300000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000001', 'd5200000-0000-0000-0000-000000000001', 'R+1', 1);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage) values
  ('d5500000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'd5300000-0000-0000-0000-000000000001', 'Séjour', 'sejour'),
  ('d5500000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000001', 'd5300000-0000-0000-0000-000000000002', 'Chambre', 'chambre');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('d5600000-0000-0000-0000-0000000000a0', 'd5000000-0000-0000-0000-000000000001', 'mur', 'd5300000-0000-0000-0000-000000000001',
   '{"a":{"x":0,"y":5000},"b":{"x":3000,"y":5000},"epaisseurMm":100,"hauteurMm":2500,"typeMur":"cloison"}');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, parent_element_id, donnees) values
  ('d5700000-0000-0000-0000-0000000000a0', 'd5000000-0000-0000-0000-000000000001', 'ouverture', 'd5300000-0000-0000-0000-000000000001',
   'd5600000-0000-0000-0000-0000000000a0', '{"decalageMm":500,"largeurMm":800,"hauteurMm":2040,"typeOuverture":"porte","sens":"gauche"}');

-- ─────────────────────────────────────────────────────────────
-- C. Création
-- ─────────────────────────────────────────────────────────────
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role;
select is((select numero || '|' || etat_documente || '|' || revision || '|' || entreprise_id from _p),
  '1|initial|1|a0000000-0000-0000-0000-000000000001', 'C1. plan initial : numéro 1, état initial, entreprise imposée par le serveur');
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _p)),
  2, 'C2. plan initial : le mur et l''ouverture relevés avant le Lot 5 sont adoptés');
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000001', 'initial') $$,
  '23505', null, 'C3. un seul plan initial par étage');
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'corrige') $$,
  '22023', null, 'C4. plan corrigé sans plan initial : refusé');
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'brouillon') $$,
  '22023', null, 'C5. état inconnu refusé');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'initial') $$,
  '42501', null, 'C6. consultation : aucune création de plan');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'initial') $$,
  '42501', null, 'C7. authentifié non habilité : aucune création');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'initial') $$,
  '42501', null, 'C8. autre tenant : aucune création sur un étage étranger');
reset role;
set local role anon;
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'initial') $$,
  '42501', null, 'C9. anonyme : RPC interdite');
reset role;

-- ─────────────────────────────────────────────────────────────
-- E. Enregistrement
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
create temporary table _e1 on commit drop as select public.tools_releve_plan_enregistrer((select id from _p), 1, jsonb_build_object(
  'murs', pg_temp.rect(),
  'ouvertures', jsonb_build_array(pg_temp.porte('d5700000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 1000, 900)),
  'contours', pg_temp.contour(1),
  'cadre', '{"minX":-1000,"minY":-1000,"maxX":9000,"maxY":7000}'::jsonb)) as r;
select is((select (r->>'revision') || '|' || (r->>'murs') || '|' || (r->>'ouvertures') from _e1), '2|4|1',
  'E1. enregistrement : 4 murs + 1 ouverture en un lot, révision du plan 1 → 2');
select is((select count(*)::int from public.tools_releves_elements
  where plan_id = (select id from _p) and type = 'mur' and etage_id = 'd5300000-0000-0000-0000-000000000001' and deleted_at is null),
  5, 'E2. murs du plan rattachés à l''étage du plan (4 nouveaux + 1 adopté)');
select is((select parent_element_id::text from public.tools_releves_elements where id = 'd5700000-0000-0000-0000-000000000001'),
  'd5600000-0000-0000-0000-000000000001', 'E3. ouverture : wall_id = mur hôte (parent_element_id)');
select is((select (contours->0->>'surfaceMm2')::numeric from public.tools_releves_plans where id = (select id from _p)),
  12000000.0, 'E4. surface du contour calculée par le serveur (12 m²), jamais celle du client');
select is((select cadre->>'maxX' from public.tools_releves_plans where id = (select id from _p)), '9000', 'E5. cadre enregistré');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 1, '{"murs":[]}') $$, (select id from _p)),
  'PT409', null, 'E6. révision attendue périmée : conflit détecté (PT409 → HTTP 409)');
select is(pg_temp.rev((select id::text from _p)), 2::bigint, 'E7. conflit : rien n''a été écrit (révision inchangée)');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d5600000-0000-0000-0000-000000000009', 10, 10, 10, 10)))) $$, (select id from _p)),
  '22023', null, 'E8. mur de longueur nulle refusé');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.porte('d5700000-0000-0000-0000-000000000009', 'd5600000-0000-0000-0000-000000000001', 4000, 900)))) $$, (select id from _p)),
  '22023', null, 'E9. ouverture qui déborde de son mur refusée');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('contours', jsonb_build_array(jsonb_build_object('pieceId', 'd5500000-0000-0000-0000-000000000002', 'points', '[{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":10}]'::jsonb)))) $$, (select id from _p)),
  '42501', null, 'E10. contour d''une pièce d''un autre étage refusé');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('contours', jsonb_build_array(jsonb_build_object('pieceId', 'd5500000-0000-0000-0000-000000000001', 'points', '[{"x":0,"y":0},{"x":10,"y":0}]'::jsonb)))) $$, (select id from _p)),
  '22023', null, 'E11. contour ouvert (2 points) refusé');
insert into public.tools_releves_elements(id, releve_id, type, etage_id, donnees) values
  ('d5600000-0000-0000-0000-0000000000e0', 'd5000000-0000-0000-0000-000000000001', 'equipement', 'd5300000-0000-0000-0000-000000000001',
   '{"categorie":"electricite","position":{"x":100,"y":100},"libelle":"Tableau"}');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d5600000-0000-0000-0000-0000000000e0', 0, 0, 10, 0)))) $$, (select id from _p)),
  '42501', null, 'E12. identifiant d''un élément étranger au plan : refusé (pas de détournement)');
-- Écriture inchangée : aucune révision d'élément consommée.
create temporary table _rev_mur on commit drop as select revision from public.tools_releves_elements where id = 'd5600000-0000-0000-0000-000000000002';
select lives_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('murs', pg_temp.rect())) $$, (select id from _p)),
  'E13. ré-enregistrement identique accepté');
select is((select revision from public.tools_releves_elements where id = 'd5600000-0000-0000-0000-000000000002'), (select revision from _rev_mur),
  'E14. mur inchangé : non réécrit (révision de l''élément conservée)');
-- Suppression douce puis annulation (ré-envoi du mur).
select lives_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 3, '{"supprimes":["d5600000-0000-0000-0000-000000000001"]}') $$, (select id from _p)),
  'E15. suppression d''un mur');
select is((select count(*)::int from public.tools_releves_elements where id in ('d5600000-0000-0000-0000-000000000001', 'd5700000-0000-0000-0000-000000000001') and deleted_at is not null),
  2, 'E16. suppression douce : le mur emporte son ouverture (cascade Lot 2)');
select lives_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 4, jsonb_build_object('murs', jsonb_build_array(pg_temp.rect()->0))) $$, (select id from _p)),
  'E17. annuler : le mur ré-envoyé est restauré');
select is((select count(*)::int from public.tools_releves_elements where id in ('d5600000-0000-0000-0000-000000000001', 'd5700000-0000-0000-0000-000000000001') and deleted_at is null),
  2, 'E18. restauration symétrique : mur et ouverture de nouveau actifs');
select is((select action || '|' || array_to_string(champs, ',') || '|' || (details ? 'murs')::text || '|' || (details::text like '%4200%')::text
  from public.tools_releves_journal where entite = 'plan' and entite_id = (select id from _p) and action = 'modification' order by created_at, id limit 1),
  'modification|contours,cadre,murs,ouvertures|true|false', 'E19. journal du plan : champs et compteurs, jamais de coordonnées');
select throws_ok($$ update public.tools_releves_plans set libelle = 'x' $$, '42501', null,
  'E20. écriture directe d''un plan interdite (RPC uniquement)');
reset role;

-- ─────────────────────────────────────────────────────────────
-- P. RLS
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 5, '{"reglages":{"epaisseurMm":200}}') $$, (select id from _p)),
  'P1. membre métreur (relevé partagé) : enregistre le plan');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releves_plans where releve_id = 'd5000000-0000-0000-0000-000000000001'), 1,
  'P2. consultation : voit le plan');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 6, '{}') $$, (select id from _p)),
  '42501', null, 'P3. consultation : n''enregistre pas');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_plans) + (select count(*)::int from public.tools_releves_elements where plan_id is not null),
  0, 'P4. autre tenant : aucun plan, aucun mur de plan visible');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 6, '{}') $$, (select id from _p)),
  '42501', null, 'P5. autre tenant : enregistrement refusé (cross tenant)');
reset role;

-- ─────────────────────────────────────────────────────────────
-- F. Gel et plans dérivés
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(format($$ select public.tools_releve_plan_figer(%L, 1) $$, (select id from _p)),
  'PT409', null, 'F1. gel sur une révision périmée : conflit');
create temporary table _fige on commit drop as select * from public.tools_releve_plan_figer((select id from _p), 6, 'Existant');
select ok((select fige_le is not null and empreinte ~ '^[0-9a-f]{64}$' and version_id is not null from _fige),
  'F2. plan figé : horodatage, empreinte SHA-256, version du relevé');
select is((select v.type_version || '|' || (v.contenu ? 'plans')::text || '|' || jsonb_array_length(v.contenu->'plans')
  from public.tools_releves_versions v where v.id = (select version_id from _fige)),
  'initial|true|1', 'F3. version initiale du relevé créée ; l''instantané inclut les plans');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 7, '{}') $$, (select id from _p)),
  '42501', null, 'F4. plan figé : plus d''enregistrement');
select throws_ok($$ update public.tools_releves_elements set donnees = jsonb_set(donnees, '{epaisseurMm}', '300') where id = 'd5600000-0000-0000-0000-000000000002' $$,
  '42501', null, 'F5. plan figé : un mur ne se modifie pas en écriture directe');
select throws_ok($$ update public.tools_releves_elements set deleted_at = now() where id = 'd5600000-0000-0000-0000-000000000002' $$,
  '42501', null, 'F6. plan figé : un mur ne se supprime pas');
select throws_ok(format($$ insert into public.tools_releves_elements(releve_id, type, etage_id, plan_id, donnees) values
  ('d5000000-0000-0000-0000-000000000001', 'mur', 'd5300000-0000-0000-0000-000000000001', %L,
   '{"a":{"x":0,"y":0},"b":{"x":1,"y":0},"epaisseurMm":100,"typeMur":"cloison"}') $$, (select id from _p)),
  '42501', null, 'F7. plan figé : aucun mur ajouté');
select throws_ok(format($$ select public.tools_releve_plan_figer(%L, 7) $$, (select id from _p)),
  '42501', null, 'F8. un plan figé ne se fige pas deux fois');
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000001', 'corrige');
grant select on _c to authenticated, service_role;
select is((select numero || '|' || etat_documente || '|' || (plan_base_id = (select id from _p))::text || '|' || (fige_le is null)::text from _c),
  '2|corrige|true|true', 'F9. plan corrigé dérivé du plan figé : numéro 2, modifiable');
select is((select count(*)::int || '|' || count(*) filter (where donnees ? 'origineId' and id not in (select x.id from public.tools_releves_elements x where x.plan_id = (select id from _p)))::int
  from public.tools_releves_elements where plan_id = (select id from _c) and deleted_at is null),
  '7|7', 'F10. copie : 5 murs + 2 ouvertures, nouveaux identifiants, lignée origineId');
select ok((select bool_and(o.parent_element_id in (select m.id from public.tools_releves_elements m where m.plan_id = (select id from _c)))
  from public.tools_releves_elements o where o.plan_id = (select id from _c) and o.type = 'ouverture')
  and (select bool_and((m #>> '{}')::uuid in (select x.id from public.tools_releves_elements x where x.plan_id = (select id from _c)))
       from public.tools_releves_plans p, jsonb_array_elements(p.contours->0->'murIds') m where p.id = (select id from _c)),
  'F11. copie : ouvertures et contours pointent sur les murs du nouveau plan');
select throws_ok(format($$ select public.tools_releve_plan_contenu(%L) $$, (select id from _p)),
  '42501', null, 'F12a. contenu canonique réservé au serveur (appel direct refusé au client)');
reset role;
select ok((select encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(id)::text, 'UTF8'), 'sha256'), 'hex') = empreinte
  from public.tools_releves_plans where id = (select id from _p)),
  'F12. plan figé intact après dérivation : empreinte recalculée identique');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000001', 'corrige') $$,
  '23505', null, 'F13. un seul plan corrigé MODIFIABLE à la fois par étage');
create temporary table _cf on commit drop as select * from public.tools_releve_plan_figer((select id from _c), pg_temp.rev((select id::text from _c)), 'Corrigé');
select is((select v.type_version from public.tools_releves_versions v where v.id = (select version_id from _cf)), 'corrige',
  'F14. gel du plan corrigé : version « corrige » du relevé');
select is((select string_agg(etat_documente || ':' || numero, ',' order by numero) from (
  select * from public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000001', 'projete') union all
  select * from public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000001', 'as_built')) t),
  'projete:3,as_built:4', 'F15. plans projeté puis tel que construit dérivés');
reset role;
select throws_ok(format($$ update public.tools_releves_plans set libelle = 'service' where id = %L $$, (select id from _p)),
  '42501', null, 'F16. service_role : un plan figé reste immuable');

-- ─────────────────────────────────────────────────────────────
-- K. Cascade étage → plans
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
update public.tools_releves_etages set deleted_at = now() where id = 'd5300000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tools_releves_plans where etage_id = 'd5300000-0000-0000-0000-000000000001' and deleted_at is null), 0,
  'K1. étage supprimé : ses plans (figés compris) passent à la corbeille');
update public.tools_releves_etages set deleted_at = null where id = 'd5300000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tools_releves_plans where etage_id = 'd5300000-0000-0000-0000-000000000001' and deleted_at is null), 4,
  'K2. étage restauré : plans restaurés');
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _p) and deleted_at is null), 7,
  'K3. étage restauré : murs et ouvertures du plan figé restaurés');
reset role;

-- ─────────────────────────────────────────────────────────────
-- Garde élément ↔ plan
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
create temporary table _r1 on commit drop as select * from public.tools_releve_plan_creer('d5300000-0000-0000-0000-000000000002', 'initial');
select throws_ok(format($$ insert into public.tools_releves_elements(releve_id, type, etage_id, plan_id, donnees) values
  ('d5000000-0000-0000-0000-000000000001', 'mur', 'd5300000-0000-0000-0000-000000000001', %L,
   '{"a":{"x":0,"y":0},"b":{"x":1,"y":0},"epaisseurMm":100,"typeMur":"cloison"}') $$, (select id from _r1)),
  '42501', null, 'M1. un mur est sur l''étage de son plan');
select throws_ok(format($$ insert into public.tools_releves_elements(releve_id, type, etage_id, plan_id, donnees) values
  ('d5000000-0000-0000-0000-000000000001', 'quantite', 'd5300000-0000-0000-0000-000000000002', %L,
   '{"cle":"sol","formule":"surface","valeur":1,"unite":"m2","qualite":"exacte"}') $$, (select id from _r1)),
  '23514', null, 'M2. seuls murs, ouvertures (et, depuis les Lots 7 / 8, équipements, cotes, revêtements) appartiennent à un plan');
select lives_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 1, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d5600000-0000-0000-0000-0000000000b1', 0, 0, 3000, 0)))) $$, (select id from _r1)),
  'M3. étage R+1 : mur du plan initial');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 2, jsonb_build_object('ouvertures', jsonb_build_array(pg_temp.porte('d5700000-0000-0000-0000-0000000000b1', 'd5600000-0000-0000-0000-000000000002', 0, 900)))) $$, (select id from _r1)),
  '42501', null, 'M4. une ouverture ne peut pas être hébergée par le mur d''un autre plan');
reset role;

-- ─────────────────────────────────────────────────────────────
-- G. RGPD
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
create temporary table _export_a on commit drop as select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') as e;
reset role;
select is((select count(*)::int from _export_a, jsonb_array_elements(e->'donnees'->'tools_releves_plans') p
  where p->>'releve_id' = 'd5000000-0000-0000-0000-000000000001'), 5,
  'G1. export RGPD : les plans du tenant sont exportés (contours et cadre compris)');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
  values ('d5000000-0000-0000-0000-00000000000e', 'e0000000-0000-0000-0000-000000000001', 'Relevé R', 'Chantier R');
insert into public.tools_releves_batiments(id, releve_id, nom) values ('d5200000-0000-0000-0000-00000000000e', 'd5000000-0000-0000-0000-00000000000e', 'Bât R');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau)
  values ('d5300000-0000-0000-0000-00000000000e', 'd5000000-0000-0000-0000-00000000000e', 'd5200000-0000-0000-0000-00000000000e', 'RDC', 0);
create temporary table _pr on commit drop as select * from public.tools_releve_plan_creer('d5300000-0000-0000-0000-00000000000e', 'initial');
select public.tools_releve_plan_enregistrer((select id from _pr), 1, jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d5600000-0000-0000-0000-0000000000f1', 0, 0, 3000, 0))));
select public.tools_releve_plan_figer((select id from _pr), 2, 'Existant R');
select public.tools_releve_plan_creer('d5300000-0000-0000-0000-00000000000e', 'corrige');
reset role;
select is((select count(*)::int from public.tools_releves_plans where entreprise_id = 'e0000000-0000-0000-0000-000000000001'), 2,
  'G2. tenant R : plan initial figé + plan corrigé avant purge');
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = 'e0000000-0000-0000-0000-000000000001';
select set_config('rgpd.entreprise_cible', 'e0000000-0000-0000-0000-000000000001', true);
select set_config('rgpd.run_id', 'd5f00000-0000-0000-0000-00000000000e', true);
\ir fixtures/rgpd_purge_driver.inc
reset role;
select is(current_setting('rgpd.resultat') || '|' ||
  ((select count(*) from public.tools_releves_plans where entreprise_id = 'e0000000-0000-0000-0000-000000000001')
   + (select count(*) from public.tools_releves_elements where entreprise_id = 'e0000000-0000-0000-0000-000000000001'))::text
   || '|' || (select count(*) from public.tools_releves_plans where releve_id = 'd5000000-0000-0000-0000-000000000001')::text,
  'complete|0|5', 'G3. purge RGPD réelle : plans (figé compris), murs supprimés ; tenant A intact');

select * from finish();
rollback;
