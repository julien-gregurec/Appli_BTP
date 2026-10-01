-- ELSATIA TOOLS → GESTION PRO — RELEVÉ & MÉTRÉ — LOT 11 — COSTING HANDOFF V1 (migration 20260930001501)
--
-- Qualifie sous RLS réelle, sur une vraie estimation du Lot 10 :
--   S1–S8   schéma et droits : tables en lecture seule, RPC SECURITY DEFINER, internes non exposées, anonyme, gardes incident ;
--   I1–I8   import : snapshot à l'identique, dossier lu par le serveur (client / chantier GP), lignes normalisées non liées ;
--   D1–D5   idempotence : même contenu → même import (clé client indifférente), journal « réimport identique » ;
--   K1–K9   contrat : nom, version inconnue (2.x) refusée, mineure 1.x acceptée, données commerciales, relevé / état, doublons ;
--   O1–O4   le serveur fait foi : montant / total forgés, ouvrage supprimé depuis → PT409 ;
--   N1–N6   nouvelle version : jamais d'écrasement, version précédente signalée, comparaison ;
--   Q1–Q10  devis brouillon explicite côté GP : une fois, version périmée refusée, devis travaillé jamais modifié par un réimport ;
--   M1–M7   correspondances ouvrage Tools → prestation GP, prestation supprimée → ligne non liée sans perte ;
--   X1–X4   import interrompu : rien d'écrit, reprise propre ;
--   A1–A4   audit : qui, quand, source, version, import, réimport ;
--   T1–T14  sécurité : droits Tools, droits GP, autre tenant, anonyme, immutabilité, Gestion Pro inaccessible.
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

\ir fixtures/isolation_multitenant.inc

-- Métreur Tools = Admin A (toutes permissions GP, dont gerer_ouvrages) ; Conducteur A = métreur Tools SANS gerer_ouvrages ;
-- Comptable A = consultation ; Admin B = administrateur Relevé de l'autre tenant.
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', array['releve-metre'], 'internal'
from unnest(array['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005',
                  '20000000-0000-0000-0000-000000000001']::uuid[]) u;

