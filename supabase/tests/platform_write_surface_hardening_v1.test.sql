begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_user_meta_data,raw_app_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','ee930000-0000-4000-8000-000000000001','authenticated','authenticated','lecture-write@invalid.local',crypt('test',gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee930000-0000-4000-8000-000000000002','authenticated','authenticated','support-write@invalid.local',crypt('test',gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee930000-0000-4000-8000-000000000003','authenticated','authenticated','facturation-write@invalid.local',crypt('test',gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee930000-0000-4000-8000-000000000004','authenticated','authenticated','metadata-write@invalid.local',crypt('test',gen_salt('bf')),now(),'{"plateforme_role":"total"}','{"plateforme_admin":true}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee930000-0000-4000-8000-000000000005','authenticated','authenticated','inactif-write@invalid.local',crypt('test',gen_salt('bf')),now(),'{}','{}',now(),now());

insert into public.plateforme_admins(
  email,role,utilisateur_id,actif,statut_identite,activation_at
) values
  ('lecture-write@invalid.local','lecture','ee930000-0000-4000-8000-000000000001',true,'active',now()),
  ('support-write@invalid.local','support','ee930000-0000-4000-8000-000000000002',true,'active',now()),
  ('facturation-write@invalid.local','facturation','ee930000-0000-4000-8000-000000000003',true,'active',now()),
  ('metadata-write@invalid.local','total',null,false,'en_attente',null),
  ('inactif-write@invalid.local','total','ee930000-0000-4000-8000-000000000005',false,'rattachee_non_confirmee',null);

-- Le schéma ne fournit plus silencieusement le rôle total.
select is(
  (select column_default::text from information_schema.columns
   where table_schema='public' and table_name='plateforme_admins' and column_name='role'),
  null::text,
  'plateforme_admins.role : aucun rôle total par défaut'
);
select throws_ok(
  $$insert into public.plateforme_admins(email,actif,statut_identite) values('role-absent@invalid.local',false,'en_attente')$$,
  '23502',null,'création sans rôle explicite refusée'
);
select throws_ok(
  $$insert into public.plateforme_admins(email,role,actif,statut_identite) values('role-invalide@invalid.local','inconnu',false,'en_attente')$$,
  '23514',null,'rôle inconnu refusé'
);

-- Lecture AAL1 puis AAL2 : aucune écriture globale.
set local role authenticated;
select set_config('request.jwt.claim.sub','ee930000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ee930000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_ok(
  $$insert into public.boutique_produits(sku,nom,categorie,prix_ht) values('LECTURE-AAL1','Interdit','imprimante_code_barres',1)$$,
  '42501',null,'lecture + AAL1 : écriture boutique refusée'
);
select throws_ok(
  $$insert into public.entreprise_feature_flags(entreprise_id,feature_key,statut,active) values('b0000000-0000-0000-0000-000000000001','lecture_aal1','active',true)$$,
  '42501',null,'lecture + AAL1 : écriture feature flag globale refusée'
);
select set_config('request.jwt.claims','{"sub":"ee930000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$insert into public.boutique_produits(sku,nom,categorie,prix_ht) values('LECTURE-AAL2','Interdit','imprimante_code_barres',1)$$,
  '42501',null,'lecture + AAL2 : écriture boutique refusée'
);
select throws_ok(
  $$insert into public.entreprise_feature_flags(entreprise_id,feature_key,statut,active) values('b0000000-0000-0000-0000-000000000001','lecture_aal2','active',true)$$,
  '42501',null,'lecture + AAL2 : écriture feature flag globale refusée'
);

