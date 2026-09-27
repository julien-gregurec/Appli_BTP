-- ELSATIA-STRIPE-EVENT-ORDERING-REPLAY-HARDENING-V1
--
-- Constat (docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md §5.5,
-- reproduit par supabase/tests/stripe_event_ordering_v1.test.sql) : les
-- événements `invoice.*` du webhook abonnement n'avaient AUCUNE garde d'ordre.
-- La colonne `entreprises.abonnement_dernier_evenement_at` (…333) n'était ni
-- lue ni écrite. Rejouer un ancien `invoice.payment_failed` APRÈS un
-- `invoice.paid` re-suspendait l'entreprise. Le statut d'accès était en outre
-- écrit par un UPDATE direct depuis la route (lecture/écriture non atomique,
-- aucun verrou) : deux livraisons concurrentes `paid` / `payment_failed`
-- finissaient dans l'état de la DERNIÈRE requête arrivée, pas du dernier
-- événement Stripe.
--
-- Contrat d'ordre (docs/qualification/ELSATIA_STRIPE_EVENT_ORDERING_HARDENING_V1.md §3) :
--
--   * L'horloge est celle de Stripe : `event.created`, jamais l'ordre
--     d'arrivée HTTP ni `now()`.
--   * `stripe_objets_ordre` retient, par objet Stripe métier (facture,
--     abonnement, compte Connect, abonnement Tools) et pour l'état d'accès
--     dérivé d'une entreprise (`entreprise_acces`), le dernier événement
--     appliqué (id, type, created, état).
--   * `stripe_evenements_ordre` journalise CHAQUE événement traité : id,
--     created, objet, type, décision (applique / perime / sans_effet),
--     transition métier, processed_at. Un événement périmé ne modifie rien
--     mais est journalisé.
--   * Règle d'accès entreprise : un événement de statut s'applique si
--     created >= filigrane. À created ÉGAL : une observation d'abonnement
--     relue chez Stripe gagne sur un événement `invoice.*`, et
--     `invoice.payment_failed` ne peut pas défaire un `actif` posé par
--     `invoice.paid` (ordre final indépendant de l'ordre de livraison).
--   * Règle facture : `paid` est terminal pour une facture Stripe ; un
--     `payment_failed` / `payment_action_required` d'une facture déjà payée
--     est périmé quel que soit son horodatage.
--   * Un abonnement relu chez Stripe (customer.subscription.*,
--     checkout.session.completed) est une observation au moins aussi fraîche
--     que son événement : à created égal il s'applique ; s'il est plus ancien
--     que le filigrane d'accès, seuls les champs non-statut (offre,
--     périodicité, échéances) sont rafraîchis, le statut d'accès est conservé.
--   * `invoice.payment_action_required` (3-D Secure) ne change JAMAIS le
--     statut d'accès et n'avance pas le filigrane d'accès.
--   * Décision produit conservée : `invoice.payment_failed` applicable =
--     suspension immédiate (aucune période de grâce).
--
-- Concurrence : chaque RPC ordonnée prend `SELECT … FOR UPDATE` sur la ligne
-- `entreprises` (abonnement) ou un verrou consultatif transactionnel
-- (`pg_advisory_xact_lock`, Connect / Tools) AVANT de lire le filigrane :
-- lecture du filigrane, décision et écriture sont atomiques et sérialisées
-- par objet. Ordre de verrouillage unique (entreprise → filigranes) : pas
-- d'interblocage entre chemins facture et abonnement.
--
-- Idempotence : outre la réservation existante (`abonnement_evenements`,
-- `stripe_webhook_events`, `tools_monetization_events`), chaque RPC ordonnée
-- est idempotente au niveau base : un stripe_event_id déjà présent dans
-- `stripe_evenements_ordre` renvoie `deja_traite` sans rien réappliquer.
--
-- Replay après échec (D3, Connect/Boutique) : `liberer_evenement_webhook_stripe_service`
-- libère la réservation d'un événement dont le traitement a échoué (500), pour
-- que la re-livraison Stripe soit rejouée au lieu d'être avalée comme doublon.
--
-- Additif. Aucune migration historique modifiée. Aucune donnée métier supprimée.
-- Aucun accès direct ajouté pour anon / authenticated / service_role sur les
-- nouvelles tables : écriture uniquement via RPC SECURITY DEFINER.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables du contrat d'ordre
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stripe_objets_ordre (
  flux text not null check (flux in ('abonnement', 'connect', 'tools')),
  objet_type text not null check (objet_type in ('invoice', 'subscription', 'entreprise_acces', 'account')),
  objet_id text not null check (char_length(objet_id) between 1 and 500),
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  dernier_evenement_id text not null,
  dernier_evenement_type text not null,
  dernier_evenement_created timestamptz not null,
  etat text,
  updated_at timestamptz not null default now(),
  primary key (flux, objet_type, objet_id)
);

