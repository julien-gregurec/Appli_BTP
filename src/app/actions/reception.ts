"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

type LigneLot = { article_id: string; quantite: number };
type Attribution = { ligne_commande_id: string; quantite: number };

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
): Promise<ResultatReception> {
  const ctx = await getContexteEntreprise();
  if (!lignes.length) return { ok: false, erreur: "Aucun article scanné." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enregistrer_reception_lot", {
    p_entreprise_id: ctx.entrepriseId,
    p_lignes: lignes,
    p_attributions: attributions,
    p_motif: motif,
  });
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/stock");
  revalidatePath("/commandes");
  const res = data as { entrees: number; commandes: Array<{ commande_id: string; statut: string }> };
  return { ok: true, entrees: res.entrees, commandes: res.commandes ?? [] };
}

export type ResultatSortie = { ok: boolean; sorties?: number; erreur?: string };

export async function sortieLotAction(
  lignes: LigneLot[],
  chantierId: string | null,
  motif: string | null,
): Promise<ResultatSortie> {
  const ctx = await getContexteEntreprise();
  if (!lignes.length) return { ok: false, erreur: "Aucun article scanné." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enregistrer_sortie_lot", {
    p_entreprise_id: ctx.entrepriseId,
    p_lignes: lignes,
    p_chantier_id: chantierId,
    p_motif: motif,
  });
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/stock");
  return { ok: true, sorties: (data as { sorties: number }).sorties };
}
