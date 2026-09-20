begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(k text) returns uuid language sql as $$select current_setting('test.d.'||k)::uuid$$;
create function pg_temp.h(s text) returns text language sql as $$select encode(extensions.digest(s,'sha256'),'hex')$$;
insert into auth.users(id,email) values
('5a000000-0000-0000-0000-000000000001','inv-owner@example.test'),
('5a000000-0000-0000-0000-000000000002','inv-admin@example.test'),
('5a000000-0000-0000-0000-000000000003','inv-editor@example.test'),
('5a000000-0000-0000-0000-000000000004','Invitee@Example.Test'),
('5a000000-0000-0000-0000-000000000005','inv-stranger@example.test'),
('5a000000-0000-0000-0000-000000000006','inv-outsider@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000001',true);
select set_config('test.d.wa',public.studio_create_workspace('Invitations A','professional')::text,true);
select public.studio_set_member(pg_temp.id('wa'),'5a000000-0000-0000-0000-000000000002','admin');
select public.studio_set_member(pg_temp.id('wa'),'5a000000-0000-0000-0000-000000000003','editor');

-- Creating invitations.
select set_config('test.d.i1',public.studio_invite_member(pg_temp.id('wa'),'  Invitee@Example.TEST ','editor',pg_temp.h('one'),7)::text,true);
select is((public.studio_list_invitations(pg_temp.id('wa'))->0->>'email'),'invitee@example.test','the address is normalized to lower case');
select is((public.studio_list_invitations(pg_temp.id('wa'))->0->>'status'),'pending','listed as pending');
select ok(public.studio_list_invitations(pg_temp.id('wa'))::text not like '%'||pg_temp.h('one')||'%','the token hash is never listed');
select throws_ok('select count(*) from public.studio_workspace_invitations','42501',null,'the table is closed to clients');
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''pas un email'',''editor'',pg_temp.h(''x''),7)','22023',null,'invalid address refused');
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''a@example.test'',''owner'',pg_temp.h(''x''),7)','22023',null,'owner role cannot be invited');
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''a@example.test'',''editor'',''bad'',7)','22023',null,'only a SHA-256 hash is accepted');
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''a@example.test'',''editor'',pg_temp.h(''x''),30)','22023',null,'at most 14 days');
-- Re-inviting replaces the pending invitation: the first link stops working.
select set_config('test.d.i2',public.studio_invite_member(pg_temp.id('wa'),'invitee@example.test','viewer',pg_temp.h('two'),7)::text,true);
select is((select count(*) from jsonb_array_elements(public.studio_list_invitations(pg_temp.id('wa'))) x where x->>'status'='pending'),1::bigint,'one pending invitation per address');
reset role;set local role service_role;
select is(public.studio_resolve_invitation(pg_temp.h('one'))->>'status','revoked','the replaced link is revoked');
select is(public.studio_resolve_invitation(pg_temp.h('two'))->>'workspace_name','Invitations A','the acceptance page can name the workspace');
select is(public.studio_resolve_invitation(pg_temp.h('none')),null,'unknown secret resolves to nothing');
reset role;set local role authenticated;

-- Roles.
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000002',true);
select lives_ok('select public.studio_invite_member(pg_temp.id(''wa''),''viewer2@example.test'',''viewer'',pg_temp.h(''v2''),7)','an admin invites a viewer');
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''adm2@example.test'',''admin'',pg_temp.h(''a2''),7)','42501',null,'an admin cannot invite an admin');
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000003',true);
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''e@example.test'',''viewer'',pg_temp.h(''e''),7)','42501',null,'an editor cannot invite');
select throws_ok('select public.studio_list_invitations(pg_temp.id(''wa''))','42501',null,'an editor cannot list invitations');
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000006',true);
select throws_ok('select public.studio_invite_member(pg_temp.id(''wa''),''e@example.test'',''viewer'',pg_temp.h(''e''),7)','42501',null,'an outsider cannot invite');
select throws_ok('select public.studio_revoke_invitation(pg_temp.id(''i2''))','42501',null,'an outsider cannot revoke');

-- Acceptance is bound to the invited address.
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000005',true);
select throws_ok('select public.studio_accept_invitation(pg_temp.h(''two''))','42501',null,'another account cannot use the link');
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000004',true);
select throws_ok('select public.studio_accept_invitation(pg_temp.h(''one''))','22023',null,'a revoked link cannot be used');
select throws_ok('select public.studio_accept_invitation(pg_temp.h(''none''))','22023',null,'an unknown secret cannot be used');
select is(public.studio_accept_invitation(pg_temp.h('two')),pg_temp.id('wa'),'the invited account joins the workspace');
select is(public.studio_my_role(pg_temp.id('wa')),'viewer','with the invited role');
select throws_ok('select public.studio_accept_invitation(pg_temp.h(''two''))','22023',null,'a link works once');
-- An existing member keeps their role.
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000001',true);
select set_config('test.d.i3',public.studio_invite_member(pg_temp.id('wa'),'inv-editor@example.test','viewer',pg_temp.h('three'),7)::text,true);
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000003',true);
select is(public.studio_accept_invitation(pg_temp.h('three')),pg_temp.id('wa'),'an existing member can accept');
select is(public.studio_my_role(pg_temp.id('wa')),'editor','and is never demoted');
-- Expiry, revocation by admin, deleted workspace.
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000002',true);
select set_config('test.d.i4',public.studio_invite_member(pg_temp.id('wa'),'late@example.test','viewer',pg_temp.h('four'),7)::text,true);
select lives_ok('select public.studio_revoke_invitation(pg_temp.id(''i4''))','an admin revokes');
select is((select count(*) from jsonb_array_elements(public.studio_list_invitations(pg_temp.id('wa'))) x where x->>'status'='accepted'),2::bigint,'accepted invitations stay in the history');
reset role;
update public.studio_workspace_invitations set expires_at=now()-interval '1 minute' where email='viewer2@example.test';
insert into auth.users(id,email) values('5a000000-0000-0000-0000-000000000007','viewer2@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000007',true);
select throws_ok('select public.studio_accept_invitation(pg_temp.h(''v2''))','22023',null,'an expired invitation cannot be used');
select throws_ok('select public.studio_resolve_invitation(pg_temp.h(''v2''))','42501',null,'clients cannot resolve invitations');
-- Registration gate helper: only a live invitation counts, and clients cannot call it.
select set_config('request.jwt.claim.sub','5a000000-0000-0000-0000-000000000001',true);
select public.studio_invite_member(pg_temp.id('wa'),'Fresh@Example.test','viewer',pg_temp.h('fresh'),7);
select throws_ok('select public.studio_pending_invitation_for(''fresh@example.test'')','42501',null,'clients cannot probe pending invitations');
reset role;
select is(public.studio_pending_invitation_for(' FRESH@example.test '),true,'a live invitation is found, whatever the case or spaces');
select is(public.studio_pending_invitation_for('late@example.test'),false,'a revoked invitation does not count');
select is(public.studio_pending_invitation_for('invitee@example.test'),false,'an accepted invitation does not count');
select is(public.studio_pending_invitation_for('viewer2@example.test'),false,'an expired invitation does not count');
select is(public.studio_pending_invitation_for('nobody@example.test'),false,'unknown address');
select * from finish();
rollback;
