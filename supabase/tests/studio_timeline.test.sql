begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.draft(asset uuid,patch jsonb default '{}') returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio','9:16','target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type','image','source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))||patch));
$$;
create function pg_temp.save(p uuid,t uuid,d jsonb,r integer default null) returns uuid language sql as $$
select public.studio_save_timeline(p,t,r,(select revision from public.studio_projects where id=p),d)$$;
insert into auth.users(id,email) values
('54000000-0000-0000-0000-000000000001','montage-a@example.test'),
('54000000-0000-0000-0000-000000000002','montage-b@example.test'),
('54000000-0000-0000-0000-000000000003','montage-admin@example.test'),
('54000000-0000-0000-0000-000000000004','montage-editor@example.test'),
('54000000-0000-0000-0000-000000000005','montage-viewer@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Montage A','personal')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Chantier Strasbourg','construction')::text,true);
select set_config('test.d.aa',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'a.jpg','image/jpeg',123)::text,true);
select set_config('test.d.va',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'v.mp4','video/mp4',123)::text,true);
select public.studio_set_member(pg_temp.id('wa'),'54000000-0000-0000-0000-000000000003','admin');
select public.studio_set_member(pg_temp.id('wa'),'54000000-0000-0000-0000-000000000004','editor');
select public.studio_set_member(pg_temp.id('wa'),'54000000-0000-0000-0000-000000000005','viewer');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa'')))','42501',null,'pending refused');
reset role;
update public.studio_media_assets set upload_status='ready',duration_ms=case when media_type='video' then 10000 end where workspace_id=pg_temp.id('wa');
set local role authenticated;
select set_config('test.d.ta',pg_temp.save(pg_temp.id('pa'),null,pg_temp.draft(pg_temp.id('aa')))::text,true);
select is((select count(*) from public.studio_timelines),1::bigint,'A reads timeline A');
select is((select count(*) from public.studio_timeline_clips),1::bigint,'A reads clips A');
select is((select active_timeline_id from public.studio_projects where id=pg_temp.id('pa')),pg_temp.id('ta'),'generated active');
select is((select total_duration_ms from public.studio_timelines where id=pg_temp.id('ta')),3000,'duration persisted');
select throws_ok('update public.studio_timeline_clips set duration_ms=1','42501',null,'direct writes forbidden');
select throws_ok('delete from public.studio_timelines','42501',null,'direct deletes forbidden');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000002',true);
select set_config('test.d.wb',public.studio_create_workspace('Montage B','personal')::text,true);
select set_config('test.d.pb',public.studio_create_project(pg_temp.id('wb'),'Croatie','travel')::text,true);
select set_config('test.d.ab',public.studio_reserve_media(pg_temp.id('pb'),gen_random_uuid(),'b.jpg','image/jpeg',123)::text,true);
reset role;update public.studio_media_assets set upload_status='ready' where id=pg_temp.id('ab');set local role authenticated;
select set_config('test.d.tb',pg_temp.save(pg_temp.id('pb'),null,pg_temp.draft(pg_temp.id('ab')))::text,true);
select is((select count(*) from public.studio_timelines where id=pg_temp.id('ta')),0::bigint,'B cannot read A');
select is((select count(*) from public.studio_timeline_clips where timeline_id=pg_temp.id('ta')),0::bigint,'B cannot read A clips');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),1)','42501',null,'B cannot mutate A');
select throws_ok('select public.studio_activate_timeline(pg_temp.id(''pb''),pg_temp.id(''ta''))','42501',null,'B cannot activate A');
select throws_ok('select pg_temp.save(pg_temp.id(''pb''),null,pg_temp.draft(pg_temp.id(''aa'')))','42501',null,'A asset in B refused');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.studio_timelines where id=pg_temp.id('tb')),0::bigint,'A cannot read B');
select is((select count(*) from public.studio_timeline_clips where timeline_id=pg_temp.id('tb')),0::bigint,'A cannot read B clips');
select throws_ok('select pg_temp.save(pg_temp.id(''pb''),pg_temp.id(''tb''),pg_temp.draft(pg_temp.id(''ab'')),1)','42501',null,'A cannot mutate B');
select throws_ok('select public.studio_delete_timeline(pg_temp.id(''pb''),pg_temp.id(''tb''))','42501',null,'A cannot delete B');
select throws_ok('select public.studio_activate_timeline(pg_temp.id(''pa''),pg_temp.id(''tb''))','42501',null,'A cannot activate B');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''ab'')))','42501',null,'B asset in A refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),99)','40001',null,'stale revision refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa''),''{"duration_ms":0}''))','23514',null,'zero duration refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa''),''{"transition_duration_ms":1501}''))','23514',null,'transition over half refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa''),''{"transition_duration_ms":-1}''))','23514',null,'negative transition refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa''),''{"metadata_json":{"motion":{}}}''))','23514',null,'forged animation refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa''),''{"timeline_start_ms":1000,"timeline_end_ms":4000}''))','22023',null,'gap refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''va''),''{"clip_type":"video","source_end_ms":10001}''))','42501',null,'video beyond source refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''va''),''{"clip_type":"video","source_start_ms":100,"source_end_ms":50}''))','23514',null,'inverted video bounds refused');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa'')))','new version');
select is((select max(version) from public.studio_timelines where project_id=pg_temp.id('pa')),2,'version increased');
select lives_ok('select public.studio_activate_timeline(pg_temp.id(''pa''),pg_temp.id(''ta''))','activate prior version');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.studio_timelines where project_id=pg_temp.id('pa')),2::bigint,'viewer reads versions');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa'')))','42501',null,'viewer generation refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),1)','42501',null,'viewer editing/order refused');
select throws_ok('select public.studio_activate_timeline(pg_temp.id(''pa''),pg_temp.id(''ta''))','42501',null,'viewer activation refused');
select throws_ok('select public.studio_delete_timeline(pg_temp.id(''pa''),pg_temp.id(''ta''))','42501',null,'viewer delete refused');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000004',true);
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),1)','editor edits');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa'')))','editor generates');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa''),''{"duration_ms":0}''),2)','23514',null,'invalid edit rolls back batch');
select is((select revision from public.studio_timelines where id=pg_temp.id('ta')),2,'failed edit keeps revision');
select is((select count(*) from public.studio_timeline_clips where timeline_id=pg_temp.id('ta')),1::bigint,'failed edit keeps previous clips');

