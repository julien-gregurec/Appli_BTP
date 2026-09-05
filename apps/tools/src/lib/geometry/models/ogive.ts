// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §4, libellé corrigé en DECORATIVE-FAMILIES-V1 §1) :
// OGIVE ÉQUILATÉRALE À DEUX CENTRES — une seule variante, nommée explicitement.
//
// C4-LOT2-ARCHES-V1 — Migré vers Engine B : la géométrie (naissance, deux centres, sommet, deux
// arcs, cercles de construction, axe, steps) provient exclusivement de
// `engine/arches.ts::createArch({type:"lancet", pointedness:"equilateral"})`. Pour la variante
// équilatérale, les deux centres de l'ogive Engine B (CG/CD) coïncident exactement avec les
// points de naissance A/B — la même propriété auto-cohérente qui justifiait le nom du modèle
// (cf. tests de parité). Nom retenu inchangé : "équilatérale" reste le nom principal et sûr ;
// « tiers-point » n'est PAS utilisé ici comme synonyme (cf. mission — seul le fichier historique
// en conservait la mention documentée).
import { createHorizontalDimension, createRadiusDimension, createVerticalDimension } from "../engine/dimensions";
import { createArch } from "../engine/arches";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type OgiveInput = { width: number };

export const ogiveParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur d'ouverture", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
];

const DEFAULT_INPUT: OgiveInput = { width: 1200 };

export const ogiveExplanation: TraceExplanation = {
  objective: "Tracer une ogive équilatérale à deux centres, une construction gothique classique et vérifiable géométriquement.",
  usage: "Baie ou porte en ogive, niche pointue, habillage décoratif d'une ouverture.",
  materials: ["Compas de chantier ou ficelle + crayon de longueur égale à la largeur d'ouverture", "Cordeau pour la ligne de naissance"],
  preparation: "Implantez les deux points de naissance A et B avant de chercher les centres : ce sont eux-mêmes les centres des arcs.",
  principle: "Dans cette variante équilatérale, chaque centre est le point de naissance opposé et le rayon est égal à la largeur d'ouverture. Le cercle centré en A passe exactement par B, et réciproquement — les deux arcs se croisent alors nécessairement au sommet, sans réglage supplémentaire.",
  steps: [
    "Tracer la ligne de naissance A–B à la largeur exacte.",
    "Piquer le compas en A, ouverture réglée sur la largeur A–B.",
    "Tracer l'arc depuis B jusqu'au sommet.",
    "Piquer le compas en B, même ouverture (sans la modifier).",
    "Tracer l'arc depuis A jusqu'au sommet : les deux arcs se rejoignent exactement.",
  ],
  tips: ["Ne changez jamais le réglage du compas entre les deux arcs : c'est le même rayon, la largeur d'ouverture, pour les deux.", "Le sommet doit être un point unique, jamais un petit décalage entre les deux arcs — sinon l'ouverture du compas n'était pas identique."],
  commonErrors: ["Piquer les centres ailleurs qu'aux points de naissance eux-mêmes.", "Régler un rayon différent pour le second arc."],
  finalCheck: "Contrôlez que les deux arcs se rejoignent en un point unique sur l'axe médian, et que chaque centre est bien à la largeur exacte de son point de naissance opposé.",
  warnings: ["Cette variante ne couvre que l'ogive équilatérale — d'autres ogives (lancéolée, surhaussée) utilisent des rayons différents de la largeur."],
};

export function createOgiveGeometry(input: OgiveInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const width = input.width;
  if (!Number.isFinite(width) || width <= 0) throw new Error("La largeur doit être supérieure à 0.");

  // 2. Géométrie : exclusivement Engine B (invariant : hauteur = largeur × √3 / 2).
  const shape = createArch({ type: "lancet", width, pointedness: "equilateral" });
  const { A, B, S } = shape.primitives.points;
  const radius = shape.primitives.arcs[0].radius;

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-width", `Largeur ${width} mm`, createHorizontalDimension(A, B, -70)),
    dimensionResultToDimension("dim-height", `Hauteur ${Math.round(S.y - A.y)} mm`, createVerticalDimension({ x: (A.x + B.x) / 2, y: A.y }, S, 70)),
    dimensionResultToDimension("dim-radius", `R ${radius} mm`, createRadiusDimension({ centre: A, radius })),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "ogive-equilateral",
    name: "Ogive équilatérale à deux centres",
    slug: "ogive-equilateral",
    categoryId: "tracing",
    difficulty: "intermediate",
    tags: ["ogive", "équilatérale", "gothique", "arc"],
    status: "preview",
    parameters: ogiveParameters,
    explanation: ogiveExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
