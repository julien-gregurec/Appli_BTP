-- Projet DÉDIÉ Studio : lot post-H porté (20260929100000 → 20260929160000).
-- Invariants propres au port : inventaire classé des RPC, garde centrale sur les 6 nouvelles tables,
-- lecture seule (droit retiré, mode global), révocation d'exposition toujours possible, coupure des
-- liens publics et invitations d'un compte non actif, invitation liée à l'adresse ELSATIA, effacement
-- RGPD étendu (DELETE / ANONYMIZE / DECISION_REQUIRED), éléments post-H non portés absents.
-- Rapport : docs/qualification/ELSATIA_STUDIO_POST_H_PORT_V1.md.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
update studio_guard.control set mode = 'read_write', allow_unlinked_writes = false;
update studio_identity.erasure_policy set mode = 'off', decision_ref = null, grace_period = null;

create function pg_temp.v(k text) returns uuid language sql as $$select current_setting('test.p.'||k)::uuid$$;
create function pg_temp.h(k text) returns text language sql as $$select encode(extensions.digest(k,'sha256'),'hex')$$;
create function pg_temp.as_user(k text) returns void language sql as $$select set_config('request.jwt.claim.sub', pg_temp.v(k)::text, true)$$;
create function pg_temp.req(k text) returns uuid language sql as $$select current_setting('test.p.q'||k)::uuid$$;
create function pg_temp.resolve(k text) returns jsonb language plpgsql as $$
declare r jsonb; begin
  set local role service_role;
  r := public.studio_resolve_render_share(pg_temp.h(k));
  reset role;
  return r;
end $$;

-- ------------------------------------------------------------------ Acteurs (tous liés au pont)
-- a : accès complet ; r : droit Studio retiré (lecture seule) ; b : lié, e-mail Auth différent de
-- l'adresse ELSATIA ; x : sera supprimé (effacement complet) ; z : sera supprimé (bloqué, décision) ;
-- y : propriétaire d'espaces où x et z ont contribué.
do $$
declare k text;
begin
  foreach k in array array['a','r','b','x','z','y'] loop
    perform set_config('test.p.'||k, gen_random_uuid()::text, true);
  end loop;
  foreach k in array array['wa','wr','wx','wy','wy2','pa','pr','px','py','ia','ir','ix','iy','ta','tr','tx','ty','ja','jr','jx','oa','or','ox'] loop
    perform set_config('test.p.'||k, gen_random_uuid()::text, true);
  end loop;
end $$;
insert into auth.users(id, email) values
  (pg_temp.v('a'), 'a@elsatia.test'), (pg_temp.v('r'), 'r@elsatia.test'), (pg_temp.v('b'), 'ancienne@ailleurs.test'),
  (pg_temp.v('x'), 'x@elsatia.test'), (pg_temp.v('z'), 'z@elsatia.test'), (pg_temp.v('y'), 'y@elsatia.test');
insert into studio_identity.subject_state(subject, account, state_seq, granted, plan) values
  (repeat('A', 43), 'active', 1, true, null), (repeat('R', 43), 'active', 1, false, null),
  (repeat('B', 43), 'active', 1, true, null), (repeat('X', 43), 'active', 1, true, null),
  (repeat('Z', 43), 'active', 1, true, null), (repeat('Y', 43), 'active', 1, true, null);
insert into studio_identity.links(subject, user_id, email) values
  (repeat('A', 43), pg_temp.v('a'), 'a@elsatia.test'), (repeat('R', 43), pg_temp.v('r'), 'r@elsatia.test'),
  (repeat('B', 43), pg_temp.v('b'), 'b@elsatia.test'), (repeat('X', 43), pg_temp.v('x'), 'x@elsatia.test'),
  (repeat('Z', 43), pg_temp.v('z'), 'z@elsatia.test'), (repeat('Y', 43), pg_temp.v('y'), 'y@elsatia.test');

