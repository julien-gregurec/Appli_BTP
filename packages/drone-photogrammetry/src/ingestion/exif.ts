/**
 * Lecture EXIF des photos d'entrée (§8 du brief prototype).
 *
 * Lecteur autonome, sans dépendance : le dépôt ne doit pas gagner une
 * bibliothèque tierce pour un prototype. Il lit exactement ce dont le pipeline
 * a besoin — GPS, appareil, focale, orientation, dimensions, horodatage — et
 * conserve les valeurs brutes reconnues (§76 du brief Drone : l'EXIF n'est
 * jamais purgé à l'import).
 *
 * Limites assumées : IFD0, ExifIFD et GPSIFD seulement ; pas de MakerNote, pas
 * de XMP (où DJI place le yaw/pitch/roll de la nacelle — à instruire avant tout
 * calcul métrologique).
 */

export type ExifMedia = {
  /** Faux quand aucun segment EXIF n'existe : seules les dimensions du SOF sont connues. */
  segmentPresent: boolean;
  marque: string | null;
  modele: string | null;
  objectif: string | null;
  focaleMm: number | null;
  focale35Mm: number | null;
  orientation: number | null;
  largeurPx: number | null;
  hauteurPx: number | null;
  /** Horodatage EXIF sans fuseau : `AAAA-MM-JJTHH:MM:SS`, décalage inconnu. */
  priseLe: string | null;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  /** Étiquettes reconnues, conservées telles quelles. */
  brut: Record<string, string | number>;
};

const EXIF_VIDE: ExifMedia = {
  segmentPresent: false,
  marque: null,
  modele: null,
  objectif: null,
  focaleMm: null,
  focale35Mm: null,
  orientation: null,
  largeurPx: null,
  hauteurPx: null,
  priseLe: null,
  latitude: null,
  longitude: null,
  altitudeM: null,
  brut: {},
};

const TAILLE_PAR_TYPE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

type ValeurExif = string | number | number[] | null;

type ContexteTiff = {
  vue: DataView;
  debutTiff: number;
  petitBoutiste: boolean;
};

function lireEntier16(ctx: ContexteTiff, position: number): number {
  return ctx.vue.getUint16(position, ctx.petitBoutiste);
}

function lireEntier32(ctx: ContexteTiff, position: number): number {
  return ctx.vue.getUint32(position, ctx.petitBoutiste);
}

function lireValeur(ctx: ContexteTiff, type: number, nombre: number, position: number): ValeurExif {
  const taille = TAILLE_PAR_TYPE[type];
  if (taille === undefined) return null;
  const octetsTotal = taille * nombre;
  const depart = octetsTotal <= 4 ? position : ctx.debutTiff + lireEntier32(ctx, position);
  if (depart < 0 || depart + octetsTotal > ctx.vue.byteLength) return null;

  if (type === 2) {
    let texte = "";
    for (let index = 0; index < nombre; index += 1) {
      const code = ctx.vue.getUint8(depart + index);
      if (code === 0) break;
      texte += String.fromCharCode(code);
    }
    return texte.trim();
  }

  const valeurs: number[] = [];
  for (let index = 0; index < nombre; index += 1) {
    const p = depart + index * taille;
    switch (type) {
      case 1:
      case 7:
        valeurs.push(ctx.vue.getUint8(p));
        break;
      case 3:
        valeurs.push(lireEntier16(ctx, p));
        break;
      case 4:
        valeurs.push(lireEntier32(ctx, p));
        break;
      case 9:
        valeurs.push(ctx.vue.getInt32(p, ctx.petitBoutiste));
        break;
      case 5: {
        const numerateur = lireEntier32(ctx, p);
        const denominateur = lireEntier32(ctx, p + 4);
        valeurs.push(denominateur === 0 ? 0 : numerateur / denominateur);
        break;
      }
      case 10: {
        const numerateur = ctx.vue.getInt32(p, ctx.petitBoutiste);
        const denominateur = ctx.vue.getInt32(p + 4, ctx.petitBoutiste);
        valeurs.push(denominateur === 0 ? 0 : numerateur / denominateur);
        break;
      }
      default:
        return null;
    }
  }
  return valeurs.length === 1 ? valeurs[0] : valeurs;
}

