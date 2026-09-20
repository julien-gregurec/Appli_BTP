begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.h(s text) returns text language sql as $$select encode(extensions.digest(s,'sha256'),'hex')$$;
create function pg_temp.draft(asset uuid) returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('generator_version','v1','aspect_ratio','9:16','target_duration_ms',null,'total_duration_ms',3000,'excluded_assets',0,'clips',jsonb_build_array(
jsonb_build_object('asset_id',asset,'sort_order',0,'clip_type','image','source_start_ms',0,'source_end_ms',null,'timeline_start_ms',0,'timeline_end_ms',3000,'duration_ms',3000,
'crop_mode','cover','scale',1,'position_x',0.5,'position_y',0.5,'rotation',0,'playback_rate',1,'volume',0,'animation_type','zoom_in','transition_in','fade','transition_out','cut','transition_duration_ms',500,'metadata_json',public.studio_photo_motion('zoom_in'))));
$$;
create function pg_temp.publish(pid uuid,profile text) returns uuid language plpgsql security definer set search_path='' as $$
declare job uuid; lease uuid:=gen_random_uuid(); out uuid; w uuid;
begin
 job:=public.studio_request_render(pid,gen_random_uuid(),profile);
 select workspace_id into w from public.studio_render_jobs where id=job;
 perform public.studio_claim_render(job,lease);
 insert into storage.objects(bucket_id,name,metadata) values('studio-renders','studio/'||w||'/'||pid||'/renders/'||job||'/'||lease||'/output.mp4','{"size":123}');
 out:=public.studio_complete_render(job,lease,123,3000);
 return out;
end $$;
insert into auth.users(id,email) values
('5b000000-0000-0000-0000-000000000001','del-a@example.test'),
('5b000000-0000-0000-0000-000000000002','del-b@example.test'),
('5b000000-0000-0000-0000-000000000003','del-c@example.test'),
('5b000000-0000-0000-0000-000000000004','del-d@example.test'),
('5b000000-0000-0000-0000-000000000005','del-e@example.test'),
('5b000000-0000-0000-0000-000000000006','del-f@example.test'),
('5b000000-0000-0000-0000-000000000007','del-g@example.test');
-- B owns wb; A is an editor there. C owns wc with member D. F owns wf (member G) and will archive it.
set local role authenticated;
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000002',true);
select set_config('test.d.wb',public.studio_create_workspace('Espace de B','professional')::text,true);
select set_config('test.d.pb',public.studio_create_project(pg_temp.id('wb'),'Projet de B','construction')::text,true);
select public.studio_set_member(pg_temp.id('wb'),'5b000000-0000-0000-0000-000000000001','editor');
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000003',true);
select set_config('test.d.wc',public.studio_create_workspace('Espace de C','professional')::text,true);
select public.studio_set_member(pg_temp.id('wc'),'5b000000-0000-0000-0000-000000000004','viewer');
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000005',true);
select set_config('test.d.we',public.studio_create_workspace('Espace de E','personal')::text,true);
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000006',true);
select set_config('test.d.wf',public.studio_create_workspace('Espace de F','professional')::text,true);
select public.studio_set_member(pg_temp.id('wf'),'5b000000-0000-0000-0000-000000000007','viewer');
select public.studio_archive_workspace(pg_temp.id('wf'));
-- A: own workspace with a project, an asset, a published export, a share link, a brand kit and an invitation.
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Espace de A','personal')::text,true);
select set_config('test.d.pa',public.studio_create_project(pg_temp.id('wa'),'Projet de A','construction')::text,true);
select set_config('test.d.aa',public.studio_reserve_media(pg_temp.id('pa'),gen_random_uuid(),'a.jpg','image/jpeg',123)::text,true);
-- ... and a contribution inside B's workspace.
select set_config('test.d.ab',public.studio_reserve_media(pg_temp.id('pb'),gen_random_uuid(),'contribution.jpg','image/jpeg',123)::text,true);
reset role;
update public.studio_media_assets set upload_status='ready' where id in (pg_temp.id('aa'),pg_temp.id('ab'));
insert into storage.objects(bucket_id,name,metadata) select storage_bucket,storage_key,'{"size":123}'::jsonb from public.studio_media_assets where id in (pg_temp.id('aa'),pg_temp.id('ab'));
update public.studio_render_limits set max_active_per_project=20,max_active_per_workspace=50,max_per_user_hour=500,max_per_workspace_day=500;
set local role authenticated;
select public.studio_save_timeline(pg_temp.id('pa'),null,null,(select revision from public.studio_projects where id=pg_temp.id('pa')),pg_temp.draft(pg_temp.id('aa')));
select set_config('test.d.out',pg_temp.publish(pg_temp.id('pa'),'standard')::text,true);
select public.studio_create_render_share(pg_temp.id('out'),pg_temp.h('share-a'),7);
select public.studio_save_brand_kit(pg_temp.id('wa'),'{"company_name":"A SARL"}'::jsonb,null);
select public.studio_invite_member(pg_temp.id('wa'),'someone@example.test','viewer',pg_temp.h('inv-a'),7);

