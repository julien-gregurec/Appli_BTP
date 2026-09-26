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

import type { Point, Polygon, Polyline, Segment } from "../geometry/primitives";
import { validateShapeGeometry, type Quantity, type ShapeGeometry } from "../geometry/shape-model";
import { freeGeometryContourMeasures, type FreeContourMeasures } from "./free-contour";
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
  polygon?: Polygon;
} {
  const at = (index: number) => vertexPoint(freeVertexPointId(entity.id, index), entity.points[index]);
  const vertices = () => entity.points.map((_, index) => at(index));

  switch (entity.kind) {
    case "point":
      return { point: vertexPoint(entity.id, entity.points[0], entity.id) };
    case "segment":
      return { segment: { id: entity.id, start: at(0), end: at(1), role: FREE_ROLE } };
    case "polyline":
      return { polyline: { id: entity.id, points: vertices(), role: FREE_ROLE } };
    /*
     * ATELIER-FREE-CONTOUR-AREA-V1 §15/§16 — le contour part dans `polygons`, sans son premier
     * sommet répété.
     *
     * C'est ce champ, et lui seul, qui referme la forme partout en aval, sans qu'une ligne du
     * pipeline d'export ait à changer : `createPolygonPath` ajoute le `Z` du SVG, `dxf.ts`
     * écrit `closed: true` sur la POLYLINE, le PDF ferme le chemin, `hit-test` et `snap`
     * traitent le côté de fermeture comme les autres. Dupliquer le premier point ici aurait
     * produit un sommet en trop dans chacun de ces cinq consommateurs à la fois.
     */
    case "polygon":
      return { polygon: { id: entity.id, points: vertices(), role: FREE_ROLE } };
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

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §14 — quantités DÉMONTRABLES d'un contour, et rien d'autre.
 *
 * Deux lignes par contour exploitable : sa surface et son périmètre. Ce sont les deux seules
 * grandeurs que la géométrie établit sans rien savoir de ce que la forme représente — un
 * matériau, une chute, un nombre de plaques, un volume supposeraient tous une hypothèse métier
 * que ce lot n'a pas à prendre (§14).
 *
 * Un contour non exploitable ne publie AUCUNE ligne de surface. Il en publie une de périmètre :
 * la longueur développée d'une ligne fermée reste juste même quand ses côtés se croisent —
 * c'est l'aire, pas la longueur, que le croisement rend ambiguë.
 *
 * `quality: "exact"` : ces sommets ont été posés en millimètres, éventuellement accrochés à une
 * géométrie exacte. Rien n'est ici approché, ni développé, ni relevé sur une image calibrée.
 */
function contourQuantities(measures: readonly FreeContourMeasures[]): Quantity[] {
  const quantities: Quantity[] = [];
  for (const measure of measures) {
    if (measure.areaM2 !== null) {
      quantities.push({
        id: `q-${measure.entityId}-area`,
        label: `Surface du contour ${measure.entityId}`,
        value: measure.areaM2,
        unit: "m²",
        quality: "exact",
      });
    }
    quantities.push({
      id: `q-${measure.entityId}-perimeter`,
      label: `Périmètre du contour ${measure.entityId}`,
      value: measure.perimeterMm,
      unit: "mm",
      quality: "exact",
    });
  }
  return quantities;
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
  /**
   * ATELIER-FREE-CONTOUR-AREA-V1 §14/§20 — publier les quantités des contours (`false` par défaut).
   *
   * Désactivé par défaut parce que le VIEWPORT n'en lit aucune et que ce n'est pas gratuit : le
   * statut d'un contour demande une détection d'auto-intersection, quadratique en nombre de
   * côtés, et cette projection est refaite à CHAQUE trame d'un glissement de sommet. L'export,
   * lui, la demande une fois par document et l'obtient en passant `quantities: true`.
   *
   * Ce n'est donc pas un réglage de contenu — la géométrie est identique dans les deux cas —
   * mais l'aveu qu'une seule des deux voies a besoin du calcul.
   */
  quantities?: boolean;
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
  const polygons: Polygon[] = [];

  for (const entity of geometry.entities) {
    const projected = entityToPrimitives(entity);
    if (projected.point) points.push(projected.point);
    if (projected.segment) segments.push(projected.segment);
    if (projected.polyline) polylines.push(projected.polyline);
    if (projected.polygon) polygons.push(projected.polygon);
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
    quantities: options.quantities ? contourQuantities(freeGeometryContourMeasures(geometry)) : [],
    steps: [],
    polylines: polylines.length ? polylines : undefined,
    polygons: polygons.length ? polygons : undefined,
  };

  return validateShapeGeometry(model);
}