-- Espaces personnels a, r, x (seuls membres) avec projet, logo PNG prêt, rendu publié ; espaces de y.
insert into public.studio_workspaces(id, name, workspace_type, owner_user_id) values
  (pg_temp.v('wa'), 'Perso A', 'personal', pg_temp.v('a')), (pg_temp.v('wr'), 'Perso R', 'personal', pg_temp.v('r')),
  (pg_temp.v('wx'), 'Perso X', 'personal', pg_temp.v('x')), (pg_temp.v('wy'), 'Agence Y', 'professional', pg_temp.v('y')),
  (pg_temp.v('wy2'), 'Atelier Y', 'professional', pg_temp.v('y'));
insert into public.studio_workspace_members(workspace_id, user_id, role) values
  (pg_temp.v('wa'), pg_temp.v('a'), 'owner'), (pg_temp.v('wr'), pg_temp.v('r'), 'owner'), (pg_temp.v('wx'), pg_temp.v('x'), 'owner'),
  (pg_temp.v('wy'), pg_temp.v('y'), 'owner'), (pg_temp.v('wy'), pg_temp.v('z'), 'admin'), (pg_temp.v('wy2'), pg_temp.v('y'), 'owner');
do $$
declare k text;
begin
  foreach k in array array['a','r','x','y'] loop
    insert into public.studio_projects(id, workspace_id, name, project_type, created_by)
      values (pg_temp.v('p'||k), pg_temp.v('w'||k), 'Projet '||k, 'free', pg_temp.v(k));
    insert into public.studio_media_assets(id, workspace_id, project_id, uploaded_by, request_id, storage_key, original_filename, mime_type, media_type, file_size_bytes, upload_status)
      values (pg_temp.v('i'||k), pg_temp.v('w'||k), pg_temp.v('p'||k), pg_temp.v(k), gen_random_uuid(),
              'studio/'||pg_temp.v('w'||k)||'/'||pg_temp.v('p'||k)||'/'||pg_temp.v('i'||k)||'/original.png', 'logo.png', 'image/png', 'image', 123, 'ready');
    insert into public.studio_project_assets(workspace_id, project_id, asset_id, sort_order) values (pg_temp.v('w'||k), pg_temp.v('p'||k), pg_temp.v('i'||k), 0) on conflict do nothing;
    insert into public.studio_timelines(id, workspace_id, project_id, version, status, total_duration_ms, aspect_ratio, generator_version, created_by)
      values (pg_temp.v('t'||k), pg_temp.v('w'||k), pg_temp.v('p'||k), 1, 'generated', 0, '9:16', 'v1', pg_temp.v(k));
  end loop;
  foreach k in array array['a','r','x'] loop
    insert into public.studio_render_jobs(id, workspace_id, project_id, timeline_id, requested_by, request_id, profile, width, height, snapshot, status)
      values (pg_temp.v('j'||k), pg_temp.v('w'||k), pg_temp.v('p'||k), pg_temp.v('t'||k), pg_temp.v(k), gen_random_uuid(), 'standard', 1080, 1920, '{}', 'completed');
    insert into public.studio_render_outputs(id, workspace_id, project_id, timeline_id, render_job_id, storage_key, file_size_bytes, width, height, duration_ms, codec_video, codec_audio, fps)
      values (pg_temp.v('o'||k), pg_temp.v('w'||k), pg_temp.v('p'||k), pg_temp.v('t'||k), pg_temp.v('j'||k),
              'studio/'||pg_temp.v('w'||k)||'/'||pg_temp.v('p'||k)||'/renders/'||pg_temp.v('j'||k)||'/'||gen_random_uuid()||'/output.mp4', 456, 1080, 1920, 3000, 'h264', 'aac', 30);
    insert into public.studio_render_shares(workspace_id, project_id, output_id, token_hash, created_by, expires_at)
      values (pg_temp.v('w'||k), pg_temp.v('p'||k), pg_temp.v('o'||k), pg_temp.h('share-'||k), pg_temp.v(k), now() + interval '7 days');
  end loop;
