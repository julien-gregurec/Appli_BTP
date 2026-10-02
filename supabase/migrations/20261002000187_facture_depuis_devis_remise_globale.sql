-- Facture créée depuis un devis : reporter la remise globale du devis.
--
-- creer_facture_depuis_devis copiait les lignes sans la remise globale (les
-- factures n'ont pas de remise globale). Recette : devis accepté 7 725,40 € TTC
-- (remise 3 %) → facture 7 964,33 € TTC, soit 238,93 € facturés en trop.
-- La remise est combinée à la remise de chaque ligne :
--   remise facture = 100 - (100 - remise ligne) × (100 - remise globale) / 100
-- ce qui donne exactement les totaux HT/TVA/TTC du devis (colonnes numeric
-- sans échelle fixe, aucun arrondi intermédiaire).

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