create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, true)::text; select null::void $$;
grant execute on function pg_temp.as_user(text) to authenticated, anon, service_role;
create function pg_temp.o(extra jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('nom', 'Ouvrage', 'categorie', 'peinture', 'unite', 'm2', 'regle', jsonb_build_object('source', 'surface_sol'),
    'pertePourcent', 0, 'arrondi', jsonb_build_object('mode', 'aucun'), 'etatTravaux', 'nouveau', 'etats', jsonb_build_array('existant','nouveau')) || extra $$;
grant execute on function pg_temp.o(jsonb) to authenticated, service_role;
create function pg_temp.px(p uuid, ouvrage text, donnees jsonb) returns jsonb language sql as $$
  select public.tools_releve_estimation_prix_enregistrer(p, ouvrage::uuid, donnees) $$;
grant execute on function pg_temp.px(uuid, text, jsonb) to authenticated, service_role;

-- Contrat `elsatia.tools.estimation` construit comme `buildEstimationGpPayload` (mêmes références, mêmes formats)
-- depuis la synthèse SERVEUR lue par l'utilisateur courant.
create function pg_temp.contrat(r uuid, etat text) returns jsonb language plpgsql as $$
declare s jsonb := public.tools_releve_estimation_synthese(r, etat); v_lignes jsonb; v_ouvrages jsonb; v_plans jsonb; v_total numeric;
begin
  select coalesce(jsonb_agg(jsonb_build_object('ref', x->>'planId' || ':' || (l->>'ouvrageId') || ':' || coalesce(l->>'pieceId', 'etage-' || (x->>'etageId')) || ':' || (l->>'etatProjet') || ':' || (l->>'nature'),
      'ouvrageRef', l->>'ouvrageId', 'quantiteRef', null, 'nature', l->>'nature', 'etatProjet', l->>'etatProjet', 'unite', l->>'unite',
      'quantite', l->'quantite', 'prixUnitaire', l->'prixUnitaire', 'montants', jsonb_build_object('materiau', l->'materiau', 'mainOeuvre', l->'mainOeuvre', 'forfait', l->'forfait', 'autre', l->'autre'),
      'heures', l->'heures', 'montantCalcule', l->'montantCalcule', 'montantRetenu', l->'montantRetenu',
      'correction', case when l->'ajustement' is null or l->'ajustement' = 'null'::jsonb then null else jsonb_build_object('raison', l->'ajustement'->>'raison') end,
      'emplacement', jsonb_build_object('chantier', null, 'batiment', jsonb_build_object('id', 'b', 'nom', 'Bâtiment'), 'etage', jsonb_build_object('id', x->>'etageId', 'nom', 'RDC'), 'zone', null,
        'piece', case when l->>'pieceId' is null then null else jsonb_build_object('id', l->>'pieceId', 'nom', 'Séjour') end))), '[]'::jsonb),
         coalesce(sum((l->>'montantRetenu')::numeric), 0)
    into v_lignes, v_total
  from jsonb_array_elements(s) x cross join lateral jsonb_array_elements(x->'estimation'->'lignes') l;
  select coalesce(jsonb_agg(jsonb_build_object('ref', o->>'id', 'planRef', x->>'planId', 'cle', lower(coalesce(o->>'code', o->>'nom')) || '|' || (o->>'unite'),
      'code', o->>'code', 'nom', o->>'nom', 'categorie', o->>'categorie', 'lot', initcap(o->>'categorie'), 'unite', o->>'unite')), '[]'::jsonb)
    into v_ouvrages from jsonb_array_elements(s) x cross join lateral jsonb_array_elements(x->'quantitatif'->'ouvrages') o;
  select jsonb_agg(jsonb_build_object('etageId', x->>'etageId', 'planId', x->>'planId', 'numero', (x->>'numero')::int, 'etat', x->>'etat', 'libelle', x->>'libelle', 'fige', x->>'figeLe' is not null, 'source', 'calcul'))
    into v_plans from jsonb_array_elements(s) x;
  return jsonb_build_object(
    'contract', jsonb_build_object('name', 'elsatia.tools.estimation', 'version', '1.0.0'), 'kind', 'releve-metre/estimation',
    'readiness', jsonb_build_object('status', 'contract-only', 'devis', 'not-generated', 'documentsCommerciaux', 'none'),
    'perimetre', jsonb_build_object('tools', 'estimation-simplifiee', 'decideParGestionPro', jsonb_build_array('prix_de_vente','marge','remise','tva','devis_final')),
    'montants', jsonb_build_object('devise', 'EUR', 'base', 'HT', 'nature', 'estimative'),
    'idempotencyKey', r::text || ':' || etat || ':' || md5(v_lignes::text),
    'source', jsonb_build_object('releveId', r, 'etat', etat, 'moteurs', jsonb_build_object('quantitatif', 'quantitatif-v1', 'estimation', 'estimation-v1'), 'plans', v_plans),
    'quantitatif', jsonb_build_object('contract', jsonb_build_object('name', 'elsatia.tools.quantitatif', 'version', '1.0.0'), 'kind', 'releve-metre/quantitatif', 'ouvrages', v_ouvrages, 'lignes', '[]'::jsonb),
    'pieces', '[]'::jsonb, 'prix', '[]'::jsonb, 'lignes', v_lignes,
    'totaux', jsonb_build_object('total', to_char(v_total, 'FM9999999990.00'), 'heures', '0.000', 'lignes', jsonb_array_length(v_lignes)),
    'etatsProjetes', '{}'::jsonb, 'revetements', '[]'::jsonb,
    'photos', jsonb_build_array(jsonb_build_object('ref', 'ph1', 'storagePath', 'x/y/photos/ph1.jpg', 'mimeType', 'image/jpeg', 'legende', 'Mur humide', 'pieceRef', null, 'etatDocumente', 'initial', 'priseLe', null)),
    'annotations', jsonb_build_array(jsonb_build_object('ref', 'an1', 'texte', 'Fissure', 'forme', 'fleche', 'pieceRef', null, 'cible', null)),
    'anomalies', '[]'::jsonb);
end;
$$;
grant execute on function pg_temp.contrat(uuid, text) to authenticated, service_role;
create function pg_temp.imp(p jsonb) returns jsonb language sql as $$
  select public.gp_tools_importer_estimation('db000000-0000-0000-0000-000000000001', 'existant', p) $$;
grant execute on function pg_temp.imp(jsonb) to authenticated, service_role, anon;

-- ─────────────────────────────────────────────────────────────
-- S. Schéma et droits
-- ─────────────────────────────────────────────────────────────
select ok(to_regclass('public.gp_tools_imports') is not null and to_regclass('public.gp_tools_imports_lignes') is not null
          and to_regclass('public.gp_tools_imports_journal') is not null and to_regclass('public.gp_tools_correspondances_ouvrages') is not null,
  'S1. tables import, lignes, journal, correspondances');
select ok(has_table_privilege('authenticated', 'public.gp_tools_imports', 'SELECT')
          and not has_table_privilege('authenticated', 'public.gp_tools_imports', 'INSERT')
          and not has_table_privilege('authenticated', 'public.gp_tools_imports', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.gp_tools_imports_lignes', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.gp_tools_imports_journal', 'INSERT')
          and not has_table_privilege('authenticated', 'public.gp_tools_correspondances_ouvrages', 'INSERT')
          and not has_table_privilege('anon', 'public.gp_tools_imports', 'SELECT'),
  'S2. lecture seule pour les utilisateurs, écriture par RPC, rien pour anonyme');
select ok((select bool_and(prosecdef) from pg_proc where proname in ('gp_tools_importer_estimation','gp_tools_import_comparer','gp_tools_import_creer_devis',
  'gp_tools_correspondance_enregistrer','gp_tools_import_appliquer_correspondances','gp_tools_imports_releve')), 'S3. RPC SECURITY DEFINER (contrôle explicite)');
select ok(not has_function_privilege('anon', 'public.gp_tools_importer_estimation(uuid, text, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.gp_tools_import_creer_devis(uuid, uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.gp_tools_imports_releve(uuid)', 'EXECUTE'), 'S4. anonyme : aucune RPC');
select ok(not has_function_privilege('authenticated', 'public.gp_tools_lignes_serveur(jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.gp_tools_import_garde()', 'EXECUTE'), 'S5. calcul serveur et gardes non exposés');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not public.incident_table_exemptee(c.relname)
             and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')), 0,
  'S6. mode sûr incident : toute table publique porte sa garde (Lot 10 porté sur V8 compris)');
