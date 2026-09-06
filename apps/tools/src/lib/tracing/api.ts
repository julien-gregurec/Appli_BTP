/**
 * §46 — API stable entre le workflow « photo → géométrie » et l'interface Atelier.
 *
 * L'interface n'appelle que ces fonctions ; elle n'a pas à connaître l'ordre interne des
 * étapes ni les garde-fous. Toutes sont pures : elles renvoient un nouvel état, ce qui rend
 * l'historique annuler/rétablir (§38) trivial à brancher.
 *
 * Enchaînement :
 *   importReferenceImage → setReferenceTransform → calibrateReference → controlCalibration
 *   → traceContour / detectContourProposal → simplifyContour → fitContourGeometry
 *   → confirmContourGeometry → createTracingGeometry
 */

import { detectContour, type DetectContourOptions, type GrayscaleImage } from "./edge-detection";
import { fitGeometry, type FitOptions, type GeometryProposal } from "./fitting";
import { decideReferenceFile, computeWorkingSize, rescaleCalibration } from "./image-import";
import type { MeasurementOrigin } from "./measurement-origin";
import { rectifyQuadToRectangle, type RectifyInput, type RectifyResult } from "./perspective";
import { touchTracingProject } from "./atelier";
import { addShapeToFreeGeometry } from "./free-conversion";
import { EMPTY_FREE_GEOMETRY, type FreeEntity } from "./free-geometry";
import { derivedScaleStatus, newReferenceImage, type TracingProject, type TracingReferenceImage } from "./project";
import {
  clampLayer,
  computeCalibration,
  verifyCalibration,
  withCalibrationCheck,
  isCalibrated,
  type CalibrationCheck,
  type CalibrationCheckInput,
  type CalibrationInput,
  type ReferenceImageAdjust,
  type ReferenceImageLayer,
  type ReferenceImageSource,
} from "./reference-image";
import {
  confirmContour,
  contourToGeometricShape,
  createRawContour,
  simplifyContourWithReport,
  type ContourToShapeOptions,
  type GeometricShape,
  type RawContour,
  type SimplificationLevel,
  type SimplifyReport,
} from "./vectorization";
import type { Point2D } from "./geometry-port";

/* -------------------------------------------------------------------------- */
/*  Import                                                                    */
/* -------------------------------------------------------------------------- */

export type ImportReferenceImageInput = {
  id: string;
  name: string;
  /** Type MIME ou nom de fichier — sert aussi au contrôle de format (§3). */
  mimeOrName: string;
  source: ReferenceImageSource;
  sourceWidthPx: number;
  sourceHeightPx: number;
  sizeBytes?: number;
  /** Poignée opaque vers le blob stocké par `asset-store` (§40). */
  assetRef?: string;
  /** Côté maximal de travail. Défaut : `MAX_WORKING_DIMENSION_PX` (§42). */
  maxWorkingDimensionPx?: number;
};

export type ImportReferenceImageResult = {
  image: TracingReferenceImage;
  /** Facteur appliqué à la source pour obtenir la taille de travail. */
  workingScale: number;
  downscaled: boolean;
};

/**
 * §5, §6, §42 — Crée le calque de référence à partir d'un fichier accepté. L'image est ramenée
 * à une taille de travail : c'est la seule taille dans laquelle les points seront cliqués et
 * la calibration exprimée.
 */
export function importReferenceImage(input: ImportReferenceImageInput): ImportReferenceImageResult {
  const decision = decideReferenceFile(input.mimeOrName, input.sizeBytes);
  if (!decision.accepted) throw new Error(decision.reason);
  const working = computeWorkingSize(input.sourceWidthPx, input.sourceHeightPx, input.maxWorkingDimensionPx);
  const image = newReferenceImage(input.id, input.name, input.source, decision.format, working.widthPx, working.heightPx);
  return { image: { ...image, assetRef: input.assetRef }, workingScale: working.scale, downscaled: working.downscaled };
}

/** §5, §13 — Applique un redressement (rotation, miroir, recadrage) au calque de référence. */
export function setReferenceTransform(image: TracingReferenceImage, adjust: ReferenceImageAdjust): TracingReferenceImage {
  if (!Number.isFinite(adjust.rotationDeg)) throw new Error("L'angle de rotation doit être fini.");
  if (adjust.crop) {
    const { x, y, width, height } = adjust.crop;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("Le recadrage est invalide.");
    if (x < 0 || y < 0 || x + width > image.widthPx || y + height > image.heightPx) throw new Error("Le recadrage sort de l'image.");
  }
  return { ...image, adjust: { ...adjust } };
}

