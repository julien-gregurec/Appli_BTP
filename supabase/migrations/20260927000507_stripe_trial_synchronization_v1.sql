-- ELSATIA — Stripe Trial Synchronization Hardening V1
-- (rapport docs/qualification/ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1.md)
--
-- Ferme le finding F-1 du lot Stripe Ordering (ELSATIA_STRIPE_EVENT_ORDERING_HARDENING_V1 §13) :
-- `synchroniser_abonnement_stripe_service` écrivait `abonnement_essai_fin = trial_end` Stripe
-- tel quel. Checkout envoyait toujours 30 jours d'essai : une entreprise abonnée au jour N>0 de
-- son essai local recevait `trial_end = essai_debut + 30 + N`, et un abonnement sans essai
-- `trial_end = null`. Les deux violaient `entreprises_essai_dates_coherentes` : 500 sur tous les
-- `customer.subscription.*` / `checkout.session.completed`, re-livrés en boucle.
--
-- Décision produit : Stripe reprend UNIQUEMENT le temps restant de l'essai ELSATIA, jamais un
-- second essai. Côté application, Checkout envoie désormais `subscription_data[trial_end]` =
-- fin de l'essai local (ou aucun essai). Côté base (ce fichier), défense en profondeur :
--
-- 1. `synchroniser_abonnement_stripe_service` n'écrit plus jamais `trial_end` brut. L'essai local
--    fait autorité ; un `trial_end` Stripe ne peut que le RACCOURCIR (fin anticipée d'essai),
--    jamais l'allonger ni le vider :
--      trial_end absent (abonnement sans essai)      → essai local conservé ;
--      trial_end < essai_debut (date incohérente)     → essai local conservé + écart journalisé ;
--      trial_end > fin locale autorisée               → borné à la fin locale + écart journalisé ;
--      essai_debut ≤ trial_end ≤ fin locale           → retenu (raccourcissement monotone).
--    Le webhook ne lève donc plus d'erreur de contrainte : plus de 500 en boucle.
-- 2. `stripe_essai_ecarts` : journal (service/plateforme) des `trial_end` Stripe écartés ou bornés,
--    dédoublonné, pour la remédiation des subscriptions créées avant ce lot.
-- 3. Trigger `borner_essai_entreprise` : pour les rôles d'API (anon, authenticated,
--    service_role), `abonnement_essai_debut` est immuable et `abonnement_essai_fin` ne peut plus
--    augmenter, sauf administrateur plateforme `gerer_facturation` (dans la fenêtre de la
--    contrainte, inchangée). La base ne peut donc plus recevoir, par aucun chemin d'API, une fin
--    d'essai au-delà de la fenêtre locale déjà accordée.
--
-- Additive. Aucune migration historique modifiée. Signature, ACL et contrat d'ordre
-- (20260927000506) inchangés.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Journal des écarts d'essai Stripe
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stripe_essai_ecarts (
  id bigint generated always as identity primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  stripe_subscription_id text not null,
  nature text not null check (nature in ('depasse_fenetre_locale', 'avant_debut_essai')),
  trial_end_stripe date not null,
  essai_debut date not null,
  essai_fin_locale date not null,
  essai_fin_retenue date not null,
  occurrences integer not null default 1 check (occurrences >= 1),
  premiere_observation_at timestamptz not null default now(),
  derniere_observation_at timestamptz not null default now(),
  unique (entreprise_id, stripe_subscription_id, nature, trial_end_stripe)
);

comment on table public.stripe_essai_ecarts is
  'Trial Stripe écarté ou borné par synchroniser_abonnement_stripe_service (ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1). Lecture plateforme ; écriture par la RPC de service uniquement.';

alter table public.stripe_essai_ecarts enable row level security;
revoke all on public.stripe_essai_ecarts from public, anon, authenticated, service_role;
grant select on public.stripe_essai_ecarts to authenticated;

