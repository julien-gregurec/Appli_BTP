-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 10 (complément) — COEFFICIENTS, HYPOTHÈSES, OBSOLESCENCE SUR QUANTITÉ
-- (migration 20261002001115)
--
-- Qualifie sous RLS réelle, avec des VALEURS EXACTES :
--   S1–S8   schéma et droits : table en lecture seule, RPC SECURITY DEFINER, lecture interne non exposée, fonctions
--           pures IMMUTABLE, garde « mode sûr » sur TOUTES les tables du Lot 10, aucune notion commerciale ;
--   C1–C6   contrat des paramètres (coefficient général, coefficients par lot, hypothèses ; marge, remise, TVA,
--           acompte, conditions commerciales refusés) ; lot d'un ouvrage (19 catégories, blancs JS) ;
--   R1–R4   priorité des coefficients : ouvrage > lot > général > 1, sans cumul ;
--   P2      PARITÉ avec le miroir TypeScript (packages/releve-domain/src/estimation-parite-coefficients.fixture.json) ;
--   F1–F10  parcours réel : paramètres du relevé, montants exacts, révision concurrente, journal, refus ;
--   A1–A7   traçabilité : valeur source figée, obsolescence sur QUANTITÉ (même sans prix), sur montant, retrait ;
--   V1–V4   gel (paramètres figés avec le plan), plan dérivé recalculé avec les paramètres courants ;
--   T1–T4   isolation (consultation, autre tenant, anonyme) ; G1–G2 mode sûr (lecture seule tools).
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

\ir fixtures/isolation_multitenant.inc
\set parite2 `cat ../../packages/releve-domain/src/estimation-parite-coefficients.fixture.json`

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