/** §6 — Réglages du calque de fond (opacité, visibilité, verrouillage). */
export function setReferenceLayer(image: TracingReferenceImage, layer: ReferenceImageLayer): TracingReferenceImage {
  return { ...image, layer: clampLayer(layer) };
}

/** §42 — Change la taille de travail en conservant une calibration juste (§4). */
export function resizeReferenceImage(image: TracingReferenceImage, widthPx: number, heightPx: number): TracingReferenceImage {
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx < 1 || heightPx < 1) {
    throw new Error("Dimensions de travail invalides.");
  }
  const scale = widthPx / image.widthPx;
  return {
    ...image,
    widthPx,
    heightPx,
    calibration: rescaleCalibration(image.calibration, scale),
  };
}

/* -------------------------------------------------------------------------- */
/*  Calibration                                                               */
/* -------------------------------------------------------------------------- */

/** §8, §9 — Calibre l'image à partir de deux points et d'une distance réelle connue. */
export function calibrateReference(image: TracingReferenceImage, input: CalibrationInput): TracingReferenceImage {
  return { ...image, calibration: computeCalibration(input) };
}

/** §10 — Deuxième cote de contrôle : l'écart mesuré est attaché à la calibration, jamais masqué. */
export function controlCalibration(
  image: TracingReferenceImage,
  input: CalibrationCheckInput,
): { image: TracingReferenceImage; check: CalibrationCheck } {
  const check = verifyCalibration(image.calibration, input);
  if (!isCalibrated(image.calibration)) throw new Error("Échelle non définie : impossible de contrôler une cote avant calibration.");
  return { image: { ...image, calibration: withCalibrationCheck(image.calibration, check) }, check };
}

/** §11 — Redresse un plan rectangulaire ; l'échelle de l'image redressée est enfin uniforme. */
export function rectifyReference(input: RectifyInput): RectifyResult {
  return rectifyQuadToRectangle(input);
}

/* -------------------------------------------------------------------------- */
/*  Contours                                                                  */
/* -------------------------------------------------------------------------- */

export type TraceContourInput = {
  id: string;
  points: readonly Point2D[];
  closed?: boolean;
  /** Espace des points : pixels de l'image de travail ou millimètres chantier. */
  space?: RawContour["space"];
};

/** §15, §16 — Contour tracé à la main par-dessus la référence. */
export function traceContour(input: TraceContourInput): RawContour {
  return createRawContour({
    id: input.id,
    points: input.points,
    space: input.space ?? "image-pixels",
    closed: input.closed,
    source: "manual",
  });
}

/**
 * §14, §17, §18 — Détection automatique. Le contour renvoyé est **toujours** une proposition :
 * `createRawContour` force `status: "proposition"` pour `source: "detected"`.
 */
export function detectContourProposal(
  id: string,
  image: GrayscaleImage,
  options: DetectContourOptions = {},
): { contour: RawContour; notice: string; coverage: number; thresholdUsed: number } {
  const detection = detectContour(image, options);
  return {
    contour: createRawContour({ id, points: detection.points, space: "image-pixels", closed: true, source: "detected" }),
    notice: detection.notice,
    coverage: detection.coverage,
    thresholdUsed: detection.thresholdUsed,
  };
}

/** §19, §20 — Simplification avec écart mesuré. */
export function simplifyContour(contour: RawContour, level: SimplificationLevel, mmPerPixel?: number): SimplifyReport {
  return simplifyContourWithReport(contour, level, mmPerPixel);
}

/** §21 à §25 — Proposition de primitive (droite, cercle, arc, ellipse) avec erreur mesurée. */
export function fitContourGeometry(contour: RawContour, tolerance: number, options: FitOptions = {}): GeometryProposal {
  return fitGeometry(contour.points, tolerance, { closed: contour.closed, ...options });
}

/** §18 — Validation utilisateur : c'est le seul passage de « proposition » à « confirmé ». */
export function confirmContourGeometry(contour: RawContour): RawContour {
  return confirmContour(contour);
}

