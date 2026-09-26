/**
 * Image facultative d'une communication (§11).
 *
 * Une image n'est JAMAIS obligatoire : `validerImageCommunication(null)` réussit et
 * renvoie « pas d'image ». Quand il y en a une, trois contrôles indépendants doivent
 * tous passer :
 *   1. le type MIME RÉEL, déduit des octets d'en-tête — le nom de fichier et le
 *      `Content-Type` déclaré par le navigateur sont des affirmations du client ;
 *   2. la taille et les dimensions ;
 *   3. le texte alternatif, obligatoire (accessibilité).
 *
 * Le SVG est refusé sans exception : un SVG est un document capable de porter du
 * script et des références externes. « Assainir un SVG » est un problème ouvert ;
 * ne pas en accepter n'en est pas un.
 */

export type FormatImage = "png" | "jpeg" | "webp";

export const FORMATS_IMAGE_AUTORISES: readonly FormatImage[] = ["png", "jpeg", "webp"];

export const MIME_PAR_FORMAT: Readonly<Record<FormatImage, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const TAILLE_MAXIMALE_IMAGE_OCTETS = 2 * 1024 * 1024;
export const LARGEUR_MAXIMALE_IMAGE = 2400;
export const HAUTEUR_MAXIMALE_IMAGE = 1600;
export const LARGEUR_MINIMALE_IMAGE = 320;
export const HAUTEUR_MINIMALE_IMAGE = 180;
/** Dimensions recommandées : bandeau 16:9 lisible sur téléphone comme sur écran large. */
export const DIMENSIONS_RECOMMANDEES = { largeur: 1200, hauteur: 675 } as const;
export const LONGUEUR_MINIMALE_ALT = 5;
export const LONGUEUR_MAXIMALE_ALT = 160;

function commencePar(octets: Uint8Array, signature: readonly number[], decalage = 0): boolean {
  if (octets.length < decalage + signature.length) return false;
  return signature.every((valeur, index) => octets[decalage + index] === valeur);
}

/**
 * Type réel déduit des octets. Renvoie `null` pour tout ce qui n'est pas un des trois
 * formats autorisés — y compris un SVG, qui commence par du texte et n'a donc aucune
 * signature binaire à reconnaître.
 */