end $$;
set local studio.write_path = 'storage_maintenance';
insert into storage.objects(bucket_id, name, metadata)
  select 'studio-originals', storage_key, '{"size":123}'::jsonb from public.studio_media_assets
  union all select 'studio-renders', storage_key, '{"size":456}' from public.studio_render_outputs;
set local studio.write_path = '';

-- ================================================================ 1. Inventaire classé (§7)
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.provolatile = 'v' and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname in ('studio_save_brand_kit','studio_attach_brand_logo','studio_create_render_share','studio_revoke_render_share',
                        'studio_invite_member','studio_revoke_invitation','studio_accept_invitation')),
  array['studio_accept_invitation','studio_attach_brand_logo','studio_create_render_share','studio_invite_member',
        'studio_revoke_invitation','studio_revoke_render_share','studio_save_brand_kit'],
  'RPC utilisateur d''écriture post-H : exactement les 7 revues');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.provolatile = 's' and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname in ('studio_workspace_usage','studio_get_brand_kit','studio_list_brand_logo_candidates','studio_list_render_shares','studio_list_invitations')),
  array['studio_get_brand_kit','studio_list_brand_logo_candidates','studio_list_invitations','studio_list_render_shares','studio_workspace_usage'],
  'RPC utilisateur de lecture post-H : 5, toutes STABLE (aucune écriture possible)');
select ok((select bool_and(p.provolatile = 's' and has_function_privilege('service_role', p.oid, 'execute')
                            and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('studio_resolve_render_share','studio_resolve_invitation')),
  'Résolutions publiques (lien, invitation) : service_role seul, STABLE (lecture)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('studio_revoke_render_share','studio_revoke_invitation')
              and 'studio.write_path=exposure_revocation' = any (p.proconfig)), 2,
  'Révocations : chemin exposure_revocation déclaré');
select is((select array_agg(t order by t) from unnest(array['studio_render_limits','studio_usage_events','studio_brand_kits',
             'studio_render_shares','studio_workspace_invitations']) t
            where exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relname = t and g.tgname = 'studio_write_guard')),
  array['studio_brand_kits','studio_render_limits','studio_render_shares','studio_usage_events','studio_workspace_invitations'],
  'Garde centrale posée sur chaque nouvelle table post-H');
select ok(not exists (select 1 from unnest(array['studio_render_limits','studio_usage_events','studio_brand_kits','studio_render_shares',
                                                 'studio_workspace_invitations']) t, unnest(array['anon','authenticated','service_role']) r,
                                   unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) op
                       where has_table_privilege(r, 'public.'||t, op)),
  'Aucun droit d''écriture de table direct (anon, authenticated, service_role) sur les tables post-H');
select ok((select tables @> array['public.studio_usage_events'] from studio_guard.system_paths where path = 'render_worker'),
  'Journal d''usage : écrit seulement par le chemin render_worker (publication)');
select ok((select tables @> array['public.studio_usage_events','public.studio_brand_kits','public.studio_render_shares','public.studio_workspace_invitations']
                  and not tables @> array['public.studio_render_limits'] from studio_guard.system_paths where path = 'rgpd_erasure'),
  'Chemin rgpd_erasure étendu aux 4 tables de données post-H (pas au réglage opérateur)');
select is((select array_agg(path order by path) from studio_guard.system_paths where user_callable), array['exposure_revocation'],
  'Un seul chemin appelable par l''utilisateur');
select hasnt_function('public', 'studio_deletion_prepare', array['uuid'], 'Suppression de compte post-H (côté Studio) non portée');
select hasnt_function('public', 'studio_my_deletion_plan', 'Plan de suppression post-H non porté');
select hasnt_table('public', 'studio_storage_purge_queue', 'File de purge post-H non portée (remplacée par erasure_storage_queue)');
select hasnt_table('public', 'studio_account_deletions', 'Journal de suppression post-H non porté (remplacé par erasure_events)');
select hasnt_function('public', 'studio_pending_invitation_for', array['text'], 'Porte d''inscription publique post-H non portée');
select ok(not exists (select 1 from pg_tables where schemaname = 'public' and tablename not like 'studio\_%'),
  'Projet dédié : aucune table non Studio');