/**
 * §9, §18 — Géométrie constructible finale, en millimètres. Lève tant que le contour n'est pas
 * confirmé, ou tant que l'image n'est pas calibrée pour un contour en pixels.
 */
export function createTracingGeometry(contour: RawContour, options: ContourToShapeOptions = {}): GeometricShape {
  return contourToGeometricShape(contour, options);
}

/** Géométrie issue d'un contour tracé dans l'image de référence — raccourci le plus courant. */
export function createTracingGeometryFromImage(
  contour: RawContour,
  image: TracingReferenceImage,
  options: { id?: string; manualOrigin?: MeasurementOrigin } = {},
): GeometricShape {
  return contourToGeometricShape(contour, {
    calibration: image.calibration,
    imageHeightPx: image.heightPx,
    id: options.id,
    manualOrigin: options.manualOrigin,
  });
}

/* -------------------------------------------------------------------------- */
/*  §11 — La géométrie confirmée rejoint le tracé libre canonique             */
/* -------------------------------------------------------------------------- */

/**
 * Point de sortie unique du workflow photo vers le projet.
 *
 * Tout ce qui précède — calque, calibration, redressement, détection, ajustement,
 * simplification — reste au stade de la PROPOSITION et ne touche pas le document. C'est ici, et
 * seulement ici, qu'un relevé devient une donnée du projet ; et il y devient un tracé libre
 * ordinaire, indiscernable pour l'aval de ce que l'utilisateur aurait dessiné à la main.
 *
 * Le refus du mode paramétrique n'est pas une précaution d'interface : `validateTracingProject`
 * rejette la coexistence `modelId` + `freeGeometry`, et l'annoncer ici évite de laisser
 * l'utilisateur faire tout le relevé avant de découvrir que son projet ne peut pas l'accueillir.
 */
export type ConfirmToProjectInput = {
  project: TracingProject;
  contour: RawContour;
  image?: TracingReferenceImage;
  /** Réduit automatiquement un relevé trop dense pour le tracé libre (§11). */
  simplifyIfNeeded?: boolean;
  manualOrigin?: MeasurementOrigin;
  now?: Date;
};

export type ConfirmToProjectResult = {
  project: TracingProject;
  shape: GeometricShape;
  entity: FreeEntity;
  /** Écart mesuré introduit par la réduction éventuelle, en millimètres. */
  maxDeviationMm: number;
  notice: string;
};

export function confirmVectorizationIntoProject(input: ConfirmToProjectInput): ConfirmToProjectResult {
  if (input.project.modelId) {
    throw new Error(
      "Ce tracé suit un modèle paramétrique : il ne peut pas recevoir de tracé libre. Créez un tracé « dessin libre » pour y verser le relevé photo.",
    );
  }
  const confirmed = confirmContourGeometry(input.contour);
  const shape = input.image
    ? createTracingGeometryFromImage(confirmed, input.image, { manualOrigin: input.manualOrigin })
    : createTracingGeometry(confirmed, { manualOrigin: input.manualOrigin });

  const converted = addShapeToFreeGeometry(input.project.freeGeometry ?? EMPTY_FREE_GEOMETRY, shape, {
    simplifyIfNeeded: input.simplifyIfNeeded,
  });

  const referenceImages = input.image
    ? [...input.project.referenceImages.filter((existing) => existing.id !== input.image!.id), input.image]
    : input.project.referenceImages;
  const patched = { ...input.project, referenceImages };

  return {
    project: touchTracingProject(
      patched,
      {
        referenceImages,
        freeGeometry: converted.geometry,
        contours: [...input.project.contours.filter((existing) => existing.id !== confirmed.id), confirmed],
        shapes: [...input.project.shapes.filter((existing) => existing.id !== shape.id), shape],
        scaleStatus: derivedScaleStatus(patched),
      },
      input.now,
    ),
    shape,
    entity: converted.entity,
    maxDeviationMm: converted.maxDeviationMm,
    notice: converted.notice,
  };
}

/** Attache ou met à jour une image de référence sans rien confirmer (§3, §17). */
export function attachReferenceImage(
  project: TracingProject,
  image: TracingReferenceImage,
  now?: Date,
): TracingProject {
  const referenceImages = [...project.referenceImages.filter((existing) => existing.id !== image.id), image];
  const patched = { ...project, referenceImages };
  return touchTracingProject(patched, { referenceImages, scaleStatus: derivedScaleStatus(patched) }, now);
}
