// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §3) : arche plein cintre, fiche pédagogique dédiée.
// Réutilise createAdvancedArch (mode "semicircle") déjà validé dans shapes.ts — aucune formule
// concurrente. Ce fichier n'ajoute qu'un habillage TraceModel (paramètres/explication/étapes
// pédagogiques propres) autour d'une géométrie déjà éprouvée par les tests de shapes.test.ts.
// Paramètre volontairement réduit à la seule largeur : pour un plein cintre, le rayon est
// entièrement déterminé (rayon = largeur / 2) — ajouter un départ de cintre indépendant
// nécessiterait de dupliquer la logique de translation déjà couverte par le mode
// "total-spring" de createAdvancedArch, hors périmètre d'une fiche pédagogique volontairement
// simple (cf. §3 : « ou structure équivalente »).
import { createAdvancedArch } from "../shapes";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type ArchFullRoundInput = { width: number };

export const archFullRoundParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur d'ouverture", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
];

const DEFAULT_INPUT: ArchFullRoundInput = { width: 1200 };

export const archFullRoundExplanation: TraceExplanation = {
  objective: "Tracer une arche plein cintre (demi-cercle exact) à partir de la seule largeur d'ouverture.",
  usage: "Porte ou passage cintré, niche murale, habillage de baie.",
  materials: ["Compas de chantier ou ficelle + crayon", "Cordeau pour la ligne de naissance", "Niveau pour vérifier l'horizontalité de la naissance"],
  preparation: "Implantez d'abord les deux pieds de jambage avant de chercher le centre.",
  principle: "Un plein cintre est un demi-cercle : le centre est au milieu de la ligne de naissance, et le rayon vaut exactement la moitié de la largeur d'ouverture.",
  steps: [
    "Implanter les deux jambages à la largeur exacte.",
    "Tracer la ligne de naissance A–B et son axe médian.",
    "Localiser le centre O au milieu de la ligne de naissance.",
    "Régler le compas au rayon (largeur ÷ 2).",
    "Tracer l'arc de A à B en passant par le sommet.",
  ],
  tips: ["Le rayon est toujours exactement la moitié de la largeur : pas de calcul à faire de tête, un simple partage en deux suffit.", "Vérifiez le réglage du compas en contrôlant O→A et O→B avant de tracer."],
  commonErrors: ["Confondre la largeur totale et le rayon.", "Décaler le centre par rapport au milieu réel de la ligne de naissance."],
  finalCheck: "Contrôlez que O est à égale distance de A et de B, et que cette distance vaut bien la moitié de la largeur.",
  warnings: ["Vérifiez le tracé avant toute découpe définitive de l'ouverture."],
};

export function createArchFullRoundGeometry(input: ArchFullRoundInput = DEFAULT_INPUT): TraceModel {
  const base = createAdvancedArch({ width: input.width, mode: "semicircle" }, "arch-full-round", "Arche plein cintre");
  const model: TraceModel = {
    ...base,
    slug: "arch-full-round",
    categoryId: "tracing",
    difficulty: "easy",
    tags: ["arche", "plein cintre", "demi-cercle", "passage"],
    status: "preview",
    parameters: archFullRoundParameters,
    explanation: archFullRoundExplanation,
  };
  return validateTraceModel(model);
}
