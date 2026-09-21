// Extension additive de ShapeGeometry pour le futur module "Tracés & Géométrie"
// (ELSATIA-TOOLS-TRACES-GEOMETRIE-ENGINE-FOUNDATION-V1). Ce fichier n'existait pas avant ce lot
// et n'est consommé par aucun outil actuel — shape-model.ts, primitives.ts, AdvancedPlan.tsx et
// ProCalculatorWorkspace.tsx restent inchangés dans leur comportement.
//
// TraceModel EST une géométrie technique (il étend ShapeGeometry) : il n'existe donc pas de champ
// "technicalPreview" séparé qui dupliquerait points/segments/arcs/etc. — le modèle lui-même reste
// la source de vérité technique. Seul un aperçu illustratif optionnel (realisticPreview) est ajouté,
// et il ne peut jamais influencer la géométrie (aucune fonction de ce fichier ne le lit pour calculer
// quoi que ce soit).
import type { CategoryId } from "../categories";
import { validateShapeGeometry, type ShapeGeometry } from "./shape-model";

export type TraceDifficulty = "easy" | "intermediate" | "advanced";

// Distinct de ToolStatus (catalog.ts) : mêmes valeurs, par cohérence produit avec la convention
// déjà établie ("preview" pour publication progressive, cf. audit ARCHITECTURE-AUDIT-V1 §30),
// mais un type autonome pour ne pas faire dépendre le moteur géométrique (lib/geometry) du
// catalogue applicatif (lib/catalog.ts) — mauvais sens de dépendance à éviter.
export type TraceStatus = "preview" | "active" | "hidden";

export type TraceParameter = {
  id: string;
  label: string;
  unit?: "mm" | "°" | "ratio";
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
};

// Toutes les sections sont optionnelles : ce lot ne rédige aucun contenu, seulement la structure
// que les fonctions de modèle pourront remplir plus tard (texte interpolé, comme déjà fait pour
// les instructions de shapes.ts via formatMm()).
export type TraceExplanation = {
  objective?: string;
  usage?: string;
  materials?: readonly string[];
  preparation?: string;
  principle?: string;
  steps?: readonly string[];
  tips?: readonly string[];
  commonErrors?: readonly string[];
  finalCheck?: string;
  warnings?: readonly string[];
};

// Purement illustratif — jamais une source de cotes/points/rayons/centres/méthode de traçage.
export type RealisticPreviewMetadata = { imageUrl: string; generatedBy: "elsatia-ai" | "manual"; generatedAt: string };

export type TraceModel = ShapeGeometry & {
  slug: string;
  categoryId: CategoryId;
  difficulty: TraceDifficulty;
  tags: readonly string[];
  parameters: readonly TraceParameter[];
  status: TraceStatus;
  explanation?: TraceExplanation;
  realisticPreview?: RealisticPreviewMetadata;
};

function validateTraceParameters(parameters: readonly TraceParameter[]) {
  const ids = new Set<string>();
  for (const parameter of parameters) {
    if (!parameter.id.trim()) throw new Error("Un paramètre de tracé doit avoir un identifiant non vide.");
    if (ids.has(parameter.id)) throw new Error(`Paramètre de tracé dupliqué : ${parameter.id}.`);
    ids.add(parameter.id);
    if (!Number.isFinite(parameter.defaultValue)) throw new Error(`Le paramètre ${parameter.id} a une valeur par défaut non finie.`);
    if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) {
      throw new Error(`Le paramètre ${parameter.id} a un minimum supérieur à son maximum.`);
    }
    if (parameter.min !== undefined && parameter.defaultValue < parameter.min) throw new Error(`Le paramètre ${parameter.id} a une valeur par défaut inférieure à son minimum.`);
    if (parameter.max !== undefined && parameter.defaultValue > parameter.max) throw new Error(`Le paramètre ${parameter.id} a une valeur par défaut supérieure à son maximum.`);
    if (parameter.step !== undefined && (!Number.isFinite(parameter.step) || parameter.step <= 0)) throw new Error(`Le paramètre ${parameter.id} a un pas invalide.`);
  }
}

// Réutilise validateShapeGeometry telle quelle (ids uniques, points référencés, valeurs finies)
// puis ajoute les contrôles propres à TraceModel — pas de duplication de logique, pas de
// modification de la fonction existante consommée par les outils Pro actuels.
export function validateTraceModel(model: TraceModel): TraceModel {
  validateShapeGeometry(model);
  if (!model.slug.trim()) throw new Error("Un modèle de tracé doit avoir un slug non vide.");
  validateTraceParameters(model.parameters);
  return model;
}
