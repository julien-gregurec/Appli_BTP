-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 7 — MOBILIER, ÉQUIPEMENTS & CALQUES (migration 20260928001101)
--
-- Qualifie sous RLS réelle :
--   S1–S6   schéma et droits : contrôles, corbeille, contrainte « éléments de plan », droits anon / authenticated ;
--   C1–C3   contrat générique : nouvelles catégories admises, équipement du Lot 2 toujours valide, catégorie inconnue refusée ;
--   E1–E13  objets de plan : création, relecture de tous les attributs, déplacement / rotation / redimensionnement,
--           pièce, refus motivés (catégorie, objet, dimensions, rotation, niveau, libellé, état projeté,
--           pièce d'un autre étage), lot atomique (révision inchangée) ;
--   W1–W4   liaison au mur : mur actif accepté, mur absent refusé, mur supprimé sans détacher refusé, supprimé en
--           détachant accepté ;
--   K1–K4   verrou : objet verrouillé ni modifiable ni supprimable, déverrouillage puis modification ;
--   R1–R4   suppression douce et restauration (corbeille, ré-envoi) ; « tout supprimer » d'un groupe ;
--   V1–V8   versioning : empreinte (clé absente sans objet), gel, plan figé immuable (RPC, écriture directe),
--           plan dérivé (copie, lignée, mur relié à la copie), dérivé modifié sans toucher au figé, plan projeté
--           (existant / à déposer / nouveau / déplacé) ;
--   F1      fiche pièce : compteur réel des équipements d'une pièce (lecture sous RLS) ;
--   T1–T6   isolation : consultation, autre tenant (lecture, écriture, corbeille), anonyme.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

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
create function pg_temp.obj(id text, objet text, categorie text, x int, y int, extra jsonb default '{}'::jsonb, piece text default null) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'pieceId', piece, 'donnees', jsonb_build_object('categorie', categorie, 'objet', objet, 'libelle', initcap(objet),
    'position', jsonb_build_object('x', x, 'y', y), 'rotationRad', 0, 'largeurMm', 800, 'profondeurMm', 600, 'hauteurMm', 750,
    'niveauMm', 0, 'visible', true, 'verrouille', false, 'pieceAuto', true) || extra) $$;
grant execute on function pg_temp.obj(text, text, text, int, int, jsonb, text) to authenticated, service_role;
create function pg_temp.rev(p text) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p::uuid $$;
grant execute on function pg_temp.rev(text) to authenticated, service_role;
create function pg_temp.save(p text, mods jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_enregistrer(p::uuid, pg_temp.rev(p), mods) $$;
grant execute on function pg_temp.save(text, jsonb) to authenticated, service_role;
create function pg_temp.don(p text) returns jsonb language sql security definer as $$
  select donnees from public.tools_releves_elements where id = p::uuid $$;
grant execute on function pg_temp.don(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select has_function('public', 'tools_releve_plan_equipement_anomalie', array['jsonb'], 'S1. contrôle d''un objet de plan');
select has_function('public', 'tools_releve_plan_equipements_supprimes', array['uuid'], 'S2. corbeille des objets d''un plan');
select ok((select pg_get_constraintdef(oid) like '%equipement%' from pg_constraint where conname = 'tools_releves_elements_plan_type'),
  'S3. un équipement peut appartenir à un plan');
select ok(not has_function_privilege('anon', 'public.tools_releve_plan_equipements_supprimes(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_plan_equipements_supprimes(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_plan_equipement_anomalie(jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_plan_enregistrer(uuid, bigint, jsonb)', 'EXECUTE'),
  'S4. droits : rien pour anonyme, corbeille pour authentifiés');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('tools_releve_plan_enregistrer','tools_releve_plan_creer','tools_releve_plan_equipements_supprimes')),
  'S5. RPC SECURITY DEFINER (contrôle explicite des droits)');
select is(public.tools_releve_plan_equipement_anomalie(pg_temp.obj('d7800000-0000-0000-0000-000000000000', 'wc', 'sanitaire', 0, 0)->'donnees'), null,
  'S6. un objet complet est valide');

