begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','ee980000-0000-4000-8000-000000000001','authenticated','authenticated','support-isolation@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee980000-0000-4000-8000-000000000002','authenticated','authenticated','facturation-audit@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ee980000-0000-4000-8000-000000000003','authenticated','authenticated','lecture-audit@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into public.utilisateurs(id,prenom,nom) values
  ('ee980000-0000-4000-8000-000000000001','Support','Isolation'),
  ('ee980000-0000-4000-8000-000000000002','Facturation','Audit'),
  ('ee980000-0000-4000-8000-000000000003','Lecture','Audit')
on conflict(id) do update set prenom=excluded.prenom,nom=excluded.nom;

insert into public.plateforme_admins(
  email,role,utilisateur_id,actif,statut_identite,activation_at
) values
  ('support-isolation@invalid.local','support','ee980000-0000-4000-8000-000000000001',true,'active',now()),
  ('facturation-audit@invalid.local','facturation','ee980000-0000-4000-8000-000000000002',true,'active',now()),
  ('lecture-audit@invalid.local','lecture','ee980000-0000-4000-8000-000000000003',true,'active',now());

insert into public.entreprises(id,nom,code_adhesion)
values('c0000000-0000-0000-0000-000000000001','Entreprise sans fil','ISOC0001')
on conflict(id) do nothing;

insert into public.support_messages(
  id,entreprise_id,cote,auteur_id,auteur_nom,contenu,lu_par_plateforme,lu_par_entreprise
) values
  ('ee981000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000001','entreprise','10000000-0000-0000-0000-000000000001','Admin A','SECRET_SUPPORT_ENTREPRISE_A',false,false),
  ('ee981000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000001','plateforme','30000000-0000-0000-0000-000000000001','Plateforme','REPONSE_SUPPORT_ENTREPRISE_A',true,false),
  ('ee981000-0000-4000-8000-000000000003','b0000000-0000-0000-0000-000000000001','entreprise','20000000-0000-0000-0000-000000000001','Admin B','SECRET_SUPPORT_ENTREPRISE_B',false,false)
on conflict(id) do nothing;

-- A/B. La liste globale AAL2 expose uniquement les métadonnées minimales,
-- quel que soit le rôle support ou total et sans session support ciblée.
select ok(
  pg_get_function_result('public.plateforme_support_fils()'::regprocedure) not ilike '%contenu%',
  'liste support : aucun champ de contenu ou extrait dans le type retourné'
);
select ok(
  pg_get_functiondef('public.plateforme_support_fils()'::regprocedure) not ilike '%m.contenu%',
  'liste support : aucun contenu de message lu dans la définition'
);
select ok(
  pg_get_functiondef('public.plateforme_support_messages(uuid)'::regprocedure)
    !~* '\m(insert|update|delete)\M',
  'lecture support : définition sans INSERT, UPDATE ni DELETE'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'plateforme_%'
     and p.provolatile in ('s','i')
     and pg_get_functiondef(p.oid) ~* '\m(insert|update|delete)\M'),
  0::bigint,
  'consultations plateforme STABLE/IMMUTABLE : aucun effet de bord SQL'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-isolation@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is((select count(*) from public.plateforme_support_fils()),2::bigint,'support AAL2 sans session : deux fils visibles comme métadonnées');
