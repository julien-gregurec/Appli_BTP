-- ELSATIA — Entreprise pilote PILOTE-BTP-V1 : diagnostic de l'état commercial (LECTURE SEULE).
-- Exécuté par scripts/preview/pilot-subscription.mjs --diagnose (session forcée en lecture seule).
-- Aucune donnée personnelle : états, dates de fenêtre, compteurs.
-- Colonnes : reference|statut|essai_debut|essai_fin|essai_echu|echeance|etat_gp|stripe_lie|membres_actifs|applications
select e.reference_interne,
       e.abonnement_statut,
       coalesce(e.abonnement_essai_debut::text, ''),
       coalesce(e.abonnement_essai_fin::text, ''),
       (e.abonnement_statut = 'essai'
        and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date)::text,
       coalesce(e.abonnement_echeance::text, ''),
       public.etat_commercial_gestion_pro(e.id),
       (e.stripe_subscription_id is not null or e.stripe_customer_id is not null)::text,
       (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id = e.id and ue.statut = 'actif'),
       (select string_agg(a.code || '=' || coalesce(public.statut_commercial_application(e.id, a.code), 'aucun'), ',' order by a.code)
          from public.applications_elsatia a where a.actif)
from public.entreprises e
where e.reference_interne = 'PILOTE-BTP-V1';