-- Ouvrage « saisie » (quantité saisie, ligne d'étage) : quantité pilotée par le test.
create function pg_temp.o(extra jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('nom', 'Ouvrage', 'categorie', 'autre', 'unite', 'u', 'regle', jsonb_build_object('source', 'saisie', 'valeur', 1),
    'pertePourcent', 0, 'arrondi', jsonb_build_object('mode', 'aucun'), 'etatTravaux', 'nouveau', 'etats', jsonb_build_array('nouveau')) || extra $$;
grant execute on function pg_temp.o(jsonb) to authenticated, service_role;
create function pg_temp.e(p text) returns jsonb language sql as $$ select public.tools_releve_plan_estimation(p::uuid)->'estimation' $$;
grant execute on function pg_temp.e(text) to authenticated, service_role;
-- Étiquette stable d'un ouvrage (par son nom : les identifiants changent dans un plan dérivé).
create function pg_temp.k(ouvrage text) returns text language sql as $$
  select case o.donnees->>'nom' when 'Peinture' then '1' when 'Cloison' then '2' when 'Divers' then '3' when 'Évacuation' then '4' else '?' end
  from public.tools_releves_ouvrages o where o.id = ouvrage::uuid $$;
grant execute on function pg_temp.k(text) to authenticated, service_role;
-- « ouvrage=montantRetenu » (lignes de quantité) triés par ouvrage.
create function pg_temp.m(p text) returns text language sql as $$
  select string_agg(pg_temp.k(l->>'ouvrageId') || '=' || coalesce(l->>'montantRetenu', 'null'), ',' order by pg_temp.k(l->>'ouvrageId'))
  from jsonb_array_elements(pg_temp.e(p)->'lignes') l where l->>'nature' = 'quantite' $$;
grant execute on function pg_temp.m(text) to authenticated, service_role;
-- « ouvrage:source:coefficient » des prix.
create function pg_temp.c(p text) returns text language sql as $$
  select string_agg(pg_temp.k(x->>'ouvrageId') || ':' || (x->>'coefficientSource') || ':' || (x->>'coefficientApplique'), ',' order by pg_temp.k(x->>'ouvrageId'))
  from jsonb_array_elements(pg_temp.e(p)->'prix') x $$;
grant execute on function pg_temp.c(text) to authenticated, service_role;
create function pg_temp.aj(p text, ouvrage text) returns jsonb language sql as $$
  select l->'ajustement' from jsonb_array_elements(pg_temp.e(p)->'lignes') l where l->>'ouvrageId' = ouvrage and l->>'nature' = 'quantite' $$;
grant execute on function pg_temp.aj(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select ok(to_regclass('public.tools_releves_estimation_parametres') is not null
          and exists (select 1 from information_schema.columns where table_name = 'tools_releves_estimation_ajustements' and column_name = 'valeur_source'),
  'S1. table des paramètres d''estimation ; valeur source des corrections');
select ok(has_table_privilege('authenticated', 'public.tools_releves_estimation_parametres', 'SELECT')
          and not has_table_privilege('authenticated', 'public.tools_releves_estimation_parametres', 'INSERT')
          and not has_table_privilege('authenticated', 'public.tools_releves_estimation_parametres', 'UPDATE')
          and not has_table_privilege('anon', 'public.tools_releves_estimation_parametres', 'SELECT'),
  'S2. lecture seule pour les utilisateurs, écriture par RPC, rien pour anonyme');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('tools_releve_estimation_parametres','tools_releve_estimation_parametres_enregistrer'))
          and not has_function_privilege('authenticated', 'public.tools_releve_estimation_parametres_json(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_estimation_parametres(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_estimation_parametres_enregistrer(uuid, jsonb, bigint)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_estimation_prix_effectifs(jsonb, jsonb, jsonb)', 'EXECUTE'),
  'S3. RPC SECURITY DEFINER ; lecture interne non exposée ; anonyme : rien');
select ok((select bool_and(provolatile = 'i') from pg_proc where proname in ('tools_releve_estimation_prix_effectifs','tools_releve_ouvrage_lot',
          'tools_releve_estimation_parametres_anomalie','tools_releve_trim_js','tools_releve_estimation_evaluer')), 'S4. fonctions pures IMMUTABLE');
select is((select string_agg(c.relname, ',' order by c.relname) from pg_class c
           where c.relname in ('tools_releves_estimation_prix','tools_releves_bibliotheque_prix','tools_releves_estimation_ajustements','tools_releves_estimation_parametres')
             and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')),
  'tools_releves_bibliotheque_prix,tools_releves_estimation_ajustements,tools_releves_estimation_parametres,tools_releves_estimation_prix',
  'S5. mode sûr (V8) : garde d''écriture sur les 4 tables du Lot 10 (absente avant 1402)');
select is((select count(*)::int from pg_proc where proname like 'tools_releve%' and proname ~ '(devis|facture|commande|signature|acompte|marge|remise|tva)')
          + (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name like 'tools_releves%'
             and column_name ~* '(devis|facture|commande|signature|tva|marge|remise|acompte|condition|escompte|echeance)'), 0,
  'S6. aucune fonction ni colonne de devis, facture, commande, signature, TVA, marge, remise, acompte ou conditions commerciales');
select is((select public.tools_releve_estimation_evaluer('{"ouvrages":[{"id":"o","etatTravaux":"nouveau"}],"lignes":[{"ouvrageId":"o","pieceId":null,"etatProjet":"nouveau","unite":"u","quantiteRetenue":2}],"prix":[],"ajustements":[{"id":"a","ouvrageId":"o","pieceId":null,"etatProjet":"nouveau","valeurCalculee":null,"valeurRetenue":5,"raison":"x"}]}')->'lignes'->0->'ajustement'),
  '{"id": "a", "date": null, "raison": "x", "perime": false, "auteurId": null, "valeurRetenue": 5, "valeurCalculee": null}'::jsonb,
  'S7. moteur rétro-compatible : sans quantité source, sortie identique au 1401 (aucune clé ajoutée)');
select is((select count(*)::int from jsonb_array_elements((select public.tools_releve_estimation_evaluer('{"ouvrages":[{"id":"o","etatTravaux":"nouveau"}],"lignes":[{"ouvrageId":"o","pieceId":null,"etatProjet":"nouveau","unite":"u","quantiteRetenue":2}],"prix":[],"ajustements":[]}')->'lignes'))),
  1, 'S8. moteur : une ligne par quantité, inchangé');

-- ─────────────────────────────────────────────────────────────
-- C. Contrat des paramètres, lot d'un ouvrage
-- ─────────────────────────────────────────────────────────────
select is(concat_ws('|', public.tools_releve_estimation_parametres_anomalie('{}'), public.tools_releve_estimation_parametres_anomalie('{"coefficientGeneral":1.1,"coefficientsLots":{"Peinture":1.2},"hypotheses":"Site occupé"}'), 'ok'),
  'ok', 'C1. paramètres vides ou complets valides');
select is(concat_ws('|', public.tools_releve_estimation_parametres_anomalie('{"marge":10}'), public.tools_releve_estimation_parametres_anomalie('{"remise":5}'),
          public.tools_releve_estimation_parametres_anomalie('{"tva":20}'), public.tools_releve_estimation_parametres_anomalie('{"acompte":30}'),
          public.tools_releve_estimation_parametres_anomalie('{"conditionsCommerciales":"30 jours"}'), public.tools_releve_estimation_parametres_anomalie('{"numeroDevis":"D-1"}')),
  'cle|cle|cle|cle|cle|cle', 'C2. marge, remise, TVA, acompte, conditions commerciales, numéro de devis refusés');
select is(concat_ws('|', public.tools_releve_estimation_parametres_anomalie('{"coefficientGeneral":0}'), public.tools_releve_estimation_parametres_anomalie('{"coefficientGeneral":10.00001}'),
          public.tools_releve_estimation_parametres_anomalie('{"coefficientsLots":{" Peinture":1.2}}'), public.tools_releve_estimation_parametres_anomalie('{"coefficientsLots":{"Peinture":11}}'),
          public.tools_releve_estimation_parametres_anomalie('{"coefficientsLots":[]}'), public.tools_releve_estimation_parametres_anomalie(jsonb_build_object('hypotheses', repeat('x', 2001)))),
  'coefficient_general|coefficient_general|lot|coefficient_lot|coefficients_lots|hypotheses', 'C3. bornes : coefficients 0,01–10 (4 décimales), lot normalisé, hypothèses ≤ 2 000');
select is(public.tools_releve_estimation_parametres_message('cle'),
  'Donnée inconnue : l''estimation Tools n''a qu''un coefficient général, des coefficients par lot et des hypothèses (marge, remise, TVA, acompte et conditions commerciales relèvent de Gestion Pro).',
  'C4. message explicite : Gestion Pro décide du commercial');
select is((select string_agg(public.tools_releve_ouvrage_lot(jsonb_build_object('categorie', c)), '|' order by o)
           from unnest(array['cloisons','doublages','plafonds','sols','peinture','faience','carrelage','plinthes','profiles','portes','fenetres','sanitaires','mobilier','electricite','cvc','plomberie','demolition','depose','autre']) with ordinality t(c, o)),
  'Plâtrerie – cloisons|Plâtrerie – cloisons|Plafonds|Revêtements de sols|Peinture|Carrelage – faïence|Carrelage – faïence|Revêtements de sols|Menuiseries intérieures|Menuiseries intérieures|Menuiseries extérieures|Plomberie – sanitaires|Agencement – mobilier|Électricité|CVC|Plomberie – sanitaires|Démolition – dépose|Démolition – dépose|Divers',
  'C5. lot par catégorie (19 catégories, miroir OUVRAGE_LOT_PAR_CATEGORIE)');
select is(concat_ws('|', public.tools_releve_ouvrage_lot(jsonb_build_object('categorie', 'autre', 'lot', E' Lot A　')),
          public.tools_releve_ouvrage_lot(jsonb_build_object('categorie', 'cvc', 'lot', E'\t \n')), public.tools_releve_ouvrage_lot('{"categorie":"cvc","lot":12}')),
  'Lot A|CVC|CVC', 'C6. lot saisi : blancs retirés comme String.prototype.trim ; vide ou non textuel → lot de la catégorie');

-- ─────────────────────────────────────────────────────────────
-- R. Priorité des coefficients (fonction pure)
-- ─────────────────────────────────────────────────────────────
create temporary table _r on commit drop as select public.tools_releve_estimation_prix_effectifs(
  '[{"id":"o1","categorie":"peinture"},{"id":"o2","categorie":"cloisons"},{"id":"o3","categorie":"sols","lot":" Peinture\t"},{"id":"o4","categorie":"cvc"}]',
  '[{"ouvrageId":"o1","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}],"coefficient":0.9}},{"ouvrageId":"o2","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}]}},
    {"ouvrageId":"o3","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}],"coefficient":null}},{"ouvrageId":"o4","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}]}},
    {"ouvrageId":"o5","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}],"marge":3}}]',
  '{"coefficientGeneral":1.05,"coefficientsLots":{"Peinture":1.2,"Plâtrerie – cloisons":1.3}}') as r;
