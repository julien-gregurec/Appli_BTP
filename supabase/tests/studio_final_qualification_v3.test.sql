-- Studio — qualification finale locale V3 : auth (inscription fermée, allowlist, création d'espace,
-- identité partagée avec Gestion Pro, utilisateur non autorisé) et propriété tenant du stockage.
-- Suite additive : n'altère aucune autre suite. La politique d'inscription reste à son défaut livré
-- ('closed') ; les comptes de test sont admis uniquement via le chemin d'exploitation documenté
-- (mode 'allowlist' + adresse explicite), jamais via le mode 'open'.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);
-- Nombre de lignes réellement touchées par un DML exécuté avec le rôle courant (security invoker).
create function pg_temp.affected(q text) returns bigint language plpgsql as $f$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $f$;

insert into auth.users(id,email) values
 ('53000000-0000-0000-0000-000000000001','tenant-a@studio-v3.test'),
 ('53000000-0000-0000-0000-000000000002','tenant-b@studio-v3.test'),
 ('53000000-0000-0000-0000-000000000003','intruder@elsewhere.test'),
 ('53000000-0000-0000-0000-000000000004','gp-owner@elsewhere.test');

-- Identité partagée : 0004 est un compte Gestion Pro existant (même auth.users, membre d'une entreprise).
insert into public.entreprises(id,nom) values ('53000000-0000-0000-0000-0000000000e1','GP Studio V3');
insert into public.utilisateurs(id) values ('53000000-0000-0000-0000-000000000004') on conflict do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id)
 values ('53000000-0000-0000-0000-000000000004','53000000-0000-0000-0000-0000000000e1');

