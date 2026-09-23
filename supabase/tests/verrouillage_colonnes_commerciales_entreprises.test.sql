-- Avant/après pour le contournement RLS documenté dans
-- docs/qualification/ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md (§9.2)
-- et fermé par la migration 20260922000184.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- 1) Vérité de schéma : le rôle authenticated n'a plus le privilège UPDATE
--    table-large sur les colonnes commerciales, mais le conserve sur une
--    colonne de profil non commerciale.
select is(
  (select count(*)::integer from information_schema.column_privileges
   where table_name = 'entreprises' and grantee = 'authenticated' and privilege_type = 'UPDATE'
     and column_name in (
       'abonnement_statut','abonnement_offre','abonnement_periodicite','abonnement_echeance',
       'abonnement_essai_fin','abonnement_annulation_prevue_at','abonnement_note',
       'abonnement_version_tarif','abonnement_prix_contractuel_ht','abonnement_devise',
       'abonnement_changement_offre','abonnement_changement_prevu_at','abonnement_alerte_quota_ia',
       'stripe_customer_id','stripe_subscription_id','derniere_facture_stripe_id',
       'derniere_facture_url','derniere_facture_pdf','derniere_facture_statut','derniere_facture_at',
       'remise_stripe_coupon_id','remise_description','remise_appliquee_at',
       'option_ia_statut','option_ia_essai_fin','option_ia_stripe_item_id','option_ia_debut_at',
       'option_ia_palier','ia_credits_achetes','impaye_signale_at','suspension_prevue_at',
       'impaye_message','dernier_reglement_at'
     )),
  0,
  'Aucune colonne commerciale/facturation n''est UPDATE-able par le rôle authenticated'
);

select ok(
  exists(select 1 from information_schema.column_privileges
    where table_name='entreprises' and grantee='authenticated' and privilege_type='UPDATE' and column_name='nom'),
  'Les colonnes de profil non commerciales restent UPDATE-ables par authenticated (nom)'
);

select ok(
  exists(select 1 from information_schema.column_privileges
    where table_name='entreprises' and grantee='authenticated' and privilege_type='UPDATE' and column_name='adresse'),
  'Les colonnes de profil non commerciales restent UPDATE-ables par authenticated (adresse)'
);

-- 2) Reproduction comportementale : un admin d'entreprise (permission
--    gerer_parametres, exactement le rôle qui peut cliquer « Gérer mon
--    abonnement ») ne peut plus s'auto-attribuer un abonnement payant en
--    écrivant directement la ligne de sa propre entreprise.
insert into public.entreprises (id, nom, abonnement_statut, abonnement_offre)
values ('99999999-0000-0000-0000-000000000001', 'pgTAP - entreprise test verrou', 'essai', null);
insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-000000000002', 'pgtap-admin-verrou@example.com');
insert into public.postes (id, entreprise_id, nom) values
  ('99999999-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', 'Direction pgTAP');
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('99999999-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000003', 'actif');
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise) values
  ('99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000003', 'gerer_parametres', true);

set local role authenticated;
set local request.jwt.claim.sub = '99999999-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$update public.entreprises set abonnement_statut='actif', abonnement_offre='entreprise', abonnement_echeance='2099-01-01' where id='99999999-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Un admin d''entreprise ne peut plus s''auto-attribuer un abonnement actif/Entreprise sans payer'
);

select throws_ok(
  $$update public.entreprises set stripe_subscription_id='sub_fake_pgtap' where id='99999999-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Un admin d''entreprise ne peut plus forger un stripe_subscription_id'
);

select throws_ok(
  $$update public.entreprises set suspension_prevue_at=null where id='99999999-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Un admin d''entreprise ne peut plus effacer lui-même son échéance de suspension pour impayé'
);

select lives_ok(
  $$update public.entreprises set nom='pgTAP - entreprise renommee', ville='Lyon' where id='99999999-0000-0000-0000-000000000001'$$,
  'La mise à jour de colonnes de profil non commerciales reste possible pour un admin d''entreprise'
);

reset role;

-- 3) Le chemin serveur (service_role : webhook Stripe, RPC SECURITY DEFINER,
--    cron) reste, lui, capable d'écrire ces colonnes — c'est le seul chemin
--    autorisé désormais.
-- Train canonique V1 : un appel service_role réel (webhook, cron) ne porte
-- aucune identité utilisateur. Sans cet effacement, le `sub` de l'étape 2
-- resterait posé et le garde-fou du tronc proteger_facturation_entreprise()
-- (auth.uid() non nul) refuserait l'écriture à juste titre.
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'service_role';
set local role service_role;
select lives_ok(
  $$update public.entreprises set abonnement_statut='actif', abonnement_offre='entreprise', stripe_subscription_id='sub_real_webhook' where id='99999999-0000-0000-0000-000000000001'$$,
  'service_role (webhook/RPC) peut toujours écrire les colonnes commerciales'
);
reset role;

select is(
  (select abonnement_statut from public.entreprises where id='99999999-0000-0000-0000-000000000001'),
  'actif',
  'Seule l''écriture service_role a fait passer le statut à actif'
);

select * from finish();
rollback;
