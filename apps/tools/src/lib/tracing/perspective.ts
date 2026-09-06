/**
 * §11, §12 — Redressement de perspective par homographie.
 *
 * Une photo prise de biais ne se mesure pas avec une échelle uniforme : le même millimètre
 * réel occupe plus de pixels au premier plan qu'au fond. Ce module calcule la transformation
 * projective qui remet un plan supposé rectangulaire à plat, à partir de ses quatre coins
 * désignés par l'utilisateur et de ses dimensions réelles.
 *
 * Deux garde-fous tenus :
 *   - §11 : le redressement exige **largeur ET hauteur réelles**. Depuis une seule cote,
 *           le rapport d'aspect du plan est indéterminé sans modèle de caméra : ELSATIA
 *           refuse plutôt que d'inventer un rapport.
 *   - §12 : `assessPerspective` mesure l'inclinaison réellement observée sur le quadrilatère.
 *           Tant que l'utilisateur n'a pas redressé, la mesure reste signalée imprécise.
 *
 * Aucune dépendance ajoutée : la résolution du système 8×8 est une élimination de Gauss
 * avec pivot partiel, écrite ici.
 */

import { convertLength, type LengthUnit } from "../units";
import { solveLinearSystem } from "./numeric";
import { computeCalibration, type CalibrationResult } from "./reference-image";
import { angleAtVertex, cross, distance, DEFAULT_EPSILON, type Point2D } from "./geometry-port";

/** Quadrilatère désigné par l'utilisateur, dans l'ordre du contour (sans croisement). */
export type PerspectiveQuad = {
  /** Coin haut-gauche du plan réel. */
  a: Point2D;
  /** Coin haut-droit. */
  b: Point2D;
  /** Coin bas-droit. */
  c: Point2D;
  /** Coin bas-gauche. */
  d: Point2D;
};

/** Matrice projective 3×3 stockée par lignes. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export function quadCorners(quad: PerspectiveQuad): readonly [Point2D, Point2D, Point2D, Point2D] {
  return [quad.a, quad.b, quad.c, quad.d];
}

/** Vrai si les quatre coins forment un quadrilatère convexe non dégénéré. */
export function isConvexQuad(quad: PerspectiveQuad): boolean {
  const corners = quadCorners(quad);
  for (const corner of corners) if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return false;
  let positive = 0;
  let negative = 0;
  for (let index = 0; index < 4; index++) {
    const previous = corners[(index + 3) % 4];
    const current = corners[index];
    const next = corners[(index + 1) % 4];
    const turn = cross({ x: current.x - previous.x, y: current.y - previous.y }, { x: next.x - current.x, y: next.y - current.y });
    if (turn > DEFAULT_EPSILON) positive++;
    else if (turn < -DEFAULT_EPSILON) negative++;
    else return false;
  }
  return positive === 4 || negative === 4;
}

/* -------------------------------------------------------------------------- */
/*  Homographie                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Homographie envoyant les quatre points `source` sur les quatre points `destination`.
 * Convention `h[8] = 1` : les huit inconnues restantes sont résolues exactement.
 */
export function computeHomography(
  source: readonly [Point2D, Point2D, Point2D, Point2D],
  destination: readonly [Point2D, Point2D, Point2D, Point2D],
): Homography {
  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (let index = 0; index < 4; index++) {
    const s = source[index];
    const t = destination[index];
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
      throw new Error("Les points de redressement doivent avoir des coordonnées finies.");
    }
    matrix.push([s.x, s.y, 1, 0, 0, 0, -t.x * s.x, -t.x * s.y]);
    rhs.push(t.x);
    matrix.push([0, 0, 0, s.x, s.y, 1, -t.y * s.x, -t.y * s.y]);
    rhs.push(t.y);
  }
  const solution = solveLinearSystem(matrix, rhs);
  return [solution[0], solution[1], solution[2], solution[3], solution[4], solution[5], solution[6], solution[7], 1];
}

