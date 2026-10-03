import { ErreurSocial, type CodeErreurSocial } from "@/lib/social/provider";

// Appels HTTP sortants vers les API sociales : délai maximal, classification
// des erreurs et masquage systématique des jetons dans les messages.

const DELAI_MS = 30_000;

export function masquerSecrets(texte: string): string {
  return texte
    .replace(/(access_token|client_secret|refresh_token|fb_exchange_token|code)=([^&\s"]+)/gi, "$1=***")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***")
    .replace(/"(access_token|refresh_token)"\s*:\s*"[^"]+"/gi, '"$1":"***"');
}

export type ClassificateurErreur = (statut: number, corps: unknown) => { code: CodeErreurSocial; message: string };

export type ReponseHttp<T> = { statut: number; corps: T; entetes: Headers };

export async function requete<T = unknown>(
  url: string,
  init: RequestInit & {
    classifier: ClassificateurErreur;
    brut?: boolean;
    /**
     * Requête qui crée quelque chose chez la plateforme (publication, réponse).
     * Sans réponse exploitable (délai, coupure, 5xx), le résultat est
     * « incertain » : jamais de nouvelle tentative automatique, pour ne pas publier deux fois.
     */
    ecriture?: boolean;
  },
): Promise<ReponseHttp<T>> {
  const { classifier, brut, ecriture, ...options } = init;
  let reponse: Response;
  try {
    reponse = await fetch(url, { ...options, signal: AbortSignal.timeout(DELAI_MS), cache: "no-store" });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur réseau";
    if (ecriture) throw new ErreurSocial("incertain", `Aucune réponse de la plateforme : vérifier sur le réseau avant toute relance (${masquerSecrets(message)})`);
    throw new ErreurSocial("transitoire", `Plateforme injoignable : ${masquerSecrets(message)}`);
  }
  const texte = brut ? "" : await reponse.text();
  let corps: unknown = texte;
  if (texte) {
    try {
      corps = JSON.parse(texte);
    } catch {
      corps = texte;
    }
  }
  if (!reponse.ok) {
    const { code, message } = classifier(reponse.status, corps);
    if (ecriture && reponse.status >= 500) {
      throw new ErreurSocial("incertain", `Erreur serveur de la plateforme pendant l’envoi : vérifier sur le réseau avant toute relance (${masquerSecrets(message)})`, { statut: reponse.status });
    }
    throw new ErreurSocial(code, masquerSecrets(message), { statut: reponse.status });
  }
  return { statut: reponse.status, corps: corps as T, entetes: reponse.headers };
}

export function codeParStatutHttp(statut: number): CodeErreurSocial {
  if (statut === 401) return "jeton_expire";
  if (statut === 403) return "permission";
  if (statut === 429) return "limite";
  if (statut >= 500) return "transitoire";
  if (statut === 400 || statut === 422) return "validation";
  return "inconnu";
}

/** Délai avant nouvelle tentative : 1 min, 5 min, 30 min, 2 h, puis abandon. */
export function delaiReprise(tentative: number): number | null {
  const paliers = [60, 300, 1800, 7200];
  const secondes = paliers[tentative - 1];
  return secondes === undefined ? null : secondes * 1000;
}

export const TENTATIVES_MAX = 4;
