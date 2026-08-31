begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\ir fixtures/isolation_multitenant.inc

-- Depuis R10, le cloud Tools est obligatoirement rattaché à une entreprise autorisée.
update public.utilisateurs set entreprise_active_id='a0000000-0000-0000-0000-000000000001' where id::text like '10000000-%';
update public.utilisateurs set entreprise_active_id='b0000000-0000-0000-0000-000000000001' where id::text like '20000000-%';
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
 ('a0000000-0000-0000-0000-000000000001','tools',true,'test'),
 ('b0000000-0000-0000-0000-000000000001','tools',true,'test') on conflict(entreprise_id,application_code) do update set autorise=true;
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,autorise)
select ue.entreprise_id,ue.utilisateur_id,'tools','tools_pro',true from public.utilisateurs_entreprises ue
on conflict(entreprise_id,utilisateur_id,application_code) do update set autorise=true,role_code='tools_pro';

select is((select nom from public.applications_elsatia where code = 'tools'), 'ELSATIA Tools', 'Tools est enregistré dans le catalogue commun');
select is((select application_code from public.roles_applications_elsatia where code = 'tools_pro'), 'tools', 'le rôle Tools Pro appartient au catalogue commun');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'free', 'sans droit serveur, Tools reste Free');
select is((public.tools_resoudre_entitlements()->>'grace_seconds')::integer, 604800, 'la grâce offline annoncée vaut sept jours');
select throws_ok(
  $$insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,source)
    values('10000000-0000-0000-0000-000000000002','tools','pro','internal')$$,
  '42501', null, 'un utilisateur ne peut pas s''auto-attribuer Pro'
);
select throws_like(
  $$select public.plateforme_attribuer_entitlement_utilisateur(
    '10000000-0000-0000-0000-000000000002','tools','pro',array['saved-projects'],'internal')$$,
  '%réservé à la plateforme%', 'un utilisateur normal ne peut pas appeler le RPC administrateur'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.plateforme_attribuer_entitlement_utilisateur(
    '10000000-0000-0000-0000-000000000002','tools','pro',
    array['saved-projects','export-pdf'],'internal',100)$$,
  'l''administrateur plateforme peut attribuer Tools Pro sans email hardcodé'
);
select throws_like(
  $$select public.plateforme_attribuer_entitlement_utilisateur(
    '10000000-0000-0000-0000-000000000002','tools','pro',array['capability-inventee'],'internal')$$,
  '%invalides%', 'une capability inconnue est refusée côté serveur'
);
select is((select count(*) from public.historique_entitlements_elsatia where action = 'granted'), 1::bigint, 'l''attribution est auditée');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'pro', 'un entitlement interne actif résout Pro');
select is(public.tools_resoudre_entitlements()->>'source', 'internal', 'la source interne est retenue');
select ok((public.tools_resoudre_entitlements()->'capabilities') ? 'export-pdf', 'les capabilities serveur sont exposées');

-- La source Web expire mais la source interne reste active : Pro doit rester actif.
reset role;
insert into public.entitlements_utilisateurs_elsatia(
  utilisateur_id,application_code,niveau,capabilities,source,expire_le
) values (
  '10000000-0000-0000-0000-000000000002','tools','pro',array['export-svg'],'web',now() + interval '1 minute'
);
update public.entitlements_utilisateurs_elsatia set expire_le = now() - interval '1 second', valide_du = now() - interval '1 day'
where utilisateur_id = '10000000-0000-0000-0000-000000000002' and source = 'web';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'pro', 'l''expiration d''une source ne retire pas une autre source Pro valide');

-- Projet initial utilisateur A puis vérification de l'isolation utilisateur B.
select is(
  public.tools_sync_project(
    '{"id":"11111111-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"escalier-droit","name":"Projet A","createdAt":"2026-08-30T08:00:00Z","updatedAt":"2026-08-30T08:00:00Z","inputParameters":{},"options":{},"archived":false}'::jsonb,
    0,'web-a'
  )->>'status', 'applied', 'un utilisateur peut pousser son projet'
);
select is((select revision from public.tools_projects where local_id = '11111111-1111-1111-1111-111111111111'), 1::bigint, 'la première révision vaut 1');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.tools_projects), 0::bigint, 'l''utilisateur B ne lit aucun projet de A');
select is((select count(*) from public.entitlements_utilisateurs_elsatia), 0::bigint, 'l''utilisateur B ne lit aucun droit de A');
select throws_ok(
  $$insert into public.tools_projects(user_id,local_id,schema_version,tool_id,name,input_parameters,project_payload,created_at,updated_at)
    values('10000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',1,'escalier-droit','Usurpé','{}','{}',now(),now())$$,
  '42501', null, 'l''utilisateur B ne peut pas usurper user_id lors d''une insertion'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  public.tools_sync_project(
    '{"id":"11111111-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"escalier-droit","name":"Projet A web","createdAt":"2026-08-30T08:00:00Z","updatedAt":"2026-08-30T09:00:00Z","inputParameters":{},"options":{},"archived":false}'::jsonb,
    1,'web-a'
  )->>'status', 'applied', 'la révision attendue permet une mise à jour'
);
select is(
  public.tools_sync_project(
    '{"id":"11111111-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"escalier-droit","name":"Projet A mobile","createdAt":"2026-08-30T08:00:00Z","updatedAt":"2026-08-30T09:01:00Z","inputParameters":{},"options":{},"archived":false}'::jsonb,
    1,'android-a'
  )->>'status', 'conflict', 'une révision périmée produit un conflit explicite'
);
select is((select project_payload->>'name' from public.tools_projects where local_id = '11111111-1111-1111-1111-111111111111'), 'Projet A web', 'le conflit n''écrase pas la version cloud');
select is(
  public.tools_sync_project(
    '{"id":"11111111-1111-1111-1111-111111111111","schemaVersion":1,"toolId":"escalier-droit","name":"Projet A web","createdAt":"2026-08-30T08:00:00Z","updatedAt":"2026-08-30T09:02:00Z","inputParameters":{},"options":{},"archived":false,"deletedAt":"2026-08-30T09:02:00Z"}'::jsonb,
    2,'web-a'
  )->>'status', 'applied', 'la suppression est synchronisée comme tombstone'
);
select ok((select deleted_at is not null from public.tools_projects where local_id = '11111111-1111-1111-1111-111111111111'), 'le tombstone empêche la réapparition du projet');
select throws_like(
  $$select public.tools_sync_project('{"schemaVersion":1}'::jsonb,0,'web')$$,
  '%invalide%', 'un payload projet malveillant ou incomplet est refusé'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.plateforme_revoquer_entitlement_utilisateur(
    (select id from public.entitlements_utilisateurs_elsatia where utilisateur_id='10000000-0000-0000-0000-000000000002' and source='internal'),
    'fin test')$$,
  'l''administrateur plateforme peut révoquer le droit'
);
select is((select count(*) from public.historique_entitlements_elsatia where action = 'revoked'), 1::bigint, 'la révocation est auditée');

reset role;
select * from finish();
rollback;
