begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

\ir fixtures/isolation_multitenant.inc

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','cc900000-0000-4000-8000-000000000001','authenticated','authenticated','support-pending@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','cc900000-0000-4000-8000-000000000002','authenticated','authenticated','support-owner@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','cc900000-0000-4000-8000-000000000003','authenticated','authenticated','support-imposteur@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','cc900000-0000-4000-8000-000000000004','authenticated','authenticated','support-inactif@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','cc900000-0000-4000-8000-000000000005','authenticated','authenticated','support-a-activer@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','cc900000-0000-4000-8000-000000000006','authenticated','authenticated','support-lecture@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into public.plateforme_admins(
  email,role,utilisateur_id,actif,statut_identite,activation_at
) values
  ('support-pending@invalid.local','total',null,false,'en_attente',null),
  ('support-owner@invalid.local','support','cc900000-0000-4000-8000-000000000002',true,'active',now()),
  ('support-inactif@invalid.local','support','cc900000-0000-4000-8000-000000000004',false,'revoquee',null),
  ('support-lecture@invalid.local','lecture','cc900000-0000-4000-8000-000000000006',true,'active',now())
on conflict(email) do nothing;

insert into public.acces_applications_entreprises(
  entreprise_id,application_code,autorise,source
) values
  ('a0000000-0000-0000-0000-000000000001','gestion_pro',true,'test-support-uid'),
  ('a0000000-0000-0000-0000-000000000001','colors',true,'test-support-uid')
on conflict(entreprise_id,application_code) do update set autorise=true;

insert into public.habilitations_applications_utilisateurs(
  entreprise_id,utilisateur_id,application_code,role_code
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'gestion_pro','gestion_pro_admin'
)
on conflict(entreprise_id,utilisateur_id,application_code) do update set autorise=true;

-- A. Même email, identité en attente sans UID : aucun droit ni fuite.
set local role authenticated;
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-pending@invalid.local',true);
select ok(not public.est_plateforme_admin(), '1. identité en attente : pas admin plateforme');
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','audit support pending')$$,
  '%non autorisé%', '2. le bon email seul ne permet pas une entrée support'
);
reset role;
select is(
  (select count(*) from public.plateforme_acces_entreprises where plateforme_user_id='cc900000-0000-4000-8000-000000000001'),
  0::bigint, '3. aucune session support créée pour l’identité en attente'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-pending@invalid.local',true);
select is(
  (select count(*) from public.acces_applications_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  0::bigint, '4. aucune lecture cross-tenant via le bon email'
);

-- B. L'email de la ligne admin ne compense jamais un UID différent.
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.email','support-owner@invalid.local',true);
select ok(not public.est_plateforme_admin(), '5. UID différent : pas admin malgré email usurpé');
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','audit mauvais uid')$$,
  '%non autorisé%', '6. UID différent : entrée support refusée'
);
reset role;
select is(
  (select count(*) from public.plateforme_acces_entreprises where plateforme_user_id='cc900000-0000-4000-8000-000000000003'),
  0::bigint, '7. UID différent : aucune session support'
);
set local role authenticated;

-- C. UID correct mais compte révoqué/inactif.
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.email','support-inactif@invalid.local',true);
select ok(not public.est_plateforme_admin(), '8. UID correct mais actif=false : refusé');
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','audit compte inactif')$$,
  '%non autorisé%', '9. compte inactif : entrée support refusée'
);

-- Un rôle plateforme actif mais non habilité au support reste refusé.
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claim.email','support-lecture@invalid.local',true);
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','audit role lecture')$$,
  '%non autorisé%', 'rôle lecture : entrée support refusée'
);

-- Une session non authentifiée et une entreprise inexistante sont refusées.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.email','',true);
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','audit sans session')$$,
  '%non autorisé%', 'session non authentifiée : entrée support refusée'
);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select throws_like(
  $$select public.plateforme_entrer_entreprise('ffffffff-ffff-4fff-8fff-ffffffffffff','audit entreprise absente')$$,
  '%introuvable%', 'entreprise inexistante : entrée support refusée'
);

-- F/G/H. Admin actif : aucun accès implicite, puis session ciblée, expirée et fermée.
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select ok(not public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), '10. admin actif sans session : aucun accès support implicite');
select lives_ok(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','support explicite test')$$,
  '11. admin total actif : ouverture explicite autorisée'
);
select ok(public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), '12. session valide : accès à l’entreprise ciblée');
select ok(not public.est_acces_support_actif('b0000000-0000-0000-0000-000000000001'), '13. session valide : aucune autre entreprise accessible');

