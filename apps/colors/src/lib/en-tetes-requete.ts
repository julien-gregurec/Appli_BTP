/**
 * En-têtes de requête posés par `src/proxy.ts` à l'usage des composants serveur.
 *
 * Un composant serveur Next ne connaît ni le chemin demandé ni les cookies de
 * la requête : seul le proxy voit les deux. Ces deux en-têtes transportent ce
 * constat, et rien de plus.
 *
 * Ils sont posés avec `set`, ce qui écrase toute valeur homonyme envoyée par le
 * client : ils ne peuvent donc pas être forgés depuis l'extérieur. Le chemin
 * relu reste malgré tout revalidé par `cheminInterneSur` avant tout usage — une
 * défense de moins ne coûte rien ici, et la règle « aucune destination non
 * prouvée locale » n'admet pas d'exception.
 *
 * Ce module est volontairement pur : il est importé par le proxy, qui s'exécute
 * dans un runtime sans `next/headers` ni accès disque.
 */

export const EN_TETE_CHEMIN = "x-colors-chemin";
export const EN_TETE_SESSION = "x-colors-session";

export const VALEUR_SESSION_PRESENTE = "presente";
export const VALEUR_SESSION_ABSENTE = "absente";

/** Lecture du constat de session. Toute valeur autre que la constante vaut « absente ». */
export function sessionPresenteSelon(valeur: string | null | undefined): boolean {
  return valeur === VALEUR_SESSION_PRESENTE;
}
