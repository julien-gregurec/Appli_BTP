-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — RECOVERY V2
--
-- Qualifie la migration 20260927000603_tools_releve_metre_select_policy_ligne : les écritures
-- telles que PostgREST les émet (`INSERT/UPDATE … RETURNING`, `Prefer: return=representation`,
-- utilisé par supabase-js `.insert().select()`), que les suites 601/602 n'exerçaient pas.
--   R1–R6   métreur / admin : création, mise à jour, suppression douce, partage, filles — avec RETURNING ;
--   R7–R10  refus inchangés avec RETURNING : consultation, autre tenant, Tools Pro sans add-on, anon ;
--   R11–R12 parité : la décision par ligne = la décision par identifiant, pour chaque acteur × projet ;
--   C1–C9   migration 20260927000604 : contrat des éléments complété de façon additive.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'tools', 'tools_pro', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003',
                  '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006']::uuid[]) u;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
  values ('10000000-0000-0000-0000-000000000004', 'tools', 'pro', public.tools_capabilities_pro(), 'web');

set local role authenticated;

-- ── Métreur A ─────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
with ins as (
     insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
     values ('c7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Projet métreur', 'Site')
     returning id, proprietaire_id, visibilite)
select is(
  (select id::text || '|' || proprietaire_id::text || '|' || visibilite from ins),
  'c7000000-0000-0000-0000-000000000001|10000000-0000-0000-0000-000000000003|prive',
  'R1. métreur : INSERT … RETURNING d''un projet relevé (chemin PostgREST « Nouveau relevé »)');
with up as (
     update public.tools_releves set nom = 'Projet métreur (renommé)'
     where id = 'c7000000-0000-0000-0000-000000000001' and revision = 1 returning nom, revision)
select is(
  (select nom || '|' || revision from up),
  'Projet métreur (renommé)|2',
  'R2. métreur : UPDATE … RETURNING avec contrôle de révision');
with ins as (
     insert into public.tools_releves_chantiers(releve_id, nom) values ('c7000000-0000-0000-0000-000000000001', 'Chantier Est')
     returning entreprise_id)
select is(
  (select entreprise_id::text from ins),
  'a0000000-0000-0000-0000-000000000001',
  'R3. métreur : INSERT … RETURNING d''un chantier (tenant déduit, ligne relue)');
with up as (
     update public.tools_releves set visibilite = 'entreprise'
     where id = 'c7000000-0000-0000-0000-000000000001' returning visibilite)
select is(
  (select visibilite from up),
  'entreprise',
  'R4. métreur propriétaire : partage avec RETURNING');

-- ── Admin Relevé A ────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
with ins as (
     insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
     values ('c7000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Projet admin', 'Site')
     returning id)
select is(
  (select count(*)::int from ins),
  1, 'R5. admin Relevé : INSERT … RETURNING');
with up as (
     update public.tools_releves set deleted_at = now()
     where id = 'c7000000-0000-0000-0000-000000000002' returning deleted_at is not null as supprime)
select is(
  (select supprime from up),
  true, 'R6. admin Relevé : suppression douce avec RETURNING (ligne supprimée encore lisible par l''admin)');

-- ── Refus inchangés ───────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom)
    values ('a0000000-0000-0000-0000-000000000001', 'Pirate', 'Site') returning id$$,
  '42501', null, 'R7. consultation : création refusée, avec ou sans RETURNING');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom)
    values ('a0000000-0000-0000-0000-000000000001', 'Intrus', 'Site') returning id$$,
  '42501', null, 'R8. admin d''un autre tenant : création dans A refusée avec RETURNING');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom)
    values ('a0000000-0000-0000-0000-000000000001', 'Sans add-on', 'Site') returning id$$,
  '42501', null, 'R9. Tools Pro sans releve-metre : création refusée avec RETURNING');
reset role;
select ok(
  not has_function_privilege('anon', 'public.tools_releve_peut_ligne(uuid,uuid,text,boolean,text)', 'execute')
  and has_function_privilege('authenticated', 'public.tools_releve_peut_ligne(uuid,uuid,text,boolean,text)', 'execute'),
  'R10. tools_releve_peut_ligne : exécutable par authenticated seulement (pas anon)');