select is(public.incident_application_table('gp_tools_imports'), 'gestion_pro', 'S7. les imports appartiennent à Gestion Pro (garde incident GP)');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name like 'tools_releves%'
           and column_name ~* '(devis|facture|commande|signature|tva|marge|remise)'), 0, 'S8. Tools reste sans devis, TVA, marge ni remise');

-- ─────────────────────────────────────────────────────────────
-- Données : relevé du métreur (tenant A) lié au chantier GP A (client déduit du chantier), un étage, une pièce 4 × 3.
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into public.tools_releves(id, entreprise_id, nom, reference, chantier_nom, chantier_gp_id) values
  ('db000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Relevé Lot 11', 'REL-11', 'Site local', 'a4000000-0000-0000-0000-000000000001');
update public.tools_releves set visibilite = 'entreprise' where id = 'db000000-0000-0000-0000-000000000001';
insert into public.tools_releves_batiments(id, releve_id, nom) values ('db200000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'Bâtiment');
insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
  ('db300000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'db200000-0000-0000-0000-000000000001', 'RDC', 0);
insert into public.tools_releves_pieces(id, releve_id, etage_id, nom, usage, hauteur_sous_plafond_mm) values
  ('db500000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'db300000-0000-0000-0000-000000000001', 'Séjour', 'sejour', 2500);
create temporary table _p on commit drop as select * from public.tools_releve_plan_creer('db300000-0000-0000-0000-000000000001', 'initial');
grant select on _p to authenticated, service_role, anon;
select public.tools_releve_plan_enregistrer((select id from _p), (select revision from public.tools_releves_plans where id = (select id from _p)), jsonb_build_object(
  'murs', '[]'::jsonb, 'ouvertures', '[]'::jsonb,
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'db500000-0000-0000-0000-000000000001',
    'points', '[{"x":0,"y":0},{"x":4000,"y":0},{"x":4000,"y":3000},{"x":0,"y":3000}]'::jsonb, 'murIds', '[]'::jsonb, 'graine', '{"x":2000,"y":1500}'::jsonb))));
select public.tools_releve_ouvrages_importer((select id from _p), jsonb_build_array(
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000001', 'donnees', pg_temp.o('{"nom":"Peinture sol","code":"PEI-SOL"}')),
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000002', 'donnees', pg_temp.o('{"nom":"Carrelage","code":"CAR-SOL","categorie":"carrelage"}')),
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000003', 'donnees', pg_temp.o('{"nom":"Nettoyage","categorie":"autre","unite":"forfait","regle":{"source":"forfait"}}')),
  jsonb_build_object('id', 'dbb00000-0000-0000-0000-000000000004', 'donnees', pg_temp.o('{"nom":"Plinthes sans prix","code":"PLI","categorie":"plinthes","unite":"ml","regle":{"source":"perimetre_utile"}}'))));
select pg_temp.px((select id from _p), 'dbb00000-0000-0000-0000-000000000001', '{"composantes":[{"type":"materiau","prixUnitaire":3.5},{"type":"main_d_oeuvre","heuresParUnite":0.25,"tauxHoraire":45}]}');
select pg_temp.px((select id from _p), 'dbb00000-0000-0000-0000-000000000002', '{"composantes":[{"type":"materiau","prixUnitaire":40}]}');
select pg_temp.px((select id from _p), 'dbb00000-0000-0000-0000-000000000003', '{"composantes":[{"type":"autre","prixUnitaire":350}]}');
create temporary table _k (nom text primary key, v jsonb) on commit drop;
grant all on _k to authenticated, service_role, anon;
insert into _k values ('p1', pg_temp.contrat('db000000-0000-0000-0000-000000000001', 'existant'));

-- ─────────────────────────────────────────────────────────────
-- I. Import
-- ─────────────────────────────────────────────────────────────
insert into _k values ('r1', pg_temp.imp((select v from _k where nom = 'p1')));
select is((select (v->>'statut') || '|' || (v->>'version') || '|' || (v->>'lignes') || '|' || (v->>'ouvrages') || '|' || (v->>'montant') from _k where nom = 'r1'),
  'importe|1|4|4|1007.00', 'I1. import : version 1, 4 lignes, 4 ouvrages, 12 m² × (3,50 + 0,25 h × 45) + 12 m² × 40 + 350 = 1 007,00 € HT (plinthes sans prix)');
reset role;
select is((select source_releve_id::text || '|' || source_etat || '|' || source_version || '|' || contract_name || '|' || contract_version || '|' || statut
           from public.gp_tools_imports where id = (select (v->>'importId')::uuid from _k where nom = 'r1')),
  'db000000-0000-0000-0000-000000000001|existant|1|elsatia.tools.estimation|1.0.0|importe', 'I2. source id, source version, contrat, statut');
select is((select chantier_id::text || '|' || client_id::text || '|' || chantier_nom || '|' || coalesce(client_nom, '∅') || '|' || releve_reference
           from public.gp_tools_imports where source_version = 1 and source_releve_id = 'db000000-0000-0000-0000-000000000001'),
  (select c.id::text || '|' || c.client_id::text || '|' || c.nom || '|' || coalesce(public.gp_tools_client_nom(cl), '∅') || '|REL-11'
   from public.chantiers c join public.clients cl on cl.id = c.client_id where c.id = 'a4000000-0000-0000-0000-000000000001'),
  'I3. dossier lu par le SERVEUR : chantier GP du relevé, client GP déduit du chantier');
select ok((select snapshot = (select v from _k where nom = 'p1') from public.gp_tools_imports where source_version = 1 and source_releve_id = 'db000000-0000-0000-0000-000000000001'),
  'I4. snapshot : contrat reçu conservé à l''identique (photos, annotations, métadonnées)');
select is((select nb_lignes || '|' || nb_lignes_sans_prix || '|' || nb_lignes_liees || '|' || nb_ouvrages from public.gp_tools_imports
           where source_version = 1 and source_releve_id = 'db000000-0000-0000-0000-000000000001'), '4|1|0|4', 'I5. compteurs : 4 lignes, 1 sans prix, aucune liée');
select is((select string_agg(designation || '=' || unite || '/' || coalesce(quantite::text, '∅') || '/' || coalesce(montant_estimatif::text, 'sans prix') || '/' || correspondance, ',' order by ordre)
           from public.gp_tools_imports_lignes where import_id = (select (v->>'importId')::uuid from _k where nom = 'r1')),
  'Peinture sol=m²/12.000/177.00/non_liee,Carrelage=m²/12.000/480.00/non_liee,Nettoyage=forfait/1.000/350.00/non_liee,Plinthes sans prix=ml/14.000/sans prix/non_liee',
  'I6. lignes normalisées : unité GP (m²), quantités, montants estimatifs, lignes non liées sans perte (ligne sans prix conservée)');
select is((select string_agg(emplacement, ',' order by ordre) from public.gp_tools_imports_lignes where import_id = (select (v->>'importId')::uuid from _k where nom = 'r1')),
  'Bâtiment › RDC › Séjour,Bâtiment › RDC › Séjour,Bâtiment › RDC,Bâtiment › RDC › Séjour', 'I7. emplacement bâtiment › étage › pièce');
select ok((select (donnees->'ligne') ? 'montants' and (donnees->'ouvrage'->>'code') = 'PEI-SOL' from public.gp_tools_imports_lignes
           where import_id = (select (v->>'importId')::uuid from _k where nom = 'r1') and ordre = 1), 'I8. ligne et ouvrage du contrat conservés sur chaque ligne');

-- ─────────────────────────────────────────────────────────────
-- D. Idempotence
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into _k values ('r1b', pg_temp.imp((select v from _k where nom = 'p1')));
select is((select (v->>'statut') || '|' || (v->>'version') from _k where nom = 'r1b'), 'deja_importe|1', 'D1. même dossier renvoyé : déjà importé, version 1');
select is((select v->>'importId' from _k where nom = 'r1b'), (select v->>'importId' from _k where nom = 'r1'), 'D2. même import id');
insert into _k values ('r1c', pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{idempotencyKey}', '"autre-cle-client"')));
select is((select v->>'statut' from _k where nom = 'r1c'), 'deja_importe', 'D3. clé client différente, contenu identique : pas de doublon (empreinte serveur)');
reset role;
select is((select count(*)::int from public.gp_tools_imports where source_releve_id = 'db000000-0000-0000-0000-000000000001'), 1, 'D4. un seul import en base');
select is((select count(*)::int from public.gp_tools_imports_journal where source_releve_id = 'db000000-0000-0000-0000-000000000001' and action = 'reimport_identique'), 2,
  'D5. chaque réimport identique est tracé');

-- ─────────────────────────────────────────────────────────────
-- K. Contrat
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{contract,name}', '"elsatia.tools.autre"')) $$,
  '22023', 'Contrat inconnu : elsatia.tools.autre (attendu : elsatia.tools.estimation)', 'K1. contrat inconnu refusé');
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{contract,version}', '"2.0.0"')) $$,
  '22023', 'Version de contrat non prise en charge : 2.0.0 (Gestion Pro accepte elsatia.tools.estimation 1.x)', 'K2. version inconnue (majeure 2) refusée');
