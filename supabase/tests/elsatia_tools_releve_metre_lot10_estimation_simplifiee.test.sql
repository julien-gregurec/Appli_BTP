-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 10 — ESTIMATION SIMPLIFIÉE (migration 20261002001114)
--
-- Qualifie sous RLS réelle, avec des VALEURS EXACTES :
--   S1–S9   schéma et droits : tables en lecture seule, RPC SECURITY DEFINER, calcul interne non exposé, anonyme,
--           moteur pur, quantitatif du Lot 9 toujours SANS prix, aucune notion de devis / facture / commande ;
--   C1–C8   contrat d'un prix : composantes typées (matériau, main d'œuvre, forfait, autre), coefficient, TVA /
--           marge / remise / prix de vente refusés, précision ;
--   P1      PARITÉ avec le miroir TypeScript (jeu déterministe packages/releve-domain/src/estimation-parite.fixture.json) ;
--   E1–E12  estimation sur un vrai plan : quantité RETENUE du Lot 9 (perte non réappliquée), PU, composantes au
--           centime, forfait, heures, sous-totaux par état, sans prix exploitable, journal avant / après ;
--   B1–B7   bibliothèque : prix facultatif, reprise à la création, application par code, droits ;
--   A1–A10  corrections : montant automatique calculé par le serveur, retenu, raison, auteur, date, remplacement
--           tracé, retrait, aucune écriture directe, obsolescence, ouvrage supprimé ;
--   V1–V9   versioning : estimation figée avec le plan, immuable, plan dérivé (prix copiés, corrections non
--           copiées, recalcul indépendant) ;
--   T1–T7   isolation : consultation, autre tenant, anonyme.
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

