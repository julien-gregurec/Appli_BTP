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
reset role;
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb from public.studio_media_assets where workspace_id=pg_temp.id('wa');
set local role authenticated;
reset role;
create function pg_temp.presentation() returns jsonb language sql as $$
select jsonb_build_object('version',1,'template',jsonb_build_object('id','chantier-pro','version',1,'snapshot','{}'::jsonb),
 'typography',(select jsonb_object_agg(r,jsonb_build_object('family','sans','size',.06,'weight',700,'spacing',0)) from unnest(array['display','title','subtitle','body','caption']) r),
 'overlays',jsonb_build_array(jsonb_build_object('id','intro-title','clip_key','intro','text','Été à Šibenik','start_ms',0,'end_ms',3000,'position','center','alignment','left','font_role','title','size_role','title','weight',700,'animation','fade','background','dark','color','#ffffff','max_lines',3)),
 'logo',jsonb_build_object('asset_id',pg_temp.id('aa'),'clip_key','intro','position','top','width',.2))
$$;
create function pg_temp.fdraft(patch jsonb default '{}') returns jsonb language sql security definer set search_path='' as $$
select pg_temp.draft(pg_temp.id('aa'),jsonb_build_object('clip_type','card','asset_id',null,'animation_type','static','metadata_json',public.studio_photo_motion('static')||jsonb_build_object('key','intro','card',jsonb_build_object('kind','intro','color','#112233','media_mode','solid'))))||jsonb_build_object('presentation',pg_temp.presentation()||patch)
$$;
set local role authenticated;
select set_config('test.d.tf',pg_temp.save(pg_temp.id('pa'),null,pg_temp.fdraft())::text,true);
select is((select presentation->'template'->>'id' from studio_timelines where id=pg_temp.id('tf')),'chantier-pro','template snapshot persisted');
select is((select count(*) from studio_timeline_clips where timeline_id=pg_temp.id('tf') and asset_id is null),1::bigint,'explicit solid card');
select throws_ok('update studio_timelines set presentation=''{}''','42501',null,'direct customization denied');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft(''{"typography":{}}''))','22023',null,'font allowlist enforced');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft(''{"logo":{"asset_id":"10000000-0000-0000-0000-000000000000","clip_key":"intro","position":"top","width":0.2}}''))','42501',null,'foreign logo rejected');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft(''{"logo":{"asset_id":"10000000-0000-0000-0000-000000000000","clip_key":"intro","position":"top","width":99}}''))','22023',null,'unbounded logo rejected');
select set_config('test.d.job',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview')::text,true);
select is((select jsonb_array_length(snapshot->'assets') from studio_render_jobs where id=pg_temp.id('job')),1,'logo included in immutable private render source snapshot');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''tf''),pg_temp.fdraft(),1)','manual edits permitted');
select is((select (snapshot->'timeline'->>'revision')::integer from studio_render_jobs where id=pg_temp.id('job')),1,'queued snapshot unchanged');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000002',true);
select is((select count(*) from studio_timelines),0::bigint,'B cannot read A presentation');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft())','42501',null,'B cannot apply template A');
select throws_ok('select studio_request_render(pg_temp.id(''pa''),gen_random_uuid())','42501',null,'B cannot render template A');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000005',true);
select is((select count(*) from studio_timelines),2::bigint,'viewer reads old and template timelines');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft())','42501',null,'viewer cannot apply');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.id(''tf''),pg_temp.fdraft(),2)','42501',null,'viewer cannot edit text');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000004',true);
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft())','editor applies template');
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000003',true);
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),null,pg_temp.fdraft())','admin applies template');
select * from finish();rollback;
