/**
 * Fixtures de démonstration (§23 du brief prototype).
 *
 * Construit de vraies structures JPEG + EXIF, octet par octet : segments SOI /
 * APP1 / SOF0 / COM / EOI, TIFF petit-boutiste, IFD0 + ExifIFD + GPSIFD. Les
 * images ne contiennent aucune donnée d'image compressée — elles servent à
 * exercer l'ingestion, la sécurité, la déduplication et le contrôle qualité
 * sans embarquer un seul octet de photo cliente dans le dépôt.
 */

export type OptionsJpegDemo = {
  largeur?: number;
  hauteur?: number;
  marque?: string;
  modele?: string;
  focaleMm?: number | null;
  /** Format EXIF natif : `AAAA:MM:JJ HH:MM:SS`. */
  priseLe?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitudeM?: number | null;
  orientation?: number;
  avecExif?: boolean;
  /** Octets de remplissage : font varier le sha256 entre deux fixtures. */
  remplissage?: number[];
};

type EntreeIfd = {
  tag: number;
  type: number;
  compte: number;
  valeur: number[];
  /** Renseigné après coup pour les tags pointeurs. */
  pointeurVers?: "exif" | "gps";
};

function octetsAscii(texte: string): number[] {
  const octets = [...texte].map((caractere) => caractere.charCodeAt(0) & 0xff);
  octets.push(0);
  return octets;
}

function octetsCourt(valeur: number): number[] {
  return [valeur & 0xff, (valeur >> 8) & 0xff, 0, 0];
}

function octetsLong(valeur: number): number[] {
  return [valeur & 0xff, (valeur >> 8) & 0xff, (valeur >> 16) & 0xff, (valeur >>> 24) & 0xff];
}

function octetsRationnel(numerateur: number, denominateur: number): number[] {
  return [...octetsLong(numerateur), ...octetsLong(denominateur)];
}

function degresEnRationnels(valeur: number): number[] {
  const absolu = Math.abs(valeur);
  const degres = Math.floor(absolu);
  const minutesDecimales = (absolu - degres) * 60;
  const minutes = Math.floor(minutesDecimales);
  const secondes = Math.round((minutesDecimales - minutes) * 60 * 100);
  return [
    ...octetsRationnel(degres, 1),
    ...octetsRationnel(minutes, 1),
    ...octetsRationnel(secondes, 100),
  ];
}

function tailleIfd(nombreEntrees: number): number {
  return 2 + nombreEntrees * 12 + 4;
}

function ecrireIfd(
  sortie: number[],
  entrees: EntreeIfd[],
  zoneDonnees: number[],
  decalageZone: number,
  pointeurs: { exif: number; gps: number },
): void {
  sortie.push(entrees.length & 0xff, (entrees.length >> 8) & 0xff);
  let curseurZone = decalageZone + zoneDonnees.length;

  for (const entree of entrees) {
    sortie.push(entree.tag & 0xff, (entree.tag >> 8) & 0xff);
    sortie.push(entree.type & 0xff, (entree.type >> 8) & 0xff);
    sortie.push(...octetsLong(entree.compte));

    if (entree.pointeurVers !== undefined) {
      sortie.push(...octetsLong(pointeurs[entree.pointeurVers]));
      continue;
    }
    if (entree.valeur.length <= 4) {
      const valeurCompletee = [...entree.valeur];
      while (valeurCompletee.length < 4) valeurCompletee.push(0);
      sortie.push(...valeurCompletee);
      continue;
    }
    sortie.push(...octetsLong(curseurZone));
    zoneDonnees.push(...entree.valeur);
    if (zoneDonnees.length % 2 === 1) zoneDonnees.push(0);
    curseurZone = decalageZone + zoneDonnees.length;
  }
  // Offset de l'IFD suivant : aucun.
  sortie.push(0, 0, 0, 0);
}

function construireBlocExif(options: Required<OptionsJpegDemo>): number[] {
  const avecGps = options.latitude !== null && options.longitude !== null;

  const entreesIfd0: EntreeIfd[] = [
    { tag: 0x010f, type: 2, compte: options.marque.length + 1, valeur: octetsAscii(options.marque) },
    { tag: 0x0110, type: 2, compte: options.modele.length + 1, valeur: octetsAscii(options.modele) },
    { tag: 0x0112, type: 3, compte: 1, valeur: octetsCourt(options.orientation) },
    { tag: 0x8769, type: 4, compte: 1, valeur: octetsLong(0), pointeurVers: "exif" },
  ];
  if (avecGps) {
    entreesIfd0.push({ tag: 0x8825, type: 4, compte: 1, valeur: octetsLong(0), pointeurVers: "gps" });
  }

  const entreesExif: EntreeIfd[] = [
    { tag: 0xa002, type: 4, compte: 1, valeur: octetsLong(options.largeur) },
    { tag: 0xa003, type: 4, compte: 1, valeur: octetsLong(options.hauteur) },
  ];
  if (options.priseLe !== null) {
    entreesExif.push({
      tag: 0x9003,
      type: 2,
      compte: options.priseLe.length + 1,
      valeur: octetsAscii(options.priseLe),
    });
  }
  if (options.focaleMm !== null) {
    entreesExif.push({
      tag: 0x920a,
      type: 5,
      compte: 1,
      valeur: octetsRationnel(Math.round(options.focaleMm * 100), 100),
    });
  }
  entreesExif.sort((a, b) => a.tag - b.tag);

  const entreesGps: EntreeIfd[] = [];
  if (avecGps) {
    const latitude = options.latitude as number;
    const longitude = options.longitude as number;
    entreesGps.push(
      { tag: 0x0001, type: 2, compte: 2, valeur: octetsAscii(latitude >= 0 ? "N" : "S") },
      { tag: 0x0002, type: 5, compte: 3, valeur: degresEnRationnels(latitude) },
      { tag: 0x0003, type: 2, compte: 2, valeur: octetsAscii(longitude >= 0 ? "E" : "W") },
      { tag: 0x0004, type: 5, compte: 3, valeur: degresEnRationnels(longitude) },
    );
    if (options.altitudeM !== null) {
      const altitude = options.altitudeM as number;
      entreesGps.push(
        { tag: 0x0005, type: 1, compte: 1, valeur: [altitude >= 0 ? 0 : 1] },
        { tag: 0x0006, type: 5, compte: 1, valeur: octetsRationnel(Math.round(Math.abs(altitude) * 100), 100) },
      );
    }
  }

  const decalageIfd0 = 8;
  const decalageExif = decalageIfd0 + tailleIfd(entreesIfd0.length);
  const decalageGps = decalageExif + tailleIfd(entreesExif.length);
  const decalageZone = decalageGps + (avecGps ? tailleIfd(entreesGps.length) : 0);

  const entete = [0x49, 0x49, 0x2a, 0x00, ...octetsLong(decalageIfd0)];
  const corps: number[] = [];
  const zoneDonnees: number[] = [];
  const pointeurs = { exif: decalageExif, gps: decalageGps };

  ecrireIfd(corps, entreesIfd0, zoneDonnees, decalageZone, pointeurs);
  ecrireIfd(corps, entreesExif, zoneDonnees, decalageZone, pointeurs);
  if (avecGps) ecrireIfd(corps, entreesGps, zoneDonnees, decalageZone, pointeurs);

  return [...entete, ...corps, ...zoneDonnees];
}

