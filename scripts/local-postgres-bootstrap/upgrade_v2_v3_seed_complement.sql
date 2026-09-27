-- Complément de jeu de données pour la qualification d'UPGRADE du train canonique V2 -> V3
-- (docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md §8).
--
-- À charger APRÈS : fixtures RGPD (isolation_multitenant, rgpd_tenant_facture_emise,
-- rgpd_tenant_contrats_acceptes), recette Réserves (scripts/e2e/prepare-*), seed pilote GP,
-- colors-pilote.sql et upgrade_v1_v2_seed_complement.sql. Ajoute ce qu'aucun de ces jeux ne
-- peuple : Tools (projet synchronisé, client et abonnement Stripe Test) pour un utilisateur
-- du pilote, et des tâches / transferts de chantier chez le tenant A (tables enfants de
-- l'export RGPD, migration 20260926000505).
--
-- Données FICTIVES. Réservé aux bases locales jetables : ne jamais exécuter sur Preview ni
-- Production.
\set ON_ERROR_STOP 1
begin;

do $seed$
declare
  v_ent uuid := (select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1');
  v_user uuid;
begin
  if v_ent is null then
    raise exception 'Seed pilote absent : charger seed_entreprise_pilote_btp.sql avant ce complément';
  end if;
  select ue.utilisateur_id into v_user
    from public.utilisateurs_entreprises ue where ue.entreprise_id = v_ent order by ue.created_at limit 1;

  -- Tools ---------------------------------------------------------------------
  insert into public.tools_projects (id, user_id, local_id, schema_version, tool_id, name, site_name,
                                     input_parameters, project_payload, created_at, updated_at)
  values ('e0000000-0000-4000-8000-0000000000c1', v_user, 'upg-v3-projet-0000001', 1, 'calepinage',
          'Calepinage salle de bain', 'Chantier Villeurbanne',
          '{"largeur": 240, "longueur": 310}', '{"resultat": {"carreaux": 118}}', now() - interval '3 days', now() - interval '1 day');
  insert into public.tools_monetization_customers (user_id, provider, environment, external_customer_id)
  values (v_user, 'stripe', 'test', 'cus_upgrade_v3');
  insert into public.tools_monetization_subscriptions (user_id, provider, environment, product_sku, external_product_id,
                                                       external_subscription_id, status, purchased_at, expires_at, auto_renews)
  values (v_user, 'stripe', 'test', 'tools_pro_monthly', 'prod_upgrade_v3', 'sub_upgrade_v3', 'active',
          now() - interval '10 days', now() + interval '20 days', true);
end
$seed$;

-- Tenant A : tâches et transfert de chantier (tables enfants sans entreprise_id).
insert into public.taches (id, chantier_id, libelle, statut) values
  ('a8100000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-000000000001', 'UPG_V3 Réception carrelage', 'a_faire');
insert into public.chantier_transferts (id, chantier_id, ancien_client_id, nouveau_client_id, utilisateur_id) values
  ('a8200000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001');

commit;
