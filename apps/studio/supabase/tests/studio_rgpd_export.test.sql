-- Projet DÉDIÉ Studio : export RGPD d'un sujet ELSATIA (20260929100000_studio_rgpd_export.sql).
-- Anti-rejeu de la demande signée, périmètre OWN_DATA / SHARED, aucune donnée d'un autre membre,
-- aucun secret technique, journal sans contenu, lecture seule des tables métier, mode lecture seule.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
update studio_guard.control set mode = 'read_write', allow_unlinked_writes = false;

create function pg_temp.v(k text) returns uuid language sql as $$select current_setting('test.x.'||k)::uuid$$;
select set_config('test.x.e', '6e000000-0000-0000-0000-000000000001', true);
select set_config('test.x.o', '6e000000-0000-0000-0000-000000000002', true);
select set_config('test.x.we', gen_random_uuid()::text, true);
select set_config('test.x.wo', gen_random_uuid()::text, true);
select set_config('test.x.ws', gen_random_uuid()::text, true);
select set_config('test.x.pe', gen_random_uuid()::text, true);
select set_config('test.x.peo', gen_random_uuid()::text, true);
select set_config('test.x.po', gen_random_uuid()::text, true);
select set_config('test.x.pos', gen_random_uuid()::text, true);
select set_config('test.x.ae', gen_random_uuid()::text, true);
select set_config('test.x.aeo', gen_random_uuid()::text, true);
select set_config('test.x.ao', gen_random_uuid()::text, true);
select set_config('test.x.te', gen_random_uuid()::text, true);
select set_config('test.x.je', gen_random_uuid()::text, true);
select set_config('test.x.job', gen_random_uuid()::text, true);

insert into auth.users(id, email) values (pg_temp.v('e'), 'exporte@example.test'), (pg_temp.v('o'), 'autre-membre@example.test');
insert into studio_identity.subject_state(subject, account, state_seq, granted, plan) values
  (repeat('X', 43), 'active', 1, true, 'studio-pro'), (repeat('Y', 43), 'active', 1, true, null), (repeat('Z', 43), 'disabled', 2, false, null);
insert into studio_identity.links(subject, user_id, email) values
  (repeat('X', 43), pg_temp.v('e'), 'exporte@example.test'), (repeat('Y', 43), pg_temp.v('o'), 'autre-membre@example.test');
insert into auth.users(id, email) values ('6e000000-0000-0000-0000-000000000003', 'desactive@example.test');
insert into studio_identity.links(subject, user_id, email) values (repeat('Z', 43), '6e000000-0000-0000-0000-000000000003', 'desactive@example.test');

-- we : espace personnel de E (seule membre) ; wo : espace de O où E est éditrice ;
-- ws : espace possédé par E et partagé avec O.
insert into public.studio_workspaces(id, name, workspace_type, owner_user_id) values
  (pg_temp.v('we'), 'Perso E', 'personal', pg_temp.v('e')), (pg_temp.v('wo'), 'Agence O', 'professional', pg_temp.v('o')),
  (pg_temp.v('ws'), 'Partagé par E', 'professional', pg_temp.v('e'));
insert into public.studio_workspace_members(workspace_id, user_id, role) values
  (pg_temp.v('we'), pg_temp.v('e'), 'owner'), (pg_temp.v('wo'), pg_temp.v('o'), 'owner'), (pg_temp.v('wo'), pg_temp.v('e'), 'editor'),
  (pg_temp.v('ws'), pg_temp.v('e'), 'owner'), (pg_temp.v('ws'), pg_temp.v('o'), 'viewer');
insert into public.studio_projects(id, workspace_id, name, project_type, created_by) values
  (pg_temp.v('pe'), pg_temp.v('we'), 'PROJET_E_PERSO', 'free', pg_temp.v('e')),
  (pg_temp.v('peo'), pg_temp.v('wo'), 'PROJET_E_CHEZ_O', 'free', pg_temp.v('e')),
  (pg_temp.v('po'), pg_temp.v('wo'), 'PROJET_SECRET_DE_O', 'free', pg_temp.v('o')),
  (pg_temp.v('pos'), pg_temp.v('ws'), 'PROJET_DE_O_CHEZ_E', 'free', pg_temp.v('o'));