-- ================================================================ 2. Accès complet : écritures admises
set local role authenticated;
select pg_temp.as_user('a');
select lives_ok(format($$select public.studio_save_brand_kit(%L, jsonb_build_object('company_name','Maçonnerie A','logo_asset_id',%L::text), null)$$,
                       pg_temp.v('wa'), pg_temp.v('ia')), 'Accès complet : identité de marque enregistrée');
select lives_ok(format($$select public.studio_create_render_share(%L, %L, 3)$$, pg_temp.v('oa'), pg_temp.h('share-a2')), 'Accès complet : lien de partage créé');
select lives_ok(format($$select public.studio_invite_member(%L, 'b@elsatia.test', 'editor', %L, 7)$$, pg_temp.v('wa'), pg_temp.h('inv-b')),
  'Accès complet : invitation envoyée (adresse ELSATIA de b)');
select lives_ok(format($$select public.studio_invite_member(%L, 'ancienne@ailleurs.test', 'viewer', %L, 7)$$, pg_temp.v('wa'), pg_temp.h('inv-b-auth')),
  'Invitation à l''adresse Auth locale de b');
select lives_ok(format($$select public.studio_invite_member(%L, 'r@elsatia.test', 'viewer', %L, 7)$$, pg_temp.v('wa'), pg_temp.h('inv-r')), 'Invitation de r');

-- ================================================================ 3. Invitation liée à l'adresse ELSATIA
select pg_temp.as_user('b');
select throws_ok(format($$select public.studio_accept_invitation(%L)$$, pg_temp.h('inv-b-auth')), '42501', 'Cette invitation est destinée à une autre adresse',
  'Compte lié : l''adresse Auth locale ne vaut pas adresse ELSATIA');
select is(public.studio_accept_invitation(pg_temp.h('inv-b')), pg_temp.v('wa'), 'Compte lié : acceptation par l''adresse ELSATIA (links.email)');
select pg_temp.as_user('r');
select throws_ok(format($$select public.studio_accept_invitation(%L)$$, pg_temp.h('inv-r')), '42501', 'Accès Studio en lecture seule',
  'Lecture seule : acceptation refusée par la garde (adhésion = écriture)');
reset role;
select is((select count(*) from public.studio_workspace_members where workspace_id = pg_temp.v('wa') and user_id = pg_temp.v('r')), 0::bigint,
  'Lecture seule : aucune adhésion créée');

-- ================================================================ 4. Lecture seule (droit retiré)
insert into public.studio_workspace_invitations(workspace_id, email, role, token_hash, invited_by, expires_at)
  values (pg_temp.v('wr'), 'invite@elsatia.test', 'viewer', pg_temp.h('inv-by-r'), pg_temp.v('r'), now() + interval '7 days');
set local role authenticated;
select pg_temp.as_user('r');
select throws_ok(format($$select public.studio_save_brand_kit(%L, '{"company_name":"R"}'::jsonb, null)$$, pg_temp.v('wr')), '42501', 'Accès Studio en lecture seule',
  'Lecture seule : identité de marque refusée');
select throws_ok(format($$select public.studio_create_render_share(%L, %L, 3)$$, pg_temp.v('or'), pg_temp.h('share-r2')), '42501', 'Accès Studio en lecture seule',
  'Lecture seule : nouveau lien de partage refusé');
select throws_ok(format($$select public.studio_invite_member(%L, 'nouveau@elsatia.test', 'viewer', %L, 7)$$, pg_temp.v('wr'), pg_temp.h('inv-r2')), '42501',
  'Accès Studio en lecture seule', 'Lecture seule : invitation refusée');
select throws_ok(format($$select public.studio_attach_brand_logo(%L)$$, pg_temp.v('pr')), '22023', 'Aucun logo de marque disponible',
  'Lecture seule : aucun logo (rien n''a pu être enregistré)');
