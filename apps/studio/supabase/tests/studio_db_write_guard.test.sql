-- Projet DÉDIÉ Studio : garde d'écriture centrale en base (20260928100000_studio_db_write_guard.sql)
-- et garde Storage (20260928120000_studio_storage_write_guard.sql).
-- Contournement testé : chaque RPC d'écriture est appelée DIRECTEMENT (comme PostgREST : role
-- authenticated + sub), sans l'application. L'UI n'est pas la protection.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
update studio_guard.control set mode = 'read_write', allow_unlinked_writes = false;

create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.g.'||k)::uuid$$;
create function pg_temp.rev() returns integer language sql as $$select revision from public.studio_projects where id=pg_temp.id('p')$$;
create function pg_temp.trev() returns integer language sql as $$select revision from public.studio_timelines where id=pg_temp.id('t')$$;
create function pg_temp.draft(asset uuid) returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio','9:16','target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type','image','source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))));
$$;
create function pg_temp.as_user(u text) returns void language sql as $$
select set_config('request.jwt.claim.sub', u, true); select set_config('role', 'authenticated', true); $$;

insert into auth.users(id, email) values
  ('5b000000-0000-0000-0000-000000000001', 'garde-u@example.test'),
  ('5b000000-0000-0000-0000-000000000002', 'garde-v@example.test'),
  ('5b000000-0000-0000-0000-000000000003', 'garde-hors-pont@example.test'),
  ('5b000000-0000-0000-0000-000000000004', 'garde-supprime@example.test');
insert into studio_identity.subject_state(subject, account, state_seq, granted) values
  (repeat('G', 43), 'active', 1, true), (repeat('H', 43), 'active', 1, true), (repeat('J', 43), 'active', 1, true);
insert into studio_identity.links(subject, user_id, email) values
  (repeat('G', 43), '5b000000-0000-0000-0000-000000000001', 'garde-u@example.test'),
  (repeat('H', 43), '5b000000-0000-0000-0000-000000000002', 'garde-v@example.test'),
  (repeat('J', 43), '5b000000-0000-0000-0000-000000000004', 'garde-supprime@example.test');
insert into storage.buckets(id, name, public) values ('garde-autre', 'garde-autre', false) on conflict do nothing;

-- ------------------------------------------------------------------ Données (U, accès complet)
select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select set_config('test.g.w', public.studio_create_workspace('Garde', 'professional')::text, true);
select set_config('test.g.p', public.studio_create_project(pg_temp.id('w'), 'Projet garde', 'free')::text, true);
select set_config('test.g.a1', public.studio_reserve_media(pg_temp.id('p'), gen_random_uuid(), 'a.jpg', 'image/jpeg', 123)::text, true);
select set_config('test.g.a2', public.studio_reserve_media(pg_temp.id('p'), gen_random_uuid(), 'b.jpg', 'image/jpeg', 123)::text, true);
select set_config('test.g.p2', public.studio_create_project(pg_temp.id('w'), 'Projet imports', 'free')::text, true);
select set_config('test.g.a3', public.studio_reserve_media(pg_temp.id('p2'), gen_random_uuid(), 'c.jpg', 'image/jpeg', 123)::text, true);
select public.studio_set_member(pg_temp.id('w'), '5b000000-0000-0000-0000-000000000003', 'editor');
select public.studio_set_member(pg_temp.id('w'), '5b000000-0000-0000-0000-000000000004', 'editor');
reset role;
-- Téléversement réel pendant la réservation (garde Storage : réservation vivante + accès complet).
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb
  from public.studio_media_assets where id in (pg_temp.id('a1'), pg_temp.id('a2'))$$,
  'Storage : objet réservé + auteur en accès complet → téléversement admis');
