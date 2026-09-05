-- ELSATIA-GP-SUPPORT-REPLY-EMAIL-P1 — résolution du destinataire d'une réponse
-- support. Le seul objet nouveau est `plateforme_support_destinataire_reponse` :
-- on vérifie qu'il n'ouvre aucune surface au-delà de `plateforme_support_repondre`.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','ee990000-0000-4000-8000-000000000001','authenticated','authenticated','support-notif@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into public.utilisateurs(id,prenom,nom) values
  ('ee990000-0000-4000-8000-000000000001','Support','Notification')
on conflict(id) do update set prenom=excluded.prenom,nom=excluded.nom;

insert into public.plateforme_admins(email,role,utilisateur_id,actif,statut_identite,activation_at) values
  ('support-notif@invalid.local','support','ee990000-0000-4000-8000-000000000001',true,'active',now())
on conflict(email) do update set
  role=excluded.role, utilisateur_id=excluded.utilisateur_id, actif=true,
  statut_identite='active', activation_at=excluded.activation_at;

-- A : deux demandes, la plus récente étant celle d'un ouvrier encore actif.
-- B : une demande émise par un compte désormais désactivé de l'entreprise.
insert into public.support_messages(
  id,entreprise_id,cote,auteur_id,auteur_nom,contenu,lu_par_plateforme,lu_par_entreprise,created_at
) values
  ('ee991000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000001','entreprise','10000000-0000-0000-0000-000000000001','Admin A','Première demande A',false,false,now()-interval '2 hour'),
  ('ee991000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000001','entreprise','10000000-0000-0000-0000-000000000002','Ouvrier A','Dernière demande A',false,false,now()-interval '1 hour'),
  ('ee991000-0000-4000-8000-000000000003','a0000000-0000-0000-0000-000000000001','plateforme','ee990000-0000-4000-8000-000000000001','Support','Réponse plateforme A',true,false,now()),
  ('ee991000-0000-4000-8000-000000000004','b0000000-0000-0000-0000-000000000001','entreprise','20000000-0000-0000-0000-000000000002','Ouvrier B','Demande B',false,false,now()-interval '1 hour')
on conflict(id) do nothing;

-- 1. Aucune surface anonyme, aucune surface clé de service.
select ok(
  not has_function_privilege('anon','public.plateforme_support_destinataire_reponse(uuid)','execute'),
  'destinataire : anon sans EXECUTE'
);
select ok(
  not has_function_privilege('service_role','public.plateforme_support_destinataire_reponse(uuid)','execute'),
  'destinataire : service_role sans EXECUTE'
);
select ok(
  has_function_privilege('authenticated','public.plateforme_support_destinataire_reponse(uuid)','execute'),
  'destinataire : authenticated avec EXECUTE'
);

-- 2. Lecture pure : jamais d'écriture, contrairement à la réponse elle-même.
select ok(
  pg_get_functiondef('public.plateforme_support_destinataire_reponse(uuid)'::regprocedure)
    !~* '\m(insert|update|delete)\M',
  'destinataire : définition sans INSERT, UPDATE ni DELETE'
);

set local role authenticated;

-- 3. Un membre d'entreprise n'est pas un opérateur support.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$select * from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')$$,
  null,
  null,
  'destinataire : un membre entreprise ne peut pas résoudre le demandeur'
);
select throws_ok(
  $$select public.plateforme_support_repondre('a0000000-0000-0000-0000-000000000001','Fausse réponse')$$,
  null,
  null,
  'réponse : un membre entreprise ne peut pas répondre comme support'
);

-- 4. Opérateur support sans session ciblée : refusé, comme pour le contenu.
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-notif@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","email":"support-notif@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select * from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'destinataire : sans session support ciblée, refusé'
);

-- 5. Session A : le demandeur est le dernier auteur côté entreprise, et lui seul.
select lives_ok(
  $$select public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001','Test notification réponse support')$$,
  'session support A ouverte'
);
select is(
  (select count(*) from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')),
  1::bigint,
  'destinataire : une seule ligne renvoyée'
);
select is(
  (select email from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')),
  'ouvrier-a@invalid.local',
  'destinataire : adresse du dernier demandeur du fil'
);
select is(
  (select entreprise_nom from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')),
  'Entreprise Isolation A',
  'destinataire : entreprise du fil'
);
select is(
  (select demande from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')),
  'Dernière demande A',
  'destinataire : demande la plus récente, jamais une réponse plateforme'
);

-- 6. Cross-tenant : la session A n'ouvre rien sur B.
select throws_like(
  $$select * from public.plateforme_support_destinataire_reponse('b0000000-0000-0000-0000-000000000001')$$,
  '%Session support explicite requise%',
  'destinataire : session A ne résout pas le demandeur de B'
);

reset role;

-- 7. Fail-closed : un demandeur qui n'est plus membre actif n'est plus notifiable.
update public.utilisateurs_entreprises set statut='desactive'
where utilisateur_id='10000000-0000-0000-0000-000000000002'
  and entreprise_id='a0000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','support-notif@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","email":"support-notif@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(
  (select email from public.plateforme_support_destinataire_reponse('a0000000-0000-0000-0000-000000000001')),
  'admin-a@invalid.local',
  'destinataire : retombe sur le demandeur précédent encore membre actif'
);
reset role;

-- 8. La lecture du destinataire ne modifie aucun état du fil.
select ok(
  not (select lu_par_plateforme from public.support_messages where id='ee991000-0000-4000-8000-000000000002'),
  'destinataire : indicateur lu_par_plateforme inchangé'
);

select * from finish();
rollback;
