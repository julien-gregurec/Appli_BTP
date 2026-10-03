import type { SupabaseClient } from "@supabase/supabase-js";
import { masquerSecrets } from "@/lib/social/http";

export type EntreeAudit = {
  acteur: string;
  action: string;
  reseau?: string | null;
  publicationId?: string | null;
  objetId?: string | null;
  avant?: unknown;
  apres?: unknown;
  details?: Record<string, unknown>;
};

// Champs jamais recopiés dans le journal.
const CHAMPS_SENSIBLES = new Set(["jeton", "jeton_chiffre", "refresh", "refresh_chiffre", "access_token", "refresh_token", "donnees_chiffrees"]);

function nettoyer(valeur: unknown): unknown {
  if (valeur === undefined) return null;
  if (typeof valeur === "string") return masquerSecrets(valeur);
  if (Array.isArray(valeur)) return valeur.map(nettoyer);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).filter(([k]) => !CHAMPS_SENSIBLES.has(k)).map(([k, v]) => [k, nettoyer(v)]));
  }
  return valeur;
}

/** Journal append-only. Une écriture impossible est signalée sans interrompre l'action déjà effectuée. */
export async function journaliser(admin: SupabaseClient, entree: EntreeAudit) {
  const { error } = await admin.from("social_audit").insert({
    acteur: entree.acteur,
    action: entree.action,
    reseau: entree.reseau ?? null,
    publication_id: entree.publicationId ?? null,
    objet_id: entree.objetId ?? null,
    avant: nettoyer(entree.avant ?? null),
    apres: nettoyer(entree.apres ?? null),
    details: nettoyer(entree.details ?? {}),
  });
  if (error) console.error("[ELSATIA Social] Journal d’audit indisponible", error.message, entree.action);
}

/** Différence champ par champ pour le journal (avant/après d'une modification). */
export function difference<T extends Record<string, unknown>>(avant: T, apres: Partial<T>) {
  const a: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(apres)) {
    if (JSON.stringify(avant[cle] ?? null) !== JSON.stringify(valeur ?? null)) {
      a[cle] = avant[cle] ?? null;
      b[cle] = valeur ?? null;
    }
  }
  return { avant: a, apres: b, change: Object.keys(b).length > 0 };
}
