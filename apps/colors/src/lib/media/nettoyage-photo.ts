import "server-only";
import sharp, { type Metadata, type Sharp } from "sharp";
import type { MimePhotoColors } from "@/lib/media-colors";

/**
 * Nettoyage confidentiel d'une photo Colors, avant tout stockage.
 *
 * ### Ce que le fichier d'origine contient, et pourquoi c'est un probleme
 *
 * Une photo prise sur un chantier porte bien plus que l'image. Son bloc EXIF
 * transporte, selon le reglage de l'appareil, les **coordonnees GPS du lieu de
 * la prise de vue** — c'est-a-dire l'adresse d'un client —, le modele et le
 * numero de serie de l'appareil, la date et l'heure exactes, le logiciel de
 * retouche, et souvent une **miniature integree** qui est une seconde image
 * complete, parfois anterieure aux recadrages.
 *
 * Rien de tout cela n'est affiche par Colors, et c'est precisement le danger :
 * ces donnees voyagent avec le fichier sans que personne ne les voie, et toute
 * personne habilitee sur l'organisation peut le telecharger.
 *
 * ### Ce que ce module garantit
 *
 * L'image est **decodee puis reencodee**. Ce n'est pas un retrait de champs :
 * les pixels sont relus et un fichier neuf est ecrit. Aucun bloc de metadonnees
 * de l'original ne peut survivre a ce trajet, y compris ceux qu'une liste de
 * champs a retirer aurait oublies — un profil fabricant proprietaire, un
 * commentaire XMP, une miniature enfouie.
 *
 * L'orientation EXIF est **appliquee aux pixels avant** d'etre effacee : sans
 * cette precaution, retirer l'EXIF ferait basculer d'un quart de tour toutes les
 * photos prises en portrait, et Colors afficherait des etiquettes couchees.
 *
 * ### Ferme par defaut
 *
 * Toute anomalie — image illisible, dimensions aberrantes, encodage impossible,
 * metadonnees encore presentes apres nettoyage — **refuse le stockage**. Il n'y
 * a pas de repli sur le fichier d'origine : un fichier non nettoye ne doit
 * jamais atteindre le stockage, et un echec visible vaut mieux qu'une photo
 * conservee avec ses coordonnees.
 *
 * ### Rien n'est journalise
 *
 * Les metadonnees retirees ne sont ni lues pour etre ecrites ailleurs, ni
 * comptees, ni tracees. Les journaliser reviendrait a deplacer la fuite du
 * fichier vers les journaux, qui ne sont pas cloisonnes par organisation.
 */

/** Formats reellement ecrits dans le stockage apres nettoyage. */
export type MimeNettoye = "image/jpeg" | "image/png" | "image/webp";

/**
 * Format de sortie pour un format d'entree.
 *
 * HEIC et HEIF sortent en JPEG : aucun navigateur ne les affiche, et Colors
 * rend les photos avec `next/image`. Conserver un `.heic` produirait une fiche
 * dont l'image ne s'affiche pas — un defaut que le nettoyage n'a pas a creer.
 */
export const SORTIE_PAR_ENTREE: Record<MimePhotoColors, MimeNettoye> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/heic": "image/jpeg",
  "image/heif": "image/jpeg",
};

/** Bornes de decodage. Au-dela, on refuse plutot que de faire travailler le serveur. */
export const DIMENSION_MAXIMALE = 12_000;
export const PIXELS_MAXIMUM = 80_000_000;
export const TAILLE_MAXIMALE_SORTIE = 10 * 1024 * 1024;

export type EchecNettoyage =
  | "illisible"
  | "dimensions_absentes"
  | "dimensions_excessives"
  | "encodage_impossible"
  | "metadonnees_residuelles"
  | "sortie_trop_lourde";

export const MOTIFS_ECHEC: Record<EchecNettoyage, string> = {
  illisible: "Le contenu de ce fichier n'a pas pu etre decode comme une image.",
  dimensions_absentes: "Les dimensions de cette image n'ont pas pu etre determinees.",
  dimensions_excessives: "Cette image est trop grande pour etre traitee.",
  encodage_impossible: "Cette image n'a pas pu etre reencodee.",
  metadonnees_residuelles: "Le nettoyage des metadonnees n'a pas abouti ; la photo n'est pas enregistree.",
  sortie_trop_lourde: "L'image nettoyee depasse la taille autorisee.",
};

