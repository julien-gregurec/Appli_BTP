"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

type LigneLot = { article_id: string; quantite: number };
type Attribution = { ligne_commande_id: string; quantite: number };
export type TypeDestinationSortie = "chantier" | "vehicule" | "outil" | null;
type IdentiteBorne = { identifiantEmploye: string; motDePasseStock: string };

export type ResultatReception = {
  ok: boolean;
  entrees?: number;
  commandes?: Array<{ commande_id: string; statut: string }>;
  erreur?: string;
};

export async function receptionLotAction(
  lignes: LigneLot[],
  attributions: Attribution[],
  motif: string | null,
  identite: IdentiteBorne | null = null,
): Promise<ResultatReception> {
  const ctx = await getContexteEntreprise();
  if (!lignes.length) return { ok: false, erreur: "Aucun article scanné." };
  const supabase = await createClient();
  const rpc = identite ? "enregistrer_reception_lot_borne" : "enregistrer_reception_lot";
  const params = {
    p_entreprise_id: ctx.entrepriseId,
    p_lignes: lignes,
    p_attributions: attributions,
    p_motif: motif,
    ...(identite ? {
      p_identifiant_employe: identite.identifiantEmploye,
      p_mot_de_passe: identite.motDePasseStock,
    } : {}),
  };
  const { data, error } = await supabase.rpc(rpc, params);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/stock");
  revalidatePath("/commandes");
  const res = data as { entrees: number; commandes: Array<{ commande_id: string; statut: string }> };
  return { ok: true, entrees: res.entrees, commandes: res.commandes ?? [] };
}

export type ResultatSortie = { ok: boolean; sorties?: number; erreur?: string };

export async function sortieLotAction(
  lignes: LigneLot[],
  typeDestination: TypeDestinationSortie,
  destinationId: string | null,
  motif: string | null,
  identite: IdentiteBorne | null = null,
): Promise<ResultatSortie> {
  const ctx = await getContexteEntreprise();
  if (!lignes.length) return { ok: false, erreur: "Aucun article scanné." };
  const supabase = await createClient();
  const rpc = identite ? "enregistrer_sortie_lot_borne_v2" : "enregistrer_sortie_lot_v2";
  const params = {
    p_entreprise_id: ctx.entrepriseId,
    p_lignes: lignes,
    p_type_destination: typeDestination,
    p_destination_id: destinationId,
    p_motif: motif,
    ...(identite ? {
      p_identifiant_employe: identite.identifiantEmploye,
      p_mot_de_passe: identite.motDePasseStock,
    } : {}),
  };
  const { data, error } = await supabase.rpc(rpc, params);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/stock");
  return { ok: true, sorties: (data as { sorties: number }).sorties };
}