select lives_ok(format($$select public.studio_get_brand_kit(%L)$$, pg_temp.v('wr')), 'Lecture seule : lecture de l''identité de marque');
select is(jsonb_array_length(public.studio_list_render_shares(pg_temp.v('pr'))), 1, 'Lecture seule : liste des liens lisible');
select lives_ok(format($$select public.studio_revoke_render_share(%L)$$, (select id from public.studio_list_render_shares(pg_temp.v('pr')) x,
                        jsonb_to_recordset(x) as s(id uuid) limit 1)),
  'Lecture seule : révocation d''un lien public TOUJOURS possible');
select lives_ok(format($$select public.studio_revoke_invitation(%L)$$, (select (e->>'id')::uuid from jsonb_array_elements(public.studio_list_invitations(pg_temp.v('wr'))) e limit 1)),
  'Lecture seule : révocation d''une invitation TOUJOURS possible');
-- Un utilisateur qui se déclare lui-même le chemin : ni INSERT, ni autre table, ni droit de table.
set local studio.write_path = 'exposure_revocation';
select throws_ok($$update public.studio_render_shares set revoked_at = null$$, '42501', null, 'Aucun droit de table direct, même avec le chemin');
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select studio_guard.assert_write('public.studio_brand_kits', 'UPDATE')$$, '42501',
  'Écriture système hors périmètre (exposure_revocation sur public.studio_brand_kits)', 'Chemin utilisateur borné à ses tables');
select throws_ok($$select studio_guard.assert_write('public.studio_render_shares', 'INSERT')$$, '42501',
  'Écriture système hors périmètre (exposure_revocation sur public.studio_render_shares)', 'Chemin utilisateur borné à UPDATE (révoquer, jamais créer)');
select throws_ok($$select studio_guard.assert_write('public.studio_render_shares', 'DELETE')$$, '42501',
  'Écriture système hors périmètre (exposure_revocation sur public.studio_render_shares)', 'Chemin utilisateur : jamais de suppression');
select set_config('request.jwt.claim.role', '', true);
set local studio.write_path = '';
select is((select count(*) from public.studio_render_shares where workspace_id = pg_temp.v('wr') and revoked_at is null), 0::bigint, 'Lien de r révoqué');
select is((select count(*) from public.studio_workspace_invitations where workspace_id = pg_temp.v('wr') and revoked_at is null), 0::bigint, 'Invitation de r révoquée');
select is((select count(*) from public.studio_brand_kits where workspace_id = pg_temp.v('wr')), 0::bigint, 'Aucune identité de marque écrite par r');

-- Mode global read_only : écritures refusées pour tous, révocations maintenues.
update studio_guard.control set mode = 'read_only';
select set_config('test.p.sa2', (select id from public.studio_render_shares where token_hash = pg_temp.h('share-a2'))::text, true);
select set_config('test.p.sa', (select id from public.studio_render_shares where token_hash = pg_temp.h('share-a'))::text, true);
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok(format($$select public.studio_save_brand_kit(%L, '{"company_name":"A2"}'::jsonb, 1)$$, pg_temp.v('wa')), '42501', 'Studio en lecture seule',
  'Mode global read_only : identité de marque refusée');
select lives_ok(format($$select public.studio_revoke_render_share(%L)$$, pg_temp.v('sa2')),
  'Mode global read_only : révocation maintenue');
reset role;
update studio_guard.control set mode = 'read_write';

-- Service : aucune écriture directe sur les tables post-H.
set local role service_role;
select throws_ok(format($$select public.studio_create_render_share(%L, %L, 3)$$, pg_temp.v('oa'), pg_temp.h('svc')), '42501', null,
  'Clé service : RPC utilisateur non exécutable');
reset role;
grant update on public.studio_brand_kits to service_role;
set local role service_role;
select throws_ok($$update public.studio_brand_kits set company_name = 'x'$$, '42501', 'Écriture service hors chemin système (UPDATE public.studio_brand_kits)',
  'Clé service même avec un GRANT : refusée hors chemin système');