comment on table public.stripe_objets_ordre is
  'Contrat d''ordre Stripe : dernier événement appliqué par objet Stripe métier (et état d''accès entreprise dérivé). Écrit uniquement par les RPC *_ordonne*/appliquer_evenement_*_service.';

create table if not exists public.stripe_evenements_ordre (
  id bigint generated always as identity primary key,
  flux text not null check (flux in ('abonnement', 'connect', 'tools')),
  stripe_event_id text not null check (char_length(stripe_event_id) between 1 and 255),
  stripe_event_type text not null,
  stripe_event_created timestamptz not null,
  objet_type text not null,
  objet_id text not null,
  entreprise_id uuid references public.entreprises(id) on delete set null,
  decision text not null check (decision in ('applique', 'perime', 'sans_effet')),
  transition text,
  etat_avant text,
  etat_apres text,
  motif text,
  processed_at timestamptz not null default now(),
  unique (flux, stripe_event_id)
);

create index if not exists stripe_evenements_ordre_objet_idx
  on public.stripe_evenements_ordre(flux, objet_type, objet_id, stripe_event_created desc);
create index if not exists stripe_evenements_ordre_entreprise_idx
  on public.stripe_evenements_ordre(entreprise_id, processed_at desc);

comment on table public.stripe_evenements_ordre is
  'Journal d''ordonnancement Stripe : une ligne par événement traité (appliqué, périmé ou sans effet), avec la transition métier. Lecture plateforme uniquement.';

alter table public.stripe_objets_ordre enable row level security;
alter table public.stripe_evenements_ordre enable row level security;

revoke all on public.stripe_objets_ordre from public, anon, authenticated, service_role;
revoke all on public.stripe_evenements_ordre from public, anon, authenticated, service_role;

-- Lecture réservée aux administrateurs plateforme (même règle que abonnement_evenements).
grant select on public.stripe_evenements_ordre to authenticated;
grant select on public.stripe_objets_ordre to authenticated;
drop policy if exists stripe_evenements_ordre_admin_select on public.stripe_evenements_ordre;
create policy stripe_evenements_ordre_admin_select on public.stripe_evenements_ordre
  for select to authenticated using (public.est_plateforme_admin());
drop policy if exists stripe_objets_ordre_admin_select on public.stripe_objets_ordre;
create policy stripe_objets_ordre_admin_select on public.stripe_objets_ordre
  for select to authenticated using (public.est_plateforme_admin());

-- Doublons de livraison : journalisés (compteur) sans rien réappliquer.
alter table public.abonnement_evenements
  add column if not exists livraisons_doublons integer not null default 0,
  add column if not exists derniere_livraison_doublon_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Réservation d'idempotence : compte les doublons au lieu de les ignorer
