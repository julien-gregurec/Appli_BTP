-- ELSATIA — Stripe readiness P7 (train canonique V9) : facture d'essai à 0 €.
--
-- Qualification P7 (docs/qualification/ELSATIA_STRIPE_READINESS_PORT_PLAN_V1.md
-- §4.2, décision propriétaire 8 : « contre-épreuve d'abord, correctif minimal si
-- le défaut est reproduit »). Contre-épreuve sur V8 + 813 + 901 + 1001 + 1002
-- (pgTAP stripe_readiness_v9 §P7) : relecture « trialing » à t, puis `invoice.paid`
-- 0 € horodatée t + 1 s → l'entreprise passe « actif » pendant l'essai, jusqu'à la
-- relecture suivante. L'arbitrage à la seconde de 506 ne couvre que l'égalité.
-- DÉFAUT REPRODUIT → correctif minimal ci-dessous.
--
-- Correctif : corps repris À L'IDENTIQUE de 20260928000801 (dernière définition du
-- train), avec une seule branche ajoutée : `invoice.paid` d'un montant TTC nul sur
-- une entreprise en « essai » = `sans_effet` / `facture_essai_sans_montant` (trace
-- de facture tenue, accès et filigrane inchangés). Tout autre cas : contrat 506 /
-- 801 inchangé (une facture non nulle payée pendant l'essai, ou une facture 0 €
-- sur une entreprise suspendue, s'appliquent comme avant). Signature,
-- propriétaire, SECURITY DEFINER et grants inchangés (create or replace).

create or replace function public.appliquer_evenement_facture_abonnement_service(p_entreprise_id uuid, p_stripe_event_id text, p_stripe_event_type text, p_stripe_event_created timestamp with time zone, p_stripe_invoice_id text, p_invoice_status text, p_invoice_created timestamp with time zone, p_numero text, p_periode_debut timestamp with time zone, p_periode_fin timestamp with time zone, p_montant_ht numeric, p_montant_tva numeric, p_montant_ttc numeric, p_devise text, p_url_facture text, p_url_pdf text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif v_statut_avant = 'annule' then
    -- ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1 : la subscription courante est
    -- terminée chez Stripe (canceled / incomplete_expired, relue). Aucune
    -- facture — même payée plus tard via son lien hébergé — ne rouvre l'accès :
    -- Stripe ne ressuscite jamais une subscription terminée, il n'y aura donc
    -- aucun renouvellement. Seule une subscription relue compatible (nouveau
    -- Checkout) rend les droits. Trace de facture conservée, accès inchangé.
    v_decision := 'sans_effet';
    v_motif := 'abonnement_termine';
    v_statut_apres := v_statut_avant;
    update public.entreprises set
      derniere_facture_stripe_id = p_stripe_invoice_id,
      derniere_facture_url = nullif(btrim(p_url_facture), ''),
      derniere_facture_pdf = nullif(btrim(p_url_pdf), ''),
      derniere_facture_statut = v_statut_facture,
      derniere_facture_at = coalesce(p_invoice_created, p_stripe_event_created),
      updated_at = now()
    where id = p_entreprise_id;
  elsif p_stripe_event_type = 'invoice.paid' and v_statut_avant = 'essai'
     and coalesce(p_montant_ttc, 0) = 0 then
    -- P7 (train V9, Stripe readiness) : la facture d'essai à 0 € (Stripe la crée et
    -- la règle à la création d'une subscription « trialing ») n'est PAS un
    -- paiement de l'abonnement. Livrée une seconde après la relecture « trialing »,
    -- elle faisait passer l'entreprise en « actif » pendant l'essai (affichage faux,
    -- essai expiré 803 inopérant) jusqu'à la relecture suivante. Trace de facture
    -- conservée, accès et filigrane inchangés : la fin d'essai réelle arrive par la
    -- relecture de la subscription (customer.subscription.updated → active) ou par
    -- la première facture non nulle.
    v_decision := 'sans_effet';
    v_motif := 'facture_essai_sans_montant';
    v_statut_apres := v_statut_avant;
    update public.entreprises set
      derniere_facture_stripe_id = p_stripe_invoice_id,
      derniere_facture_url = nullif(btrim(p_url_facture), ''),
      derniere_facture_pdf = nullif(btrim(p_url_pdf), ''),
      derniere_facture_statut = v_statut_facture,
      derniere_facture_at = coalesce(p_invoice_created, p_stripe_event_created),
      updated_at = now()
    where id = p_entreprise_id;
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
$function$;