select throws_ok('select public.studio_delete_timeline(pg_temp.id(''pa''),pg_temp.id(''ta''))','42501',null,'editor timeline deletion refused');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000003',true);
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa'')))','admin generates');
select lives_ok('select public.studio_delete_timeline(pg_temp.id(''pa''),pg_temp.id(''ta''))','admin deletes');
select is((select count(*) from public.studio_project_assets where asset_id=pg_temp.id('aa')),1::bigint,'clip deletion keeps project media');
select is((select count(*) from public.studio_media_assets where id=pg_temp.id('aa')),1::bigint,'clip deletion keeps physical asset');
-- Batch persistence: 500 clips without 500 round trips or 500 stored files.
select set_config('test.d.benchmark_start',clock_timestamp()::text,true);
select set_config('test.d.large',pg_temp.save(pg_temp.id('pa'),null,
 pg_temp.draft(pg_temp.id('aa')) || jsonb_build_object('total_duration_ms',1500000,'clips',
 (select jsonb_agg((pg_temp.draft(pg_temp.id('aa'))->'clips'->0)||jsonb_build_object('sort_order',n,'timeline_start_ms',n*3000,'timeline_end_ms',(n+1)*3000)) from generate_series(0,499) n)))::text,true);
select diag('500 clips batch SQL ms: '||(extract(epoch from clock_timestamp()-current_setting('test.d.benchmark_start')::timestamptz)*1000)::text);
select is((select count(*) from public.studio_timeline_clips where timeline_id=pg_temp.id('large')),500::bigint,'500 clips persisted atomically');
select is((public.studio_get_timeline(pg_temp.id('pa'),pg_temp.id('large'))->>'total_duration_ms')::int,1500000,'atomic document duration');
select is(jsonb_array_length(public.studio_get_timeline(pg_temp.id('pa'),pg_temp.id('large'))->'clips'),500,'atomic document all clips');
-- An asset in the same workspace but not linked to this project is also forbidden.
select set_config('test.d.other',public.studio_create_project(pg_temp.id('wa'),'Other','free')::text,true);
select throws_ok('select pg_temp.save(pg_temp.id(''other''),null,pg_temp.draft(pg_temp.id(''aa'')))','42501',null,'same-workspace unlinked asset refused');
select set_config('test.d.counter',(select timeline_version_counter::text from public.studio_projects where id=pg_temp.id('pa')),true);
select public.studio_delete_timeline(pg_temp.id('pa'),pg_temp.id('large'));
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.draft(pg_temp.id(''aa'')))','generation after deletion');
select is((select max(version) from public.studio_timelines where project_id=pg_temp.id('pa')),current_setting('test.d.counter')::int+1,'deleted version number never reused');
reset role;
select ok((select relrowsecurity from pg_class where oid='public.studio_timelines'::regclass),'timelines RLS');
select ok((select relrowsecurity from pg_class where oid='public.studio_timeline_clips'::regclass),'clips RLS');
select * from finish();
rollback;
