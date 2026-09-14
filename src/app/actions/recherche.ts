"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { devisV2Actif } from "@/lib/devis/v2-serveur";

export type ResultatRecherche = { type: string; id: string; titre: string; sousTitre: string | null; reference: string | null; url: string; rang: number };
export type DerniereAction = { ressource: string; id: string; titre: string; action: string; creeLe: string; url: string };

/** Recherche globale (GP V1) : la RPC tourne sous la RLS de l'utilisateur — rien de plus que ce qu'il peut ouvrir. */
export async function rechercheGlobaleAction(texte: string): Promise<{ resultats: ResultatRecherche[] } | { error: string }> {
  if (!devisV2Actif()) return { resultats: [] };
  const q = String(texte ?? "").trim().slice(0, 120);
  if (q.length < 2) return { resultats: [] };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recherche_globale", { p_entreprise_id: ctx.entrepriseId, p_texte: q, p_limite: 30 });
  if (error) return { error: messageErreurUtilisateur("rechercheGlobaleAction", error, "Recherche impossible pour le moment.") };
  return {
    resultats: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      type: String(r.type), id: String(r.id), titre: String(r.titre ?? ""), sousTitre: (r.sous_titre as string | null) ?? null,
      reference: (r.reference as string | null) ?? null, url: String(r.url), rang: Number(r.rang ?? 4),
    })),
  };
}

export async function dernieresActionsAction(limite = 8): Promise<DerniereAction[]> {
  if (!devisV2Actif()) return [];
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.rpc("dernieres_actions", { p_entreprise_id: ctx.entrepriseId, p_limite: limite });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ressource: String(r.ressource), id: String(r.id), titre: String(r.titre ?? ""), action: String(r.action), creeLe: String(r.cree_le), url: String(r.url),
  }));
}