select is(pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{contract,version}', '"1.3.0"'))->>'statut', 'deja_importe',
  'K3. mineure 1.x acceptée (compatibilité ascendante), même contenu : aucun doublon');
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p1') || '{"tauxTva": 20}') $$, '22023',
  'Donnée commerciale interdite dans le contrat (devis, facture, commande, marge, remise, TVA, prix de vente) : Gestion Pro en décide', 'K4. TVA transmise par Tools refusée');
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{lignes,0,prixVente}', '"99.00"')) $$, '22023', null, 'K5. prix de vente dans une ligne refusé');
select throws_ok($$ select public.gp_tools_importer_estimation('db000000-0000-0000-0000-000000000001', 'projete', (select v from _k where nom = 'p1')) $$,
  '22023', 'Le contrat ne correspond pas au relevé ou à l''état envoyé', 'K6. contrat d''un autre état refusé');
select throws_ok($$ select public.gp_tools_importer_estimation('db000000-0000-0000-0000-000000000001', 'demain', (select v from _k where nom = 'p1')) $$,
  '22023', 'État de synthèse inconnu : demain', 'K7. état inconnu');
select throws_ok($$ select pg_temp.imp(null) $$, '22023', 'Contrat absent ou illisible', 'K8. contrat absent');
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{lignes}', ((select v from _k where nom = 'p1')->'lignes') || jsonb_build_array((select v from _k where nom = 'p1')->'lignes'->0))) $$,
  '22023', 'Ligne en double dans le contrat', 'K9. ligne en double refusée');

