begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('52000000-0000-0000-0000-000000000001','media-a@example.test'),
 ('52000000-0000-0000-0000-000000000002','media-b@example.test'),
 ('52000000-0000-0000-0000-000000000003','media-admin@example.test'),
 ('52000000-0000-0000-0000-000000000004','media-editor@example.test'),
 ('52000000-0000-0000-0000-000000000005','media-viewer@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select set_config('test.media.wa',public.studio_create_workspace('Media A','personal')::text,true);
select set_config('test.media.pa',public.studio_create_project(current_setting('test.media.wa')::uuid,'Croatie','travel')::text,true);
select set_config('test.media.aa',public.studio_reserve_media(current_setting('test.media.pa')::uuid,'52000000-0000-0000-0000-000000000010','image.jpg','image/jpeg',123)::text,true);
select is(public.studio_reserve_media(current_setting('test.media.pa')::uuid,'52000000-0000-0000-0000-000000000010','image.jpg','image/jpeg',123),current_setting('test.media.aa')::uuid,'reservation idempotente');
select is((select count(*) from public.studio_projects),1::bigint,'A lit projet A');
select is((select count(*) from public.studio_media_assets),1::bigint,'A lit asset A');
select public.studio_set_member(current_setting('test.media.wa')::uuid,'52000000-0000-0000-0000-000000000003','admin');
select public.studio_set_member(current_setting('test.media.wa')::uuid,'52000000-0000-0000-0000-000000000004','editor');
select public.studio_set_member(current_setting('test.media.wa')::uuid,'52000000-0000-0000-0000-000000000005','viewer');
select throws_ok(format('select public.studio_finish_media(%L,%L,''{}''::jsonb)',current_setting('test.media.aa'),'52000000-0000-0000-0000-000000000001'),'42501',null,'client ne confirme jamais directement');
select throws_ok(format('update public.studio_media_assets set upload_status=''ready'' where id=%L',current_setting('test.media.aa')),'42501',null,'statut direct interdit');
select throws_ok('insert into public.studio_projects(workspace_id,name,project_type,created_by) values(gen_random_uuid(),''x'',''free'',auth.uid())','42501',null,'insertion directe projet interdite');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),%L,%L,0)',current_setting('test.media.pa'),'empty.jpg','image/jpeg'),'22023',null,'Refus empty.jpg');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),%L,%L,52428801)',current_setting('test.media.pa'),'big.jpg','image/jpeg'),'22023',null,'Refus big.jpg');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),%L,%L,1073741825)',current_setting('test.media.pa'),'big.mp4','video/mp4'),'22023',null,'Refus big.mp4');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),%L,%L,123)',current_setting('test.media.pa'),'fake.png','image/jpeg'),'22023',null,'Refus fake.png');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),%L,%L,100)',current_setting('test.media.pa'),'evil.svg','image/svg+xml'),'22023',null,'Refus evil.svg');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),%L,%L,100)',current_setting('test.media.pa'),'../x.jpg','image/jpeg'),'22023',null,'Refus ../x.jpg');

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000002',true);
select set_config('test.media.wb',public.studio_create_workspace('Media B','personal')::text,true);
select set_config('test.media.pb',public.studio_create_project(current_setting('test.media.wb')::uuid,'B','free')::text,true);
select set_config('test.media.ab',public.studio_reserve_media(current_setting('test.media.pb')::uuid,gen_random_uuid(),'b.png','image/png',100)::text,true);
select is((select count(*) from public.studio_projects),1::bigint,'B lit seulement projet B');
select is((select count(*) from public.studio_media_assets where id=current_setting('test.media.aa')::uuid),0::bigint,'B ne lit pas asset A');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),''x.jpg'',''image/jpeg'',123)',current_setting('test.media.pa')),'42501',null,'B ne reserve pas A');
select throws_ok(format('select public.studio_delete_media(%L)',current_setting('test.media.aa')),'42501',null,'B ne supprime pas A');
select throws_ok(format('select public.studio_finish_media(%L,%L,''{}''::jsonb)',current_setting('test.media.aa'),'52000000-0000-0000-0000-000000000002'),'42501',null,'B ne confirme pas A');
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.studio_projects where id=current_setting('test.media.pb')::uuid),0::bigint,'A ne lit pas projet B');
select is((select count(*) from public.studio_media_assets where id=current_setting('test.media.ab')::uuid),0::bigint,'A ne lit pas asset B');
select throws_ok(format('select public.studio_delete_media(%L)',current_setting('test.media.ab')),'42501',null,'A ne supprime pas B');
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.studio_projects),1::bigint,'admin lit son projet');
select lives_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),''admin.jpg'',''image/jpeg'',100)',current_setting('test.media.pa')),'admin importe');
select lives_ok(format('select public.studio_create_project(%L,''admin'',''free'')',current_setting('test.media.wa')),'admin crée projet');
reset role; delete from public.studio_projects where name='admin'; set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.studio_projects),1::bigint,'editor lit son projet');
select lives_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),''editor.jpg'',''image/jpeg'',100)',current_setting('test.media.pa')),'editor importe');
select lives_ok(format('select public.studio_create_project(%L,''editor'',''free'')',current_setting('test.media.wa')),'editor crée projet');
reset role; delete from public.studio_projects where name='editor'; set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.studio_projects),1::bigint,'viewer lit son projet');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),''x.jpg'',''image/jpeg'',100)',current_setting('test.media.pa')),'42501',null,'viewer ne reserve pas');
select throws_ok(format('select public.studio_delete_media(%L)',current_setting('test.media.aa')),'42501',null,'viewer ne supprime pas');
select throws_ok(format('select public.studio_create_project(%L,''x'',''free'')',current_setting('test.media.wa')),'42501',null,'viewer ne crée pas projet');

reset role;
select ok((select relrowsecurity from pg_class where oid='public.studio_projects'::regclass),'RLS projets active');
select ok((select relrowsecurity from pg_class where oid='public.studio_media_assets'::regclass),'RLS media active');
select is((select public from storage.buckets where id='studio-originals'),false,'bucket privé');
select ok(exists(select 1 from pg_policies where schemaname='storage' and policyname='studio_storage_server_only' and permissive='RESTRICTIVE'),'barriere restrictive storage');
select throws_ok(format('update public.studio_media_assets set project_id=%L where id=%L',current_setting('test.media.pb'),current_setting('test.media.aa')),'23503',null,'FK interdit mélange de tenants même privilégié');
select throws_ok(format('select public.studio_finish_media(%L,%L,''{}''::jsonb)',current_setting('test.media.aa'),'52000000-0000-0000-0000-000000000001'),'22023',null,'confirmation sans objet impossible');
update public.studio_media_limits set project_assets=3;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),''quota.jpg'',''image/jpeg'',123)',current_setting('test.media.pa')),'22023',null,'quota compte les réservations');
select lives_ok(format('select public.studio_delete_media(%L)',current_setting('test.media.aa')),'owner supprime logiquement');
select is((select count(*) from public.studio_media_assets where id=current_setting('test.media.aa')::uuid),0::bigint,'tombstone invisible');
select throws_ok(format('select public.studio_reserve_media(%L,gen_random_uuid(),''quota.jpg'',''image/jpeg'',123)',current_setting('test.media.pa')),'22023',null,'quota conservé jusqu’à purge physique');
reset role;
select * from finish();
rollback;