select throws_like(
  $$select * from public.plateforme_support_messages('a0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'support AAL2 sans session : contenu A refusé'
);
select throws_like(
  $$select * from public.plateforme_support_messages('b0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'support AAL2 sans session : contenu B refusé'
);

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is((select count(*) from public.plateforme_support_fils()),2::bigint,'total AAL2 sans session : catalogue minimal autorisé');
select throws_like(
  $$select * from public.plateforme_support_messages('a0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'total AAL2 sans session : contenu refusé'
);

-- C/D. Une session A autorise A uniquement. La lecture est strictement pure.
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-isolation@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','Test isolation support A')$$,
  'session support A ouverte'
);
select is(
  (select count(*) from public.plateforme_support_messages('a0000000-0000-0000-0000-000000000001')
   where contenu in ('SECRET_SUPPORT_ENTREPRISE_A','REPONSE_SUPPORT_ENTREPRISE_A')),
  2::bigint,
  'session A : contenu A autorisé'
);
select throws_like(
  $$select * from public.plateforme_support_messages('b0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'session A : contenu B refusé'
);
reset role;
select is(
  (select lu_par_plateforme from public.support_messages where id='ee981000-0000-4000-8000-000000000001'),
  false,
  'lecture du fil : indicateur lu_par_plateforme inchangé'
);
select is(
  (select count(*) from public.historique_mutations_plateforme where domaine='support'),
  0::bigint,
  'lecture du fil : aucun historique créé'
);
select is(
  (select entreprise_id from public.plateforme_acces_entreprises
   where plateforme_user_id='ee980000-0000-4000-8000-000000000001' and termine_at is null),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'lecture du fil : session ciblée inchangée'
);

-- E. L'acquittement explicite ne touche que les vrais non-lus et est idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-isolation@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(
  public.plateforme_support_marquer_messages_lus('a0000000-0000-0000-0000-000000000001'),
  1,
  'acquittement A : un message réellement modifié'
);
reset role;
select ok(
  (select lu_par_plateforme from public.support_messages where id='ee981000-0000-4000-8000-000000000001')
  and not (select lu_par_plateforme from public.support_messages where id='ee981000-0000-4000-8000-000000000003'),
  'acquittement A : le message B reste inchangé'
);
select ok(
  exists(
    select 1 from public.historique_mutations_plateforme
    where domaine='support' and action='messages_marques_lus'
      and entreprise_id='a0000000-0000-0000-0000-000000000001'
      and objet_type='fil_support'
      and objet_id='a0000000-0000-0000-0000-000000000001'
      and auteur_utilisateur_id='ee980000-0000-4000-8000-000000000001'
      and nombre_lignes=1
  ),
  'acquittement A : entreprise, fil, UID réel et nombre de lignes audités'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-isolation@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(public.plateforme_support_marquer_messages_lus('a0000000-0000-0000-0000-000000000001'),0,'second acquittement identique : aucune modification');
reset role;
select is(
  (select count(*) from public.historique_mutations_plateforme where domaine='support'),
  1::bigint,
  'second acquittement identique : aucun faux historique'
);

-- F/G. AAL1, session étrangère, expirée, fermée et fil inexistant sont refusés.
set local role authenticated;
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-isolation@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_like(
  $$select public.plateforme_support_marquer_messages_lus('a0000000-0000-0000-0000-000000000001')$$,
  '%AAL2%',
  'acquittement : AAL1 refusé'
);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_entrer_entreprise('b0000000-0000-0000-0000-000000000001','Test session support B')$$,
  'session déplacée vers B'
);
select throws_like(
  $$select public.plateforme_support_repondre('a0000000-0000-0000-0000-000000000001','Réponse interdite')$$,
  '%Session support explicite requise%',
  'session B : réponse A refusée'
);
select throws_like(
  $$select public.plateforme_support_marquer_messages_lus('a0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'session B : acquittement A refusé'
);
reset role;
update public.plateforme_acces_entreprises
set commence_at=now()-interval '2 hours',expire_at=now()-interval '1 hour'
where plateforme_user_id='ee980000-0000-4000-8000-000000000001' and termine_at is null;
set local role authenticated;
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-isolation@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000001","email":"support-isolation@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select * from public.plateforme_support_messages('b0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'session expirée : lecture refusée'
);
select lives_ok(
  $$select public.plateforme_entrer_entreprise('b0000000-0000-0000-0000-000000000001','Nouvelle session support B')$$,
  'nouvelle session B ouverte après expiration'
);
select lives_ok($$select public.plateforme_quitter_entreprise()$$,'session support fermée par son propriétaire');
select throws_like(
  $$select public.plateforme_support_marquer_messages_lus('b0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'session fermée : acquittement refusé'
);
select lives_ok(
  $$select public.plateforme_entrer_entreprise('c0000000-0000-0000-0000-000000000001','Test fil support absent')$$,
  'session ouverte sur entreprise sans fil'
);
select throws_like(
  $$select public.plateforme_support_marquer_messages_lus('c0000000-0000-0000-0000-000000000001')$$,
  '%Fil support introuvable%',
  'fil inexistant : erreur explicite'
);
reset role;
select is((select count(*) from public.historique_mutations_plateforme where domaine='support'),1::bigint,'fil inexistant : aucune mutation ni trace');

-- H-K. Multi-app : vrais changements uniquement, y compris rôle et période.
insert into public.applications_elsatia(code,nom) values('audit_app','Application audit');
insert into public.roles_applications_elsatia(application_code,code,nom) values
  ('audit_app','audit_lecture','Lecture audit'),
  ('audit_app','audit_gestion','Gestion audit');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','audit_app',null,null,'audit',null),true,'activation initiale : modification réelle');
select is(public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','audit_app',null,null,'audit',null),false,'activation identique : aucune modification');
select is((select count(*) from public.historique_acces_applications where application_code='audit_app'),1::bigint,'activation identique : un seul historique');
select is(public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','audit_app',now()-interval '1 day',now()+interval '30 days','audit',null),true,'changement de période entreprise : modification réelle');
select is(public.plateforme_habiliter_utilisateur_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','audit_app','audit_lecture'),true,'habilitation initiale : modification réelle');
select is(public.plateforme_habiliter_utilisateur_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','audit_app','audit_lecture'),false,'habilitation identique : aucune modification');
select is(public.plateforme_habiliter_utilisateur_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','audit_app','audit_gestion',now()-interval '1 day',now()+interval '20 days'),true,'changement de rôle et période : modification réelle');
select is((select count(*) from public.historique_acces_applications where application_code='audit_app'),4::bigint,'multi-app : exactement quatre changements réels audités');
select is(public.plateforme_retirer_habilitation_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','audit_app'),true,'retrait actif : modification réelle');
select is(public.plateforme_retirer_habilitation_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','audit_app'),false,'retrait déjà effectué : aucune modification');
select is(public.plateforme_desactiver_application_entreprise('a0000000-0000-0000-0000-000000000001','audit_app'),true,'désactivation active : modification réelle');
select is(public.plateforme_desactiver_application_entreprise('a0000000-0000-0000-0000-000000000001','audit_app'),false,'désactivation déjà effectuée : aucune modification');
select is((select count(*) from public.historique_acces_applications where application_code='audit_app'),6::bigint,'retraits inexistants : aucun faux historique');
select ok(
  not exists(select 1 from public.historique_acces_applications where application_code='audit_app' and auteur_utilisateur_id is distinct from '30000000-0000-0000-0000-000000000001'),
  'historique multi-app : UID réel sur chaque changement'
);

-- L/M/N. Facturation : cible explicite, idempotence et audit UID/objet.
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.email','facturation-audit@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000002","email":"facturation-audit@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_modifier_abonnement('ffffffff-ffff-4fff-8fff-ffffffffffff','actif',current_date,null)$$,
  '%Entreprise introuvable%',
  'facturation : entreprise inexistante refusée explicitement'
);
select throws_like(
  $$select public.plateforme_modifier_tarif_poste('ffffffff-ffff-4fff-8fff-ffffffffffff','standard',42)$$,
  '%Poste introuvable%',
  'facturation : poste inexistant refusé explicitement'
);
select throws_like(
  $$select public.plateforme_signaler_impaye('ffffffff-ffff-4fff-8fff-ffffffffffff','Cible absente')$$,
  '%Entreprise introuvable%',
  'facturation : impayé sur entreprise inexistante refusé'
);
select throws_like(
  $$select public.plateforme_enregistrer_reglement('ffffffff-ffff-4fff-8fff-ffffffffffff',null)$$,
  '%Entreprise introuvable%',
  'facturation : règlement sur entreprise inexistante refusé'
);
select throws_like(
  $$select public.plateforme_appliquer_remise('ffffffff-ffff-4fff-8fff-ffffffffffff','coupon-test','Test',null,null,null,null)$$,
  '%Entreprise introuvable%',
  'facturation : remise sur entreprise inexistante refusée'
);
select throws_like(
  $$select public.plateforme_retirer_remise('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  '%Entreprise introuvable%',
  'facturation : retrait de remise sur entreprise inexistante refusé'
);
select is((select count(*) from public.historique_mutations_plateforme where domaine='facturation'),0::bigint,'cibles inexistantes : aucun faux historique facturation');
select is(public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','actif',current_date,'Audit facturation'),true,'abonnement réel : modification appliquée');
select is(public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','actif',current_date,'Audit facturation'),false,'abonnement identique : aucune modification');
select ok(
  exists(
    select 1 from public.historique_mutations_plateforme
    where domaine='facturation' and action='abonnement_modifie'
      and entreprise_id='a0000000-0000-0000-0000-000000000001'
      and objet_type='entreprise' and objet_id='a0000000-0000-0000-0000-000000000001'
      and auteur_utilisateur_id='ee980000-0000-4000-8000-000000000002'
      and ancien is not null and nouveau is not null
  ),
  'facturation réelle : UID, entreprise, objet et états avant/après audités'
);
select is((select count(*) from public.historique_mutations_plateforme where domaine='facturation'),1::bigint,'abonnement identique : un seul historique réel');
select throws_like(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','Facturation interdite')$$,
  '%Action réservée%',
  'facturation : support refusé'
);
select throws_like(
  $$select public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','colors')$$,
  '%Action réservée%',
  'facturation : mutation multi-app refusée'
);

-- R/S/T. AAL1 et lecture ne mutent rien ; Gestion Pro ne confère pas Colors.
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000002","email":"facturation-audit@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_like(
  $$select public.plateforme_modifier_abonnement('a0000000-0000-0000-0000-000000000001','suspendu',current_date,null)$$,
  '%AAL2%',
  'facturation AAL1 : mutation refusée'
);
select set_config('request.jwt.claim.sub','ee980000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.email','lecture-audit@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee980000-0000-4000-8000-000000000003","email":"lecture-audit@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_support_marquer_messages_lus('a0000000-0000-0000-0000-000000000001')$$,
  '%Action réservée%',
  'lecture : acquittement support refusé'
);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}',true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','colors'),'admin Gestion Pro sans habilitation Colors : accès toujours refusé');

-- Surface finale : aucune écriture directe, aucune surcharge moins sûre.
reset role;
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='plateforme_support_marquer_messages_lus'),
  1::bigint,
  'acquittement support : une seule signature appelable'
);
select ok(
  has_function_privilege('authenticated','public.plateforme_support_marquer_messages_lus(uuid)','execute')
  and not has_function_privilege('anon','public.plateforme_support_marquer_messages_lus(uuid)','execute'),
  'acquittement support : EXECUTE réservé aux utilisateurs authentifiés'
);
select matches(
  pg_get_functiondef('public.plateforme_support_marquer_messages_lus(uuid)'::regprocedure),
  'SECURITY DEFINER',
  'acquittement support : SECURITY DEFINER explicite'
);
select matches(
  pg_get_functiondef('public.plateforme_support_marquer_messages_lus(uuid)'::regprocedure),
  'SET search_path TO ''public''',
  'acquittement support : search_path fixe'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$insert into public.historique_mutations_plateforme(domaine,action,objet_type,auteur_utilisateur_id) values('support','faux','fil_support','30000000-0000-0000-0000-000000000001')$$,
  '42501',null,
  'table d’audit : écriture directe authenticated refusée'
);
select throws_ok(
  $$select contenu from public.support_messages limit 1$$,
  '42501',null,
  'contenu support : aucun accès direct accordé au rôle authenticated'
);

select * from finish();
rollback;
