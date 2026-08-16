begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

\ir fixtures/isolation_multitenant.inc

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','32000000-0000-0000-0000-000000000001','authenticated','authenticated','promo-support@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','32000000-0000-0000-0000-000000000002','authenticated','authenticated','promo-facturation@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','32000000-0000-0000-0000-000000000003','authenticated','authenticated','promo-total@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
  ('32000000-0000-0000-0000-000000000001','Promo','Support'),
  ('32000000-0000-0000-0000-000000000002','Promo','Facturation'),
  ('32000000-0000-0000-0000-000000000003','Promo','Total')
on conflict(id) do nothing;
insert into public.plateforme_admins(email,utilisateur_id,role,nom,actif) values
  ('promo-support@invalid.local','32000000-0000-0000-0000-000000000001','support','Promo Support',true),
  ('promo-facturation@invalid.local','32000000-0000-0000-0000-000000000002','facturation','Promo Facturation',true),
  ('promo-total@invalid.local','32000000-0000-0000-0000-000000000003','total','Promo Total',true)
on conflict(email) do update set utilisateur_id=excluded.utilisateur_id,role=excluded.role,actif=true;

set local role authenticated;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select throws_like(
  $$select public.plateforme_promotion_creer('Intrus','pourcentage',10,'forever',null,current_date,null,array['mini'],
    'a0000000-0000-0000-0000-000000000001','Tentative tenant',false,null,null)$$,
  '%Permission plateforme refusée%',
  'un administrateur tenant ne crée pas de promotion'
);
select throws_like(
  $$insert into public.promotions_commerciales(nom_interne,type_remise,valeur,duree,date_debut,offres,entreprise_id,justification,cree_par,modifie_par)
    values('Direct','pourcentage',10,'forever',current_date,array['mini'],'a0000000-0000-0000-0000-000000000001','Insertion directe','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$$,
  '%permission denied%',
  'la table n’est pas modifiable directement par un tenant'
);

select set_config('request.jwt.claim.sub','32000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','promo-support@invalid.local',true);
select throws_like($$select * from public.plateforme_promotions_lister()$$,'%Permission plateforme refusée%','support ne consulte pas les promotions');
select throws_like(
  $$select public.plateforme_promotion_creer('Support','pourcentage',10,'forever',null,current_date,null,array['mini'],
    'a0000000-0000-0000-0000-000000000001','Tentative support',false,null,null)$$,
  '%Permission plateforme refusée%',
  'support ne crée pas de promotion'
);

select set_config('request.jwt.claim.sub','32000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.email','promo-facturation@invalid.local',true);
select lives_ok($$select * from public.plateforme_promotions_lister()$$,'facturation consulte le registre');
select throws_like(
  $$select public.plateforme_promotion_creer('Facturation','montant',50,'once',null,current_date,null,array['pro'],
    'a0000000-0000-0000-0000-000000000001','Tentative facturation',false,null,null)$$,
  '%Permission plateforme refusée%',
  'facturation ne crée pas de promotion'
);

select set_config('request.jwt.claim.sub','32000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claim.email','promo-total@invalid.local',true);
select lives_ok(
  $$select public.plateforme_promotion_creer('Mini permanent','pourcentage',10,'forever',null,current_date,null,array['mini'],
    'a0000000-0000-0000-0000-000000000001','Offre pilote test',true,null,null)$$,
  'total crée une remise en pourcentage permanente'
);
select is((select count(*) from public.promotions_commerciales where nom_interne='Mini permanent'),1::bigint,'le brouillon est enregistré');
select is((select statut from public.promotions_commerciales where nom_interne='Mini permanent'),'brouillon','une création reste un brouillon');
select throws_like(
  $$select public.plateforme_promotion_creer('Pourcentage invalide','pourcentage',101,'forever',null,current_date,null,array['mini'],
    'a0000000-0000-0000-0000-000000000001','Valeur invalide',false,null,null)$$,
  '%promotions_valeur_coherente%',
  'un pourcentage supérieur à 100 est refusé'
);
select throws_like(
  $$select public.plateforme_promotion_creer('Date invalide','montant',50,'once',null,current_date,current_date-1,array['pro'],
    'a0000000-0000-0000-0000-000000000001','Dates invalides',false,null,null)$$,
  '%promotions_dates_coherentes%',
  'une date de fin antérieure est refusée'
);
select throws_like(
  $$select public.plateforme_promotion_creer('Sur mesure','montant',50,'once',null,current_date,null,array['sur_mesure'],
    'a0000000-0000-0000-0000-000000000001','Offre incompatible',false,null,null)$$,
  '%promotions_offres_autorisees%',
  'Sur mesure est refusé par le parcours automatisé'
);
select public.plateforme_promotion_creer('Code dupliqué','montant',5,'once',null,current_date,null,array['mini'],null,'Premier code',false,'PROMO-TEST',1);
select throws_like(
  $$select public.plateforme_promotion_creer('Code dupliqué 2','montant',5,'once',null,current_date,null,array['mini'],null,'Second code',false,'PROMO-TEST',1)$$,
  '%promotions_code_unique%',
  'un code promotionnel dupliqué est refusé'
);
select lives_ok(
  $$select public.plateforme_promotion_confirmer_activation(
    (select id from public.promotions_commerciales where nom_interne='Mini permanent'),'coupon_test_promo',null)$$,
  'total active une promotion préparée par Stripe Test'
);
select is((select statut from public.promotions_commerciales where nom_interne='Mini permanent'),'actif','la promotion devient active');
select ok((select count(*)>0 from public.plateforme_journal_actions where action='promotion_activee'),'l’activation est journalisée');
select public.plateforme_promotion_creer('Conflit','montant',5,'once',null,current_date,null,array['mini'],
  'a0000000-0000-0000-0000-000000000001','Deuxième remise',false,null,null);
select throws_like(
  $$select public.plateforme_promotion_confirmer_activation(
      (select id from public.promotions_commerciales where nom_interne='Conflit'),'coupon_test_conflit',null)$$,
  '%déjà active%',
  'plusieurs remises simultanées pour une entreprise sont refusées'
);
select lives_ok(
  $$select * from public.plateforme_promotion_preparer_desactivation((select id from public.promotions_commerciales where nom_interne='Mini permanent'))$$,
  'la désactivation peut être préparée avant l’appel Stripe'
);
select lives_ok(
  $$select public.plateforme_promotion_confirmer_desactivation((select id from public.promotions_commerciales where nom_interne='Mini permanent'))$$,
  'total confirme la désactivation après Stripe'
);
select is((select statut from public.promotions_commerciales where nom_interne='Mini permanent'),'desactive','la promotion désactivée reste traçable');

reset role;
select * from finish();
rollback;
