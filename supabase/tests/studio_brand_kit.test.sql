begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
insert into auth.users(id,email) values
('57000000-0000-0000-0000-000000000001','brand-owner@example.test'),
('57000000-0000-0000-0000-000000000002','brand-admin@example.test'),
('57000000-0000-0000-0000-000000000003','brand-editor@example.test'),
('57000000-0000-0000-0000-000000000004','brand-viewer@example.test'),
('57000000-0000-0000-0000-000000000005','brand-other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Marque A','professional')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Chantier Marque','construction')::text,true);
select set_config('test.d.pb',public.studio_create_project(pg_temp.id('wa'),'Autre chantier','construction')::text,true);
select set_config('test.d.logo',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'logo.png','image/png',123)::text,true);
select set_config('test.d.jpg',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'logo.jpg','image/jpeg',123)::text,true);
select set_config('test.d.webp',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'logo.webp','image/webp',123)::text,true);
select set_config('test.d.video',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'v.mp4','video/mp4',123)::text,true);
select set_config('test.d.pending',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'wait.png','image/png',123)::text,true);
select public.studio_set_member(pg_temp.id('wa'),'57000000-0000-0000-0000-000000000002','admin');
select public.studio_set_member(pg_temp.id('wa'),'57000000-0000-0000-0000-000000000003','editor');
select public.studio_set_member(pg_temp.id('wa'),'57000000-0000-0000-0000-000000000004','viewer');
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000005',true);
select set_config('test.d.wb',public.studio_create_workspace('Marque B','professional')::text,true);
select set_config('test.d.pbx',public.studio_create_project(pg_temp.id('wb'),'Projet B','construction')::text,true);
select set_config('test.d.logob',public.studio_reserve_media(pg_temp.id('pbx'),gen_random_uuid(),'b.png','image/png',123)::text,true);
reset role;
update public.studio_media_assets set upload_status='ready' where id in (pg_temp.id('logo'),pg_temp.id('jpg'),pg_temp.id('webp'),pg_temp.id('video'),pg_temp.id('logob'));
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000001',true);

select is(public.studio_get_brand_kit(pg_temp.id('wa')),null,'no kit before the first save');
select throws_ok('insert into public.studio_brand_kits(workspace_id,updated_by) values(gen_random_uuid(),gen_random_uuid())','42501',null,'no direct insert');

-- Creation by the owner.
select lives_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''company_name'',''  Bâtiment  Dupont '',''tagline'',''Rénovation de qualité'',''phone'',''+33 3 88 00 00 00'',''website'',''https://dupont.example/btp'',''email'',''contact@dupont.example'',''logo_asset_id'',pg_temp.id(''logo'')))','kit created by the owner');
select is((public.studio_get_brand_kit(pg_temp.id('wa'))->>'company_name'),'Bâtiment Dupont','name trimmed and whitespace collapsed');
select is((public.studio_get_brand_kit(pg_temp.id('wa'))->>'revision')::int,1,'first revision');
select is((public.studio_get_brand_kit(pg_temp.id('wa'))->'logo'->>'id')::uuid,pg_temp.id('logo'),'logo exposed while live');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"company_name":"X"}''::jsonb,null)','40001',null,'creating twice without a revision conflicts');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"company_name":"X"}''::jsonb,7)','40001',null,'stale revision refused');
select is((public.studio_save_brand_kit(pg_temp.id('wa'),'{"company_name":"Dupont & Fils","tagline":"","phone":"","website":"","email":""}'::jsonb,1)->>'revision')::int,2,'update bumps the revision');
select is(public.studio_get_brand_kit(pg_temp.id('wa'))->'logo','null'::jsonb,'saving without a logo clears it');
select public.studio_save_brand_kit(pg_temp.id('wa'),jsonb_build_object('company_name','Dupont','logo_asset_id',pg_temp.id('jpg')),2);

