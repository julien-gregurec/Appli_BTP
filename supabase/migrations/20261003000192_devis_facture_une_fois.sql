-- Empêcher la refacturation d'un devis par « Créer une facture depuis ce devis ».
--
-- Le bouton reste affiché après facturation et la fonction ne contrôlait rien :
-- l'endurance a facturé 31 devis au-delà de leur montant (ex. 163 825,56 € pour un
-- devis de 54 608,52 €). Refus si une facture non annulée existe déjà pour ce
-- devis et que le montant facturé net des avoirs est positif ; un devis
-- entièrement crédité par avoir peut être refacturé.

CREATE OR REPLACE FUNCTION public.creer_facture_depuis_devis(p_devis_id uuid, p_type text DEFAULT 'simple'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_devis public.devis;
  v_facture_id uuid;
  v_delai integer := 30;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found then raise exception 'Devis introuvable'; end if;
  if v_devis.statut <> 'accepte' then raise exception 'Le devis doit etre accepte avant facturation'; end if;
  if v_devis.client_id is null then raise exception 'Le devis doit etre rattache a un client'; end if;

  -- Un devis ne se facture qu'une fois par ce chemin : tant qu'une facture
  -- (brouillon compris) existe déjà pour lui, net des avoirs, on refuse.
  if exists (
    select 1 from public.factures f
    where f.devis_origine_id = p_devis_id and f.entreprise_id = v_devis.entreprise_id
      and f.statut <> 'annulee' and f.type <> 'avoir'
  ) and (
    select coalesce(sum(f.montant_ht), 0) from public.factures f
    where f.devis_origine_id = p_devis_id and f.entreprise_id = v_devis.entreprise_id and f.statut <> 'annulee'
  ) > 0.01 then
    raise exception '%', ('Ce devis a d' || chr(233) || 'j' || chr(224) || ' ' || chr(233) || 't' || chr(233) || ' factur' || chr(233) || ' : ouvrez la facture existante ou ' || chr(233) || 'mettez un avoir');
  end if;

  select delai_paiement_jours into v_delai
  from public.clients
  where id = v_devis.client_id and entreprise_id = v_devis.entreprise_id;
  if not found then raise exception 'Client du devis introuvable'; end if;

  insert into public.factures (
    entreprise_id, client_id, chantier_id, devis_origine_id, type,
    date_echeance, notes_client
  ) values (
    v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id,
    p_devis_id, p_type, current_date + coalesce(v_delai, 30), v_devis.notes_client
  ) returning id into v_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  -- La remise globale du devis est reportée sur chaque ligne (remises
  -- combinées) : la facture n'a pas de remise globale, et l'oubli facturait
  -- le client au-delà du devis accepté.
  select v_facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht,
    100 - (100 - coalesce(remise_ligne, 0)) * (100 - coalesce(v_devis.remise_globale, 0)) / 100,
    taux_tva, ordre
  from public.lignes_devis where devis_id = p_devis_id order by ordre;

  return v_facture_id;
end;
$function$;