function segment(marqueur: number, charge: number[]): number[] {
  const longueur = charge.length + 2;
  return [0xff, marqueur, (longueur >> 8) & 0xff, longueur & 0xff, ...charge];
}

const OPTIONS_DEFAUT: Required<OptionsJpegDemo> = {
  largeur: 4000,
  hauteur: 3000,
  marque: "DJI",
  modele: "FC3582",
  focaleMm: 6.7,
  priseLe: "2026:09:07 10:12:33",
  latitude: 48.5734,
  longitude: 7.7521,
  altitudeM: 142.5,
  orientation: 1,
  avecExif: true,
  remplissage: [0x00],
};

/** Construit un JPEG de démonstration syntaxiquement valide, EXIF compris. */
export function construireJpegDemo(options: OptionsJpegDemo = {}): Uint8Array {
  const complet: Required<OptionsJpegDemo> = { ...OPTIONS_DEFAUT, ...options };
  const octets: number[] = [0xff, 0xd8];

  if (complet.avecExif) {
    const bloc = construireBlocExif(complet);
    octets.push(...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...bloc]));
  }

  // SOF0 : profondeur 8 bits, 3 composantes — dimensions lisibles sans EXIF.
  octets.push(
    ...segment(0xc0, [
      0x08,
      (complet.hauteur >> 8) & 0xff,
      complet.hauteur & 0xff,
      (complet.largeur >> 8) & 0xff,
      complet.largeur & 0xff,
      0x03,
      0x01, 0x22, 0x00,
      0x02, 0x11, 0x01,
      0x03, 0x11, 0x01,
    ]),
  );

  if (complet.remplissage.length > 0) {
    octets.push(...segment(0xfe, complet.remplissage));
  }
  octets.push(0xff, 0xd9);
  return Uint8Array.from(octets);
}

export type MediaDemo = {
  mediaId: string;
  nomFichier: string;
  contenu: Uint8Array;
};

export type OptionsJeuDemo = {
  /** Nombre d'images du jeu. */
  nombre?: number;
  /** Insère une image sans EXIF (donc sans GPS) à cet index. */
  indexSansExif?: number | null;
  /** Duplique l'image d'index 0 à cet index (même octets, donc même sha256). */
  indexDoublon?: number | null;
  /** Insère une image sous-résolue à cet index. */
  indexBasseResolution?: number | null;
};

/**
 * Jeu de démonstration : images géolocalisées le long d'une orbite, plus les
 * anomalies que le contrôle qualité doit savoir nommer.
 */
export function construireJeuDemo(options: OptionsJeuDemo = {}): MediaDemo[] {
  const nombre = options.nombre ?? 12;
  const medias: MediaDemo[] = [];

  for (let index = 0; index < nombre; index += 1) {
    const identifiant = `media-${(index + 1).toString().padStart(3, "0")}`;
    const nomFichier = `DJI_${(index + 1).toString().padStart(4, "0")}.JPG`;

    if (options.indexDoublon === index && medias.length > 0) {
      medias.push({ mediaId: identifiant, nomFichier, contenu: medias[0].contenu });
      continue;
    }
    if (options.indexSansExif === index) {
      medias.push({
        mediaId: identifiant,
        nomFichier,
        contenu: construireJpegDemo({ avecExif: false, remplissage: [index, 0x11] }),
      });
      continue;
    }
    if (options.indexBasseResolution === index) {
      medias.push({
        mediaId: identifiant,
        nomFichier,
        contenu: construireJpegDemo({
          largeur: 1024,
          hauteur: 768,
          latitude: 48.5734 + index * 0.0001,
          longitude: 7.7521 + index * 0.0001,
          remplissage: [index, 0x22],
        }),
      });
      continue;
    }

    medias.push({
      mediaId: identifiant,
      nomFichier,
      contenu: construireJpegDemo({
        latitude: 48.5734 + index * 0.0001,
        longitude: 7.7521 + index * 0.0001,
        altitudeM: 140 + index,
        priseLe: `2026:09:07 10:${(12 + index).toString().padStart(2, "0")}:33`,
        remplissage: [index, 0x33],
      }),
    });
  }

  return medias;
}
