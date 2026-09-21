/**
 * Mathématiques pures du viewport Atelier (ATELIER-VIEWPORT-INTERACTION-FOUNDATION-V1 §2/§6).
 *
 * Aucun React, aucun DOM, aucune dépendance au moteur géométrique : ce module ne connaît que
 * des nombres. Il est la seule source de vérité des conversions écran ↔ monde, réutilisée plus
 * tard par la calibration photo, la sélection, le snap, la pose LED/spot, les cotes et le
 * contour manuel — d'où l'exigence de déterminisme (§6).
 *
 * Conventions :
 * - Monde : millimètres, Y vers le haut (même repère que `@/lib/geometry/primitives`).
 * - Écran : pixels CSS du viewport, origine en haut à gauche, Y vers le bas.
 * - `scale` est un facteur px/mm ; l'état du viewport est décrit par le point du monde affiché
 *   au centre de la zone visible (`centerX`/`centerY`) — représentation stable quand la taille
 *   du conteneur change (rotation d'écran, ouverture du panneau propriétés).
 */

export type WorldPoint = { x: number; y: number };
export type ScreenPoint = { x: number; y: number };
export type ViewportSize = { width: number; height: number };
export type ViewportState = { scale: number; centerX: number; centerY: number };
export type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Bornes de zoom en px/mm (§5). 0,004 px/mm ≈ un mur de 100 m tenant dans 400 px ; 24 px/mm ≈ le dixième de millimètre visible. */
export const MIN_ZOOM = 0.004;
export const MAX_ZOOM = 24;

/** Facteur de zoom d'un cran de molette / d'un appui sur les boutons + et −. */
export const ZOOM_STEP = 1.2;

/** Marge (px) laissée autour de la géométrie lors d'un recentrage. */
export const FIT_PADDING = 32;

const FALLBACK_SIZE: ViewportSize = { width: 1, height: 1 };

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function safeSize(size: ViewportSize): ViewportSize {
  const width = finite(size?.width, 0);
  const height = finite(size?.height, 0);
  if (width <= 0 || height <= 0) return FALLBACK_SIZE;
  return { width, height };
}

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** Projection monde → écran. Inverse exact de `screenToWorld` pour un même (view, size). */
export function worldToScreen(world: WorldPoint, view: ViewportState, size: ViewportSize): ScreenPoint {
  const { width, height } = safeSize(size);
  const scale = clampZoom(view.scale);
  return {
    x: width / 2 + (world.x - view.centerX) * scale,
    y: height / 2 - (world.y - view.centerY) * scale,
  };
}

/** Projection écran → monde. Inverse exact de `worldToScreen` pour un même (view, size). */
export function screenToWorld(screen: ScreenPoint, view: ViewportState, size: ViewportSize): WorldPoint {
  const { width, height } = safeSize(size);
  const scale = clampZoom(view.scale);
  return {
    x: view.centerX + (screen.x - width / 2) / scale,
    y: view.centerY - (screen.y - height / 2) / scale,
  };
}

/** Longueur monde correspondant à une distance écran (et réciproque). */
export function screenToWorldLength(pixels: number, view: ViewportState): number {
  return pixels / clampZoom(view.scale);
}

export function worldToScreenLength(millimetres: number, view: ViewportState): number {
  return millimetres * clampZoom(view.scale);
}

/**
 * Déplacement du contenu de (dx, dy) pixels écran : le doigt/curseur « pousse » le plan, donc le
 * centre du viewport se déplace en sens inverse dans le monde.
 */
export function panByScreen(view: ViewportState, dxScreen: number, dyScreen: number): ViewportState {
  const scale = clampZoom(view.scale);
  return {
    scale,
    centerX: view.centerX - finite(dxScreen, 0) / scale,
    centerY: view.centerY + finite(dyScreen, 0) / scale,
  };
}

/**
 * Zoom autour d'un point écran fixe (§3 molette, §4 pinch centré entre les doigts) : le point
 * du monde situé sous `anchor` reste exactement sous `anchor` après l'opération.
 */
