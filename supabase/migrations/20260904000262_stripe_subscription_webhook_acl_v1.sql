-- ELSATIA-STRIPE-SUBSCRIPTION-WEBHOOK-ACL-CLOSURE-V1
--
-- La migration canonique 20260902000255_acl_reconciliation_v1 retire à
-- `service_role` tout accès direct (INSERT/UPDATE/DELETE/SELECT) aux tables
-- `abonnement_evenements`, `plans_abonnement`, `abonnements_entreprises`,
-- `factures_abonnement` (état Fresh canonique). Le webhook abonnement Stripe
-- (`src/app/api/stripe/abonnement/webhook/route.ts`) écrivait ces tables
-- directement via le client admin → 42501 (`autorisation_supabase`) AVANT même
-- d'atteindre la réconciliation capacité.
--
-- Ce lot déplace ces écritures derrière des RPC SECURITY DEFINER dédiées,
-- minimales, réservées à `service_role` — même schéma que la passerelle remise
-- (`plateforme_*_remise_serveur`). AUCUN grant large n'est réaccordé. La colonne
-- `entreprises.stripe_subscription_id` sert de garde tenant (fail-closed).
--
-- Périmètre : synchronisation de l'ABONNEMENT DE BASE + journal d'idempotence +
-- facture d'abonnement. Hors périmètre (inchangé) : dépassements stockage
-- (`abonnement_stockage_releves`), passerelle remise (déjà en RPC).
--
-- Additif. Aucune migration historique modifiée. Aucune capacité personne gérée
-- ici. Aucune suppression de données métier. Stripe Live INTERDIT.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Journal d'idempotence des évènements webhook
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.reserver_evenement_abonnement_service(
  p_stripe_event_id text,
  p_entreprise_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_stripe_event_id), '') is null then
    raise exception 'stripe_event_id obligatoire' using errcode = '22023';
  end if;
  insert into public.abonnement_evenements(stripe_event_id, entreprise_id, type, payload)
  values (p_stripe_event_id, p_entreprise_id, nullif(btrim(p_type), ''), coalesce(p_payload, '{}'::jsonb));
  return 'reserve';
exception
  when unique_violation then
    return 'duplicate';
end;
$$;

comment on function public.reserver_evenement_abonnement_service(text, uuid, text, jsonb) is
  'Webhook abonnement : réserve (idempotence) l''évènement Stripe. Renvoie « reserve » ou « duplicate ». Chemin de service.';

