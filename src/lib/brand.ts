export const MARQUE = "ELSATIA";
export const NOM_APPLICATION = "ELSATIA Gestion Pro";
// Nom affiché SOUS l'icône de l'écran d'accueil.
//
// CONSTAT REMONTÉ, DÉCISION NON PRISE (lot ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1) :
// iOS et Android tronquent ce libellé autour de 12 caractères. « ELSATIA Gestion Pro »
// s'affiche donc « ELSATIA Ges… », qui ne distingue plus Gestion Pro des autres
// applications ELSATIA installées sur le même téléphone.
//
// La valeur officielle est CONSERVÉE : le nommage de la marque relève d'un arbitrage
// commercial, pas d'une correction technique — d'autant que `brand.test.ts` et
// `brand-visible.test.ts` verrouillent explicitement « les noms officiels ». Les options
// (« Gestion Pro », « ELSATIA GP », statu quo) sont exposées dans le rapport du lot.
export const NOM_COURT_PWA = "ELSATIA Gestion Pro";
export const DESCRIPTION_APPLICATION = "ELSATIA Gestion Pro — La gestion BTP simplifiée";
export const URL_CONTACT_COMMERCIAL = "https://elsatia.fr/contact";
export const BRAND_NAME = MARQUE;
export const PRODUCT_NAME = NOM_APPLICATION;

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

export function resoudreUrlContactCommercial(
  candidate: string | null | undefined = URL_CONTACT_COMMERCIAL,
) {
  const valeur = candidate?.trim();
  if (!valeur) return URL_CONTACT_COMMERCIAL;

  try {
    const url = new URL(valeur);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : URL_CONTACT_COMMERCIAL;
  } catch {
    return URL_CONTACT_COMMERCIAL;
  }
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
