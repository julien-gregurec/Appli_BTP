// Transformations géométriques pures, additives au moteur existant (primitives.ts).
// Aucune ne modifie primitives.ts/shape-model.ts : elles consomment les types déjà en place
// (Point, Line) et produisent de nouveaux points, exactement comme translate/rotate déjà
// présents dans primitives.ts. Aucune dépendance nouvelle, aucun DSL, aucune surface mutable.
import { point, projection, rotate, type Line, type Point } from "./primitives";

// Homothétie de centre `centre` et de rapport `factor` (peut être négatif : symétrie centrale).
export function scale(source: Point, centre: Point, factor: number, id = source.id): Point {
  if (!Number.isFinite(factor)) throw new Error("Le facteur d'échelle doit être une valeur finie.");
  return point(id, centre.x + (source.x - centre.x) * factor, centre.y + (source.y - centre.y) * factor, source.label, source.role);
}

// Symétrie axiale de `source` par rapport à la droite infinie `axis`. Réutilise projection()
// (déjà testée) pour trouver le pied de la perpendiculaire, plutôt que de réimplémenter la
// géométrie de projection une seconde fois.
export function reflect(source: Point, axis: Line, id = source.id): Point {
  const other = point(`${axis.id}-direction`, axis.point.x + axis.direction.x, axis.point.y + axis.direction.y);
  const foot = projection(source, { id: `${axis.id}-segment`, start: axis.point, end: other });
  return point(id, 2 * foot.x - source.x, 2 * foot.y - source.y, source.label, source.role);
}

// Génère `count` copies de `source`, régulièrement réparties par rotation autour de `centre`
// (généralise la boucle manuelle déjà écrite dans shapes.ts/createRadialMotif). `count` copies
// couvrent un tour complet à partir de `startAngle` — mêmes conventions que divideCircle
// (radians, ordre stable, index i -> angle startAngle + i * 2π/count).
export function repeatRadial(source: Point, centre: Point, count: number, startAngle = 0, prefix = source.id): Point[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Le nombre de répétitions doit être un entier supérieur ou égal à 1.");
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, index) => rotate(source, centre, startAngle + index * step, `${prefix}${index + 1}`));
}
