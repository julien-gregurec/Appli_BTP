begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.presentation(music jsonb) returns jsonb language sql as $$
select jsonb_build_object('version',1,'template',jsonb_build_object('id','manual','version',1,'snapshot','{}'::jsonb),
 'typography',jsonb_build_object('display',t,'title',t,'subtitle',t,'body',t,'caption',t),'overlays','[]'::jsonb,'logo',null)
 || case when music is null then '{}'::jsonb else jsonb_build_object('music',music) end
 from (select jsonb_build_object('family','sans','weight',700,'size',0.05,'spacing',0) t) x;
$$;
create function pg_temp.draft(asset uuid,pres jsonb,clip_type text default 'image') returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio','9:16','target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'presentation',pres,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type',clip_type,'source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))));
$$;
create function pg_temp.mus(asset uuid,vol numeric default 0.5) returns jsonb language sql as $$
select jsonb_build_object('asset_id',asset,'volume',vol,'fade_in_ms',500,'fade_out_ms',1000)$$;
create function pg_temp.save(p uuid,pres jsonb,rev integer default null,t uuid default null,ct text default 'image',a uuid default null) returns uuid language sql as $$
select public.studio_save_timeline(p,t,rev,(select revision from public.studio_projects where id=p),pg_temp.draft(coalesce(a,pg_temp.id('img')),pres,ct))$$;
insert into auth.users(id,email) values
('59000000-0000-0000-0000-000000000001','music-owner@example.test'),
('59000000-0000-0000-0000-000000000002','music-viewer@example.test'),
('59000000-0000-0000-0000-000000000003','music-other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','59000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Musique A','personal')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Chantier Musique','construction')::text,true);
select set_config('test.d.pb',public.studio_create_project(pg_temp.id('wa'),'Autre projet','construction')::text,true);
select set_config('test.d.img',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'a.jpg','image/jpeg',123)::text,true);
select set_config('test.d.mp3',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'song.mp3','audio/mpeg',5000)::text,true);
select set_config('test.d.m4a',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'song.m4a','audio/mp4',5000)::text,true);
select set_config('test.d.wav',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'song.wav','audio/wav',5000)::text,true);
select set_config('test.d.pend',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'wait.mp3','audio/mpeg',5000)::text,true);
select set_config('test.d.other',public.studio_reserve_media(pg_temp.id('pb'),gen_random_uuid(),'other.mp3','audio/mpeg',5000)::text,true);
select public.studio_set_member(pg_temp.id('wa'),'59000000-0000-0000-0000-000000000002','viewer');

-- Accepted and refused formats.
select is((select media_type from public.studio_media_assets where id=pg_temp.id('mp3')),'audio','mp3 is an audio asset');
select is((select storage_key like '%/original.m4a' from public.studio_media_assets where id=pg_temp.id('m4a')),true,'m4a keeps its extension in the key');
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''song.ogg'',''audio/ogg'',5000)','22023',null,'ogg refused');
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''song.wav'',''audio/mpeg'',5000)','22023',null,'mime and extension must agree');
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''big.mp3'',''audio/mpeg'',60000000)','22023',null,'audio over the 50 MiB limit refused');
select throws_ok('select public.studio_reserve_media(pg_temp.id(''pa''),gen_random_uuid(),''x.mp3'',''video/mp4'',5000)','22023',null,'audio extension with a video mime refused');
reset role;
update public.studio_media_assets set upload_status='ready' where id in (pg_temp.id('img'),pg_temp.id('mp3'),pg_temp.id('m4a'),pg_temp.id('wav'),pg_temp.id('other'));
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,jsonb_build_object('size',file_size_bytes) from public.studio_media_assets where workspace_id=pg_temp.id('wa') and upload_status='ready';
set local role authenticated;

