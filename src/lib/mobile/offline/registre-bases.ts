/**
 * Registre des bases locales de Gestion Pro — réserve R4.
 *
 * `indexedDB.databases()` n'existe pas sur Firefox. Sans elle, on ne peut pas ÉNUMÉRER les
 * bases présentes : la purge de déconnexion rendait 0 et laissait sur l'appareil les données
 * des sessions précédentes. On tient donc nous-mêmes la liste des bases ouvertes, dans une
 * clé de stockage local : ce qu'on a ouvert, on sait le retrouver pour le supprimer.
 *
 * Deux autres obstacles à une suppression effective, traités ailleurs :
 *   — une connexion restée OUVERTE bloque `deleteDatabase` (événement `blocked`) : chaque
 *     connexion se ferme d'elle-même sur `versionchange` ;
 *   — un AUTRE ONGLET peut tenir la base ouverte : un message de diffusion lui demande de
 *     fermer avant la suppression.
 *
 * Module pur : le stockage est injecté, pour être éprouvé sans navigateur.
 */
export const CLE_REGISTRE = "elsatia:gp:registre-bases";

type Stockage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function lireRegistre(stockage: Stockage): string[] {
  try {
    const brut = stockage.getItem(CLE_REGISTRE);
    const valeur = brut ? JSON.parse(brut) : [];
    return Array.isArray(valeur) ? valeur.filter((n): n is string => typeof n === "string" && n.startsWith("elsatia:gp:")) : [];
  } catch {
    return [];
  }
}

export function inscrireAuRegistre(stockage: Stockage, nomBase: string): void {
  if (!nomBase.startsWith("elsatia:gp:")) return;
  const noms = new Set(lireRegistre(stockage));
  if (noms.has(nomBase)) return;
  noms.add(nomBase);
  try { stockage.setItem(CLE_REGISTRE, JSON.stringify([...noms])); } catch { /* quota : la purge retombera sur databases() */ }
}

export function oublierRegistre(stockage: Stockage): void {
  try { stockage.removeItem(CLE_REGISTRE); } catch { /* rien */ }
}

/**
 * Bases à supprimer : l'union du registre et de l'énumération native quand elle existe.
 *
 * L'union et non l'un OU l'autre : le registre couvre Firefox ; l'énumération native couvre les
 * bases créées avant l'existence du registre (appareils déjà en service lors de la mise à jour).
 */
export function basesAPurger(registre: readonly string[], enumerees: readonly string[] | null): string[] {
  const toutes = new Set<string>(registre);
  for (const nom of enumerees ?? []) if (nom.startsWith("elsatia:gp:")) toutes.add(nom);
  return [...toutes];
}

/** Bases d'une AUTRE entreprise que l'active, pour le même utilisateur : purgées au changement d'entreprise. */
export function basesDesAutresEntreprises(noms: readonly string[], entrepriseActive: string, utilisateurId: string): string[] {
  return noms.filter((nom) => {
    const [, , entreprise, utilisateur] = nom.split(":");
    return utilisateur === utilisateurId && entreprise !== entrepriseActive;
  });
}