-- ─────────────────────────────────────────────────────────────
-- C. Contrat générique des éléments
-- ─────────────────────────────────────────────────────────────
select ok(public.tools_releve_element_donnees_valides('equipement', '{"categorie":"sanitaire","position":{"x":0,"y":0},"libelle":"WC"}')
          and public.tools_releve_element_donnees_valides('equipement', '{"categorie":"securite","position":{"x":0,"y":0},"libelle":"Extincteur"}'),
  'C1. nouvelles catégories admises');
select ok(public.tools_releve_element_donnees_valides('equipement', '{"categorie":"eclairage","position":{"x":0,"y":0},"libelle":"Spot","rotationRad":0,"largeurMm":null,"profondeurMm":null,"hauteurMm":null}'),
  'C2. équipement du Lot 2 toujours valide');
select ok(not public.tools_releve_element_donnees_valides('equipement', '{"categorie":"jardin","position":{"x":0,"y":0},"libelle":"Arbre"}'),
  'C3. catégorie inconnue refusée');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur 10…03 (tenant A), un étage, deux pièces, plan initial, pièce 4 × 3 m.
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('d7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 7', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'd7000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('d7300000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'RDC', 0),
  ('d7300000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'R+1', 1);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage) values
  ('d7500000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd7300000-0000-0000-0000-000000000001', 'Salle d''eau', 'salle_de_bain'),
  ('d7500000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd7300000-0000-0000-0000-000000000001', 'Bureau', 'bureau'),
  ('d7500000-0000-0000-0000-000000000003', 'd7000000-0000-0000-0000-000000000001', 'd7300000-0000-0000-0000-000000000002', 'Chambre', 'chambre');
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('d7300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role, anon;
select pg_temp.save((select id::text from _p), jsonb_build_object('murs', jsonb_build_array(
  pg_temp.mur('d7600000-0000-0000-0000-000000000001', 0, 0, 4000, 0), pg_temp.mur('d7600000-0000-0000-0000-000000000002', 4000, 0, 4000, 3000),
  pg_temp.mur('d7600000-0000-0000-0000-000000000003', 4000, 3000, 0, 3000), pg_temp.mur('d7600000-0000-0000-0000-000000000004', 0, 3000, 0, 0))));

-- ─────────────────────────────────────────────────────────────
-- E. Objets de plan
-- ─────────────────────────────────────────────────────────────
select is((pg_temp.save((select id::text from _p), jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000001', 'wc', 'sanitaire', 500, 400, '{"commentaire":"Suspendu","niveauMm":0}', 'd7500000-0000-0000-0000-000000000001'),
    pg_temp.obj('d7800000-0000-0000-0000-000000000002', 'lavabo', 'sanitaire', 1500, 300, '{}', 'd7500000-0000-0000-0000-000000000001'),
    pg_temp.obj('d7800000-0000-0000-0000-000000000003', 'bureau', 'mobilier', 2500, 1500, '{}', 'd7500000-0000-0000-0000-000000000002'))))->>'equipements')::int, 3,
  'E1. trois objets créés en un lot');
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _p) and type = 'equipement' and deleted_at is null), 3,
  'E2. objets rattachés au plan');
select is((select donnees->>'objet' || '|' || (donnees->>'libelle') || '|' || (donnees->>'commentaire') || '|' || (donnees->>'niveauMm') || '|' || (donnees->>'largeurMm') || '|' || (donnees->>'profondeurMm') || '|' || (donnees->>'hauteurMm') || '|' || (donnees->>'visible') || '|' || (donnees->>'verrouille')
           from public.tools_releves_elements where id = 'd7800000-0000-0000-0000-000000000001'),
  'wc|Wc|Suspendu|0|800|600|750|true|false', 'E3. tous les attributs relus à l''identique');
select is((select piece_id::text || '|' || etage_id::text from public.tools_releves_elements where id = 'd7800000-0000-0000-0000-000000000001'),
  'd7500000-0000-0000-0000-000000000001|d7300000-0000-0000-0000-000000000001', 'E4. pièce et étage (niveau) du plan');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000003', 'bureau', 'mobilier', 2600, 1600, '{"rotationRad":1.5708,"largeurMm":1600,"profondeurMm":800}', 'd7500000-0000-0000-0000-000000000002')))) $$, (select id from _p)),
  'E5. objet déplacé, tourné, redimensionné');
