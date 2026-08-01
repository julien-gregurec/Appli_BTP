export const MARQUE = "ELSATIA";
export const NOM_APPLICATION = "ELSATIA Gestion Pro";
export const NOM_COURT_PWA = "ELSATIA Gestion Pro";
export const DESCRIPTION_APPLICATION = "ELSATIA Gestion Pro — La gestion BTP simplifiée";

type EnvironnementMarquePublic = Record<string, string | undefined> & {
  NEXT_PUBLIC_APP_URL?: string;
};

type EnvironnementMarqueServeur = Record<string, string | undefined> & {
  SUPPORT_EMAIL?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_FROM_ADDRESS?: string;
};

function valeurOptionnelle(valeur: string | undefined) {
  const nettoyee = valeur?.trim();
  return nettoyee || null;
}

function urlPublique(valeur: string | undefined) {
  const candidate = valeurOptionnelle(valeur);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function creerConfigurationMarquePublique(environnement: EnvironnementMarquePublic = process.env) {
  return Object.freeze({
    marque: MARQUE,
    nomApplication: NOM_APPLICATION,
    nomCourtPwa: NOM_COURT_PWA,
    description: DESCRIPTION_APPLICATION,
    nomPdf: NOM_APPLICATION,
    nomAssistant: NOM_APPLICATION,
    urlPublique: urlPublique(environnement.NEXT_PUBLIC_APP_URL),
  });
}

export function creerConfigurationMarqueServeur(environnement: EnvironnementMarqueServeur) {
  return Object.freeze({
    supportEmail: valeurOptionnelle(environnement.SUPPORT_EMAIL),
    emailFromName: valeurOptionnelle(environnement.EMAIL_FROM_NAME) ?? MARQUE,
    emailFromAddress: valeurOptionnelle(environnement.EMAIL_FROM_ADDRESS),
  });
}

export const BRAND = creerConfigurationMarquePublique();
