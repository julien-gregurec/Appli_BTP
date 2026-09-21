begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc
reset elsatia.capacite_personnes_bypass;

-- ── structure ───────────────────────────────────────────────────────────────
select has_function('public','lier_subscription_entreprise_service','B3 : RPC liaison présente');
select has_function('public','calculer_depassement_appareils_service','B2 : RPC calcul appareils présente');
select has_function('public','enregistrer_releve_stockage_service','B2 : RPC relevé stockage présente');
select has_function('public','finaliser_releve_stockage_service','B2 : RPC finalisation stockage présente');

-- ── ACL : service uniquement ────────────────────────────────────────────────
select ok(has_function_privilege('service_role','public.lier_subscription_entreprise_service(uuid,text,text)','EXECUTE'), 'lier : service_role EXECUTE');
select ok(not has_function_privilege('authenticated','public.lier_subscription_entreprise_service(uuid,text,text)','EXECUTE'), 'lier : authenticated exclu');
select ok(not has_function_privilege('anon','public.lier_subscription_entreprise_service(uuid,text,text)','EXECUTE'), 'lier : anon exclu');
select ok(has_function_privilege('service_role','public.calculer_depassement_appareils_service(uuid)','EXECUTE'), 'calcul appareils : service_role EXECUTE');
select ok(not has_function_privilege('anon','public.calculer_depassement_appareils_service(uuid)','EXECUTE'), 'calcul appareils : anon exclu');
select ok(has_function_privilege('service_role','public.enregistrer_releve_stockage_service(uuid,text,text,text,bigint,bigint,numeric,numeric,numeric,integer,numeric)','EXECUTE'), 'relevé stockage : service_role EXECUTE');
select ok(not has_function_privilege('authenticated','public.enregistrer_releve_stockage_service(uuid,text,text,text,bigint,bigint,numeric,numeric,numeric,integer,numeric)','EXECUTE'), 'relevé stockage : authenticated exclu');
select ok(not has_function_privilege('anon','public.finaliser_releve_stockage_service(text,text)','EXECUTE'), 'finalisation stockage : anon exclu');

-- ── B3 : première liaison ──────────────────────────────────────────────────
update public.entreprises set stripe_subscription_id = null, stripe_customer_id = null
where id = 'a0000000-0000-0000-0000-000000000001';

select is(public.lier_subscription_entreprise_service('a0000000-0000-0000-0000-000000000001','sub_LC_A','cus_LC_A'),
  'lie', 'NULL → première subscription : PASS');
