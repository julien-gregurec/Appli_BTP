-- Projet DÉDIÉ Studio : fondation RGPD (20260928110000_studio_rgpd_erasure_foundation.sql).
-- Compte ELSATIA supprimé → blocage immédiat + demande d'effacement ; exécution gardée par décision,
-- idempotente, rejouable, auditée ; aucune donnée DECISION_REQUIRED touchée sans décision.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
update studio_guard.control set mode = 'read_write', allow_unlinked_writes = false;
update studio_identity.erasure_policy set mode = 'off', decision_ref = null, grace_period = null;
update public.studio_signup_policy set allowlist = array['efface@example.test', '@autre.test'];

create function pg_temp.v(k text) returns uuid language sql as $$select current_setting('test.r.'||k)::uuid$$;
create function pg_temp.req() returns uuid language sql as $$select current_setting('test.r.req')::uuid$$;
create function pg_temp.cnt(t text, w uuid) returns bigint language plpgsql as $$
declare n bigint; begin execute format('select count(*) from public.%I where workspace_id = %L', t, w) into n; return n; end $$;

select set_config('test.r.e', '5e000000-0000-0000-0000-000000000001', true);
select set_config('test.r.o', '5e000000-0000-0000-0000-000000000002', true);
select set_config('test.r.k', '5e000000-0000-0000-0000-000000000003', true);
select set_config('test.r.we', gen_random_uuid()::text, true);
select set_config('test.r.wo', gen_random_uuid()::text, true);
select set_config('test.r.ws', gen_random_uuid()::text, true);
select set_config('test.r.pe', gen_random_uuid()::text, true);
select set_config('test.r.po', gen_random_uuid()::text, true);
select set_config('test.r.ae', gen_random_uuid()::text, true);
select set_config('test.r.te', gen_random_uuid()::text, true);
select set_config('test.r.je', gen_random_uuid()::text, true);
select set_config('test.r.lease', gen_random_uuid()::text, true);
select set_config('test.r.sid', gen_random_uuid()::text, true);

insert into auth.users(id, email) values
  (pg_temp.v('e'), 'efface@example.test'), (pg_temp.v('o'), 'autre@example.test'), (pg_temp.v('k'), 'revenu@example.test');
insert into studio_identity.subject_state(subject, account, state_seq, granted, plan) values
  (repeat('E', 43), 'active', 1, true, 'studio-pro'), (repeat('O', 43), 'active', 1, true, null),
  (repeat('K', 43), 'active', 1, true, null);
insert into studio_identity.links(subject, user_id, email) values
  (repeat('E', 43), pg_temp.v('e'), 'efface@example.test'), (repeat('O', 43), pg_temp.v('o'), 'autre@example.test'),
  (repeat('K', 43), pg_temp.v('k'), 'revenu@example.test');
insert into auth.sessions(id, user_id) values (pg_temp.v('sid'), pg_temp.v('e'));
insert into studio_identity.sessions(session_id, user_id, subject) values (pg_temp.v('sid'), pg_temp.v('e'), repeat('E', 43));

-- Espace personnel de E (seul membre) : médias, montage, rendu, analyse, objets Storage.
insert into public.studio_workspaces(id, name, workspace_type, owner_user_id) values (pg_temp.v('we'), 'Perso E', 'personal', pg_temp.v('e'));
insert into public.studio_workspace_members(workspace_id, user_id, role) values (pg_temp.v('we'), pg_temp.v('e'), 'owner');
insert into public.studio_projects(id, workspace_id, name, project_type, created_by) values (pg_temp.v('pe'), pg_temp.v('we'), 'Vacances', 'free', pg_temp.v('e'));
insert into public.studio_media_assets(id, workspace_id, project_id, uploaded_by, request_id, storage_key, original_filename, mime_type, media_type, file_size_bytes, upload_status)
  values (pg_temp.v('ae'), pg_temp.v('we'), pg_temp.v('pe'), pg_temp.v('e'), gen_random_uuid(),
          'studio/' || pg_temp.v('we') || '/' || pg_temp.v('pe') || '/' || pg_temp.v('ae') || '/original.jpg', 'plage.jpg', 'image/jpeg', 'image', 123, 'ready');
insert into public.studio_timelines(id, workspace_id, project_id, version, status, total_duration_ms, aspect_ratio, generator_version, created_by)
  values (pg_temp.v('te'), pg_temp.v('we'), pg_temp.v('pe'), 1, 'generated', 0, '9:16', 'v1', pg_temp.v('e'));
