-- Studio — inscription fermée imposée au niveau base, pas seulement par la Server Action.
-- Reproduit explicitement le contournement décrit dans la mission : un compte Auth créé sans passer
-- par apps/studio/src/app/actions.ts (signup()) — ici simulé par une insertion directe dans auth.users,
-- l'équivalent SQL d'un appel direct à POST /auth/v1/signup ou au SDK — ne doit obtenir aucun espace
-- Studio tant que la politique ne l'admet pas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Comptes "signup direct" : jamais passés par la Server Action, insérés directement dans auth.users
-- comme le ferait GoTrue pour n'importe quel appel Auth (UI, SDK, REST) — c'est le point exact du test.
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000001','closed-bypass@invalid.local');
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000002','allowlisted@elsatia.fr');
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000003','not-allowlisted@invalid.local');
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000004','sneaky@elsatia.fr.evil.test');
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000005','open-mode@invalid.local');
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000006','grandfathered@invalid.local');
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000007','domain-match@sub.elsatia.fr');

-- 1) Défaut livré par la migration : fermé.
select is((select mode from public.studio_signup_policy where singleton), 'closed'::text, 'défaut livré : closed');

-- 2) authenticated ne peut ni lire ni écrire la politique, ni appeler studio_signup_permitted en direct.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select throws_ok('select * from public.studio_signup_policy', '42501', null, 'authenticated ne lit pas la politique');
select throws_ok('select public.studio_signup_permitted(''x@test.local'')', '42501', null, 'authenticated ne peut pas sonder studio_signup_permitted directement');

-- 3) Mode closed (défaut) : le contournement direct de la Server Action n'obtient aucun espace.
select throws_ok('select public.studio_create_workspace(''Bypass'',''personal'')', '42501', 'Inscription fermée', 'closed : signup direct refusé, aucun espace créé');
select is((select count(*) from public.studio_workspaces where owner_user_id = '52000000-0000-0000-0000-000000000001'), 0::bigint, 'closed : aucun espace effectivement créé pour le contournement');
reset role;

-- 4) Mode allowlist.
update public.studio_signup_policy set mode = 'allowlist', allowlist = array['allowlisted@elsatia.fr','@sub.elsatia.fr'], updated_at = now() where singleton;

set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000002',true);
select isnt(public.studio_create_workspace('Allowlisted','personal'), null, 'allowlist : adresse exacte admise');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000007',true);
select isnt(public.studio_create_workspace('DomainMatch','personal'), null, 'allowlist : @domaine admet un sous-domaine listé explicitement');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000003',true);
select throws_ok('select public.studio_create_workspace(''NotAllowlisted'',''personal'')', '42501', 'Inscription fermée', 'allowlist : adresse absente refusée');
reset role;

-- 5) Non-contournement par sous-domaine ressemblant : "@elsatia.fr" n'admet pas "...@elsatia.fr.evil.test".
update public.studio_signup_policy set allowlist = array['@elsatia.fr'], updated_at = now() where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000004',true);
select throws_ok('select public.studio_create_workspace(''Sneaky'',''personal'')', '42501', 'Inscription fermée', 'allowlist : @elsatia.fr ne matche pas un domaine hôte différent (…@elsatia.fr.evil.test)');
reset role;

-- 6) Mode open : admet un e-mail syntaxiquement valide quelconque.
update public.studio_signup_policy set mode = 'open', allowlist = '{}' where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000005',true);
select isnt(public.studio_create_workspace('Open','personal'), null, 'open : admis sans condition');
reset role;

-- 7) Grandfathering : un compte déjà membre d'un espace avant la fermeture n'est pas expulsé.
update public.studio_signup_policy set mode = 'closed', allowlist = '{}' where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000005',true);
select isnt(public.studio_create_workspace('Second','professional'), null, 'closed : un membre déjà admis peut encore créer un espace supplémentaire');
reset role;

-- 8) Ligne de politique absente (état de configuration corrompu / migration non appliquée) : refus, pas
-- d'admission par défaut. Fail-closed y compris sur une erreur de configuration.
delete from public.studio_signup_policy where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000006',true);
select throws_ok('select public.studio_create_workspace(''NoPolicyRow'',''personal'')', '42501', 'Inscription fermée', 'politique absente : refus (fail-closed), jamais une admission par défaut');
reset role;
insert into public.studio_signup_policy (singleton, mode) values (true, 'closed');

-- 9) Une fois la ligne restaurée et un utilisateur explicitement admis via l'onboarding (defense en
-- profondeur seulement, jamais un chemin d'admission alternatif) : le workspace existant reste lisible,
-- confirmant que la politique n'a rien altéré des accès déjà accordés en mode open plus haut.
select is((select count(*) from public.studio_workspace_members where user_id = '52000000-0000-0000-0000-000000000005'), 2::bigint, 'les deux espaces du membre déjà admis restent en place');

-- 10) Invalid email syntax never admitted even in open mode.
update public.studio_signup_policy set mode = 'open' where singleton;
insert into auth.users(id,email) values ('52000000-0000-0000-0000-000000000008','not-an-email');
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000008',true);
select throws_ok('select public.studio_create_workspace(''BadEmail'',''personal'')', '42501', 'Inscription fermée', 'open : un e-mail syntaxiquement invalide reste refusé');
reset role;
update public.studio_signup_policy set mode = 'closed' where singleton;

select * from finish();
rollback;
