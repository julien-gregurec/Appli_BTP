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
import { purgerBasesLocales } from "@/lib/mobile/offline/base-locale";

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

/** Canal de coordination : les autres onglets de Gestion Pro ferment et purgent aussi. */
const CANAL_PURGE = "elsatia-gp-purge";

/**
 * Identité de CET onglet, tirée une fois par chargement.
 *
 * Un `BroadcastChannel` n'ignore que l'instance qui a émis : une AUTRE instance du même nom
 * dans le même onglet reçoit le message. Or l'onglet qui se déconnecte porte les deux — celle
 * qui émet (ici) et celle qui écoute (`GardienDonneesLocales`). Sans cette identité, il
 * obéissait à son propre ordre : il partait vers /login AVANT que `logoutAction` n'ait fermé la
 * session, le proxy renvoyait cette session encore valide vers /dashboard, et la navigation
 * interrompait la déconnexion. L'utilisateur croyait être sorti ; il était toujours connecté.
 */
const ID_ONGLET = (() => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; }
})();

export type MessagePurge = { type: "purger"; origine: string };

/** Un onglet obéit à une purge décidée AILLEURS — jamais à la sienne. Pure, donc éprouvée. */
export function doitObeirALaPurge(message: unknown, idOnglet: string): boolean {
  if (!message || typeof message !== "object") return false;
  const m = message as Partial<MessagePurge>;
  return m.type === "purger" && typeof m.origine === "string" && m.origine !== idOnglet;
}

/**
 * Purge complète côté navigateur. Sans effet — et sans erreur — hors navigateur.
 *
 * L'ORDRE compte, et il a été inversé pour fermer la réserve R4 : les bases d'abord, le
 * stockage clé/valeur ensuite. Le registre des bases vit dans ce stockage ; l'effacer en
 * premier privait Firefox — qui n'a pas `indexedDB.databases()` — de la seule liste lui
 * permettant de savoir quoi supprimer.
 *
 * Les autres onglets sont prévenus par un canal de diffusion : un onglet oublié ouvert sur un
 * chantier tenait la base ouverte et empêchait sa suppression.
 *
 * `prevenirAutresOnglets` n'a de sens qu'une fois la session FERMÉE. Prévenus avant, les autres
 * onglets partent vers /login avec une session encore valide, le proxy les renvoie vers
 * /dashboard, et ils rouvrent la base qu'on est en train d'effacer. Le bouton de déconnexion
 * purge donc SANS prévenir ; c'est l'arrivée sur /login — où la session n'existe plus — qui
 * prévient. Leurs connexions n'empêchent pas la purge entre-temps : chacune se ferme d'elle-même
 * sur `versionchange`.
 */
export async function purgerDonneesLocales({ prevenirAutresOnglets = true }: { prevenirAutresOnglets?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return;
  if (prevenirAutresOnglets) {
    const message: MessagePurge = { type: "purger", origine: ID_ONGLET };
    try { new BroadcastChannel(CANAL_PURGE).postMessage(message); } catch { /* API absente */ }
  }
  try { await purgerBasesLocales(); } catch { /* rien : la purge ne doit jamais bloquer la sortie */ }
  try { purgerStockageCleValeur(window.localStorage); } catch { /* stockage refusé */ }
  try { purgerStockageCleValeur(window.sessionStorage); } catch { /* stockage refusé */ }
  demanderPurgeDesCaches();
}

/** Au changement d'entreprise : les bases de l'utilisateur sous une AUTRE entreprise partent. */
export async function purgerAutresEntreprises(entrepriseActive: string, utilisateurId: string): Promise<number> {
  if (typeof window === "undefined") return 0;
  return purgerBasesLocales((nom) => {
    const [, , entreprise, utilisateur] = nom.split(":");
    return utilisateur === utilisateurId && entreprise !== entrepriseActive;
  });
}

/** À monter une fois par onglet : obéit à une purge décidée dans un autre onglet. */
export function ecouterPurgeAutresOnglets(): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {};
  const canal = new BroadcastChannel(CANAL_PURGE);
  canal.onmessage = (evenement) => {
    // Cet onglet n'appartient plus à personne : on le renvoie à la connexion. Ses connexions
    // IndexedDB se ferment d'elles-mêmes sur `versionchange`.
    if (doitObeirALaPurge(evenement.data, ID_ONGLET)) window.location.assign("/login");
  };
  return () => canal.close();
}
