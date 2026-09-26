/**
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §2 — résolveur central `TracingProject` → Engine B.
 *
 * Chaîne réelle, en un seul endroit :
 *
 *   TracingProject.modelId + TracingProject.modelParams
 *     → descripteur du registre (`geometry/models/catalog.ts`)
 *     → paramètres normalisés (défauts du modèle + surcharges projet)
 *     → `create<Nom>Geometry(...)` → `ParametricShape` (Engine B) → `TraceModel`
 *
 * Fonction pure et synchrone, sans React, sans persistance, sans effet de bord. Elle ne
 * calcule AUCUNE géométrie : tout vient du générateur du modèle, lui-même adossé à Engine B
 * via `parametricShapeToTraceModel`. Elle n'invente aucune valeur par défaut non plus : les
 * défauts sont ceux publiés par le modèle (`TraceParameter.defaultValue`).
 *
 * Aucun repli silencieux (§3) : un `modelId` inconnu, des paramètres hors bornes ou un
 * générateur qui refuse ses entrées produisent un état explicite, jamais un autre modèle.
 *
 * Exception documentée : les 6 slugs de l'assistant « nouveau tracé » d'avant ce lot
 * (`cercle-division`, `rosace`…) sont des anciens noms des MÊMES modèles. Ils sont traduits
 * par `LEGACY_MODEL_ID_ALIASES` et la traduction est signalée en `warning` — ce n'est pas un
 * repli vers un autre modèle, c'est un renommage assumé et visible.
 */

import {
  findTraceModelDescriptor,
  traceModelDefaults,
  type TraceModelDescriptor,
} from "../geometry/models/catalog";
import type { TraceModel, TraceParameter } from "../geometry/trace-model";
import type { TracingProject } from "./project";

/** Écart relatif toléré sur l'alignement d'une valeur sur le pas du paramètre. */
const STEP_EPSILON = 1e-6;

export type ModelResolutionWarning =
  | { kind: "legacy-model-id"; from: string; to: string; message: string }
  | { kind: "unknown-parameter"; parameterId: string; message: string };

export type ParameterIssue = { parameterId: string; message: string };

export type ResolvedTracingModel = {
  status: "resolved";
  slug: string;
  label: string;
  /** Contrat de paramètres du modèle, pour l'affichage d'un formulaire. */
  parameters: readonly TraceParameter[];
  /** Défauts publiés par le modèle. */
  defaults: Record<string, number>;
  /** Surcharges réellement portées par le projet (sous-ensemble de `defaults`). */
  overrides: Record<string, number>;
  /** Valeurs effectives passées au générateur : `defaults` complétés par `overrides`. */
  params: Record<string, number>;
  /** Géométrie résolue — `TraceModel` produit par Engine B. Source de vérité unique. */
  model: TraceModel;
  warnings: ModelResolutionWarning[];
};

export type TracingModelResolution =
  | ResolvedTracingModel
  /** `modelId` absent — « décider plus tard » est un choix valide (§3). */
  | { status: "none" }
  | { status: "unknown-model"; modelId: string; message: string }
  | { status: "invalid-params"; slug: string; label: string; message: string; issues: ParameterIssue[] }
  /** Le générateur a refusé des entrées pourtant dans les bornes déclarées. */
  | { status: "failed"; slug: string; label: string; message: string };

/**
 * Anciens slugs de `lib/tracing/atelier-models.ts` (avant ce lot) → slugs du registre.
 * `trace-libre` n'a jamais désigné un modèle : il signifiait « composer à la main », ce que
 * l'absence de `modelId` exprime déjà — il se résout donc en `none`, pas en un modèle.
 */
export const LEGACY_MODEL_ID_ALIASES: Readonly<Record<string, string | null>> = {
  "trace-libre": null,
  "cercle-division": "circle-division",
  rosace: "rosette-6",
  etoile: "star-5",
  "arche-plein-cintre": "arch-full-round",
  ogive: "ogive-equilateral",
  ellipse: "ellipse-pedagogical",
};

const LEGACY_BY_ID: ReadonlyMap<string, string | null> = new Map(Object.entries(LEGACY_MODEL_ID_ALIASES));

/** Valeur alignée sur `step` à partir de `min` (ou de 0) — tolérance relative, pas d'arrondi. */
function isOnStep(value: number, parameter: TraceParameter): boolean {
  if (parameter.step === undefined) return true;
  const base = parameter.min ?? 0;
  const ratio = (value - base) / parameter.step;
  return Math.abs(ratio - Math.round(ratio)) <= STEP_EPSILON * Math.max(1, Math.abs(ratio));
}

function describeParameter(parameter: TraceParameter): string {
  const bounds: string[] = [];
  if (parameter.min !== undefined) bounds.push(`min ${parameter.min}`);
  if (parameter.max !== undefined) bounds.push(`max ${parameter.max}`);
  if (parameter.step !== undefined) bounds.push(`pas ${parameter.step}`);
  return bounds.length ? ` (${bounds.join(", ")})` : "";
}

export type NormalisedParameters = {
  defaults: Record<string, number>;
  overrides: Record<string, number>;
  params: Record<string, number>;
  issues: ParameterIssue[];
  warnings: ModelResolutionWarning[];
};

/**
 * §4 — normalisation des paramètres : défauts du modèle, surcharges projet par-dessus,
 * validation contre les bornes déclarées. Aucune valeur n'est corrigée ni bornée en
 * silence : hors limites ⇒ `issues`, jamais un `clamp`.
 */
