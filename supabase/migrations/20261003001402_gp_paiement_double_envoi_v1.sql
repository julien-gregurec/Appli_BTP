-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- B17 : anti-double envoi d'un paiement manuel. Les encaissements Stripe ne
-- passent pas par cette RPC et ne sont pas concernés.

CREATE OR REPLACE FUNCTION public.enregistrer_paiement_facture(p_entreprise_id uuid, p_facture_id uuid, p_montant numeric, p_date date DEFAULT CURRENT_DATE, p_mode text DEFAULT 'virement'::text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_facture public.factures;
  v_reste numeric;
  v_id uuid;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_factures') then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide';
  end if;

  -- Verrou sur la facture : un deuxième appel concurrent (double clic, deux
  -- onglets, deux utilisateurs) attend la fin de cette transaction avant de
  -- relire montant_paye, qui reflète alors déjà ce paiement-ci.
  select * into v_facture from public.factures
   where id = p_facture_id and entreprise_id = p_entreprise_id
   for update;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  if v_facture.statut in ('brouillon', 'annulee', 'avoir_emis') then
    raise exception 'Un paiement ne peut pas être ajouté à cette facture';
  end if;

  v_reste := greatest(0, v_facture.montant_ttc - v_facture.montant_paye);
  if p_montant > v_reste + 0.005 then
    raise exception 'Le paiement dépasse le reste dû (%)', to_char(v_reste, 'FM999999990.00');
  end if;

  -- B17 : un double clic sur un paiement partiel passait deux fois (le verrou
  -- sérialise, mais le reste dû couvrait encore le second envoi). Le même
  -- paiement (montant, date, mode, référence) déjà enregistré sur cette facture
  -- dans les 30 dernières secondes est refusé ; tout paiement distinct passe.
  if exists (
    select 1 from public.paiements p
     where p.facture_id = p_facture_id
       and p.montant = p_montant
       and p.date = coalesce(p_date, current_date)
       and p.mode is not distinct from coalesce(nullif(btrim(p_mode), ''), 'virement')
       and p.reference is not distinct from nullif(btrim(p_reference), '')
       and p.stripe_session_id is null
       and p.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Ce paiement vient d''être enregistré (double envoi ignoré)';
  end if;

  insert into public.paiements (facture_id, montant, date, mode, reference)
  values (p_facture_id, p_montant, coalesce(p_date, current_date), coalesce(nullif(btrim(p_mode), ''), 'virement'), nullif(btrim(p_reference), ''))
  returning id into v_id;

  return v_id;
end;
$function$;
