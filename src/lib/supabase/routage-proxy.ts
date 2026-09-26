/**
 * Règles de routage pures du proxy d'accès (middleware).
 *
 * Extraites de `proxy.ts` pour être testables sans Supabase : elles décrivent
 * QUELLE destination choisir, jamais COMMENT interroger la base. La contrainte
 * cardinale (§2) : ne jamais renvoyer l'utilisateur vers une route que la garde
 * refusera juste après — sinon boucle de redirection.
 */

/** Cul-de-sac informatif : explique ce que l'offre de l'entreprise ne couvre pas. */
export const CHEMIN_MODULE_NON_INCLUS = "/abonnement/module-non-inclus";

/** Permission « porte d'entrée » de la borne de dépôt partagée. */
export const PERMISSION_BORNE = "utiliser_borne_stock";

/**
 * `/abonnement/module-non-inclus` ne porte aucune donnée sensible et doit rester
 * une destination terminale : la garde ne doit jamais la rediriger ailleurs,
 * quel que soit le profil (y compris compte dépôt).
 */
export function estCulDeSacInformatif(pathname: string): boolean {
  return pathname === CHEMIN_MODULE_NON_INCLUS;
}

/** Chemins qu'un compte dépôt connecté peut afficher sans se déconnecter. */
export function cheminAutorisePourCompteDepot(pathname: string): boolean {
  return (
    pathname === "/depot" ||
    pathname === "/stock" ||
    pathname.startsWith("/stock/") ||
    estCulDeSacInformatif(pathname)
  );
}

export type DecisionRoutage =
  | { type: "passer" }
  | { type: "rediriger"; pathname: string; module?: string };

/**
 * Priorité compte dépôt (§2). Le compte dépôt partagé reste prisonnier de son
 * périmètre tant qu'il est connecté ; on l'envoie vers sa borne UNIQUEMENT si
 * l'entreprise y a réellement droit, sinon directement vers le cul-de-sac
 * informatif — jamais vers `/stock/borne` « en espérant » que la garde corrige.
 */
export function decisionRoutageCompteDepot(params: {
  compteDepot: boolean;
  pathname: string;
  borneAccessible: boolean;
}): DecisionRoutage {
  const { compteDepot, pathname, borneAccessible } = params;
  if (!compteDepot) return { type: "passer" };
  if (cheminAutorisePourCompteDepot(pathname)) return { type: "passer" };
  if (borneAccessible) return { type: "rediriger", pathname: "/stock/borne" };
  return { type: "rediriger", pathname: CHEMIN_MODULE_NON_INCLUS, module: PERMISSION_BORNE };
}

/**
 * Un utilisateur normal (non compte dépôt) déjà authentifié qui visite
 * `/login` ou `/signup` repart vers le tableau de bord — route toujours
 * accessible (aucune permission « porte d'entrée » requise).
 */
export function decisionRoutageAuthentifieSurPagePublique(params: {
  compteDepot: boolean;
  pathname: string;
}): DecisionRoutage {
  const { compteDepot, pathname } = params;
  if (compteDepot) return { type: "passer" };
  if (pathname === "/login" || pathname === "/signup") {
    return { type: "rediriger", pathname: "/dashboard" };
  }
  return { type: "passer" };
}