export function detecterFormatImage(octets: Uint8Array): FormatImage | null {
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (commencePar(octets, [0xff, 0xd8, 0xff])) return "jpeg";
  if (commencePar(octets, [0x52, 0x49, 0x46, 0x46]) && commencePar(octets, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}

export type EntreeImage = {
  octets: Uint8Array;
  /** Type annoncé par le client. Comparé au type réel, jamais utilisé seul. */
  mimeDeclare: string | null;
  largeur: number;
  hauteur: number;
  texteAlternatif: string | null;
};

export type ResultatImage =
  | { valide: true; image: null }
  | { valide: true; image: ImageValidee }
  | { valide: false; erreur: RaisonImageRefusee; message: string };

export type ImageValidee = {
  format: FormatImage;
  mime: string;
  octets: number;
  largeur: number;
  hauteur: number;
  texteAlternatif: string;
  /** L'image est-elle aux dimensions recommandées (indicatif, jamais bloquant) ? */
  dimensionsRecommandees: boolean;
};

export type RaisonImageRefusee =
  | "format_non_reconnu"
  | "format_interdit"
  | "mime_incoherent"
  | "trop_lourde"
  | "dimensions_trop_grandes"
  | "dimensions_trop_petites"
  | "alt_manquant"
  | "alt_trop_long";

export function validerImageCommunication(entree: EntreeImage | null): ResultatImage {
  if (entree === null) return { valide: true, image: null };

  const format = detecterFormatImage(entree.octets);
  if (format === null) {
    return {
      valide: false,
      erreur: "format_non_reconnu",
      message: "Format d’image non reconnu (PNG, JPEG ou WebP attendus). Le SVG n’est pas accepté.",
    };
  }
  if (!FORMATS_IMAGE_AUTORISES.includes(format)) {
    return { valide: false, erreur: "format_interdit", message: "Format d’image non autorisé" };
  }
  // Le type déclaré doit correspondre au type réel : une divergence signale au mieux un
  // client mal réglé, au pire une tentative de contournement. Dans les deux cas on refuse.
  if (entree.mimeDeclare !== null && entree.mimeDeclare !== MIME_PAR_FORMAT[format]) {
    return {
      valide: false,
      erreur: "mime_incoherent",
      message: "Le type de fichier annoncé ne correspond pas au contenu réel",
    };
  }
  if (entree.octets.byteLength > TAILLE_MAXIMALE_IMAGE_OCTETS) {
    return {
      valide: false,
      erreur: "trop_lourde",
      message: `Image trop lourde (${Math.round(TAILLE_MAXIMALE_IMAGE_OCTETS / 1024 / 1024)} Mo maximum)`,
    };
  }
  if (entree.largeur > LARGEUR_MAXIMALE_IMAGE || entree.hauteur > HAUTEUR_MAXIMALE_IMAGE) {
    return {
      valide: false,
      erreur: "dimensions_trop_grandes",
      message: `Dimensions maximales : ${LARGEUR_MAXIMALE_IMAGE} × ${HAUTEUR_MAXIMALE_IMAGE} px`,
    };
  }
  if (entree.largeur < LARGEUR_MINIMALE_IMAGE || entree.hauteur < HAUTEUR_MINIMALE_IMAGE) {
    return {
      valide: false,
      erreur: "dimensions_trop_petites",
      message: `Dimensions minimales : ${LARGEUR_MINIMALE_IMAGE} × ${HAUTEUR_MINIMALE_IMAGE} px`,
    };
  }
  const alt = (entree.texteAlternatif ?? "").trim();
  if (alt.length < LONGUEUR_MINIMALE_ALT) {
    return {
      valide: false,
      erreur: "alt_manquant",
      message: "Le texte alternatif est obligatoire (accessibilité)",
    };
  }
  if (alt.length > LONGUEUR_MAXIMALE_ALT) {
    return {
      valide: false,
      erreur: "alt_trop_long",
      message: `Texte alternatif trop long (${LONGUEUR_MAXIMALE_ALT} caractères maximum)`,
    };
  }
  return {
    valide: true,
    image: {
      format,
      mime: MIME_PAR_FORMAT[format],
      octets: entree.octets.byteLength,
      largeur: entree.largeur,
      hauteur: entree.hauteur,
      texteAlternatif: alt,
      dimensionsRecommandees:
        Math.abs(entree.largeur / entree.hauteur - DIMENSIONS_RECOMMANDEES.largeur / DIMENSIONS_RECOMMANDEES.hauteur) < 0.05,
    },
  };
}

/**
 * Une image de communication est servie depuis le stockage ELSATIA, jamais depuis un
 * hôte distant : une URL externe permettrait de pister les lecteurs et de remplacer
 * l'image après validation.
 */
export function estSourceImageAutorisee(url: string): boolean {
  const valeur = url.trim();
  if (valeur.startsWith("/")) return !valeur.startsWith("//");
  try {
    const parsee = new URL(valeur);
    if (parsee.protocol !== "https:") return false;
    return parsee.hostname.endsWith(".supabase.co") || parsee.hostname.endsWith(".elsatia.fr");
  } catch {
    return false;
  }
}

/** Recadrage : proposé côté opérateur, appliqué avant envoi. Contrôle des bornes ici. */
export function validerRecadrage(entree: {
  largeurSource: number;
  hauteurSource: number;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}): boolean {
  const { largeurSource, hauteurSource, x, y, largeur, hauteur } = entree;
  if (largeur <= 0 || hauteur <= 0 || x < 0 || y < 0) return false;
  return x + largeur <= largeurSource && y + hauteur <= hauteurSource;
}
