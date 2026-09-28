-- Train canonique V7 — contrôles MÉTIER sur la base upgradée V6 → V7 (scripts/qualification/upgrade-v6-v7.sh §7).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V7_CONVERGENCE_V1.md §11.
--
-- Rejoue, sur les données V5 / V6 réelles du jeu d'upgrade (upgrade_v5_v6_seed_complement.sql puis
-- upgrade_v6_v7_seed_complement.sql), les comportements introduits par V7. Transaction ANNULÉE :
-- la base upgradée n'est pas modifiée.
--   L  Relevé & Métré Lot 7 (…0928 701) : plans figés V5 / V6 intacts et recalculables, équipement
--      Lot 2 toujours valide, objets de plan sur un plan V6 dérivé, verrou, liaison au mur, corbeille,
--      plan projeté dérivé, isolation ;
--   Y  surface de la pièce V6 : valeur conservée, synchronisation toujours active via le RPC Lot 7 ;
--   G  RGPD contrats V2 : toujours rien d'activé ;
--   S  Stripe (réabonnement V5 intact), D  Réserves D-01, I  identité / Studio du projet partagé.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

create function pg_temp.en_session(p uuid) returns text language sql as $$
  select set_config('role', 'authenticated', true)
      || set_config('request.jwt.claim.sub', p::text, true)
      || set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role', 'postgres', true)
      || set_config('request.jwt.claim.sub', '', true)
      || set_config('request.jwt.claims', '', true)
$$;
create function pg_temp.plan(p_etat text) returns uuid language sql security definer as $$
  select id from public.tools_releves_plans where etage_id = 'f5300000-0000-4000-8000-000000000001' and etat_documente = p_etat
    and deleted_at is null order by numero desc limit 1
$$;
create function pg_temp.rev(p uuid) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p
$$;
create function pg_temp.surface(p uuid) returns numeric language sql security definer as $$
  select surface_calculee_mm2 from public.tools_releves_pieces where id = p
$$;
create function pg_temp.mur_as_built() returns uuid language sql security definer as $$
  select id from public.tools_releves_elements where plan_id = pg_temp.plan('as_built') and type = 'mur' and deleted_at is null order by id limit 1
$$;
create function pg_temp.obj(id text, objet text, categorie text, x int, y int, extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'pieceId', 'f5500000-0000-4000-8000-000000000001', 'donnees', jsonb_build_object('categorie', categorie, 'objet', objet,
    'libelle', initcap(objet), 'position', jsonb_build_object('x', x, 'y', y), 'rotationRad', 0, 'largeurMm', 800, 'profondeurMm', 600,
    'hauteurMm', 750, 'niveauMm', 0, 'visible', true, 'verrouille', false, 'pieceAuto', true) || extra) $$;
create function pg_temp.save(p uuid, mods jsonb) returns jsonb language sql as $$
  select public.tools_releve_plan_enregistrer(p, pg_temp.rev(p), mods) $$;
grant execute on function pg_temp.plan(text), pg_temp.rev(uuid), pg_temp.surface(uuid), pg_temp.mur_as_built(),
  pg_temp.obj(text, text, text, int, int, jsonb), pg_temp.save(uuid, jsonb) to authenticated;
do $$ begin execute format('grant temporary on database %I to authenticated', current_database()); end $$;
create temporary table _figes as select * from public.tools_releves_plans
  where etage_id = 'f5300000-0000-4000-8000-000000000001' and fige_le is not null;
create temporary table _versions as select id, md5(contenu::text) as h, empreinte from public.tools_releves_versions
  where releve_id = 'f5000000-0000-4000-8000-000000000001';
create temporary table _lot2 as select id, donnees from public.tools_releves_elements where id = 'f6900000-0000-4000-8000-000000000001';
grant select on _figes, _versions, _lot2 to authenticated;

-- ── L. Relevé & Métré Lot 7 sur les plans V5 / V6 ─────────────────────────────────────
select is((select count(*)::int from _figes where etat_documente in ('initial', 'corrige')), 2,
  'L01 jeu : plan initial figé V5 et plan corrigé figé V6 présents');
select ok((select bool_and(empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(id)::text, 'UTF8'), 'sha256'), 'hex')) from _figes),
  'L02 plans figés V5 / V6 : empreinte SHA-256 recalculée à l''identique par le contenu Lot 7');
