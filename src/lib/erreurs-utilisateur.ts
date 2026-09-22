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
  | "conflit_metier"
  | "reseau"
  | "service_externe"
  | "validation"
  | "serveur";

const MESSAGES_PAR_CATEGORIE: Record<CategorieErreur, string> = {
  doublon: "Cet élément existe déjà.",
  introuvable: "Élément introuvable.",
  droits: "Vous n’avez pas les droits nécessaires pour effectuer cette action.",
  dependance: "Impossible d’effectuer cette action : cet élément est utilisé ailleurs.",
  conflit_metier: "Cette opération n’est pas possible dans l’état actuel du document.",
  reseau: "Problème de connexion. Réessayez dans un instant.",
  service_externe: "Le service est momentanément indisponible. Réessayez dans quelques instants.",
  validation: "Certaines informations sont invalides. Vérifiez les champs saisis.",
  serveur: "Une erreur est survenue. Réessayez dans un instant.",
};

function categoriser(codeOuMessage: string | null | undefined): CategorieErreur {
  const valeur = (codeOuMessage ?? "").toLowerCase();
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
  if (repli) return repli;
  const code = typeof erreur === "object" && erreur !== null && "code" in erreur ? String((erreur as { code?: unknown }).code) : undefined;
  const message = erreur instanceof Error ? erreur.message : typeof erreur === "object" && erreur !== null && "message" in erreur ? String((erreur as { message?: unknown }).message) : undefined;
  return MESSAGES_PAR_CATEGORIE[categoriser(code ?? message)];
}
