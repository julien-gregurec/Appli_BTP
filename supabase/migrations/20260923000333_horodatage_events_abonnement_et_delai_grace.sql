-- Mission "closure V3" — sections 6 (délai de grâce paiement) et 7 (events
-- Stripe hors-ordre).
--
-- 1) `abonnement_dernier_evenement_at` retient l'horodatage (event.created
--    Stripe, pas l'objet) du dernier event de statut d'abonnement réellement
--    appliqué, pour que le webhook (src/app/api/stripe/abonnement/webhook/
--    route.ts, synchroniserAbonnement) puisse ignorer un event livré en
--    retard qui écraserait un état déjà plus frais. Colonne commerciale :
--    aucun GRANT ajouté pour `authenticated`, donc non modifiable par un
--    membre (même règle "secure by default" que la migration 20260922000184).
alter table public.entreprises
  add column if not exists abonnement_dernier_evenement_at timestamptz;

-- 2) `appliquer_suspensions_impayes()` (migration 20260714000075) applique déjà
--    la bascule 'suspendu' une fois `suspension_prevue_at` dépassée — c'est le
--    mécanisme déjà utilisé par le signalement manuel d'impayé par un admin
--    plateforme. Le webhook Stripe réutilise maintenant exactement ce même
--    mécanisme pour le délai de grâce configurable (STRIPE_DELAI_GRACE_PAIEMENT_JOURS),
--    mais la fonction elle-même n'était jamais appelée par aucun cron —
--    orpheline depuis sa création. Sans ce câblage, une échéance de grâce > 0
--    ne serait jamais matérialisée. Câblage app (pas SQL) : voir
--    src/app/api/cron/abonnements/route.ts, qui l'appelle désormais via
--    `admin.rpc("appliquer_suspensions_impayes")`. La migration d'origine
--    (20260714000075) n'accordait EXECUTE qu'aux appels internes (elle est
--    utilisée par plateforme_enregistrer_reglement) : ni `authenticated` ni
--    `service_role` ne l'avaient — il manquait ce dernier pour un appel RPC
--    direct depuis le cron (service_role).
grant execute on function public.appliquer_suspensions_impayes() to service_role;

notify pgrst, 'reload schema';