-- Plans.
select is(jsonb_array_length(public.studio_my_deletion_plan()->'purge'),1,'A: one workspace to purge');
select is((public.studio_my_deletion_plan()->'purge'->0->>'assets')::int,1,'A: plan counts assets');
select is((public.studio_my_deletion_plan()->'purge'->0->>'renders')::int,1,'A: plan counts exports');
select is((public.studio_my_deletion_plan()->'purge'->0->>'shares')::int,1,'A: plan counts share links');
select is(jsonb_array_length(public.studio_my_deletion_plan()->'leave'),1,'A: one workspace to leave');
select is(jsonb_array_length(public.studio_my_deletion_plan()->'blocked'),0,'A: nothing blocks');
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.studio_my_deletion_plan()->'blocked'),1,'C: an owner sharing a workspace is blocked');
select is(jsonb_array_length(public.studio_my_deletion_plan()->'purge'),0,'C: blocked workspace is not purged');
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000006',true);
select is(jsonb_array_length(public.studio_my_deletion_plan()->'purge'),1,'F: an archived workspace with members is purged with its owner');
select set_config('request.jwt.claim.sub','5b000000-0000-0000-0000-000000000004',true);
select is(public.studio_my_deletion_plan()->'purge','[]'::jsonb,'D: a plain member has nothing to purge');
select is(jsonb_array_length(public.studio_my_deletion_plan()->'leave'),1,'D: only their own memberships are described');

-- Server-only primitives.
select throws_ok('select public.studio_deletion_prepare(''5b000000-0000-0000-0000-000000000001'')','42501',null,'clients cannot prepare a deletion');
select throws_ok('select public.studio_deletion_finish(''5b000000-0000-0000-0000-000000000001'')','42501',null,'clients cannot finish a deletion');
select throws_ok('select public.studio_deletion_pending_keys(10)','42501',null,'clients cannot read the purge queue');
select throws_ok('select public.studio_deletion_plan(''5b000000-0000-0000-0000-000000000001'')','42501',null,'clients cannot plan for someone else');
select throws_ok('select count(*) from public.studio_account_deletions','42501',null,'the audit table is closed to clients');
reset role;
-- The primitives are granted to service_role only; assertions read tables as the superuser.

-- Blocked owner: nothing changes.
select is(jsonb_array_length(public.studio_deletion_prepare('5b000000-0000-0000-0000-000000000003')->'blocked'),1,'C: prepare reports the blocker');
select is((select deleted_at is null from public.studio_workspaces where id=pg_temp.id('wc')),true,'C: the shared workspace is untouched');
select is((select status from public.studio_account_deletions where subject_hash=pg_temp.h('5b000000-0000-0000-0000-000000000003')),'blocked','C: the audit row records the block');
-- A live, unprepared personal workspace is never purged by finish.
select is(public.studio_deletion_finish('5b000000-0000-0000-0000-000000000005')->>'not_prepared','true','E: finish refuses an unprepared live workspace');