function lireIfd(ctx: ContexteTiff, decalageIfd: number): Map<number, ValeurExif> {
  const entrees = new Map<number, ValeurExif>();
  const position = ctx.debutTiff + decalageIfd;
  if (position + 2 > ctx.vue.byteLength) return entrees;
  const nombre = lireEntier16(ctx, position);
  for (let index = 0; index < nombre; index += 1) {
    const debutEntree = position + 2 + index * 12;
    if (debutEntree + 12 > ctx.vue.byteLength) break;
    const tag = lireEntier16(ctx, debutEntree);
    const type = lireEntier16(ctx, debutEntree + 2);
    const compte = lireEntier32(ctx, debutEntree + 4);
    if (compte > 4096) continue;
    entrees.set(tag, lireValeur(ctx, type, compte, debutEntree + 8));
  }
  return entrees;
}

function nombreOuNull(valeur: ValeurExif): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

function texteOuNull(valeur: ValeurExif): string | null {
  return typeof valeur === "string" && valeur.length > 0 ? valeur : null;
}

function convertirDegresMinutesSecondes(valeur: ValeurExif, reference: ValeurExif): number | null {
  if (!Array.isArray(valeur) || valeur.length < 3) return null;
  const [degres, minutes, secondes] = valeur;
  const decimal = degres + minutes / 60 + secondes / 3600;
  if (!Number.isFinite(decimal)) return null;
  const ref = typeof reference === "string" ? reference.toUpperCase() : "";
  const negatif = ref === "S" || ref === "W";
  return negatif ? -decimal : decimal;
}

function convertirHorodatageExif(valeur: ValeurExif): string | null {
  const texte = texteOuNull(valeur);
  if (texte === null) return null;
  const correspondance = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(texte);
  if (correspondance === null) return null;
  const [, annee, mois, jour, heures, minutes, secondes] = correspondance;
  return `${annee}-${mois}-${jour}T${heures}:${minutes}:${secondes}`;
}

/** Dimensions lues dans le segment SOF, indépendamment de l'EXIF. */
export function lireDimensionsJpeg(octets: Uint8Array): { largeur: number; hauteur: number } | null {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let position = 2;
  while (position + 4 <= vue.byteLength) {
    if (vue.getUint8(position) !== 0xff) {
      position += 1;
      continue;
    }
    const marqueur = vue.getUint8(position + 1);
    if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) {
      position += 2;
      continue;
    }
    if (marqueur === 0xda || marqueur === 0xd9) return null;
    const longueur = vue.getUint16(position + 2, false);
    const estSof =
      (marqueur >= 0xc0 && marqueur <= 0xc3) ||
      (marqueur >= 0xc5 && marqueur <= 0xc7) ||
      (marqueur >= 0xc9 && marqueur <= 0xcb) ||
      (marqueur >= 0xcd && marqueur <= 0xcf);
    if (estSof && position + 9 <= vue.byteLength) {
      return {
        hauteur: vue.getUint16(position + 5, false),
        largeur: vue.getUint16(position + 7, false),
      };
    }
    position += 2 + longueur;
  }
  return null;
}

function trouverSegmentExif(octets: Uint8Array): number | null {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (vue.byteLength < 4 || vue.getUint16(0, false) !== 0xffd8) return null;
  let position = 2;
  while (position + 4 <= vue.byteLength) {
    if (vue.getUint8(position) !== 0xff) {
      position += 1;
      continue;
    }
    const marqueur = vue.getUint8(position + 1);
    if (marqueur === 0xda || marqueur === 0xd9) return null;
    const longueur = vue.getUint16(position + 2, false);
    if (marqueur === 0xe1 && position + 10 <= vue.byteLength) {
      const entete = String.fromCharCode(
        vue.getUint8(position + 4),
        vue.getUint8(position + 5),
        vue.getUint8(position + 6),
        vue.getUint8(position + 7),
      );
      if (entete === "Exif") return position + 10;
    }
    position += 2 + longueur;
  }
  return null;
}

/**
 * Lit l'EXIF d'un JPEG. Retourne `null` si le fichier n'est pas un JPEG ou ne
 * porte aucun segment EXIF — cas explicitement traité par le contrôle qualité
 * (`exif_absent`), pas une erreur.
 */
