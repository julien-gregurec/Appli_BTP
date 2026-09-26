-- ELSATIA-COLORS-FULL-QUALIFICATION-V2 — suspension tenant contournable.
--
-- Constat (supabase/tests/colors_suspension_application_v16.test.sql, phase D) :
-- proteger_facturation_entreprise() interdit à un membre tenant de modifier
-- abonnement_statut / échéance / essai / offre / Stripe, mais PAS les colonnes
-- de l'avertissement d'impayé. Or est_membre_actif() — donc a_acces_application(),
-- donc tout l'accès Colors, Réserves, Tools et Gestion Pro — coupe l'accès dès
-- que suspension_prevue_at est échue. Un membre disposant de gerer_parametres
-- (policy role_gestion_update) pouvait donc, pendant les 10 jours de préavis,
-- exécuter `update entreprises set suspension_prevue_at = null` et annuler sa
-- propre suspension programmée (UPDATE 1 constaté sur Postgres 16 réel).
--
-- Correctif : reprend À L'IDENTIQUE la dernière définition
-- (20260816000204_c6b_corrections_premier_client.sql) et ajoute seulement
-- impaye_signale_at, suspension_prevue_at, impaye_message et dernier_reglement_at
-- à la liste des colonnes protégées. Tous les écrivains légitimes de ces colonnes
-- passent déjà la porte :
--   - plateforme_signaler_impaye / plateforme_enregistrer_reglement /
--     plateforme_modifier_abonnement exigent plateforme_exiger_role('total',
--     'facturation'), rôles qui détiennent gerer_facturation ;
--   - les webhooks Stripe et tâches planifiées s'exécutent en service_role
--     (auth.uid() nul) ;
--   - les actions serveur du mode prototype (src/app/actions/plateforme.ts)
--     sont réservées aux administrateurs plateforme et écrivent déjà
--     abonnement_statut dans la même requête.
create or replace function public.proteger_facturation_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Les webhooks utilisent service_role. Les administrateurs plateforme autorisés
  -- conservent leurs outils de gestion. Un membre tenant ne peut ni prolonger son
  -- essai, ni s'activer lui-même, ni lever une suspension programmée pour impayé
  -- en modifiant directement la ligne entreprise.
  if auth.uid() is not null
     and not public.plateforme_a_permission('gerer_facturation')
     and (
       new.abonnement_statut is distinct from old.abonnement_statut
       or new.abonnement_echeance is distinct from old.abonnement_echeance
       or new.abonnement_essai_debut is distinct from old.abonnement_essai_debut
       or new.abonnement_essai_fin is distinct from old.abonnement_essai_fin
       or new.abonnement_offre is distinct from old.abonnement_offre
       or new.abonnement_periodicite is distinct from old.abonnement_periodicite
       or new.abonnement_annulation_prevue_at is distinct from old.abonnement_annulation_prevue_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
       or new.impaye_signale_at is distinct from old.impaye_signale_at
       or new.suspension_prevue_at is distinct from old.suspension_prevue_at
       or new.impaye_message is distinct from old.impaye_message
       or new.dernier_reglement_at is distinct from old.dernier_reglement_at
     ) then
    raise exception 'La période d''essai et l''abonnement sont gérés par ELSATIA et Stripe'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
