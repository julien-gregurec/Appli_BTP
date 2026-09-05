// Démonstrateur technique interne (ENGINE-FOUNDATION-V1 §14) : vérifie que TraceModel,
// divideCircle, les paramètres, les cotes et les étapes fonctionnent ensemble bout en bout.
// Construction mathématique générique — aucune référence tierce, aucune image, aucun texte
// tiers. N'est référencé par aucune page ni par le catalogue public (src/lib/catalog.ts) :
// non visible, non actif publiquement.
import { assertFinitePositive, boundsFromPoints, divideCircle, point, type Dimension } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceModel, type TraceParameter } from "../trace-model";

export type CircleDivisionInput = { diameter: number; divisions: number };

export const circleDivisionParameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 10, defaultValue: 2000 },
  { id: "divisions", label: "Nombre de divisions", min: 1, max: 24, step: 1, defaultValue: 6 },
];

const DEFAULT_INPUT: CircleDivisionInput = { diameter: 2000, divisions: 6 };

export function createCircleDivisionDemo(input: CircleDivisionInput = DEFAULT_INPUT): TraceModel {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const divisions = input.divisions;
  if (!Number.isInteger(divisions) || divisions < 1) throw new Error("Le nombre de divisions doit être un entier supérieur ou égal à 1.");

  const radius = diameter / 2;
  const O = point("O", 0, 0, "Centre O", "construction");
  const dividedPoints = divideCircle(O, radius, divisions);
  const points = [O, ...dividedPoints];
  const sectorAngle = divisions >= 2 ? 360 / divisions : 0;

  const dimensions: Dimension[] = [
    { id: "dim-radius", kind: "radius", from: O, to: dividedPoints[0], label: `R ${radius} mm`, value: radius, unit: "mm" },
  ];
  if (divisions >= 2) {
    dimensions.push({ id: "dim-sector", kind: "angle", from: dividedPoints[0], to: dividedPoints[1], label: `${sectorAngle}°`, value: sectorAngle, unit: "°" });
  }

  const steps: SiteStep[] = [
    { id: "step-centre", title: "Matérialiser le centre", instruction: "Tracez deux axes perpendiculaires et marquez leur intersection O.", measurements: [], pointIds: ["O"] },
    { id: "step-circle", title: "Tracer le cercle directeur", instruction: `Réglez le compas au rayon ${radius} mm et tracez le cercle depuis O.`, measurements: [`${radius} mm`], pointIds: ["O", dividedPoints[0].id] },
    { id: "step-divide", title: "Diviser régulièrement", instruction: divisions >= 2 ? `Reportez ${divisions} divisions de ${sectorAngle}° chacune autour de O.` : "Un seul point suffit ici, aucune division angulaire à reporter.", measurements: divisions >= 2 ? [`${sectorAngle}°`] : [], pointIds: dividedPoints.map((p) => p.id) },
  ];

  const model: TraceModel = {
    id: "demo-circle-division",
    name: "Démonstration — division régulière d’un cercle",
    slug: "demo-circle-division",
    categoryId: "geometry",
    difficulty: "easy",
    tags: ["demo", "interne"],
    status: "preview",
    parameters: circleDivisionParameters,
    bounds: boundsFromPoints(points, Math.max(50, radius * 0.15)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [{ id: "circle-main", centre: O, radius, role: "shape" }],
    ellipses: [],
    constructionLines: [],
    dimensions,
    controls: dividedPoints.map((item, index) => ({ id: `control-${index + 1}`, label: `Distance O → ${item.id}`, value: radius, unit: "mm" as const, pointIds: ["O", item.id] })),
    quantities: [{ id: "q-sector", label: "Angle entre divisions", value: sectorAngle, unit: "°" as const, quality: "exact" as const }],
    steps,
  };
  return validateTraceModel(model);
}