/** Applique l'homographie à un point. Lève si le point tombe sur la ligne de fuite. */
export function applyHomography(homography: Homography, point: Point2D): Point2D {
  const w = homography[6] * point.x + homography[7] * point.y + homography[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) {
    throw new Error("Point non redressable : il se situe sur l'horizon de la photo.");
  }
  return {
    x: (homography[0] * point.x + homography[1] * point.y + homography[2]) / w,
    y: (homography[3] * point.x + homography[4] * point.y + homography[5]) / w,
  };
}

export function applyHomographyToPoints(homography: Homography, points: readonly Point2D[]): Point2D[] {
  return points.map((point) => applyHomography(homography, point));
}

/** Homographie inverse (comatrice transposée d'une 3×3). */
export function invertHomography(homography: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = homography;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error("Homographie non inversible.");
  }
  const inverse: number[] = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ].map((value) => value / determinant);
  const normalizer = Math.abs(inverse[8]) > 1e-12 ? inverse[8] : 1;
  return inverse.map((value) => value / normalizer) as unknown as Homography;
}

/* -------------------------------------------------------------------------- */
/*  §11 — Redressement d'un plan rectangulaire connu                          */
/* -------------------------------------------------------------------------- */

export type RectifyInput = {
  quad: PerspectiveQuad;
  /** Largeur réelle du plan (côté a→b). */
  realWidth: number;
  /** Hauteur réelle du plan (côté a→d). */
  realHeight: number;
  realUnit: LengthUnit;
  /** Côté maximal de l'image redressée. Défaut : plus grand côté observé du quadrilatère. */
  maxDimensionPx?: number;
  at?: Date;
};

export type RectifyResult = {
  /** Photo d'origine → image redressée (pixels). */
  homography: Homography;
  /** Image redressée → photo d'origine, pour reprojeter un tracé sur la photo. */
  inverse: Homography;
  widthPx: number;
  heightPx: number;
  /** Calibration valable dans l'image redressée : l'échelle y est enfin uniforme (§4). */
  calibration: CalibrationResult;
  /** Inclinaison mesurée sur la photo d'origine, conservée pour l'historique (§35). */
  assessment: PerspectiveAssessment;
};

/**
 * Construit le redressement d'un plan rectangulaire dont l'utilisateur a désigné les quatre
 * coins et donné les dimensions réelles. L'image redressée reçoit exactement le rapport
 * d'aspect réel : c'est ce qui rend l'échelle uniforme, donc mesurable.
 */
export function rectifyQuadToRectangle(input: RectifyInput): RectifyResult {
  if (!isConvexQuad(input.quad)) {
    throw new Error("Les quatre coins doivent former un quadrilatère convexe, saisi dans l'ordre du contour.");
  }
  if (!Number.isFinite(input.realWidth) || input.realWidth <= 0 || !Number.isFinite(input.realHeight) || input.realHeight <= 0) {
    throw new Error("Le redressement de perspective exige une largeur ET une hauteur réelles supérieures à 0.");
  }
  const widthMm = convertLength(input.realWidth, input.realUnit, "mm");
  const heightMm = convertLength(input.realHeight, input.realUnit, "mm");
  const observedWidth = Math.max(distance(input.quad.a, input.quad.b), distance(input.quad.d, input.quad.c));
  const observedHeight = Math.max(distance(input.quad.a, input.quad.d), distance(input.quad.b, input.quad.c));
  const maxDimensionPx = input.maxDimensionPx ?? Math.max(observedWidth, observedHeight);
  if (!Number.isFinite(maxDimensionPx) || maxDimensionPx < 2) throw new Error("Taille de redressement invalide.");

  const aspect = widthMm / heightMm;
  const widthPx = aspect >= 1 ? maxDimensionPx : maxDimensionPx * aspect;
  const heightPx = aspect >= 1 ? maxDimensionPx / aspect : maxDimensionPx;
  const rounded = { width: Math.max(2, Math.round(widthPx)), height: Math.max(2, Math.round(heightPx)) };

  const destination: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: rounded.width, y: 0 },
    { x: rounded.width, y: rounded.height },
    { x: 0, y: rounded.height },
  ];
  const homography = computeHomography(quadCorners(input.quad), destination);
  const calibration = computeCalibration({
    pointA: destination[0],
    pointB: destination[1],
    realDistance: widthMm,
    realUnit: "mm",
    at: input.at,
  });
  return {
    homography,
    inverse: invertHomography(homography),
    widthPx: rounded.width,
    heightPx: rounded.height,
    calibration,
    assessment: assessPerspective(input.quad),
  };
}

