/**
 * Construction de la destination `/login` lorsqu'une page protégée est refusée.
 *
 * Deux défauts fermés ici, tous deux mesurés sur l'application :
 *
 *  1. `getContexteColors()` renvoyait vers `/login` sans mémoriser la page
 *     demandée. Une personne qui ouvrait un lien direct vers la fiche d'un seau
 *     — le cas normal d'un lien partagé entre collègues — se retrouvait sur le
 *     tableau de bord après connexion, sans jamais atteindre la fiche.
 *  2. Une session expirée et une absence totale de session produisaient le même
 *     écran muet. La première mérite une explication : sans elle, l'utilisateur
 *     croit à une panne ou à un mot de passe changé.
 *
 * La distinction repose sur un fait observable, jamais sur une supposition : la
 * requête portait-elle un cookie d'authentification Supabase ? Si oui, une
 * session a existé sur ce navigateur et vient de cesser d'être valide. Si non,
 * la personne n'était pas connectée, et affirmer « session expirée » serait
 * faux.
 *
 * `next` n'est jamais repris tel quel : il passe par `cheminInterneSur`, seul
 * point de vérité des redirections internes.
 */

import { cheminInterneSur, DESTINATION_INTERNE_PAR_DEFAUT } from "@/lib/redirection-sure";
import { CODE_SESSION_EXPIREE } from "@/lib/messages-auth";

/** Préfixe des cookies posés par `@supabase/ssr` pour un projet donné. */
export const PREFIXE_COOKIE_SESSION = "sb-";

export type EtatDemandeProtegee = {
  /** Chemin demandé, tel que relevé par le proxy sur la requête. */
  chemin: string | null;
  /** Un cookie d'authentification Supabase accompagnait la requête. */
  sessionPresente: boolean;
};

/** Vrai dès qu'un cookie d'authentification Supabase accompagne la requête. */
export function porteCookieSession(noms: readonly string[]): boolean {
  return noms.some((nom) => nom.startsWith(PREFIXE_COOKIE_SESSION));
}

/**
 * Destination de connexion pour une demande refusée.
 *
 * Le paramètre `next` est omis quand il vaudrait la destination par défaut :
 * une URL de connexion nue est plus lisible, et le repli est déjà `/dashboard`.
 */
export function urlConnexionDepuis({ chemin, sessionPresente }: EtatDemandeProtegee): string {
  const parametres = new URLSearchParams();
  const destination = cheminInterneSur(chemin);
  if (destination !== DESTINATION_INTERNE_PAR_DEFAUT) parametres.set("next", destination);
  if (sessionPresente) parametres.set("error", CODE_SESSION_EXPIREE);
  const requete = parametres.toString();
  return requete ? `/login?${requete}` : "/login";
}
