/**
 * Effacement des données locales de Gestion Pro.
 *
 * La déconnexion est un SERVER ACTION : elle invalide la session côté serveur et ne peut, par
 * construction, rien effacer sur l'appareil. Tout ce que l'application a écrit localement —
 * brouillons, préférences d'affichage, et demain la file hors ligne — survivrait donc à la
 * déconnexion et attendrait le compte suivant sur un téléphone partagé.
 *
 * D'où ce module, appelé depuis le navigateur à deux moments distincts et complémentaires :
 *
 *   — au clic sur « Se déconnecter », avant que le formulaire ne parte ;
 *   — à l'arrivée sur /login, quelle qu'en soit la raison.
 *
 * Le second n'est pas une redondance du premier : c'est le seul qui couvre l'expiration de
 * session. Un salarié dont le jeton expire pendant la nuit ne clique sur rien — il rouvre
 * l'application et se retrouve sur /login. Sans ce filet, ses données locales resteraient
 * indéfiniment sur l'appareil.
 */
import { estCleGestionPro } from "@/lib/mobile/identite-locale";

export type StockageEnumerable = Pick<Storage, "getItem" | "removeItem" | "key" | "length">;

/**
 * Efface les clés de Gestion Pro, et elles seules.
 *
 * On ne fait PAS `localStorage.clear()`. La même origine sert aussi les préférences d'autres
 * applications ELSATIA et celles du navigateur lui-même ; tout balayer ferait perdre à
 * l'utilisateur un travail sans rapport avec la session qu'il ferme. Un effacement large
 * paraît plus sûr et ne l'est pas : il est simplement moins précis.
 *
 * Renvoie le nombre de clés effacées, ce qui rend la fonction vérifiable par un test.
 */
export function purgerStockageCleValeur(stockage: StockageEnumerable): number {
  // On collecte AVANT de supprimer : retirer une clé pendant qu'on parcourt l'index par
  // position décale les suivantes, et une entrée sur deux serait sautée.
  const aEffacer: string[] = [];
  try {
    for (let i = 0; i < stockage.length; i += 1) {
      const cle = stockage.key(i);
      if (cle && estCleGestionPro(cle)) aEffacer.push(cle);
    }
  } catch {
    return 0;
  }

  let effacees = 0;
  for (const cle of aEffacer) {
    try { stockage.removeItem(cle); effacees += 1; } catch { /* clé verrouillée : on continue */ }
  }
  return effacees;
}

/**
 * Demande au service worker de vider ses caches.
 *
 * Le message part sans attendre de réponse, et c'est voulu : la déconnexion se termine par
 * une redirection, la page ne sera plus là pour recevoir un accusé. Le service worker, lui,
 * survit à la navigation et achève sa purge (`event.waitUntil`) même une fois la page partie.
 */
function demanderPurgeDesCaches(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PURGER_CACHES" });
  } catch {
    // Pas de service worker actif, ou API indisponible : il n'y a alors aucun cache à vider.
  }
}

/** Purge complète côté navigateur. Sans effet — et sans erreur — hors navigateur. */
export function purgerDonneesLocales(): void {
  if (typeof window === "undefined") return;
  try { purgerStockageCleValeur(window.localStorage); } catch { /* stockage refusé */ }
  try { purgerStockageCleValeur(window.sessionStorage); } catch { /* stockage refusé */ }
  demanderPurgeDesCaches();
}
