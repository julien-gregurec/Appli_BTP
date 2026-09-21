/**
 * État réel du réseau.
 *
 * `navigator.onLine` est un indice, pas une preuve : il vaut `false` de façon fiable
 * (l'appareil sait qu'il n'a aucune interface active), mais il peut valoir `true` alors
 * que rien n'est joignable — c'est notamment le cas quand un service worker contrôle la
 * page, puisque le navigateur constate qu'une réponse peut être produite localement.
 *
 * Conséquence concrète si l'on s'y fie seul : la coquille annonce « le réseau est revenu,
 * vos saisies vont repartir » à un utilisateur qui n'a toujours aucune couverture. C'est
 * exactement le message qu'il ne faut jamais afficher à tort.
 *
 * On combine donc les deux : `navigator.onLine === false` tranche immédiatement ; sinon,
 * une sonde confirme qu'un serveur répond vraiment.
 */

const DELAI_SONDE = 4000;

export async function reseauJoignable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const abandon = new AbortController();
    const minuterie = setTimeout(() => abandon.abort(), DELAI_SONDE);
    const reponse = await fetch("/api/offline/ping", {
      method: "GET", cache: "no-store", signal: abandon.signal,
    });
    clearTimeout(minuterie);
    return reponse.ok || reponse.status === 204;
  } catch {
    return false;
  }
}