grant select on _r to authenticated, service_role;
select is((select string_agg((x->>'ouvrageId') || ':' || coalesce(x->>'coefficientSource', 'null') || ':' || coalesce(x->>'coefficientApplique', 'null'), ',') from _r, jsonb_array_elements(_r.r) x),
  'o1:ouvrage:0.9,o2:lot:1.3,o3:lot:1.2,o4:general:1.05,o5:null:null', 'R1. ouvrage > lot > général ; coefficient nul = hérité ; prix invalide transmis sans coefficient');
select is((select (x->'donnees'->>'coefficient') from _r, jsonb_array_elements(_r.r) x where x->>'ouvrageId' = 'o2'), '1.3', 'R2. coefficient injecté dans le prix effectif (moteur inchangé)');
select is((select public.tools_releve_estimation_prix_effectifs('[{"id":"o1","categorie":"peinture"}]', '[{"ouvrageId":"o1","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}]}}]', '{"coefficientGeneral":2,"marge":1}')->0->>'coefficientSource'),
  'aucun', 'R3. paramètres invalides ignorés (aucun coefficient appliqué)');
select is((select public.tools_releve_estimation_evaluer(jsonb_build_object('ouvrages', '[{"id":"o1","etatTravaux":"nouveau"}]'::jsonb,
            'lignes', '[{"ouvrageId":"o1","pieceId":null,"etatProjet":"nouveau","unite":"m2","quantiteRetenue":2}]'::jsonb,
            'prix', public.tools_releve_estimation_prix_effectifs('[{"id":"o1","categorie":"peinture"}]', '[{"ouvrageId":"o1","donnees":{"composantes":[{"type":"materiau","prixUnitaire":10}]}}]',
              '{"coefficientGeneral":1.05,"coefficientsLots":{"Peinture":1.2}}')))->'lignes'->0->>'montantCalcule'),
  '24.00', 'R4. aucun cumul : 2 m² × 10 € avec lot 1,2 et général 1,05 = 24,00 € (pas 25,20 €)');