export function lireExifJpeg(octets: Uint8Array): ExifMedia | null {
  const debutTiff = trouverSegmentExif(octets);
  const dimensionsSof = lireDimensionsJpeg(octets);
  if (debutTiff === null) {
    if (dimensionsSof === null) return null;
    return { ...EXIF_VIDE, largeurPx: dimensionsSof.largeur, hauteurPx: dimensionsSof.hauteur };
  }

  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const ordre = vue.getUint16(debutTiff, false);
  if (ordre !== 0x4949 && ordre !== 0x4d4d) return null;
  const ctx: ContexteTiff = { vue, debutTiff, petitBoutiste: ordre === 0x4949 };
  if (lireEntier16(ctx, debutTiff + 2) !== 42) return null;

  const ifd0 = lireIfd(ctx, lireEntier32(ctx, debutTiff + 4));
  const pointeurExif = nombreOuNull(ifd0.get(0x8769) ?? null);
  const pointeurGps = nombreOuNull(ifd0.get(0x8825) ?? null);
  const ifdExif = pointeurExif === null ? new Map<number, ValeurExif>() : lireIfd(ctx, pointeurExif);
  const ifdGps = pointeurGps === null ? new Map<number, ValeurExif>() : lireIfd(ctx, pointeurGps);

  const brut: Record<string, string | number> = {};
  const noter = (nom: string, valeur: ValeurExif) => {
    if (typeof valeur === "string" || typeof valeur === "number") brut[nom] = valeur;
  };
  noter("Make", ifd0.get(0x010f) ?? null);
  noter("Model", ifd0.get(0x0110) ?? null);
  noter("Orientation", ifd0.get(0x0112) ?? null);
  noter("DateTime", ifd0.get(0x0132) ?? null);
  noter("ExposureTime", ifdExif.get(0x829a) ?? null);
  noter("FNumber", ifdExif.get(0x829d) ?? null);
  noter("ISOSpeedRatings", ifdExif.get(0x8827) ?? null);
  noter("DateTimeOriginal", ifdExif.get(0x9003) ?? null);
  noter("FocalLength", ifdExif.get(0x920a) ?? null);
  noter("FocalLengthIn35mmFilm", ifdExif.get(0xa405) ?? null);
  noter("PixelXDimension", ifdExif.get(0xa002) ?? null);
  noter("PixelYDimension", ifdExif.get(0xa003) ?? null);
  noter("LensModel", ifdExif.get(0xa434) ?? null);
  noter("GPSAltitudeRef", ifdGps.get(0x0005) ?? null);

  const altitudeBrute = nombreOuNull(ifdGps.get(0x0006) ?? null);
  const referenceAltitude = nombreOuNull(ifdGps.get(0x0005) ?? null);
  const altitudeM =
    altitudeBrute === null ? null : referenceAltitude === 1 ? -altitudeBrute : altitudeBrute;

  return {
    segmentPresent: true,
    marque: texteOuNull(ifd0.get(0x010f) ?? null),
    modele: texteOuNull(ifd0.get(0x0110) ?? null),
    objectif: texteOuNull(ifdExif.get(0xa434) ?? null),
    focaleMm: nombreOuNull(ifdExif.get(0x920a) ?? null),
    focale35Mm: nombreOuNull(ifdExif.get(0xa405) ?? null),
    orientation: nombreOuNull(ifd0.get(0x0112) ?? null),
    largeurPx: nombreOuNull(ifdExif.get(0xa002) ?? null) ?? dimensionsSof?.largeur ?? null,
    hauteurPx: nombreOuNull(ifdExif.get(0xa003) ?? null) ?? dimensionsSof?.hauteur ?? null,
    priseLe:
      convertirHorodatageExif(ifdExif.get(0x9003) ?? null) ??
      convertirHorodatageExif(ifd0.get(0x0132) ?? null),
    latitude: convertirDegresMinutesSecondes(
      ifdGps.get(0x0002) ?? null,
      ifdGps.get(0x0001) ?? null,
    ),
    longitude: convertirDegresMinutesSecondes(
      ifdGps.get(0x0004) ?? null,
      ifdGps.get(0x0003) ?? null,
    ),
    altitudeM,
    brut,
  };
}
