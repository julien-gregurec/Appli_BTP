begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.draft(asset uuid) returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio','9:16','target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type','image','source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))));
$$;
-- Publishes a render for the given profile (worker steps), returning the output id.
create function pg_temp.publish(profile text) returns uuid language plpgsql security definer set search_path='' as $$
declare job uuid; lease uuid:=gen_random_uuid(); out uuid; w uuid; p uuid;
begin
 job:=public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),profile);
 select workspace_id,project_id into w,p from public.studio_render_jobs where id=job;
 perform public.studio_claim_render(job,lease);
 insert into storage.objects(bucket_id,name,metadata) values('studio-renders','studio/'||w||'/'||p||'/renders/'||job||'/'||lease||'/output.mp4','{"size":123}');
 out:=public.studio_complete_render(job,lease,123,3000);
 return out;
end $$;
insert into auth.users(id,email) values
('58000000-0000-0000-0000-000000000001','share-owner@example.test'),
('58000000-0000-0000-0000-000000000002','share-editor@example.test'),
('58000000-0000-0000-0000-000000000003','share-viewer@example.test'),
('58000000-0000-0000-0000-000000000004','share-other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Partage A','personal')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Chantier Partage','construction')::text,true);
select set_config('test.d.aa',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'a.jpg','image/jpeg',123)::text,true);
select public.studio_set_member(pg_temp.id('wa'),'58000000-0000-0000-0000-000000000002','editor');
select public.studio_set_member(pg_temp.id('wa'),'58000000-0000-0000-0000-000000000003','viewer');
reset role;
update public.studio_media_assets set upload_status='ready' where workspace_id=pg_temp.id('wa');
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb from public.studio_media_assets where workspace_id=pg_temp.id('wa');
update public.studio_render_limits set max_active_per_project=20,max_active_per_workspace=50,max_per_user_hour=500,max_per_workspace_day=500;
set local role authenticated;
select public.studio_save_timeline(pg_temp.id('pa'),null,null,(select revision from public.studio_projects where id=pg_temp.id('pa')),pg_temp.draft(pg_temp.id('aa')));

-- Watermark: default off, set only by the operator, copied into every new snapshot.
select set_config('test.d.j0',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview')::text,true);
select is((select snapshot->'watermark' from public.studio_render_jobs where id=pg_temp.id('j0')),'false'::jsonb,'snapshot is not watermarked by default');
select throws_ok('update public.studio_workspaces set render_watermark=true','42501',null,'a member cannot switch the watermark');
reset role;
update public.studio_workspaces set render_watermark=true where id=pg_temp.id('wa');
set local role authenticated;
select set_config('test.d.j1',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview')::text,true);
select is((select snapshot->'watermark' from public.studio_render_jobs where id=pg_temp.id('j1')),'true'::jsonb,'operator flag lands in the new snapshot');
select is((select count(*) from public.studio_render_jobs where snapshot->'watermark'='false'::jsonb),1::bigint,'earlier snapshots are untouched');
reset role;
update public.studio_workspaces set render_watermark=false where id=pg_temp.id('wa');
update public.studio_render_jobs set status='cancelled' where workspace_id=pg_temp.id('wa');
set local role authenticated;
select set_config('test.d.final',pg_temp.publish('standard')::text,true);
select set_config('test.d.prev',pg_temp.publish('preview')::text,true);

-- Creating links.
select set_config('test.d.hash1',encode(extensions.digest('secret-one','sha256'),'hex'),true);
select set_config('test.d.hash2',encode(extensions.digest('secret-two','sha256'),'hex'),true);
select set_config('test.d.share1',public.studio_create_render_share(pg_temp.id('final'),current_setting('test.d.hash1'),7)::text,true);
select ok(pg_temp.id('share1') is not null,'owner creates a link for a final export');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''prev''),current_setting(''test.d.hash2''),7)','22023',null,'a preview cannot be shared');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''final''),''not-a-hash'',7)','22023',null,'only a SHA-256 hash is accepted');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''final''),current_setting(''test.d.hash2''),0)','22023',null,'a link lasts at least one day');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''final''),current_setting(''test.d.hash2''),31)','22023',null,'a link lasts at most 30 days');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''final''),current_setting(''test.d.hash1''),7)','23505',null,'a link secret cannot be reused');
select throws_ok('select public.studio_create_render_share(gen_random_uuid(),current_setting(''test.d.hash2''),7)','42501',null,'unknown export answers like a forbidden one');
select throws_ok('select count(*) from public.studio_render_shares','42501',null,'the share table is closed to clients');
select is((select count(*) from jsonb_array_elements(public.studio_list_render_shares(pg_temp.id('pa')))),1::bigint,'owner lists the link');
select is((public.studio_list_render_shares(pg_temp.id('pa'))->0->>'active')::boolean,true,'listed as active');
select ok(public.studio_list_render_shares(pg_temp.id('pa'))::text not like '%'||current_setting('test.d.hash1')||'%','the hash is never listed');