select is((select count(*)::int from jsonb_array_elements((:'parite2')::jsonb->'cas') c
           where public.tools_releve_estimation_prix_effectifs(c->'entree'->'ouvrages', c->'entree'->'prix', c->'entree'->'parametres') is distinct from c->'attendu'->'prixEffectifs'
              or public.tools_releve_estimation_evaluer(jsonb_build_object('ouvrages', c->'entree'->'ouvrages', 'lignes', c->'entree'->'lignes', 'ajustements', c->'entree'->'ajustements',
                   'prix', public.tools_releve_estimation_prix_effectifs(c->'entree'->'ouvrages', c->'entree'->'prix', c->'entree'->'parametres'))) is distinct from c->'attendu'->'resultat'), 0,
  'P2. parité : le serveur reproduit exactement le jeu déterministe vérifié par le miroir TypeScript (coefficients, obsolescence)');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur (tenant A). Un étage, un plan, 4 ouvrages « saisie » (ligne d'étage).
--   1 Peinture (lot Peinture, 20 m², 10 €)        → coefficient du lot
--   2 Cloison (lot Plâtrerie, 10 m², 20 €, × 1)    → coefficient de l'ouvrage (1) : prime sur le lot et le général
--   3 Divers (lot Divers, 2 u, 50 €)               → coefficient général
--   4 Évacuation (lot « Lot A », 5 u, SANS prix)    → quantitatif seul
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('db000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 10 coefficients', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'db000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values ('db200000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('db300000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'db200000-0000-0000-0000-000000000001', 'RDC', 0);
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('db300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role, anon;
select public.tools_releve_ouvrages_importer((select id from _p), jsonb_build_array(
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000001', 'donnees', pg_temp.o('{"nom":"Peinture","categorie":"peinture","unite":"m2","regle":{"source":"saisie","valeur":20}}')),
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000002', 'donnees', pg_temp.o('{"nom":"Cloison","categorie":"cloisons","unite":"m2","regle":{"source":"saisie","valeur":10}}')),
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000003', 'donnees', pg_temp.o('{"nom":"Divers","regle":{"source":"saisie","valeur":2}}')),
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000004', 'donnees', pg_temp.o('{"nom":"Évacuation","lot":"Lot A","regle":{"source":"saisie","valeur":5}}'))));
select public.tools_releve_estimation_prix_importer((select id from _p), jsonb_build_array(
  jsonb_build_object('ouvrageId', 'dbb00000-0000-0000-0000-000000000001', 'donnees', '{"composantes":[{"type":"materiau","prixUnitaire":10}]}'::jsonb),
  jsonb_build_object('ouvrageId', 'dbb00000-0000-0000-0000-000000000002', 'donnees', '{"composantes":[{"type":"materiau","prixUnitaire":20}],"coefficient":1}'::jsonb),
  jsonb_build_object('ouvrageId', 'dbb00000-0000-0000-0000-000000000003', 'donnees', '{"composantes":[{"type":"autre","prixUnitaire":50}]}'::jsonb)));

-- ─────────────────────────────────────────────────────────────
-- F. Parcours réel : paramètres du relevé
-- ─────────────────────────────────────────────────────────────
select is(public.tools_releve_estimation_parametres('db000000-0000-0000-0000-000000000001'),
  '{"donnees": {}, "revision": 0, "priorite": ["ouvrage", "lot", "general"], "updatedAt": null, "updatedBy": null}'::jsonb, 'F1. aucun paramètre : révision 0, priorité explicite');
select is(pg_temp.m((select id::text from _p)) || ' / ' || pg_temp.c((select id::text from _p)), '1=200.00,2=200.00,3=100.00,4=null / 1:aucun:1,2:ouvrage:1,3:aucun:1',
  'F2. sans paramètres : montants inchangés (coefficient 1), ouvrage sans prix exploitable');
select is((public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001',
            '{"coefficientGeneral":1.1,"coefficientsLots":{"Peinture":1.2,"Plâtrerie – cloisons":1.5},"hypotheses":"Site occupé, accès par escalier"}', 0))->>'revision',
  '1', 'F3. paramètres enregistrés (révision lue 0 → 1)');
select is(pg_temp.m((select id::text from _p)) || ' / ' || pg_temp.c((select id::text from _p)), '1=240.00,2=200.00,3=110.00,4=null / 1:lot:1.2,2:ouvrage:1,3:general:1.1',
  'F4. peinture × 1,2 (lot) = 240,00 ; cloison × 1 (ouvrage, prime sur le lot 1,5 et le général) = 200,00 ; divers × 1,1 (général) = 110,00');
select is((select (pg_temp.e((select id::text from _p))->'parametres'->'donnees') || jsonb_build_object('revision', pg_temp.e((select id::text from _p))->'parametres'->'revision')),
  '{"revision": 1, "hypotheses": "Site occupé, accès par escalier", "coefficientsLots": {"Peinture": 1.2, "Plâtrerie – cloisons": 1.5}, "coefficientGeneral": 1.1}'::jsonb,
  'F5. l''estimation embarque les paramètres utilisés (hypothèses comprises)');
select is((pg_temp.e((select id::text from _p))->'totaux'->>'montant'), '550.00', 'F6. total général HT exact : 240 + 200 + 110');
select throws_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001', '{"coefficientGeneral":2}', 0) $$,
  'PT409', 'Paramètres modifiés ailleurs entre-temps : rien n''a été enregistré', 'F7. écriture concurrente refusée (révision obsolète) : rien n''est écrasé');
select throws_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001', '{"marge":12}', 1) $$,
  '22023', null, 'F8. marge refusée');
select throws_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001', '{"acompte":30}', 1) $$,
  '22023', null, 'F9. acompte refusé');
select is((select coalesce(details->>'avant', 'null') || '→' || (details->'apres'->>'coefficientGeneral') || '|' || auteur_id::text || '|' || entite || '|' || action
           from public.tools_releves_journal where releve_id = 'db000000-0000-0000-0000-000000000001' and 'estimation_parametres' = any(champs) order by id desc limit 1),
  'null→1.1|10000000-0000-0000-0000-000000000003|releve|creation', 'F10. journal : avant / après, auteur');

-- ─────────────────────────────────────────────────────────────
-- A. Traçabilité : valeur source, obsolescence sur QUANTITÉ
-- ─────────────────────────────────────────────────────────────
select lives_ok($$ select public.tools_releve_estimation_ajuster((select id from _p), 'dbb00000-0000-0000-0000-000000000004', null, 'nouveau', 'quantite', 40, 'Évacuation estimée au forfait') $$,
  'A1. correction (motif obligatoire) sur un ouvrage SANS prix');
select is((select valeur_source from public.tools_releves_estimation_ajustements where ouvrage_id = 'dbb00000-0000-0000-0000-000000000004' and retire_le is null),
  '{"unite": "u", "quantite": 5.000, "coefficient": null, "prixUnitaire": null, "montantCalcule": null, "coefficientSource": null}'::jsonb,
  'A2. valeur source figée par le serveur : quantité 5, sans prix');
select lives_ok($$ select public.tools_releve_estimation_ajuster((select id from _p), 'dbb00000-0000-0000-0000-000000000003', null, 'nouveau', 'quantite', 100, 'Prix fournisseur connu') $$,
  'A3. correction sur l''ouvrage « divers » (automatique 110,00)');
select is((select (a->>'perime') || '|' || (a->>'quantiteSource') || '|' || coalesce(a->>'motifPerime', 'null') from (select pg_temp.aj((select id::text from _p), 'dbb00000-0000-0000-0000-000000000004') a) x),
  'false|5.000|null', 'A4. quantité inchangée : correction active, non obsolète');
select lives_ok($$ select public.tools_releve_ouvrage_enregistrer((select id from _p), 'dbb00000-0000-0000-0000-000000000004', pg_temp.o('{"nom":"Évacuation","lot":"Lot A","regle":{"source":"saisie","valeur":6}}')) $$,
  'A5. la quantité de l''ouvrage sans prix passe de 5 à 6');
select is((select (a->>'perime') || '|' || (a->>'motifPerime') || '|' || (a->>'valeurRetenue') from (select pg_temp.aj((select id::text from _p), 'dbb00000-0000-0000-0000-000000000004') a) x)
          || '|' || (select string_agg(x->>'detail', ',') from jsonb_array_elements(pg_temp.e((select id::text from _p))->'anomalies') x
                     where x->>'code' = 'estimation_obsolete' and x->>'ouvrageId' = 'dbb00000-0000-0000-0000-000000000004')
          || '|' || pg_temp.m((select id::text from _p)),
  'true|quantite|40|quantite_modifiee|1=240.00,2=200.00,3=100.00,4=40.00',
  'A6. STALE : quantité changée (montant automatique inchangé, sans prix) → obsolète, motif quantité ; le montant retenu n''est jamais remplacé en silence');
select lives_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001',
  '{"coefficientGeneral":1.2,"coefficientsLots":{"Peinture":1.2,"Plâtrerie – cloisons":1.5},"hypotheses":null}', 1) $$,
  'A7a. coefficient général 1,1 → 1,2 ; hypothèses effacées (clé à null retirée)');
