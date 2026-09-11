/**
 * Réglages de l'entreprise propres au moteur de devis v2 — module PUR.
 *
 * - `entreprises.filigranes_documents` : `{ defaut, brouillon }`, chacun un filigrane ASSAINI par
 *   `normaliserFiligrane` (bornes de lisibilité appliquées) ou `null` (pas de réglage).
 * - `entreprises.seuil_taux_marque_pct` : seuil d'alerte de taux de marque, 0 à 100, `null` = aucun.
 */

import { normaliserFiligrane, type Filigrane, type ReglagesFiligraneEntreprise } from "@/lib/devis/filigrane";

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const filigraneOuNul = (v: unknown): Filigrane | null => (estObjet(v) ? normaliserFiligrane(v as Partial<Filigrane>) : null);

/** Ce qui sera écrit en base, quelle que soit la forme reçue du navigateur. */
export function filigranesPourEnregistrement(entree: { defaut: unknown; brouillon: unknown }): { defaut: Filigrane | null; brouillon: Filigrane | null } {
  return { defaut: filigraneOuNul(entree.defaut), brouillon: filigraneOuNul(entree.brouillon) };
}

/** Réglages stockés (jsonb) relus pour l'écran ; toute forme inattendue devient « pas de réglage ». */
export function lireReglagesFiligranes(stocke: unknown): ReglagesFiligraneEntreprise {
  if (!estObjet(stocke)) return { defaut: null, brouillon: null };
  return { defaut: filigraneOuNul(stocke.defaut), brouillon: filigraneOuNul(stocke.brouillon) };
}

/** Seuil saisi : vide → `null` ; nombre de 0 à 100, arrondi à deux décimales (colonne `numeric(5, 2)`). */
export function validerSeuilTauxMarque(v: unknown): { valeur: number | null } | { erreur: string } {
  if (v === null || v === undefined) return { valeur: null };
  if (typeof v !== "number" && typeof v !== "string") return { erreur: "Seuil de taux de marque invalide." };
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return { valeur: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { erreur: "Le seuil de taux de marque doit être un nombre entre 0 et 100." };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { erreur: "Le seuil de taux de marque doit être un nombre entre 0 et 100." };
  return { valeur: Math.round(n * 100) / 100 };
}

/** Seuil stocké relu pour l'écran. */
export function lireSeuilStocke(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
