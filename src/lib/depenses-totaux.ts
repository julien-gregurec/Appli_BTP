import type { SupabaseClient } from "@supabase/supabase-js";

// Totaux de la page /depenses : « Total TTC » hors pièces annulées, « Réglé »
// sur toutes les pièces. Calculés en base sur toutes les pièces de l'entreprise
// (RPC `depenses_fournisseurs_totaux`, même contrôle d'accès que la policy
// `acces_achats`), et non plus sommés côté Next sur une liste que PostgREST
// tronque à 1 000 lignes (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
export type TotauxDepenses = { totalTtc: number; regle: number; nombre: number };

export async function chargerTotauxDepenses(supabase: SupabaseClient, entrepriseId: string): Promise<TotauxDepenses> {
  const { data, error } = await supabase.rpc("depenses_fournisseurs_totaux", { p_entreprise_id: entrepriseId });
  if (error || !data) throw new Error(`Totaux des dépenses indisponibles${error ? ` : ${error.message}` : ""}`);
  const totaux = data as { total_ttc: number; regle: number; nombre: number };
  return { totalTtc: Number(totaux.total_ttc), regle: Number(totaux.regle), nombre: Number(totaux.nombre) };
}
