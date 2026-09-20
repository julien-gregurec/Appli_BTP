begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.draft(asset uuid,ratio text) returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio',ratio,'target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type','image','source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))));
$$;
create function pg_temp.dims(p uuid,ratio text,profile text) returns text language plpgsql security definer set search_path='' as $$
declare job uuid; r text;
begin
 update public.studio_projects set target_aspect_ratio=ratio where id=p;
 perform public.studio_save_timeline(p,null,null,(select revision from public.studio_projects where id=p),pg_temp.draft(pg_temp.id('aa'),ratio));
 job:=public.studio_request_render(p,gen_random_uuid(),profile);
 select width||'x'||height into r from public.studio_render_jobs where id=job;
 perform public.studio_cancel_render(job);
 return r;
end $$;
insert into auth.users(id,email) values
('56000000-0000-0000-0000-000000000001','export-owner@example.test'),
('56000000-0000-0000-0000-000000000002','export-other@example.test'),
('56000000-0000-0000-0000-000000000003','export-admin@example.test'),
('56000000-0000-0000-0000-000000000004','export-viewer@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Export A','personal')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Chantier Export','construction')::text,true);
select set_config('test.d.aa',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'a.jpg','image/jpeg',123)::text,true);
select public.studio_set_member(pg_temp.id('wa'),'56000000-0000-0000-0000-000000000003','admin');
select public.studio_set_member(pg_temp.id('wa'),'56000000-0000-0000-0000-000000000004','viewer');
reset role;
update public.studio_media_assets set upload_status='ready' where workspace_id=pg_temp.id('wa');
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb from public.studio_media_assets where workspace_id=pg_temp.id('wa');
update public.studio_render_limits set max_active_per_project=20,max_active_per_workspace=50,max_per_user_hour=500,max_per_workspace_day=500;
set local role authenticated;

-- Every ratio at every profile: exact, even dimensions.
select is(pg_temp.dims(pg_temp.id('pa'),'9:16','standard'),'1080x1920','standard 9:16');
select is(pg_temp.dims(pg_temp.id('pa'),'9:16','hd720'),'720x1280','720p 9:16');
select is(pg_temp.dims(pg_temp.id('pa'),'9:16','preview'),'540x960','preview 9:16');
select is(pg_temp.dims(pg_temp.id('pa'),'16:9','standard'),'1920x1080','standard 16:9');
select is(pg_temp.dims(pg_temp.id('pa'),'16:9','hd720'),'1280x720','720p 16:9');
select is(pg_temp.dims(pg_temp.id('pa'),'1:1','standard'),'1080x1080','standard 1:1');
select is(pg_temp.dims(pg_temp.id('pa'),'1:1','hd720'),'720x720','720p 1:1');
select is(pg_temp.dims(pg_temp.id('pa'),'4:5','standard'),'1080x1350','standard 4:5');
select is(pg_temp.dims(pg_temp.id('pa'),'4:5','hd720'),'720x900','720p 4:5');
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''hd1440'')','22023',null,'unknown profile refused');
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''4k'')','22023',null,'4k is not offered');
select throws_ok('insert into public.studio_render_jobs(workspace_id,project_id,timeline_id,requested_by,request_id,profile,width,height,snapshot) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),''hd720'',1,1,''{}'')','42501',null,'no direct DML on jobs');

