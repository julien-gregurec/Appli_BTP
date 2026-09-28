-- Train canonique V6 — contrôles MÉTIER sur la base upgradée V5 → V6 (scripts/qualification/upgrade-v5-v6.sh §7).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V6_CONVERGENCE_V1.md §10.
--
-- Rejoue, sur les données V5 réelles du jeu d'upgrade (upgrade_v5_v6_seed_complement.sql), les
-- comportements introduits par V6. Transaction ANNULÉE : la base upgradée n'est pas modifiée.
--   R  Relevé & Métré Lot 6 (…0928 401) sur un plan 2D V5 (figé + corrigé dérivé) ;
--   Y  surface de la pièce synchronisée par le serveur (…0928 601) : pas de reprise à l'upgrade,
--      écriture au premier enregistrement de contour, garde Lot 3 intacte ;
--   G  RGPD contrats V2 (…0928 501) : paramétrage présent, rien d'activé, purge refusée ;
--   S  Stripe (réabonnement V5 intact), D  Réserves D-01 (lecture seule maintenue),
--   I  identité / Studio du projet partagé (inerte, inchangé).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

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
$$;
create function pg_temp.rev(p uuid) returns bigint language sql security definer as $$
  select revision from public.tools_releves_plans where id = p
$$;
create function pg_temp.surface(p uuid) returns numeric language sql security definer as $$
  select surface_calculee_mm2 from public.tools_releves_pieces where id = p
$$;
grant execute on function pg_temp.plan(text), pg_temp.rev(uuid), pg_temp.surface(uuid) to authenticated;
do $$ begin execute format('grant temporary on database %I to authenticated', current_database()); end $$;
create temporary table _fige as select * from public.tools_releves_plans where id = pg_temp.plan('initial');
create temporary table _versions as select id, md5(contenu::text) as h, empreinte from public.tools_releves_versions
  where releve_id = 'f5000000-0000-4000-8000-000000000001';
grant select on _fige, _versions to authenticated;

-- ── R. Relevé & Métré Lot 6 sur un plan V5 ─────────────────────────────────────────────
select ok((select fige_le is not null and empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(id)::text, 'UTF8'), 'sha256'), 'hex')
             from _fige),
  'R01 plan V5 figé : empreinte SHA-256 toujours vérifiable (contenu inchangé par l''upgrade)');
select is((select count(*)::int from public.tools_releves_elements e
            where e.releve_id = 'f5000000-0000-4000-8000-000000000001' and e.type = 'ouverture' and e.deleted_at is null
              and public.tools_releve_plan_ouverture_anomalie(e.donnees,
                    (select sqrt(((m.donnees->'b'->>'x')::numeric - (m.donnees->'a'->>'x')::numeric) ^ 2
                               + ((m.donnees->'b'->>'y')::numeric - (m.donnees->'a'->>'y')::numeric) ^ 2)
                       from public.tools_releves_elements m where m.id = e.parent_element_id),
                    null) is not null), 0,
  'R02 ouvertures V5 (sans attribut de menuiserie) valides pour le contrôle Lot 6');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003');
select set_eq($$ select id, type, piece_id, parent_element_id, donnees from public.tools_releve_plan_elements(pg_temp.plan('corrige')) $$,
              $$ select id, type, piece_id, parent_element_id, donnees from public.tools_releves_elements
                  where plan_id = pg_temp.plan('corrige') and deleted_at is null $$,
  'R03 lecture rapide du plan V5 (RPC Lot 6) = lecture sous RLS');
select is((select count(*)::int from public.tools_releve_plan_elements(pg_temp.plan('corrige')) where type = 'ouverture'), 1,
  'R04 le plan corrigé dérivé en V5 porte la copie de l''ouverture');
select lives_ok($$ select public.tools_releve_plan_enregistrer(pg_temp.plan('corrige'), pg_temp.rev(pg_temp.plan('corrige')), jsonb_build_object(
    'ouvertures', jsonb_build_array(jsonb_build_object('id', (select id from public.tools_releves_elements where plan_id = pg_temp.plan('corrige') and type = 'ouverture'),
      'murId', (select parent_element_id from public.tools_releves_elements where plan_id = pg_temp.plan('corrige') and type = 'ouverture'),
      'donnees', '{"decalageMm":1000,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche","vantaux":1,"poussee":"poussant","modele":"battant"}'::jsonb)))) $$,
  'R05 ouverture V5 enrichie des attributs de menuiserie Lot 6');
select throws_ok($$ select public.tools_releve_plan_enregistrer(pg_temp.plan('corrige'), pg_temp.rev(pg_temp.plan('corrige')), jsonb_build_object(
    'ouvertures', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(),
      'murId', (select parent_element_id from public.tools_releves_elements where plan_id = pg_temp.plan('corrige') and type = 'ouverture'),
      'donnees', '{"decalageMm":0,"largeurMm":6000,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"baie","sens":"coulissant"}'::jsonb)))) $$,
  '22023', null, 'R06 ouverture plus large que son mur V5 : refusée par le serveur');
select throws_ok($$ select public.tools_releve_plan_enregistrer(pg_temp.plan('initial'), pg_temp.rev(pg_temp.plan('initial')), '{}') $$,
  '42501', null, 'R07 plan V5 figé : toujours immuable');
select is((select count(*)::int from public.tools_releves_elements where type = 'photo_anchor' and id = 'f6800000-0000-4000-8000-000000000001' and deleted_at is null), 1,
  'R08 photo rattachée à un mur du plan V5 : ancre conservée');