export function normaliseModelParameters(
  descriptor: TraceModelDescriptor,
  raw: Readonly<Record<string, number>> | undefined,
): NormalisedParameters {
  const defaults = traceModelDefaults(descriptor);
  const overrides: Record<string, number> = {};
  const params: Record<string, number> = { ...defaults };
  const issues: ParameterIssue[] = [];
  const warnings: ModelResolutionWarning[] = [];

  const known = new Set(descriptor.parameters.map((parameter) => parameter.id));
  for (const key of Object.keys(raw ?? {})) {
    if (!known.has(key)) {
      warnings.push({
        kind: "unknown-parameter",
        parameterId: key,
        message: `Le paramètre « ${key} » n'existe pas sur le modèle « ${descriptor.label} » : il est ignoré.`,
      });
    }
  }

  for (const parameter of descriptor.parameters) {
    const supplied = raw?.[parameter.id];
    if (supplied === undefined) continue;
    if (typeof supplied !== "number" || !Number.isFinite(supplied)) {
      issues.push({ parameterId: parameter.id, message: `${parameter.label} doit être un nombre.` });
      continue;
    }
    if (parameter.min !== undefined && supplied < parameter.min) {
      issues.push({ parameterId: parameter.id, message: `${parameter.label} est en dessous du minimum${describeParameter(parameter)}.` });
      continue;
    }
    if (parameter.max !== undefined && supplied > parameter.max) {
      issues.push({ parameterId: parameter.id, message: `${parameter.label} dépasse le maximum${describeParameter(parameter)}.` });
      continue;
    }
    if (!isOnStep(supplied, parameter)) {
      issues.push({ parameterId: parameter.id, message: `${parameter.label} ne tombe pas sur un pas valide${describeParameter(parameter)}.` });
      continue;
    }
    overrides[parameter.id] = supplied;
    params[parameter.id] = supplied;
  }

  return { defaults, overrides, params, issues, warnings };
}

/** Résout un `modelId` brut (alias hérités compris) vers un descripteur du registre. */
function resolveDescriptor(
  modelId: string,
): { descriptor: TraceModelDescriptor; warnings: ModelResolutionWarning[] } | { none: true } | undefined {
  const direct = findTraceModelDescriptor(modelId);
  if (direct) return { descriptor: direct, warnings: [] };

  if (LEGACY_BY_ID.has(modelId)) {
    const target = LEGACY_BY_ID.get(modelId) ?? null;
    if (target === null) return { none: true };
    const descriptor = findTraceModelDescriptor(target);
    if (!descriptor) return undefined;
    return {
      descriptor,
      warnings: [
        {
          kind: "legacy-model-id",
          from: modelId,
          to: target,
          message: `Ce tracé référence l'ancien nom « ${modelId} » du modèle « ${descriptor.label} » (${target}).`,
        },
      ],
    };
  }
  return undefined;
}

/**
 * Point d'entrée du lot. Ne consomme que `modelId` et `modelParams` du projet : rien
 * d'autre du `TracingProject` n'influence la géométrie du modèle.
 */
export function resolveTracingProjectModel(
  project: Pick<TracingProject, "modelId" | "modelParams">,
): TracingModelResolution {
  const modelId = project.modelId;
  if (!modelId) return { status: "none" };

  const found = resolveDescriptor(modelId);
  if (!found) {
    return {
      status: "unknown-model",
      modelId,
      message: `Le modèle « ${modelId} » n'existe pas dans la bibliothèque de tracés de cette version.`,
    };
  }
  if ("none" in found) return { status: "none" };

  const { descriptor, warnings: aliasWarnings } = found;
  const normalised = normaliseModelParameters(descriptor, project.modelParams);
  if (normalised.issues.length) {
    return {
      status: "invalid-params",
      slug: descriptor.slug,
      label: descriptor.label,
      message: `Les paramètres enregistrés pour « ${descriptor.label} » sont hors limites.`,
      issues: normalised.issues,
    };
  }

  let model: TraceModel;
  try {
    model = descriptor.build(normalised.params);
  } catch (cause) {
    return {
      status: "failed",
      slug: descriptor.slug,
      label: descriptor.label,
      message: cause instanceof Error ? cause.message : `Le modèle « ${descriptor.label} » n'a pas pu être calculé.`,
    };
  }

  return {
    status: "resolved",
    slug: descriptor.slug,
    label: descriptor.label,
    parameters: descriptor.parameters,
    defaults: normalised.defaults,
    overrides: normalised.overrides,
    params: normalised.params,
    model,
    warnings: [...aliasWarnings, ...normalised.warnings],
  };
}

/**
 * Libellé du modèle sans calculer sa géométrie — pour les listes et les en-têtes. Suit les
 * mêmes alias hérités que la résolution complète, afin qu'un ancien tracé n'apparaisse pas
 * « sans modèle » dans la liste alors qu'il en a un.
 */
export function traceModelLabelFor(modelId: string | undefined | null): string | null {
  if (!modelId) return null;
  const found = resolveDescriptor(modelId);
  if (!found || "none" in found) return null;
  return found.descriptor.label;
}

/** Message court prêt pour l'UI — jamais un écran blanc, jamais une exception non gérée (§10). */
export function describeModelResolution(resolution: TracingModelResolution): string | null {
  switch (resolution.status) {
    case "resolved":
      return null;
    case "none":
      return "Aucun modèle n'est associé à ce tracé.";
    case "unknown-model":
    case "failed":
      return resolution.message;
    case "invalid-params":
      return `${resolution.message} ${resolution.issues.map((issue) => issue.message).join(" ")}`.trim();
  }
}