select is((select (a->>'perime') || '|' || (a->>'motifPerime') || '|' || (a->>'valeurCalculee') from (select pg_temp.aj((select id::text from _p), 'dbb00000-0000-0000-0000-000000000003') a) x)
          || '|' || (select l->>'montantCalcule' from jsonb_array_elements(pg_temp.e((select id::text from _p))->'lignes') l where l->>'ouvrageId' = 'dbb00000-0000-0000-0000-000000000003'),
  'true|montant|110.00|120.00', 'A7. quantité inchangée mais coefficient modifié : obsolète, motif montant (110,00 → 120,00)');

-- ─────────────────────────────────────────────────────────────
-- V. Gel et plan dérivé
-- ─────────────────────────────────────────────────────────────
create temporary table _f on commit drop as select * from public.tools_releve_plan_figer((select id from _p), (select revision from public.tools_releves_plans where id = (select id from _p)), 'Solution A');
grant select on _f to authenticated, service_role;
select is((select (estimation->'parametres'->>'revision') || '|' || (estimation->'parametres'->'donnees'->>'coefficientGeneral') || '|' || (estimation->'parametres'->'donnees' ? 'hypotheses')::text
           from public.tools_releves_plans where id = (select id from _p)),
  '2|1.2|false', 'V1. gel : les paramètres utilisés sont figés avec l''estimation (hypothèses effacées : clé absente)');
