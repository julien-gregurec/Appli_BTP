begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.draft(asset uuid) returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio','9:16','target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type','image','source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))));
$$;
insert into auth.users(id,email) values
('55000000-0000-0000-0000-000000000001','admission-a@example.test'),
('55000000-0000-0000-0000-000000000002','admission-b@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Admission A','personal')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Chantier Admission','construction')::text,true);
select set_config('test.d.aa',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'a.jpg','image/jpeg',123)::text,true);
reset role;
update public.studio_media_assets set upload_status='ready' where workspace_id=pg_temp.id('wa');
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb from public.studio_media_assets where workspace_id=pg_temp.id('wa');
set local role authenticated;
select public.studio_save_timeline(pg_temp.id('pa'),null,null,(select revision from public.studio_projects where id=pg_temp.id('pa')),pg_temp.draft(pg_temp.id('aa')));

-- Defaults are generous enough for real use and strict enough to bound a hostile loop.
select is((select max_active_per_workspace from public.studio_render_limits),6,'default workspace cap');
select is((select max_active_per_project from public.studio_render_limits),4,'default project cap');
select throws_ok('update public.studio_render_limits set admission_open=false','42501',null,'authenticated cannot change limits');
select throws_ok('insert into public.studio_render_limits(singleton) values(false)','42501',null,'authenticated cannot insert limits');

-- Per-project active cap.
reset role;
update public.studio_render_limits set max_active_per_project=2;
set local role authenticated;
select set_config('test.d.r1',gen_random_uuid()::text,true);
select set_config('test.d.j1',public.studio_request_render(pg_temp.id('pa'),pg_temp.id('r1'),'preview')::text,true);
select lives_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','second active job accepted');
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','RENDER_LIMIT_ACTIVE','third active job refused per project');
select is(public.studio_request_render(pg_temp.id('pa'),pg_temp.id('r1'),'preview'),pg_temp.id('j1'),'idempotent replay still answered at the cap');
select is((select count(*) from public.studio_render_jobs),2::bigint,'refused request stores nothing');

-- Cancelled jobs release capacity.
select public.studio_cancel_render(pg_temp.id('j1'));
select lives_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','cancellation frees a slot');

-- Per-workspace active cap.
reset role;
update public.studio_render_limits set max_active_per_project=10,max_active_per_workspace=2;
set local role authenticated;
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','RENDER_LIMIT_ACTIVE','workspace cap refused');

-- Rate caps count every job, whatever its state.
reset role;
update public.studio_render_limits set max_active_per_workspace=100,max_per_user_hour=3;
set local role authenticated;
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','RENDER_LIMIT_RATE','hourly per-user cap refused');
reset role;
update public.studio_render_limits set max_per_user_hour=100,max_per_workspace_day=3;
set local role authenticated;
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','RENDER_LIMIT_RATE','daily per-workspace cap refused');
reset role;
update public.studio_render_jobs set created_at=now()-interval '2 days';
set local role authenticated;
select lives_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','old jobs leave the rate window');

-- Operator kill-switch closes admission but still answers replays.
reset role;
update public.studio_render_limits set max_per_workspace_day=200,admission_open=false;
set local role authenticated;
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','RENDER_ADMISSION_CLOSED','closed admission refuses new jobs');
select is(public.studio_request_render(pg_temp.id('pa'),pg_temp.id('r1'),'preview'),pg_temp.id('j1'),'closed admission still answers a known request');
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''standard'')','22023','RENDER_ADMISSION_CLOSED','closed admission covers the standard profile');
reset role;
update public.studio_render_limits set admission_open=true;

-- Another tenant still cannot render for A, and limits do not weaken that.
set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000002',true);
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','42501',null,'B cannot render A even with free capacity');

-- Quota: an abandoned reservation past its upload window no longer blocks new uploads.
reset role;
update public.studio_media_limits set project_assets=2;
set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select set_config('test.d.pend',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'b.jpg','image/jpeg',123)::text,true);
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''c.jpg'',''image/jpeg'',123)','22023','Quota de stockage atteint','live reservation counts');
reset role;
update public.studio_media_assets set upload_expires_at=now()-interval '1 minute' where id=pg_temp.id('pend');
set local role authenticated;
select lives_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''c.jpg'',''image/jpeg'',123)','expired abandoned reservation is not counted');
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''d.jpg'',''image/jpeg'',123)','22023','Quota de stockage atteint','ready plus live reservation still hit the cap');
reset role;
update public.studio_media_limits set project_assets=100,workspace_bytes=300;
set local role authenticated;
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''e.jpg'',''image/jpeg'',200)','22023','Quota de stockage atteint','workspace byte cap still enforced on live rows');
select * from finish();
rollback;
