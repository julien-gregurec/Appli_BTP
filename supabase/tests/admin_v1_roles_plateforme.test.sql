begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

\ir fixtures/isolation_multitenant.inc

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','31000000-0000-0000-0000-000000000001','authenticated','authenticated','lecture@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','31000000-0000-0000-0000-000000000002','authenticated','authenticated','support@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','31000000-0000-0000-0000-000000000003','authenticated','authenticated','facturation@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','31000000-0000-0000-0000-000000000004','authenticated','authenticated','total@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into public.utilisateurs(id,prenom,nom) values
  ('31000000-0000-0000-0000-000000000001','Test','Lecture'),
  ('31000000-0000-0000-0000-000000000002','Test','Support'),
  ('31000000-0000-0000-0000-000000000003','Test','Facturation'),
  ('31000000-0000-0000-0000-000000000004','Test','Total')
on conflict(id) do nothing;

insert into public.plateforme_admins(email,utilisateur_id,role,nom,actif) values
  ('lecture@invalid.local','31000000-0000-0000-0000-000000000001','lecture','Test Lecture',true),
  ('support@invalid.local','31000000-0000-0000-0000-000000000002','support','Test Support',true),
  ('facturation@invalid.local','31000000-0000-0000-0000-000000000003','facturation','Test Facturation',true),
  ('total@invalid.local','31000000-0000-0000-0000-000000000004','total','Test Total',true)
on conflict(email) do update set utilisateur_id=excluded.utilisateur_id,role=excluded.role,actif=true;

insert into public.plans_abonnement(
  code,version,nom,prix_mensuel_ht,prix_annuel_ht,utilisateurs_inclus,
  operations_ia_incluses,stockage_go_inclus,actif,valide_du,valide_au
) values(
  'mini',999999,'ADMIN_V1_INACTIVE_TEST',1,12,1,0,1,false,current_date-2,current_date-1
) on conflict(code,version) do update set nom=excluded.nom,actif=false;

set local role authenticated;

-- Un administrateur tenant reste un tenant, même avec une metadata forgée.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claim.platform_role','total',true);
select is(public.plateforme_role_courant(),null,'une claim injectée ne crée pas de rôle plateforme');
select is(public.est_plateforme_admin(),false,'un administrateur tenant n’est pas plateforme');
select throws_like(
  $$select public.plateforme_ajouter_admin('admin-a@invalid.local','Intrus','total')$$,
  '%Permission plateforme refusée%',
  'un administrateur tenant ne peut pas s’auto-promouvoir par RPC'
);
select throws_like(
  $$update public.plateforme_admins set role='total' where email='admin-a@invalid.local'$$,
  '%permission denied%',
  'la table source de vérité n’est pas modifiable par le client'
);
select is((select count(*) from public.clients where nom like 'TEST_B_%'),0::bigint,'le tenant A ne voit toujours aucun client B');

-- Lecture : synthèse et tarifs en lecture, aucune mutation.
select set_config('request.jwt.claim.sub','31000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','lecture@invalid.local',true);
select is(public.plateforme_role_courant(),'lecture','le rôle lecture vient de la table liée à auth.uid');
select ok(public.plateforme_a_permission('consulter_plateforme'),'lecture consulte la synthèse');
select ok(public.plateforme_a_permission('consulter_tarification'),'lecture consulte les tarifs');
select ok(not public.plateforme_a_permission('gerer_facturation'),'lecture ne gère pas la facturation');
select ok(not public.plateforme_a_permission('repondre_support'),'lecture ne répond pas au support');
select is((select count(*) from public.plans_abonnement where nom='ADMIN_V1_INACTIVE_TEST'),1::bigint,'lecture peut consulter une version tarifaire inactive');
select throws_like(
  $$select public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','actif',null,null)$$,
  '%Permission plateforme refusée%',
  'lecture ne modifie pas un abonnement via RPC'
);
select is((select count(*) from public.clients),0::bigint,'lecture ne voit aucune donnée métier tenant');

-- Support : messagerie et reset ciblé, mais ni finance ni entrée tenant.
select set_config('request.jwt.claim.sub','31000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.email','support@invalid.local',true);
select is(public.plateforme_role_courant(),'support','le rôle support est reconnu');
select ok(public.plateforme_a_permission('consulter_support'),'support consulte les fils support');
select ok(public.plateforme_a_permission('reinitialiser_compte'),'support peut déclencher le flux de reset ciblé');
select ok(not public.plateforme_a_permission('gerer_facturation'),'support ne gère pas la facturation');
select ok(not public.plateforme_a_permission('intervenir_tenant'),'support n’entre pas dans un tenant');
select is((select count(*) from public.plans_abonnement where nom='ADMIN_V1_INACTIVE_TEST'),0::bigint,'support ne voit pas le catalogue tarifaire inactif');
select throws_like(
  $$select * from public.plateforme_usage_entreprises()$$,
  '%Permission plateforme refusée%',
  'support ne lit pas les indicateurs de facturation historiques'
);
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','Test support interdit')$$,
  '%Permission plateforme refusée%',
  'le backend refuse l’entrée tenant au support'
);
select is((select count(*) from public.documents_chantier),0::bigint,'support ne voit aucun document tenant');
select is((select count(*) from public.notes_frais),0::bigint,'support ne voit aucune note de frais');

-- Facturation : données financières dédiées, aucun support ni donnée métier.
select set_config('request.jwt.claim.sub','31000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claim.email','facturation@invalid.local',true);
select is(public.plateforme_role_courant(),'facturation','le rôle facturation est reconnu');
select ok(public.plateforme_a_permission('consulter_facturation'),'facturation consulte les relevés');
select ok(public.plateforme_a_permission('gerer_facturation'),'facturation modifie les abonnements');
select ok(not public.plateforme_a_permission('gerer_tarification'),'facturation ne publie pas les tarifs');
select ok(not public.plateforme_a_permission('consulter_support'),'facturation ne lit pas le support');
select lives_ok(
  $$select * from public.plateforme_usage_entreprises()$$,
  'facturation peut consulter les indicateurs de facturation historiques'
);
select lives_ok(
  $$select public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','actif',null,'test ADMIN-V1')$$,
  'facturation peut modifier un abonnement via le backend prévu'
);
select is((select count(*) from public.clients),0::bigint,'facturation ne voit aucun client métier');

-- Total : toutes les permissions applicatives, avec accès tenant explicite journalisé.
select set_config('request.jwt.claim.sub','31000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claim.email','total@invalid.local',true);
select is(public.plateforme_role_courant(),'total','le rôle total est reconnu');
select ok(public.plateforme_a_permission('gerer_equipe'),'total gère les rôles plateforme');
select ok(public.plateforme_a_permission('gerer_tarification'),'total gère le catalogue tarifaire');
select ok(public.plateforme_a_permission('gerer_remises'),'total gère les remises');
select is((select count(*) from public.clients),0::bigint,'total ne voit aucune donnée tenant avant intervention');
select lives_ok(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','Test ADMIN-V1 explicite')$$,
  'total ouvre une session tenant explicite et journalisée'
);
select is((select count(*) from public.clients where nom like 'TEST_A_%'),3::bigint,'total voit le tenant A pendant la session explicite');
select is((select count(*) from public.clients where nom like 'TEST_B_%'),0::bigint,'la session total reste limitée au tenant choisi');
select throws_like(
  $$select public.plateforme_ajouter_admin('total@invalid.local','Test Total','lecture')$$,
  '%propre rôle%',
  'total ne peut pas dégrader ou modifier son propre rôle'
);

reset role;
select * from finish();
rollback;