export function zoomAt(view: ViewportState, size: ViewportSize, anchor: ScreenPoint, factor: number): ViewportState {
  const { width, height } = safeSize(size);
  const nextScale = clampZoom(clampZoom(view.scale) * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  const world = screenToWorld(anchor, view, size);
  return {
    scale: nextScale,
    centerX: world.x - (anchor.x - width / 2) / nextScale,
    centerY: world.y + (anchor.y - height / 2) / nextScale,
  };
}

/** Zoom centré sur le milieu du viewport (boutons + / −). */
export function zoomByStep(view: ViewportState, size: ViewportSize, factor: number): ViewportState {
  const { width, height } = safeSize(size);
  return zoomAt(view, size, { x: width / 2, y: height / 2 }, factor);
}

/** Recentrage (§2 « reset view ») : la géométrie tient entièrement dans le viewport, avec marge. */
export function fitToBounds(bounds: WorldBounds, size: ViewportSize, padding = FIT_PADDING): ViewportState {
  const { width, height } = safeSize(size);
  const spanX = Math.max(1, finite(bounds.maxX, 0) - finite(bounds.minX, 0));
  const spanY = Math.max(1, finite(bounds.maxY, 0) - finite(bounds.minY, 0));
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  return {
    scale: clampZoom(Math.min(usableWidth / spanX, usableHeight / spanY)),
    centerX: (finite(bounds.minX, 0) + finite(bounds.maxX, 0)) / 2,
    centerY: (finite(bounds.minY, 0) + finite(bounds.maxY, 0)) / 2,
  };
}

/** Rectangle du monde actuellement visible. */
export function visibleWorldBounds(view: ViewportState, size: ViewportSize): WorldBounds {
  const topLeft = screenToWorld({ x: 0, y: 0 }, view, size);
  const bottomRight = screenToWorld({ x: safeSize(size).width, y: safeSize(size).height }, view, size);
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

/**
 * Bornage du pan (§5) : on autorise à sortir la géométrie jusqu'au bord de l'écran, jamais
 * au-delà. Le plan ne peut donc pas être « perdu » définitivement hors champ, et un simple
 * geste inverse le ramène.
 */
export function clampPan(view: ViewportState, bounds: WorldBounds, size: ViewportSize): ViewportState {
  const { width, height } = safeSize(size);
  const scale = clampZoom(view.scale);
  const halfWidth = width / 2 / scale;
  const halfHeight = height / 2 / scale;
  const minX = finite(bounds.minX, 0);
  const maxX = finite(bounds.maxX, 0);
  const minY = finite(bounds.minY, 0);
  const maxY = finite(bounds.maxY, 0);
  return {
    scale,
    centerX: Math.min(maxX + halfWidth, Math.max(minX - halfWidth, finite(view.centerX, 0))),
    centerY: Math.min(maxY + halfHeight, Math.max(minY - halfHeight, finite(view.centerY, 0))),
  };
}

/** Distance et milieu entre deux contacts — briques du pinch (§4). */
export function screenDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function screenMidpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Pourcentage de zoom affiché à l'utilisateur : 100 % = vue recentrée. Plus lisible qu'un px/mm
 * brut sur un plan dont l'échelle dépend de la taille du tracé.
 */
export function zoomPercent(view: ViewportState, fit: ViewportState): number {
  const reference = clampZoom(fit.scale);
  if (reference <= 0) return 100;
  return Math.round((clampZoom(view.scale) / reference) * 100);
}

/**
 * Transformation compatible avec les helpers de rendu SVG existants
 * (`createArcPath` / `createPolylinePath` / `createPolygonPath` de `@/lib/geometry/plan-model`),
 * qui attendent `{ width, height, scale, point, radius }` (§8 : réutiliser le rendu SVG actuel).
 */
export function createViewportTransform(view: ViewportState, size: ViewportSize) {
  const { width, height } = safeSize(size);
  const scale = clampZoom(view.scale);
  return {
    width,
    height,
    scale,
    point: (source: WorldPoint) => worldToScreen(source, view, size),
    radius: (value: number) => value * scale,
  };
}