-- ─────────────────────────────────────────────────────────────
-- O. Le serveur fait foi
-- ─────────────────────────────────────────────────────────────
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{lignes,1,montantRetenu}', '"1.00"')) $$, 'PT409', null, 'O1. montant forgé : refusé (PT409)');
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{totaux,total}', '"1.00"')) $$, 'PT409', null, 'O2. total forgé : refusé');
select throws_ok($$ select pg_temp.imp(jsonb_set((select v from _k where nom = 'p1'), '{lignes}', ((select v from _k where nom = 'p1')->'lignes') - 0)) $$, 'PT409', null, 'O3. ligne omise : refusée');
-- Ouvrage supprimé dans Tools après la préparation du contrat : l'ancien contrat ne passe plus.
select public.tools_releve_ouvrage_supprimer((select id from _p), 'dbb00000-0000-0000-0000-000000000004');
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p1')) $$, 'PT409',
  'L''estimation a changé depuis son chargement (plan, ouvrage, prix ou quantité modifiés ou supprimés) : rechargez-la puis renvoyez-la', 'O4. ouvrage supprimé depuis : envoi obsolète refusé, message explicite');

-- ─────────────────────────────────────────────────────────────
-- N. Nouvelle version (jamais d'écrasement)
-- ─────────────────────────────────────────────────────────────
insert into _k values ('p2', pg_temp.contrat('db000000-0000-0000-0000-000000000001', 'existant'));
insert into _k values ('r2', pg_temp.imp((select v from _k where nom = 'p2')));
select is((select (v->>'statut') || '|' || (v->>'version') || '|' || (v->>'montant') || '|' || (v->>'precedentImportId') from _k where nom = 'r2'),
  'nouvelle_version|2|1007.00|' || (select v->>'importId' from _k where nom = 'r1'), 'N1. nouvelle version 2 liée à la précédente');
reset role;
select is((select statut || '|' || (nouvelle_version_id = (select (v->>'importId')::uuid from _k where nom = 'r2'))::text || '|' || montant_estimatif_ht::text || '|' || nb_lignes
           from public.gp_tools_imports where id = (select (v->>'importId')::uuid from _k where nom = 'r1')),
  'remplace|true|1007.00|4', 'N2. version 1 intacte (montant, lignes), signalée « nouvelle version disponible »');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
insert into _k values ('cmp12', public.gp_tools_import_comparer((select (v->>'importId')::uuid from _k where nom = 'r1'), (select (v->>'importId')::uuid from _k where nom = 'r2')));
select is((select (v->>'ecart') || '|' || (v->'compteurs'->>'supprimees') || '|' || (v->'compteurs'->>'identiques') || '|' || (v->'lignes'->0->>'statut') || '|' || (v->'lignes'->0->>'designation') from _k where nom = 'cmp12'),
  '0.00|1|3|supprimee|Plinthes sans prix', 'N3. comparaison v1 → v2 : ouvrage (sans prix) supprimé, écart nul');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select pg_temp.px((select id from _p), 'dbb00000-0000-0000-0000-000000000002', '{"composantes":[{"type":"materiau","prixUnitaire":45}]}');
select pg_temp.px((select id from _p), 'dbb00000-0000-0000-0000-000000000003', '{"composantes":[{"type":"autre","prixUnitaire":350}]}');

-- ─────────────────────────────────────────────────────────────
-- Q. Devis brouillon explicite côté GP (Dirigeant A)
-- ─────────────────────────────────────────────────────────────
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
select throws_ok(format($$ select public.gp_tools_import_creer_devis(%L) $$, (select v->>'importId' from _k where nom = 'r1')), 'PT409',
  'Une version plus récente de ce relevé a été importée (version 2) : comparez-la, puis créez le devis depuis la dernière version', 'Q1. version périmée : devis refusé');
insert into _k values ('d2', to_jsonb(public.gp_tools_import_creer_devis((select (v->>'importId')::uuid from _k where nom = 'r2'))));
reset role;
select is((select d.statut || '|' || coalesce(d.numero, 'sans numéro') || '|' || d.client_id::text || '|' || d.chantier_id::text from public.devis d where d.id = (select (v#>>'{}')::uuid from _k where nom = 'd2')),
  'brouillon|sans numéro|' || (select client_id::text from public.chantiers where id = 'a4000000-0000-0000-0000-000000000001') || '|a4000000-0000-0000-0000-000000000001',
  'Q2. devis BROUILLON sans numéro officiel, client et chantier GP');
select is((select string_agg(designation || '|' || type || '|' || quantite::text || '|' || unite || '|' || prix_unitaire_ht::text || '|' || taux_tva::text, ',' order by ordre)
           from public.lignes_devis where devis_id = (select (v#>>'{}')::uuid from _k where nom = 'd2')),
  'Peinture sol|fourniture|12.000|m²|14.7500|20,Carrelage|fourniture|12.000|m²|40.0000|20,Nettoyage|fourniture|1.000|forfait|350.0000|20',
  'Q3. lignes non liées : désignation Tools, base estimative HT comme point de départ, TVA par défaut GP');
select is((select montant_ht::text || '|' || montant_tva::text || '|' || montant_ttc::text from public.devis where id = (select (v#>>'{}')::uuid from _k where nom = 'd2')),
  '1007.00|201.40|1208.40', 'Q4. totaux calculés par GP (HT, TVA, TTC) : la TVA est décidée dans GP');
select is((select statut || '|' || (devis_id = (select (v#>>'{}')::uuid from _k where nom = 'd2'))::text || '|' || (devis_cree_par = '10000000-0000-0000-0000-000000000006')::text
           from public.gp_tools_imports where id = (select (v->>'importId')::uuid from _k where nom = 'r2')), 'devis_cree|true|true', 'Q5. import marqué « devis créé », par qui');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
select throws_ok(format($$ select public.gp_tools_import_creer_devis(%L) $$, (select v->>'importId' from _k where nom = 'r2')), '23505',
  'Un devis a déjà été créé depuis cet import', 'Q6. un seul devis par import (double clic sans doublon)');
-- Le devis est travaillé dans GP (prix de vente, remise) puis Tools renvoie une nouvelle estimation.
reset role;
update public.lignes_devis set prix_unitaire_ht = 60 where devis_id = (select (v#>>'{}')::uuid from _k where nom = 'd2') and designation = 'Carrelage';
insert into _k select 'ht_travaille', to_jsonb(montant_ht) from public.devis where id = (select (v#>>'{}')::uuid from _k where nom = 'd2');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into _k values ('p3', pg_temp.contrat('db000000-0000-0000-0000-000000000001', 'existant'));
insert into _k values ('r3', pg_temp.imp((select v from _k where nom = 'p3')));
select is((select (v->>'statut') || '|' || (v->>'version') || '|' || (v->>'devisPrecedent') || '|' || (v->>'montant') from _k where nom = 'r3'), 'nouvelle_version|3|true|1067.00',
  'Q7. Tools renvoie une nouvelle version (carrelage 45 €) : version 3, devis précédent signalé');
reset role;
select is((select montant_ht::text || '|' || (select string_agg(prix_unitaire_ht::text, ',' order by ordre) from public.lignes_devis where devis_id = d.id) from public.devis d
           where d.id = (select (v#>>'{}')::uuid from _k where nom = 'd2')),
  (select v#>>'{}' from _k where nom = 'ht_travaille') || '|14.7500,60,350.0000', 'Q8. le devis déjà travaillé n''est JAMAIS modifié par le réimport');
select is((select statut || '|' || (nouvelle_version_id = (select (v->>'importId')::uuid from _k where nom = 'r3'))::text from public.gp_tools_imports
           where id = (select (v->>'importId')::uuid from _k where nom = 'r2')), 'devis_cree|true', 'Q9. version 2 : reste « devis créé », nouvelle version disponible');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
select is((select (c->>'ecart') || '|' || (c->'compteurs'->>'modifiees') || '|' || (c->'parLot'->0->>'lot') || '|' || (c->'lignes'->0->>'montantA') || '→' || (c->'lignes'->0->>'montantB')
           from (select public.gp_tools_import_comparer((select (v->>'importId')::uuid from _k where nom = 'r2'), (select (v->>'importId')::uuid from _k where nom = 'r3')) as c) x),
  '60.00|1|Carrelage|480.00→540.00', 'Q10. comparaison v2 → v3 : écart par lot et par ligne');

-- ─────────────────────────────────────────────────────────────
-- M. Correspondances ouvrage Tools → prestation GP
-- ─────────────────────────────────────────────────────────────
reset role;
insert into public.prestations_catalogue (id, entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva)
values ('dbc00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Carrelage grès 60×60 posé', 'fourniture', 'm²', 72.00, 10),
       ('dbc00000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'Prestation B', 'fourniture', 'm²', 1, 20);
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
select lives_ok($$ select public.gp_tools_correspondance_enregistrer('a0000000-0000-0000-0000-000000000001', 'car-sol|m2', 'Carrelage', 'dbc00000-0000-0000-0000-000000000001') $$,
  'M1. correspondance ouvrage Tools (clé code|unité) → prestation GP');
select throws_ok($$ select public.gp_tools_correspondance_enregistrer('a0000000-0000-0000-0000-000000000001', 'pei-sol|m2', 'Peinture', 'dbc00000-0000-0000-0000-00000000000b') $$,
  '42501', 'Prestation introuvable dans cette entreprise', 'M2. prestation d''un autre tenant refusée');
select is(public.gp_tools_import_appliquer_correspondances((select (v->>'importId')::uuid from _k where nom = 'r3')), 1, 'M3. correspondances appliquées à l''import v3 : 1 ligne liée');
insert into _k values ('d3', to_jsonb(public.gp_tools_import_creer_devis((select (v->>'importId')::uuid from _k where nom = 'r3'))));
reset role;
select is((select designation || '|' || prix_unitaire_ht::text || '|' || taux_tva::text || '|' || quantite::text from public.lignes_devis
           where devis_id = (select (v#>>'{}')::uuid from _k where nom = 'd3') and ordre = 2),
  'Carrelage grès 60×60 posé|72.00|10.00|12.000', 'M4. ligne liée : prestation, PRIX DE VENTE et TVA du catalogue GP, quantité Tools');
-- Prestation GP supprimée (ouvrage GP supprimé) : la ligne redevient non liée, sans perdre ses données.
delete from public.prestations_catalogue where id = 'dbc00000-0000-0000-0000-000000000001';
select is((select correspondance || '|' || coalesce(prestation_id::text, 'null') || '|' || designation || '|' || montant_estimatif::text from public.gp_tools_imports_lignes
           where import_id = (select (v->>'importId')::uuid from _k where nom = 'r3') and ouvrage_code = 'CAR-SOL'), 'liee|null|Carrelage|540.00',
  'M5. prestation supprimée : lien retiré par la base, données Tools intactes');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
select is(public.gp_tools_import_appliquer_correspondances((select (v->>'importId')::uuid from _k where nom = 'r3')), 1,
  'M6. réapplication : la ligne dont la prestation a disparu redevient « non liée »');
reset role;
select is((select string_agg(correspondance, ',' order by ordre) || '|' || (select nb_lignes_liees from public.gp_tools_imports where id = (select (v->>'importId')::uuid from _k where nom = 'r3'))
           from public.gp_tools_imports_lignes where import_id = (select (v->>'importId')::uuid from _k where nom = 'r3')),
  'non_liee,non_liee,non_liee|0', 'M7. lignes « non liées », compteur à jour');

-- ─────────────────────────────────────────────────────────────
-- X. Import interrompu : tout ou rien
-- ─────────────────────────────────────────────────────────────
create function pg_temp.panne() returns trigger language plpgsql as $$ begin if new.ordre = 2 then raise exception 'panne simulée' using errcode = '08006'; end if; return new; end $$;
create trigger gp_tools_panne before insert on public.gp_tools_imports_lignes for each row execute function pg_temp.panne();
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select pg_temp.px((select id from _p), 'dbb00000-0000-0000-0000-000000000001', '{"composantes":[{"type":"materiau","prixUnitaire":5}]}');
insert into _k values ('p4', pg_temp.contrat('db000000-0000-0000-0000-000000000001', 'existant'));
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p4')) $$, '08006', 'panne simulée', 'X1. panne au milieu de l''écriture des lignes');
reset role;
select is((select count(*)::int || '|' || max(source_version) from public.gp_tools_imports where source_releve_id = 'db000000-0000-0000-0000-000000000001')
          || '|' || (select count(*) from public.gp_tools_imports_journal where source_version = 4), '3|3|0', 'X2. rien d''écrit : ni import, ni ligne, ni journal');
drop trigger gp_tools_panne on public.gp_tools_imports_lignes;
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into _k values ('r4', pg_temp.imp((select v from _k where nom = 'p4')));
select is((select (v->>'statut') || '|' || (v->>'version') from _k where nom = 'r4'), 'nouvelle_version|4', 'X3. reprise : version 4, sans trou ni doublon');
select is((select v->>'statut' from (select pg_temp.imp((select v from _k where nom = 'p4')) v) x), 'deja_importe', 'X4. renvoi après reprise : idempotent');

-- ─────────────────────────────────────────────────────────────
-- A. Audit
-- ─────────────────────────────────────────────────────────────
reset role;
select is((select string_agg(action || ':' || coalesce(source_version::text, '-'), ',' order by source_version, action = 'devis_cree')
           from public.gp_tools_imports_journal where source_releve_id = 'db000000-0000-0000-0000-000000000001' and action in ('import','nouvelle_version','devis_cree')),
  'import:1,nouvelle_version:2,devis_cree:2,nouvelle_version:3,devis_cree:3,nouvelle_version:4', 'A1. journal : import, nouvelles versions, devis créés');
select is((select string_agg(distinct auteur_id::text, ',') from public.gp_tools_imports_journal where source_releve_id = 'db000000-0000-0000-0000-000000000001' and action in ('import','nouvelle_version')),
  '10000000-0000-0000-0000-000000000001', 'A2. qui : l''auteur de chaque transmission');
select is((select count(*)::int from public.journal_activite where ressource = 'import_tools' and entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 4,
  'A3. journal d''activité GP : un événement par import ou réimport');
select ok((select bool_and(details ? 'contractVersion') from public.gp_tools_imports_journal where source_releve_id = 'db000000-0000-0000-0000-000000000001' and action in ('import','nouvelle_version','reimport_identique')),
  'A4. version de contrat tracée à chaque transmission');

-- ─────────────────────────────────────────────────────────────
-- T. Sécurité
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000004');
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p4')) $$, '42501',
  'Envoi vers Gestion Pro non autorisé : rôle métreur ou administrateur Relevé et permission Gestion Pro « gerer_ouvrages » requis', 'T1. métreur sans permission GP gerer_ouvrages : refusé');
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p4')) $$, '42501', null, 'T2. consultation Relevé : refusé');
select is(jsonb_array_length(public.gp_tools_imports_releve('db000000-0000-0000-0000-000000000001')), 4, 'T3. consultation : voit l''état des envois depuis Tools');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p4')) $$, '42501', 'Relevé introuvable ou non accessible', 'T4. autre tenant : relevé indiscernable d''un relevé inexistant');
select is((select count(*)::int from public.gp_tools_imports) + (select count(*)::int from public.gp_tools_imports_lignes) + (select count(*)::int from public.gp_tools_imports_journal), 0,
  'T5. autre tenant : aucun import, aucune ligne, aucun journal visibles');
select throws_ok(format($$ select public.gp_tools_import_comparer(%L, %L) $$, (select v->>'importId' from _k where nom = 'r3'), (select v->>'importId' from _k where nom = 'r4')), '42501', null,
  'T6. autre tenant : comparaison refusée');
select throws_ok(format($$ select public.gp_tools_import_creer_devis(%L, 'b3000000-0000-0000-0000-000000000001') $$, (select v->>'importId' from _k where nom = 'r4')), '42501', null,
  'T7. autre tenant : création de devis refusée');
select throws_ok($$ select public.gp_tools_imports_releve('db000000-0000-0000-0000-000000000001') $$, '42501', null, 'T8. autre tenant : état des envois refusé');
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
select throws_ok(format($$ select public.gp_tools_import_creer_devis(%L, 'b3000000-0000-0000-0000-000000000001') $$, (select v->>'importId' from _k where nom = 'r4')), '42501',
  'Client introuvable dans cette entreprise', 'T9. client d''un autre tenant refusé');
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.gp_tools_imports), 0, 'T10. ouvrier sans accès devis : imports invisibles');
reset role;
select throws_ok($$ update public.gp_tools_imports set snapshot = '{}'::jsonb, montant_estimatif_ht = 0 where source_version = 1 and source_releve_id = 'db000000-0000-0000-0000-000000000001' $$,
  '42501', 'Import Tools immuable : le snapshot reçu ne peut pas être modifié', 'T11. snapshot immuable, même pour le propriétaire des tables');
set local role anon;
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p4')) $$, '42501', null, 'T12. anonyme : refusé');

-- Gestion Pro inaccessible (abonnement GP suspendu) : aucun import.
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select throws_ok($$ select pg_temp.imp((select v from _k where nom = 'p4')) $$, '42501', null, 'T13. Gestion Pro suspendu pour l''entreprise : import refusé');
reset role;
select is((select count(*)::int from public.gp_tools_imports where source_releve_id = 'db000000-0000-0000-0000-000000000001'), 4, 'T14. GP inaccessible : rien d''écrit');

select * from finish();
rollback;