-- Total AAL1 refusé, total AAL2 autorisé dans le périmètre global.
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_ok(
  $$insert into public.boutique_produits(sku,nom,categorie,prix_ht) values('TOTAL-AAL1','Interdit','imprimante_code_barres',1)$$,
  '42501',null,'total + AAL1 : écriture boutique refusée'
);
select throws_ok(
  $$select public.plateforme_autoriser_effet_externe('remise_abonnement')$$,
  'P0001',null,'total + AAL1 : effet externe refusé'
);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$insert into public.boutique_produits(sku,nom,categorie,prix_ht) values('TOTAL-AAL2','Autorise','imprimante_code_barres',1)$$,
  'total + AAL2 : écriture boutique autorisée'
);
select lives_ok(
  $$insert into public.entreprise_feature_flags(entreprise_id,feature_key,statut,active) values('b0000000-0000-0000-0000-000000000001','total_aal2','active',true)$$,
  'total + AAL2 : écriture feature flag globale autorisée'
);
select lives_ok(
  $$select public.plateforme_autoriser_effet_externe('remise_abonnement')$$,
  'total + AAL2 : effet externe autorisé'
);

-- Facturation AAL2 peut préautoriser une remise, sans obtenir l'administration globale.
select set_config('request.jwt.claim.sub','ee930000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"ee930000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_autoriser_effet_externe('remise_abonnement')$$,
  'facturation + AAL2 : remise autorisée dans son périmètre'
);
select throws_ok(
  $$insert into public.boutique_produits(sku,nom,categorie,prix_ht) values('FACTURATION-AAL2','Interdit','imprimante_code_barres',1)$$,
  '42501',null,'facturation + AAL2 : administration boutique refusée'
);

-- Support, UID inactif, email seul et métadonnées falsifiées restent fermés.
select set_config('request.jwt.claim.sub','ee930000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee930000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_autoriser_effet_externe('remise_abonnement')$$,
  '%Action réservée%', 'support : remise refusée'
);
select set_config('request.jwt.claim.sub','ee930000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"ee930000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_autoriser_effet_externe('remise_abonnement')$$,
  '%réservé à la plateforme%', 'UID inactif : effet externe refusé'
);
select set_config('request.jwt.claim.sub','ee930000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.email','metadata-write@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee930000-0000-4000-8000-000000000004","email":"metadata-write@invalid.local","role":"authenticated","aal":"aal2","user_metadata":{"plateforme_role":"total"},"app_metadata":{"plateforme_admin":true}}',true);
select throws_like(
  $$select public.plateforme_autoriser_effet_externe('remise_abonnement')$$,
  '%réservé à la plateforme%', 'email et métadonnées falsifiées : effet externe refusé'
);

reset role;

-- Inventaire automatique : aucune policy d'écriture ne s'appuie encore sur
-- est_plateforme_admin(), et les tables globales n'exposent aucun chemin anon.
select is(
  (select count(*)
   from pg_policies
   where schemaname='public'
     and cmd in ('INSERT','UPDATE','DELETE','ALL')
     and (coalesce(qual,'') like '%est_plateforme_admin%'
       or coalesce(with_check,'') like '%est_plateforme_admin%')),
  0::bigint,
  'inventaire policies : aucune écriture fondée uniquement sur est_plateforme_admin()'
);
select is(
  (select count(*)
   from pg_policies
   where schemaname='public'
     and tablename in ('boutique_produits','entreprise_feature_flags')
     and cmd in ('INSERT','UPDATE','DELETE','ALL')
     and roles && array['anon']::name[]),
  0::bigint,
  'surface globale : aucune policy d''écriture anon'
);
select ok(
  not has_table_privilege('anon','public.boutique_produits','INSERT')
    and not has_table_privilege('anon','public.boutique_produits','UPDATE')
    and not has_table_privilege('anon','public.boutique_produits','DELETE'),
  'surface globale : anon sans privilège DML boutique'
);
select ok(
  not has_function_privilege('anon','public.plateforme_ecriture_autorisee(text[])','EXECUTE'),
  'helper d''écriture non exposé à anon'
);
select ok(
  has_function_privilege('authenticated','public.plateforme_autoriser_effet_externe(text)','EXECUTE'),
  'garde d''effet externe disponible pour la Server Action authentifiée'
);
select ok(
  strpos(
    pg_get_functiondef('public.plateforme_autoriser_effet_externe(text)'::regprocedure),
    'plateforme_exiger_role'
  ) < strpos(
    pg_get_functiondef('public.plateforme_autoriser_effet_externe(text)'::regprocedure),
    'plateforme_exiger_session_aal2'
  ),
  'effet externe : rôle vérifié avant AAL2'
);

select * from finish();
rollback;
