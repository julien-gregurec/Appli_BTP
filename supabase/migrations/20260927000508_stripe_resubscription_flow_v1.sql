-- ELSATIA — Stripe Resubscription Flow V1
-- (rapport docs/qualification/ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1.md)
--
-- Constat (base : Stripe Ordering 506 + Stripe Trial Synchronization 507) : une entreprise dont
-- la subscription Stripe a été annulée n'avait AUCUN parcours de réabonnement.
--
--   * `entreprises.stripe_subscription_id` n'est jamais remis à NULL : Checkout refusait
--     (`AbonnementStripeDejaRattache`) toute nouvelle souscription, pour toujours ;
--   * même créée à la main chez Stripe, la nouvelle subscription était refusée par
--     `lier_subscription_entreprise_service` / `synchroniser_abonnement_stripe_service`
--     (42501, CAS sur NULL uniquement) : 422 / 500 re-livrés en boucle, accès jamais rendu ;
--   * `invoice.*` n'était pas filtré par subscription : après un réabonnement, un
--     `invoice.payment_failed` tardif de l'ANCIENNE subscription aurait suspendu la nouvelle,
--     et un `invoice.paid` d'une ancienne facture aurait rouvert l'accès d'une entreprise annulée.
--
-- Ce fichier (additif) :
--
-- 1. `stripe_subscriptions_remplacees` : historique des subscriptions remplacées par un
--    réabonnement (jamais re-rattachables, leurs événements tardifs sont sans effet).
-- 2. `relier_subscription_reabonnement_service` : SEUL chemin qui remplace la subscription
--    rattachée à une entreprise. Conditions cumulatives (fail-closed, 42501 sinon) :
--      - l'ancienne subscription est bien celle rattachée ;
--      - son statut Stripe, RELU par le serveur, est terminal (`canceled`, `incomplete_expired`) :
--        la garde anti-double abonnement reste entière (jamais deux subscriptions vivantes) ;
--      - le client Stripe est le même (pas de customer par réabonnement) ;
--      - la nouvelle subscription n'a jamais été remplacée auparavant.
--    Une nouvelle subscription déjà terminale n'est jamais rattachée (`terminale_ignoree`).
--    Au rattachement : l'essai local est clos (un essai ELSATIA consommé ne se rouvre jamais,
--    même si Stripe annonçait un `trialing`), l'annulation programmée est effacée, et le
--    filigrane d'accès de l'entreprise (contrat d'ordre 506) est réinitialisé : il appartenait à
--    l'ancienne subscription, dont les événements sont désormais filtrés.
-- 3. `appliquer_evenement_facture_abonnement_v2_service` : même contrat que la RPC facture 506,
--    précédé d'une garde de subscription sous le même verrou de ligne :
--      - facture de la subscription courante (ou sans subscription, ou entreprise encore jamais
--        liée) → contrat 506 inchangé ;
--      - facture d'une subscription REMPLACÉE → ligne de facture tenue à jour, accès inchangé,
--        journal `sans_effet` (`subscription_remplacee`) ;
--      - facture d'une subscription INCONNUE (nouvelle subscription pas encore rattachée, ou
--        subscription parasite) → `differe` : rien n'est écrit, le webhook répond 503 et Stripe
--        re-livre ; la relecture de subscription reste l'autorité de l'accès.
-- 4. `etat_reabonnement_entreprise` : la RLS masque l'entreprise à ses membres dès qu'elle est
--    suspendue ou annulée ; cette lecture bornée (membre actif ou support, aucun identifiant
--    Stripe) rend l'écran de reprise et le contrôle du droit `gerer_parametres` possibles.
--
-- Signatures 506/507 inchangées. Aucune migration historique modifiée. Aucune donnée supprimée
-- hors la ligne de filigrane `entreprise_acces` réinitialisée au rattachement.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Historique des subscriptions remplacées
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stripe_subscriptions_remplacees (
  id bigint generated always as identity primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  stripe_subscription_id text not null check (char_length(stripe_subscription_id) between 1 and 255),
  remplacee_par text not null check (char_length(remplacee_par) between 1 and 255),
  statut_stripe_observe text not null check (statut_stripe_observe in ('canceled', 'incomplete_expired')),
  stripe_customer_id text,
  remplacee_at timestamptz not null default now(),
  unique (stripe_subscription_id),
  check (stripe_subscription_id <> remplacee_par)
);