--    silencieusement (même signature, même valeur renvoyée).
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
  begin
    insert into public.abonnement_evenements(stripe_event_id, entreprise_id, type, payload)
    values (p_stripe_event_id, p_entreprise_id, nullif(btrim(p_type), ''), coalesce(p_payload, '{}'::jsonb));
    return 'reserve';
  exception
    when unique_violation then
      update public.abonnement_evenements
      set livraisons_doublons = livraisons_doublons + 1,
          derniere_livraison_doublon_at = now()
      where stripe_event_id = p_stripe_event_id;
      return 'duplicate';
  end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Facture d'abonnement : `paid` terminal, `payee_at` stable au rejeu.
--    Reprend 20260904000262 à l'identique, sauf la clause ON CONFLICT.
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
  if not exists (select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  insert into public.factures_abonnement as fa (
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
    -- Une facture Stripe payée ne redevient jamais impayée : un événement
    -- antérieur rejoué après le paiement ne dégrade ni le statut ni la date.
    statut = case when fa.statut = 'paid' then fa.statut else excluded.statut end,
    url_facture = excluded.url_facture,
    url_pdf = excluded.url_pdf,
    payee_at = coalesce(fa.payee_at, excluded.payee_at);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helpers internes (non exposés)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stripe_ordre_journaliser(
  p_flux text,
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_event_created timestamptz,
  p_objet_type text,
  p_objet_id text,
  p_entreprise_id uuid,
  p_decision text,
  p_etat_avant text,
  p_etat_apres text,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stripe_evenements_ordre(
    flux, stripe_event_id, stripe_event_type, stripe_event_created, objet_type, objet_id,
    entreprise_id, decision, transition, etat_avant, etat_apres, motif
  ) values (
    p_flux, p_stripe_event_id, p_stripe_event_type, p_stripe_event_created, p_objet_type, p_objet_id,
    p_entreprise_id, p_decision,
    case
      when p_decision <> 'applique' then 'aucune'
      when p_etat_avant is not distinct from p_etat_apres then coalesce(p_etat_apres, '∅') || ' (inchangé)'
      else coalesce(p_etat_avant, '∅') || ' -> ' || coalesce(p_etat_apres, '∅')
    end,
    p_etat_avant, p_etat_apres, p_motif
  )
  on conflict (flux, stripe_event_id) do nothing;
end;
$$;

create or replace function public.stripe_ordre_avancer(
  p_flux text,
  p_objet_type text,
  p_objet_id text,
  p_entreprise_id uuid,
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_event_created timestamptz,
  p_etat text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stripe_objets_ordre(
    flux, objet_type, objet_id, entreprise_id, dernier_evenement_id, dernier_evenement_type,
    dernier_evenement_created, etat, updated_at
  ) values (
    p_flux, p_objet_type, p_objet_id, p_entreprise_id, p_stripe_event_id, p_stripe_event_type,
    p_stripe_event_created, p_etat, now()
  )
  on conflict (flux, objet_type, objet_id) do update set
    entreprise_id = coalesce(excluded.entreprise_id, stripe_objets_ordre.entreprise_id),
    dernier_evenement_id = excluded.dernier_evenement_id,
    dernier_evenement_type = excluded.dernier_evenement_type,
    dernier_evenement_created = excluded.dernier_evenement_created,
    etat = excluded.etat,
    updated_at = now()
  -- Le filigrane ne recule jamais, même appelé hors ordre.
  where stripe_objets_ordre.dernier_evenement_created <= excluded.dernier_evenement_created;
end;
$$;

revoke all on function public.stripe_ordre_journaliser(text, text, text, timestamptz, text, text, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.stripe_ordre_avancer(text, text, text, uuid, text, text, timestamptz, text)
  from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Webhook abonnement — événement de facture (invoice.paid /
--    invoice.payment_failed / invoice.payment_action_required), atomique.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.appliquer_evenement_facture_abonnement_service(
  p_entreprise_id uuid,
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_event_created timestamptz,
  p_stripe_invoice_id text,
  p_invoice_status text,
  p_invoice_created timestamptz,
  p_numero text,
  p_periode_debut timestamptz,
  p_periode_fin timestamptz,
  p_montant_ht numeric,
  p_montant_tva numeric,
  p_montant_ttc numeric,
  p_devise text,
  p_url_facture text,
  p_url_pdf text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut_avant text;
  v_statut_apres text;
  v_cible text;
  v_deja record;
  v_facture_ordre record;
  v_acces record;
  v_facture_statut text;
  v_facture_perimee boolean := false;
  v_acces_perime boolean := false;
  v_decision text;
  v_motif text;
  v_statut_facture text := coalesce(nullif(btrim(p_invoice_status), ''), replace(p_stripe_event_type, 'invoice.', ''));
begin
  if nullif(btrim(p_stripe_event_id), '') is null or nullif(btrim(p_stripe_invoice_id), '') is null then
    raise exception 'Identifiants Stripe obligatoires' using errcode = '22023';
  end if;
  if p_stripe_event_created is null then
    raise exception 'event.created obligatoire pour l''ordonnancement' using errcode = '22023';
  end if;
  v_cible := case p_stripe_event_type
    when 'invoice.paid' then 'actif'
    when 'invoice.payment_failed' then 'suspendu'
    when 'invoice.payment_action_required' then null
    else 'invalide'
  end;
  if v_cible = 'invalide' then
    raise exception 'Type d''événement facture non ordonnançable' using errcode = '22023';
  end if;

  -- Verrou de ligne : sérialise toutes les transitions d'accès d'une entreprise.
  select abonnement_statut into v_statut_avant
  from public.entreprises where id = p_entreprise_id
  for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  -- Idempotence base : un événement déjà décidé n'est jamais réappliqué.
  select decision, etat_apres into v_deja
  from public.stripe_evenements_ordre
  where flux = 'abonnement' and stripe_event_id = p_stripe_event_id;
  if found then
    return jsonb_build_object('decision', 'deja_traite', 'decision_initiale', v_deja.decision,
      'statut_resultant', v_statut_avant, 'notifier_echec', false);
  end if;

  select * into v_facture_ordre from public.stripe_objets_ordre
  where flux = 'abonnement' and objet_type = 'invoice' and objet_id = p_stripe_invoice_id
  for update;
  select statut into v_facture_statut from public.factures_abonnement
  where stripe_invoice_id = p_stripe_invoice_id;

  -- Facture : `paid` est terminal ; sinon, un événement plus ancien que le
  -- dernier appliqué à CETTE facture est périmé.
  if p_stripe_event_type <> 'invoice.paid'
     and (v_facture_statut = 'paid' or v_facture_ordre.etat = 'paid') then
    v_facture_perimee := true;
    v_motif := 'facture_deja_payee';
  elsif v_facture_ordre.dernier_evenement_created is not null
     and p_stripe_event_created < v_facture_ordre.dernier_evenement_created then
    v_facture_perimee := true;
    v_motif := 'evenement_facture_anterieur';
  end if;

  select * into v_acces from public.stripe_objets_ordre
  where flux = 'abonnement' and objet_type = 'entreprise_acces' and objet_id = p_entreprise_id::text
  for update;

  -- Accès entreprise : filigrane transverse (factures + abonnement).
  if v_acces.dernier_evenement_created is not null then
    if p_stripe_event_created < v_acces.dernier_evenement_created then
      v_acces_perime := true;
    elsif p_stripe_event_created = v_acces.dernier_evenement_created
       and v_acces.dernier_evenement_type not like 'invoice.%' then
      -- Égalité à la seconde avec une observation d'abonnement RELUE chez
      -- Stripe (customer.subscription.*, checkout) : la relecture, au moins
      -- aussi fraîche que l'événement facture, gagne (ex. essai relu
      -- « trialing » vs invoice.paid 0 € de l'essai, même seconde).
      v_acces_perime := true;
    elsif p_stripe_event_created = v_acces.dernier_evenement_created
       and v_cible = 'suspendu' and v_acces.etat = 'actif'
       and v_acces.dernier_evenement_type = 'invoice.paid' then
      -- Égalité à la seconde : le paiement réussi gagne (résultat
      -- indépendant de l'ordre de livraison).
      v_acces_perime := true;
    end if;
  end if;
  if v_acces_perime and v_motif is null then
    v_motif := 'evenement_anterieur_au_dernier_applique';
  end if;

  if v_facture_perimee or v_acces_perime then
    v_decision := 'perime';
    v_statut_apres := v_statut_avant;
  elsif v_cible is null then
    -- 3-D Secure à confirmer : jamais un échec, jamais un changement d'accès.
    v_decision := 'sans_effet';
    v_motif := 'authentification_3ds_en_attente';
    v_statut_apres := v_statut_avant;
    update public.entreprises set
      derniere_facture_stripe_id = p_stripe_invoice_id,
      derniere_facture_url = nullif(btrim(p_url_facture), ''),
      derniere_facture_pdf = nullif(btrim(p_url_pdf), ''),
      derniere_facture_statut = v_statut_facture,
      derniere_facture_at = coalesce(p_invoice_created, p_stripe_event_created),
      updated_at = now()
    where id = p_entreprise_id;
  else
    v_decision := 'applique';
    v_statut_apres := v_cible;
    update public.entreprises set
      abonnement_statut = v_cible,
      impaye_signale_at = case when v_cible = 'actif' then null else impaye_signale_at end,
      suspension_prevue_at = case when v_cible = 'actif' then null else suspension_prevue_at end,
      abonnement_dernier_evenement_at = p_stripe_event_created,
      derniere_facture_stripe_id = p_stripe_invoice_id,
      derniere_facture_url = nullif(btrim(p_url_facture), ''),
      derniere_facture_pdf = nullif(btrim(p_url_pdf), ''),
      derniere_facture_statut = v_statut_facture,
      derniere_facture_at = coalesce(p_invoice_created, p_stripe_event_created),
      updated_at = now()
    where id = p_entreprise_id;
    perform public.stripe_ordre_avancer('abonnement', 'entreprise_acces', p_entreprise_id::text, p_entreprise_id,
      p_stripe_event_id, p_stripe_event_type, p_stripe_event_created, v_cible);
  end if;

  -- La ligne de facture suit la chronologie de la facture elle-même (un
  -- événement d'accès périmé peut rester frais pour sa facture : ex. le
  -- payment_failed d'une facture B livré après le paid d'une facture A plus
  -- récente — la facture B doit rester visible comme impayée).
  if not v_facture_perimee then
    perform public.synchroniser_facture_abonnement_service(
      p_entreprise_id, p_stripe_invoice_id, p_numero, p_periode_debut, p_periode_fin,
      p_montant_ht, p_montant_tva, p_montant_ttc, p_devise, v_statut_facture, p_url_facture, p_url_pdf);
    -- `payment_action_required` est informatif : il n'avance pas le filigrane
    -- de la facture, sinon un `payment_failed` antérieur livré après lui
    -- serait jugé périmé alors que, dans l'ordre Stripe, il a bien eu lieu.
    if p_stripe_event_type <> 'invoice.payment_action_required' then
      perform public.stripe_ordre_avancer('abonnement', 'invoice', p_stripe_invoice_id, p_entreprise_id,
        p_stripe_event_id, p_stripe_event_type, p_stripe_event_created,
        case when p_stripe_event_type = 'invoice.paid' then 'paid' else v_statut_facture end);
    end if;
  end if;

  perform public.stripe_ordre_journaliser('abonnement', p_stripe_event_id, p_stripe_event_type, p_stripe_event_created,
    'invoice', p_stripe_invoice_id, p_entreprise_id, v_decision, v_statut_avant, v_statut_apres, v_motif);

  return jsonb_build_object(
    'decision', v_decision,
    'motif', v_motif,
    'statut_resultant', v_statut_apres,
    'statut_avant', v_statut_avant,
    -- Seul un échec réellement appliqué notifie : un rejeu périmé n'envoie rien.
    'notifier_echec', v_decision = 'applique' and p_stripe_event_type = 'invoice.payment_failed'
  );
end;
$$;

comment on function public.appliquer_evenement_facture_abonnement_service(uuid, text, text, timestamptz, text, text, timestamptz, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text) is
  'Webhook abonnement : applique atomiquement (verrou ligne entreprise) un événement invoice.* selon le contrat d''ordre Stripe (event.created). Périmé = journalisé sans effet. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Webhook abonnement — synchronisation d'un abonnement relu chez Stripe,
--    ordonnée (customer.subscription.*, checkout.session.completed).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.synchroniser_abonnement_stripe_ordonne_service(
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
  p_fin_periode timestamptz,
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_event_created timestamptz,
  p_objet_type text,
  p_objet_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut_avant text;
  v_statut_effectif text;
  v_deja record;
  v_acces record;
  v_perime boolean := false;
begin
  if nullif(btrim(p_stripe_event_id), '') is null then
    raise exception 'stripe_event_id obligatoire' using errcode = '22023';
  end if;
  if p_stripe_event_created is null then
    raise exception 'event.created obligatoire pour l''ordonnancement' using errcode = '22023';
  end if;

  select abonnement_statut into v_statut_avant
  from public.entreprises where id = p_entreprise_id
  for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  select decision, etat_apres into v_deja
  from public.stripe_evenements_ordre
  where flux = 'abonnement' and stripe_event_id = p_stripe_event_id;
  if found then
    return jsonb_build_object('decision', 'deja_traite', 'decision_initiale', v_deja.decision, 'statut_resultant', v_statut_avant);
  end if;

  select * into v_acces from public.stripe_objets_ordre
  where flux = 'abonnement' and objet_type = 'entreprise_acces' and objet_id = p_entreprise_id::text
  for update;
  -- Observation relue chez Stripe : au moins aussi fraîche que son événement,
  -- elle gagne l'égalité ; strictement plus ancienne que le filigrane, elle ne
  -- peut pas inverser l'état d'accès.
  v_perime := v_acces.dernier_evenement_created is not null
    and p_stripe_event_created < v_acces.dernier_evenement_created;
  v_statut_effectif := case when v_perime then coalesce(v_statut_avant, p_statut) else p_statut end;

  -- Garde tenant, validation du statut et contrat tarifaire : fonction existante.
  perform public.synchroniser_abonnement_stripe_service(
    p_entreprise_id, p_stripe_subscription_id, p_stripe_customer_id, v_statut_effectif,
    p_offre, p_periodicite, p_echeance, p_essai_fin, p_annulation_prevue_at, p_debut_periode, p_fin_periode);

  if not v_perime then
    update public.entreprises set abonnement_dernier_evenement_at = p_stripe_event_created
    where id = p_entreprise_id;
    perform public.stripe_ordre_avancer('abonnement', 'entreprise_acces', p_entreprise_id::text, p_entreprise_id,
      p_stripe_event_id, p_stripe_event_type, p_stripe_event_created, p_statut);
  end if;
  perform public.stripe_ordre_avancer('abonnement', 'subscription', p_stripe_subscription_id, p_entreprise_id,
    p_stripe_event_id, p_stripe_event_type, p_stripe_event_created, p_statut);

  perform public.stripe_ordre_journaliser('abonnement', p_stripe_event_id, p_stripe_event_type, p_stripe_event_created,
    coalesce(nullif(btrim(p_objet_type), ''), 'subscription'), coalesce(nullif(btrim(p_objet_id), ''), p_stripe_subscription_id),
    p_entreprise_id,
    case when v_perime then 'perime' else 'applique' end,
    v_statut_avant, v_statut_effectif,
    case when v_perime then 'statut_conserve_evenement_anterieur_champs_rafraichis' else null end);

  return jsonb_build_object(
    'decision', case when v_perime then 'perime' else 'applique' end,
    'statut_resultant', v_statut_effectif,
    'statut_avant', v_statut_avant
  );
end;
$$;

comment on function public.synchroniser_abonnement_stripe_ordonne_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz, text, text, timestamptz, text, text) is
  'Webhook abonnement : synchronise un abonnement relu chez Stripe sous verrou ligne entreprise ; le statut d''accès ne recule pas devant un événement antérieur au filigrane. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Journal d'un événement abonnement hors statut (invoice.created, …).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.journaliser_evenement_stripe_ordre_service(
  p_flux text,
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_event_created timestamptz,
  p_objet_type text,
  p_objet_id text,
  p_entreprise_id uuid,
  p_motif text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_flux not in ('abonnement', 'connect', 'tools') or p_stripe_event_created is null
     or nullif(btrim(p_stripe_event_id), '') is null or nullif(btrim(p_objet_id), '') is null then
    raise exception 'Journal d''ordonnancement invalide' using errcode = '22023';
  end if;
  perform public.stripe_ordre_journaliser(p_flux, p_stripe_event_id, p_stripe_event_type, p_stripe_event_created,
    p_objet_type, p_objet_id, p_entreprise_id, 'sans_effet', null, null, coalesce(p_motif, 'hors_statut'));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Stripe Connect : account.updated ordonné (payload instantané) et
--    expiration Checkout qui ne défait jamais un paiement.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stripe_connect_maj_compte_service(
  p_stripe_account_id text,
  p_onboarding_complete boolean,
  p_stripe_event_id text,
  p_stripe_event_created timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ordre record;
  v_entreprise_id uuid;
  v_avant boolean;
begin
  if nullif(btrim(p_stripe_account_id), '') is null or nullif(btrim(p_stripe_event_id), '') is null
     or p_stripe_event_created is null or p_onboarding_complete is null then
    raise exception 'Événement account.updated invalide' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-connect-account:' || p_stripe_account_id, 0));

  if exists (select 1 from public.stripe_evenements_ordre where flux = 'connect' and stripe_event_id = p_stripe_event_id) then
    return 'deja_traite';
  end if;

  select id, stripe_onboarding_complete into v_entreprise_id, v_avant
  from public.entreprises where stripe_account_id = p_stripe_account_id
  for update;

  select * into v_ordre from public.stripe_objets_ordre
  where flux = 'connect' and objet_type = 'account' and objet_id = p_stripe_account_id;

  if v_ordre.dernier_evenement_created is not null and p_stripe_event_created < v_ordre.dernier_evenement_created then
    perform public.stripe_ordre_journaliser('connect', p_stripe_event_id, 'account.updated', p_stripe_event_created,
      'account', p_stripe_account_id, v_entreprise_id, 'perime', v_avant::text, v_avant::text, 'evenement_anterieur_au_dernier_applique');
    return 'perime';
  end if;
  if v_entreprise_id is null then
    perform public.stripe_ordre_journaliser('connect', p_stripe_event_id, 'account.updated', p_stripe_event_created,
      'account', p_stripe_account_id, null, 'sans_effet', null, null, 'compte_non_rattache');
    return 'ignore';
  end if;

  update public.entreprises set stripe_onboarding_complete = p_onboarding_complete
  where id = v_entreprise_id;
  perform public.stripe_ordre_avancer('connect', 'account', p_stripe_account_id, v_entreprise_id,
    p_stripe_event_id, 'account.updated', p_stripe_event_created, p_onboarding_complete::text);
  perform public.stripe_ordre_journaliser('connect', p_stripe_event_id, 'account.updated', p_stripe_event_created,
    'account', p_stripe_account_id, v_entreprise_id, 'applique', v_avant::text, p_onboarding_complete::text, null);
  return 'applique';
end;
$$;

create or replace function public.stripe_connect_expirer_checkout_facture_service(
  p_facture_id uuid,
  p_checkout_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Une session payée n'est jamais « expirée » a posteriori (rejeu ou
  -- livraison tardive) : l'état payé est terminal.
  update public.factures
  set stripe_payment_status = 'expired'
  where id = p_facture_id and stripe_checkout_id = p_checkout_id
    and stripe_payment_status is distinct from 'paid';
end;
$$;

-- Replay après échec (D3) : libère la réservation d'un événement Connect /
-- Boutique dont le traitement a échoué, pour que Stripe puisse le rejouer.
create or replace function public.liberer_evenement_webhook_stripe_service(
  p_stripe_event_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.stripe_webhook_events where id = p_stripe_event_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Tools : application ordonnée d'un abonnement relu chez Stripe.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tools_server_appliquer_abonnement_ordonne(
  p_payload jsonb,
  p_stripe_event_created timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text := p_payload->>'external_subscription_id';
  v_event_id text := p_payload->>'external_event_id';
  v_event_type text := coalesce(p_payload->>'event_type', 'inconnu');
  v_ordre record;
  v_existant uuid;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accès réservé au serveur de paiement';
  end if;
  if nullif(btrim(v_sub), '') is null or nullif(btrim(v_event_id), '') is null or p_stripe_event_created is null then
    raise exception 'Abonnement Tools invalide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-tools-subscription:' || v_sub, 0));

  select id into v_existant from public.tools_monetization_subscriptions
  where provider = p_payload->>'provider' and environment = p_payload->>'environment' and external_subscription_id = v_sub;

  if exists (select 1 from public.stripe_evenements_ordre where flux = 'tools' and stripe_event_id = v_event_id) then
    return jsonb_build_object('decision', 'deja_traite', 'subscription_id', v_existant);
  end if;

  select * into v_ordre from public.stripe_objets_ordre
  where flux = 'tools' and objet_type = 'subscription' and objet_id = v_sub;
  if v_ordre.dernier_evenement_created is not null and p_stripe_event_created < v_ordre.dernier_evenement_created then
    perform public.stripe_ordre_journaliser('tools', v_event_id, v_event_type, p_stripe_event_created,
      'subscription', v_sub, null, 'perime', v_ordre.etat, v_ordre.etat, 'evenement_anterieur_au_dernier_applique');
    return jsonb_build_object('decision', 'perime', 'subscription_id', v_existant);
  end if;

  v_id := public.tools_server_appliquer_abonnement(p_payload);
  perform public.stripe_ordre_avancer('tools', 'subscription', v_sub, null,
    v_event_id, v_event_type, p_stripe_event_created, p_payload->>'status');
  perform public.stripe_ordre_journaliser('tools', v_event_id, v_event_type, p_stripe_event_created,
    'subscription', v_sub, null, 'applique', v_ordre.etat, p_payload->>'status', null);
  return jsonb_build_object('decision', 'applique', 'subscription_id', v_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ACL — chemin de service uniquement
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.reserver_evenement_abonnement_service(text, uuid, text, jsonb)',
    'public.synchroniser_facture_abonnement_service(uuid, text, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text)',
    'public.appliquer_evenement_facture_abonnement_service(uuid, text, text, timestamptz, text, text, timestamptz, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text)',
    'public.synchroniser_abonnement_stripe_ordonne_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz, text, text, timestamptz, text, text)',
    'public.journaliser_evenement_stripe_ordre_service(text, text, text, timestamptz, text, text, uuid, text)',
    'public.stripe_connect_maj_compte_service(text, boolean, text, timestamptz)',
    'public.stripe_connect_expirer_checkout_facture_service(uuid, text)',
    'public.liberer_evenement_webhook_stripe_service(text)',
    'public.tools_server_appliquer_abonnement_ordonne(jsonb, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
