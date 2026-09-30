-- Train canonique V8 : numéro d'origine 20260928000703 (A. Billing (claude/busy-darwin-tlpi3p)), renuméroté 20260928000803
-- (bloc V8 strictement après la dernière migration de V7, 20260928000701, projet partagé) ; corps inchangé.
-- ELSATIA — Billing & Subscription Lifecycle Qualification V1
-- (docs/qualification/ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md, finding B-4)
--
-- Constat (reproduit, pgTAP billing_subscription_lifecycle_v1 §B4) : un essai
-- ELSATIA expiré sans abonnement (`abonnement_statut = 'essai'`, fin d'essai
-- dépassée) n'était bloqué QUE par Gestion Pro côté serveur Next
-- (`getContexteEntreprise` → /abonnement-suspendu?motif=essai_expire). En base,
-- `est_membre_actif` restait vrai : tout le métier GP restait lisible et
-- modifiable par l'API (PostgREST + jeton de session), et Colors, Réserves et
-- Tools — qui ne décident l'accès QU'en base (`a_acces_application`) — restaient
-- pleinement ouverts sans limite de durée.
--
-- Correctif : la règle applicative existante est portée en base, à
-- l'identique : l'essai est ouvert jusqu'à la fin du jour UTC de
-- `coalesce(abonnement_essai_fin, abonnement_essai_debut + 30)` (fenêtre
-- inconnue = jamais expirée, même repli que `getContexteEntreprise`). Au-delà,
-- le membre n'est plus « membre actif » : exactement le traitement d'une
-- entreprise suspendue ou annulée. Le chemin minimal de facturation reste
-- ouvert (`etat_reabonnement_entreprise`, Checkout serveur, export RGPD,
-- support) ; l'accès support plateforme est inchangé. Une subscription relue
-- (`trialing` → `active`) ou un `invoice.paid` rétablit l'accès comme avant.
-- Signatures, propriétaires et grants inchangés (create or replace).

create or replace function public.est_membre_actif(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select not public.session_courante_revoquee() and (
    public.est_acces_support_actif(p_entreprise_id) or exists (
      select 1
      from public.utilisateurs_entreprises ue
      join public.entreprises e on e.id = ue.entreprise_id
      where ue.entreprise_id = p_entreprise_id
        and ue.utilisateur_id = auth.uid()
        and ue.statut = 'actif'
        and e.abonnement_statut not in ('suspendu', 'annule')
        and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
        and not (
          e.abonnement_statut = 'essai'
          and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
        )
    )
  );
$$;

create or replace function public.est_membre_actif_reel(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select not public.session_courante_revoquee() and exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.entreprises e on e.id = ue.entreprise_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
      and e.abonnement_statut not in ('suspendu', 'annule')
      and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
      and not (
        e.abonnement_statut = 'essai'
        and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
      )
  );
$$;
