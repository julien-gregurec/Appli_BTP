-- ELSATIA — Billing & Subscription Lifecycle Qualification V1
-- (docs/qualification/ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md, finding B-1)
--
-- Constat (reproduit, pgTAP billing_subscription_lifecycle_v1 §B1) : une
-- entreprise dont la subscription courante a été terminée chez Stripe
-- (`customer.subscription.deleted` → `annule`, ex. fin de relance d'impayés ou
-- annulation immédiate) repassait `actif` sur un `invoice.paid` postérieur de
-- cette même subscription (vieille facture ouverte réglée via son lien
-- hébergé). Stripe ne ressuscite pas une subscription terminée : l'entreprise
-- retrouvait un accès métier complet sans aucun renouvellement futur.
--
-- Variante trouvée par le harnais de concurrence (C3) : si Stripe livre
-- l'`invoice.paid` (plus récent) AVANT `customer.subscription.deleted`, le
-- deleted était jugé périmé par le filigrane d'accès et ignoré : l'entreprise
-- restait `actif` indéfiniment, sans subscription vivante.
--
-- Correctif additif (1) : `annule` n'est jamais levé par un événement facture
-- (payé, échoué, 3-D Secure). La ligne `factures_abonnement` et la trace
-- « dernière facture » restent tenues ; la décision est journalisée
-- `sans_effet` / `abonnement_termine` (auditable). Contrat 506 inchangé
-- pour tout autre statut. (2) une subscription relue terminée (`annule`)
-- s'applique même livrée après un événement plus récent : l'état terminal
-- Stripe est irréversible ; le filigrane ne recule jamais. Signatures,
-- propriétaires et grants inchangés (create or replace).

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

create or replace function public.synchroniser_abonnement_stripe_ordonne_service(p_entreprise_id uuid, p_stripe_subscription_id text, p_stripe_customer_id text, p_statut text, p_offre text, p_periodicite text, p_echeance date, p_essai_fin date, p_annulation_prevue_at timestamp with time zone, p_debut_periode timestamp with time zone, p_fin_periode timestamp with time zone, p_stripe_event_id text, p_stripe_event_type text, p_stripe_event_created timestamp with time zone, p_objet_type text, p_objet_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1 (B-1) : une subscription relue
  -- TERMINÉE (`annule` = canceled / incomplete_expired) l'est définitivement chez
  -- Stripe. Même livrée après un événement plus récent (ex. invoice.paid de la
  -- facture finale arrivé avant customer.subscription.deleted), elle s'applique :
  -- sinon l'accès resterait ouvert sans subscription vivante ni aucun événement
  -- futur pour le refermer. Le filigrane ne recule pas (stripe_ordre_avancer).
  if v_perime and p_statut = 'annule' then
    v_perime := false;
  end if;
  v_statut_effectif := case when v_perime then coalesce(v_statut_avant, p_statut) else p_statut end;

  -- Garde tenant, validation du statut et contrat tarifaire : fonction existante.
  perform public.synchroniser_abonnement_stripe_service(
    p_entreprise_id, p_stripe_subscription_id, p_stripe_customer_id, v_statut_effectif,
    p_offre, p_periodicite, p_echeance, p_essai_fin, p_annulation_prevue_at, p_debut_periode, p_fin_periode);

  if not v_perime then
    update public.entreprises set abonnement_dernier_evenement_at = greatest(abonnement_dernier_evenement_at, p_stripe_event_created)
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
$function$;
