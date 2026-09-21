import { cheminInterneSur } from "@/lib/redirection-sure";

/** Destination de retour après validation d'un lien de réinitialisation. */
export const DESTINATION_NOUVEAU_MOT_DE_PASSE = "/nouveau-mot-de-passe";

/**
 * URL absolue passée à Supabase comme `redirectTo`.
 *
 * Elle est construite exclusivement à partir de l'origine publique configurée
 * pour Colors : aucune valeur reçue d'une requête n'y entre. Le paramètre
 * `next` traverse `cheminInterneSur`, seul validateur de l'application, pour
 * qu'aucune évolution ultérieure ne puisse y réintroduire une origine externe.
 *
 * Renvoie `null` si l'origine publique est absente ou invalide : mieux vaut ne
 * pas envoyer d'e-mail que d'en envoyer un pointant vers un hôte non maîtrisé.
 */
export function urlCallbackReinitialisation(
  originePublique: string | undefined = process.env.NEXT_PUBLIC_COLORS_URL,
): string | null {
  if (!originePublique) return null;
  let base: URL;
  try {
    base = new URL(originePublique);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;

  const callback = new URL("/auth/callback", base.origin);
  callback.searchParams.set("next", cheminInterneSur(DESTINATION_NOUVEAU_MOT_DE_PASSE));
  return callback.toString();
}
