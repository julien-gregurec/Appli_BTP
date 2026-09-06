/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §5/§11 — présentation du tracé libre en `ShapeGeometry`.
 *
 * ## Une seule projection, deux consommateurs
 *
 * Le viewport attend une `PlanScene`, l'export attend une `ShapeGeometry`. Or `PlanScene` a
 * été défini comme un sur-ensemble structurel de `ShapeGeometry` (cf. `plan-scene.ts`) : une
 * `ShapeGeometry` EST donc une scène. Produire les deux séparément ferait exister deux
 * lectures du même tracé, qui dériveraient au premier ajout de primitive ; il n'y a donc ici
 * qu'une seule fonction, et le viewport comme l'export lisent son résultat.
 *
 * C'est aussi ce qui branche le tracé libre sur le pipeline d'export **sans le modifier**
 * (§11) : `renderPlanSvg`, `shapeGeometryToDxf`, le PNG et le PDF consomment déjà les champs
 * `points` / `segments` / `polylines` d'une `ShapeGeometry`. Rien à ajouter côté export — ce
 * qu'ils savaient faire pour un modèle résolu, ils le font pour un tracé libre.
 *
 * ## Ce que la projection ne fait pas
 *
 * Elle ne calcule aucune géométrie : elle recopie des sommets déjà en millimètres et en déduit
 * les bornes. Aucune quantité, aucune cote, aucune étape de chantier n'est inventée (§11) —
 * ces champs restent vides, et les sections d'export correspondantes disparaissent d'elles-mêmes.
 *
 * ## Accrochage et hit-test viennent gratuitement
 *
 * `snap.ts` accroche déjà les extrémités et milieux des `segments` et des `polylines`, ainsi
 * que les `points` nommés ; `hit-test.ts` désigne déjà ces trois natures. Passer par
 * `ShapeGeometry` donne donc au tracé libre l'accrochage et la désignation du socle, sans une
 * ligne de géométrie nouvelle (§5).
 */

import type { Point, Polyline, Segment } from "../geometry/primitives";
import { validateShapeGeometry, type ShapeGeometry } from "../geometry/shape-model";
import {
  freeGeometryBounds,
  type FreeEntity,
  type FreeGeometry,
  type FreeVertex,
} from "./free-geometry";

/**
 * Demi-étendue de la FEUILLE de travail par défaut, en millimètres.
 *
 * Une scène sans bornes n'est pas cadrable : le viewport diviserait par une étendue nulle et
 * n'afficherait rien, sur quoi il serait impossible de poser le premier point. Un mètre de part
 * et d'autre de l'origine donne une feuille immédiatement utilisable, à l'échelle d'un ouvrage
 * courant.
 */
export const FREE_SHEET_HALF_SPAN_MM = 1000;

/**
 * Pas d'agrandissement de la feuille, en millimètres.
 *
 * C'est la valeur qui rend le tracé libre utilisable, et elle mérite son explication. Le
 * cadrage automatique du viewport suit les bornes de la scène tant que l'utilisateur n'a pas
 * déplacé le plan lui-même. Avec des bornes collées au contenu, CHAQUE primitive validée
 * changerait l'échelle : on trace un segment, le plan se réajuste, on en trace un second, il se
 * réajuste encore — et le tracé se fait sur un fond qui bouge sous la main.
 *
 * La feuille ne suit donc pas le contenu : elle part d'un cadre fixe et ne s'agrandit que par
 * paliers d'un demi-mètre, quand le tracé sort réellement du cadre. Entre deux paliers, l'échelle
 * ne bouge pas d'un pixel.
 */
export const FREE_SHEET_STEP_MM = 500;

/** Rôle des primitives libres : tracé final, jamais construction — l'utilisateur les a voulues. */
const FREE_ROLE = "shape" as const;

function vertexPoint(id: string, vertex: FreeVertex, label?: string): Point {
  return { id, x: vertex.x, y: vertex.y, label, role: "reference" };
}

/**
 * Identifiant d'un sommet à l'intérieur d'une entité. Dérivé et stable (`sg-1-v0`), il ne
 * figure jamais au premier niveau de la scène : seuls les identifiants d'ENTITÉ sont
 * sélectionnables, et c'est ce qui garantit qu'un clic désigne le segment et non un de ses
 * bouts (`validateShapeGeometry` ne contrôle l'unicité qu'au premier niveau).
 */
export function freeVertexPointId(entityId: string, index: number): string {
  return `${entityId}-v${index}`;
}

function entityToPrimitives(entity: FreeEntity): {
  point?: Point;
  segment?: Segment;
  polyline?: Polyline;
} {
  const at = (index: number) => vertexPoint(freeVertexPointId(entity.id, index), entity.points[index]);

  switch (entity.kind) {
    case "point":
      return { point: vertexPoint(entity.id, entity.points[0], entity.id) };
    case "segment":
      return { segment: { id: entity.id, start: at(0), end: at(1), role: FREE_ROLE } };
    case "polyline":
      return {
        polyline: { id: entity.id, points: entity.points.map((_, index) => at(index)), role: FREE_ROLE },
      };
  }
}