update public.studio_media_assets set upload_status = 'ready' where id in (pg_temp.id('a1'), pg_temp.id('a2'));
select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select set_config('test.g.t', public.studio_save_timeline(pg_temp.id('p'), null, null, pg_temp.rev(), pg_temp.draft(pg_temp.id('a1')))::text, true);
reset role;
-- Rendu préalable (pour l'annulation) ; exige les objets, posés ci-dessus.
select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select set_config('test.g.j', public.studio_request_render(pg_temp.id('p'), gen_random_uuid(), 'preview')::text, true);
reset role;
select is((select count(*) from public.studio_render_jobs where id = pg_temp.id('j')), 1::bigint, 'Accès complet : rendu demandé');

-- ------------------------------------------------------------------ Droit Studio retiré (lecture seule)
update studio_identity.subject_state set granted = false where subject = repeat('G', 43);
select set_config('test.g.snapshot', (select md5(string_agg(t::text, '|' order by t::text)) from (
  select to_jsonb(x) - 'updated_at' t from public.studio_workspaces x where id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_projects x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_media_assets x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_workspace_members x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_timelines x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_timeline_clips x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_render_jobs x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_media_analysis x where workspace_id = pg_temp.id('w')) s), true);

select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(public.studio_list_project_media(pg_temp.id('p'))), 2, 'Lecture seule : les RPC de lecture restent disponibles');
select is((select count(*) from public.studio_projects where workspace_id = pg_temp.id('w')), 2::bigint, 'Lecture seule : SELECT autorisé');
select throws_ok($$select public.studio_create_workspace('Autre', 'professional')$$, '42501', 'Accès Studio en lecture seule', 'RPC 1/22 studio_create_workspace');
select throws_ok(format($$select public.studio_rename_workspace(%L, 'Renommé')$$, pg_temp.id('w')), '42501', 'Accès Studio en lecture seule', 'RPC 2/22 studio_rename_workspace');
select throws_ok(format($$select public.studio_archive_workspace(%L)$$, pg_temp.id('w')), '42501', 'Accès Studio en lecture seule', 'RPC 3/22 studio_archive_workspace');
select throws_ok(format($$select public.studio_set_member(%L, '5b000000-0000-0000-0000-000000000002', 'viewer')$$, pg_temp.id('w')), '42501', 'Accès Studio en lecture seule', 'RPC 4/22 studio_set_member');
select throws_ok(format($$select public.studio_create_project(%L, 'P2', 'free')$$, pg_temp.id('w')), '42501', 'Accès Studio en lecture seule', 'RPC 5/22 studio_create_project');
select throws_ok(format($$select public.studio_save_project(%L, null, '{"name":"P3","project_type":"free","status":"draft"}')$$, pg_temp.id('w')), '42501', 'Accès Studio en lecture seule', 'RPC 6/22 studio_save_project');
select throws_ok(format($$select public.studio_project_lifecycle(%L, 'archive')$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'RPC 7/22 studio_project_lifecycle');
select throws_ok(format($$select public.studio_duplicate_project(%L)$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'RPC 8/22 studio_duplicate_project');
select throws_ok(format($$select public.studio_set_project_cover(%L, %L)$$, pg_temp.id('p'), pg_temp.id('a1')), '42501', 'Accès Studio en lecture seule', 'RPC 9/22 studio_set_project_cover');
select throws_ok(format($$select public.studio_remove_project_media(%L, %L)$$, pg_temp.id('p'), pg_temp.id('a2')), '42501', 'Accès Studio en lecture seule', 'RPC 10/22 studio_remove_project_media');
select throws_ok(format($$select public.studio_delete_media(%L)$$, pg_temp.id('a2')), '42501', 'Accès Studio en lecture seule', 'RPC 11/22 studio_delete_media');
select throws_ok(format($$select public.studio_order_project_media(%L, null, true, %s)$$, pg_temp.id('p'), pg_temp.rev()), '42501', 'Accès Studio en lecture seule', 'RPC 12/22 studio_order_project_media');
select throws_ok(format($$select public.studio_reserve_media(%L, gen_random_uuid(), 'd.jpg', 'image/jpeg', 10)$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'RPC 13/22 studio_reserve_media');
select throws_ok(format($$select public.studio_save_timeline(%L, null, null, %s, pg_temp.draft(%L))$$, pg_temp.id('p'), pg_temp.rev(), pg_temp.id('a1')), '42501', 'Accès Studio en lecture seule', 'RPC 14/22 studio_save_timeline');
select throws_ok(format($$select public.studio_activate_timeline(%L, %L)$$, pg_temp.id('p'), pg_temp.id('t')), '42501', 'Accès Studio en lecture seule', 'RPC 15/22 studio_activate_timeline');
select throws_ok(format($$select public.studio_delete_timeline(%L, %L)$$, pg_temp.id('p'), pg_temp.id('t')), '42501', 'Accès Studio en lecture seule', 'RPC 16/22 studio_delete_timeline');
select throws_ok(format($$select public.studio_save_editor(%L, %L, %s, %s, pg_temp.draft(%L))$$, pg_temp.id('p'), pg_temp.id('t'), pg_temp.trev(), pg_temp.rev(), pg_temp.id('a1')), '42501', 'Accès Studio en lecture seule', 'RPC 17/22 studio_save_editor');
select throws_ok(format($$select public.studio_request_render(%L, gen_random_uuid(), 'preview')$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'RPC 18/22 studio_request_render');
select throws_ok(format($$select public.studio_request_editor_render(%L, gen_random_uuid(), %L, %s, 'preview')$$, pg_temp.id('p'), pg_temp.id('t'), pg_temp.trev()), '42501', 'Accès Studio en lecture seule', 'RPC 19/22 studio_request_editor_render');
select throws_ok(format($$select public.studio_cancel_render(%L)$$, pg_temp.id('j')), '42501', 'Accès Studio en lecture seule', 'RPC 20/22 studio_cancel_render');
select throws_ok(format($$select public.studio_request_analysis(%L, true)$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'RPC 21/22 studio_request_analysis');
select throws_ok(format($$select public.studio_cancel_analysis(%L)$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'RPC 22/22 studio_cancel_analysis');
select throws_ok(format($$select public.studio_save_project(%L, %L, '{"name":"Édité","project_type":"free","status":"draft"}', %s)$$, pg_temp.id('w'), pg_temp.id('p'), pg_temp.rev()), '42501', 'Accès Studio en lecture seule', 'studio_save_project (édition) aussi');
-- Chemin système déclaré par un UTILISATEUR : ignoré.
select set_config('studio.write_path', 'rgpd_erasure', true);
select throws_ok(format($$select public.studio_rename_workspace(%L, 'Renommé')$$, pg_temp.id('w')), '42501', 'Accès Studio en lecture seule', 'Un utilisateur ne peut pas se déclarer chemin système');
select set_config('studio.write_path', '', true);
reset role;
select is((select md5(string_agg(t::text, '|' order by t::text)) from (
  select to_jsonb(x) - 'updated_at' t from public.studio_workspaces x where id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_projects x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_media_assets x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_workspace_members x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_timelines x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_timeline_clips x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_render_jobs x where workspace_id = pg_temp.id('w')
  union all select to_jsonb(x) from public.studio_media_analysis x where workspace_id = pg_temp.id('w')) s),
  current_setting('test.g.snapshot'), 'Lecture seule : aucune donnée modifiée, jamais de suppression');

-- Storage en lecture seule : ni téléversement (a3 réservé avant le retrait), ni suppression.
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb
  from public.studio_media_assets where id = pg_temp.id('a3')$$, '42501', 'Accès Studio en lecture seule',
  'Storage : réservation antérieure mais auteur passé en lecture seule → téléversement refusé');
select throws_ok($$delete from storage.objects where name = (select storage_key from public.studio_media_assets where id = pg_temp.id('a1'))$$,
  '42501', 'Objet Studio encore référencé', 'Storage : suppression d''un original vivant refusée');
select throws_ok($$update storage.objects set name = name || '.moved' where name = (select storage_key from public.studio_media_assets where id = pg_temp.id('a1'))$$,
  '42501', 'Déplacement Studio refusé', 'Storage : déplacement refusé');
select lives_ok($$update storage.objects set last_accessed_at = now() where name = (select storage_key from public.studio_media_assets where id = pg_temp.id('a1'))$$,
  'Storage : mise à jour sans changement de contenu (horodatage) admise');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values ('studio-originals', 'studio/' || gen_random_uuid() || '/x.jpg', '{}')$$,
  '42501', 'Aucune réservation d''import pour cet objet', 'Storage : objet sans réservation refusé (même en SQL direct)');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values ('studio-renders', 'studio/' || gen_random_uuid() || '/out.mp4', '{}')$$,
  '42501', 'Aucun rendu actif pour cet objet', 'Storage : rendu sans bail actif refusé');
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values ('garde-autre', 'libre.txt', '{}')$$, 'Storage : autres buckets non concernés');

-- ------------------------------------------------------------------ Compte central supprimé / hors pont
update studio_identity.subject_state set account = 'deleted', state_seq = 2 where subject = repeat('J', 43);
select pg_temp.as_user('5b000000-0000-0000-0000-000000000004');
select throws_ok(format($$select public.studio_reserve_media(%L, gen_random_uuid(), 'e.jpg', 'image/jpeg', 10)$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'Compte central supprimé : écriture refusée');
reset role;
select pg_temp.as_user('5b000000-0000-0000-0000-000000000003');
select throws_ok(format($$select public.studio_reserve_media(%L, gen_random_uuid(), 'e.jpg', 'image/jpeg', 10)$$, pg_temp.id('p')), '42501', 'Accès Studio en lecture seule', 'Compte non lié au pont : refusé par défaut (fail-closed)');
reset role;
update studio_guard.control set allow_unlinked_writes = true;
select pg_temp.as_user('5b000000-0000-0000-0000-000000000003');
select lives_ok(format($$select public.studio_reserve_media(%L, gen_random_uuid(), 'e.jpg', 'image/jpeg', 10)$$, pg_temp.id('p')), 'Non lié : admis seulement si allow_unlinked_writes (instances jetables)');
reset role;
update studio_guard.control set allow_unlinked_writes = false;

-- ------------------------------------------------------------------ Droit rétabli : les mêmes appels passent
update studio_identity.subject_state set granted = true where subject = repeat('G', 43);
select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select lives_ok(format($$select public.studio_rename_workspace(%L, 'Renommé')$$, pg_temp.id('w')), 'Accès complet : même appel admis (preuve que seule la garde bloquait)');
select lives_ok(format($$select public.studio_cancel_render(%L)$$, pg_temp.id('j')), 'Accès complet : annulation admise');
reset role;

-- ------------------------------------------------------------------ Mode global lecture seule
update studio_guard.control set mode = 'read_only', reason = 'test';
select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select throws_ok(format($$select public.studio_rename_workspace(%L, 'Encore')$$, pg_temp.id('w')), '42501', 'Studio en lecture seule', 'Studio en lecture seule : accès complet refusé aussi');
reset role;
set local role service_role;
select lives_ok($$select public.studio_render_dispatch()$$, 'Lecture seule globale : chemin render_worker maintenu (travail déjà accepté)');
select lives_ok($$select public.studio_identity_revoke_sessions('5b000000-0000-0000-0000-000000000001')$$, 'Lecture seule globale : révocation maintenue');
select lives_ok($$select public.studio_identity_purge()$$, 'Lecture seule globale : réconciliation/purge identité maintenue');
select throws_ok(format($$select public.studio_finish_media(%L, '5b000000-0000-0000-0000-000000000001', '{}')$$, pg_temp.id('a3')), '42501', 'Accès Studio en lecture seule', 'Lecture seule globale : validation d''import refusée');
reset role;
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb
  from public.studio_media_assets where id = pg_temp.id('a3')$$, '42501', 'Accès Studio en lecture seule', 'Lecture seule globale : téléversement refusé');
update studio_guard.control set mode = 'read_write', reason = null;
delete from studio_guard.control;
select pg_temp.as_user('5b000000-0000-0000-0000-000000000001');
select throws_ok(format($$select public.studio_rename_workspace(%L, 'Encore')$$, pg_temp.id('w')), '42501', 'Studio en lecture seule', 'Ligne de contrôle absente : lecture seule (fail-closed)');
reset role;
insert into studio_guard.control (singleton) values (true);

-- ------------------------------------------------------------------ Clé service : chemins bornés uniquement
set local role service_role;
select throws_ok($$update public.studio_media_assets set upload_status = 'failed'$$, '42501', null, 'service_role : plus aucune écriture de table directe (droit retiré)');
select throws_ok($$truncate public.studio_render_outbox$$, '42501', null, 'service_role : TRUNCATE refusé');
reset role;
grant update on public.studio_projects to service_role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$update public.studio_projects set name = name$$, '42501', 'Écriture service hors chemin système (UPDATE public.studio_projects)', 'service_role même avec un GRANT : refusé hors chemin système');
select set_config('request.jwt.claims', '', true);
reset role;
revoke update on public.studio_projects from service_role;
set local studio.write_path = 'analysis_worker';
select throws_ok($$update public.studio_workspaces set name = name$$, '42501', 'Écriture système hors périmètre (analysis_worker sur public.studio_workspaces)', 'Chemin système borné à ses tables');
set local studio.write_path = 'inconnu';
select throws_ok($$update public.studio_workspaces set name = name$$, '42501', 'Écriture système hors périmètre (inconnu sur public.studio_workspaces)', 'Chemin non déclaré refusé');
set local studio.write_path = '';
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select studio_guard.assert_write('public.studio_projects', 'UPDATE')$$, '42501', 'Écriture refusée', 'anon refusé');
select set_config('request.jwt.claims', '{"role":"supabase_admin"}', true);
select throws_ok($$select studio_guard.assert_write('public.studio_projects', 'UPDATE')$$, '42501', 'Écriture refusée', 'Rôle de jeton inconnu refusé');
select set_config('request.jwt.claims', 'pas-du-json', true);
select throws_ok($$select studio_guard.assert_write('public.studio_projects', 'UPDATE')$$, '42501', 'Écriture refusée', 'Claims illisibles refusés');
select set_config('request.jwt.claims', '', true);
select lives_ok($$select studio_guard.assert_write('public.studio_projects', 'UPDATE')$$, 'Connexion SQL directe sans jeton (opérateur/migrations) : autorisée');