reset role;
revoke update on public.studio_brand_kits from service_role;

-- ================================================================ 5. Compte non actif : exposition coupée
select isnt(pg_temp.resolve('share-a'), null, 'Compte actif : lien public résolu');
update studio_identity.subject_state set account = 'disabled' where subject = repeat('A', 43);
select is(pg_temp.resolve('share-a'), null, 'Compte ELSATIA désactivé : lien public coupé immédiatement');
set local role service_role;
select is(public.studio_resolve_invitation(pg_temp.h('inv-r')) ->> 'status', 'unavailable', 'Invitant désactivé : invitation indisponible');
reset role;
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok(format($$select public.studio_revoke_render_share(%L)$$, pg_temp.v('sa')),
  '42501', 'Accès Studio bloqué', 'Compte bloqué : plus aucune écriture, même de révocation (sessions déjà révoquées par le pont)');
reset role;
update studio_identity.subject_state set account = 'active' where subject = repeat('A', 43);
select isnt(pg_temp.resolve('share-a'), null, 'Compte réactivé : lien de nouveau résolu (non révoqué, non expiré)');
update public.studio_workspaces set deleted_at = now() where id = pg_temp.v('wa');
select is(pg_temp.resolve('share-a'), null, 'Espace fermé : lien coupé');
update public.studio_workspaces set deleted_at = null where id = pg_temp.v('wa');

-- ================================================================ 6. RGPD : effacement complet (x)
-- x : identité de marque (logo), lien public, invitation en attente, journal d'usage (publication),
-- invitation acceptée dans l'espace de y, invitation en attente adressée à x dans un autre espace de y.
insert into public.studio_brand_kits(workspace_id, company_name, email, phone, logo_asset_id, updated_by)
  values (pg_temp.v('wx'), 'Entreprise X', 'contact@x.test', '+33 6 00 00 00 00', pg_temp.v('ix'), pg_temp.v('x'));
insert into public.studio_workspace_invitations(workspace_id, email, role, token_hash, invited_by, expires_at) values
  (pg_temp.v('wx'), 'ami@x.test', 'viewer', pg_temp.h('inv-x-out'), pg_temp.v('x'), now() + interval '7 days'),
  (pg_temp.v('wy2'), 'x@elsatia.test', 'viewer', pg_temp.h('inv-x-in'), pg_temp.v('y'), now() + interval '7 days');
insert into public.studio_workspace_invitations(workspace_id, email, role, token_hash, invited_by, expires_at, accepted_at, accepted_by)
  values (pg_temp.v('wy'), 'x@elsatia.test', 'viewer', pg_temp.h('inv-x-acc'), pg_temp.v('y'), now() + interval '7 days', now(), pg_temp.v('x'));
insert into public.studio_workspace_members(workspace_id, user_id, role) values (pg_temp.v('wy'), pg_temp.v('x'), 'viewer');
select ok((select count(*) from public.studio_usage_events where workspace_id = pg_temp.v('wx')) >= 1, 'Journal d''usage alimenté par la publication');
select throws_ok(format($$update public.studio_media_assets set deleted_at = now() where id = %L$$, pg_temp.v('ix')), '23514', null,
  'Logo de marque : suppression logique refusée tant qu''il est utilisé');

set local role service_role;
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('X', 43), 5, 'deleted', 'account_deleted', false, null, null, null)),
  'applied', 'Compte ELSATIA de x supprimé');
reset role;
select set_config('test.p.qx', (select id from studio_identity.erasure_requests where user_id = pg_temp.v('x'))::text, true);
select is(pg_temp.resolve('share-x'), null, 'Suppression : lien public coupé AVANT tout effacement (mode off)');
select is((select status from studio_identity.erasure_requests where id = pg_temp.req('x')), 'pending', 'Demande d''effacement ouverte');

