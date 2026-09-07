/**
 * Contrôle qualité du jeu de photos (§9 du brief prototype).
 *
 * Le contrôle décide de l'exploitabilité *avant* de payer une seconde de GPU.
 * Il est volontairement conservateur : il ne supprime rien, il qualifie. La
 * décision reste corrigeable par l'utilisateur (`exploitable` du modèle de
 * données), parce qu'un rejet automatique d'une photo utile coûte plus cher
 * qu'une reconstruction un peu bruitée.
 *
 * Sur le flou : la seule mesure honnête est faite sur les pixels décodés. Le
 * prototype fournit `mesurerNettete()` mais **ne décode aucune image lui-même**
 * — tant qu'aucun décodeur n'alimente `nettete`, l'anomalie renvoyée est
 * `nettete_indeterminee`, jamais `flou_probable`. Un « détecteur de flou » qui
 * devine sans pixels serait un faux signal.
 */

import type { MediaAssetId, MediaQualityFlags } from "@elsatia/drone-core";

import type { TypeMediaAccepte } from "../securite/entrees";
import type { ExifMedia } from "./exif";

export const ANOMALIES_QUALITE = [
  "exif_absent",
  "gps_absent",
  "focale_absente",
  "horodatage_absent",
  "resolution_insuffisante",
  "doublon_exact",
  "flou_probable",
  "nettete_indeterminee",
] as const;
export type AnomalieQualite = (typeof ANOMALIES_QUALITE)[number];

export type VerdictMedia = "exploitable" | "douteux" | "rejete";

const GRAVITE: Record<AnomalieQualite, VerdictMedia> = {
  exif_absent: "douteux",
  gps_absent: "douteux",
  focale_absente: "douteux",
  horodatage_absent: "douteux",
  resolution_insuffisante: "rejete",
  doublon_exact: "rejete",
  flou_probable: "douteux",
  nettete_indeterminee: "exploitable",
};

const ORDRE_VERDICT: Record<VerdictMedia, number> = { exploitable: 0, douteux: 1, rejete: 2 };

export type MediaAnalyse = {
  mediaId: string;
  sha256: string;
  octets: number;
  type: TypeMediaAccepte;
  exif: ExifMedia | null;
  /**
   * Netteté relative (variance du laplacien normalisée) fournie par un décodeur
   * externe. `null` = non mesurée : aucune conclusion de flou n'est tirée.
   */
  nettete: number | null;
};

export type SeuilsQualite = {
  megapixelsMin: number;
  /** Seuil de netteté sous lequel une image est signalée floue. `null` = contrôle désactivé. */
  netteteMin: number | null;
  /** Part minimale d'images géolocalisées pour espérer une mise à l'échelle métrique. */
  partGeolocaliseeMin: number;
  /** Nombre minimal d'images exploitables pour lancer une reconstruction. */
  imagesMin: number;
};

export const SEUILS_QUALITE_DEFAUT: SeuilsQualite = {
  megapixelsMin: 3,
  netteteMin: null,
  partGeolocaliseeMin: 0.8,
  imagesMin: 8,
};

export type QualiteMedia = {
  mediaId: string;
  verdict: VerdictMedia;
  anomalies: AnomalieQualite[];
  doublonDe: string | null;
  megapixels: number | null;
};

export type RapportQualite = {
  medias: QualiteMedia[];
  resume: {
    total: number;
    exploitables: number;
    douteux: number;
    rejetes: number;
    geolocalisees: number;
    partGeolocalisee: number;
  };
  /** Motifs empêchant de lancer la reconstruction. Vide = feu vert. */
  blocages: string[];
};

function megapixels(exif: ExifMedia | null): number | null {
  if (exif === null || exif.largeurPx === null || exif.hauteurPx === null) return null;
  return (exif.largeurPx * exif.hauteurPx) / 1_000_000;
}

/**
 * Variance du laplacien sur un plan de luminance 8 bits — mesure classique et
 * *relative* : elle ne se compare qu'entre images d'une même campagne. Fournie
 * pour qu'un décodeur puisse alimenter `MediaAnalyse.nettete`.
 */
export function mesurerNettete(luminance: Uint8Array, largeur: number, hauteur: number): number {
  if (largeur < 3 || hauteur < 3 || luminance.length < largeur * hauteur) return 0;
  const valeurs: number[] = [];
  for (let y = 1; y < hauteur - 1; y += 1) {
    for (let x = 1; x < largeur - 1; x += 1) {
      const centre = luminance[y * largeur + x];
      const laplacien =
        luminance[(y - 1) * largeur + x] +
        luminance[(y + 1) * largeur + x] +
        luminance[y * largeur + x - 1] +
        luminance[y * largeur + x + 1] -
        4 * centre;
      valeurs.push(laplacien);
    }
  }
  if (valeurs.length === 0) return 0;
  const moyenne = valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length;
  const variance =
    valeurs.reduce((somme, valeur) => somme + (valeur - moyenne) ** 2, 0) / valeurs.length;
  return variance;
}