select ok((select bool_and(not (public.tools_releve_plan_contenu(id) ? 'equipements')) from _figes),
  'L03 plans figés sans objet : pas de clé « equipements » dans le contenu');
select ok((select e.donnees = l.donnees and e.plan_id is null and e.deleted_at is null
                  and public.tools_releve_element_donnees_valides('equipement', e.donnees)
             from public.tools_releves_elements e join _lot2 l using (id)),
  'L04 équipement Lot 2 hors plan : intact et toujours valide pour le contrat générique V7');
select ok((select pg_get_constraintdef(oid) like '%equipement%' from pg_constraint where conname = 'tools_releves_elements_plan_type'),
  'L05 contrainte des éléments de plan : équipement admis');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003');
select is((pg_temp.save(pg_temp.plan('as_built'), jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('f6a00000-0000-4000-8000-000000000001', 'wc', 'sanitaire', 600, 500),
    pg_temp.obj('f6a00000-0000-4000-8000-000000000002', 'radiateur', 'cvc', 2000, 150,
      jsonb_build_object('murId', pg_temp.mur_as_built(), 'face', 'gauche', 'decalageMm', 1500, 'niveauMm', 150)))))->>'equipements')::int, 2,
  'L06 plan « as built » dérivé en V6 : deux objets posés (dont un lié à un mur copié)');
select is((select count(*)::int from public.tools_releve_plan_elements(pg_temp.plan('as_built')) where type = 'equipement'), 2,
  'L07 lecture rapide du plan (RPC Lot 6) : objets relus');
select throws_ok($$ select pg_temp.save(pg_temp.plan('corrige'), jsonb_build_object('equipements', jsonb_build_array(pg_temp.obj('f6a00000-0000-4000-8000-000000000009', 'wc', 'sanitaire', 0, 0)))) $$,
  '42501', null, 'L08 plan corrigé figé en V6 : aucun objet ajouté');
select throws_ok($$ select pg_temp.save(pg_temp.plan('as_built'), jsonb_build_object('equipements', jsonb_build_array(
    pg_temp.obj('f6a00000-0000-4000-8000-000000000003', 'prise', 'electricite', 0, 0, '{"murId":"f6600000-0000-4000-8000-0000000000ff","face":"gauche","decalageMm":100}')))) $$,
  '22023', 'L''objet est lié à un mur absent du plan.', 'L09 liaison à un mur absent du plan : refusée');
select pg_temp.save(pg_temp.plan('as_built'), jsonb_build_object('equipements', jsonb_build_array(
  pg_temp.obj('f6a00000-0000-4000-8000-000000000001', 'wc', 'sanitaire', 600, 500, '{"verrouille":true}'))));
select throws_ok($$ select pg_temp.save(pg_temp.plan('as_built'), '{"supprimes":["f6a00000-0000-4000-8000-000000000001"]}'::jsonb) $$,
  '22023', 'Objet verrouillé : déverrouillez-le d''abord.', 'L10 objet verrouillé : suppression refusée');
select lives_ok($$ select pg_temp.save(pg_temp.plan('as_built'), '{"supprimes":["f6a00000-0000-4000-8000-000000000002"]}'::jsonb) $$,
  'L11 suppression douce d''un objet non verrouillé');
select is((select array_agg(id::text) from public.tools_releve_plan_equipements_supprimes(pg_temp.plan('as_built'))),
  array['f6a00000-0000-4000-8000-000000000002'], 'L12 corbeille du plan : l''objet supprimé');
select pg_temp.save(pg_temp.plan('as_built'), jsonb_build_object('contours', jsonb_build_array(jsonb_build_object('pieceId', 'f5500000-0000-4000-8000-000000000001',
  'points', '[{"x":0,"y":0},{"x":5200,"y":0},{"x":5200,"y":4200},{"x":0,"y":4200}]'::jsonb))));
select is(pg_temp.surface('f5500000-0000-4000-8000-000000000001'), 21840000.0,
  'L13 contour enregistré par le RPC Lot 7 : surface du Séjour synchronisée par le serveur (21,84 m², plan as built)');
select lives_ok($$ select public.tools_releve_plan_creer('f5300000-0000-4000-8000-000000000001', 'projete', pg_temp.plan('as_built'), 'Projet V7') $$,
  'L14 plan projeté dérivé du plan « as built »');
