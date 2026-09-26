/**
 * C1 — Compatibilité de types entre Engine A (`../primitives.ts`, valeurs nommées avec
 * identité de rendu) et Engine B (`../engine/types.ts`, valeurs pures sans identité).
 *
 * Constat vérifié ci-dessous par des preuves de compilation (`_proof*`, jamais exécutées,
 * qui échoueraient au typecheck si l'assignabilité cessait d'être vraie) et par des tests
 * d'exécution (`point-compat.test.ts`, qui passent de vraies valeurs Engine A à de vraies
 * fonctions pures Engine B) :
 *
 *   Engine A → Engine B : GRATUIT. Chaque type d'Engine A (`Point`, `Segment`, `Circle`,
 *   `Arc`, `Ellipse`, `Polyline`, `Polygon`) est un sur-ensemble structurel du type Engine B
 *   correspondant (mêmes champs géométriques + `id`/`label?`/`role?` en plus). TypeScript
 *   autorise l'assignation d'une valeur "plus riche" là où le type "plus pauvre" est attendu
 *   (la vérification de propriété excédentaire ne s'applique qu'aux littéraux, pas aux
 *   valeurs). Aucune fonction de conversion n'est donc nécessaire dans ce sens : une fonction
 *   pure d'Engine B peut recevoir un `Point`/`Circle`/`Arc`/… d'Engine A directement.
 *
 *   Engine B → Engine A : PAS GRATUIT. Il manque `id` (obligatoire côté A). C'est une
 *   opération générative (inventer un identifiant), pas un simple cast — d'où `withId`
 *   ci-dessous.
 *
 * Cas particulier vérifié : `Polyline`/`Polygon` (A) n'ont pas de champ `closed`, mais celui
 * de B (`Polyline2D.closed?`) est optionnel — passer une `Polyline` d'A là où `Polyline2D`
 * est attendu compile ET reste sémantiquement correct : `closed` vaut alors `undefined`,
 * traité comme "ouvert" par le moteur B, ce qui correspond exactement à la convention réelle
 * d'Engine A (une `Polyline` y est toujours ouverte).
 */
import type { Circle, Ellipse, Point, Polygon, Polyline, Segment } from "../primitives";
import type { Arc as EngineArc } from "../primitives";
import type { Circle2D, Ellipse2D, Point2D, Polygon2D, Polyline2D, Segment2D } from "../engine/types";
import type { Arc2D } from "../engine/types";

// --- Preuves de compilation (§5 : "ne pas conclure sur simple inspection") ---------------
// Chaque fonction ci-dessous n'a de valeur que si elle *compile*. Si une future évolution de
// l'un des deux moteurs casse l'assignabilité, ce fichier cesse de typechecker : la
// compatibilité est donc vérifiée à chaque `tsc`, pas seulement lue dans ce commentaire.

function _proofPointAtoB(p: Point): Point2D {
  return p;
}
function _proofSegmentAtoB(s: Segment): Segment2D {
  return s;
}
function _proofCircleAtoB(c: Circle): Circle2D {
  return c;
}
function _proofArcAtoB(a: EngineArc): Arc2D {
  return a;
}
function _proofEllipseAtoB(e: Ellipse): Ellipse2D {
  return e;
}
function _proofPolylineAtoB(p: Polyline): Polyline2D {
  return p;
}
function _proofPolygonAtoB(p: Polygon): Polygon2D {
  return p;
}
// Empêche l'avertissement "déclarée mais jamais utilisée" tout en gardant les preuves lisibles
// individuellement ci-dessus (chacune documente un couple de types précis).
export const _typeCompatibilityProofs = {
  _proofPointAtoB,
  _proofSegmentAtoB,
  _proofCircleAtoB,
  _proofArcAtoB,
  _proofEllipseAtoB,
  _proofPolylineAtoB,
  _proofPolygonAtoB,
} as const;

// --- Pont explicite dans le sens inverse (B → A), qui NE compile PAS sans fournir un id ---

let _autoIdCounter = 0;

/**
 * Donne une identité de rendu à une valeur pure Engine B pour l'utiliser côté Engine A.
 * Seule direction non gratuite du pont (voir constat ci-dessus) : un id est **généré**, pas
 * recalculé depuis la géométrie — jamais une donnée numérique n'est inventée, seulement une
 * clé de référencement.
 */
export function withId(id: string | undefined, point: Point2D, label?: string, role?: Point["role"]): Point {
  return { id: id ?? `p${++_autoIdCounter}`, x: point.x, y: point.y, label, role };
}

/** Identité documentée : gratuite dans ce sens, fournie pour la lisibilité des appelants. */
export function asPoint2D(point: Point2D): Point2D {
  return point;
}
