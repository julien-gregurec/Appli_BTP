-- Studio : inscription fermée par défaut, une seule décision pour le hook Auth, l'action signup et l'ouverture d'espace.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);
create function pg_temp.h(s text) returns text language sql as $$select encode(extensions.digest(s,'sha256'),'hex')$$;
create function pg_temp.hook(mail text) returns jsonb language sql as
 $$select public.studio_hook_before_user_created(jsonb_build_object('metadata',jsonb_build_object('name','before-user-created'),'user',jsonb_build_object('email',mail)))$$;

-- Contrat : état livré. La pile jetable E2E ouvre la politique ; ici on repart de l'état livré explicitement.
update public.studio_signup_policy set mode='closed', allowlist='{}';
select is((select count(*) from public.studio_signup_policy),1::bigint,'une seule ligne de politique');
select throws_ok($$insert into public.studio_signup_policy(singleton,mode) values (false,'closed')$$,'23514',null,'singleton imposé');
select throws_ok($$update public.studio_signup_policy set mode='maybe'$$,'23514',null,'mode inconnu refusé par la table');

-- Décision selon le mode.
select is(public.studio_signup_permitted('anyone@example.test'),false,'fermé : refus par défaut');
select is(public.studio_signup_permitted(null),false,'fermé : adresse absente refusée');
select is(public.studio_signup_permitted('pas un email'),false,'fermé : adresse invalide refusée');
update public.studio_signup_policy set mode='allowlist', allowlist=array['Alice@Example.Test','@Elsatia.fr'];
select is(public.studio_signup_permitted('alice@example.test'),true,'liste : adresse exacte, casse ignorée');
select is(public.studio_signup_permitted('bob@elsatia.fr'),true,'liste : @domaine');
select is(public.studio_signup_permitted('bob@sub.elsatia.fr'),false,'liste : pas de sous-domaine');
select is(public.studio_signup_permitted('x@evil-elsatia.fr'),false,'liste : pas de suffixe trompeur');
select is(public.studio_signup_permitted('bob@example.test'),false,'liste : adresse hors liste');
update public.studio_signup_policy set mode='open';
select is(public.studio_signup_permitted('anyone@example.test'),true,'ouvert : admis');
update public.studio_signup_policy set mode='closed';

-- Hook Auth : `{}` accepte, `{error}` refuse ; même prédicat.
select is(pg_temp.hook('anyone@example.test'),jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Les inscriptions à ELSATIA Studio sont fermées.')),'hook : refus en mode fermé');
select is(public.studio_hook_before_user_created('{}'::jsonb)->'error'->>'http_code','403','hook : événement sans utilisateur refusé');
select is(public.studio_hook_before_user_created('{"user":{}}'::jsonb)->'error'->>'http_code','403','hook : utilisateur sans e-mail refusé');
update public.studio_signup_policy set mode='allowlist', allowlist=array['@elsatia.fr'];
select is(pg_temp.hook('bob@elsatia.fr'),'{}'::jsonb,'hook : liste, adresse admise');
select is(pg_temp.hook('bob@example.test')->'error'->>'http_code','403','hook : liste, adresse refusée');
update public.studio_signup_policy set mode='open';
select is(pg_temp.hook('anyone@example.test'),'{}'::jsonb,'hook : ouvert accepte');
delete from public.studio_signup_policy;
select is(public.studio_signup_permitted('bob@elsatia.fr'),false,'ligne absente : refus (fail-closed)');
select is(pg_temp.hook('bob@elsatia.fr')->'error'->>'http_code','403','hook : ligne absente refusée (fail-closed)');
insert into public.studio_signup_policy(singleton,mode) values (true,'closed');

-- Comptes : un propriétaire admis (politique ouverte le temps de son onboarding), puis fermeture.
insert into auth.users(id,email) values
 ('5c000000-0000-0000-0000-000000000001','sp-owner@example.test'),
 ('5c000000-0000-0000-0000-000000000002','sp-stranger@example.test'),
 ('5c000000-0000-0000-0000-000000000003','Sp-Invitee@Example.Test'),
 ('5c000000-0000-0000-0000-000000000004','sp-listed@elsatia.fr');
update public.studio_signup_policy set mode='open';
set local role authenticated;
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000001',true);
select set_config('test.sp.w',public.studio_create_workspace('Espace SP','personal')::text,true);
reset role;
update public.studio_signup_policy set mode='closed';

-- Invitation : admet l'adresse invitée tant qu'elle est en attente.
set local role authenticated;
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000001',true);
select set_config('test.sp.i',public.studio_invite_member(current_setting('test.sp.w')::uuid,'sp-invitee@example.test','editor',pg_temp.h('sp'),7)::text,true);
reset role;
select is(public.studio_signup_permitted('SP-Invitee@example.test'),true,'fermé : invitation en attente admise');
select is(pg_temp.hook('sp-invitee@example.test'),'{}'::jsonb,'hook : invitation en attente acceptée');
select is(public.studio_signup_permitted('sp-stranger@example.test'),false,'fermé : autre adresse toujours refusée');

-- Ouverture d'espace : même prédicat, compte créé par un autre chemin.
set local role authenticated;
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.studio_create_workspace('Intrus','personal')$$,'42501','Inscription fermée','fermé : compte non admis, pas d''espace');
select is((select count(*) from public.studio_workspaces),0::bigint,'l''intrus ne voit aucun espace');
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.studio_create_workspace('Espace invité','professional')$$,'fermé : invité (invitation en attente) ouvre un espace');
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.studio_create_workspace('Second espace','professional')$$,'fermeture : propriétaire déjà admis garde ses droits');
select is(public.studio_create_workspace('Espace SP','personal'),current_setting('test.sp.w')::uuid,'idempotence du workspace personnel conservée');
reset role;
update public.studio_signup_policy set mode='allowlist', allowlist=array['@elsatia.fr'];
set local role authenticated;
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.studio_create_workspace('Espace liste','personal')$$,'liste : adresse admise ouvre un espace');
select set_config('request.jwt.claim.sub','5c000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.studio_create_workspace('Intrus','personal')$$,'42501','Inscription fermée','liste : adresse hors liste refusée');
reset role;

-- Privilèges : la décision n'est jamais lisible ni exécutable par un client.
select is(has_function_privilege('authenticated','public.studio_signup_permitted(text)','execute'),false,'authenticated ne lit pas la décision');
select is(has_function_privilege('anon','public.studio_signup_permitted(text)','execute'),false,'anon ne lit pas la décision');
select is((has_function_privilege('service_role','public.studio_signup_permitted(text)','execute'),has_function_privilege('supabase_auth_admin','public.studio_hook_before_user_created(jsonb)','execute')),row(true,true)::record,'service_role lit la décision, supabase_auth_admin appelle le hook');
select is((has_function_privilege('authenticated','public.studio_hook_before_user_created(jsonb)','execute'),has_function_privilege('anon','public.studio_hook_before_user_created(jsonb)','execute')),row(false,false)::record,'le hook n''est pas appelable par un client');
select is((has_table_privilege('authenticated','public.studio_signup_policy','select'),has_table_privilege('service_role','public.studio_signup_policy','select'),has_table_privilege('anon','public.studio_signup_policy','update')),row(false,false,false)::record,'la politique n''est ni lisible ni modifiable par l''API');
select * from finish();
rollback;
