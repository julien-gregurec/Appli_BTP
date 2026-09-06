/**
 * §7 — aperçu vectoriel d'un modèle de la bibliothèque.
 *
 * L'aperçu est GÉNÉRÉ par le moteur : c'est la géométrie du modèle à ses valeurs par défaut,
 * projetée avec le même helper que le plan coté (`createPlanTransform`). Aucune image, aucune
 * capture, aucun visuel de référence tiers — la carte montre ce que l'outil sait tracer.
 *
 * Le contour est dessiné plein, les traits de construction et les axes en trait léger : sans
 * eux, « Cercle divisé » se réduirait à un cercle et « Ellipse pédagogique » à une ellipse,
 * c'est-à-dire à un aperçu qui ne dit pas ce que le modèle fait. Cotes, points et étiquettes
 * restent écartés : illisibles à 160 × 120 px, ils ne renseigneraient sur rien.
 *
 * Les coordonnées sont ARRONDIES au centième de pixel. Cette page est pré-rendue : la
 * géométrie est calculée une fois par Node, une fois par le navigateur, et les deux moteurs
 * ne s'accordent pas au dernier bit sur `Math.cos`/`Math.sin`. Sans arrondi, React signale
 * une divergence d'hydratation sur des chemins pourtant identiques à l'œil.
 */

import { createArcPath, createPlanTransform, createPolygonPath, createPolylinePath } from "@/lib/geometry/plan-model";
import type { TraceModel } from "@/lib/geometry/trace-model";
import styles from "./library.module.css";

const WIDTH = 160;
const HEIGHT = 120;
const MARGIN = 10;

/** Centième de pixel : bien plus fin que le trait, bien plus grossier que l'écart entre moteurs. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isShape(role: string | undefined): boolean {
  return role !== "construction" && role !== "axis";
}

export function ModelThumbnail({ model, label }: { model: TraceModel; label: string }) {
  const base = createPlanTransform(model, WIDTH, HEIGHT, MARGIN);
  // Transform enveloppé plutôt que chaînes de chemin retouchées : `createArcPath` et
  // `createPolylinePath` passent par `point`/`radius`, donc tout ce qu'ils produisent est
  // arrondi sans qu'on ait à relire leur sortie.
  const transform = {
    ...base,
    point: (source: { x: number; y: number }) => {
      const projected = base.point(source);
      return { x: round(projected.x), y: round(projected.y) };
    },
    radius: (value: number) => round(base.radius(value)),
  };
  const project = transform.point;

  const construction = [
    ...model.constructionLines.map((item) => ({ ...item, key: `c-${item.id}` })),
    ...model.segments.filter((item) => !isShape(item.role)).map((item) => ({ ...item, key: `s-${item.id}` })),
  ];

  return (
    <svg
      className={styles.thumbnail}
      viewBox={`0 0 ${transform.width} ${transform.height}`}
      role="img"
      aria-label={`Aperçu du modèle ${label}`}
    >
      <g className={styles.thumbConstruction}>
        {construction.map((item) => {
          const start = project(item.start);
          const end = project(item.end);
          return <line key={item.key} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
        })}
        {model.circles.filter((item) => !isShape(item.role)).map((item) => {
          const centre = project(item.centre);
          return <circle key={item.id} cx={centre.x} cy={centre.y} r={transform.radius(item.radius)} />;
        })}
        {model.arcs.filter((item) => !isShape(item.role)).map((item) => (
          <path key={item.id} d={createArcPath(item, transform)} />
        ))}
      </g>

      <g className={styles.thumbShape}>
        {(model.polygons ?? []).filter((item) => isShape(item.role)).map((item) => (
          <path key={item.id} d={createPolygonPath(item, transform)} />
        ))}
        {(model.polylines ?? []).filter((item) => isShape(item.role)).map((item) => (
          <path key={item.id} d={createPolylinePath(item, transform)} />
        ))}
        {model.segments.filter((item) => isShape(item.role)).map((item) => {
          const start = project(item.start);
          const end = project(item.end);
          return <line key={item.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
        })}
        {model.arcs.filter((item) => isShape(item.role)).map((item) => (
          <path key={item.id} d={createArcPath(item, transform)} />
        ))}
        {model.circles.filter((item) => isShape(item.role)).map((item) => {
          const centre = project(item.centre);
          return <circle key={item.id} cx={centre.x} cy={centre.y} r={transform.radius(item.radius)} />;
        })}
        {model.ellipses.filter((item) => isShape(item.role)).map((item) => {
          const centre = project(item.centre);
          return (
            <ellipse
              key={item.id}
              cx={centre.x}
              cy={centre.y}
              rx={transform.radius(item.radiusX)}
              ry={transform.radius(item.radiusY)}
              transform={item.rotation ? `rotate(${round((-item.rotation * 180) / Math.PI)} ${centre.x} ${centre.y})` : undefined}
            />
          );
        })}
      </g>
    </svg>
  );
}