export type ResultatNettoyage =
  | { ok: true; contenu: Uint8Array; mime: MimeNettoye; largeur: number; hauteur: number }
  | { ok: false; echec: EchecNettoyage; motif: string };

function echec(cause: EchecNettoyage): ResultatNettoyage {
  return { ok: false, echec: cause, motif: MOTIFS_ECHEC[cause] };
}

/**
 * Marqueurs de blocs de metadonnees, cherches dans les octets du fichier produit.
 *
 * `EXIF_APP1` est la signature d'un segment EXIF de JPEG : les quatre lettres
 * suivies de deux octets nuls. On la construit ici plutot que de l'ecrire en
 * litteral pour qu'elle reste lisible.
 */
const EXIF_APP1 = "Exif" + String.fromCharCode(0) + String.fromCharCode(0);
const MARQUEURS_METADONNEES = [
  EXIF_APP1,
  "http://ns.adobe.com/xap/",
  "ICC_PROFILE",
  "Photoshop 3.0",
  "GPSLatitude",
  "GPSLongitude",
];

/**
 * Verifie qu'aucune metadonnee ne subsiste dans le fichier produit.
 *
 * Ce controle est deliberement fait sur les OCTETS, pas sur ce que le decodeur
 * veut bien rapporter : c'est un controle de sortie, il ne doit rien devoir a
 * la bibliotheque qui vient d'ecrire le fichier. Un segment EXIF residuel
 * serait detecte ici meme si le decodeur ne le signalait pas.
 */
export function porteEncoreDesMetadonnees(contenu: Uint8Array): boolean {
  // Fenetre de lecture : les blocs de metadonnees d'un JPEG precedent l'image,
  // et ceux d'un PNG ou d'un WebP se trouvent dans les premiers segments. On
  // lit large — 256 Kio — sans balayer plusieurs megaoctets de pixels.
  const fenetre = contenu.subarray(0, Math.min(contenu.length, 262_144));
  const texte = Buffer.from(fenetre).toString("latin1");
  return MARQUEURS_METADONNEES.some((marqueur) => texte.includes(marqueur));
}

/**
 * Decode, redresse, reencode.
 *
 * `rotate()` sans argument applique l'orientation EXIF aux pixels. Sharp
 * n'ecrit aucune metadonnee a moins qu'on ne le lui demande explicitement par
 * `withMetadata()` — ce que ce module ne fait jamais, et ne doit jamais faire.
 */
export async function nettoyerPhotoColors(
  contenu: Uint8Array,
  mimeEntree: MimePhotoColors,
): Promise<ResultatNettoyage> {
  const sortie = SORTIE_PAR_ENTREE[mimeEntree];

  let image: Sharp;
  let metadonnees: Metadata;
  try {
    image = sharp(Buffer.from(contenu), { failOn: "error", limitInputPixels: PIXELS_MAXIMUM });
    metadonnees = await image.metadata();
  } catch {
    return echec("illisible");
  }

  if (!metadonnees.width || !metadonnees.height) return echec("dimensions_absentes");
  if (metadonnees.width > DIMENSION_MAXIMALE || metadonnees.height > DIMENSION_MAXIMALE) {
    return echec("dimensions_excessives");
  }

  let produit: Buffer;
  try {
    const redressee = image.rotate();
    produit = sortie === "image/png"
      ? await redressee.png({ compressionLevel: 9 }).toBuffer()
      : sortie === "image/webp"
        ? await redressee.webp({ quality: 82 }).toBuffer()
        : await redressee.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    return echec("encodage_impossible");
  }

  if (produit.byteLength > TAILLE_MAXIMALE_SORTIE) return echec("sortie_trop_lourde");
  // Controle de sortie : on ne fait pas confiance au reencodage sur parole.
  if (porteEncoreDesMetadonnees(produit)) return echec("metadonnees_residuelles");

  let apres: Metadata;
  try {
    apres = await sharp(produit).metadata();
  } catch {
    return echec("encodage_impossible");
  }
  if (apres.exif || apres.xmp || apres.iptc) return echec("metadonnees_residuelles");
  if (!apres.width || !apres.height) return echec("dimensions_absentes");

  return { ok: true, contenu: new Uint8Array(produit), mime: sortie, largeur: apres.width, hauteur: apres.height };
}