update public.studio_projects set active_timeline_id = pg_temp.v('te'), cover_asset_id = pg_temp.v('ae') where id = pg_temp.v('pe');
insert into public.studio_render_jobs(id, workspace_id, project_id, timeline_id, requested_by, request_id, profile, width, height, snapshot, status)
  values (pg_temp.v('je'), pg_temp.v('we'), pg_temp.v('pe'), pg_temp.v('te'), pg_temp.v('e'), gen_random_uuid(), 'preview', 540, 960, '{}', 'completed');
insert into public.studio_render_outbox(job_id) values (pg_temp.v('je'));
insert into public.studio_render_outputs(workspace_id, project_id, timeline_id, render_job_id, storage_key, file_size_bytes, width, height, duration_ms, codec_video, codec_audio, fps)
  values (pg_temp.v('we'), pg_temp.v('pe'), pg_temp.v('te'), pg_temp.v('je'),
          'studio/' || pg_temp.v('we') || '/' || pg_temp.v('pe') || '/renders/' || pg_temp.v('je') || '/' || pg_temp.v('lease') || '/output.mp4', 456, 540, 960, 3000, 'h264', 'aac', 30);
insert into public.studio_media_analysis(workspace_id, asset_id, project_id, analysis_version, requested_by)
  values (pg_temp.v('we'), pg_temp.v('ae'), pg_temp.v('pe'), 'media-v1', pg_temp.v('e'));
set local studio.write_path = 'storage_maintenance';
insert into storage.objects(bucket_id, name, metadata)
  select 'studio-originals', storage_key, '{"size":123}'::jsonb from public.studio_media_assets where id = pg_temp.v('ae')
  union all select 'studio-renders', storage_key, '{"size":456}' from public.studio_render_outputs where render_job_id = pg_temp.v('je')
  union all select 'studio-originals', 'studio/' || pg_temp.v('we') || '/derives/vignette.jpg', '{"size":1}';
set local studio.write_path = '';
-- Espace de O où E est éditeur et a créé un projet ; espace possédé par E et partagé avec O.
insert into public.studio_workspaces(id, name, workspace_type, owner_user_id) values
  (pg_temp.v('wo'), 'Agence O', 'professional', pg_temp.v('o')), (pg_temp.v('ws'), 'Partagé par E', 'professional', pg_temp.v('e'));
insert into public.studio_workspace_members(workspace_id, user_id, role) values
  (pg_temp.v('wo'), pg_temp.v('o'), 'owner'), (pg_temp.v('wo'), pg_temp.v('e'), 'editor'),
  (pg_temp.v('ws'), pg_temp.v('e'), 'owner'), (pg_temp.v('ws'), pg_temp.v('o'), 'viewer');
insert into public.studio_projects(id, workspace_id, name, project_type, created_by) values (pg_temp.v('po'), pg_temp.v('wo'), 'Chantier O', 'free', pg_temp.v('e'));

-- ================================================================ 7. Événement « compte supprimé »
set local role service_role;
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('E', 43), 5, 'deleted', 'account_deleted', false, null, null, null)),
  'applied', 'Cycle de vie : suppression centrale appliquée');
reset role;
select is((select account from studio_identity.subject_state where subject = repeat('E', 43)), 'deleted', 'Login bloqué : état deleted (tout passage refusé)');
select ok((select ban_desired from studio_identity.links where subject = repeat('E', 43)), 'Login bloqué : ban GoTrue demandé');
select is((select count(*) from auth.sessions where user_id = pg_temp.v('e')), 0::bigint, 'Sessions GoTrue invalidées (même transaction)');
select is((select count(*) from studio_identity.sessions where user_id = pg_temp.v('e')), 0::bigint, 'Sessions du pont invalidées');
select is((select status from studio_identity.erasure_requests where subject = repeat('E', 43)), 'pending', 'Compte marqué pour traitement RGPD (même transaction)');
select is((select user_id from studio_identity.erasure_requests where subject = repeat('E', 43)), pg_temp.v('e'), 'Demande liée à l''utilisateur Auth Studio');
select set_config('test.r.req', (select id::text from studio_identity.erasure_requests where subject = repeat('E', 43)), true);
set local role service_role;
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('E', 43), 5, 'deleted', 'account_deleted', false, null, null, null)),
  'stale', 'Réémission de la suppression : sans effet');
