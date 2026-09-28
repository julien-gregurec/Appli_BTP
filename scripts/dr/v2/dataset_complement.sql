-- DR V2 — complément du jeu réaliste (docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md §2).
--
-- Chargé sur une base au train V5 déjà peuplée par le harnais d'upgrade
-- (scripts/qualification/upgrade-v4-v5.sh : fixtures multi-tenant, pilote GP, Colors, Réserves,
-- Boutique, Tools, Relevé Lots 2-4, Stripe V3→V4→V5), puis copiée dans une base jetable
-- `elsatia_dr_*`. Il complète les domaines que ce jeu ne peuple pas ou qu'il laisse vides sur
-- une base V5 :
--
--   1. planning        : 3 événements (tenant A) ;
--   2. Relevé plan 2D  : relevé « atelier » (tenant A) et son plan initial (Lot 5, RPC réelle) ;
--   3. Stripe (états)  : facture payée ORDONNÉE pour « UPG4 converti » (filigrane d'accès posé),
--                        abonnement Tools Pro actif ORDONNÉ (filigrane Tools, entitlement « web ») ;
--   4. audit           : journal d'actions plateforme ;
--   5. RGPD            : suppression programmée échue de « Peintures Recette A » (tenant Colors
--                        sans contrat) — cible du scénario de purge interrompue (Disaster 3).
--
-- Toutes les écritures passent par les RPC réelles quand elles existent. Base jetable uniquement.
\set ON_ERROR_STOP 1
begin;

-- ── 1. Planning (tenant A) ─────────────────────────────────────────────────────────────
insert into public.planning_evenements (id, entreprise_id, chantier_id, titre, type, statut, debut, fin, notes)
select ('d2000000-0000-4000-8000-00000000000' || n)::uuid, 'a0000000-0000-0000-0000-000000000001',
       (select id from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by id limit 1),
       'DRV2 ' || (array['Pose menuiseries', 'Réception client', 'Livraison placo'])[n],
       (array['intervention', 'rdv_client', 'livraison'])[n],
       (array['confirme', 'planifie', 'termine'])[n],
       date_trunc('day', now()) + (n || ' days')::interval + interval '8 hours',
       date_trunc('day', now()) + (n || ' days')::interval + interval '12 hours',
       'Jeu DR V2'
  from generate_series(1, 3) n;

-- ── 2. Relevé & Métré : relevé « atelier » avec plan 2D initial (métreur du tenant A) ────
-- Relevé distinct du relevé UPG5 : les contrôles métier V5 (upgrade_v4_v5_business_checks.sql,
-- rejoués après restauration) comptent les plans du relevé UPG5.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
insert into public.tools_releves (id, entreprise_id, nom, chantier_nom) values
  ('d2200000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'DRV2 Relevé atelier', 'Atelier Sélestat');
insert into public.tools_releves_chantiers (id, releve_id, nom) values
  ('d2210000-0000-4000-8000-000000000001', 'd2200000-0000-4000-8000-000000000001', 'Atelier Sélestat');
insert into public.tools_releves_batiments (id, releve_id, chantier_id, nom) values
  ('d2220000-0000-4000-8000-000000000001', 'd2200000-0000-4000-8000-000000000001', 'd2210000-0000-4000-8000-000000000001', 'Atelier');
insert into public.tools_releves_etages (id, releve_id, batiment_id, nom, niveau, type_niveau) values
  ('d2230000-0000-4000-8000-000000000001', 'd2200000-0000-4000-8000-000000000001', 'd2220000-0000-4000-8000-000000000001', 'RDC', 0, 'rdc');
insert into public.tools_releves_elements (id, releve_id, type, etage_id, donnees) values
  ('d2240000-0000-4000-8000-000000000001', 'd2200000-0000-4000-8000-000000000001', 'mur', 'd2230000-0000-4000-8000-000000000001',
   '{"a":{"x":0,"y":0},"b":{"x":8000,"y":0},"epaisseurMm":250,"hauteurMm":3200,"typeMur":"porteur"}');
select (public.tools_releve_plan_creer('d2230000-0000-4000-8000-000000000001', 'initial', null, 'DRV2 plan atelier')).id is not null as plan_cree;
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);

-- ── 3. Stripe : états ordonnés (chemin de service réel) ────────────────────────────────
-- GP : facture payée de la subscription courante de « UPG4 converti », il y a 2 jours.
select public.appliquer_evenement_facture_abonnement_v2_service(
  'a7400000-0000-4000-8000-000000000050', 'evt_drv2_paid_0001', 'invoice.paid', now() - interval '2 days',
  'in_drv2_0001', 'paid', now() - interval '2 days', 'ELS-DRV2-0001',
  now() - interval '2 days', now() + interval '28 days', 249, 49.8, 298.8, 'eur',
  'https://invoice.stripe.com/i/in_drv2_0001', null, 'sub_upg4_50')->>'decision' as gp_paid;

-- Tools : abonnement Pro actif, relu chez Stripe, il y a 2 jours.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select public.tools_server_appliquer_abonnement_ordonne(jsonb_build_object(
  'user_id', (select user_id from public.tools_monetization_subscriptions where external_subscription_id = 'sub_upgrade_v3'),
  'provider', 'stripe', 'environment', 'test', 'product_sku', 'tools_pro_monthly',
  'external_product_id', 'prod_upgrade_v3', 'external_subscription_id', 'sub_upgrade_v3',
  'external_event_id', 'evt_drv2_tools_0001', 'event_type', 'customer.subscription.updated',
  'status', 'active', 'raw_status', 'active', 'auto_renews', true,
  'purchased_at', (now() - interval '10 days')::text, 'expires_at', (now() + interval '20 days')::text),
  now() - interval '2 days')->>'decision' as tools_active;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

-- ── 4. Audit plateforme ────────────────────────────────────────────────────────────────
insert into public.plateforme_journal_actions (id, acteur_id, acteur_email, action, cible_type, cible_id, details)
values ('d2100000-0000-4000-8000-000000000001', null, 'dr-v2@elsatia.invalid', 'dr_v2_jeu_charge', 'base', 'elsatia_dr',
        '{"origine":"scripts/dr/v2/dataset_complement.sql"}');

-- ── 5. RGPD : suppression programmée échue (tenant Colors sans contrat) ────────────────
update public.entreprises set suppression_prevue_at = now() - interval '1 second'
 where id = 'e0000000-0000-4000-8000-00000000000a';

commit;