-- Saving a music track.
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''mp3''))))','a ready project mp3 is accepted');
select is((select presentation->'music'->>'asset_id' from public.studio_timelines where project_id=pg_temp.id('pa') order by version desc limit 1),pg_temp.id('mp3')::text,'the track is stored in the presentation');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''m4a''),1)))','m4a accepted');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''wav''),0)))','wav accepted with volume 0');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(null))','a montage without music stays valid');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(''null''::jsonb))','explicit null music is valid');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''mp3''),2)))','22023',null,'volume above 1 refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''mp3''),-0.1)))','22023',null,'negative volume refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''mp3''))||''{"x":1}''::jsonb))','22023',null,'unknown key refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''mp3''))||''{"fade_out_ms":20000}''::jsonb))','22023',null,'fade above 10 s refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(''{"asset_id":"not-a-uuid","volume":1,"fade_in_ms":0,"fade_out_ms":0}''::jsonb))','22023',null,'malformed asset id refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''img''))))','42501',null,'a photo is not music');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''pend''))))','42501',null,'a pending upload is not music');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''other''))))','42501',null,'a track of another project is refused');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(null),null,null,''image'',pg_temp.id(''mp3''))','42501',null,'audio can never be a clip');
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(null),null,null,''video'',pg_temp.id(''mp3''))','42501',null,'audio cannot pose as a video clip either');

-- Rendering: the snapshot carries the track; a missing file is refused at admission.
reset role;
update public.studio_render_limits set max_active_per_project=20,max_active_per_workspace=50,max_per_user_hour=500,max_per_workspace_day=500;
set local role authenticated;
select set_config('test.d.tl',pg_temp.save(pg_temp.id('pa'),pg_temp.presentation(pg_temp.mus(pg_temp.id('mp3'),0.7)))::text,true);
select set_config('test.d.job',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview')::text,true);
select is((select count(*) from jsonb_array_elements((select snapshot->'assets' from public.studio_render_jobs where id=pg_temp.id('job'))) a where a->>'media_type'='audio'),1::bigint,'the snapshot lists the audio asset');
select is((select (snapshot->'timeline'->'presentation'->'music'->>'volume')::numeric from public.studio_render_jobs where id=pg_temp.id('job')),0.7,'the snapshot freezes the music settings');
select is((select count(*) from jsonb_array_elements((select snapshot->'assets' from public.studio_render_jobs where id=pg_temp.id('job'))) a where a->>'media_type'='image'),1::bigint,'the clip asset is still listed');
select set_config('test.d.job2',(select public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview'))::text,true);
select is((select count(*) from public.studio_render_jobs where snapshot->'timeline'->'presentation'->'music' is not null),2::bigint,'later renders freeze their own snapshot');
reset role;
-- Storage rows cannot be deleted from SQL: point the asset at a key with no object instead.
update public.studio_media_assets set storage_key=storage_key||'.gone' where id=pg_temp.id('mp3');
set local role authenticated;
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','ASSET_MISSING','a track whose file vanished is refused at admission');
reset role;
update public.studio_media_assets set storage_key=replace(storage_key,'.gone','') where id=pg_temp.id('mp3');
set local role authenticated;
select lives_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','restoring the file restores rendering');
-- Removing the track from the project makes the montage unrenderable until the music is replaced or removed.
select public.studio_remove_project_media(pg_temp.id('pa'),pg_temp.id('mp3'));
select throws_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','22023','ASSET_MISSING','a track removed from the project is refused');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''m4a''))))','replacing it by another project track works');
select lives_ok('select public.studio_request_render(pg_temp.id(''pa''),gen_random_uuid(),''preview'')','the replacement renders');
select lives_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(null))','removing the music works');
select set_config('test.d.jn',public.studio_request_render(pg_temp.id('pa'),gen_random_uuid(),'preview')::text,true);
select ok(pg_temp.id('jn') is not null,'a montage without music renders');
select is((select count(*) from jsonb_array_elements((select snapshot->'assets' from public.studio_render_jobs where id=pg_temp.id('jn'))) a where a->>'media_type'='audio'),0::bigint,'no audio asset without music');

-- Roles and tenants.
select set_config('request.jwt.claim.sub','59000000-0000-0000-0000-000000000002',true);
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''m4a''))))','42501',null,'a viewer cannot set music');
select set_config('request.jwt.claim.sub','59000000-0000-0000-0000-000000000003',true);
select throws_ok('select pg_temp.save(pg_temp.id(''pa''),pg_temp.presentation(pg_temp.mus(pg_temp.id(''m4a''))))','42501',null,'another tenant cannot set music');
select is((select count(*) from public.studio_media_assets where media_type='audio'),0::bigint,'another tenant sees no audio asset');
select * from finish();
rollback;
