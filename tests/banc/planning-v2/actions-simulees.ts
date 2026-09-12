/** Banc du planning v2 — doublures des actions serveur : en mémoire, sans base ; chaque appel est noté dans window.__bancPlanning. */
import type { Evenement } from "@/lib/planning/modele";

declare global {
  interface Window { __bancPlanning: { enregistrements: Evenement[]; suppressions: string[] }; __navigations: string[] }
}
let compteur = 0;
export async function enregistrerEvenementAction(e: Evenement): Promise<{ id: string } | { error: string }> {
  await new Promise((r) => setTimeout(r, 120));
  const id = e.id.startsWith("nouveau:") ? `ev-banc-${++compteur}` : e.id;
  window.__bancPlanning.enregistrements.push({ ...e, id });
  return { id };
}
export async function supprimerEvenementAction(id: string): Promise<{ ok: true } | { error: string }> {
  window.__bancPlanning.suppressions.push(id);
  return { ok: true };
}
