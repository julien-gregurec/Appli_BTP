begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- ACL service_role : plus aucun grant table-level INSERT/UPDATE, mais les
-- traitements techniques non financiers restent possibles par colonne.
select ok(
  not has_table_privilege('service_role','public.entreprises','INSERT')
  and not has_table_privilege('service_role','public.entreprises','UPDATE'),
  'service_role sans INSERT/UPDATE table-level sur entreprises'
);
select is(
  (select count(*) from information_schema.role_column_grants
   where table_schema='public' and table_name='entreprises'
     and grantee='service_role' and privilege_type in ('INSERT','UPDATE')
     and column_name in (
       'remise_stripe_coupon_id','remise_description','remise_motif_interne',
       'remise_duree_mois','remise_type','remise_valeur','remise_cree_par',
       'remise_appliquee_at'
     )),
  0::bigint,
  'les 16 grants service_role sur les huit colonnes remise sont supprimés'
);
select ok(
  not has_column_privilege('service_role','public.entreprises','nom','INSERT')
  and has_column_privilege('service_role','public.entreprises','nom','UPDATE'),
  'service_role conserve uniquement les UPDATE non financiers nécessaires'
);

set local role service_role;
select throws_ok(
  $$update public.entreprises set remise_valeur=99 where id='a0000000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role : null vers valeur refusé'
);
reset role;
set local role elsatia_discount_f4_writer;
update public.entreprises
set remise_valeur=42
where id='a0000000-0000-0000-0000-000000000001';
reset role;
set local role service_role;
select throws_ok(
  $$update public.entreprises set remise_valeur=null where id='a0000000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role : valeur vers null refusé'
);
select throws_ok(
  $$update public.entreprises set remise_description='partielle' where id='a0000000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role : mutation partielle refusée'
);
select throws_ok(
  $$insert into public.entreprises(id,nom,remise_description) values('c7400000-0000-4000-8000-000000000001','R7.4 attaque','remise')$$,
  '42501',null,'service_role : INSERT avec remise refusé'
);
select throws_ok(
  $$insert into public.entreprises(id,nom,remise_description) values('a0000000-0000-0000-0000-000000000001','R7.4 attaque','remise') on conflict(id) do update set remise_description=excluded.remise_description$$,
  '42501',null,'service_role : UPSERT avec remise refusé'
);
select lives_ok(
  $$update public.entreprises set nom='Entreprise Isolation A R7.4' where id='a0000000-0000-0000-0000-000000000001'$$,
  'service_role : UPDATE non financier conservé'
);
select throws_ok(
  $$insert into public.entreprises(id,nom) values('c7400000-0000-4000-8000-000000000002','Entreprise technique R7.4')$$,
  '42501',null,'service_role : création générique entreprise refusée'
);
reset role;

-- Les quatre tables plateforme restent lisibles lorsque nécessaire, mais leurs
-- douze droits directs INSERT/UPDATE/DELETE sont fermés.
select is(
  (select count(*) from information_schema.role_table_grants
   where grantee='authenticated' and table_schema='public'
     and table_name in (
       'plateforme_admins','acces_applications_entreprises',
       'habilitations_applications_utilisateurs','historique_acces_applications'
     )
     and privilege_type in ('INSERT','UPDATE','DELETE')),
  0::bigint,
  'les 12 grants authenticated résiduels sont supprimés'
);
select ok(
  has_table_privilege('authenticated','public.plateforme_admins','SELECT')
  and has_table_privilege('authenticated','public.acces_applications_entreprises','SELECT')
  and has_table_privilege('authenticated','public.habilitations_applications_utilisateurs','SELECT')
  and has_table_privilege('authenticated','public.historique_acces_applications','SELECT'),
  'les lectures plateforme nécessaires restent accordées'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$insert into public.plateforme_admins(email,role) values('attaque-r74@invalid.local','total')$$,
  '42501',null,'authenticated : INSERT plateforme_admins refusé'
);
select throws_ok(
  $$update public.acces_applications_entreprises set autorise=false where entreprise_id='a0000000-0000-0000-0000-000000000001'$$,
  '42501',null,'authenticated : UPDATE accès application refusé'
);
select throws_ok(
  $$delete from public.habilitations_applications_utilisateurs where entreprise_id='a0000000-0000-0000-0000-000000000001'$$,
  '42501',null,'authenticated : DELETE habilitation refusé'
);
select throws_ok(
  $$insert into public.historique_acces_applications(cible_type,cible_id,application_code,action) values('entreprise','a0000000-0000-0000-0000-000000000001','gestion_pro','attaque')$$,
  '42501',null,'authenticated : INSERT historique multi-app refusé'
);
reset role;