select is((select (donnees->'position'->>'x') || '|' || (donnees->>'rotationRad') || '|' || (donnees->>'largeurMm') from public.tools_releves_elements where id = 'd7800000-0000-0000-0000-000000000003'),
  '2600|1.5708|1600', 'E6. nouvelle position, rotation et largeur');
create temporary table _rev on commit drop as select pg_temp.rev((select id::text from _p)) as r;
grant select on _rev to authenticated;
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'arbre', 'mobilier', 0, 0)))) $$, (select id from _p)),
  '22023', 'Type d''objet inconnu.', 'E7. objet hors catalogue refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'wc', 'jardin', 0, 0)))) $$, (select id from _p)),
  '22023', 'Catégorie d''objet inconnue.', 'E8. catégorie inconnue refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'wc', 'sanitaire', 0, 0, '{"largeurMm":0}')))) $$, (select id from _p)),
  '22023', 'Dimensions de l''objet invalides : largeur et profondeur positives.', 'E9. largeur nulle refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'wc', 'sanitaire', 0, 0, '{"rotationRad":9}')))) $$, (select id from _p)),
  '22023', 'Rotation de l''objet invalide.', 'E10. rotation hors bornes refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'prise', 'electricite', 0, 0, '{"niveauMm":-10}')))) $$, (select id from _p)),
  '22023', 'Niveau de pose invalide (0 à 20 m).', 'E11. niveau négatif refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'prise', 'electricite', 0, 0, '{"libelle":" "}')))) $$, (select id from _p)),
  '22023', 'Un objet porte un libellé (200 caractères au plus).', 'E12. libellé vide refusé');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'lit', 'mobilier', 0, 0, '{}', 'd7500000-0000-0000-0000-000000000003')))) $$, (select id from _p)),
  '42501', 'Pièce absente de l''étage du plan.', 'E13. pièce d''un autre étage refusée');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-00000000000a', 'chaise', 'mobilier', 0, 0),
    pg_temp.obj('d7800000-0000-0000-0000-000000000009', 'chaise', 'mobilier', 0, 0, '{"etatProjet":"futur"}')))) $$, (select id from _p)),
  '22023', 'État projeté inconnu.', 'E14. état projeté inconnu refusé');
select ok(pg_temp.rev((select id::text from _p)) = (select r from _rev)
          and not exists (select 1 from public.tools_releves_elements where id = 'd7800000-0000-0000-0000-00000000000a'),
  'E15. lot refusé : rien d''écrit, révision inchangée');

-- ─────────────────────────────────────────────────────────────
-- W. Liaison au mur (radiateur, prise…)
-- ─────────────────────────────────────────────────────────────
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000004', 'radiateur', 'cvc', 2000, 200, '{"murId":"d7600000-0000-0000-0000-000000000001","face":"gauche","decalageMm":2000,"niveauMm":150}')))) $$, (select id from _p)),
  'W1. radiateur lié à un mur actif du plan');
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000005', 'prise', 'electricite', 100, 100, '{"murId":"d7600000-0000-0000-0000-0000000000ff","face":"gauche","decalageMm":100}')))) $$, (select id from _p)),
  '22023', 'L''objet est lié à un mur absent du plan.', 'W2. mur absent refusé');
select throws_ok(format($$ select pg_temp.save(%L, '{"supprimes":["d7600000-0000-0000-0000-000000000001"]}'::jsonb) $$, (select id from _p)),
  '22023', 'L''objet est lié à un mur absent du plan.', 'W3. supprimer le mur sans détacher le radiateur : refusé');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('supprimes', jsonb_build_array('d7600000-0000-0000-0000-000000000001'),
    'equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000004', 'radiateur', 'cvc', 2000, 200, '{"murId":null,"niveauMm":150}')))) $$, (select id from _p)),
  'W4. mur supprimé et radiateur détaché dans le même lot : accepté');
-- Le mur revient (restauration) et le radiateur y est relié de nouveau, pour la suite.
select pg_temp.save((select id::text from _p), jsonb_build_object('murs', jsonb_build_array(pg_temp.mur('d7600000-0000-0000-0000-000000000001', 0, 0, 4000, 0)),
  'equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000004', 'radiateur', 'cvc', 2000, 200, '{"murId":"d7600000-0000-0000-0000-000000000001","face":"gauche","decalageMm":2000,"niveauMm":150}'))));

