// Garde des destinataires : aucun e-mail hors Production n'atteint un vrai client.
//
// Hors Production, un destinataire n'est servi que s'il figure dans
// `EMAIL_PREVIEW_ALLOWLIST` — adresses exactes (`qa@elsatia.fr`) ou domaines entiers
// (`@elsatia.fr`, correspondance EXACTE du domaine : `@elsatia.fr` n'autorise pas
// `x@evil.elsatia.fr.example`, ni même `x@sous.elsatia.fr`). Liste absente ou vide :
// personne n'est servi. Aucun joker (`*`) n'est accepté.
//
// En Production, la liste n'est pas lue ; seule la FORME de l'adresse est contrôlée
// (une virgule, un retour à la ligne ou un chevron dans un destinataire est une
// tentative d'injection d'en-tête ou d'envoi multiple, refusée partout).

import { resoudreEnvironnementEmail, type EnvironnementEmail } from "./environnement.ts";

type Env = Record<string, string | undefined>;

export type DecisionDestinataire =
  | { autorise: true; environnement: EnvironnementEmail }
  | { autorise: false; environnement: EnvironnementEmail; motif: "adresse_invalide" | "liste_preview_absente" | "hors_liste_preview" };

const ADRESSE = /^[^\s@,;<>"'()\\]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/;

export function normaliserAdresse(valeur: string): string | null {
  const adresse = valeur.trim().toLowerCase();
  if (adresse.length === 0 || adresse.length > 254) return null;
  return ADRESSE.test(adresse) ? adresse : null;
}

export type ListeAutorisee = { adresses: ReadonlySet<string>; domaines: ReadonlySet<string> };

export function lireListeAutorisee(valeur: string | undefined): ListeAutorisee {
  const adresses = new Set<string>();
  const domaines = new Set<string>();
  for (const brut of (valeur ?? "").split(/[,;\s]+/)) {
    const entree = brut.trim().toLowerCase();
    if (!entree || entree.includes("*")) continue;
    if (entree.startsWith("@")) {
      const domaine = normaliserAdresse(`x${entree}`)?.slice(2);
      if (domaine) domaines.add(domaine);
      continue;
    }
    const adresse = normaliserAdresse(entree);
    if (adresse) adresses.add(adresse);
  }
  return { adresses, domaines };
}

export function deciderDestinataire(adresse: string, environnement: Env = process.env): DecisionDestinataire {
  const env = resoudreEnvironnementEmail(environnement);
  const normalisee = normaliserAdresse(adresse);
  if (!normalisee) return { autorise: false, environnement: env, motif: "adresse_invalide" };
  if (env === "production") return { autorise: true, environnement: env };

  const liste = lireListeAutorisee(environnement.EMAIL_PREVIEW_ALLOWLIST);
  if (liste.adresses.size === 0 && liste.domaines.size === 0) {
    return { autorise: false, environnement: env, motif: "liste_preview_absente" };
  }
  const domaine = normalisee.slice(normalisee.lastIndexOf("@") + 1);
  if (liste.adresses.has(normalisee) || liste.domaines.has(domaine)) return { autorise: true, environnement: env };
  return { autorise: false, environnement: env, motif: "hors_liste_preview" };
}