\ir fixtures/isolation_multitenant.inc
\set parite `cat ../../packages/releve-domain/src/estimation-parite.fixture.json`

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
create function pg_temp.o(extra jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('nom', 'Ouvrage', 'categorie', 'peinture', 'unite', 'm2', 'regle', jsonb_build_object('source', 'surface_sol'),
    'pertePourcent', 0, 'arrondi', jsonb_build_object('mode', 'aucun'), 'etatTravaux', 'nouveau', 'etats', jsonb_build_array('existant','nouveau')) || extra $$;
grant execute on function pg_temp.o(jsonb) to authenticated, service_role;
create function pg_temp.enr(p text, id text, extra jsonb) returns jsonb language sql as $$
  select public.tools_releve_ouvrage_enregistrer(p::uuid, id::uuid, pg_temp.o(extra)) $$;
grant execute on function pg_temp.enr(text, text, jsonb) to authenticated, service_role;
create function pg_temp.px(p text, ouvrage text, donnees jsonb) returns jsonb language sql as $$
  select public.tools_releve_estimation_prix_enregistrer(p::uuid, ouvrage::uuid, donnees) $$;
grant execute on function pg_temp.px(text, text, jsonb) to authenticated, service_role;
create function pg_temp.e(p text) returns jsonb language sql as $$ select public.tools_releve_plan_estimation(p::uuid)->'estimation' $$;
grant execute on function pg_temp.e(text) to authenticated, service_role;
-- Montants retenus d'un ouvrage : « pièce|état|nature=montant » triés (étage = « etage »).
create function pg_temp.el(p text, ouvrage text) returns text language sql as $$
  select string_agg(coalesce(case when l->>'pieceId' = 'da500000-0000-0000-0000-000000000001' then 'sejour' else l->>'pieceId' end, 'etage')
         || '|' || (l->>'etatProjet') || '|' || (l->>'nature') || '=' || coalesce(l->>'montantRetenu', 'null'), ',' order by l->>'nature' desc, l->>'pieceId', l->>'etatProjet')
  from jsonb_array_elements(pg_temp.e(p)->'lignes') l where l->>'ouvrageId' = ouvrage $$;
grant execute on function pg_temp.el(text, text) to authenticated, service_role;
create function pg_temp.an(p text, code text) returns int language sql as $$
  select count(*)::int from jsonb_array_elements(pg_temp.e(p)->'anomalies') a where a->>'code' = code $$;
grant execute on function pg_temp.an(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select ok(to_regclass('public.tools_releves_estimation_prix') is not null and to_regclass('public.tools_releves_bibliotheque_prix') is not null
          and to_regclass('public.tools_releves_estimation_ajustements') is not null, 'S1. tables prix, prix de bibliothèque, corrections');
select ok(has_table_privilege('authenticated', 'public.tools_releves_estimation_prix', 'SELECT')
          and not has_table_privilege('authenticated', 'public.tools_releves_estimation_prix', 'INSERT')
          and not has_table_privilege('authenticated', 'public.tools_releves_bibliotheque_prix', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.tools_releves_estimation_ajustements', 'INSERT')
          and not has_table_privilege('anon', 'public.tools_releves_estimation_prix', 'SELECT'),
  'S2. lecture seule pour les utilisateurs, écriture par RPC, rien pour anonyme');
select ok(not has_function_privilege('authenticated', 'public.tools_releve_plan_estimation_calcul(uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.tools_releve_estimation_prix_json(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_plan_estimation(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.tools_releve_estimation_evaluer(jsonb)', 'EXECUTE'),
  'S3. calcul interne non exposé ; moteur pur et lecture contrôlée exposés');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('tools_releve_plan_estimation','tools_releve_estimation_synthese','tools_releve_estimation_plans',
  'tools_releve_estimation_prix_enregistrer','tools_releve_estimation_prix_importer','tools_releve_estimation_prix_supprimer','tools_releve_estimation_appliquer_bibliotheque',
  'tools_releve_estimation_ajuster','tools_releve_estimation_ajustement_retirer','tools_releve_estimation_corrections','tools_releve_bibliotheque_prix',
  'tools_releve_bibliotheque_prix_enregistrer','tools_releve_bibliotheque_prix_supprimer')), 'S4. RPC SECURITY DEFINER (contrôle explicite des droits)');
select ok(not has_function_privilege('anon', 'public.tools_releve_plan_estimation(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_estimation_prix_enregistrer(uuid, uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.tools_releve_estimation_evaluer(jsonb)', 'EXECUTE'), 'S5. anonyme : aucune RPC');
select ok((select provolatile = 'i' from pg_proc where proname = 'tools_releve_estimation_evaluer'), 'S6. moteur déclaré IMMUTABLE (fonction pure)');
select is((select count(*)::int from information_schema.columns where table_schema = 'public'
           and table_name in ('tools_releves_ouvrages','tools_releves_ouvrages_bibliotheque','tools_releves_quantitatif_ajustements')
           and column_name ~* '(prix|price|tarif|montant|cout)'), 0, 'S7. couche séparée : les tables du quantitatif (Lot 9) restent sans prix');
select is(public.tools_releve_ouvrage_anomalie(pg_temp.o('{"prixUnitaireHt":12.5}')), 'prix', 'S8. le contrat d''ouvrage du Lot 9 refuse toujours un prix');
select is((select count(*)::int from pg_proc where proname like 'tools_releve%' and proname ~ '(devis|facture|commande|signature)')
          + (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name like 'tools_releves%'
             and column_name ~* '(devis|facture|commande|signature|tva|marge|remise)'), 0,
  'S9. aucune fonction ni colonne de devis, facture, commande, signature, TVA, marge ou remise dans Tools');

-- ─────────────────────────────────────────────────────────────
-- C. Contrat d'un prix estimatif
-- ─────────────────────────────────────────────────────────────
select is(public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":3.5},{"type":"main_d_oeuvre","heuresParUnite":0.25,"tauxHoraire":45},{"type":"forfait","montant":120},{"type":"autre","prixUnitaire":0}],"coefficient":1.1}'),
  null, 'C1. prix structuré valide (matériau, main d''œuvre, forfait, autre, coefficient)');
select is(public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":1}],"tva":20}') || '|' ||
          public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":1}],"marge":15}') || '|' ||
          public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":1,"prixVente":2}]}') || '|' ||
          public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":1}],"remise":5}'),
  'cle|cle|cle|cle', 'C2. TVA, marge, prix de vente, remise refusés : décidés par Gestion Pro');
select is(public.tools_releve_prix_message('cle'), 'Donnée inconnue : l''estimation Tools est simplifiée et HT (prix de vente, marge, remise, TVA et devis relèvent de Gestion Pro).',
  'C3. message explicite');
select is(public.tools_releve_prix_anomalie('{"composantes":[{"type":"remise","prixUnitaire":1}]}'), 'type', 'C4. type de prix inconnu refusé');
select is(public.tools_releve_prix_anomalie('{"composantes":[{"type":"main_d_oeuvre","heuresParUnite":1,"tauxHoraire":45.123}]}') || '|' ||
          public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":1.23456}]}') || '|' ||
          public.tools_releve_prix_anomalie('{"composantes":[{"type":"forfait","montant":-1}]}'), 'taux|prix_unitaire|forfait', 'C5. précision et bornes');
select is(public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":1}],"coefficient":0}'), 'coefficient', 'C6. coefficient 0,01 à 10');
select is(public.tools_releve_prix_anomalie('{"composantes":[]}'), 'composantes', 'C7. au moins une composante');
select is(public.tools_releve_prix_anomalie('{"composantes":[{"type":"materiau","prixUnitaire":10}],"pertePourcent":5}'), 'cle',
  'C8. aucune perte dans un prix : la perte est celle de l''ouvrage (Lot 9), jamais appliquée deux fois');
select is((select count(*)::int from jsonb_array_elements((:'parite')::jsonb->'cas') c
           where public.tools_releve_estimation_evaluer(c->'entree') is distinct from c->'attendu'), 0,
  'P1. parité : le serveur reproduit exactement le jeu déterministe vérifié par le miroir TypeScript');

-- ─────────────────────────────────────────────────────────────
-- Données : métreur (tenant A). Pièce 4 × 3 m à l'axe, murs de 20 cm (h 2,50) → intérieur 3,80 × 2,80.
-- Porte 90 × 210 (sud), fenêtre 120 × 100 allège 100 (nord), petite fenêtre 40 × 40 allège 120 (est).
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values
  ('da000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 10', 'Site');
update public.tools_releves set visibilite = 'entreprise' where id = 'da000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values
  ('da200000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('da300000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da200000-0000-0000-0000-000000000001', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage, hauteur_sous_plafond_mm) values
  ('da500000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', 'Séjour', 'sejour', 2500);
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('da300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role, anon;
select pg_temp.save((select id::text from _p), jsonb_build_object(
  'murs', jsonb_build_array(
    pg_temp.mur('da600000-0000-0000-0000-000000000001', 0, 0, 4000, 0), pg_temp.mur('da600000-0000-0000-0000-000000000002', 4000, 0, 4000, 3000),
    pg_temp.mur('da600000-0000-0000-0000-000000000003', 4000, 3000, 0, 3000), pg_temp.mur('da600000-0000-0000-0000-000000000004', 0, 3000, 0, 0)),
  'ouvertures', jsonb_build_array(
    pg_temp.ouv('da700000-0000-0000-0000-000000000001', 'da600000-0000-0000-0000-000000000001', 'porte', 1000, 900, 2100, 0),
    pg_temp.ouv('da700000-0000-0000-0000-000000000002', 'da600000-0000-0000-0000-000000000003', 'fenetre', 1500, 1200, 1000, 1000),
    pg_temp.ouv('da700000-0000-0000-0000-000000000003', 'da600000-0000-0000-0000-000000000002', 'fenetre', 1000, 400, 400, 1200)),
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'da500000-0000-0000-0000-000000000001',
    'points', '[{"x":100,"y":100},{"x":3900,"y":100},{"x":3900,"y":2900},{"x":100,"y":2900}]'::jsonb,
    'murIds', '["da600000-0000-0000-0000-000000000001","da600000-0000-0000-0000-000000000002","da600000-0000-0000-0000-000000000003","da600000-0000-0000-0000-000000000004"]'::jsonb,
    'graine', '{"x":2000,"y":1500}'::jsonb))));
select public.tools_releve_ouvrages_importer((select id from _p), jsonb_build_array(
    jsonb_build_object('id', 'dab00000-0000-0000-0000-000000000001', 'donnees', pg_temp.o('{"nom":"Peinture murs","code":"PEI-MUR","regle":{"source":"surface_murs"},"pertePourcent":5}')),
    jsonb_build_object('id', 'dab00000-0000-0000-0000-000000000002', 'donnees', pg_temp.o('{"nom":"Plinthes","code":"PLI-ML","categorie":"plinthes","unite":"ml","regle":{"source":"perimetre_utile"},"pertePourcent":5}')),
    jsonb_build_object('id', 'dab00000-0000-0000-0000-000000000003', 'donnees', pg_temp.o('{"nom":"Portes","categorie":"portes","unite":"u","regle":{"source":"nombre_ouvertures","filtre":{"typesOuverture":["porte"]}}}')),
    jsonb_build_object('id', 'dab00000-0000-0000-0000-000000000004', 'donnees', pg_temp.o('{"nom":"Murs","categorie":"cloisons","regle":{"source":"surface_murs_plan"},"etats":["existant","a_deposer","nouveau","deplace"]}')),
    jsonb_build_object('id', 'dab00000-0000-0000-0000-000000000005', 'donnees', pg_temp.o('{"nom":"Nettoyage","categorie":"autre","unite":"forfait","regle":{"source":"forfait"}}'))));

-- ─────────────────────────────────────────────────────────────
-- E. Estimation d'un vrai plan (valeurs exactes)
-- ─────────────────────────────────────────────────────────────
select is(pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000001'), 'sejour|nouveau|quantite=null',
  'E1. sans prix : la ligne du quantitatif existe, sans montant (exploitable en quantitatif)');
select lives_ok(format($$
  select pg_temp.px(%1$L, 'dab00000-0000-0000-0000-000000000001', '{"composantes":[{"type":"materiau","libelle":"Peinture velours","prixUnitaire":3.5},{"type":"main_d_oeuvre","heuresParUnite":0.25,"tauxHoraire":45},{"type":"forfait","libelle":"Protection","montant":120}]}');
  select pg_temp.px(%1$L, 'dab00000-0000-0000-0000-000000000002', '{"composantes":[{"type":"materiau","prixUnitaire":8.9}]}');
  select pg_temp.px(%1$L, 'dab00000-0000-0000-0000-000000000003', '{"composantes":[{"type":"autre","prixUnitaire":250},{"type":"main_d_oeuvre","heuresParUnite":1.5,"tauxHoraire":45}]}');
  select pg_temp.px(%1$L, 'dab00000-0000-0000-0000-000000000005', '{"composantes":[{"type":"autre","prixUnitaire":350}]}') $$, (select id from _p)),
  'E2. prix saisis (RPC) : peinture, plinthes, portes, nettoyage');
select is(pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000001'), 'sejour|nouveau|quantite=460.76,etage|nouveau|forfait=120.00',
  'E3. peinture : 31,238 m² (murs nets 29,75 + 5 % du Lot 9) × (3,50 + 0,25 h × 45 €) = 109,33 + 351,43 = 460,76 € ; forfait 120 €');
select is((select (l->>'quantite') || '|' || (l->>'prixUnitaire') || '|' || (l->>'materiau') || '|' || (l->>'mainOeuvre') || '|' || (l->>'heures')
           from jsonb_array_elements(pg_temp.e((select id::text from _p))->'lignes') l where l->>'ouvrageId' = 'dab00000-0000-0000-0000-000000000001' and l->>'nature' = 'quantite'),
  '31.238|14.7500|109.33|351.43|7.810', 'E4. quantité, PU, composantes au centime, heures estimées');
select is(pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000002'), 'sejour|nouveau|quantite=114.94',
  'E5. plinthes : 12,915 ml (perte 5 % DÉJÀ comprise) × 8,90 € = 114,94 € — la perte n''est pas réappliquée');
select is(pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000003'), 'sejour|existant|quantite=317.50',
  'E6. porte existante : 1 u × (250 + 1,5 h × 45 €) = 317,50 €');
select is(pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000005'), 'etage|nouveau|quantite=350.00', 'E7. forfait (unité) : 1 × 350 €');
select is((select (t->>'montant') || '|' || (t->'parEtat'->>'existant') || '|' || (t->'parEtat'->>'nouveau') || '|' || (t->'parType'->>'materiau') || '|'
           || (t->'parType'->>'main_d_oeuvre') || '|' || (t->'parType'->>'forfait') || '|' || (t->'parType'->>'autre') || '|' || (t->>'heures') || '|' || (t->>'lignesSansPrix')
           from (select pg_temp.e((select id::text from _p))->'totaux' as t) x),
  '1363.20|317.50|1045.70|224.27|418.93|120.00|600.00|9.310|1', 'E8. totaux exacts : total, par état, par type, heures, lignes sans prix');
select is((select string_agg(a->>'code', ',') from jsonb_array_elements(pg_temp.e((select id::text from _p))->'anomalies') a
           where a->>'ouvrageId' = 'dab00000-0000-0000-0000-000000000004'), 'prix_absent', 'E9. ouvrage sans prix signalé (information), hors total');
select is((select pg_temp.e((select id::text from _p))->>'base') || '|' || (pg_temp.e((select id::text from _p))->>'devise') || '|' || (pg_temp.e((select id::text from _p))->>'source'),
  'HT|EUR|calcul', 'E10. estimation HT, en euros, calculée');
select lives_ok(format($$ select pg_temp.px(%L, 'dab00000-0000-0000-0000-000000000002', '{"composantes":[{"type":"materiau","prixUnitaire":9.5}]}') $$, (select id from _p)),
  'E11. édition d''un prix');
select is((select (details->'avant'->'composantes'->0->>'prixUnitaire') || '→' || (details->'apres'->'composantes'->0->>'prixUnitaire') || '|' || auteur_id::text
           from public.tools_releves_journal where releve_id = 'da000000-0000-0000-0000-000000000001' and 'estimation' = any(champs) order by id desc limit 1)
          || '|' || pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000002'),
  '8.9→9.5|10000000-0000-0000-0000-000000000003|sejour|nouveau|quantite=122.69', 'E12. journal avant / après, auteur ; recalcul (12,915 × 9,50 = 122,69 €)');

-- ─────────────────────────────────────────────────────────────
-- B. Bibliothèque : prix facultatif
-- ─────────────────────────────────────────────────────────────
select lives_ok($$ select public.tools_releve_bibliotheque_enregistrer('da000000-0000-0000-0000-000000000001', 'dac00000-0000-0000-0000-000000000001',
    pg_temp.o('{"nom":"Carrelage sol","code":"CAR-SOL","categorie":"carrelage","pertePourcent":10}'));
  select public.tools_releve_bibliotheque_enregistrer('da000000-0000-0000-0000-000000000001', 'dac00000-0000-0000-0000-000000000002',
    pg_temp.o('{"nom":"Murs (bibliothèque)","code":"MUR-BIB","categorie":"cloisons","regle":{"source":"surface_murs_plan"}}')) $$,
  'B1. ouvrages de bibliothèque (sans prix dans leur contrat)');
select lives_ok($$ select public.tools_releve_bibliotheque_prix_enregistrer('da000000-0000-0000-0000-000000000001', 'dac00000-0000-0000-0000-000000000001',
  '{"composantes":[{"type":"materiau","prixUnitaire":28},{"type":"main_d_oeuvre","heuresParUnite":0.5,"tauxHoraire":40}]}') $$, 'B2. prix facultatif de bibliothèque');
select is((select jsonb_array_length(public.tools_releve_bibliotheque_prix('da000000-0000-0000-0000-000000000001'))::text), '1',
  'B3. un seul prix : l''autre entrée reste exploitable sans prix');
select lives_ok(format($$ select public.tools_releve_ouvrage_enregistrer(%L, 'dab00000-0000-0000-0000-000000000006',
  (select b.donnees from public.tools_releves_ouvrages_bibliotheque b where b.id = 'dac00000-0000-0000-0000-000000000001'), 'dac00000-0000-0000-0000-000000000001') $$, (select id from _p)),
  'B4. ouvrage créé depuis la bibliothèque');
select is((select origine || '|' || (donnees->'composantes'->0->>'prixUnitaire') from public.tools_releves_estimation_prix where ouvrage_id = 'dab00000-0000-0000-0000-000000000006')
          || '|' || pg_temp.el((select id::text from _p), 'dab00000-0000-0000-0000-000000000006'),
  'bibliotheque|28|sejour|nouveau|quantite=561.79', 'B5. prix repris de la bibliothèque : 11,704 m² (perte 10 % comprise) × (28 + 0,5 h × 40 €) = 327,71 + 234,08 = 561,79 €');
select pg_temp.enr((select id::text from _p), 'dab00000-0000-0000-0000-000000000007', '{"nom":"Carrelage (catalogue)","code":"CAR-SOL","categorie":"carrelage","pertePourcent":10}');
create temporary table _b on commit drop as select public.tools_releve_estimation_appliquer_bibliotheque((select id from _p)) as n1;
grant select on _b to authenticated;
select is((select n1::text from _b) || '|' || (select origine from public.tools_releves_estimation_prix where ouvrage_id = 'dab00000-0000-0000-0000-000000000007') || '|'
          || public.tools_releve_estimation_appliquer_bibliotheque((select id from _p))::text,
  '1|bibliotheque|0', 'B6. application par code : l''ouvrage sans prix est complété, aucun prix existant écrasé');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.tools_releve_bibliotheque_prix_enregistrer('da000000-0000-0000-0000-000000000001', 'dac00000-0000-0000-0000-000000000002', '{"composantes":[{"type":"autre","prixUnitaire":1}]}') $$,
  '42501', null, 'B7. consultation : prix de bibliothèque non modifiable');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

-- ─────────────────────────────────────────────────────────────
-- A. Corrections manuelles (montant automatique jamais écrasé)
-- ─────────────────────────────────────────────────────────────
create temporary table _a on commit drop as select * from public.tools_releve_estimation_ajuster((select id from _p), 'dab00000-0000-0000-0000-000000000001',
  'da500000-0000-0000-0000-000000000001', 'nouveau', 'quantite', 450, 'Prix fournisseur négocié');
grant select on _a to authenticated, service_role;
select is((select valeur_calculee::text || '|' || valeur_retenue::text || '|' || raison || '|' || created_by::text || '|' || (created_at is not null)::text from _a),
  '460.76|450|Prix fournisseur négocié|10000000-0000-0000-0000-000000000003|true', 'A1. montant automatique PAR LE SERVEUR, retenu, raison, auteur, date');
select is((select (l->>'montantCalcule') || '|' || (l->>'montantRetenu') || '|' || (l->'ajustement'->>'raison') from jsonb_array_elements(pg_temp.e((select id::text from _p))->'lignes') l
           where l->>'ouvrageId' = 'dab00000-0000-0000-0000-000000000001' and l->>'nature' = 'quantite'), '460.76|450.00|Prix fournisseur négocié',
  'A2. le montant automatique reste visible à côté du retenu');
select is((select (t->>'ecartAjustements') || '|' || (t->>'lignesAjustees') from (select pg_temp.e((select id::text from _p))->'totaux' as t) x), '-10.76|1', 'A3. écart des corrections tracé dans les totaux');
select throws_ok(format($$ select public.tools_releve_estimation_ajuster(%L, 'dab00000-0000-0000-0000-000000000001', 'da500000-0000-0000-0000-000000000001', 'nouveau', 'quantite', 400, ' ') $$, (select id from _p)),
  '22023', 'La raison de la correction est obligatoire.', 'A4. raison obligatoire');
select throws_ok(format($$ select public.tools_releve_estimation_ajuster(%L, 'dab00000-0000-0000-0000-000000000001', 'da500000-0000-0000-0000-000000000001', 'nouveau', 'quantite', 400.001, 'Trop précis') $$, (select id from _p)),
  '22023', null, 'A5. montant à deux décimales au plus, positif');
select throws_ok(format($$ select public.tools_releve_estimation_ajuster(%L, 'dab00000-0000-0000-0000-000000000001', null, 'existant', 'quantite', 1, 'Ligne absente') $$, (select id from _p)),
  '42501', 'Ligne d''estimation absente du plan', 'A6. correction d''une ligne inexistante refusée');
select lives_ok(format($$ select public.tools_releve_estimation_ajuster(%L, 'dab00000-0000-0000-0000-000000000001', null, 'nouveau', 'forfait', 100, 'Protection réduite') $$, (select id from _p)),
  'A7. correction d''une ligne forfait');
select lives_ok(format($$ select public.tools_releve_estimation_ajuster(%L, 'dab00000-0000-0000-0000-000000000001', 'da500000-0000-0000-0000-000000000001', 'nouveau', 'quantite', 440, 'Nouveau devis fournisseur') $$, (select id from _p)),
  'A8a. nouvelle correction : la précédente est retirée (tracée)');
select is((select count(*)::text || '|' || count(*) filter (where retire_le is not null)::text || '|' || jsonb_array_length(public.tools_releve_estimation_corrections((select id from _p)))::text
           from public.tools_releves_estimation_ajustements where ouvrage_id = 'dab00000-0000-0000-0000-000000000001'), '3|1|3', 'A8. historique conservé et lisible (audit)');
select throws_ok($$ update public.tools_releves_estimation_ajustements set valeur_retenue = 1 $$, '42501', null, 'A9. aucune écriture directe');
select lives_ok(format($$ select pg_temp.px(%L, 'dab00000-0000-0000-0000-000000000001', '{"composantes":[{"type":"materiau","prixUnitaire":4},{"type":"main_d_oeuvre","heuresParUnite":0.25,"tauxHoraire":45},{"type":"forfait","montant":120}]}') $$, (select id from _p)),
  'A10a. prix modifié après la correction');
select is((select (l->>'montantCalcule') || '|' || (l->>'montantRetenu') || '|' || (l->'ajustement'->>'perime') from jsonb_array_elements(pg_temp.e((select id::text from _p))->'lignes') l
           where l->>'ouvrageId' = 'dab00000-0000-0000-0000-000000000001' and l->>'nature' = 'quantite') || '|' || pg_temp.an((select id::text from _p), 'estimation_obsolete')::text,
  '476.38|440.00|true|1', 'A10. montant automatique changé : correction obsolète signalée, jamais remplacée en silence');

-- ─────────────────────────────────────────────────────────────
-- V. Versioning
-- ─────────────────────────────────────────────────────────────
create temporary table _f on commit drop as select * from public.tools_releve_plan_figer((select id from _p), pg_temp.rev((select id::text from _p)), 'Existant');
select ok((select estimation is not null and jsonb_array_length(estimation->'lignes') > 0 and estimation ? 'calculeLe' and (estimation->'totaux'->>'montant')::numeric > 0
           from public.tools_releves_plans where id = (select id from _p)), 'V1. gel : estimation figée avec le plan');
create temporary table _tot on commit drop as select pg_temp.e((select id::text from _p))->'totaux'->>'montant' as montant;
grant select on _tot to authenticated;
select throws_ok(format($$ select pg_temp.px(%L, 'dab00000-0000-0000-0000-000000000002', '{"composantes":[{"type":"materiau","prixUnitaire":1}]}') $$, (select id from _p)),
  '42501', 'Plan figé : son quantitatif est figé', 'V2. plan figé : prix non modifiable');
select throws_ok(format($$ select public.tools_releve_estimation_ajuster(%L, 'dab00000-0000-0000-0000-000000000002', 'da500000-0000-0000-0000-000000000001', 'nouveau', 'quantite', 1, 'Après gel') $$, (select id from _p)),
  '42501', null, 'V3. plan figé : aucune correction');
select lives_ok($$ select public.tools_releve_bibliotheque_prix_enregistrer('da000000-0000-0000-0000-000000000001', 'dac00000-0000-0000-0000-000000000001',
  '{"composantes":[{"type":"materiau","prixUnitaire":99}]}') $$, 'V4a. prix de bibliothèque modifié après le gel');
update public.tools_releves_pieces set hauteur_sous_plafond_mm = 3000 where id = 'da500000-0000-0000-0000-000000000001';
select is((pg_temp.e((select id::text from _p))->'totaux'->>'montant') || '|' || (pg_temp.e((select id::text from _p))->>'source'), (select montant from _tot) || '|gel',
  'V4. estimation figée insensible (hauteur, bibliothèque modifiées après le gel)');
reset role;
select throws_ok(format($$ update public.tools_releves_plans set estimation = '{}'::jsonb where id = %L $$, (select id from _p)),
  '42501', null, 'V5. estimation figée immuable (même pour le propriétaire des tables)');
select throws_ok($$ update public.tools_releves_estimation_prix set origine = 'saisie' where ouvrage_id = 'dab00000-0000-0000-0000-000000000006' $$,
  '42501', null, 'V6. prix d''un plan figé immuable (même pour le propriétaire des tables)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
create temporary table _c on commit drop as select * from public.tools_releve_plan_creer('da300000-0000-0000-0000-000000000001', 'projete');
grant select on _c to authenticated, service_role, anon;
select is((select count(*)::text || '|' || string_agg(distinct origine, ',') from public.tools_releves_estimation_prix where plan_id = (select id from _c))
          || '|' || (select count(*)::text from public.tools_releves_estimation_ajustements where plan_id = (select id from _c)),
  '6|copie|0', 'V7. plan dérivé : prix copiés (lignée), corrections NON copiées');
select is(pg_temp.el((select id::text from _c), (select id::text from public.tools_releves_ouvrages where plan_id = (select id from _c) and origine_ouvrage_id = 'dab00000-0000-0000-0000-000000000001')),
  'sejour|nouveau|quantite=582.06,etage|nouveau|forfait=120.00', 'V8. plan dérivé : recalcul sur SA quantité (h 3,00 m : 36,35 m² + 5 % = 38,168 m² × 15,25 €), montants automatiques, aucune correction reprise');
select lives_ok(format($$ select pg_temp.px(%L, (select id::text from public.tools_releves_ouvrages where plan_id = %L and origine_ouvrage_id = 'dab00000-0000-0000-0000-000000000002'),
  '{"composantes":[{"type":"materiau","prixUnitaire":20}]}') $$, (select id from _c), (select id from _c)), 'V9a. prix du plan dérivé modifié');
select is((pg_temp.e((select id::text from _p))->'totaux'->>'montant') || '|' ||
          pg_temp.el((select id::text from _c), (select id::text from public.tools_releves_ouvrages where plan_id = (select id from _c) and origine_ouvrage_id = 'dab00000-0000-0000-0000-000000000002')),
  (select montant from _tot) || '|sejour|nouveau|quantite=258.30', 'V9. recalcul indépendant : dérivé 12,915 × 20 = 258,30 €, plan figé inchangé');

-- ─────────────────────────────────────────────────────────────
-- T. Isolation
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select ok(jsonb_array_length(pg_temp.e((select id::text from _c))->'lignes') > 0
          and jsonb_array_length(public.tools_releve_estimation_synthese('da000000-0000-0000-0000-000000000001', 'projete')) = 1
          and jsonb_array_length(public.tools_releve_estimation_plans('da300000-0000-0000-0000-000000000001')) = 2,
  'T1. consultation : estimation, synthèse et plans (scénarios) lisibles');
select throws_ok(format($$ select pg_temp.px(%L, (select id::text from public.tools_releves_ouvrages where plan_id = %L limit 1), '{"composantes":[{"type":"autre","prixUnitaire":1}]}') $$,
  (select id from _c), (select id from _c)), '42501', null, 'T2. consultation : aucun prix');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select throws_ok(format($$ select public.tools_releve_plan_estimation(%L) $$, (select id from _c)), '42501', null, 'T3. autre tenant : estimation refusée');
select throws_ok($$ select public.tools_releve_estimation_synthese('da000000-0000-0000-0000-000000000001', 'existant') $$, '42501', null, 'T4. autre tenant : synthèse refusée');
select throws_ok(format($$ select public.tools_releve_estimation_appliquer_bibliotheque(%L) $$, (select id from _c)), '42501', null, 'T5. autre tenant : aucune écriture');
select is((select count(*)::int from public.tools_releves_estimation_prix where releve_id = 'da000000-0000-0000-0000-000000000001')
          + (select count(*)::int from public.tools_releves_bibliotheque_prix where entreprise_id = 'a0000000-0000-0000-0000-000000000001')
          + (select count(*)::int from public.tools_releves_estimation_ajustements where releve_id = 'da000000-0000-0000-0000-000000000001'), 0,
  'T6. autre tenant : ni prix, ni prix de bibliothèque, ni correction visibles');
reset role;
set local role anon;
select throws_ok(format($$ select public.tools_releve_plan_estimation(%L) $$, (select id from _c)), '42501', null, 'T7. anonyme : aucune lecture');
reset role;

select * from finish();
rollback;