-- ------------------------------------------------------------------ Inventaire verrouillé
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.provolatile = 'v' and has_function_privilege('authenticated', p.oid, 'execute')),
          22, 'Inventaire : exactement 22 RPC d''écriture exécutables par authenticated (nouvelle RPC = revue)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'studio_identity', 'studio_guard') and has_function_privilege('anon', p.oid, 'execute')
              and p.proname like 'studio%'), 0, 'Inventaire : aucune fonction Studio exécutable par anon');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'studio%' and p.provolatile = 'v'
              and has_function_privilege('service_role', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'studio.write_path=%')),
          null, 'Chaque RPC service_role qui écrit déclare un chemin système');
select is((select array_agg(c.oid::regclass::text order by 1) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and (n.nspname in ('studio_identity', 'studio_guard') or (n.nspname = 'public' and c.relname like 'studio%'))
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'studio_write_guard')),
          null, 'Chaque table Studio porte la garde d''écriture');
select is((select count(*)::int from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'service_role')
            and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
            and (table_schema in ('studio_identity', 'studio_guard') or (table_schema = 'public' and table_name like 'studio%'))),
          0, 'Aucun droit d''écriture de table pour anon/authenticated/service_role');
select ok(exists (select 1 from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'studio_storage_write_guard'), 'Garde Storage posée');

select * from finish();
rollback;
