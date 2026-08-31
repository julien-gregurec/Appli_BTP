begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
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
select is(public.tools_sync_project_entreprise('a0000000-0000-0000-0000-000000000001','{"id":"aaaaaaaa-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Projet A","createdAt":"2026-08-31T08:00:00Z","updatedAt":"2026-08-31T08:00:00Z","inputParameters":{},"options":{}}',0,'web')->>'status','applied','écriture A autorisée');
select is(public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"aaaaaaaa-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Projet B","createdAt":"2026-08-31T08:00:00Z","updatedAt":"2026-08-31T08:00:00Z","inputParameters":{},"options":{}}',0,'android')->>'status','applied','même identifiant isolé dans B');
select is((select count(*) from public.tools_projects),2::bigint,'les deux projets existent sans collision');
select is((select count(*) from public.tools_projects where organization_id='a0000000-0000-0000-0000-000000000001'),1::bigint,'filtre A exact');
select is((select project_payload->>'name' from public.tools_projects where organization_id='b0000000-0000-0000-0000-000000000001'),'Projet B','aucune fuite du contenu A vers B');
select is(public.tools_resoudre_entitlements_entreprise('a0000000-0000-0000-0000-000000000001')->>'tier','free','entitlement absent reste Free dans A');
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
