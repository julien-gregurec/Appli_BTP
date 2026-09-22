-- ELSATIA TOOLS ENTITLEMENT & CLOUD-SYNC SECURITY CLOSURE V1
--
-- Couvre la matrice de qualification demandée : Free/Pro personnel, membre
-- d'entreprise Free/Pro, entitlement expiré, entitlement suspendu (révoqué),
-- membre d'entreprise inactif, cross-tenant, et accès légitime service_role.
--
-- Avant ce correctif, `tools_sync_project_entreprise()` et les policies RLS de
-- `tools_projects` ne vérifiaient que `a_acces_application(entreprise_id,'tools')`
-- (accès applicatif de l'entreprise + habilitation interne à l'app — RIEN à voir
-- avec un paiement personnel). `elsatia_tools_r10.test.sql` le prouvait sans le
-- vouloir : un utilisateur Free pouvait écrire dans le cloud d'une entreprise
-- Tools active. Ce fichier qualifie la fermeture : `tools_a_droit_cloud_sync()`
-- exige désormais aussi la capability personnelle 'saved-projects'.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
\ir fixtures/isolation_multitenant.inc

-- Entreprise C : troisième tenant, dédié au test cross-tenant (H), pour ne pas
-- dépendre de la mutation d'état de A/B utilisée par les autres scénarios.
insert into public.entreprises (id, nom, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001', 'Entreprise Isolation C', 'ISOC0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Administrateur C')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('20000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'actif')
on conflict do nothing;

-- Tools activé pour A, B et C ; tous les membres testés y sont habilités
-- (dimension "accès applicatif d'entreprise" — jamais celle en cause ici).
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
 ('a0000000-0000-0000-0000-000000000001','tools',true,'closure-test'),
 ('b0000000-0000-0000-0000-000000000001','tools',true,'closure-test'),
 ('c0000000-0000-0000-0000-000000000001','tools',true,'closure-test')
on conflict(entreprise_id,application_code) do update set autorise=true;
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,autorise) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','tools','tools_pro',true),
 ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','tools','tools_pro',true),
 ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','tools','tools_pro',true),
 ('c0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','tools','tools_pro',true)
on conflict(entreprise_id,utilisateur_id,application_code) do update set autorise=true;

-- ── A/B : compte "personnel" (entreprise à un seul membre actif), Free puis Pro ──
update public.utilisateurs set entreprise_active_id='a0000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select throws_like(
  $$select public.tools_sync_project_entreprise('a0000000-0000-0000-0000-000000000001','{"id":"a1111111-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Perso Free","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')$$,
  '%Pro%', 'A. utilisateur Free personnel : cloud-sync refusé'
);

reset role;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,capabilities,source)
values('10000000-0000-0000-0000-000000000003','tools','pro',array['saved-projects'],'internal');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is(
  public.tools_sync_project_entreprise('a0000000-0000-0000-0000-000000000001','{"id":"a1111111-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Perso Pro","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')->>'status',
  'applied', 'B. utilisateur Pro personnel : cloud-sync autorisé'
);

-- ── C/D : membre d'une entreprise Tools active, Free puis Pro ──
update public.utilisateurs set entreprise_active_id='b0000000-0000-0000-0000-000000000001' where id='20000000-0000-0000-0000-000000000003';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select throws_like(
  $$select public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"b2222222-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Membre Free","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')$$,
  '%Pro%', 'C. membre Free d''une entreprise Tools active : cloud-sync refusé'
);
reset role;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,capabilities,source)
values('20000000-0000-0000-0000-000000000003','tools','pro',array['saved-projects'],'internal');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select is(
  public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"b2222222-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Membre Pro","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')->>'status',
  'applied', 'D. membre Pro d''une entreprise Tools active : cloud-sync autorisé'
);

-- ── E : entitlement Pro expiré (ancien Pro) ──
reset role;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,capabilities,source,valide_du,expire_le)
values('20000000-0000-0000-0000-000000000004','tools','pro',array['saved-projects'],'web',now()-interval '2 years',now()-interval '1 year');
update public.utilisateurs set entreprise_active_id='b0000000-0000-0000-0000-000000000001' where id='20000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select is(public.tools_resoudre_entitlements()->>'tier','free','E. un Pro expiré résout Free côté serveur');
select throws_like(
  $$select public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"e5555555-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Expiré","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')$$,
  '%Pro%', 'E. ancien Pro expiré : cloud-sync refusé'
);

