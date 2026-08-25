begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir fixtures/isolation_multitenant.inc

-- Entreprise A : autorisée gestion_pro + colors. Entreprise B : gestion_pro seulement.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'gestion_pro', true, 'test'),
  ('a0000000-0000-0000-0000-000000000001', 'colors', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001', 'gestion_pro', true, 'test');

-- admin-a : gestion_pro_admin uniquement (pas Colors). ouvrier-a : gestion_pro_utilisateur + colors_consultation.
-- admin-b : gestion_pro_admin uniquement (entreprise B n'a de toute façon pas Colors).
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'gestion_pro', 'gestion_pro_admin'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'gestion_pro', 'gestion_pro_utilisateur'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'colors', 'colors_consultation'),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'gestion_pro', 'gestion_pro_admin');

-- Application future ajoutée après coup (simule un ajout ultérieur au catalogue).
insert into public.applications_elsatia (code, nom) values ('demo_future_app', 'Demo Future App');

set local role authenticated;

-- 1-2. Utilisateur habilité / rôle Colors réel.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(
  public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'gestion_pro'),
  'ouvrier A habilité gestion_pro : accès accordé'
);
select is(
  (select role_code from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'colors'),
  'colors_consultation', 'rôle Colors réel retourné (pas un générique admin/utilisateur)'
);

-- 3. Entreprise autorisée mais utilisateur non habilité (admin-a n'a pas d'habilitation Colors).
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select ok(
  not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'),
  'entreprise A autorisée Colors mais admin A non habilité : accès refusé'
);
select ok(
  public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'gestion_pro'),
  'admin A habilité gestion_pro : accès accordé'
);

-- 4. Admin Gestion Pro sans Colors est refusé (même utilisateur que ci-dessus, reformulé explicitement).
select ok(
  not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'),
  'admin Gestion Pro sans habilitation Colors est refusé'
);

-- 5. Entreprise non autorisée (B n'a pas Colors du tout).
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select ok(
  not public.a_acces_application('b0000000-0000-0000-0000-000000000001', 'colors'),
  'entreprise B non autorisée Colors : accès refusé quel que soit l''utilisateur'
);

-- 6-7. Cross-tenant : admin B ne voit rien de l'entreprise A.
select is(
  (select count(*) from public.acces_applications_entreprises where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint, 'admin B ne voit aucun accès application de l''entreprise A'
);
select is(
  (select count(*) from public.habilitations_applications_utilisateurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint, 'admin B ne voit aucune habilitation de l''entreprise A'
);

-- 8. Self-grant impossible par écriture directe.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
-- SQLSTATE 42501 (insufficient_privilege) couvre à la fois un refus au niveau du GRANT
-- ("permission denied") et un refus RLS ("new row violates row-level security policy") :
-- le message exact varie selon que le rôle authenticated a ou non un GRANT INSERT de base
-- sur la table (différence observée entre l'environnement local et Preview), mais dans les
-- deux cas l'écriture est refusée — c'est la seule garantie qui compte ici.
select throws_ok(
  $$insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code)
    values('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','colors','colors_admin_organisation')$$,
  '42501', null, 'ouvrier A ne peut pas s''auto-attribuer un rôle Colors supérieur par écriture directe'
);

-- 9. FK anti-habilitation dans une organisation étrangère (admin B n'est pas membre de l'entreprise A).
reset role;
select throws_like(
  $$insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code)
    values('a0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','gestion_pro','gestion_pro_admin')$$,
  '%foreign key%', 'la clé composite interdit une habilitation dans une organisation où l''utilisateur n''est pas membre'
);

-- 10. Admin plateforme : accès automatique, y compris à une application future, sans ligne d'habilitation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select ok(
  public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'),
  'admin plateforme accède à Colors sans ligne d''habilitation'
);
select ok(
  (select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'demo_future_app') = 1,
  'admin plateforme voit automatiquement une application ajoutée après coup au catalogue'
);

-- 11. Application inactive : refusée même avec des lignes autorise=true des deux côtés.
reset role;
update public.applications_elsatia set actif = false where code = 'demo_future_app';
insert into public.roles_applications_elsatia(application_code, code, nom) values ('demo_future_app', 'demo_role', 'Rôle démo');
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', 'demo_future_app', true);
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'demo_future_app', 'demo_role');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(
  not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'demo_future_app'),
  'application désactivée au catalogue : accès refusé malgré autorise=true des deux côtés'
);