-- Validation.
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"company_name":"Plage 😀"}''::jsonb,3)','22023',null,'emoji refused');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''company_name'',repeat(''a'',101)),3)','22023',null,'too long refused');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''company_name'',''a''||chr(1)||''b''),3)','22023',null,'control character refused');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"phone":"appelez-moi"}''::jsonb,3)','22023',null,'phone format enforced');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"email":"pas un email"}''::jsonb,3)','22023',null,'email format enforced');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"website":"javascript:alert(1) x"}''::jsonb,3)','22023',null,'website charset enforced');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"color":"#fff"}''::jsonb,3)','22023',null,'unknown key refused');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''logo_asset_id'',pg_temp.id(''webp'')),3)','22023',null,'webp logo refused (renderer decodes PNG/JPEG)');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''logo_asset_id'',pg_temp.id(''video'')),3)','22023',null,'video logo refused');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''logo_asset_id'',pg_temp.id(''pending'')),3)','22023',null,'not-ready logo refused');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''logo_asset_id'',pg_temp.id(''logob'')),3)','22023',null,'logo of another workspace refused');
select is((public.studio_get_brand_kit(pg_temp.id('wa'))->>'revision')::int,3,'refused saves changed nothing');

-- The logo guard.
select throws_ok('select public.studio_delete_media(pg_temp.id(''jpg''))','23514',null,'a brand logo cannot be deleted while used');
select lives_ok('select public.studio_delete_media(pg_temp.id(''logo''))','an unused image can still be deleted');

-- Candidates: PNG/JPEG, ready, live, this workspace only.
select is((select count(*) from jsonb_array_elements(public.studio_list_brand_logo_candidates(pg_temp.id('wa')))),1::bigint,'one candidate left (the jpeg)');
select is((public.studio_list_brand_logo_candidates(pg_temp.id('wa'))->0->>'project_name'),'Chantier Marque','candidate names its project');

-- Attach to another project: shared reference, idempotent, revision bump.
select is((select revision from public.studio_projects where id=pg_temp.id('pb')),1,'project revision before attach');
select is(public.studio_attach_brand_logo(pg_temp.id('pb')),pg_temp.id('jpg'),'logo attached to another project');
select is(public.studio_attach_brand_logo(pg_temp.id('pb')),pg_temp.id('jpg'),'attach is idempotent');
select is((select count(*) from public.studio_project_assets where project_id=pg_temp.id('pb') and asset_id=pg_temp.id('jpg')),1::bigint,'one shared reference only');
select is((select revision from public.studio_projects where id=pg_temp.id('pb')),2,'project revision bumped once');

-- Roles.
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000002',true);
select lives_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),jsonb_build_object(''company_name'',''Dupont Admin'',''logo_asset_id'',pg_temp.id(''jpg'')),3)','admin saves');
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000003',true);
select is((public.studio_get_brand_kit(pg_temp.id('wa'))->>'company_name'),'Dupont Admin','editor reads');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"company_name":"Editor"}''::jsonb,4)','42501',null,'editor cannot save');
select lives_ok('select public.studio_attach_brand_logo(pg_temp.id(''pb''))','editor attaches the logo to a project');
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000004',true);
select is((public.studio_get_brand_kit(pg_temp.id('wa'))->>'company_name'),'Dupont Admin','viewer reads');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"company_name":"Viewer"}''::jsonb,4)','42501',null,'viewer cannot save');
select throws_ok('select public.studio_attach_brand_logo(pg_temp.id(''pb''))','42501',null,'viewer cannot attach');

-- Tenant isolation.
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000005',true);
select throws_ok('select public.studio_get_brand_kit(pg_temp.id(''wa''))','42501',null,'other tenant cannot read the kit');
select throws_ok('select public.studio_save_brand_kit(pg_temp.id(''wa''),''{"company_name":"Intrus"}''::jsonb,4)','42501',null,'other tenant cannot save');
select throws_ok('select public.studio_list_brand_logo_candidates(pg_temp.id(''wa''))','42501',null,'other tenant cannot list candidates');
select throws_ok('select public.studio_attach_brand_logo(pg_temp.id(''pb''))','42501',null,'other tenant cannot attach');
select is((select count(*) from public.studio_brand_kits),0::bigint,'other tenant sees no kit rows');
select throws_ok('select public.studio_attach_brand_logo(pg_temp.id(''pbx''))','22023',null,'a project without a workspace kit has no logo to attach');
select * from finish();
rollback;