-- ── Y. Surface de la pièce ─────────────────────────────────────────────────────────────
select pg_temp.en_service();
select is((select count(*)::int from public.tools_releves_pieces where releve_id = 'f5000000-0000-4000-8000-000000000001'
            and surface_calculee_mm2 is not null), 0,
  'Y01 aucune reprise à l''upgrade : surfaces des pièces V5 non écrites');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003');
select public.tools_releve_plan_enregistrer(pg_temp.plan('corrige'), pg_temp.rev(pg_temp.plan('corrige')), jsonb_build_object(
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'f5500000-0000-4000-8000-000000000001',
    'points', '[{"x":0,"y":0},{"x":5200,"y":0},{"x":5200,"y":4000},{"x":0,"y":4000}]'::jsonb))));
select is(pg_temp.surface('f5500000-0000-4000-8000-000000000001'), 20800000.0,
  'Y02 premier contour enregistré après l''upgrade : Séjour synchronisé (20,8 m², plan corrigé)');
select is(pg_temp.surface('f5500000-0000-4000-8000-000000000002'), null, 'Y03 Cuisine sans contour : valeur conservée (nulle)');
select pg_temp.en_service();
select is((select details->>'plan_id' from public.tools_releves_journal where entite = 'piece' and entite_id = 'f5500000-0000-4000-8000-000000000001'
            and details ? 'source' order by id desc limit 1), (select pg_temp.plan('corrige')::text),
  'Y04 journal : plan source tracé');
select ok((select p.contours = f.contours and p.revision = f.revision and p.empreinte = f.empreinte
             from public.tools_releves_plans p join _fige f using (id)), 'Y05 plan figé V5 non touché par la synchronisation');
select set_eq($$ select id, md5(contenu::text), empreinte from public.tools_releves_versions where releve_id = 'f5000000-0000-4000-8000-000000000001' $$,
              $$ select id, h, empreinte from _versions $$, 'Y06 versions figées (V4, V5) intactes');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003');
update public.tools_releves_pieces set surface_calculee_mm2 = 1, calcule_le = null where id = 'f5500000-0000-4000-8000-000000000001';
select is(pg_temp.surface('f5500000-0000-4000-8000-000000000001'), 20800000.0, 'Y07 écriture directe client : toujours ignorée (garde Lot 3)');
select pg_temp.en_service();
update public.tools_releves_plans set deleted_at = now() where id = pg_temp.plan('corrige');
select is(pg_temp.surface('f5500000-0000-4000-8000-000000000001'), 19760000.0,
  'Y08 plan corrigé supprimé : le plan figé V5 redevient la source (5,20 × 3,80 m)');

-- ── G. RGPD contrats V2 : paramétrage, rien d'activé ───────────────────────────────────
select is(platform.etat_politique_contrats(), 'duree_requise', 'G01 état effectif après upgrade : duree_requise (fail-closed)');
select is((select politique || '|' || coalesce(duree_conservation::text, '∅') || '|' || coalesce(array_to_string(regles_depart, '+'), '∅')
                  || '|' || coalesce(regle_depart_repli, '∅') || '|' || choix_photos_explicite::text || '|' || inclure_photos::text
             from platform.purge_politique_contrats),
  'conserver_contrat_minimise|∅|∅|∅|false|false', 'G02 aucune durée, aucun point de départ, aucun choix des photos');
select ok((select decision_ref like 'OWNER-DECISION-2026-09-26:%' from platform.purge_politique_contrats),
  'G03 décision propriétaire V3 conservée telle quelle');
select throws_ok($$ select * from public.purger_contrats_conserves_echus() $$, 'P0001', null,
  'G04 suppression des instantanés échus refusée (politique non active)');
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-UPGRADE', interval '5 years', false);
select is(platform.etat_politique_contrats(), 'parametres_requis', 'G05 ancien appel à 4 arguments : n''active rien (point de départ requis)');
select ok(not has_function_privilege('service_role', 'platform.definir_politique_purge_contrats(text, text, interval, boolean, text[], text)', 'execute')
          and not has_function_privilege('authenticated', 'public.purger_contrats_conserves_echus(integer)', 'execute'),
  'G06 activation réservée au propriétaire ; purge des échus fermée à l''application');

-- ── S. Stripe, D. Réserves D-01, I. identité / Studio ──────────────────────────────────
select is((select stripe_customer_id || '|' || stripe_subscription_id from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070'),
  'cus_upg4_70|sub_upg6_v5', 'S01 réabonnement V5 intact (même client, nouvelle subscription)');
select is((select count(*)::int from public.stripe_subscriptions_remplacees where stripe_subscription_id = 'sub_upg4_70'), 1,
  'S02 ancienne subscription toujours historisée');
select pg_temp.en_session('c9000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.reserves_commenter((select id from public.reserves where titre = 'UPG5 R1 — Tuiles cassées'), 'après V6', null, gen_random_uuid()) $$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', 'D01 hôte suspendu : intervenant toujours en lecture seule');
select is((select count(*)::int from public.reserves where chantier_id = 'e9000000-0000-0000-0000-000000000001'), 2,
  'D02 lecture conservée');
select pg_temp.en_service();
select is((select count(*)::int from public.elsatia_identity_subjects) + (select count(*)::int from public.elsatia_identity_outbox), 0,
  'I01 identité centrale : toujours inerte (0 sujet, 0 message)');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public'
            and table_name like 'studio\_%' and grantee = 'anon' and privilege_type <> 'SELECT'), 0,
  'I02 tables Studio du projet partagé : aucune écriture anon (Studio OFF, inchangé)');

select * from finish();
rollback;