select lives_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001', '{"coefficientGeneral":2}', 2) $$,
  'V2a. paramètres du relevé modifiés APRÈS le gel (lots retirés, général 2)');
select is(pg_temp.m((select id::text from _p)) || ' / ' || pg_temp.c((select id::text from _p)) || ' / ' || (pg_temp.e((select id::text from _p))->>'source'),
  '1=240.00,2=200.00,3=100.00,4=40.00 / 1:lot:1.2,2:ouvrage:1,3:general:1.2 / gel', 'V2. plan figé : estimation et coefficients inchangés');
create temporary table _d on commit drop as select * from public.tools_releve_plan_creer('db300000-0000-0000-0000-000000000001', 'projete');
grant select on _d to authenticated, service_role;
select is(pg_temp.m((select id::text from _d)) || ' / ' || pg_temp.c((select id::text from _d)),
  '1=400.00,2=200.00,3=200.00,4=null / 1:general:2,2:ouvrage:1,3:general:2', 'V3. plan dérivé : prix copiés, recalcul avec les paramètres COURANTS (général 2), corrections non copiées');
select is((pg_temp.e((select id::text from _d))->'totaux'->>'lignesAjustees'), '0', 'V4. plan dérivé : aucune correction reprise');

-- ─────────────────────────────────────────────────────────────
-- T. Isolation
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((public.tools_releve_estimation_parametres('db000000-0000-0000-0000-000000000001')->>'revision'), '3', 'T1. consultation : lit les paramètres');
select throws_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001', '{}', 3) $$, '42501', null,
  'T2. consultation : aucune écriture');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok($$ select public.tools_releve_estimation_parametres('db000000-0000-0000-0000-000000000001') $$, '42501', null, 'T3. autre tenant : paramètres invisibles');