export function controlerQualite(
  medias: MediaAnalyse[],
  seuils: SeuilsQualite = SEUILS_QUALITE_DEFAUT,
): RapportQualite {
  const premierParEmpreinte = new Map<string, string>();
  const resultats: QualiteMedia[] = [];

  for (const media of medias) {
    const anomalies: AnomalieQualite[] = [];
    let doublonDe: string | null = null;

    const origine = premierParEmpreinte.get(media.sha256);
    if (origine === undefined) {
      premierParEmpreinte.set(media.sha256, media.mediaId);
    } else {
      doublonDe = origine;
      anomalies.push("doublon_exact");
    }

    if (media.exif === null || !media.exif.segmentPresent) {
      anomalies.push("exif_absent");
      anomalies.push("gps_absent");
      anomalies.push("focale_absente");
      anomalies.push("horodatage_absent");
    } else {
      if (media.exif.latitude === null || media.exif.longitude === null) anomalies.push("gps_absent");
      if (media.exif.focaleMm === null && media.exif.focale35Mm === null) {
        anomalies.push("focale_absente");
      }
      if (media.exif.priseLe === null) anomalies.push("horodatage_absent");
    }

    const mpx = megapixels(media.exif);
    if (mpx !== null && mpx < seuils.megapixelsMin) anomalies.push("resolution_insuffisante");

    if (media.nettete === null) {
      anomalies.push("nettete_indeterminee");
    } else if (seuils.netteteMin !== null && media.nettete < seuils.netteteMin) {
      anomalies.push("flou_probable");
    }

    const verdict = anomalies.reduce<VerdictMedia>(
      (pire, anomalie) =>
        ORDRE_VERDICT[GRAVITE[anomalie]] > ORDRE_VERDICT[pire] ? GRAVITE[anomalie] : pire,
      "exploitable",
    );

    resultats.push({ mediaId: media.mediaId, verdict, anomalies, doublonDe, megapixels: mpx });
  }

  const retenus = resultats.filter((resultat) => resultat.verdict !== "rejete");
  const geolocalisees = medias.filter(
    (media, index) =>
      resultats[index].verdict !== "rejete" &&
      media.exif !== null &&
      media.exif.latitude !== null &&
      media.exif.longitude !== null,
  ).length;
  const partGeolocalisee = retenus.length === 0 ? 0 : geolocalisees / retenus.length;

  const blocages: string[] = [];
  if (retenus.length < seuils.imagesMin) {
    blocages.push(
      `${retenus.length} image(s) exploitable(s) pour un minimum de ${seuils.imagesMin}`,
    );
  }
  if (retenus.length > 0 && partGeolocalisee < seuils.partGeolocaliseeMin) {
    blocages.push(
      `${Math.round(partGeolocalisee * 100)} % d'images géolocalisées pour un minimum de ` +
        `${Math.round(seuils.partGeolocaliseeMin * 100)} % — mise à l'échelle métrique non garantie`,
    );
  }

  return {
    medias: resultats,
    resume: {
      total: resultats.length,
      exploitables: resultats.filter((resultat) => resultat.verdict === "exploitable").length,
      douteux: resultats.filter((resultat) => resultat.verdict === "douteux").length,
      rejetes: resultats.filter((resultat) => resultat.verdict === "rejete").length,
      geolocalisees,
      partGeolocalisee,
    },
    blocages,
  };
}

/**
 * Traduit un verdict de contrôle qualité en `MediaQualityFlags` du noyau.
 *
 * `usable` est une **décision**, corrigeable par l'utilisateur : elle est fausse
 * pour un rejet, vraie sinon — un média douteux reste utilisable tant qu'un
 * humain n'en a pas décidé autrement.
 */
export function versQualityFlags(
  qualite: QualiteMedia,
  nettete: number | null,
): MediaQualityFlags {
  return {
    blur_score: nettete,
    // L'exposition n'est pas mesurée par le prototype : elle reste inconnue.
    exposure_score: null,
    duplicate_of: qualite.doublonDe === null ? null : (qualite.doublonDe as MediaAssetId),
    usable: qualite.verdict !== "rejete",
  };
}