-- Usage ledger: one idempotent record per published output.
reset role;
update public.studio_render_jobs set status='cancelled' where workspace_id=pg_temp.id('wa');
update public.studio_projects set target_aspect_ratio='9:16' where id=pg_temp.id('pa');
set local role authenticated;
select set_config('test.d.pa720',public.studio_save_timeline(pg_temp.id('pa'),null,null,(select revision from public.studio_projects where id=pg_temp.id('pa')),pg_temp.draft(pg_temp.id('aa'),'9:16'))::text,true);
select set_config('test.d.job',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'hd720')::text,true);
select set_config('test.d.pjob',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview')::text,true);
reset role;set local role service_role;
select set_config('test.d.lease',gen_random_uuid()::text,true);
select public.studio_claim_render(pg_temp.id('job'),pg_temp.id('lease'));
reset role;
insert into storage.objects(bucket_id,name,metadata) values('studio-renders','studio/'||pg_temp.id('wa')||'/'||pg_temp.id('pa')||'/renders/'||pg_temp.id('job')||'/'||pg_temp.id('lease')||'/output.mp4','{"size":123}');
set local role service_role;
select ok(public.studio_complete_render(pg_temp.id('job'),pg_temp.id('lease'),123,3000) is not null,'720p export published');
select ok(public.studio_complete_render(pg_temp.id('job'),pg_temp.id('lease'),123,3000) is null,'duplicate publication refused');
reset role;
select is((select count(*) from public.studio_usage_events where job_id=pg_temp.id('job')),2::bigint,'exactly one export and one render_seconds row');
select is((select quantity from public.studio_usage_events where job_id=pg_temp.id('job') and kind='render_seconds'),3.0,'render seconds match the duration');
select is((select quantity from public.studio_usage_events where job_id=pg_temp.id('job') and kind='export'),1::numeric,'one export counted');
set local role service_role;
select set_config('test.d.lease2',gen_random_uuid()::text,true);
select public.studio_claim_render(pg_temp.id('pjob'),pg_temp.id('lease2'));
reset role;
insert into storage.objects(bucket_id,name,metadata) values('studio-renders','studio/'||pg_temp.id('wa')||'/'||pg_temp.id('pa')||'/renders/'||pg_temp.id('pjob')||'/'||pg_temp.id('lease2')||'/output.mp4','{"size":123}');
set local role service_role;
select ok(public.studio_complete_render(pg_temp.id('pjob'),pg_temp.id('lease2'),123,3000) is not null,'preview published');
reset role;
select is((select count(*) from public.studio_usage_events where job_id=pg_temp.id('pjob') and kind='export'),0::bigint,'a preview is not an export');
select is((select count(*) from public.studio_usage_events where job_id=pg_temp.id('pjob') and kind='render_seconds'),1::bigint,'a preview still costs render seconds');
select throws_ok('insert into public.studio_usage_events(workspace_id,job_id,kind,quantity) values(pg_temp.id(''wa''),pg_temp.id(''job''),''export'',1)','23505',null,'ledger is unique per job and kind');

-- Access: owner and admin read usage, viewer and other tenants do not.
set local role authenticated;
select is((select count(*) from public.studio_usage_events),3::bigint,'owner reads the ledger');
select is((public.studio_workspace_usage(pg_temp.id('wa'))->>'exports')::numeric,1::numeric,'owner usage: exports');
select is((public.studio_workspace_usage(pg_temp.id('wa'))->>'render_seconds')::numeric,6::numeric,'owner usage: render seconds');
select is((public.studio_workspace_usage(pg_temp.id('wa'))->>'render_bytes')::numeric,246::numeric,'owner usage: stored render bytes');
select throws_ok('insert into public.studio_usage_events(workspace_id,job_id,kind,quantity) values(pg_temp.id(''wa''),gen_random_uuid(),''export'',1)','42501',null,'client cannot write the ledger');
select throws_ok('delete from public.studio_usage_events','42501',null,'client cannot delete the ledger');
select set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.studio_usage_events),3::bigint,'admin reads the ledger');
select lives_ok('select public.studio_workspace_usage(pg_temp.id(''wa''))','admin reads usage');
select set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.studio_usage_events),0::bigint,'viewer sees no usage rows');
select throws_ok('select public.studio_workspace_usage(pg_temp.id(''wa''))','42501',null,'viewer cannot read usage');
select set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.studio_usage_events),0::bigint,'other tenant sees no usage rows');
select throws_ok('select public.studio_workspace_usage(pg_temp.id(''wa''))','42501',null,'other tenant cannot read usage');
select * from finish();
rollback;