select is((select string_agg((donnees->>'objet') || ':' || (donnees->>'origineId'), ',') from public.tools_releves_elements
            where plan_id = pg_temp.plan('projete') and type = 'equipement' and deleted_at is null),
  'wc:f6a00000-0000-4000-8000-000000000001', 'L15 plan projeté : objet actif copié avec sa lignée');
select is(pg_temp.surface('f5500000-0000-4000-8000-000000000001'), 21840000.0,
  'L16 plan projeté : n''alimente pas la surface de la pièce (décision V6 conservée)');
select pg_temp.en_session('20000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.tools_releves_elements where releve_id = 'f5000000-0000-4000-8000-000000000001' and type = 'equipement'), 0,
  'L17 autre tenant : aucun objet visible');
select pg_temp.en_service();
select ok((select bool_and(p.contours = f.contours and p.revision = f.revision and p.empreinte = f.empreinte and p.fige_le = f.fige_le)
             from public.tools_releves_plans p join _figes f using (id)), 'L18 plans figés V5 / V6 non touchés');
select set_eq($$ select id, md5(contenu::text), empreinte from public.tools_releves_versions where releve_id = 'f5000000-0000-4000-8000-000000000001' $$,
              $$ select id, h, empreinte from _versions $$, 'L19 versions figées (V4, V5, V6) intactes');

-- ── Y. Surface V6 ───────────────────────────────────────────────────────────────────────
select is((select count(*)::int from public.tools_releves_journal where entite = 'piece' and entite_id = 'f5500000-0000-4000-8000-000000000001'
            and details ? 'source' and details->>'plan_id' = pg_temp.plan('as_built')::text), 1,
  'Y01 journal : synchronisation tracée depuis le plan « as built »');
select is((select count(*)::int from platform.tools_releve_surface_autorisations), 0, 'Y02 aucune autorisation de surface résiduelle');

-- ── G. RGPD contrats V2 ────────────────────────────────────────────────────────────────
select is(platform.etat_politique_contrats(), 'duree_requise', 'G01 état effectif après upgrade : duree_requise (fail-closed)');
select is((select politique || '|' || coalesce(duree_conservation::text, '∅') || '|' || coalesce(array_to_string(regles_depart, '+'), '∅')
                  || '|' || coalesce(regle_depart_repli, '∅') || '|' || choix_photos_explicite::text || '|' || inclure_photos::text
             from platform.purge_politique_contrats),
  'conserver_contrat_minimise|∅|∅|∅|false|false', 'G02 aucune durée, aucun point de départ, aucun choix des photos');
select throws_ok($$ select * from public.purger_contrats_conserves_echus() $$, 'P0001', null,
  'G03 suppression des instantanés échus refusée (politique non active)');

-- ── S. Stripe, D. Réserves D-01, I. identité / Studio ──────────────────────────────────
select is((select stripe_customer_id || '|' || stripe_subscription_id from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070'),
  'cus_upg4_70|sub_upg6_v5', 'S01 réabonnement V5 intact (même client, nouvelle subscription)');
select is((select count(*)::int from public.stripe_subscriptions_remplacees where stripe_subscription_id = 'sub_upg4_70'), 1,
  'S02 ancienne subscription toujours historisée');
select pg_temp.en_session('c9000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.reserves_commenter((select id from public.reserves where titre = 'UPG5 R1 — Tuiles cassées'), 'après V7', null, gen_random_uuid()) $$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', 'D01 hôte suspendu : intervenant toujours en lecture seule');
select is((select count(*)::int from public.reserves where chantier_id = 'e9000000-0000-0000-0000-000000000001'), 2,
  'D02 lecture conservée');
select pg_temp.en_service();
select is((select count(*)::int from public.elsatia_identity_subjects) + (select count(*)::int from public.elsatia_identity_outbox), 0,
  'I01 identité centrale : toujours inerte (0 sujet, 0 message)');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public'
            and table_name like 'studio\_%' and grantee = 'anon' and privilege_type <> 'SELECT'), 0,
  'I02 tables Studio du projet partagé : aucune écriture anon (Studio OFF, inchangé)');
select is((select count(*)::int from pg_tables where schemaname in ('public', 'platform') and tablename in
            ('studio_render_limits', 'studio_usage_events', 'studio_brand_kits', 'studio_render_shares', 'studio_workspace_invitations')), 0,
  'I03 aucune table du lot Studio post-H dans le projet partagé (chaîne dédiée seulement)');

select * from finish();
rollback;