reset role;
select is(
  (select plateforme_user_id::text from public.plateforme_acces_entreprises
   where plateforme_user_id='30000000-0000-0000-0000-000000000001' and termine_at is null),
  '30000000-0000-0000-0000-000000000001', '14. session journalisée avec l’UID réel'
);
update public.plateforme_acces_entreprises
set commence_at=now()-interval '2 hours',expire_at=now()-interval '1 hour'
where plateforme_user_id='30000000-0000-0000-0000-000000000001' and termine_at is null;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select ok(not public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), '15. session expirée : accès refusé');
select lives_ok($$select public.plateforme_quitter_entreprise()$$, '16. session expirée peut être fermée proprement');
select ok(not public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), '17. session fermée : accès refusé');

-- I. Un admin Gestion Pro sans habilitation Colors reste refusé.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select ok(
  not public.a_acces_application('a0000000-0000-0000-0000-000000000001','colors'),
  '18. admin Gestion Pro sans habilitation Colors : refusé'
);

-- J/K. UUID connus et écritures directes ne permettent aucun contournement.
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-b@invalid.local',true);
select is(
  (select count(*) from public.habilitations_applications_utilisateurs where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  0::bigint, '19. UUID connus : aucune habilitation étrangère visible'
);
select throws_ok(
  $$insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code)
    values('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','colors','colors_admin_organisation')$$,
  '42501',null,'20. self-grant direct refusé'
);

-- L/D/E/K. Cycle explicite : attente -> rattachement -> MFA -> activation par un tiers.
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select lives_ok(
  $$select public.plateforme_ajouter_admin('support-sans-compte@invalid.local','Support sans compte','support')$$,
  '21. ajout d’un administrateur non provisionné'
);
reset role;
select ok(
  exists(select 1 from public.plateforme_admins where email='support-sans-compte@invalid.local'
    and utilisateur_id is null and not actif and statut_identite='en_attente'),
  '22. nouvel administrateur : ligne en attente et inactive'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select lives_ok(
  $$select public.plateforme_ajouter_admin('support-a-activer@invalid.local','Support à activer','support')$$,
  '23. ajout avec compte Auth existant sans rattachement automatique'
);
reset role;
select ok(
  exists(select 1 from public.plateforme_admins where email='support-a-activer@invalid.local'
    and utilisateur_id is null and not actif and statut_identite='en_attente'),
  '24. la correspondance email avec Auth reste en attente et sans droit'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.email','support-a-activer@invalid.local',true);
select ok(not public.est_plateforme_admin(), '25. ligne en attente : aucun droit');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select throws_like(
  $$select public.plateforme_rattacher_admin('support-a-activer@invalid.local','30000000-0000-0000-0000-000000000001')$$,
  '%Auto-rattachement interdit%', '26. auto-rattachement refusé'
);
select lives_ok(
  $$select public.plateforme_rattacher_admin('support-a-activer@invalid.local','cc900000-0000-4000-8000-000000000005')$$,
  '27. rattachement explicite à un autre UID vérifié'
);
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.email','support-a-activer@invalid.local',true);
select ok(not public.est_plateforme_admin(), '28. UID rattaché mais non confirmé : aucun droit');
select throws_like(
  $$select public.plateforme_activer_admin('support-a-activer@invalid.local')$$,
  '%réservé à la plateforme%', 'identité rattachée inactive : auto-activation refusée'
);

reset role;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values('cc900000-0000-4000-8000-000000000099','cc900000-0000-4000-8000-000000000005','totp','verified',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select lives_ok(
  $$select public.plateforme_activer_admin('support-a-activer@invalid.local')$$,
  '29. activation explicite par un autre administrateur total après MFA'
);
select set_config('request.jwt.claim.sub','cc900000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.email','support-a-activer@invalid.local',true);
select ok(public.est_plateforme_admin(), '30. UID actif et explicitement confirmé : accès selon rôle');

-- M. Un retrait/désactivation sans effet ne crée jamais une fausse trace.
reset role;
select is(
  (select count(*) from public.historique_acces_applications),
  0::bigint, '31. historique multi-app initialement vide dans ce scénario'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select throws_like(
  $$select public.plateforme_desactiver_application_entreprise('b0000000-0000-0000-0000-000000000001','colors')$$,
  '%Aucun accès actif%', '32. désactivation inexistante refusée sans journalisation'
);
select throws_like(
  $$select public.plateforme_retirer_habilitation_application('20000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','colors')$$,
  '%Aucune habilitation active%', '33. retrait inexistant refusé sans journalisation'
);

reset role;
select is(
  (select count(*) from public.historique_acces_applications),
  0::bigint, '34. les deux opérations sans effet n’ont créé aucune fausse trace'
);
select * from finish();
rollback;
