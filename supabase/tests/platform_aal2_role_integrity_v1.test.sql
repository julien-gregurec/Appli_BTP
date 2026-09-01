begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000001','authenticated','authenticated','second-total-aal2@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000002','authenticated','authenticated','support-aal2@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000003','authenticated','authenticated','facturation-aal2@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000004','authenticated','authenticated','lecture-aal2@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000005','authenticated','authenticated','cible-rattachement@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000006','authenticated','authenticated','cible-mfa@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000007','authenticated','authenticated','cible-sans-mfa@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000008','authenticated','authenticated','cible-revocation-aal1@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000009','authenticated','authenticated','email-seul-aal2@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
  ('ee900000-0000-4000-8000-000000000091','ee900000-0000-4000-8000-000000000005','totp','verified',now(),now()),
  ('ee900000-0000-4000-8000-000000000092','ee900000-0000-4000-8000-000000000006','totp','verified',now(),now());

insert into public.plateforme_admins(
  email,role,utilisateur_id,actif,statut_identite,activation_at
) values
  ('second-total-aal2@invalid.local','total','ee900000-0000-4000-8000-000000000001',true,'active',now()),
  ('support-aal2@invalid.local','support','ee900000-0000-4000-8000-000000000002',true,'active',now()),
  ('facturation-aal2@invalid.local','facturation','ee900000-0000-4000-8000-000000000003',true,'active',now()),
  ('lecture-aal2@invalid.local','lecture','ee900000-0000-4000-8000-000000000004',true,'active',now()),
  ('cible-rattachement@invalid.local','support',null,false,'en_attente',null),
  ('cible-mfa@invalid.local','support','ee900000-0000-4000-8000-000000000006',false,'rattachee_non_confirmee',null),
  ('cible-sans-mfa@invalid.local','support','ee900000-0000-4000-8000-000000000007',false,'rattachee_non_confirmee',null),
  ('cible-revocation-aal1@invalid.local','support','ee900000-0000-4000-8000-000000000008',true,'active',now()),
  ('email-seul-aal2@invalid.local','total',null,false,'en_attente',null);

-- A/D. Un total AAL1 ne peut effectuer aucune mutation sensible, même si la cible a un MFA.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_like(
  $$select public.plateforme_rattacher_admin('cible-rattachement@invalid.local','ee900000-0000-4000-8000-000000000005')$$,
  '%AAL2%', 'total AAL1 : rattachement refusé'
);
select throws_like(
  $$select public.plateforme_activer_admin('cible-mfa@invalid.local')$$,
  '%AAL2%', 'total AAL1 : activation refusée malgré le MFA de la cible'
);
select throws_like(
  $$select public.plateforme_retirer_admin('cible-revocation-aal1@invalid.local')$$,
  '%AAL2%', 'total AAL1 : révocation refusée'
);
select throws_like(
  $$select public.plateforme_modifier_role_admin('cible-revocation-aal1@invalid.local','lecture')$$,
  '%AAL2%', 'total AAL1 : modification de rôle refusée'
);
select throws_like(
  $$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors')$$,
  '%AAL2%', 'total AAL1 : mutation multi-app refusée'
);
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','support depuis aal1')$$,
  '%AAL2%', 'total AAL1 : ouverture support refusée'
);
select throws_like(
  $$select public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','actif',current_date,null)$$,
  '%AAL2%', 'total AAL1 : mutation abonnement refusée'
);

-- C. Une valeur client libre ne remplace jamais le claim JWT AAL2.
select set_config('app.aal_client','aal2',true);
select throws_like(
  $$select public.plateforme_ajouter_admin('parametre-client@invalid.local',null,'support')$$,
  '%AAL2%', 'paramètre client aal2 ignoré quand le JWT reste AAL1'
);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":42}',true);
select throws_like(
  $$select public.plateforme_ajouter_admin('claim-malforme@invalid.local',null,'support')$$,
  '%AAL2%', 'claim AAL mal formé : refus sûr'
);
select set_config('request.jwt.claims','{}',true);
select throws_like(
  $$select public.plateforme_ajouter_admin('claim-absent@invalid.local',null,'support')$$,
  '%AAL2%', 'claim AAL absent : refus sûr'
);