update studio_identity.erasure_policy set mode = 'dry_run';
set local role service_role;
select is(public.studio_erasure_prepare(pg_temp.req('x')) #>> '{inventory,delete,brand_kits}', '1', 'Inventaire DELETE : identité de marque');
reset role;
select is((select plan #>> '{delete,render_shares}' from studio_identity.erasure_requests where id = pg_temp.req('x')), '1', 'Inventaire DELETE : liens publics');
select is((select plan #>> '{delete,invitations}' from studio_identity.erasure_requests where id = pg_temp.req('x')), '1', 'Inventaire DELETE : invitations de l''espace');
select ok((select (plan #>> '{delete,usage_events}')::int >= 1 from studio_identity.erasure_requests where id = pg_temp.req('x')), 'Inventaire DELETE : journal d''usage');
select is((select plan #>> '{delete,invitations_addressed}' from studio_identity.erasure_requests where id = pg_temp.req('x')), '2',
  'Inventaire DELETE : invitations adressées à x ailleurs (e-mail)');
select is((select plan #>> '{anonymize,invitations_accepted_elsewhere}' from studio_identity.erasure_requests where id = pg_temp.req('x')), '1',
  'Inventaire ANONYMIZE : acceptation enregistrée ailleurs');
select is((select plan #>> '{decision_required,authored_in_shared_workspaces}' from studio_identity.erasure_requests where id = pg_temp.req('x')), '0',
  'Aucun contenu créé chez autrui : pas de décision requise');

update studio_identity.erasure_policy set mode = 'execute', decision_ref = 'DEC-TEST-POSTH', grace_period = interval '0';
set local role service_role;
select is(public.studio_erasure_execute(pg_temp.req('x')) ->> 'outcome', 'db_erased', 'Exécution base');
reset role;
select is((select count(*) from public.studio_brand_kits where workspace_id = pg_temp.v('wx')), 0::bigint, 'Identité de marque effacée');
select is((select count(*) from public.studio_render_shares where workspace_id = pg_temp.v('wx')), 0::bigint, 'Liens publics effacés');
select is((select count(*) from public.studio_usage_events where workspace_id = pg_temp.v('wx')), 0::bigint, 'Journal d''usage effacé');
select is((select count(*) from public.studio_workspace_invitations where workspace_id = pg_temp.v('wx') or email = 'x@elsatia.test'), 0::bigint,
  'Invitations de l''espace et adressées à x : effacées');
select is((select count(*) from public.studio_workspace_invitations where accepted_by = pg_temp.v('x')), 0::bigint, 'Plus aucune référence d''acceptation à x');
select is((select count(*) from public.studio_workspace_members where user_id = pg_temp.v('x')), 0::bigint, 'Adhésions de x retirées');
select is((select count(*) from public.studio_workspaces where id = pg_temp.v('wx')), 0::bigint, 'Espace personnel de x effacé');
select ok(exists (select 1 from studio_identity.erasure_storage_queue q where q.request_id = pg_temp.req('x') and q.bucket = 'studio-renders' and q.kind = 'object'),
  'Rendu partagé : objet en file d''effacement Storage');
select is((select count(*) from public.studio_workspace_invitations where workspace_id = pg_temp.v('wy2')), 0::bigint, 'Espace de y : aucune autre invitation touchée (il n''y en avait qu''une, adressée à x)');
select is((select count(*) from public.studio_workspaces where owner_user_id = pg_temp.v('y')), 2::bigint, 'Espaces de y intacts');
set local role service_role;
select is(public.studio_erasure_execute(pg_temp.req('x')) ->> 'outcome', 'db_erased', 'Rejeu : sans erreur');
reset role;
-- Storage : le worker supprime les objets (storage-api), puis constate en base.
set local studio.write_path = 'storage_maintenance';
delete from storage.objects o using studio_identity.erasure_storage_queue q
 where q.request_id = pg_temp.req('x') and o.bucket_id = q.bucket and (o.name = q.object_key or (q.kind = 'prefix' and starts_with(o.name, q.object_key)));
set local studio.write_path = '';
set local role service_role;
select ok((select bool_and(public.studio_erasure_storage_done(b.queue_id)) from public.studio_erasure_storage_batch(pg_temp.req('x'), 100) b), 'Constats Storage');
select is(public.studio_erasure_finalize(pg_temp.req('x')), pg_temp.v('x'), 'Clôture : utilisateur Auth Studio à supprimer');
reset role;
delete from auth.users where id = pg_temp.v('x');
set local role service_role;
select ok(public.studio_erasure_confirm_auth_deleted(pg_temp.req('x')), 'Utilisateur Auth supprimé : aucune clé étrangère post-H ne l''a empêché');
reset role;

-- ================================================================ 7. RGPD : décision requise (z)
-- z (admin chez y) a modifié l'identité de marque, créé un lien public et une invitation dans l'espace
-- de y : contenus d'autrui → DECISION_REQUIRED, rien n'est touché.
insert into public.studio_render_jobs(id, workspace_id, project_id, timeline_id, requested_by, request_id, profile, width, height, snapshot, status)
  values (pg_temp.v('jx'), pg_temp.v('wy'), pg_temp.v('py'), pg_temp.v('ty'), pg_temp.v('y'), gen_random_uuid(), 'standard', 1080, 1920, '{}', 'completed');
insert into public.studio_render_outputs(id, workspace_id, project_id, timeline_id, render_job_id, storage_key, file_size_bytes, width, height, duration_ms, codec_video, codec_audio, fps)
  values (pg_temp.v('ox'), pg_temp.v('wy'), pg_temp.v('py'), pg_temp.v('ty'), pg_temp.v('jx'), 'studio/'||pg_temp.v('wy')||'/'||pg_temp.v('py')||'/renders/'||pg_temp.v('jx')||'/l/output.mp4', 1, 1080, 1920, 3000, 'h264', 'aac', 30);
insert into public.studio_brand_kits(workspace_id, company_name, updated_by) values (pg_temp.v('wy'), 'Agence Y', pg_temp.v('z'));
insert into public.studio_render_shares(workspace_id, project_id, output_id, token_hash, created_by, expires_at)
  values (pg_temp.v('wy'), pg_temp.v('py'), pg_temp.v('ox'), pg_temp.h('share-z'), pg_temp.v('z'), now() + interval '7 days');
insert into public.studio_workspace_invitations(workspace_id, email, role, token_hash, invited_by, expires_at)
  values (pg_temp.v('wy'), 'tiers@elsatia.test', 'viewer', pg_temp.h('inv-z'), pg_temp.v('z'), now() + interval '7 days');
set local role service_role;
select is((select status from public.studio_identity_apply_lifecycle(gen_random_uuid(), repeat('Z', 43), 5, 'deleted', 'account_deleted', false, null, null, null)),
  'applied', 'Compte ELSATIA de z supprimé');
reset role;
select set_config('test.p.qz', (select id from studio_identity.erasure_requests where user_id = pg_temp.v('z'))::text, true);
set local role service_role;
select is(public.studio_erasure_prepare(pg_temp.req('z')) #>> '{inventory,decision_required,authored_in_shared_workspaces}', '3',
  'DECISION_REQUIRED : identité de marque, lien et invitation créés chez autrui');
select is(public.studio_erasure_execute(pg_temp.req('z')) ->> 'outcome', 'db_erased', 'Exécution : périmètre propre seulement');
reset role;
select is((select status from studio_identity.erasure_requests where id = pg_temp.req('z')), 'awaiting_decision', 'Clôture bloquée : décision requise');
select is((select count(*) from public.studio_brand_kits where workspace_id = pg_temp.v('wy')), 1::bigint, 'Identité de marque de y intacte');
select isnt(pg_temp.resolve('share-z'), null, 'Lien de y (créé par z) : maintenu, l''espace et son propriétaire sont actifs');
set local role service_role;
select throws_ok(format($$select public.studio_erasure_finalize(%L)$$, pg_temp.req('z')), '22023', null, 'Clôture refusée tant que la décision manque');
reset role;

select * from finish();
rollback;
