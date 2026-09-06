/**
 * Grille visuelle adaptative du viewport Atelier (§7).
 *
 * VISUEL UNIQUEMENT dans ce lot : aucun magnétisme, aucune modification de géométrie. Le pas est
 * choisi dans une échelle métier fixe (10 / 50 / 100 / 500 / 1000 / 5000 mm) pour que les
 * graduations restent lisibles quel que soit le zoom, et le nombre de lignes est plafonné pour
 * qu'un dézoom extrême ne puisse jamais faire exploser le coût de rendu (§14).
 */

import type { ViewportSize, ViewportState } from "./viewport-math";
import { screenToWorld, worldToScreen } from "./viewport-math";

/** Échelle des pas de grille, en millimètres, du plus fin au plus large. */
export const GRID_STEPS_MM = [10, 50, 100, 500, 1000, 5000] as const;

/** Espacement écran minimal (px) sous lequel un pas devient illisible. */
export const MIN_GRID_SPACING_PX = 12;

/** Garde-fou de rendu : au-delà, on n'affiche pas de grille plutôt que des milliers de lignes. */
export const MAX_GRID_LINES = 400;

/**
 * Pas proposés à l'artisan dans l'Atelier (TRACING-WORKSHOP-UI-V1 §16), en millimètres.
 *
 * Distincts de `GRID_STEPS_MM`, qui est l'échelle du choix AUTOMATIQUE en fonction du zoom :
 * ici ce sont des pas de chantier usuels, imposés explicitement par l'utilisateur. Un pas
 * imposé reste soumis au garde-fou `MAX_GRID_LINES` — il n'y a donc jamais de grille
 * ingérable, seulement un repli documenté sur le pas automatique (voir `resolveGridStep`).
 */
export const WORKSHOP_GRID_STEPS_MM = [100, 200, 250, 500, 1000] as const;

/** Bornes d'un pas personnalisé saisi à la main (§16) : au-delà, la grille perd tout sens. */
export const MIN_CUSTOM_GRID_STEP_MM = 10;
export const MAX_CUSTOM_GRID_STEP_MM = 10000;

/**
 * Pas retenu pour un zoom donné : celui imposé par l'utilisateur s'il est exploitable,
 * sinon le pas automatique. Un pas imposé non fini, nul ou négatif est ignoré plutôt que
 * propagé — une grille de pas 0 produirait une boucle infinie de graduations.
 */
export function resolveGridStep(scale: number, forcedStepMm?: number | null, minSpacingPx = MIN_GRID_SPACING_PX): number {
  if (forcedStepMm != null && Number.isFinite(forcedStepMm) && forcedStepMm > 0) return forcedStepMm;
  return chooseGridStep(scale, minSpacingPx);
}

export type GridLine = { key: string; position: number; major: boolean };
export type GridModel = {
  stepMm: number;
  majorEveryMm: number;
  spacingPx: number;
  vertical: readonly GridLine[];
  horizontal: readonly GridLine[];
};

/**
 * Plus petit pas de l'échelle dont l'espacement écran atteint `MIN_GRID_SPACING_PX`.
 * Au zoom le plus faible, on retient le pas le plus large disponible.
 */
export function chooseGridStep(scale: number, minSpacingPx = MIN_GRID_SPACING_PX): number {
  const effective = Number.isFinite(scale) && scale > 0 ? scale : 0;
  for (const step of GRID_STEPS_MM) {
    if (step * effective >= minSpacingPx) return step;
  }
  return GRID_STEPS_MM[GRID_STEPS_MM.length - 1];
}

/** Une graduation sur cinq est accentuée, sauf pour le pas le plus large (déjà structurant). */
export function majorGridInterval(stepMm: number): number {
  return stepMm >= GRID_STEPS_MM[GRID_STEPS_MM.length - 1] ? stepMm : stepMm * 5;
}

function isMajor(value: number, majorEveryMm: number): boolean {
  if (majorEveryMm <= 0) return false;
  const ratio = value / majorEveryMm;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

/**
 * Lignes de grille exprimées en coordonnées écran, prêtes à être rendues par `GridOverlay`.
 * Retourne `null` quand la grille n'est pas représentable (taille nulle, densité excessive).
 *
 * `forcedStepMm` impose le pas au lieu de le déduire du zoom (§16). Un pas imposé trop fin
 * pour le cadrage courant franchit `MAX_GRID_LINES` et rend donc `null` : c'est voulu — mieux
 * vaut pas de grille, et un message, qu'un écran saturé de lignes.
 */
export function buildGridModel(
  view: ViewportState,
  size: ViewportSize,
  minSpacingPx = MIN_GRID_SPACING_PX,
  forcedStepMm?: number | null,
): GridModel | null {
  if (!(size.width > 0) || !(size.height > 0)) return null;
  const stepMm = resolveGridStep(view.scale, forcedStepMm, minSpacingPx);
  const topLeft = screenToWorld({ x: 0, y: 0 }, view, size);
  const bottomRight = screenToWorld({ x: size.width, y: size.height }, view, size);
  const minX = Math.min(topLeft.x, bottomRight.x);
  const maxX = Math.max(topLeft.x, bottomRight.x);
  const minY = Math.min(topLeft.y, bottomRight.y);
  const maxY = Math.max(topLeft.y, bottomRight.y);

  const countX = Math.floor(maxX / stepMm) - Math.ceil(minX / stepMm) + 1;
  const countY = Math.floor(maxY / stepMm) - Math.ceil(minY / stepMm) + 1;
  if (countX + countY > MAX_GRID_LINES) return null;

  const majorEveryMm = majorGridInterval(stepMm);
  const vertical: GridLine[] = [];
  const horizontal: GridLine[] = [];

  for (let index = Math.ceil(minX / stepMm); index <= Math.floor(maxX / stepMm); index += 1) {
    const worldX = index * stepMm;
    vertical.push({ key: `v${index}`, position: worldToScreen({ x: worldX, y: 0 }, view, size).x, major: isMajor(worldX, majorEveryMm) });
  }
  for (let index = Math.ceil(minY / stepMm); index <= Math.floor(maxY / stepMm); index += 1) {
    const worldY = index * stepMm;
    horizontal.push({ key: `h${index}`, position: worldToScreen({ x: 0, y: worldY }, view, size).y, major: isMajor(worldY, majorEveryMm) });
  }

  return { stepMm, majorEveryMm, spacingPx: stepMm * view.scale, vertical, horizontal };
}

/** Libellé du pas courant pour la barre d'état (« pas 100 mm », « pas 1 m »). */
export function formatGridStep(stepMm: number): string {
  return stepMm >= 1000 ? `${stepMm / 1000} m` : `${stepMm} mm`;
}