-- Lecture support : RPC entreprise bornée, aucune lecture brute ni fuite B.
insert into public.support_messages(
  id,entreprise_id,cote,auteur_id,auteur_nom,contenu
) values
  ('c7410000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000001','entreprise','10000000-0000-0000-0000-000000000001','Admin A','SECRET_R74_A'),
  ('c7410000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','entreprise','20000000-0000-0000-0000-000000000001','Admin B','SECRET_R74_B');

select ok(
  not has_table_privilege('authenticated','public.support_messages','SELECT')
  and not has_table_privilege('authenticated','public.support_messages','UPDATE')
  and not has_table_privilege('authenticated','public.support_messages','DELETE')
  and not has_table_privilege('authenticated','public.support_messages','INSERT'),
  'support_messages : toute la surface CRUD directe authenticated est fermée'
);
select ok(
  has_function_privilege('authenticated','public.support_messages_entreprise(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.support_messages_entreprise(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.support_messages_entreprise(uuid)','EXECUTE'),
  'RPC support entreprise exposée uniquement à authenticated'
);
select matches(
  pg_get_functiondef('public.support_messages_entreprise(uuid)'::regprocedure),
  'SECURITY DEFINER',
  'RPC support entreprise SECURITY DEFINER'
);
select matches(
  pg_get_functiondef('public.support_messages_entreprise(uuid)'::regprocedure),
  'SET search_path TO ''public''',
  'RPC support entreprise avec search_path fixe'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_ok(
  $$select contenu from public.support_messages limit 1$$,
  '42501',null,'utilisateur entreprise : SELECT support brut refusé'
);
select is(
  (select count(*) from public.support_messages_entreprise('a0000000-0000-0000-0000-000000000001') where contenu='SECRET_R74_A'),
  1::bigint,'utilisateur A : son fil est lisible par la RPC'
);
select is(
  (select count(*) from public.support_messages_entreprise('a0000000-0000-0000-0000-000000000001') where contenu='SECRET_R74_B'),
  0::bigint,'utilisateur A : aucun contenu B dans son fil'
);
select throws_ok(
  $$select * from public.support_messages_entreprise('b0000000-0000-0000-0000-000000000001')$$,
  '42501',null,'utilisateur A : lecture cross-tenant refusée'
);
select throws_ok(
  $$insert into public.support_messages(entreprise_id,cote,auteur_id,auteur_nom,contenu) values('a0000000-0000-0000-0000-000000000001','entreprise','10000000-0000-0000-0000-000000000001','Admin A','Envoi direct interdit')$$,
  '42501',null,'utilisateur A : INSERT support direct refusé après R7.5'
);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$select * from public.support_messages_entreprise('a0000000-0000-0000-0000-000000000001')$$,
  '42501',null,'admin plateforme : RPC entreprise non utilisable comme contournement'
);
reset role;

-- Le writer F4 reste inchangé et strictement inaccessible aux rôles API.
select ok(
  exists(select 1 from pg_roles where rolname='elsatia_discount_f4_writer'
    and not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls),
  'writer F4 conserve NOLOGIN/NOINHERIT/NOSUPERUSER/NOBYPASSRLS'
);
select ok(
  has_column_privilege('elsatia_discount_f4_writer','public.entreprises','remise_valeur','UPDATE')
  and not pg_has_role('authenticated','elsatia_discount_f4_writer','MEMBER')
  and not pg_has_role('service_role','elsatia_discount_f4_writer','MEMBER'),
  'writer F4 conserve ses droits minimaux sans membership API'
);

select * from finish();
rollback;