-- ── Parité ligne ↔ identifiant ────────────────────────────────
insert into public.tools_releves(id, entreprise_id, proprietaire_id, nom, chantier_nom) values
  ('c7000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'Projet B', 'Site');
create temporary table _parite (acteur uuid, releve uuid, action text, par_id boolean, par_ligne boolean) on commit drop;
grant all on _parite to authenticated;
do $$
declare v_acteur uuid; v_r record; v_action text;
begin
  foreach v_acteur in array array['10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000006',
                                  '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004',
                                  '20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002']::uuid[] loop
    perform set_config('request.jwt.claim.sub', v_acteur::text, true);
    for v_r in select id, entreprise_id, proprietaire_id, visibilite, deleted_at is not null as supprime from public.tools_releves loop
      foreach v_action in array array['view','edit','export','delete','share','sync-gp','create'] loop
        insert into _parite values (v_acteur, v_r.id, v_action,
          public.tools_releve_peut(v_r.id, v_action),
          public.tools_releve_peut_ligne(v_r.entreprise_id, v_r.proprietaire_id, v_r.visibilite, v_r.supprime, v_action));
      end loop;
    end loop;
  end loop;
end $$;
select is((select count(*)::int from _parite where par_id is distinct from par_ligne), 0,
  'R11. parité : décision par ligne = décision par identifiant (6 acteurs × 3 projets × 7 actions)');
select ok((select count(*) from _parite where par_ligne) > 0 and (select count(*) from _parite where not par_ligne) > 0,
  'R12. parité non triviale : la matrice contient des accords ET des refus');

-- ── Contrat des éléments (604) ────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('c7100000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('c7200000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'c7100000-0000-0000-0000-000000000001', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage) values
  ('c7300000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'Cuisine', 'cuisine'),
  ('c7300000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'Séjour', 'sejour');
select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
    ('c7400000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'mur', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
     '{"a":{"x":0,"y":0},"b":{"x":3000,"y":0},"epaisseurMm":100,"hauteurMm":2500,"typeMur":"cloison"}'),
    ('c7400000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'mesure', null, null,
     '{"cible":{"kind":"piece","id":"c7300000-0000-0000-0000-000000000001"},"typeMesure":"surface","valeur":12000000,"unite":"mm2","source":"laser","precisionMm":2,"priseLe":"2026-09-27T08:00:00Z"}'),
    ('c7400000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', 'annotation', null, null,
     '{"ancre":{"kind":"entite","ref":{"kind":"piece","id":"c7300000-0000-0000-0000-000000000001"}},"texte":"Fissure","mediaAudioId":null}')
$$, 'C1. rétro-compatibilité : les charges du contrat 601 restent acceptées');
select lives_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, piece_id, donnees) values
    ('c7000000-0000-0000-0000-000000000001', 'mur', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
     '{"a":{"x":0,"y":0},"b":{"x":0,"y":4000},"epaisseurMm":100,"hauteurMm":2500,"typeMur":"cloison","piecesAdjacentesIds":["c7300000-0000-0000-0000-000000000002"],"materiauId":null}')
$$, 'C2. mur mitoyen : pièces adjacentes et matériau facultatifs');
select lives_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, parent_element_id, donnees) values
    ('c7000000-0000-0000-0000-000000000001', 'ouverture', 'c7200000-0000-0000-0000-000000000001', 'c7400000-0000-0000-0000-000000000001',
     '{"decalageMm":500,"largeurMm":2400,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"baie","sens":"coulissant","metadata":{"vitrage":"double","menuiserie":"alu"}}')
$$, 'C3. ouverture : metadata objet');
select lives_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
    ('c7000000-0000-0000-0000-000000000001', 'mesure',
     '{"cible":{"kind":"piece","id":"c7300000-0000-0000-0000-000000000001"},"typeMesure":"volume","valeur":30000000000,"unite":"mm3","source":"calcule","precisionMm":null,"priseLe":"2026-09-27T08:00:00Z"}'),
    ('c7000000-0000-0000-0000-000000000001', 'mesure',
     '{"cible":{"kind":"piece","id":"c7300000-0000-0000-0000-000000000001"},"typeMesure":"largeur","valeur":3000,"unite":"mm","source":"manuel","precisionMm":null,"priseLe":"2026-09-27T08:00:00Z"}'),
    ('c7000000-0000-0000-0000-000000000001', 'mesure',
     '{"cible":{"kind":"piece","id":"c7300000-0000-0000-0000-000000000001"},"typeMesure":"distance","valeur":5100,"unite":"mm","source":"laser","precisionMm":1,"priseLe":"2026-09-27T08:00:00Z"}')
$$, 'C4. mesures : volume (mm3, calculée), largeur, distance libre');
select lives_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values
    ('c7000000-0000-0000-0000-000000000001', 'annotation',
     '{"ancre":{"kind":"point","etageId":"c7200000-0000-0000-0000-000000000001","point":{"x":10,"y":10}},"texte":"","forme":"fleche","geometrie":{"points":[{"x":0,"y":0},{"x":500,"y":0}]},"mediaAudioId":null}'),
    ('c7000000-0000-0000-0000-000000000001', 'materiau',
     '{"libelle":"Faïence 20x20","categorie":"mur","unite":"m2","pertePourcent":8,"gpPrestationRef":null,"revetement":"faience"}'),
    ('c7000000-0000-0000-0000-000000000001', 'quantite',
     '{"cle":"faience","libelle":"Faïence","valeur":6.2,"unite":"m2","formule":"perimetre*hauteur","qualite":"estimee","materiauId":null,"sources":[{"kind":"element","id":"c7400000-0000-0000-0000-000000000001"}],"gpOuvrageRef":null}')
$$, 'C5. annotation en flèche, revêtement typé, quantité avec sources');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values ('c7000000-0000-0000-0000-000000000001', 'annotation',
    '{"ancre":{"kind":"entite","ref":{"kind":"piece","id":"c7300000-0000-0000-0000-000000000001"}},"texte":" ","forme":"commentaire","mediaAudioId":null}')
$$, '23514', null, 'C6. un commentaire sans texte reste refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, donnees) values ('c7000000-0000-0000-0000-000000000001', 'materiau',
    '{"libelle":"X","categorie":"sol","unite":"m2","pertePourcent":0,"gpPrestationRef":null,"revetement":"marbre-rose"}')
$$, '23514', null, 'C7. revêtement hors liste refusé');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, parent_element_id, donnees) values
    ('c7000000-0000-0000-0000-000000000001', 'ouverture', 'c7200000-0000-0000-0000-000000000001', 'c7400000-0000-0000-0000-000000000001',
     '{"decalageMm":0,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche","metadata":"double"}')
$$, '23514', null, 'C8. metadata non objet refusée');
select throws_ok($$
  insert into public.tools_releves_elements(releve_id, type, etage_id, donnees) values
    ('c7000000-0000-0000-0000-000000000001', 'mur', 'c7200000-0000-0000-0000-000000000001',
     '{"a":{"x":0,"y":0},"b":{"x":1,"y":0},"epaisseurMm":100,"typeMur":"cloison","piecesAdjacentesIds":["pas-un-uuid"]}')
$$, '23514', null, 'C9. pièces adjacentes : UUID exigés');
reset role;

select * from finish();
rollback;