-- 12-13. Validité temporelle entreprise (accès expiré / futur / sans date de fin).
reset role;
insert into public.applications_elsatia(code, nom) values ('temp_app_a', 'Temp App A'), ('temp_app_b', 'Temp App B'), ('temp_app_c', 'Temp App C');
insert into public.roles_applications_elsatia(application_code, code, nom) values
  ('temp_app_a', 'role_test', 'Rôle'), ('temp_app_b', 'role_test', 'Rôle'), ('temp_app_c', 'role_test', 'Rôle');
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, valide_jusqu_au) values
  ('a0000000-0000-0000-0000-000000000001', 'temp_app_a', true, now() - interval '1 day'); -- expiré
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, valide_du) values
  ('a0000000-0000-0000-0000-000000000001', 'temp_app_b', true, now() + interval '1 day'); -- futur
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', 'temp_app_c', true); -- sans date de fin, actif immédiatement
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'temp_app_a', 'role_test'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'temp_app_b', 'role_test'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'temp_app_c', 'role_test');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','temp_app_a'), 'fenêtre entreprise expirée : accès refusé');
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','temp_app_b'), 'fenêtre entreprise future (pas encore commencée) : accès refusé');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','temp_app_c'), 'fenêtre entreprise sans date de fin, déjà commencée : accès accordé');

-- 14. Validité temporelle utilisateur (entreprise valide en permanence, fenêtre utilisateur qui varie).
reset role;
insert into public.applications_elsatia(code, nom) values ('temp_user_app', 'Temp User App');
insert into public.roles_applications_elsatia(application_code, code, nom) values ('temp_user_app', 'role_test', 'Rôle');
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', 'temp_user_app', true);
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, valide_jusqu_au) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'temp_user_app', 'role_test', now() - interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','temp_user_app'), 'fenêtre utilisateur expirée : accès refusé malgré entreprise valide en permanence');

-- 15-16. Cycle RPC admin : activer → habiliter → vérifier → retirer → désactiver → vérifier, avec audit.
reset role;
insert into public.applications_elsatia(code, nom) values ('cycle_app', 'Cycle App');
insert into public.roles_applications_elsatia(application_code, code, nom) values ('cycle_app', 'role_test', 'Rôle');
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select lives_ok(
  $$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','cycle_app')$$,
  'admin plateforme peut activer une application pour une entreprise'
);
select lives_ok(
  $$select public.plateforme_habiliter_utilisateur_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','cycle_app','role_test')$$,
  'admin plateforme peut habiliter un utilisateur'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','cycle_app'), 'accès accordé après le cycle activer+habiliter');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select lives_ok(
  $$select public.plateforme_retirer_habilitation_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','cycle_app')$$,
  'admin plateforme peut retirer une habilitation'
);
select lives_ok(
  $$select public.plateforme_desactiver_application_entreprise('a0000000-0000-0000-0000-000000000001','cycle_app')$$,
  'admin plateforme peut désactiver une application pour une entreprise'
);
select is(
  (select count(*) from public.historique_acces_applications where application_code = 'cycle_app'),
  4::bigint, 'les 4 actions du cycle sont journalisées (activation, habilitation, retrait, désactivation)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','cycle_app'), 'accès refusé après retrait + désactivation, en auto-consultation');

-- 17. Un admin d'entreprise (pas admin plateforme) ne peut pas activer d'application lui-même.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors')$$,
  '%réservé à la plateforme%', 'un admin d''entreprise ne peut pas activer une application (réservé à l''admin plateforme)'
);

-- 18. Sécurité tiers : a_acces_application/applications_autorisees n'acceptent aucun utilisateur_id
-- arbitraire (elles n'ont pas ce paramètre) — vérifié structurellement par la signature.
select function_returns('public','a_acces_application',array['uuid','text'],'boolean','a_acces_application ne prend pas d''utilisateur_id cible : impossible de sonder un tiers');
select function_returns('public','applications_autorisees',array['uuid'],'setof record','applications_autorisees ne prend pas d''utilisateur_id cible : impossible de sonder un tiers');

reset role;
select * from finish();
rollback;
