/**
 * Validation centrale des destinations de redirection interne (Réserves).
 *
 * Point de vérité unique pour toute valeur de navigation reçue de l'extérieur :
 * `next` du callback d'authentification, `next` du formulaire de connexion,
 * `retour` des actions serveur. Aucune logique concurrente ne doit subsister
 * ailleurs dans l'application.
 *
 * Repris à l'identique du validateur durci de Colors
 * (`apps/colors/src/lib/redirection-sure.ts`) : l'ancien contrôle local
 * (`valeur.startsWith("/") && !valeur.startsWith("//")`) laissait passer
 * `/\evil.com`, `/%5Cevil.com`, `/%09/evil.com` et les segments-points
 * (`/.//evil.com`) que l'analyseur WHATWG normalise en origine externe.
 */

/** Destination retenue dès que la valeur reçue n'est pas une navigation locale sûre. */
export const DESTINATION_INTERNE_PAR_DEFAUT = "/dashboard";

/**
 * Origine témoin servant de base à l'analyse WHATWG. Elle n'est jamais émise :
 * seule l'égalité `url.origin === ORIGINE_TEMOIN` atteste que la valeur reste
 * locale. Le TLD `.invalid` est réservé (RFC 2606) et ne peut être enregistré.
 */
const ORIGINE_TEMOIN = "https://origine.invalid";

/**
 * Caractères de contrôle que l'analyseur d'URL supprime ou normalise
 * silencieusement : C0, DEL, C1, séparateurs de ligne Unicode, BOM. Leur
 * présence — brute ou obtenue après décodage — suffit à écarter la valeur.
 */
const CARACTERES_NEUTRALISES = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]/;

/** Nombre de passes de décodage pourcent avant abandon. */
const PASSES_DECODAGE = 3;

function estFormeDangereuse(valeur: string): boolean {
  if (valeur === "") return true;
  // Un chemin local commence toujours par une barre oblique unique : tout le
  // reste est un schéma absolu (http:, javascript:, data:…) ou un chemin
  // relatif au protocole.
  if (!valeur.startsWith("/")) return true;
  if (valeur.startsWith("//")) return true;
  // WHATWG normalise `\` en `/` pour les schémas spéciaux : `/\evil.com`
  // devient `//evil.com`, donc une origine externe.
  if (valeur.includes("\\")) return true;
  if (CARACTERES_NEUTRALISES.test(valeur)) return true;
  return false;
}

/**
 * Renvoie une destination interne sûre, ou `repli` si la valeur reçue ne peut
 * pas être prouvée locale. Ne lève jamais.
 */
export function cheminInterneSur(
  valeur: unknown,
  repli: string = DESTINATION_INTERNE_PAR_DEFAUT,
): string {
  if (typeof valeur !== "string") return repli;

  // 1. Formes dangereuses, y compris celles qui n'apparaissent qu'une fois
  //    l'encodage pourcent défait (`%5C`, `%09`, `%0d%0a`…).
  let courant = valeur;
  for (let passe = 0; passe < PASSES_DECODAGE; passe += 1) {
    if (estFormeDangereuse(courant)) return repli;
    if (!courant.includes("%")) break;
    let decode: string;
    try {
      decode = decodeURIComponent(courant);
    } catch {
      return repli; // séquence pourcent invalide : valeur écartée sans exception.
    }
    if (decode === courant) break;
    courant = decode;
  }
  if (estFormeDangereuse(courant)) return repli;

  // 2. Preuve d'origine : la valeur, résolue contre l'origine témoin, doit y rester.
  let url: URL;
  try {
    url = new URL(valeur, ORIGINE_TEMOIN);
  } catch {
    return repli;
  }
  if (url.origin !== ORIGINE_TEMOIN || url.username || url.password) return repli;

  // 3. On ne renvoie jamais la chaîne d'entrée mais sa forme normalisée par
  //    l'analyseur, revérifiée une dernière fois : `/.//evil.com` se normalise
  //    en `//evil.com`, écarté ici.
  const destination = `${url.pathname}${url.search}${url.hash}`;
  return estFormeDangereuse(destination) ? repli : destination;
}