create index if not exists stripe_subscriptions_remplacees_entreprise_idx
  on public.stripe_subscriptions_remplacees(entreprise_id, remplacee_at desc);

comment on table public.stripe_subscriptions_remplacees is
  'Réabonnement Stripe (ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1) : subscriptions terminées remplacées par une nouvelle subscription du même client. Jamais re-rattachables ; leurs événements tardifs sont sans effet sur l''accès. Écriture par relier_subscription_reabonnement_service uniquement.';

alter table public.stripe_subscriptions_remplacees enable row level security;
revoke all on public.stripe_subscriptions_remplacees from public, anon, authenticated, service_role;
grant select on public.stripe_subscriptions_remplacees to authenticated;

drop policy if exists stripe_subscriptions_remplacees_lecture_plateforme on public.stripe_subscriptions_remplacees;
create policy stripe_subscriptions_remplacees_lecture_plateforme on public.stripe_subscriptions_remplacees
  for select to authenticated
  using (public.plateforme_a_permission('gerer_facturation'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rattachement d'une nouvelle subscription (première liaison ou réabonnement)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.relier_subscription_reabonnement_service(
  p_entreprise_id uuid,
  p_nouvelle_subscription_id text,
  p_stripe_customer_id text,
  p_nouvelle_statut_stripe text,
  p_ancienne_subscription_id text default null,
  p_ancienne_statut_stripe text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_courante text;
  v_customer text;
  v_essai_debut date;
  v_essai_fin date;
  v_nouvelle text := nullif(btrim(p_nouvelle_subscription_id), '');
  v_client text := nullif(btrim(p_stripe_customer_id), '');
begin
  if v_nouvelle is null then
    raise exception 'Identifiant de subscription Stripe manquant' using errcode = '22023';
  end if;

  -- Verrou de ligne : même ordre de verrouillage que les RPC ordonnées (506).
  select stripe_subscription_id, stripe_customer_id, abonnement_essai_debut, abonnement_essai_fin
    into v_courante, v_customer, v_essai_debut, v_essai_fin
  from public.entreprises where id = p_entreprise_id
  for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  if v_courante = v_nouvelle then
    return 'deja_lie';
  end if;

  -- Une subscription remplacée ne redevient jamais la subscription courante.
  if exists (select 1 from public.stripe_subscriptions_remplacees
             where stripe_subscription_id = v_nouvelle) then
    return 'remplacee';
  end if;

  -- Une subscription déjà terminale n'ouvre rien : jamais rattachée.
  if p_nouvelle_statut_stripe in ('canceled', 'incomplete_expired') then
    return 'terminale_ignoree';
  end if;

  -- Même client Stripe obligatoire : pas de customer par réabonnement, et une
  -- subscription d'un autre client n'est jamais rattachée.
  if v_customer is not null and v_client is distinct from v_customer then
    raise exception 'Client Stripe différent de celui de l''entreprise' using errcode = '42501';
  end if;

  if v_courante is null then
    -- Première liaison : contrat historique (CAS sur NULL).
    return public.lier_subscription_entreprise_service(p_entreprise_id, v_nouvelle, v_client);
  end if;

  if v_courante is distinct from nullif(btrim(p_ancienne_subscription_id), '') then
    raise exception 'Subscription Stripe non liée à cette entreprise' using errcode = '42501';
  end if;
  -- Garde anti-double abonnement : l'ancienne doit être terminée CHEZ STRIPE.
  if p_ancienne_statut_stripe is null or p_ancienne_statut_stripe not in ('canceled', 'incomplete_expired') then
    raise exception 'La subscription rattachée est encore active chez Stripe' using errcode = '42501';
  end if;

  insert into public.stripe_subscriptions_remplacees(
    entreprise_id, stripe_subscription_id, remplacee_par, statut_stripe_observe, stripe_customer_id
  ) values (p_entreprise_id, v_courante, v_nouvelle, p_ancienne_statut_stripe, v_customer);

  update public.entreprises set
    stripe_subscription_id = v_nouvelle,
    stripe_customer_id = coalesce(v_customer, v_client),
    abonnement_annulation_prevue_at = null,
    -- Essai ELSATIA consommé : la fenêtre locale est close (hier au plus tard,
    -- jamais avant son début : contrainte entreprises_essai_dates_coherentes).
    abonnement_essai_fin = case
      when v_essai_debut is null then abonnement_essai_fin
      else greatest(v_essai_debut, least(coalesce(v_essai_fin, v_essai_debut + 30), current_date - 1))
    end,
    updated_at = now()
  where id = p_entreprise_id;

  -- Le filigrane d'accès appartenait à l'ancienne subscription : ses événements
  -- sont désormais filtrés (remplacée), la nouvelle repart de sa propre chronologie.
  delete from public.stripe_objets_ordre
  where flux = 'abonnement' and objet_type = 'entreprise_acces' and objet_id = p_entreprise_id::text;

  return 'relie';
end;
$$;

comment on function public.relier_subscription_reabonnement_service(uuid, text, text, text, text, text) is
  'Webhook abonnement : rattache une subscription Stripe (première liaison, ou réabonnement si l''ancienne est terminée chez Stripe et le client identique). Historise l''ancienne, clôt l''essai local, réinitialise le filigrane d''accès. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Événement de facture filtré par subscription
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.appliquer_evenement_facture_abonnement_v2_service(
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
  p_url_pdf text,
  p_stripe_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_courante text;
  v_statut text;
  v_sub text := nullif(btrim(p_stripe_subscription_id), '');
  v_deja record;
  v_statut_facture text := coalesce(nullif(btrim(p_invoice_status), ''), replace(p_stripe_event_type, 'invoice.', ''));
begin
  if nullif(btrim(p_stripe_event_id), '') is null or nullif(btrim(p_stripe_invoice_id), '') is null then
    raise exception 'Identifiants Stripe obligatoires' using errcode = '22023';
  end if;
  if p_stripe_event_created is null then
    raise exception 'event.created obligatoire pour l''ordonnancement' using errcode = '22023';
  end if;

  select stripe_subscription_id, abonnement_statut into v_courante, v_statut
  from public.entreprises where id = p_entreprise_id
  for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  if v_sub is null or v_courante is null or v_courante = v_sub then
    return public.appliquer_evenement_facture_abonnement_service(
      p_entreprise_id, p_stripe_event_id, p_stripe_event_type, p_stripe_event_created,
      p_stripe_invoice_id, p_invoice_status, p_invoice_created, p_numero, p_periode_debut, p_periode_fin,
      p_montant_ht, p_montant_tva, p_montant_ttc, p_devise, p_url_facture, p_url_pdf);
  end if;

  select decision into v_deja from public.stripe_evenements_ordre
  where flux = 'abonnement' and stripe_event_id = p_stripe_event_id;
  if found then
    return jsonb_build_object('decision', 'deja_traite', 'decision_initiale', v_deja.decision,
      'statut_resultant', v_statut, 'notifier_echec', false);
  end if;

  if exists (select 1 from public.stripe_subscriptions_remplacees
             where entreprise_id = p_entreprise_id and stripe_subscription_id = v_sub) then
    -- Facture réelle du client (historique) ; jamais une transition d'accès.
    perform public.synchroniser_facture_abonnement_service(
      p_entreprise_id, p_stripe_invoice_id, p_numero, p_periode_debut, p_periode_fin,
      p_montant_ht, p_montant_tva, p_montant_ttc, p_devise, v_statut_facture, p_url_facture, p_url_pdf);
    perform public.stripe_ordre_journaliser('abonnement', p_stripe_event_id, p_stripe_event_type, p_stripe_event_created,
      'invoice', p_stripe_invoice_id, p_entreprise_id, 'sans_effet', v_statut, v_statut, 'subscription_remplacee');
    return jsonb_build_object('decision', 'sans_effet', 'motif', 'subscription_remplacee',
      'statut_resultant', v_statut, 'statut_avant', v_statut, 'notifier_echec', false);
  end if;

  -- Subscription inconnue : rien n'est écrit ni journalisé, l'événement reste rejouable.
  return jsonb_build_object('decision', 'differe', 'motif', 'subscription_non_rattachee',
    'statut_resultant', v_statut, 'statut_avant', v_statut, 'notifier_echec', false);
end;
$$;

comment on function public.appliquer_evenement_facture_abonnement_v2_service(uuid, text, text, timestamptz, text, text, timestamptz, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text) is
  'Webhook abonnement : contrat d''ordre facture (506) précédé d''une garde de subscription. Facture d''une subscription remplacée : sans effet sur l''accès ; subscription inconnue : différé (rejouable). Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. État de reprise lisible par les membres d'une entreprise annulée / suspendue
-- ─────────────────────────────────────────────────────────────────────────────
-- La policy « membres voient leur entreprise » (est_membre_actif) masque la ligne
-- `entreprises` dès que l'abonnement est suspendu ou annulé, ainsi que les
-- permissions de poste : ni l'écran de reprise ni le contrôle du droit
-- `gerer_parametres` ne pouvaient lire quoi que ce soit, et aucun administrateur
-- ne pouvait se réabonner ni régulariser. Cette fonction expose, au seul membre
-- ACTIF (ou à l'accès support actif) d'une entreprise, l'état minimal de reprise :
-- jamais d'identifiant Stripe, seulement des booléens et l'URL de facture Stripe.

create or replace function public.etat_reabonnement_entreprise(p_entreprise_id uuid)
returns table(
  abonnement_statut text,
  subscription_rattachee boolean,
  annulation_prevue_at timestamptz,
  derniere_facture_statut text,
  derniere_facture_url text,
  peut_gerer boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.abonnement_statut,
         e.stripe_subscription_id is not null,
         e.abonnement_annulation_prevue_at,
         e.derniere_facture_statut,
         e.derniere_facture_url,
         public.est_acces_support_actif(e.id) or exists (
           select 1 from public.permissions_poste pp
           where pp.entreprise_id = e.id and pp.poste_id = ue.poste_id
             and pp.cle_permission = 'gerer_parametres' and pp.autorise = true)
  from public.entreprises e
  left join public.utilisateurs_entreprises ue
    on ue.entreprise_id = e.id and ue.utilisateur_id = auth.uid() and ue.statut = 'actif'
  where e.id = p_entreprise_id
    and auth.uid() is not null
    and not public.session_courante_revoquee()
    and (ue.utilisateur_id is not null or public.est_acces_support_actif(e.id));
$$;

comment on function public.etat_reabonnement_entreprise(uuid) is
  'Réabonnement (ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1) : état de reprise d''abonnement pour un membre actif (ou l''accès support), y compris quand l''entreprise est suspendue ou annulée. Aucun identifiant Stripe exposé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ACL — chemin de service uniquement (sauf l'état de reprise, membres)
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.relier_subscription_reabonnement_service(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.relier_subscription_reabonnement_service(uuid, text, text, text, text, text)
  to service_role;
revoke all on function public.appliquer_evenement_facture_abonnement_v2_service(uuid, text, text, timestamptz, text, text, timestamptz, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.appliquer_evenement_facture_abonnement_v2_service(uuid, text, text, timestamptz, text, text, timestamptz, text, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text)
  to service_role;

revoke all on function public.etat_reabonnement_entreprise(uuid) from public, anon;
grant execute on function public.etat_reabonnement_entreprise(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