/** Arrondi vers l'extérieur au palier de feuille — jamais vers l'intérieur, sinon le tracé sortirait. */
function outward(value: number, sign: 1 | -1): number {
  const steps = Math.ceil(Math.abs(value) / FREE_SHEET_STEP_MM);
  return sign * steps * FREE_SHEET_STEP_MM;
}

/**
 * FEUILLE de travail d'un tracé libre : un cadre STABLE qui contient le tracé, et non des
 * bornes collées à lui.
 *
 * C'est le cadre que voit le viewport. Il part de ±1 m autour de l'origine et ne s'agrandit
 * que par paliers, ce qui garantit que poser une primitive ne change pas l'échelle du plan
 * (cf. `FREE_SHEET_STEP_MM`). Il est toujours symétrique autour de l'origine : le repère du
 * tracé libre EST l'origine monde, et un cadre décentré ferait dériver le point (0, 0) hors de
 * l'écran à mesure qu'on trace d'un côté.
 *
 * À ne pas confondre avec les bornes de la géométrie (`freeGeometryBounds`), qui restent
 * collées au contenu : ce sont elles qui décident de la taille d'une mosaïque d'impression, et
 * les élargir ferait imprimer du vide.
 */
export function freeSceneBounds(geometry: FreeGeometry) {
  const bounds = freeGeometryBounds(geometry);
  const half = FREE_SHEET_HALF_SPAN_MM;
  if (!bounds) return { minX: -half, minY: -half, maxX: half, maxY: half };
  return {
    minX: Math.min(-half, outward(bounds.minX, -1)),
    minY: Math.min(-half, outward(bounds.minY, -1)),
    maxX: Math.max(half, outward(bounds.maxX, 1)),
    maxY: Math.max(half, outward(bounds.maxY, 1)),
  };
}

/**
 * Bornes du CONTENU, collées au tracé — celles dont l'export a besoin. Un tracé vide ou réduit
 * à un point n'a pas d'étendue, et c'est la réponse juste : `planMosaic` refuse alors de
 * planifier une impression, plutôt que d'en planifier une sur du vide.
 */
function freeContentBounds(geometry: FreeGeometry) {
  return freeGeometryBounds(geometry) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export type FreeShapeOptions = {
  id?: string;
  name?: string;
  /**
   * Quel cadre porter dans `bounds` :
   *
   * - `content` (défaut) — collé au tracé. C'est ce que veut l'EXPORT : la mosaïque, le PDF et
   *   le PNG dimensionnent leur page dessus, et un cadre élargi ferait imprimer du vide ;
   * - `sheet` — la feuille de travail stable. C'est ce que veut le VIEWPORT : une échelle qui
   *   ne saute pas à chaque primitive posée.
   *
   * La géométrie est identique dans les deux cas — seul le cadre change.
   */
  frame?: "content" | "sheet";
};

/**
 * Projection du tracé libre en `ShapeGeometry` — donc en `PlanScene` et en géométrie d'export.
 *
 * `validateShapeGeometry` est appelée en sortie plutôt qu'en garde d'entrée : elle est le juge
 * du contrat de l'autre côté de la frontière (identifiants uniques, aucune valeur non finie),
 * et c'est bien à la sortie qu'on veut l'entendre. Le tracé libre a déjà été validé par
 * `validateFreeGeometry` à l'écriture ; les deux contrôles sont donc complémentaires, pas
 * redondants.
 */
export function freeGeometryToShape(geometry: FreeGeometry, options: FreeShapeOptions = {}): ShapeGeometry {
  const points: Point[] = [];
  const segments: Segment[] = [];
  const polylines: Polyline[] = [];

  for (const entity of geometry.entities) {
    const projected = entityToPrimitives(entity);
    if (projected.point) points.push(projected.point);
    if (projected.segment) segments.push(projected.segment);
    if (projected.polyline) polylines.push(projected.polyline);
  }

  const model: ShapeGeometry = {
    id: options.id ?? "atelier-libre",
    name: options.name ?? "Tracé libre",
    bounds: options.frame === "sheet" ? freeSceneBounds(geometry) : freeContentBounds(geometry),
    referenceFrame: { unit: "mm", origin: { id: "O", x: 0, y: 0 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments,
    arcs: [],
    circles: [],
    ellipses: [],
    constructionLines: [],
    dimensions: [],
    controls: [],
    quantities: [],
    steps: [],
    polylines: polylines.length ? polylines : undefined,
    polygons: undefined,
  };

  return validateShapeGeometry(model);
}
