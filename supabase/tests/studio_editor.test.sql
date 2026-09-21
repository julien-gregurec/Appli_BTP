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
create function pg_temp.static_motion() returns jsonb language sql security definer set search_path='' as $$select public.studio_photo_motion('static')$$;
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
reset role;
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb from public.studio_media_assets where workspace_id=pg_temp.id('wa');
set local role authenticated;

select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa''),''{"crop_mode":"contain","transition_in":"cut","transition_duration_ms":0}''),1)','editor photo crop and transition saved');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),1)','40001',null,'stale tab cannot overwrite revision');
select is((select revision from studio_timelines where id=pg_temp.id('ta')),2,'conflict preserves current revision');
select is((select crop_mode from studio_timeline_clips where timeline_id=pg_temp.id('ta')),'contain','conflict preserves user choice');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000002',true);
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),2)','42501',null,'B cannot submit editor snapshot A');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000005',true);
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),2)','42501',null,'viewer cannot submit editor snapshot');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000004',true);
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),2)','editor role can save');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000003',true);
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''ta''),pg_temp.draft(pg_temp.id(''aa'')),3)','admin role can save');
select is((select count(*) from studio_media_assets where workspace_id=pg_temp.id('wa')),2::bigint,'editing never deletes original assets');

select lives_ok('select public.studio_save_editor(pg_temp.id(''pa''),pg_temp.id(''ta''),4,(select revision from studio_projects where id=pg_temp.id(''pa'')),pg_temp.draft(pg_temp.id(''va''),jsonb_build_object(''clip_type'',''video'',''source_end_ms'',3000,''animation_type'',''static'',''metadata_json'',pg_temp.static_motion(),''volume'',0.25)))','atomic editor save supports trimmed video and volume');
select is((select volume from studio_timeline_clips where timeline_id=pg_temp.id('ta')),0.25::numeric,'video gain persisted');
select is((select revision from studio_timelines where id=pg_temp.id('ta')),5,'atomic returned revision advances once');
select throws_ok('select public.studio_request_editor_render(pg_temp.id(''pa''),gen_random_uuid(),pg_temp.id(''ta''),4)','40001',null,'stale editor cannot render a different revision');
select lives_ok('select public.studio_request_editor_render(pg_temp.id(''pa''),gen_random_uuid(),pg_temp.id(''ta''),5,''preview'')','current edited snapshot can render');
select ok(not has_function_privilege('anon','public.studio_save_editor(uuid,uuid,integer,integer,jsonb)','EXECUTE'),'anon cannot save editor');
select ok(not has_function_privilege('service_role','public.studio_save_editor(uuid,uuid,integer,integer,jsonb)','EXECUTE'),'service role cannot use user editor mutation');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000005',true);
select throws_ok('select public.studio_save_editor(pg_temp.id(''pa''),pg_temp.id(''ta''),5,(select revision from studio_projects where id=pg_temp.id(''pa'')),pg_temp.draft(pg_temp.id(''aa'')))','42501',null,'viewer cannot call atomic editor save directly');
select throws_ok('select public.studio_request_editor_render(pg_temp.id(''pa''),gen_random_uuid(),pg_temp.id(''ta''),5)','42501',null,'viewer cannot call atomic editor render');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000002',true);
select throws_ok('select public.studio_request_editor_render(pg_temp.id(''pa''),gen_random_uuid(),pg_temp.id(''ta''),5)','42501',null,'foreign workspace cannot render editor snapshot');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000001',true);
select set_config('test.d.other',pg_temp.save(pg_temp.id('pa'),null,pg_temp.draft(pg_temp.id('aa')))::text,true);
select throws_ok('select public.studio_save_editor(pg_temp.id(''pa''),pg_temp.id(''ta''),5,(select revision from studio_projects where id=pg_temp.id(''pa'')),pg_temp.draft(pg_temp.id(''aa'')))','40001',null,'new active version protects old tab from silent editing');
select throws_ok('select public.studio_request_editor_render(pg_temp.id(''pa''),gen_random_uuid(),pg_temp.id(''ta''),5)','40001',null,'new active version protects old tab from wrong render');
select * from finish();rollback;