-- ─────────────────────────────────────────────────────────────
-- K. Verrou
-- ─────────────────────────────────────────────────────────────
select pg_temp.save((select id::text from _p), jsonb_build_object('equipements', jsonb_build_array(
  pg_temp.obj('d7800000-0000-0000-0000-000000000002', 'lavabo', 'sanitaire', 1500, 300, '{"verrouille":true}', 'd7500000-0000-0000-0000-000000000001'))));
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000002', 'lavabo', 'sanitaire', 1700, 300, '{"verrouille":true}', 'd7500000-0000-0000-0000-000000000001')))) $$, (select id from _p)),
  '22023', 'Objet verrouillé : déverrouillez-le d''abord.', 'K1. objet verrouillé : déplacement refusé');
select throws_ok(format($$ select pg_temp.save(%L, '{"supprimes":["d7800000-0000-0000-0000-000000000002"]}'::jsonb) $$, (select id from _p)),
  '22023', 'Objet verrouillé : déverrouillez-le d''abord.', 'K2. objet verrouillé : suppression refusée');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000002', 'lavabo', 'sanitaire', 1500, 300, '{"verrouille":false}', 'd7500000-0000-0000-0000-000000000001')))) $$, (select id from _p)),
  'K3. déverrouillage accepté');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('d7800000-0000-0000-0000-000000000002', 'lavabo', 'sanitaire', 1700, 300, '{}', 'd7500000-0000-0000-0000-000000000001')))) $$, (select id from _p)),
  'K4. objet déverrouillé : déplacement accepté');

-- ─────────────────────────────────────────────────────────────
-- R. Suppression douce, corbeille, restauration, « tout supprimer » d'un groupe
-- ─────────────────────────────────────────────────────────────
select pg_temp.save((select id::text from _p), '{"supprimes":["d7800000-0000-0000-0000-000000000001","d7800000-0000-0000-0000-000000000002"]}'::jsonb);
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _p) and type = 'equipement' and deleted_at is not null), 2,
  'R1. groupe « sanitaire » supprimé (suppression douce, lignes conservées)');
select is((select array_agg(id::text order by id) from public.tools_releve_plan_equipements_supprimes((select id from _p))),
  array['d7800000-0000-0000-0000-000000000001','d7800000-0000-0000-0000-000000000002'], 'R2. corbeille : les deux objets supprimés');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(
    jsonb_build_object('id', 'd7800000-0000-0000-0000-000000000001', 'pieceId', 'd7500000-0000-0000-0000-000000000001', 'donnees', pg_temp.don('d7800000-0000-0000-0000-000000000001'))))) $$, (select id from _p)),
  'R3. restauration par ré-envoi');
select ok((select deleted_at is null from public.tools_releves_elements where id = 'd7800000-0000-0000-0000-000000000001')
          and (select count(*) from public.tools_releve_plan_equipements_supprimes((select id from _p))) = 1,
  'R4. objet restauré, corbeille à jour');

-- ─────────────────────────────────────────────────────────────
-- F. Fiche pièce : compteur réel
-- ─────────────────────────────────────────────────────────────
select is((select count(*)::int from public.tools_releves_elements where piece_id = 'd7500000-0000-0000-0000-000000000001' and type = 'equipement' and deleted_at is null), 1,
  'F1. salle d''eau : 1 équipement actif (WC restauré ; lavabo à la corbeille)');

-- ─────────────────────────────────────────────────────────────
-- V. Versioning
-- ─────────────────────────────────────────────────────────────
create temporary table _vide on commit drop as select * from public.tools_releve_plan_creer('d7300000-0000-0000-0000-000000000002', 'initial');
create temporary table _f on commit drop as select * from public.tools_releve_plan_figer((select id from _p), pg_temp.rev((select id::text from _p)), 'Existant');
-- Contenu canonique : fonction interne (non exécutable par `authenticated`), lue par le propriétaire.
reset role;
select ok(public.tools_releve_plan_contenu((select id from _p)) ? 'equipements', 'V1. les objets entrent dans l''empreinte du plan');
select ok(not (public.tools_releve_plan_contenu((select id from _vide)) ? 'equipements'), 'V2. plan sans objet : contenu inchangé (empreintes antérieures recalculables)');
select ok((select fige_le is not null
           and empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(id)::text, 'UTF8'), 'sha256'), 'hex') from _f),
  'V3. plan INITIAL figé avec ses objets (empreinte recalculable)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000003', 'bureau', 'mobilier', 0, 0)))) $$, (select id from _p)),
  '42501', null, 'V4. plan figé : objet non modifiable (RPC)');
