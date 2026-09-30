-- Train canonique V8 : numéro d'origine 20260928000702 (D. Incident Response (claude/serene-franklin-rgu054)), renuméroté 20260928000808
-- (bloc V8 strictement après la dernière migration de V7, 20260928000701, projet partagé) ; corps inchangé.
-- ═══════════════════════════════════════════════════════════════════════════
-- ELSATIA — PRODUCTION INCIDENT RESPONSE & SAFE MODE V1 — reprise des
-- réservations de webhook Stripe ORPHELINES.
--
-- Rapport : docs/qualification/ELSATIA_PRODUCTION_INCIDENT_RESPONSE_SAFE_MODE_V1.md §14
--
-- Constat (simulation « base indisponible pendant un webhook ») :
--   Les webhooks SaaS (`abonnement_evenements`) et Connect/boutique
--   (`stripe_webhook_events`) RÉSERVENT l'événement (ligne insérée, commit), puis
--   traitent, puis — en cas d'échec — SUPPRIMENT la réservation pour que Stripe
--   rejoue. Si la base (ou le réseau) tombe entre la réservation et la fin du
--   traitement, la suppression échoue elle aussi : la réservation reste, et
--   chaque re-livraison de Stripe est avalée comme « doublon » (HTTP 200). Aucun
--   marqueur ne distinguait un événement traité d'une réservation abandonnée :
--   l'événement était PERDU EN SILENCE (droit commercial potentiellement
--   incohérent après l'incident).
--
-- Correction (même règle que tools_monetization_events, qui reprend déjà une
-- ligne « processing » de plus de 5 minutes) :
--   • `finalise_at` : posé à la fin d'un traitement réussi ;
--   • une réservation NON finalisée depuis plus de 5 minutes est reprise par la
--     re-livraison suivante (`reprises_orphelines` compte ces reprises) ;
--   • historique : toutes les lignes existantes sont considérées finalisées
--     (aucun rejeu rétroactif).
-- Sûr : les traitements métier sont idempotents et ordonnés en base
-- (stripe_event_ordering_v1, boutique_finaliser_commande_payee, encaissement
-- Connect par checkout). Une livraison concurrente d'un événement EN COURS
-- (< 5 min) reste un doublon, comme avant.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Journal SaaS : abonnement_evenements ───────────────────────────────
alter table public.abonnement_evenements
  add column if not exists finalise_at timestamptz,
  add column if not exists reprises_orphelines integer not null default 0;

set elsatia.incident_contournement = 'on';
update public.abonnement_evenements set finalise_at = created_at where finalise_at is null;
reset elsatia.incident_contournement;

create index if not exists abonnement_evenements_non_finalises_idx
  on public.abonnement_evenements (created_at) where finalise_at is null;

create or replace function public.reserver_evenement_abonnement_service(
  p_stripe_event_id text, p_entreprise_id uuid, p_type text, p_payload jsonb default '{}'::jsonb
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
      -- Réservation orpheline (traitement interrompu sans finalisation ni
      -- libération) : reprise par cette livraison. La clause WHERE est
      -- réévaluée après verrouillage : une seule livraison concurrente gagne.
      update public.abonnement_evenements
         set created_at = now(),
             entreprise_id = coalesce(p_entreprise_id, entreprise_id),
             payload = coalesce(p_payload, payload),
             reprises_orphelines = reprises_orphelines + 1
       where stripe_event_id = p_stripe_event_id
         and finalise_at is null
         and created_at < now() - interval '5 minutes';
      if found then
        return 'reserve';
      end if;
      update public.abonnement_evenements
      set livraisons_doublons = livraisons_doublons + 1,
          derniere_livraison_doublon_at = now()
      where stripe_event_id = p_stripe_event_id;
      return 'duplicate';
  end;
end;
$$;

create or replace function public.finaliser_evenement_abonnement_service(
  p_stripe_event_id text, p_statut_resultant text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.abonnement_evenements
  set statut_resultant = nullif(btrim(p_statut_resultant), ''),
      finalise_at = now()
  where stripe_event_id = p_stripe_event_id;
end;
$$;

-- ─── 2. Journal Connect / boutique : stripe_webhook_events ─────────────────
alter table public.stripe_webhook_events
  add column if not exists finalise_at timestamptz,
  add column if not exists reprises_orphelines integer not null default 0;

set elsatia.incident_contournement = 'on';
update public.stripe_webhook_events set finalise_at = created_at where finalise_at is null;
reset elsatia.incident_contournement;

create index if not exists stripe_webhook_events_non_finalises_idx
  on public.stripe_webhook_events (created_at) where finalise_at is null;

-- Les routes insèrent directement la réservation (code 23505 = doublon). Une
-- réservation orpheline de plus de 5 minutes est remplacée par la nouvelle
-- livraison, sans modifier les routes ni leur contrat d'erreur.
create or replace function public.stripe_webhook_events_reprendre_orpheline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reprises integer;
begin
  delete from public.stripe_webhook_events
   where id = new.id
     and finalise_at is null
     and created_at < now() - interval '5 minutes'
  returning reprises_orphelines into v_reprises;
  if found then
    new.reprises_orphelines := v_reprises + 1;
  end if;
  new.finalise_at := null;
  return new;
end;
$$;
revoke all on function public.stripe_webhook_events_reprendre_orpheline() from public, anon, authenticated;

drop trigger if exists stripe_webhook_events_reprise_orpheline on public.stripe_webhook_events;
create trigger stripe_webhook_events_reprise_orpheline
  before insert on public.stripe_webhook_events
  for each row execute function public.stripe_webhook_events_reprendre_orpheline();

create or replace function public.finaliser_evenement_webhook_stripe_service(p_stripe_event_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stripe_webhook_events set finalise_at = now()
   where id = p_stripe_event_id and finalise_at is null;
end;
$$;
revoke all on function public.finaliser_evenement_webhook_stripe_service(text) from public, anon, authenticated;
grant execute on function public.finaliser_evenement_webhook_stripe_service(text) to service_role;

-- ─── 3. Détection opérateur (runbook post-incident) ───────────────────────
-- Réservations non finalisées depuis plus de 5 minutes : événements qui seront
-- repris à la prochaine livraison Stripe, ou à rejouer depuis le Dashboard si
-- Stripe a cessé ses tentatives. Compteurs + identifiants Stripe (pas de PII).
create or replace function public.incident_webhooks_stripe_orphelins()
returns table(journal text, stripe_event_id text, type text, reserve_le timestamptz)
language sql stable security definer set search_path = public as $$
  select 'abonnement_evenements', e.stripe_event_id, e.type, e.created_at
    from public.abonnement_evenements e
   where e.finalise_at is null and e.created_at < now() - interval '5 minutes'
  union all
  select 'stripe_webhook_events', w.id, w.event_type, w.created_at
    from public.stripe_webhook_events w
   where w.finalise_at is null and w.created_at < now() - interval '5 minutes'
  order by 4;
$$;
revoke all on function public.incident_webhooks_stripe_orphelins() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
