/**
 * Relais du lien de récupération vers ELSATIA Colors.
 *
 * Le gabarit d'e-mail « Reset password » est unique pour tout le projet
 * Supabase et ancré sur `SiteURL` : quelle que soit l'application depuis
 * laquelle la réinitialisation est demandée, le lien reçu ouvre Gestion Pro.
 * Aucune information de provenance ne circule dans ce lien — ni variable de
 * gabarit, ni cookie (les sessions sont propres à chaque origine), ni ligne en
 * base lisible avant vérification du jeton.
 *
 * La seule donnée fiable disponible avant `verifyOtp` est donc le choix
 * explicite de la personne. `/auth/confirm` propose ce choix et, s'il porte sur
 * Colors, relaie le jeton **non consommé** vers l'écran équivalent de Colors,
 * qui exécutera `verifyOtp` sur sa propre origine — seul moyen d'y ouvrir la
 * session de récupération.
 *
 * La destination n'est jamais construite à partir de la requête : elle vient de
 * la configuration serveur, et le chemin est une constante.
 */

/** Chemin de l'écran de confirmation, identique dans les deux applications. */
const CHEMIN_CONFIRMATION = "/auth/confirm";

/**
 * Origine publique de Colors, ou `null` si elle n'est pas configurée.
 *
 * Une origine `http:` n'est retenue qu'en développement : relayer un jeton de
 * récupération en clair n'a de sens que sur un poste local.
 */
export function origineColors(
  valeur: string | undefined = process.env.NEXT_PUBLIC_COLORS_URL,
  estDeveloppement: boolean = process.env.NODE_ENV === "development",
): string | null {
  if (!valeur) return null;
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && estDeveloppement) return url.origin;
  return null;
}

/**
 * Lien de relais vers Colors pour un jeton de récupération donné.
 *
 * Renvoie `null` si Colors n'est pas configurée ou si le lien courant n'est pas
 * une récupération : aucune autre nature de confirmation n'est relayée.
 */
export function lienRelaisColors({
  tokenHash,
  type,
  origine = origineColors(),
}: {
  tokenHash: string | undefined;
  type: string | undefined;
  origine?: string | null;
}): string | null {
  if (type !== "recovery" || !tokenHash || !origine) return null;
  const url = new URL(CHEMIN_CONFIRMATION, origine);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}
