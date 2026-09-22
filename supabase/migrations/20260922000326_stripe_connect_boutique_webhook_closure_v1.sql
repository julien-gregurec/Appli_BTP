-- ELSATIA-STRIPE-CONNECT-BOUTIQUE-WEBHOOK-CLOSURE-V1
--
-- Referme, pour le seul périmètre webhook Stripe Connect (factures clients) et
-- webhook Boutique, le P1 confirmé par docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md
-- §6 : "Webhooks Stripe Connect (factures) et Boutique cassés end-to-end depuis
-- 20260902000255_acl_reconciliation_v1." Reproduit avant ce correctif sur une
-- base rejouée à partir de zéro (314 migrations) :
--   - service_role n'a AUCUN privilège (SELECT/INSERT/UPDATE/DELETE) sur
--     public.stripe_webhook_events -> l'INSERT de dé-duplication, première
--     écriture des DEUX routes webhook, échoue en 42501 ("permission denied
--     for table stripe_webhook_events") -> 500 "Journal indisponible" à
--     CHAQUE évènement Stripe réel, Connect comme Boutique.
--   - src/app/api/stripe/webhook/route.ts appelle
--     stripe_connect_encaisser_facture_service et
--     stripe_connect_expirer_checkout_facture_service : aucune des deux
--     n'existe dans une migration appliquée ("function ... does not exist").
--   - src/app/api/stripe/boutique/webhook/route.ts appelle
--     boutique_expirer_commande_service pour l'expiration d'une session
--     Checkout : n'existe pas non plus (résidu déjà noté, non corrigé, par
--     REDTEAM-V3-03 dans le rapport ci-dessus).
--
-- PROVENANCE. Contenu technique des 3 fonctions et de la ligne de GRANT repris,
-- sans modification de logique, de docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed
-- (lot conçu et validé le 2026-09-11 — 148/148 pgTAP, 36/36 PostgREST réel,
-- 9/9 E2E Playwright sur ce même contenu — mais jamais numéroté ni fusionné,
-- cf. docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md, flux #1 et #2). Seules
-- les 3 fonctions et le grant de table qui couvrent Stripe Connect/Boutique
-- sont repris ici ; les 11 autres flux cassés par la même 255 (paie, relances,
-- Powens, push, journal d'activité) restent HORS PÉRIMÈTRE de cette mission
-- (Stripe Connect/Boutique uniquement) et restent donc ouverts, inchangés,
-- pour un lot dédié ultérieur — voir le rapport de clôture de cette mission.
--
-- NE COUVRE PAS la décision D1 Boutique (EXECUTE de boutique_finaliser_commande_payee
-- restreint à service_role + déclencheur boutique_commandes_paiement_serveur_seul) :
-- déjà appliquée par 20260922000323_redteam_v3_authenticated_rpc_bypass_revocation.sql
-- (ALREADY_PRESENT, revérifié par requête catalogue avant ce fichier — non
-- reporté ici pour éviter un double correctif).
--
-- NE COUVRE PAS la D3 (idempotence de la réservation d'évènement webhook :
-- un évènement dont le TRAITEMENT échoue après la réservation en base reste
-- réservé -> un retry Stripe du même évènement est avalé comme "duplicate"
-- sans être rejoué). Décision déjà prise le 2026-09-11 par la session qui a
-- conçu ce lot ("lot de sécurité distinct") ; testée par cette mission (voir
-- le rapport de clôture) et confirmée non régressée par ce fichier ni
-- aggravée : le comportement de dé-duplication est inchangé, seul le GRANT
-- qui le rendait inopérant est restauré.
--
-- Additif. Aucune migration existante modifiée. Aucun secret Stripe réel.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Idempotence des webhooks Stripe Connect (factures) et Boutique : GRANT
--    INSERT par colonne, rien d'autre. Le code s'appuie sur la violation
--    d'unicité 23505 de la clé primaire (id = identifiant d'évènement Stripe)
--    pour détecter un doublon : elle reste levée à l'identique après ce
--    GRANT. Ni SELECT, ni UPDATE, ni DELETE : l'immuabilité du journal reste
--    entière.
-- ─────────────────────────────────────────────────────────────────────────────

grant insert (id, event_type, livemode, facture_id)
  on table public.stripe_webhook_events to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Webhook Stripe Connect : encaissement et expiration d'une facture client
-- ─────────────────────────────────────────────────────────────────────────────

-- Reprend à l'identique la logique de src/app/api/stripe/webhook/route.ts, en
-- une transaction : la facture n'est encaissée que si elle appartient à
-- l'entreprise annoncée, porte cette session Checkout et si le compte Connect
-- émetteur est celui de l'entreprise. Montant = min(montant Stripe, reste dû).
create or replace function public.stripe_connect_encaisser_facture_service(
  p_facture_id uuid,
  p_entreprise_id uuid,
  p_checkout_id text,
  p_compte_stripe text,
  p_montant_centimes bigint,
  p_payment_intent_id text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_facture record;
  v_montant numeric;
begin
  if p_facture_id is null or p_entreprise_id is null
     or nullif(btrim(p_checkout_id), '') is null
     or nullif(btrim(p_compte_stripe), '') is null then
    return 'ignoree';
  end if;

  select f.id, f.montant_ttc, f.montant_paye, f.stripe_checkout_id, e.stripe_account_id
    into v_facture
  from public.factures f
  join public.entreprises e on e.id = f.entreprise_id
  where f.id = p_facture_id and f.entreprise_id = p_entreprise_id
  for update of f;

  if not found
     or v_facture.stripe_checkout_id is distinct from p_checkout_id
     or v_facture.stripe_account_id is distinct from p_compte_stripe then
    return 'ignoree';
  end if;

  -- Arrondi au centime : paiements.montant est un numeric sans échelle ; une division non
  -- arrondie y stockerait 50.0000000000000000 (valeur juste, représentation polluée). Défaut
  -- trouvé et corrigé par la session du 2026-09-11 (validation PostgREST réelle), repris ici.
  v_montant := round(least(
    greatest(coalesce(p_montant_centimes, 0), 0)::numeric / 100,
    greatest(0, coalesce(v_facture.montant_ttc, 0) - coalesce(v_facture.montant_paye, 0))
  ), 2);
  if v_montant > 0 then
    insert into public.paiements(facture_id, montant, date, mode, reference, stripe_session_id)
    values (v_facture.id, v_montant, current_date, 'carte_en_ligne', 'stripe:' || p_checkout_id, p_checkout_id)
    on conflict (stripe_session_id) do nothing;
  end if;

  update public.factures
  set stripe_payment_status = 'paid',
      stripe_payment_intent_id = nullif(btrim(p_payment_intent_id), '')
  where id = v_facture.id;

  return 'encaissee';
end;
$$;

comment on function public.stripe_connect_encaisser_facture_service(uuid, uuid, text, text, bigint, text) is
  'Webhook Stripe Connect : encaisse une facture client payée par Checkout (paiement idempotent par session). Renvoie « encaissee » ou « ignoree ». Chemin de service.';

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
  update public.factures
  set stripe_payment_status = 'expired'
  where id = p_facture_id and stripe_checkout_id = p_checkout_id;
end;
$$;

comment on function public.stripe_connect_expirer_checkout_facture_service(uuid, text) is
  'Webhook Stripe Connect : marque expirée la session Checkout d''une facture client. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Webhook Boutique : expiration d'une commande (finalisation payée déjà
--    couverte par 20260922000323 — non répétée ici)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.boutique_expirer_commande_service(
  p_commande_id uuid,
  p_checkout_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.boutique_commandes
  set statut = 'expiree', updated_at = now()
  where id = p_commande_id
    and stripe_checkout_id = p_checkout_id
    and statut = 'en_attente_paiement';
end;
$$;

comment on function public.boutique_expirer_commande_service(uuid, text) is
  'Webhook Boutique : expire une commande en attente de paiement dont la session Checkout a expiré. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Exécution : service_role SEUL (ni PUBLIC, ni anon, ni authenticated)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.stripe_connect_encaisser_facture_service(uuid, uuid, text, text, bigint, text)',
    'public.stripe_connect_expirer_checkout_facture_service(uuid, text)',
    'public.boutique_expirer_commande_service(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Retour arrière (dans cet ordre, après avoir retiré le code applicatif qui les appelle) :
--   drop function if exists public.boutique_expirer_commande_service(uuid, text);
--   drop function if exists public.stripe_connect_expirer_checkout_facture_service(uuid, text);
--   drop function if exists public.stripe_connect_encaisser_facture_service(uuid, uuid, text, text, bigint, text);
--   revoke insert (id, event_type, livemode, facture_id) on table public.stripe_webhook_events from service_role;