drop policy if exists stripe_essai_ecarts_lecture_plateforme on public.stripe_essai_ecarts;
create policy stripe_essai_ecarts_lecture_plateforme on public.stripe_essai_ecarts
  for select to authenticated
  using (public.plateforme_a_permission('gerer_facturation'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Borne d'essai pure (testable, sans effet de bord)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.essai_fin_bornee_stripe(
  p_essai_debut date,
  p_essai_fin_actuelle date,
  p_trial_end_stripe date
)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when p_essai_debut is null then p_essai_fin_actuelle
    when p_trial_end_stripe is null then p_essai_fin_actuelle
    when p_trial_end_stripe < p_essai_debut then p_essai_fin_actuelle
    else least(
      p_trial_end_stripe,
      coalesce(p_essai_fin_actuelle, p_essai_debut + 30),
      p_essai_debut + 30
    )
  end;
$$;

comment on function public.essai_fin_bornee_stripe(date, date, date) is
  'Fin d''essai à écrire depuis un trial_end Stripe : jamais au-delà de la fin locale ni de essai_debut + 30, jamais nulle, jamais avant essai_debut.';

revoke all on function public.essai_fin_bornee_stripe(date, date, date) from public, anon, authenticated;
grant execute on function public.essai_fin_bornee_stripe(date, date, date) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Synchronisation d'abonnement : essai borné (corps repris de 20260904000262,
--    seule l'écriture de abonnement_essai_fin change).
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
  v_essai_debut date;
  v_essai_fin date;
  v_essai_fin_retenue date;
  v_nature_ecart text;
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
  select stripe_subscription_id, abonnement_essai_debut, abonnement_essai_fin
    into v_sub_actuelle, v_essai_debut, v_essai_fin
  from public.entreprises where id = p_entreprise_id
  for update;
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

  -- Essai : l'essai local fait autorité. Stripe peut seulement le raccourcir.
  v_essai_fin_retenue := public.essai_fin_bornee_stripe(v_essai_debut, v_essai_fin, p_essai_fin);
  v_nature_ecart := case
    when p_essai_fin is null or v_essai_debut is null then null
    when p_essai_fin < v_essai_debut then 'avant_debut_essai'
    when p_essai_fin > v_essai_fin_retenue then 'depasse_fenetre_locale'
    else null
  end;
  if v_nature_ecart is not null then
    insert into public.stripe_essai_ecarts(
      entreprise_id, stripe_subscription_id, nature, trial_end_stripe,
      essai_debut, essai_fin_locale, essai_fin_retenue
    ) values (
      p_entreprise_id, p_stripe_subscription_id, v_nature_ecart, p_essai_fin,
      v_essai_debut, coalesce(v_essai_fin, v_essai_debut + 30), coalesce(v_essai_fin_retenue, v_essai_debut + 30)
    )
    on conflict (entreprise_id, stripe_subscription_id, nature, trial_end_stripe) do update set
      occurrences = public.stripe_essai_ecarts.occurrences + 1,
      essai_fin_retenue = excluded.essai_fin_retenue,
      derniere_observation_at = now();
  end if;

  -- Mise à jour bornée : liste de colonnes fixe, aucune écriture arbitraire.
  update public.entreprises set
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_customer_id = nullif(btrim(p_stripe_customer_id), ''),
    abonnement_statut = p_statut,
    abonnement_echeance = p_echeance,
    abonnement_essai_fin = v_essai_fin_retenue,
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
  'Webhook abonnement : synchronise l''abonnement de base (entreprises + abonnements_entreprises) depuis l''observation Stripe. Garde tenant fail-closed, colonnes bornées, essai local borné (trial_end Stripe ne peut que le raccourcir). Chemin de service.';

-- `create or replace` conserve l'ACL de 20260904000262 ; réaffirmée ici.
revoke all on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Garde : aucune extension d'essai par un rôle d'API
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.borner_essai_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seuls les rôles d'API sont bornés : les migrations et l'exploitation
  -- (rôle postgres, hors PostgREST) restent maîtres de la fenêtre, toujours
  -- sous la contrainte entreprises_essai_dates_coherentes.
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated', 'service_role')
     and not (auth.uid() is not null and public.plateforme_a_permission('gerer_facturation'))
     and (
       new.abonnement_essai_debut is distinct from old.abonnement_essai_debut
       or (old.abonnement_essai_fin is not null
           and (new.abonnement_essai_fin is null or new.abonnement_essai_fin > old.abonnement_essai_fin))
     ) then
    raise exception 'La fenêtre d''essai ELSATIA ne peut pas être prolongée'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.borner_essai_entreprise() from public, anon, authenticated;

drop trigger if exists borner_essai_entreprise on public.entreprises;
create trigger borner_essai_entreprise
  before update of abonnement_essai_debut, abonnement_essai_fin on public.entreprises
  for each row execute function public.borner_essai_entreprise();

commit;