reset role;
select is((select count(*) from studio_identity.erasure_requests where subject = repeat('E', 43)), 1::bigint, 'Une seule demande par sujet (idempotent)');
select set_config('request.jwt.claim.sub', pg_temp.v('e')::text, true);
set local role authenticated;
select throws_ok(format($$select public.studio_create_project(%L, 'Nouveau', 'free')$$, pg_temp.v('we')), '42501', 'Accès Studio en lecture seule', 'Compte supprimé : toute écriture refusée par la garde');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select is((select account from public.studio_identity_accept_handoff(repeat('E', 43), 4, true, null, null)), 'deleted', 'Jeton de passage antérieur à la suppression : refusé (état deleted conservé)');
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('Z', 43), 3, 'deleted', 'account_deleted', false, null, null, null)),
  'applied', 'Sujet jamais venu sur Studio : état mémorisé');
reset role;
select is((select count(*) from studio_identity.erasure_requests where subject = repeat('Z', 43)), 0::bigint, 'Sujet sans lien : aucune donnée Studio, aucune demande');

-- ================================================================ 9. Aucune durée inventée : fail-closed
select set_config('test.r.before', (select md5(string_agg(x, '|' order by x)) from (
  select pg_temp.cnt(t, w)::text x from unnest(array['studio_projects','studio_media_assets','studio_timelines','studio_render_jobs','studio_render_outputs','studio_media_analysis']) t,
  unnest(array[pg_temp.v('we'), pg_temp.v('wo'), pg_temp.v('ws')]) w) s), true);
set local role service_role;
select is(public.studio_erasure_prepare(pg_temp.req()) ->> 'outcome', 'disabled', 'Mode off (défaut) : aucune planification');
select is(public.studio_erasure_execute(pg_temp.req()) ->> 'outcome', 'not_authorized', 'Mode off : aucune exécution');
reset role;
select throws_ok($$update studio_identity.erasure_policy set mode = 'execute'$$, '23514', null, 'execute sans décision ni délai : refusé par contrainte');
select throws_ok($$update studio_identity.erasure_policy set mode = 'execute', decision_ref = 'DEC-TEST-RGPD'$$, '23514', null, 'execute sans délai de conservation décidé : refusé (DECISION_REQUIRED)');