select throws_ok($$ update public.tools_releves_elements set donnees = donnees || '{"visible":false}' where id = 'd7800000-0000-0000-0000-000000000003' $$,
  '42501', null, 'V5. plan figé : objet non modifiable (écriture directe)');
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('d7300000-0000-0000-0000-000000000001', 'projete');
grant select on _c to authenticated, service_role, anon;
select is((select (e.donnees->>'origineId') || '|' || (m.donnees->>'origineId')
           from public.tools_releves_elements e join public.tools_releves_elements m on m.id::text = e.donnees->>'murId'
           where e.plan_id = (select id from _c) and e.donnees->>'objet' = 'radiateur'),
  'd7800000-0000-0000-0000-000000000004|d7600000-0000-0000-0000-000000000001', 'V6. plan PROJETÉ dérivé : objets copiés, lignée, liaison reportée sur la copie du mur');
select lives_ok(format($$ select pg_temp.save(%L, jsonb_build_object('equipements', (
    select jsonb_agg(jsonb_build_object('id', x.id, 'pieceId', x.piece_id, 'donnees', x.donnees || jsonb_build_object('etatProjet',
      case x.donnees->>'objet' when 'wc' then 'a_deposer' when 'bureau' then 'deplace' else 'existant' end)
      || case when x.donnees->>'objet' = 'bureau' then '{"position":{"x":1000,"y":2000}}'::jsonb else '{}'::jsonb end))
    from public.tools_releves_elements x where x.plan_id = %L and x.type = 'equipement' and x.deleted_at is null)
    || jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-000000000006', 'douche', 'sanitaire', 3200, 600, '{"etatProjet":"nouveau"}')))) $$, (select id from _c), (select id from _c)),
  'V7. plan projeté : existant / à déposer / déplacé / nouveau');
select is((select string_agg((donnees->>'objet') || ':' || (donnees->>'etatProjet'), ',' order by donnees->>'objet') from public.tools_releves_elements where plan_id = (select id from _c) and type = 'equipement')
          || ' / ' || (select (donnees->'position'->>'x') from public.tools_releves_elements where id = 'd7800000-0000-0000-0000-000000000003'),
  'bureau:deplace,douche:nouveau,radiateur:existant,wc:a_deposer / 2600', 'V8. états projetés relus ; objet du plan figé intact');

-- ─────────────────────────────────────────────────────────────
-- T. Isolation
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select ok((select count(*) from public.tools_releves_elements where plan_id = (select id from _c) and type = 'equipement') = 4
          and (select count(*) from public.tools_releve_plan_equipements_supprimes((select id from _p))) = 1,
  'T1. consultation : objets et corbeille lisibles');
select throws_ok(format($$ select pg_temp.save(%L, '{"equipements":[]}'::jsonb) $$, (select id from _c)),
  '42501', null, 'T2. consultation : aucun enregistrement');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_elements where releve_id = 'd7000000-0000-0000-0000-000000000001' and type = 'equipement'), 0,
  'T3. autre tenant : aucun objet visible');
select throws_ok(format($$ select public.tools_releve_plan_enregistrer(%L, 1, jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('d7800000-0000-0000-0000-00000000000b', 'wc', 'sanitaire', 0, 0)))) $$, (select id from _c)),
  '42501', null, 'T4. autre tenant : enregistrement refusé');
select throws_ok(format($$ select * from public.tools_releve_plan_equipements_supprimes(%L) $$, (select id from _p)),
  '42501', null, 'T5. autre tenant : corbeille refusée');
reset role;
set local role anon;
select throws_ok(format($$ select * from public.tools_releve_plan_equipements_supprimes(%L) $$, (select id from _p)),
  '42501', null, 'T6. anonyme : corbeille interdite');
reset role;

select * from finish();
rollback;