-- Preparation of A.
select is((public.studio_deletion_prepare('5b000000-0000-0000-0000-000000000001')->>'queued')::int,2,'A: original and export queued for Storage deletion');
select is((select deleted_at is not null from public.studio_workspaces where id=pg_temp.id('wa')),true,'A: the workspace is closed at once');
select is((select count(*) from public.studio_render_shares where workspace_id=pg_temp.id('wa') and revoked_at is null),0::bigint,'A: share links revoked');
select is((select count(*) from public.studio_workspace_invitations where workspace_id=pg_temp.id('wa') and revoked_at is null and accepted_at is null),0::bigint,'A: pending invitations revoked');
select is((select count(*) from public.studio_workspace_members where user_id='5b000000-0000-0000-0000-000000000001' and role<>'owner'),0::bigint,'A: memberships elsewhere removed');
select is((select uploaded_by from public.studio_media_assets where id=pg_temp.id('ab')),'5b000000-0000-0000-0000-000000000002'::uuid,'A: contribution kept in B''s workspace, attributed to B');
select is((select count(*) from public.studio_media_assets where id=pg_temp.id('ab') and deleted_at is null),1::bigint,'A: B''s data is untouched');
select is(public.studio_deletion_finish('5b000000-0000-0000-0000-000000000001')->>'pending_objects','2','A: finish waits for Storage');
select is(jsonb_array_length(public.studio_deletion_pending_keys(100)),2,'A: the queue lists both objects');
select is(public.studio_deletion_mark_purged('studio-originals',array[(select storage_key from public.studio_media_assets where id=pg_temp.id('aa'))]),1,'A: original confirmed deleted');
select is(public.studio_deletion_mark_purged('studio-renders',array[(select storage_key from public.studio_render_outputs where workspace_id=pg_temp.id('wa'))]),1,'A: export confirmed deleted');
select is((public.studio_deletion_finish('5b000000-0000-0000-0000-000000000001')->>'remaining_references')::int,0,'A: no reference to the account remains');
select is((select count(*) from public.studio_workspaces where id=pg_temp.id('wa')),0::bigint,'A: workspace row gone');
select is((select count(*)+(select count(*) from public.studio_media_assets where workspace_id=pg_temp.id('wa'))+(select count(*) from public.studio_render_outputs where workspace_id=pg_temp.id('wa'))+(select count(*) from public.studio_render_shares where workspace_id=pg_temp.id('wa'))+(select count(*) from public.studio_brand_kits where workspace_id=pg_temp.id('wa'))+(select count(*) from public.studio_workspace_invitations where workspace_id=pg_temp.id('wa')) from public.studio_projects where workspace_id=pg_temp.id('wa')),0::bigint,'A: projects, assets, exports, shares, kit and invitations all gone');
select is((select status from public.studio_account_deletions where subject_hash=pg_temp.h('5b000000-0000-0000-0000-000000000001')),'completed','A: audit row completed');
select is((select summary->>'purged_workspaces' from public.studio_account_deletions where subject_hash=pg_temp.h('5b000000-0000-0000-0000-000000000001')),'1','A: audit keeps counts only');
select lives_ok('delete from auth.users where id=''5b000000-0000-0000-0000-000000000001''','the Auth user can now be deleted (no dependency left)');
select lives_ok('select public.studio_deletion_prepare(''5b000000-0000-0000-0000-000000000001'')','idempotent: a second prepare is harmless');
select is((public.studio_deletion_finish('5b000000-0000-0000-0000-000000000001')->>'remaining_references')::int,0,'idempotent: a second finish is harmless');

-- F: archived workspace with a member.
select is((public.studio_deletion_prepare('5b000000-0000-0000-0000-000000000006')->>'queued')::int,0,'F: nothing to queue for an empty archived workspace');
select is((public.studio_deletion_finish('5b000000-0000-0000-0000-000000000006')->>'purged_workspaces')::int,1,'F: archived workspace purged despite its member');
select is((select count(*) from public.studio_workspace_members where workspace_id=pg_temp.id('wf')),0::bigint,'F: its memberships went with it');
-- E: the personal workspace can be prepared then finished.
select is((public.studio_deletion_prepare('5b000000-0000-0000-0000-000000000005')->>'queued')::int,0,'E: prepared');
select is((public.studio_deletion_finish('5b000000-0000-0000-0000-000000000005')->>'remaining_references')::int,0,'E: finished');
select * from finish();
rollback;