-- ================================================================ Dry-run : inventaire classé, rien supprimé
update studio_identity.erasure_policy set mode = 'dry_run';
set local role service_role;
select is(public.studio_erasure_prepare(pg_temp.req()) ->> 'outcome', 'planned', 'Dry-run : plan produit');
select is(public.studio_erasure_execute(pg_temp.req()) ->> 'outcome', 'not_authorized', 'Dry-run : exécution refusée');
reset role;
select is((select plan #>> '{delete,workspaces}' from studio_identity.erasure_requests where id = pg_temp.req()), '1', 'DELETE : 1 espace dont E est seul membre');
select is((select plan #>> '{delete,memberships_elsewhere}' from studio_identity.erasure_requests where id = pg_temp.req()), '1', 'DELETE : adhésion de E dans l''espace de O');
select is((select plan #>> '{delete,allowlist_entries}' from studio_identity.erasure_requests where id = pg_temp.req()), '1', 'DELETE : e-mail de la liste d''admission');
select is((select plan #>> '{decision_required,shared_owned_workspaces}' from studio_identity.erasure_requests where id = pg_temp.req()), '1', 'DECISION_REQUIRED : espace partagé possédé par E');
select is((select plan #>> '{decision_required,authored_in_shared_workspaces}' from studio_identity.erasure_requests where id = pg_temp.req()), '1', 'DECISION_REQUIRED : contenu créé par E chez O');
select is((select plan #>> '{retain,subject_state}' from studio_identity.erasure_requests where id = pg_temp.req()), '1', 'RETAIN : sujet opaque (refus des jetons tardifs)');
select is((select status from studio_identity.erasure_requests where id = pg_temp.req()), 'awaiting_decision', 'Décisions requises : demande en attente');
select is((select md5(string_agg(x, '|' order by x)) from (
  select pg_temp.cnt(t, w)::text x from unnest(array['studio_projects','studio_media_assets','studio_timelines','studio_render_jobs','studio_render_outputs','studio_media_analysis']) t,
  unnest(array[pg_temp.v('we'), pg_temp.v('wo'), pg_temp.v('ws')]) w) s), current_setting('test.r.before'), 'Dry-run : aucune ligne supprimée');

-- ================================================================ Exécution (décision écrite + délai décidé)
update studio_identity.erasure_policy set mode = 'execute', decision_ref = 'DEC-TEST-RGPD', grace_period = interval '1 day';
set local role service_role;
select is(public.studio_erasure_execute(pg_temp.req()) ->> 'outcome', 'grace_period', 'Délai décidé non écoulé : rien n''est exécuté');
reset role;
update studio_identity.erasure_policy set grace_period = interval '0';
set local role service_role;
select is(public.studio_erasure_execute(pg_temp.req()) ->> 'outcome', 'db_erased', 'Exécution base');
reset role;
select is(pg_temp.cnt('studio_projects', pg_temp.v('we')) + pg_temp.cnt('studio_media_assets', pg_temp.v('we')) + pg_temp.cnt('studio_timelines', pg_temp.v('we'))
  + pg_temp.cnt('studio_render_jobs', pg_temp.v('we')) + pg_temp.cnt('studio_render_outputs', pg_temp.v('we')) + pg_temp.cnt('studio_media_analysis', pg_temp.v('we'))
  + pg_temp.cnt('studio_project_assets', pg_temp.v('we')) + pg_temp.cnt('studio_timeline_clips', pg_temp.v('we')) + pg_temp.cnt('studio_workspace_members', pg_temp.v('we')),
  0::bigint, 'DELETE : projets, médias, montages, rendus/exports, jobs, analyses, adhésions de l''espace personnel');
select is((select count(*) from public.studio_workspaces where id = pg_temp.v('we')), 0::bigint, 'DELETE : espace personnel');
select is((select count(*) from public.studio_render_outbox where job_id = pg_temp.v('je')), 0::bigint, 'DELETE : outbox de rendu');
select is((select count(*) from public.studio_workspace_members where workspace_id = pg_temp.v('wo') and user_id = pg_temp.v('e')), 0::bigint, 'DELETE : adhésion chez O');
select is((select allowlist from public.studio_signup_policy), array['@autre.test'], 'DELETE : e-mail retiré de la liste d''admission');
select is((select count(*) from public.studio_projects where id = pg_temp.v('po')), 1::bigint, 'IMMUTABILITY : contenu créé chez O conservé sans décision');
select is((select count(*) from public.studio_workspace_members where workspace_id = pg_temp.v('ws')), 2::bigint, 'IMMUTABILITY : espace partagé de E intact sans décision');
select is((select status from studio_identity.erasure_requests where id = pg_temp.req()), 'awaiting_decision', 'Décisions restantes : demande en attente');
select is((select count(*) from studio_identity.erasure_storage_queue where request_id = pg_temp.req()), 4::bigint, 'Storage : 1 original + 1 rendu + 2 préfixes (dérivés, vignettes, artefacts) en file');
select set_config('test.r.q', (select count(*)::text from studio_identity.erasure_storage_queue), true);
set local role service_role;
select is(public.studio_erasure_execute(pg_temp.req()) ->> 'outcome', 'db_erased', 'Rejeu : sans erreur');
reset role;
select is((select count(*)::text from studio_identity.erasure_storage_queue), current_setting('test.r.q'), 'Rejeu : aucune entrée Storage dupliquée');

-- ================================================================ 10. Storage : suppression vérifiée en base
set local role service_role;
select is((select count(*) from public.studio_erasure_storage_batch(pg_temp.req(), 100)), 4::bigint, 'File Storage lisible par le worker');
select throws_ok(format($$select public.studio_erasure_storage_done(%s)$$, (select min(b.queue_id) from public.studio_erasure_storage_batch(pg_temp.req(), 100) b where b.kind = 'object')),
  '22023', 'Objet encore présent', 'Constat refusé tant que l''objet existe (jamais sur parole)');
reset role;
-- Suppression via l'API Storage : admise par la garde car plus aucune ligne ne référence ces objets.
select lives_ok(format($$delete from storage.objects where name like %L$$, 'studio/' || pg_temp.v('we') || '/%'), 'Garde Storage : objets orphelins supprimables');
set local role service_role;
select is((select count(*) from public.studio_erasure_storage_batch(pg_temp.req(), 100) b where public.studio_erasure_storage_done(b.queue_id)), 4::bigint, 'Constats Storage enregistrés');
select throws_ok(format($$select public.studio_erasure_finalize(%L)$$, pg_temp.req()), '22023', null, 'Clôture refusée tant qu''une décision manque');
reset role;

-- ================================================================ Décision propriétaire (simulée par l'opérateur)
delete from public.studio_workspaces where id = pg_temp.v('ws');
update public.studio_projects set created_by = pg_temp.v('o') where id = pg_temp.v('po');
update studio_identity.erasure_requests set status = 'storage_pending' where id = pg_temp.req();
set local role service_role;
select is(public.studio_erasure_finalize(pg_temp.req()), pg_temp.v('e'), 'Clôture : utilisateur Auth Studio à supprimer');
select is(public.studio_erasure_finalize(pg_temp.req()), pg_temp.v('e'), 'Clôture rejouable');
reset role;
select is((select count(*) from studio_identity.links where subject = repeat('E', 43)), 0::bigint, 'DELETE : lien (e-mail) effacé');
select is((select row(account, granted, plan)::text from studio_identity.subject_state where subject = repeat('E', 43)), '(deleted,,)', 'ANONYMIZE : état réduit au sujet opaque « deleted »');
set local role service_role;
select throws_ok(format($$select public.studio_erasure_confirm_auth_deleted(%L)$$, pg_temp.req()), '22023', 'Utilisateur Auth Studio encore présent', 'Constat Auth vérifié en base');
reset role;
delete from auth.users where id = pg_temp.v('e'); -- GoTrue admin deleteUser (l'application)
set local role service_role;
select ok(public.studio_erasure_confirm_auth_deleted(pg_temp.req()), 'Clôture complète');
select ok(public.studio_erasure_confirm_auth_deleted(pg_temp.req()), 'Constat rejouable');
select is(public.studio_erasure_execute(pg_temp.req()) ->> 'outcome', 'not_executable', 'Demande close : plus rien n''est exécuté');
select is(public.studio_erasure_prepare(pg_temp.req()) ->> 'outcome', 'closed', 'Demande close : plus de plan');
reset role;
select is((select row(status, user_id is null)::text from studio_identity.erasure_requests where id = pg_temp.req()), '(completed,t)', 'Demande close sans identifiant utilisateur');
select is((select array_agg(action order by id) from studio_identity.erasure_events where request_id = pg_temp.req()),
  array['opened','planned','db_erased','db_erased','data_erased','completed'], 'Audit complet et ordonné');
select ok((select bool_and(not (detail::text ~* 'efface@|plage\.jpg|Vacances')) from studio_identity.erasure_events), 'Audit sans donnée personnelle');
select throws_ok($$update studio_identity.erasure_events set action = 'x'$$, '42501', null, 'Audit immuable (UPDATE)');
select throws_ok($$delete from studio_identity.erasure_events$$, '42501', null, 'Audit immuable (DELETE)');
set local role service_role;
select is((select account from public.studio_identity_accept_handoff(repeat('E', 43), 5, true, null, null)), 'deleted', 'Après effacement : jeton tardif toujours refusé');
reset role;

-- ================================================================ Réactivation avant exécution / pendant l'effacement
set local role service_role;
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('K', 43), 2, 'deleted', 'account_deleted', false, null, null, null)), 'applied', 'K supprimé');
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('K', 43), 3, 'active', 'account_restored', false, null, null, null)), 'applied', 'K réactivé avant exécution');
reset role;
select is((select status from studio_identity.erasure_requests where subject = repeat('K', 43)), 'superseded', 'Réactivé avant exécution : demande annulée');
select set_config('test.r.kreq', (select id::text from studio_identity.erasure_requests where subject = repeat('K', 43)), true);
set local role service_role;
select is(public.studio_erasure_execute(pg_temp.v('kreq')) ->> 'outcome', 'not_executable', 'Demande annulée : rien exécuté');
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('K', 43), 4, 'deleted', 'account_deleted', false, null, null, null)), 'applied', 'K de nouveau supprimé');
reset role;
select is((select status from studio_identity.erasure_requests where subject = repeat('K', 43)), 'pending', 'Demande rouverte');
update studio_identity.erasure_requests set attempts = 1 where subject = repeat('K', 43);
set local role service_role;
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('K', 43), 5, 'active', 'account_restored', false, null, null, null)), 'applied', 'K réactivé pendant l''effacement');
select is(public.studio_erasure_execute(pg_temp.v('kreq')) ->> 'outcome', 'refused_not_deleted', 'Compte actif : effacement refusé (fail-closed)');
reset role;

-- ================================================================ Privilèges
select ok(not has_function_privilege('authenticated', 'public.studio_erasure_execute(uuid)', 'execute'), 'authenticated ne peut pas exécuter l''effacement');
select ok(not has_function_privilege('anon', 'public.studio_erasure_due(integer)', 'execute'), 'anon ne voit pas les demandes');
select ok(not has_table_privilege('service_role', 'studio_identity.erasure_policy', 'update'), 'La politique RGPD ne se change qu''en SQL (décision écrite)');

select * from finish();
rollback;
