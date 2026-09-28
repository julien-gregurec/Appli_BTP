// Environnement d'expédition des e-mails ELSATIA.
//
// Une seule question compte ici : « un e-mail parti de ce déploiement peut-il atteindre
// un vrai client ? ». La réponse n'est « oui » qu'en Production AVÉRÉE. Tout doute —
// indicateur absent, valeur inconnue, indicateurs contradictoires — classe le
// déploiement hors Production, où la liste d'autorisation des destinataires s'applique.

export type EnvironnementEmail = "production" | "preview" | "local" | "test";

type Env = Record<string, string | undefined>;

export function resoudreEnvironnementEmail(environnement: Env = process.env): EnvironnementEmail {
  const declare = environnement.ELSATIA_APPLICATION_ENV?.trim();
  const vercel = environnement.VERCEL_ENV?.trim();

  if (declare === "production") {
    // Une Preview Vercel qui hérite par erreur de la valeur de Production reste une
    // Preview : c'est exactement l'accident que ce module doit empêcher.
    if (vercel && vercel !== "production") return "preview";
    return "production";
  }
  if (declare === "preview") return "preview";
  if (declare === "test") return "test";
  if (declare === "local") return vercel ? "preview" : "local";
  // Indicateur canonique absent ou inconnu (manifeste : F-ENV-FALLBACK-LOCAL).
  // Un déploiement Vercel, même « production », n'est pas cru sur parole.
  if (vercel) return "preview";
  if (environnement.NODE_ENV === "test") return "test";
  return "local";
}

export function estProduction(environnement: Env = process.env): boolean {
  return resoudreEnvironnementEmail(environnement) === "production";
}

/** Libellé visible (bannière, préfixe d'objet) ; `null` en Production. */
export function libelleEnvironnement(env: EnvironnementEmail): string | null {
  if (env === "production") return null;
  if (env === "preview") return "PREVIEW";
  if (env === "test") return "TEST";
  return "LOCAL";
}
