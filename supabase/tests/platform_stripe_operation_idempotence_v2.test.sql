begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','ee242000-0000-4000-8000-000000000001','authenticated','authenticated','facturation-242@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('ee242000-0000-4000-8000-000000000001','Facturation','242') on conflict(id) do nothing;
insert into public.plateforme_admins(email,role,utilisateur_id,actif,statut_identite,activation_at) values
('facturation-242@invalid.local','facturation','ee242000-0000-4000-8000-000000000001',true,'active',now());
insert into public.entreprises(id,nom,code_adhesion,stripe_subscription_id,abonnement_statut) values
('ee242100-0000-4000-8000-000000000001','Idempotence 242','T2420001','sub_242','actif');

select ok(
  not exists(select 1 from pg_proc where oid = to_regprocedure('public.plateforme_preparer_tentative_effet_externe(uuid,text,text)')),
  '00242 supprime le contrat de préparation sans operation_id'
);
select ok(
  has_function_privilege('authenticated','public.plateforme_preparer_tentative_effet_externe(uuid,text,text,uuid)','EXECUTE'),
  'authenticated peut appeler le nouveau contrat protégé'
);
select ok(
  not has_function_privilege('anon','public.plateforme_preparer_tentative_effet_externe(uuid,text,text,uuid)','EXECUTE'),
  'anon ne peut pas préparer une opération financière'
);
select ok(
  not has_table_privilege('authenticated','public.plateforme_tentatives_effet_externe','SELECT'),
  'la table de journal reste inaccessible directement'
);
select ok(
  pg_get_functiondef('public.plateforme_preparer_tentative_effet_externe(uuid,text,text,uuid)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'la préparation sérialise les opérations concurrentes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','ee242000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ee242000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);

select lives_ok($$
  select * from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000001')
$$,'création de la première opération métier');
select is(
  (select generation from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000001')),
  1,'retry actif : même génération'
);
select is(
  (select count(*) from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000001')),
  1::bigint,'retry actif : une seule ligne logique retournée'
);
select throws_like($$
  select * from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','autre-empreinte',
    '24200000-0000-4000-8000-000000000001')
$$,'%autre intention%','un operation_id ne peut pas changer de paramètres');
select throws_like($$
  select public.plateforme_marquer_tentative_sql_reussie(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000001')))
$$,'%état incompatible%','transition preparee vers sql_reussie interdite');

select lives_ok($$
  select public.plateforme_marquer_tentative_stripe_reussie(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000001')),'coupon_242')
$$,'transition preparee vers stripe_reussie');
select lives_ok($$
  select public.plateforme_marquer_tentative_sql_reussie(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000001')))
$$,'transition stripe_reussie vers succès terminal');
select is(
  (select etat from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000001')),
  'sql_reussie','retry après réponse perdue retrouve le succès terminal'
);
select lives_ok($$
  select public.plateforme_marquer_tentative_sql_reussie(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000001')))
$$,'marqueur SQL idempotent en concurrence');
select throws_like($$
  select public.plateforme_marquer_tentative_stripe_reussie(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000001')),'coupon_different')
$$,'%état incompatible%','un succès terminal ne peut pas changer d’objet Stripe');

select is(
  (select generation from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000002')),
  2,'un nouvel operation_id identique est une intention légitime de génération suivante'
);
select throws_like($$
  select * from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000003')
$$,'%autre opération est déjà en cours%','une intention concurrente distincte est bloquée');

select lives_ok($$
  select public.plateforme_marquer_tentative_stripe_reussie(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000002')),'coupon_243')
$$,'seconde génération confirmée par Stripe');
select lives_ok($$
  select public.plateforme_marquer_tentative_compensation_requise(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000002')))
$$,'compensation requise depuis stripe_reussie');
select lives_ok($$
  select public.plateforme_marquer_tentative_compensation_resolue(
    (select tentative_id from public.plateforme_preparer_tentative_effet_externe(
      'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
      '24200000-0000-4000-8000-000000000002')),true)
$$,'compensation confirmée');
select is(
  (select etat from public.plateforme_preparer_tentative_effet_externe(
    'ee242100-0000-4000-8000-000000000001','remise_appliquer','empreinte-once',
    '24200000-0000-4000-8000-000000000002')),
  'compensee','retry après compensation retrouve le même état terminal'
);

reset role;
select is(
  (select count(*) from public.plateforme_tentatives_effet_externe
   where entreprise_id='ee242100-0000-4000-8000-000000000001'
     and operation_id='24200000-0000-4000-8000-000000000001'),
  1::bigint,'la contrainte et le RPC conservent une ligne par opération'
);
select ok(
  (select nombre_replays >= 5 and dernier_replay_at is not null
   from public.plateforme_tentatives_effet_externe
   where entreprise_id='ee242100-0000-4000-8000-000000000001'
     and operation_id='24200000-0000-4000-8000-000000000001'),
  'les replays sont observables sans journaliser de secret'
);
select is(
  (select cle_stripe_principale from public.plateforme_tentatives_effet_externe
   where entreprise_id='ee242100-0000-4000-8000-000000000001'
     and operation_id='24200000-0000-4000-8000-000000000001'),
  'remise:24200000-0000-4000-8000-000000000001:g1:apply',
  'la clé Stripe est ancrée sur operation_id et génération'
);
select throws_ok($$
  insert into public.plateforme_tentatives_effet_externe(
    entreprise_id,operation_id,operation,empreinte_intention,generation,etat,
    cle_stripe_principale,auteur_utilisateur_id
  ) values(
    'ee242100-0000-4000-8000-000000000001','24200000-0000-4000-8000-000000000001',
    'remise_retirer','duplicate',99,'preparee','duplicate-key',
    'ee242000-0000-4000-8000-000000000001')
$$,'23505',null,'unicité DB bloque un duplicate insert concurrent');

select * from finish();
rollback;
