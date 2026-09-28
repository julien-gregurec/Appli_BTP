-- DR V2 — Disaster 4 : événements Stripe survenus APRÈS la sauvegarde (la « vérité Stripe »).
--
-- Appliqués une première fois sur la base vivante (le webhook les a reçus), puis PERDUS par la
-- restauration de la sauvegarde antérieure. En Production, leur source de rejeu est Stripe
-- lui-même : Events API `created[gte]=<backup_at>` → renvoi vers les webhooks (voir rapport §7).
-- Ici, ce fichier est ce journal ; il est rejoué tel quel après restauration, par les MÊMES
-- RPC ordonnées que les webhooks réels. Chaque ligne affiche la décision.
--   E2 (GP)    invoice.payment_failed de la facture suivante de « UPG4 converti » → suspendu ;
--   E3 (Tools) customer.subscription.deleted de l'abonnement Tools Pro → droit révoqué.
-- Les horodatages Stripe sont FIXES (passés en variable) pour que le rejeu soit identique.
\set ON_ERROR_STOP 1
select 'E2|' || (public.appliquer_evenement_facture_abonnement_v2_service(
  'a7400000-0000-4000-8000-000000000050', 'evt_drv2_failed_0002', 'invoice.payment_failed', :'t_evt'::timestamptz,
  'in_drv2_0002', 'open', :'t_evt'::timestamptz, 'ELS-DRV2-0002',
  :'t_evt'::timestamptz, :'t_evt'::timestamptz + interval '30 days', 249, 49.8, 298.8, 'eur',
  'https://invoice.stripe.com/i/in_drv2_0002', null, 'sub_upg4_50')->>'decision');

set request.jwt.claims = '{"role":"service_role"}';
set request.jwt.claim.role = 'service_role';
select 'E3|' || (public.tools_server_appliquer_abonnement_ordonne(jsonb_build_object(
  'user_id', (select user_id from public.tools_monetization_subscriptions where external_subscription_id = 'sub_upgrade_v3'),
  'provider', 'stripe', 'environment', 'test', 'product_sku', 'tools_pro_monthly',
  'external_product_id', 'prod_upgrade_v3', 'external_subscription_id', 'sub_upgrade_v3',
  'external_event_id', 'evt_drv2_tools_0002', 'event_type', 'customer.subscription.deleted',
  'status', 'revoked', 'raw_status', 'canceled', 'auto_renews', false,
  'purchased_at', (:'t_evt'::timestamptz - interval '12 days')::text,
  'revoked_at', :'t_evt'), :'t_evt'::timestamptz)->>'decision');
