/**
 * Traduit une erreur technique (Postgres/PostgREST/Storage/Stripe/Brevo...) en message
 * compréhensible pour l'utilisateur, sans jamais exposer le détail brut (nom de
 * contrainte, colonne, policy RLS, message Stripe/Brevo interne). L'erreur réelle doit
 * être journalisée séparément côté serveur (console.error) par l'appelant.
 */

type CategorieErreur =
  | "doublon"
  | "introuvable"
  | "droits"
  | "dependance"
  | "capacite_personnes"
  | "conflit_metier"
  | "reseau"
  | "service_externe"
  | "validation"
  | "serveur";

/**
 * Code d'erreur métier stable renvoyé par le garde-fou de capacité de personnes
 * actives (trigger `trg_capacite_personnes_actives` et RPC
 * `verifier_capacite_personnes`). Le front-end s'appuie sur ce libellé exact.
 */
export const CODE_ERREUR_CAPACITE_PERSONNES = "CAPACITE_PERSONNES_ATTEINTE";

// Repli générique : ce module est pur (aucun accès base/env), il ne peut pas
// savoir si « ajouter de la capacité » ou « changer d'offre » sont réellement
// ouverts (ABONNEMENTS_PUBLICS_OUVERTS, abonnement Stripe existant). Il ne
// propose donc QUE des actions toujours possibles — ELSATIA-GP-TRIAL-SOCLE-
// ACCESS-AND-CAPACITY-FIX-V1 §7. Les appelants qui disposent du contexte
// utilisent `messageLimiteAtteinte` (src/lib/quota-personnes-message.ts), plus
// précis.
const MESSAGE_CAPACITE_PERSONNES =
  "Votre abonnement autorise un nombre limité de personnes actives et cette limite est atteinte. " +
  "Archivez une personne (un salarié sorti ou un compte fermé libère une place) ou contactez le " +
  "support pour augmenter la capacité.";

const MESSAGES_PAR_CATEGORIE: Record<CategorieErreur, string> = {
  doublon: "Cet élément existe déjà.",
  introuvable: "Élément introuvable.",
  droits: "Vous n’avez pas les droits nécessaires pour effectuer cette action.",
  dependance: "Impossible d’effectuer cette action : cet élément est utilisé ailleurs.",
  capacite_personnes: MESSAGE_CAPACITE_PERSONNES,
  conflit_metier: "Cette opération n’est pas possible dans l’état actuel du document.",
  reseau: "Problème de connexion. Réessayez dans un instant.",
  service_externe: "Le service est momentanément indisponible. Réessayez dans quelques instants.",
  validation: "Certaines informations sont invalides. Vérifiez les champs saisis.",
  serveur: "Une erreur est survenue. Réessayez dans un instant.",
};

/** Vrai si l'erreur provient du plafond de personnes actives (quel que soit le chemin). */
export function estErreurCapacitePersonnes(erreur: unknown): boolean {
  if (!erreur) return false;
  const parts: string[] = [];
  if (typeof erreur === "string") parts.push(erreur);
  else if (typeof erreur === "object") {
    for (const cle of ["message", "details", "detail", "hint", "code"] as const) {
      const v = (erreur as Record<string, unknown>)[cle];
      if (typeof v === "string") parts.push(v);
    }
  }
  return parts.join(" ").includes(CODE_ERREUR_CAPACITE_PERSONNES);
}

function categoriser(codeOuMessage: string | null | undefined): CategorieErreur {
  const valeur = (codeOuMessage ?? "").toLowerCase();
  if (valeur.includes(CODE_ERREUR_CAPACITE_PERSONNES.toLowerCase())) return "capacite_personnes";
  if (valeur.includes("23505") || valeur.includes("duplicate key") || valeur.includes("already exists")) return "doublon";
  if (valeur.includes("pgrst116") || valeur.includes("no rows") || valeur.includes("not found") || valeur.includes("404")) return "introuvable";
  if (valeur.includes("row-level security") || valeur.includes("42501") || valeur.includes("permission denied") || valeur.includes("forbidden")) return "droits";
  if (valeur.includes("23503") || valeur.includes("foreign key") || valeur.includes("violates foreign")) return "dependance";
  if (valeur.includes("p0001") || valeur.includes("check_violation") || valeur.includes("23514") || valeur.includes("violates check")) return "conflit_metier";
  if (valeur.includes("stripe") || valeur.includes("brevo") || valeur.includes("supabase") && valeur.includes("storage")) return "service_externe";
  if (valeur.includes("fetch failed") || valeur.includes("network") || valeur.includes("timeout") || valeur.includes("econnrefused")) return "reseau";
  if (valeur.includes("23502") || valeur.includes("invalid input") || valeur.includes("22p02")) return "validation";
  return "serveur";
}

/**
 * @param nomAction identifiant court loggé côté serveur (ex. "creerClientAction")
 * @param erreur l'exception ou l'objet erreur Supabase/Stripe/Brevo capturé
 * @param repli message spécifique au contexte métier ; sinon message générique par catégorie
 */
export function messageErreurUtilisateur(nomAction: string, erreur: unknown, repli?: string): string {
  console.error(nomAction, erreur);
  // Le plafond de personnes actives a un message métier dédié qui prime sur le
  // repli générique de l'appelant, pour rester cohérent sur tous les chemins
  // (création, réactivation, import, RPC de statut de compte).
  if (estErreurCapacitePersonnes(erreur)) return MESSAGE_CAPACITE_PERSONNES;
  if (repli) return repli;
  const code = typeof erreur === "object" && erreur !== null && "code" in erreur ? String((erreur as { code?: unknown }).code) : undefined;
  const message = erreur instanceof Error ? erreur.message : typeof erreur === "object" && erreur !== null && "message" in erreur ? String((erreur as { message?: unknown }).message) : undefined;
  return MESSAGES_PAR_CATEGORIE[categoriser(code ?? message)];
}