insert into public.studio_media_assets(id, workspace_id, project_id, uploaded_by, request_id, storage_key, original_filename, mime_type, media_type, file_size_bytes, upload_status) values
  (pg_temp.v('ae'), pg_temp.v('we'), pg_temp.v('pe'), pg_temp.v('e'), gen_random_uuid(),
   'studio/' || pg_temp.v('we') || '/' || pg_temp.v('pe') || '/' || pg_temp.v('ae') || '/original.jpg', 'perso.jpg', 'image/jpeg', 'image', 10, 'ready'),
  (pg_temp.v('aeo'), pg_temp.v('wo'), pg_temp.v('peo'), pg_temp.v('e'), gen_random_uuid(),
   'studio/' || pg_temp.v('wo') || '/' || pg_temp.v('peo') || '/' || pg_temp.v('aeo') || '/original.jpg', 'e-chez-o.jpg', 'image/jpeg', 'image', 11, 'ready'),
  (pg_temp.v('ao'), pg_temp.v('wo'), pg_temp.v('po'), pg_temp.v('o'), gen_random_uuid(),
   'studio/' || pg_temp.v('wo') || '/' || pg_temp.v('po') || '/' || pg_temp.v('ao') || '/original.jpg', 'FICHIER_SECRET_DE_O.jpg', 'image/jpeg', 'image', 12, 'ready');
insert into public.studio_timelines(id, workspace_id, project_id, version, status, total_duration_ms, aspect_ratio, generator_version, created_by)
  values (pg_temp.v('te'), pg_temp.v('we'), pg_temp.v('pe'), 1, 'generated', 0, '9:16', 'v1', pg_temp.v('e'));
insert into public.studio_render_jobs(id, workspace_id, project_id, timeline_id, requested_by, request_id, profile, width, height, snapshot, status, lease_token)
  values (pg_temp.v('je'), pg_temp.v('we'), pg_temp.v('pe'), pg_temp.v('te'), pg_temp.v('e'), gen_random_uuid(), 'preview', 540, 960, '{"secret":"SNAPSHOT"}', 'completed', gen_random_uuid());
insert into public.studio_render_outputs(workspace_id, project_id, timeline_id, render_job_id, storage_key, file_size_bytes, width, height, duration_ms, codec_video, codec_audio, fps)
  values (pg_temp.v('we'), pg_temp.v('pe'), pg_temp.v('te'), pg_temp.v('je'),
          'studio/' || pg_temp.v('we') || '/' || pg_temp.v('pe') || '/renders/' || pg_temp.v('je') || '/x/output.mp4', 456, 540, 960, 3000, 'h264', 'aac', 30);

create temporary table _compte on commit drop as
  select (select count(*) from public.studio_projects) p, (select count(*) from public.studio_media_assets) m,
         (select count(*) from public.studio_workspaces) w;

-- ── Droits ──────────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.studio_export_subject(text, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.studio_export_subject(text, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.studio_export_consume(uuid, uuid, timestamptz)', 'execute'),
  'droits : seule la clé service Studio (route vérifiant la demande signée) exécute l''export');
select ok(has_function_privilege('service_role', 'public.studio_export_subject(text, uuid)', 'execute'), 'droits : service_role Studio');

-- ── Anti-rejeu ──────────────────────────────────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.studio_export_consume('7e000000-0000-0000-0000-000000000001', pg_temp.v('job'), now() + interval '60 seconds'), 'demande signée : premier usage accepté');
select ok(not public.studio_export_consume('7e000000-0000-0000-0000-000000000001', pg_temp.v('job'), now() + interval '60 seconds'), 'demande signée rejouée : refusée (usage unique)');

-- ── Sujets inconnus / inactifs ──────────────────────────────────────────────────────────────
select is(public.studio_export_subject(repeat('Q', 43), pg_temp.v('job')) ->> 'statut', 'aucun_compte', 'sujet jamais venu sur Studio : aucun compte');
select is(public.studio_export_subject(repeat('Z', 43), pg_temp.v('job')) ->> 'statut', 'compte_inactif', 'sujet désactivé : refusé');
select throws_ok($$select public.studio_export_subject('pas-un-sujet', gen_random_uuid())$$, '22023', null, 'sujet mal formé refusé');