-- ── F : entitlement suspendu / révoqué (downgrade pendant la session) ──
reset role;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,capabilities,source)
values('20000000-0000-0000-0000-000000000004','tools','pro',array['saved-projects'],'internal');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select is(
  public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"f6666666-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Avant suspension","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')->>'status',
  'applied', 'F0. Pro actif : première écriture acceptée avant suspension'
);
reset role;
update public.entitlements_utilisateurs_elsatia set revoked_at=now(), revoked_reason='suspension test'
where utilisateur_id='20000000-0000-0000-0000-000000000004' and source='internal';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select throws_like(
  $$select public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"f6666666-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Après suspension","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T09:00:00Z","inputParameters":{},"options":{}}',1,'web')$$,
  '%Pro%', 'F1. entitlement suspendu en cours de session : écriture suivante refusée (pas de cache)'
);
-- Vérifié hors RLS (service_role) : l'utilisateur rétrogradé lui-même ne doit plus
-- pouvoir lire ce projet (même garde que l'écriture, cf. RLS lecture) — ce n'est
-- pas ce qu'on teste ici, seulement que la tentative refusée n'a rien corrompu.
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is((select project_payload->>'name' from public.tools_projects where local_id='f6666666-1111-1111-1111-111111111111'),'Avant suspension','F2. la version cloud écrite avant suspension n''est pas altérée par la tentative refusée');

-- ── G : membre d'entreprise inactif (Pro personnel + entreprise Tools active, mais statut non actif) ──
reset role;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,capabilities,source)
values('20000000-0000-0000-0000-000000000005','tools','pro',array['saved-projects'],'internal');
update public.utilisateurs_entreprises set statut='desactive' where utilisateur_id='20000000-0000-0000-0000-000000000005' and entreprise_id='c0000000-0000-0000-0000-000000000001';
update public.utilisateurs set entreprise_active_id='c0000000-0000-0000-0000-000000000001' where id='20000000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
select throws_like(
  $$select public.tools_sync_project_entreprise('c0000000-0000-0000-0000-000000000001','{"id":"g7777777-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Membre inactif","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')$$,
  '%non autorisée%', 'G. membre d''entreprise inactif, malgré un Pro personnel : cloud-sync refusé'
);

reset role;
update public.utilisateurs_entreprises set statut='actif' where utilisateur_id='20000000-0000-0000-0000-000000000005' and entreprise_id='c0000000-0000-0000-0000-000000000001';

-- ── H : cross-tenant — Pro personnel dans A, tente d'écrire/lire dans B et C dont il n'est pas membre ──
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select throws_like(
  $$select public.tools_sync_project_entreprise('b0000000-0000-0000-0000-000000000001','{"id":"h8888888-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"fleur-6","name":"Forgé","createdAt":"2026-09-22T08:00:00Z","updatedAt":"2026-09-22T08:00:00Z","inputParameters":{},"options":{}}',0,'web')$$,
  '%non autorisée%', 'H1. Pro dans A, entreprise B forgée : cloud-sync refusé (non-membre)'
);
select throws_ok(
  $$insert into public.tools_projects(user_id,organization_id,local_id,schema_version,tool_id,name,input_parameters,project_payload,created_at,updated_at)
    values('10000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000001','h9999999-1111-1111-1111-111111111111',1,'fleur-6','Forgé RLS','{}','{}',now(),now())$$,
  '42501', null, 'H2. organization_id forgé vers C (non-membre) : RLS refuse l''insertion directe'
);
select is((select count(*) from public.tools_projects where organization_id in ('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001') and user_id='10000000-0000-0000-0000-000000000003'),0::bigint,'H3. aucune ligne cross-tenant créée par l''utilisateur de A');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.tools_projects where local_id='f6666666-1111-1111-1111-111111111111'),0::bigint,'H4. un membre de B ne lit aucun projet appartenant à un autre utilisateur de B (isolation par ligne)');

-- ── service_role légitime : accès direct hors RLS pour la maintenance/le support ──
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(
  $$select count(*) from public.tools_projects$$,
  'I. service_role lit l''intégralité de tools_projects sans filtre RLS (support/diagnostic légitime)'
);
select lives_ok(
  $$update public.tools_projects set archived=true where local_id='f6666666-1111-1111-1111-111111111111'$$,
  'I. service_role peut opérer une maintenance directe (ex. archivage RGPD) sans détenir d''entitlement personnel'
);

reset role;
select * from finish();
rollback;