create or replace function public.finaliser_evenement_abonnement_service(
  p_stripe_event_id text,
  p_statut_resultant text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.abonnement_evenements
  set statut_resultant = nullif(btrim(p_statut_resultant), '')
  where stripe_event_id = p_stripe_event_id;
end;
$$;

comment on function public.finaliser_evenement_abonnement_service(text, text) is
  'Webhook abonnement : consigne le statut résultant d''un évènement traité. Chemin de service.';

create or replace function public.annuler_evenement_abonnement_service(
  p_stripe_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rollback de la réservation quand la logique métier échoue après journalisation :
  -- l'évènement redeviendra rejouable.
  delete from public.abonnement_evenements where stripe_event_id = p_stripe_event_id;
end;
$$;

comment on function public.annuler_evenement_abonnement_service(text) is
  'Webhook abonnement : libère la réservation d''un évènement dont le traitement métier a échoué. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Synchronisation de l'abonnement de base (entreprises + contrat)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.synchroniser_abonnement_stripe_service(
  p_entreprise_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_statut text,
  p_offre text,
  p_periodicite text,
  p_echeance date,
  p_essai_fin date,
  p_annulation_prevue_at timestamptz,
  p_debut_periode timestamptz,
  p_fin_periode timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_actuelle text;
  v_offre_valide boolean := p_offre in ('essentiel','premium','mini','pro','business','entreprise','sur_mesure');
  v_periodicite_valide boolean := p_periodicite in ('mensuel','annuel');
  v_plan_id uuid;
  v_plan_version integer;
  v_plan_mensuel numeric;
  v_plan_annuel numeric;
  v_contrat_offre text;
  v_contrat_prix numeric;
  v_contrat_version integer;
  v_meme_offre boolean;
  v_prix numeric;
  v_statut_contrat text;
begin
  -- Garde tenant fail-closed : la subscription doit être celle de l'entreprise
  -- (ou première liaison si l'entreprise n'a pas encore de subscription).
  select stripe_subscription_id into v_sub_actuelle
  from public.entreprises where id = p_entreprise_id;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;
  if nullif(btrim(p_stripe_subscription_id), '') is null then
    raise exception 'Identifiant de subscription Stripe manquant' using errcode = '22023';
  end if;
  if v_sub_actuelle is not null and v_sub_actuelle is distinct from p_stripe_subscription_id then
    raise exception 'Subscription Stripe non liée à cette entreprise' using errcode = '42501';
  end if;
  if p_statut not in ('essai','actif','suspendu','annule') then
    raise exception 'Statut d''abonnement invalide' using errcode = '22023';
  end if;

  -- Mise à jour bornée : liste de colonnes fixe, aucune écriture arbitraire.
  update public.entreprises set
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_customer_id = nullif(btrim(p_stripe_customer_id), ''),
    abonnement_statut = p_statut,
    abonnement_echeance = p_echeance,
    abonnement_essai_fin = p_essai_fin,
    abonnement_annulation_prevue_at = p_annulation_prevue_at,
    abonnement_offre = case when v_offre_valide then p_offre else abonnement_offre end,
    abonnement_periodicite = case when v_periodicite_valide then p_periodicite else abonnement_periodicite end,
    updated_at = now()
  where id = p_entreprise_id;

  -- Contrat tarifaire (comportement identique à l'ancien synchroniserAbonnement JS).
  if v_offre_valide and v_periodicite_valide then
    select id, version, prix_mensuel_ht, prix_annuel_ht
      into v_plan_id, v_plan_version, v_plan_mensuel, v_plan_annuel
    from public.plans_abonnement
    where code = p_offre and actif = true
    limit 1;

    select code_offre, prix_contractuel_ht, version_tarif
      into v_contrat_offre, v_contrat_prix, v_contrat_version
    from public.abonnements_entreprises
    where entreprise_id = p_entreprise_id;

    if v_plan_id is not null then
      v_meme_offre := (v_contrat_offre is not distinct from p_offre);
      v_prix := case
        when v_meme_offre and v_contrat_prix is not null then v_contrat_prix
        when p_periodicite = 'annuel' then v_plan_annuel
        else v_plan_mensuel
      end;
      v_statut_contrat := case p_statut
        when 'actif' then 'actif' when 'suspendu' then 'suspendu' when 'annule' then 'annule' else 'essai'
      end;
      if v_prix is not null then
        insert into public.abonnements_entreprises(
          entreprise_id, plan_id, code_offre, version_tarif, periodicite, prix_contractuel_ht,
          statut, debut_periode, fin_periode, stripe_subscription_id, stripe_customer_id, updated_at
        ) values (
          p_entreprise_id, v_plan_id, p_offre,
          case when v_meme_offre then coalesce(v_contrat_version, v_plan_version) else v_plan_version end,
          p_periodicite, v_prix, v_statut_contrat,
          p_debut_periode, p_fin_periode, p_stripe_subscription_id, nullif(btrim(p_stripe_customer_id), ''), now()
        )
        on conflict (entreprise_id) do update set
          plan_id = excluded.plan_id,
          code_offre = excluded.code_offre,
          version_tarif = excluded.version_tarif,
          periodicite = excluded.periodicite,
          prix_contractuel_ht = excluded.prix_contractuel_ht,
          statut = excluded.statut,
          debut_periode = excluded.debut_periode,
          fin_periode = excluded.fin_periode,
          stripe_subscription_id = excluded.stripe_subscription_id,
          stripe_customer_id = excluded.stripe_customer_id,
          updated_at = excluded.updated_at;
      end if;
    end if;
  end if;

  return p_statut;
end;
$$;

comment on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz) is
  'Webhook abonnement : synchronise l''abonnement de base (entreprises + abonnements_entreprises) depuis l''observation Stripe. Garde tenant fail-closed, colonnes bornées, aucune capacité personne. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Facture d'abonnement (invoice.paid / payment_failed / payment_action_required)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.synchroniser_facture_abonnement_service(
  p_entreprise_id uuid,
  p_stripe_invoice_id text,
  p_numero text,
  p_periode_debut timestamptz,
  p_periode_fin timestamptz,
  p_montant_ht numeric,
  p_montant_tva numeric,
  p_montant_ttc numeric,
  p_devise text,
  p_statut text,
  p_url_facture text,
  p_url_pdf text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_stripe_invoice_id), '') is null then
    raise exception 'stripe_invoice_id obligatoire' using errcode = '22023';
  end if;
  -- La facture doit appartenir à une entreprise existante.
  if not exists (select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  insert into public.factures_abonnement(
    entreprise_id, stripe_invoice_id, numero, periode_debut, periode_fin,
    montant_ht, montant_tva, montant_ttc, devise, statut, url_facture, url_pdf, payee_at
  ) values (
    p_entreprise_id, p_stripe_invoice_id, nullif(btrim(p_numero), ''), p_periode_debut, p_periode_fin,
    coalesce(p_montant_ht, 0), coalesce(p_montant_tva, 0), coalesce(p_montant_ttc, 0),
    upper(coalesce(nullif(btrim(p_devise), ''), 'EUR')), p_statut,
    nullif(btrim(p_url_facture), ''), nullif(btrim(p_url_pdf), ''),
    case when p_statut = 'paid' then now() else null end
  )
  on conflict (stripe_invoice_id) do update set
    entreprise_id = excluded.entreprise_id,
    numero = excluded.numero,
    periode_debut = excluded.periode_debut,
    periode_fin = excluded.periode_fin,
    montant_ht = excluded.montant_ht,
    montant_tva = excluded.montant_tva,
    montant_ttc = excluded.montant_ttc,
    devise = excluded.devise,
    statut = excluded.statut,
    url_facture = excluded.url_facture,
    url_pdf = excluded.url_pdf,
    payee_at = excluded.payee_at;
end;
$$;

comment on function public.synchroniser_facture_abonnement_service(uuid, text, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text) is
  'Webhook abonnement : upsert d''une facture d''abonnement Stripe. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ACL — chemin de service uniquement (webhook), jamais anon/authenticated
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.reserver_evenement_abonnement_service(text, uuid, text, jsonb)   from public, anon, authenticated;
revoke all on function public.finaliser_evenement_abonnement_service(text, text)                from public, anon, authenticated;
revoke all on function public.annuler_evenement_abonnement_service(text)                        from public, anon, authenticated;
revoke all on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.synchroniser_facture_abonnement_service(uuid, text, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.reserver_evenement_abonnement_service(text, uuid, text, jsonb)   to service_role;
grant execute on function public.finaliser_evenement_abonnement_service(text, text)                to service_role;
grant execute on function public.annuler_evenement_abonnement_service(text)                        to service_role;
grant execute on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz)
  to service_role;
grant execute on function public.synchroniser_facture_abonnement_service(uuid, text, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
