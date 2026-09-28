-- DR V2 — Disaster 4 : corruption de l'état Stripe LOCAL (bug, script de maintenance fautif).
-- Le journal d'ordre et les filigranes sont effacés, l'accès de « UPG4 converti » est rouvert à
-- la main et le droit Tools Pro réactivé : la base ne reflète plus Stripe.
\set ON_ERROR_STOP 1
begin;
delete from public.stripe_evenements_ordre;
delete from public.stripe_objets_ordre;
update public.entreprises set abonnement_statut = 'actif', abonnement_dernier_evenement_at = null
 where id = 'a7400000-0000-4000-8000-000000000050';
update public.entitlements_utilisateurs_elsatia set revoked_at = null, revoked_reason = null, status = 'active'
 where source = 'web' and metadata->>'reference_externe' = 'sub_upgrade_v3';
update public.tools_monetization_subscriptions set status = 'active', revoked_at = null
 where external_subscription_id = 'sub_upgrade_v3';
commit;