-- B/I. Même chemin auth.jwt(), simulé côté serveur avec AAL2 : opérations autorisées.
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_ajouter_admin('ajout-aal2@invalid.local','Ajout AAL2','support')$$,
  'total AAL2 : ajout en attente autorisé'
);
select lives_ok(
  $$select public.plateforme_rattacher_admin('cible-rattachement@invalid.local','ee900000-0000-4000-8000-000000000005')$$,
  'total AAL2 : rattachement autorisé'
);
select lives_ok(
  $$select public.plateforme_activer_admin('cible-mfa@invalid.local')$$,
  'total AAL2 : activation de la cible MFA autorisée'
);
reset role;
select ok(
  (select actif and statut_identite='active' from public.plateforme_admins where email='cible-mfa@invalid.local'),
  'cible activée uniquement après appel AAL2'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors',null,null,'test-aal2',null)$$,
  'total AAL2 : activation multi-app autorisée'
);
select is(
  (select auteur_utilisateur_id::text from public.historique_acces_applications
   where cible_id='a0000000-0000-0000-0000-000000000001' and application_code='colors'
   order by created_at desc limit 1),
  '30000000-0000-0000-0000-000000000001',
  'historique multi-app : UID réel de l’auteur AAL2'
);
select lives_ok(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','support total aal2')$$,
  'total AAL2 : ouverture support autorisée'
);
select ok(public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), 'session support AAL2 active sur la cible');
select lives_ok($$select public.plateforme_quitter_entreprise()$$, 'fermeture de sa propre session autorisée sans élévation supplémentaire');
select ok(not public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), 'session fermée : aucun accès résiduel');

-- E. L'AAL2 appelant ne remplace pas le MFA obligatoire de la cible.
select throws_like(
  $$select public.plateforme_activer_admin('cible-sans-mfa@invalid.local')$$,
  '%MFA du compte cible%', 'total AAL2 : cible sans MFA refusée'
);