select is((select count(*)::int from public.tools_releves_estimation_parametres), 0, 'T4. autre tenant : aucune ligne visible (RLS)');
select throws_ok($$ select public.tools_releve_estimation_parametres_enregistrer('db000000-0000-0000-0000-000000000001', '{}', 3) $$, '42501', null,
  'T5. autre tenant : aucune écriture');

-- ─────────────────────────────────────────────────────────────
-- G. Mode sûr (train V8) : lecture seule « tools » → paramètres, prix et corrections gelés
-- ─────────────────────────────────────────────────────────────
reset role;
select lives_ok($$ select public.incident_basculer_operateur('astreinte-lot10','tools','lecture_seule',true,'Lot 10 gel tools','L10-1') $$, 'G0. opérateur : lecture seule tools');
select throws_ok($$ delete from public.tools_releves_estimation_parametres where false $$, 'PT503', null, 'G1. lecture seule tools : paramètres gelés');
select throws_ok($$ delete from public.tools_releves_estimation_prix where false $$, 'PT503', null, 'G2. lecture seule tools : prix gelés (garde absente avant 1402)');
select throws_ok($$ delete from public.tools_releves_estimation_ajustements where false $$, 'PT503', null, 'G3. lecture seule tools : corrections gelées');
select throws_ok($$ delete from public.tools_releves_bibliotheque_prix where false $$, 'PT503', null, 'G4. lecture seule tools : prix de bibliothèque gelés');
select lives_ok($$ select public.incident_basculer_operateur('astreinte-lot10','tools','lecture_seule',false,'Lot 10 levée gel tools','L10-1') $$, 'G5. levée');

select * from finish();
rollback;