-- Active-link cap per export.
select lives_ok(format('select public.studio_create_render_share(%L,%L,7)',pg_temp.id('final'),encode(extensions.digest('s2','sha256'),'hex')),'second link');
select lives_ok(format('select public.studio_create_render_share(%L,%L,7)',pg_temp.id('final'),encode(extensions.digest('s3','sha256'),'hex')),'third link');
select lives_ok(format('select public.studio_create_render_share(%L,%L,7)',pg_temp.id('final'),encode(extensions.digest('s4','sha256'),'hex')),'fourth link');
select lives_ok(format('select public.studio_create_render_share(%L,%L,7)',pg_temp.id('final'),encode(extensions.digest('s5','sha256'),'hex')),'fifth link');
select throws_ok(format('select public.studio_create_render_share(%L,%L,7)',pg_temp.id('final'),encode(extensions.digest('s6','sha256'),'hex')),'22023',null,'sixth active link refused');

-- Public resolution is server-only.
select throws_ok('select public.studio_resolve_render_share(current_setting(''test.d.hash1''))','42501',null,'clients cannot resolve a link');
reset role;set local role service_role;
select is((public.studio_resolve_render_share(current_setting('test.d.hash1'))->>'width')::int,1080,'server resolves a valid link');
select ok((public.studio_resolve_render_share(current_setting('test.d.hash1'))->>'storage_key') like 'studio/%/output.mp4','server gets the storage key');
select is(public.studio_resolve_render_share(encode(extensions.digest('unknown','sha256'),'hex')),null,'unknown secret resolves to nothing');
select ok(public.studio_resolve_render_share(current_setting('test.d.hash1'))::text not like '%workspace%','resolution has no workspace field (the storage key holds only opaque UUIDs)');
reset role;

-- Roles.
set local role authenticated;
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true);
select throws_ok('select public.studio_list_render_shares(pg_temp.id(''pa''))','42501',null,'viewer cannot list links');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''final''),current_setting(''test.d.hash2''),7)','42501',null,'viewer cannot create a link');
select throws_ok('select public.studio_revoke_render_share(pg_temp.id(''share1''))','42501',null,'viewer cannot revoke');
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000004',true);
select throws_ok('select public.studio_list_render_shares(pg_temp.id(''pa''))','42501',null,'other tenant cannot list links');
select throws_ok('select public.studio_create_render_share(pg_temp.id(''final''),current_setting(''test.d.hash2''),7)','42501',null,'other tenant cannot create a link');
select throws_ok('select public.studio_revoke_render_share(pg_temp.id(''share1''))','42501',null,'other tenant cannot revoke');

-- Revocation, expiry and lifecycle.
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000002',true);
select lives_ok('select public.studio_revoke_render_share(pg_temp.id(''share1''))','editor revokes');
reset role;set local role service_role;
select is(public.studio_resolve_render_share(current_setting('test.d.hash1')),null,'a revoked link no longer resolves');
reset role;
update public.studio_render_shares set expires_at=now()-interval '1 minute' where token_hash=encode(extensions.digest('s2','sha256'),'hex');
set local role service_role;
select is(public.studio_resolve_render_share(encode(extensions.digest('s2','sha256'),'hex')),null,'an expired link no longer resolves');
select ok(public.studio_resolve_render_share(encode(extensions.digest('s3','sha256'),'hex')) is not null,'other links keep working');
reset role;
update public.studio_render_outputs set deleted_at=now() where id=pg_temp.id('final');
set local role service_role;
select is(public.studio_resolve_render_share(encode(extensions.digest('s3','sha256'),'hex')),null,'a deleted output stops every link');
reset role;
update public.studio_render_outputs set deleted_at=null where id=pg_temp.id('final');
update public.studio_projects set deleted_at=now() where id=pg_temp.id('pa');
set local role service_role;
select is(public.studio_resolve_render_share(encode(extensions.digest('s3','sha256'),'hex')),null,'a deleted project stops every link');
select * from finish();
rollback;
