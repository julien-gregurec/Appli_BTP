begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
\ir fixtures/isolation_multitenant.inc

insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut)
values('10000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','actif') on conflict(utilisateur_id,entreprise_id) do update set statut='actif';
update public.utilisateurs set entreprise_active_id='a0000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000002';
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
 ('a0000000-0000-0000-0000-000000000001','tools',true,'r10-test'),('b0000000-0000-0000-0000-000000000001','tools',true,'r10-test')
on conflict(entreprise_id,application_code) do update set autorise=true;
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,autorise) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','tools','tools_pro',true),
 ('b0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','tools','tools_pro',true)
on conflict(entreprise_id,utilisateur_id,application_code) do update set autorise=true;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.tools_lister_entreprises_autorisees()),2::bigint,'seules les deux entreprises Tools autorisées sont listées');
select is((select entreprise_nom from public.tools_lister_entreprises_autorisees() where est_courante),'Entreprise Isolation A','entreprise active visible');
select lives_ok($$select public.tools_changer_entreprise_active('b0000000-0000-0000-0000-000000000001')$$,'changement entreprise sans déconnexion');
select is((select entreprise_active_id::text from public.utilisateurs where id=auth.uid()),'b0000000-0000-0000-0000-000000000001','entreprise active enregistrée');
select throws_like($$select public.tools_changer_entreprise_active('00000000-0000-0000-0000-000000000099')$$,'%non autorisée%','entreprise étrangère refusée');
select is(public.tools_resoudre_entitlements_entreprise('a0000000-0000-0000-0000-000000000001')->>'tier','free','entitlement absent reste Free dans A');

-- CLOSURE V1 : l'accès applicatif d'entreprise (habilitation + acces_applications_entreprises)
-- ne suffit plus. Sans entitlement personnel Pro ('saved-projects'), le cloud-sync doit
-- être refusé même si l'entreprise a Tools activé et l'utilisateur y est habilité.
select throws_like(
  $$select public.tools_sync_project_entreprise('a0000000-0000-0000-0000-000000000001','{"id":"aaaaaaaa-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Projet A","createdAt":"2026-08-31T08:00:00Z","updatedAt":"2026-08-31T08:00:00Z","inputParameters":{},"options":{}}',0,'web')$$,
  '%Pro%', 'membre Free d''une entreprise Tools active : écriture cloud refusée (RPC)'
);
select is((select count(*) from public.tools_projects),0::bigint,'aucun projet créé par le membre Free');
select throws_ok(
  $$insert into public.tools_projects(user_id,organization_id,local_id,schema_version,tool_id,name,input_parameters,project_payload,created_at,updated_at)
    values('10000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111',1,'fleur-6','Contournement RLS','{}','{}',now(),now())$$,
  '42501', null, 'membre Free d''une entreprise Tools active : écriture cloud refusée (RLS directe, pas seulement un garde RPC)'
);

-- Octroi Pro personnel (AAL2, admin plateforme) : seul cet octroi doit débloquer le cloud-sync.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_attribuer_entitlement_utilisateur(
    '10000000-0000-0000-0000-000000000002','tools','pro',array['saved-projects'],'internal')$$,
  'l''administrateur plateforme attribue Tools Pro personnel'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is(public.tools_resoudre_entitlements_entreprise('a0000000-0000-0000-0000-000000000001')->>'tier','pro','entitlement personnel Pro désormais résolu dans A');
select is(public.tools_sync_project_entreprise('a0000000-0000-0000-0000-000000000001','{"id":"aaaaaaaa-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Projet A","createdAt":"2026-08-31T08:00:00Z","updatedAt":"2026-08-31T08:00:00Z","inputParameters":{},"options":{}}',0,'web')->>'status','applied','écriture A autorisée une fois Pro personnel détenu');
select is(public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"aaaaaaaa-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Projet B","createdAt":"2026-08-31T08:00:00Z","updatedAt":"2026-08-31T08:00:00Z","inputParameters":{},"options":{}}',0,'android')->>'status','applied','même identifiant isolé dans B');
select is((select count(*) from public.tools_projects),2::bigint,'les deux projets existent sans collision');
select is((select count(*) from public.tools_projects where organization_id='a0000000-0000-0000-0000-000000000001'),1::bigint,'filtre A exact');
select is((select project_payload->>'name' from public.tools_projects where organization_id='b0000000-0000-0000-0000-000000000001'),'Projet B','aucune fuite du contenu A vers B');
select lives_ok($$select public.tools_demander_suppression_compte()$$,'suppression de compte initiable dans Tools');
select is((select count(*) from public.tools_demandes_suppression_compte where utilisateur_id=auth.uid()),1::bigint,'demande de suppression rattachée au compte exact');
select is(public.tools_demander_suppression_compte(),(select id from public.tools_demandes_suppression_compte where utilisateur_id=auth.uid()),'demande répétée idempotente');

reset role;
update public.habilitations_applications_utilisateurs set autorise=false where entreprise_id='b0000000-0000-0000-0000-000000000001' and utilisateur_id='10000000-0000-0000-0000-000000000002' and application_code='tools';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.tools_lister_entreprises_autorisees()),1::bigint,'révocation retire immédiatement B du sélecteur');
select is(public.tools_resoudre_entitlements_entreprise('b0000000-0000-0000-0000-000000000001')->>'tier','free','aucun entitlement ne fuit après révocation');
select throws_like($$select public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"bbbbbbbb-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Bloqué","createdAt":"2026-08-31T09:00:00Z","updatedAt":"2026-08-31T09:00:00Z","inputParameters":{},"options":{}}',0,'android')$$,'%non autorisée%','révocation bloque toute nouvelle écriture');

reset role;
select * from finish();
rollback;