-- F. Lecture : aucune mutation et aucun support.
select set_config('request.jwt.claim.sub','ee900000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.email','lecture-aal2@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000004","email":"lecture-aal2@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_like($$select public.plateforme_ajouter_admin('lecture-interdit@invalid.local',null,'support')$$,'%Action réservée%','lecture : gestion administrateur refusée');
select throws_like($$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors')$$,'%Action réservée%','lecture : mutation multi-app refusée');
select throws_like($$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','support lecture')$$,'%Action réservée%','lecture : support refusé');
select throws_like($$select * from public.plateforme_support_fils()$$,'%Action réservée%','lecture : fils support refusés');
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.email','',true);
select set_config('request.jwt.claims','{}',true);
update public.entreprises
set abonnement_statut='actif', impaye_signale_at=now()-interval '20 days',
    suspension_prevue_at=now()-interval '1 day'
where id='a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee900000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.email','lecture-aal2@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000004","email":"lecture-aal2@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select * from public.plateforme_entreprises()$$,'lecture : consultation plateforme autorisée');
reset role;
select is(
  (select abonnement_statut from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  'actif','lecture : la consultation ne déclenche aucune suspension'
);

-- G. Support : session AAL2 seulement, aucune administration ni mutation multi-app.
insert into public.support_messages(entreprise_id,cote,auteur_id,auteur_nom,contenu)
values(
  'a0000000-0000-0000-0000-000000000001','entreprise',
  '10000000-0000-0000-0000-000000000001','Admin A','Message support de test AAL2'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','ee900000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.email','support-aal2@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000002","email":"support-aal2@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','support role aal2')$$,'support AAL2 : ouverture ciblée autorisée');
select lives_ok($$select * from public.plateforme_support_fils()$$,'support AAL2 : catalogue des fils autorisé');
select lives_ok(
  $$select * from public.plateforme_support_messages('a0000000-0000-0000-0000-000000000001')$$,
  'support AAL2 : lecture du fil ciblé autorisée'
);
select lives_ok(
  $$select public.plateforme_verifier_et_journaliser_reinitialisation('a0000000-0000-0000-0000-000000000001','admin-a@invalid.local','Assistance autorisée')$$,
  'support AAL2 : réinitialisation journalisée dans la session ciblée'
);
select throws_like($$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors')$$,'%Action réservée%','support : mutation multi-app refusée');
select throws_like($$select public.plateforme_ajouter_admin('support-interdit@invalid.local',null,'support')$$,'%Action réservée%','support : gestion administrateur refusée');

-- H. Facturation : aucun support, entitlement ou administrateur.
select set_config('request.jwt.claim.sub','ee900000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.email','facturation-aal2@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000003","email":"facturation-aal2@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_like(
  $$select public.plateforme_signaler_impaye('a0000000-0000-0000-0000-000000000001','Test AAL1')$$,
  '%AAL2%','facturation AAL1 : mutation de facturation refusée'
);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000003","email":"facturation-aal2@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','actif',current_date,null)$$,
  'facturation AAL2 : fonction de facturation prévue autorisée'
);
select throws_like($$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors')$$,'%Action réservée%','facturation : mutation multi-app refusée');
select throws_like($$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','support facturation')$$,'%Action réservée%','facturation : support refusé');
select throws_like($$select public.plateforme_ajouter_admin('facturation-interdit@invalid.local',null,'support')$$,'%Action réservée%','facturation : gestion administrateur refusée');

-- J. L'UID et l'email d'une identité active sont structurellement immuables.
reset role;
select throws_like(
  $$update public.plateforme_admins set utilisateur_id='ee900000-0000-4000-8000-000000000009' where email='cible-mfa@invalid.local'$$,
  '%Révoquez puis détachez%', 'identité active : remplacement direct UID refusé'
);
select throws_like(
  $$update public.plateforme_admins set email='email-change@invalid.local' where email='cible-mfa@invalid.local'$$,
  '%immuable%', 'identité active : changement direct email refusé'
);

-- K. Cycle officiel complet : active -> révoquée -> détachée -> rattachée -> active.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_retirer_admin('cible-mfa@invalid.local')$$,'cycle : révocation autorisée');
reset role;
select ok((select not actif and statut_identite='revoquee' and revocation_at is not null and revocation_par=auth.uid() from public.plateforme_admins where email='cible-mfa@invalid.local'),'cycle : révocation tracée');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_detacher_admin_revoque('cible-mfa@invalid.local')$$,'cycle : détachement autorisé');
reset role;
select is((select utilisateur_id from public.plateforme_admins where email='cible-mfa@invalid.local'),null::uuid,'cycle : UID détaché');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_rattacher_admin('cible-mfa@invalid.local','ee900000-0000-4000-8000-000000000006')$$,'cycle : nouveau rattachement autorisé');
reset role;
select is((select statut_identite from public.plateforme_admins where email='cible-mfa@invalid.local'),'rattachee_non_confirmee','cycle : retour obligatoire par état non confirmé');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_activer_admin('cible-mfa@invalid.local')$$,'cycle : nouvelle activation AAL2 autorisée');
reset role;
select ok((select actif and statut_identite='active' from public.plateforme_admins where email='cible-mfa@invalid.local'),'cycle : identité de nouveau active');

-- L. Meilleure reproduction transactionnelle disponible : verrou commun + garde du dernier total.
select matches(
  pg_get_functiondef('public.plateforme_verrouiller_mutations_admin()'::regprocedure),
  'pg_advisory_xact_lock', 'mutations admin : verrou advisory transactionnel versionné'
);
select matches(
  pg_get_functiondef('public.plateforme_retirer_admin(text)'::regprocedure),
  'plateforme_verrouiller_mutations_admin', 'révocation : verrou commun acquis avant le recomptage'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_retirer_admin('second-total-aal2@invalid.local')$$,'première révocation total autorisée quand deux totaux sont actifs');
reset role;
select is((select count(*) from public.plateforme_admins where role='total' and actif and statut_identite='active'),1::bigint,'au moins un administrateur total reste actif');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_like($$select public.plateforme_retirer_admin('plateforme@invalid.local')$$,'%propre compte%','dernier total : auto-révocation refusée');

-- M. État révoqué : date et origine/auteur cohérents obligatoires.
reset role;
select throws_ok(
  $$insert into public.plateforme_admins(email,role,actif,statut_identite) values('revoque-sans-date@invalid.local','support',false,'revoquee')$$,
  '23514',null,'état révoqué sans date/origine refusé'
);
select throws_ok(
  $$insert into public.plateforme_admins(email,role,actif,statut_identite,revocation_at,revocation_origine) values('revoque-sans-auteur@invalid.local','support',false,'revoquee',now(),'utilisateur')$$,
  '23514',null,'révocation utilisateur sans auteur refusée'
);
select lives_ok(
  $$insert into public.plateforme_admins(email,role,actif,statut_identite,revocation_at,revocation_origine) values('revoque-technique@invalid.local','support',false,'revoquee',now(),'migration_technique')$$,
  'migration technique révoquée sans faux auteur autorisée'
);

-- N/O. Révocation support ferme la session; historique conservé, suppression Auth bloquée.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_retirer_admin('support-aal2@invalid.local')$$,'révocation pendant session support autorisée');
reset role;
select ok(exists(select 1 from public.plateforme_acces_entreprises where plateforme_user_id='ee900000-0000-4000-8000-000000000002' and termine_at is not null),'révocation : session support fermée et historique conservé');
set local role authenticated;
select set_config('request.jwt.claim.sub','ee900000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.email','support-aal2@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000002","email":"support-aal2@invalid.local","role":"authenticated","aal":"aal2"}',true);
select ok(not public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'),'révocation : accès support immédiatement refusé');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_detacher_admin_revoque('support-aal2@invalid.local')$$,'historique support : identité révoquée détachable');
reset role;
select throws_ok(
  $$delete from auth.users where id='ee900000-0000-4000-8000-000000000002'$$,
  '23503',null,'historique support : suppression Auth bloquée conformément au runbook'
);
select ok(exists(select 1 from public.plateforme_acces_entreprises where plateforme_user_id='ee900000-0000-4000-8000-000000000002'),'historique support conservé après tentative de suppression');

-- P. Le préflight détecte un code d'application inconnu avant FK distante.
alter table public.historique_acces_applications drop constraint historique_acces_applications_application_code_fkey;
insert into public.historique_acces_applications(cible_type,cible_id,application_code,action)
values('entreprise','a0000000-0000-0000-0000-000000000001','application_inconnue','test_preflight');
select is(
  (select anomalies from public.plateforme_preflight_integrite() where controle='applications_historique_inconnues'),
  1::bigint, 'préflight : application inconnue détectée'
);

-- Q. Un administrateur Gestion Pro sans habilitation Colors reste refusé.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}',true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','colors'),'administrateur Gestion Pro sans Colors : refusé');