-- ── Export de E ─────────────────────────────────────────────────────────────────────────────
create temporary table _x on commit drop as select public.studio_export_subject(repeat('X', 43), pg_temp.v('job')) as e;
select is((select e ->> 'statut' from _x), 'ok', 'export de E servi');
select is((select jsonb_agg(x ->> 'categorie' order by x ->> 'name') from _x, jsonb_array_elements(e -> 'espaces') x),
  '["SHARED", "SHARED", "OWN_DATA"]'::jsonb, 'espaces : personnel OWN_DATA ; espaces partagés SHARED');
select is((select jsonb_agg(x ->> 'name' order by x ->> 'name') from _x, jsonb_array_elements(e -> 'projets') x),
  '["PROJET_E_CHEZ_O", "PROJET_E_PERSO"]'::jsonb, 'projets : les siens seulement (ni le projet de O chez O, ni celui de O chez E)');
select is((select count(*)::int from _x, jsonb_array_elements(e -> 'medias') x where x ->> 'uploaded_by' <> pg_temp.v('e')::text), 0,
  'médias : aucun média téléversé par un autre membre');
select ok((select position('SECRET_DE_O' in e::text) = 0 and position('autre-membre@example.test' in e::text) = 0 from _x),
  'tiers : aucun contenu ni e-mail d''un autre membre');
select ok((select not exists (select 1 from jsonb_array_elements(e -> 'medias') x where x ? 'request_id')
             and not exists (select 1 from jsonb_array_elements(e -> 'rendus_demandes') x where x ? 'lease_token' or x ? 'snapshot' or x ? 'request_id')
             and position('SNAPSHOT' in e::text) = 0 from _x),
  'minimisation : aucune clé d''idempotence, jeton de bail ni instantané technique');
select is((select jsonb_agg(jsonb_build_array(x ->> 'nom', x ->> 'categorie') order by x ->> 'nom') from _x, jsonb_array_elements(e -> 'fichiers') x
            where x ->> 'bucket' = 'studio-originals'),
  '[["e-chez-o.jpg", "SHARED"], ["perso.jpg", "OWN_DATA"]]'::jsonb, 'fichiers : original personnel OWN_DATA, contribution en espace partagé SHARED');
select is((select count(*)::int from _x, jsonb_array_elements(e -> 'fichiers') x where x ->> 'bucket' = 'studio-renders'), 1, 'fichiers : rendu de l''espace personnel');
select is((select e #>> '{compte,email}' from _x), 'exporte@example.test', 'compte : e-mail du lien d''identité');

-- ── Lecture seule, journal ──────────────────────────────────────────────────────────────────
reset role;
select ok((select p = (select count(*) from public.studio_projects) and m = (select count(*) from public.studio_media_assets)
                  and w = (select count(*) from public.studio_workspaces) from _compte),
  'l''export n''écrit aucune table métier Studio');
select ok((select array_agg(action order by id) from studio_identity.export_events) @> array['replay_refused', 'no_account', 'refused_inactive', 'served'],
  'journal : rejeu, absence de compte, refus, export servi');
select ok(not exists (select 1 from studio_identity.export_events where detail::text like '%@%' or detail::text like '%PROJET%'),
  'journal : compteurs uniquement, aucun contenu');
select throws_ok($$delete from studio_identity.export_events$$, '42501', null, 'journal : immuable');
select set_config('request.jwt.claims', '', true);
update studio_guard.control set mode = 'read_only';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.studio_export_subject(repeat('X', 43), gen_random_uuid()) ->> 'statut', 'ok', 'Studio en lecture seule : l''export reste possible (droit d''accès)');
select throws_ok($$insert into studio_identity.export_events (action) values ('forge')$$, '42501', null,
  'clé service : aucune écriture directe hors RPC');
reset role;

select * from finish();
rollback;
