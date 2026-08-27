-- R7 : ces deux RPC historiques écrivaient directement la remise métier sans
-- saga, verrou ni preuve Stripe. Elles restent définies pour la compatibilité
-- du schéma, mais aucun rôle d'exécution applicatif ne peut plus les appeler.

revoke all on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.plateforme_retirer_remise(uuid)
  from public, anon, authenticated, service_role;

comment on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) is
  'LEGACY FERMÉE R7 : mutation interdite hors saga Stripe et finaliseur serveur avec preuve.';
comment on function public.plateforme_retirer_remise(uuid) is
  'LEGACY FERMÉE R7 : mutation interdite hors saga Stripe et finaliseur serveur avec preuve.';

notify pgrst, 'reload schema';