-- R. La faille email initiale reste fermée.
select set_config('request.jwt.claim.sub','ee900000-0000-4000-8000-000000000009',true);
select set_config('request.jwt.claim.email','email-seul-aal2@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee900000-0000-4000-8000-000000000009","email":"email-seul-aal2@invalid.local","role":"authenticated","aal":"aal2"}',true);
select ok(not public.est_plateforme_admin(),'bon email sans UID : aucun droit plateforme');
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','email seul aal2')$$,
  '%réservé à la plateforme%', 'bon email et AAL2 sans UID : support refusé'
);

-- Les helpers internes et le préflight ne sont pas exposés aux comptes ordinaires.
reset role;
select ok(not has_function_privilege('authenticated','public.plateforme_exiger_session_aal2()','EXECUTE'),'helper AAL2 interne non exécutable par authenticated');
select ok(not has_function_privilege('authenticated','public.plateforme_preflight_integrite()','EXECUTE'),'préflight réservé à la maintenance');
select is(
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'plateforme_modifier_abonnement','plateforme_modifier_tarif_poste',
       'plateforme_signaler_impaye','plateforme_enregistrer_reglement',
       'plateforme_appliquer_remise','plateforme_retirer_remise',
       'plateforme_creer_version_tarif','plateforme_snapshot_facturation',
       'plateforme_creer_entreprise','plateforme_verifier_et_journaliser_reinitialisation',
       'plateforme_support_fils','plateforme_support_messages'
     )
     and pg_get_functiondef(p.oid) like '%plateforme_exiger_session_aal2%'),
  12::bigint,
  'inventaire global : toutes les opérations plateforme sensibles classées exigent AAL2'
);
select is(
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema')
     and p.prosecdef
     and not exists(
       select 1 from unnest(coalesce(p.proconfig,array[]::text[])) c
       where c like 'search_path=%'
     )),
  0::bigint,
  'inventaire global : aucun SECURITY DEFINER sans search_path fixé'
);
select is(
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname like 'plateforme_%'
     and p.proname <> 'plateforme_quitter_entreprise'
     and p.prosrc ~* '\m(insert|update|delete)\M'
     and has_function_privilege('authenticated',p.oid,'EXECUTE')
     and p.prosrc not like '%plateforme_exiger_session_aal2%'),
  0::bigint,
  'inventaire global : aucune mutation plateforme exposée sans AAL2 hors fermeture propre'
);
select is(
  (select count(*)
   from information_schema.role_table_grants
   where grantee in ('anon','authenticated')
     and table_schema='public'
     and table_name in (
       'plateforme_admins','plateforme_acces_entreprises',
       'acces_applications_entreprises','habilitations_applications_utilisateurs',
       'historique_acces_applications'
     )
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER')),
  0::bigint,
  'inventaire global : aucune écriture directe accordée sur les tables plateforme sensibles'
);

select * from finish();
rollback;
