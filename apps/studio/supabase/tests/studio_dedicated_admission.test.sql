-- Projet DÉDIÉ Studio : admission au premier espace et lecture seule adossées au pont d'identité
-- (migration 20260927110000_studio_dedicated_admission.sql). Politique héritée laissée « closed ».
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
update public.studio_signup_policy set mode = 'closed', allowlist = '{}';
insert into auth.users(id, email) values
  ('5a000000-0000-0000-0000-000000000001', 'pont-actif@example.test'),
  ('5a000000-0000-0000-0000-000000000002', 'pont-lecture@example.test'),
  ('5a000000-0000-0000-0000-000000000003', 'pont-desactive@example.test'),
  ('5a000000-0000-0000-0000-000000000004', 'hors-pont@example.test');
insert into studio_identity.subject_state(subject, account, state_seq, granted) values
  (repeat('A', 43), 'active', 1, true),
  (repeat('B', 43), 'active', 1, false),
  (repeat('C', 43), 'disabled', 2, true);
insert into studio_identity.links(subject, user_id, email) values
  (repeat('A', 43), '5a000000-0000-0000-0000-000000000001', 'pont-actif@example.test'),
  (repeat('B', 43), '5a000000-0000-0000-0000-000000000002', 'pont-lecture@example.test'),
  (repeat('C', 43), '5a000000-0000-0000-0000-000000000003', 'pont-desactive@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select isnt(public.studio_create_workspace('Mon Studio', 'personal'), null, 'Lié + actif + droit : premier espace malgré la politique héritée « closed »');
select isnt(public.studio_create_workspace('Pro', 'professional'), null, 'Lié + droit : espace professionnel');
select is((select count(*) from public.studio_workspaces), 2::bigint, 'Ses deux espaces sont lisibles');

select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.studio_create_workspace('Mon Studio', 'personal')$$, '42501', 'Accès Studio en lecture seule', 'Lié + droit retiré : lecture seule, aucune création');

select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.studio_create_workspace('Mon Studio', 'personal')$$, '42501', 'Accès Studio en lecture seule', 'Lié + compte central désactivé : refus');

select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000004', true);
select throws_ok($$select public.studio_create_workspace('Mon Studio', 'personal')$$, '42501', 'Inscription fermée', 'Hors pont : politique héritée fail-closed');
reset role;

update public.studio_signup_policy set mode = 'open';
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000004', true);
select isnt(public.studio_create_workspace('Mon Studio', 'personal'), null, 'Hors pont + politique « open » (tests jetables) : inchangé');
reset role;

select ok(not has_function_privilege('authenticated', 'public.studio_identity_caller_access()', 'EXECUTE'), 'authenticated ne peut appeler studio_identity_caller_access (pas d''oracle)');
select ok(not has_function_privilege('anon', 'public.studio_identity_caller_access()', 'EXECUTE'), 'anon non plus');
select ok(has_function_privilege('authenticated', 'public.studio_create_workspace(text,text)', 'EXECUTE'), 'studio_create_workspace reste exécutable par authenticated');
select * from finish();
rollback;