-- 1) Inscription fermée (défaut livré). Le harnais E2E jetable (apps/studio/scripts/local-test.mjs)
-- ouvre la politique sur son instance : on vérifie donc le défaut porté par la migration elle-même,
-- puis on remet explicitement la politique à 'closed' pour que la suite ne dépende pas de l'instance.
select is((select column_default::text from information_schema.columns
 where table_schema='public' and table_name='studio_signup_policy' and column_name='mode'),
 '''closed''::text'::text,'signup : défaut livré closed');
update public.studio_signup_policy set mode='closed', allowlist='{}', updated_at=now() where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.studio_create_workspace('A','personal')$$,'42501','Inscription fermée','closed : tenant A refusé');
reset role;

-- 2) Identité partagée : un compte Gestion Pro n'obtient aucun droit Studio implicite.
set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.studio_create_workspace('GP','professional')$$,'42501','Inscription fermée','identité partagée : compte Gestion Pro soumis à la même politique Studio');
select is((select count(*) from public.studio_workspaces),0::bigint,'identité partagée : aucun espace Studio visible pour le compte Gestion Pro');
reset role;

-- 3) Utilisateur non authentifié : jamais d'espace, jamais d'exécution RPC par anon.
set local role anon;
select throws_ok($$select public.studio_create_workspace('Anon','personal')$$,'42501',null,'anon : studio_create_workspace non exécutable');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.studio_create_workspace('NoSub','personal')$$,'42501','Authentification requise','authenticated sans sub : refus');
reset role;

-- 4) Allowlist (chemin d'exploitation) : A et B admis nominativement, l'intrus et le compte GP non.
update public.studio_signup_policy
 set mode='allowlist', allowlist=array['tenant-a@studio-v3.test','tenant-b@studio-v3.test'], updated_at=now()
 where singleton;

set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000001',true);
select set_config('test.v3.wa',public.studio_create_workspace('Espace A','personal')::text,true);
select isnt(current_setting('test.v3.wa'),'','allowlist : tenant A crée son espace');
select is((select role from public.studio_workspace_members where workspace_id=current_setting('test.v3.wa')::uuid and user_id=auth.uid()),'owner'::text,'création : A est owner');
select set_config('test.v3.pa',public.studio_create_project(current_setting('test.v3.wa')::uuid,'Chantier A','construction')::text,true);
select set_config('test.v3.ma',public.studio_reserve_media(current_setting('test.v3.pa')::uuid,'53000000-0000-0000-0000-0000000000a1','photo.jpg','image/jpeg',1000)::text,true);
select matches((select storage_key from public.studio_media_assets where id=current_setting('test.v3.ma')::uuid),
 '^studio/'||current_setting('test.v3.wa')||'/'||current_setting('test.v3.pa')||'/'||current_setting('test.v3.ma')||'/original\.jpg$',
 'stockage : clé imposée par la base, préfixée par le workspace A');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000002',true);
select set_config('test.v3.wb',public.studio_create_workspace('Espace B','personal')::text,true);
select isnt(current_setting('test.v3.wb'),'','allowlist : tenant B crée son espace');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.studio_create_workspace('Intrus','personal')$$,'42501','Inscription fermée','allowlist : intrus refusé');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.studio_create_workspace('GP','professional')$$,'42501','Inscription fermée','allowlist : compte Gestion Pro non listé refusé');
reset role;
select is((select count(*) from public.utilisateurs_entreprises where utilisateur_id in
 ('53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000002')),0::bigint,
 'séparation : aucune entreprise Gestion Pro créée pour les tenants Studio');

-- 5) Utilisateur non autorisé (B, authentifié et admis, mais non membre de A).
set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.studio_workspaces where id=current_setting('test.v3.wa')::uuid),0::bigint,'B ne voit pas l''espace A');
select is((select count(*) from public.studio_projects where id=current_setting('test.v3.pa')::uuid),0::bigint,'B ne voit pas le projet A');
select is((select count(*) from public.studio_media_assets where id=current_setting('test.v3.ma')::uuid),0::bigint,'B ne voit pas le média A');
select throws_ok(format($$select public.studio_create_project(%L,'Pirate','free')$$,current_setting('test.v3.wa')),'42501',null,'B ne crée pas de projet dans A');
select throws_ok(format($$select public.studio_reserve_media(%L,'53000000-0000-0000-0000-0000000000b1','x.jpg','image/jpeg',10)$$,current_setting('test.v3.pa')),'42501',null,'B ne réserve pas de média dans le projet A');
select throws_ok(format($$select public.studio_delete_media(%L)$$,current_setting('test.v3.ma')),'42501',null,'B ne supprime pas le média A');
select throws_ok(format($$select public.studio_set_member(%L,'53000000-0000-0000-0000-000000000002','owner')$$,current_setting('test.v3.wa')),'42501',null,'B ne s''ajoute pas lui-même à A');
select throws_ok($$insert into public.studio_workspace_members(workspace_id,user_id,role) values (current_setting('test.v3.wa')::uuid,auth.uid(),'owner')$$,'42501',null,'B : DML direct sur les membres refusé');
reset role;
select is((select count(*) from public.studio_media_assets where id=current_setting('test.v3.ma')::uuid and deleted_at is null),1::bigint,'le média A est intact après les tentatives de B');

-- 6) Propriété tenant du stockage.
-- Objets réels déposés côté serveur dans les deux buckets Studio, pour le workspace A.
insert into storage.objects(bucket_id,name,owner,metadata) values
 ('studio-originals',(select storage_key from public.studio_media_assets where id=current_setting('test.v3.ma')::uuid),
  '53000000-0000-0000-0000-000000000001','{"size":1000}'),
 ('studio-renders','studio/'||current_setting('test.v3.wa')||'/render.mp4','53000000-0000-0000-0000-000000000001','{"size":10}');
-- Politique permissive large simulant celle d'une autre application du projet partagé : les gardes
-- restrictives Studio doivent quand même l'emporter sur les buckets Studio, sans toucher aux autres.
insert into storage.buckets(id,name,public) values ('v3-other-app','v3-other-app',false);
insert into storage.objects(bucket_id,name,owner,metadata) values ('v3-other-app','any/file.txt','53000000-0000-0000-0000-000000000001','{"size":1}');
create policy v3_broad_permissive on storage.objects for all to anon,authenticated using(true) with check(true);
grant select,insert,update,delete on storage.objects to anon,authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000001',true);
select is((select count(*) from storage.objects where bucket_id='studio-originals'),0::bigint,'stockage : même le propriétaire A ne lit pas studio-originals en direct');
select is((select count(*) from storage.objects where bucket_id='studio-renders'),0::bigint,'stockage : même le propriétaire A ne lit pas studio-renders en direct');
select is((select count(*) from storage.objects where bucket_id='v3-other-app'),1::bigint,'stockage : la garde Studio ne touche pas les autres buckets');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values ('studio-originals','studio/%s/forged.jpg')$$,current_setting('test.v3.wa')),'42501',null,'stockage : A ne peut pas écrire dans studio-originals en direct');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000002',true);
select is((select count(*) from storage.objects where bucket_id in ('studio-originals','studio-renders')),0::bigint,'stockage : B ne voit aucun objet Studio de A');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values ('studio-originals','studio/%s/x/y/original.jpg')$$,current_setting('test.v3.wa')),'42501',null,'stockage : B ne dépose rien sous le préfixe de A');
select is(pg_temp.affected($$update storage.objects set name='hijack' where bucket_id='studio-originals'$$),0::bigint,'stockage : B ne renomme aucun objet Studio');
select is(pg_temp.affected($$delete from storage.objects where bucket_id in ('studio-originals','studio-renders')$$),0::bigint,'stockage : B ne supprime aucun objet Studio');
select throws_ok(format($$select public.studio_finish_media(%L,auth.uid(),'{}'::jsonb)$$,current_setting('test.v3.ma')),'42501',null,'stockage : finalisation d''upload réservée au service_role');
reset role;
select is((select count(*) from storage.objects where bucket_id in ('studio-originals','studio-renders') and name like 'studio/'||current_setting('test.v3.wa')||'/%'),2::bigint,'stockage : objets de A intacts');

-- 7) Le service (serveur Studio, identité vérifiée côté serveur) ne finalise que pour un membre éditeur.
set local role service_role;
select throws_ok(format($$select public.studio_finish_media(%L,'53000000-0000-0000-0000-000000000002','{}'::jsonb)$$,current_setting('test.v3.ma')),'42501',null,'service : acteur non membre (B) refusé à la finalisation du média A');
select lives_ok(format($$select public.studio_finish_media(%L,'53000000-0000-0000-0000-000000000001','{"width":10,"height":10,"orientation":"square"}'::jsonb)$$,current_setting('test.v3.ma')),'service : finalisation acceptée pour le propriétaire A avec objet réel de bonne taille');
reset role;

select * from finish();
rollback;