/* -------------------------------------------------------------------------- */
/*  §12, §37 — Détection d'inclinaison                                        */
/* -------------------------------------------------------------------------- */

export type PerspectiveSeverity = "aucune" | "legere" | "forte";

export type PerspectiveAssessment = {
  severity: PerspectiveSeverity;
  /** Écart maximal (%) entre deux côtés opposés — nul sur un parallélogramme. */
  oppositeSideRatioPercent: number;
  /** Écart angulaire maximal (degrés) entre un angle du quadrilatère et 90°. */
  maxCornerDeviationDeg: number;
  /** Message à afficher tel quel ; chaîne vide si aucune inclinaison notable. */
  warning: string;
};

/** Seuils au-delà desquels une inclinaison est signalée. */
export const PERSPECTIVE_THRESHOLDS = { slightPercent: 2, strongPercent: 8, slightAngleDeg: 3, strongAngleDeg: 10 };

/**
 * Mesure l'inclinaison d'un quadrilatère censé être rectangulaire dans la réalité. Ne devine
 * rien : compare les côtés opposés et les angles aux valeurs attendues d'un rectangle vu de face.
 */
export function assessPerspective(quad: PerspectiveQuad): PerspectiveAssessment {
  const corners = quadCorners(quad);
  const top = distance(quad.a, quad.b);
  const bottom = distance(quad.d, quad.c);
  const left = distance(quad.a, quad.d);
  const right = distance(quad.b, quad.c);
  const ratio = (first: number, second: number) => {
    const largest = Math.max(first, second);
    return largest < DEFAULT_EPSILON ? 0 : (Math.abs(first - second) / largest) * 100;
  };
  const oppositeSideRatioPercent = Math.max(ratio(top, bottom), ratio(left, right));
  let maxCornerDeviationDeg = 0;
  for (let index = 0; index < 4; index++) {
    const angle = angleAtVertex(corners[(index + 3) % 4], corners[index], corners[(index + 1) % 4]);
    maxCornerDeviationDeg = Math.max(maxCornerDeviationDeg, Math.abs(angle.degrees - 90));
  }
  const severity: PerspectiveSeverity =
    oppositeSideRatioPercent >= PERSPECTIVE_THRESHOLDS.strongPercent || maxCornerDeviationDeg >= PERSPECTIVE_THRESHOLDS.strongAngleDeg
      ? "forte"
      : oppositeSideRatioPercent >= PERSPECTIVE_THRESHOLDS.slightPercent || maxCornerDeviationDeg >= PERSPECTIVE_THRESHOLDS.slightAngleDeg
        ? "legere"
        : "aucune";
  return {
    severity,
    oppositeSideRatioPercent,
    maxCornerDeviationDeg,
    warning: perspectiveWarning(severity),
  };
}

export function perspectiveWarning(severity: PerspectiveSeverity): string {
  if (severity === "forte") return "Photo fortement inclinée : mesures potentiellement imprécises. Redressez la référence avant de coter.";
  if (severity === "legere") return "Photo légèrement inclinée : mesures potentiellement imprécises.";
  return "";
}