select is((select stripe_subscription_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'sub_LC_A', 'subscription liée');
select is((select stripe_customer_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'cus_LC_A', 'customer lié');

-- rejeu même event → idempotent
select is(public.lier_subscription_entreprise_service('a0000000-0000-0000-0000-000000000001','sub_LC_A','cus_LC_A'),
  'deja_lie', 'même liaison rejouée : idempotent');
select is((select count(*)::int from public.entreprises where id='a0000000-0000-0000-0000-000000000001' and stripe_subscription_id='sub_LC_A'), 1, 'aucun effet de bord');

-- subscription différente après liaison → REFUS fail-closed
select throws_ok($$
  select public.lier_subscription_entreprise_service('a0000000-0000-0000-0000-000000000001','sub_DIFFERENTE','cus_x')
$$, '42501', 'Subscription Stripe non liée à cette entreprise', 'subscription différente après liaison : REFUS');
select is((select stripe_subscription_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'sub_LC_A', 'aucune mutation après refus');

-- entreprise étrangère / inconnue → REFUS
select throws_ok($$
  select public.lier_subscription_entreprise_service('00000000-0000-0000-0000-0000000000ff','sub_x','cus_x')
$$, 'P0002', 'Entreprise introuvable', 'entreprise inconnue : REFUS');

-- identifiant vide → 22023
select throws_ok($$
  select public.lier_subscription_entreprise_service('a0000000-0000-0000-0000-000000000001','','cus_x')
$$, '22023', 'Identifiant de subscription Stripe manquant', 'subscription vide : refus');

-- ── B2 : dépassement appareils ─────────────────────────────────────────────
-- sans appareil → 0
select is(public.calculer_depassement_appareils_service('a0000000-0000-0000-0000-000000000001'), 0::numeric, 'aucun appareil → 0');

-- poste tarifé + salarié facturable + 3 appareils → tarif du poste
update public.postes set tarif_compte_mensuel = 7.50 where id = 'a1000000-0000-0000-0000-000000000002';
update public.employes set poste_id = 'a1000000-0000-0000-0000-000000000002', compte_application_statut = 'actif'
where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  and utilisateur_id in ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');
insert into public.appareils_comptes(entreprise_id, utilisateur_id, identifiant_appareil, nom_appareil, type_appareil, application_installee, premiere_activite_at, derniere_activite_at)
select 'a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Appareil '||g, 'telephone', true, now(), now()
from generate_series(1,3) g;
select is(public.calculer_depassement_appareils_service('a0000000-0000-0000-0000-000000000001'), 7.50::numeric,
  '3 appareils (>2) pour un salarié facturable → tarif du poste');
-- 2 appareils seulement → 0 (autre salarié)
insert into public.appareils_comptes(entreprise_id, utilisateur_id, identifiant_appareil, nom_appareil, type_appareil, application_installee, premiere_activite_at, derniere_activite_at)
select 'a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003', gen_random_uuid(), 'Appareil B'||g, 'telephone', true, now(), now()
from generate_series(1,2) g;
select is(public.calculer_depassement_appareils_service('a0000000-0000-0000-0000-000000000001'), 7.50::numeric,
  '2 appareils pour un autre salarié : inchangé (pas de dépassement)');
-- isolation tenant : l'entreprise B ne voit rien
select is(public.calculer_depassement_appareils_service('b0000000-0000-0000-0000-000000000001'), 0::numeric, 'tenant : entreprise B non impactée');

-- ── B2 : relevé de dépassement stockage ───────────────────────────────────
select is(
  (public.enregistrer_releve_stockage_service('a0000000-0000-0000-0000-000000000001','in_LC_1','pro','mensuel',
    2000000000, 80, 100, 8, 1.90, 1, 15.20) ->> 'deja_traite')::boolean,
  false, 'nouveau relevé → deja_traite=false');
select is((select montant_ht from public.abonnement_stockage_releves where stripe_invoice_id='in_LC_1'), 15.20, 'relevé écrit');
select is((select depassement_go from public.abonnement_stockage_releves where stripe_invoice_id='in_LC_1'), 8::numeric, 'dépassement Go écrit');

-- rejeu avant facturation (item non posé, montant>0) → re-upsert
select is(
  (public.enregistrer_releve_stockage_service('a0000000-0000-0000-0000-000000000001','in_LC_1','pro','mensuel',
    2000000000, 80, 100, 8, 1.90, 1, 15.20) ->> 'deja_traite')::boolean,
  false, 'rejeu avant facturation → re-upsert');
select is((select count(*)::int from public.abonnement_stockage_releves where stripe_invoice_id='in_LC_1'), 1, 'pas de doublon');

-- finalisation (item Stripe posé)
select lives_ok($$select public.finaliser_releve_stockage_service('in_LC_1','ii_LC_1')$$, 'finalisation');
select is((select stripe_invoice_item_id from public.abonnement_stockage_releves where stripe_invoice_id='in_LC_1'), 'ii_LC_1', 'item Stripe consigné');

-- rejeu APRÈS facturation → deja_traite=true (anti double-facturation)
select is(
  (public.enregistrer_releve_stockage_service('a0000000-0000-0000-0000-000000000001','in_LC_1','pro','mensuel',
    2000000000, 80, 100, 8, 1.90, 1, 15.20) ->> 'deja_traite')::boolean,
  true, 'rejeu après facturation → deja_traite=true (no-op)');

-- dépassement nul déjà enregistré → deja_traite=true
select is(
  (public.enregistrer_releve_stockage_service('a0000000-0000-0000-0000-000000000001','in_LC_zero','pro','mensuel',
    10, 1, 100, 0, 1.90, 1, 0) ->> 'deja_traite')::boolean,
  false, 'relevé nul : première écriture');
select is(
  (public.enregistrer_releve_stockage_service('a0000000-0000-0000-0000-000000000001','in_LC_zero','pro','mensuel',
    10, 1, 100, 0, 1.90, 1, 0) ->> 'deja_traite')::boolean,
  true, 'relevé nul rejoué → deja_traite=true');

-- montant hors bornes → 22023
select throws_ok($$
  select public.enregistrer_releve_stockage_service('a0000000-0000-0000-0000-000000000001','in_LC_bad','pro','mensuel',
    10, 1, 100, 1, 1.90, 1, -5)
$$, '22023', 'Montant de dépassement invalide', 'montant négatif → refus');

-- entreprise inconnue → P0002
select throws_ok($$
  select public.enregistrer_releve_stockage_service('00000000-0000-0000-0000-0000000000ff','in_x','pro','mensuel',
    10, 1, 100, 1, 1.90, 1, 5)
$$, 'P0002', 'Entreprise introuvable', 'relevé sur entreprise inconnue → refus');

-- ── non-régression ─────────────────────────────────────────────────────────
select has_function('public','synchroniser_abonnement_stripe_service','ACL 262 : RPC synchro abonnement toujours présente');
select has_function('public','reserver_evenement_abonnement_service','ACL 262 : RPC journal toujours présente');
select has_function('public','plateforme_commencer_expiration_remise_serveur','remise : passerelle expiration toujours présente');
select has_function('public','plateforme_acquerir_verrou_remise_serveur','remise : verrou toujours présent');
select has_function('public','synchroniser_capacite_stripe_service','capacité R2-B : RPC toujours présente');
select has_function('public','annuler_baisse_capacite_planifiee','capacité R2-D : RPC toujours présente');
select is((select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 0, 'capacité personne intacte');

select * from finish();
rollback;
