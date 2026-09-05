"use client";

// Page interne de démonstration du futur module "Tracés & Géométrie" (FIRST-FUNCTIONAL-LOT-V1
// §13, étendue en FUNDAMENTAL-MODELS-V1 puis DECORATIVE-FAMILIES-V1 §18 à 13 modèles répartis en
// FONDAMENTAUX / DÉCORATIFS). Non commerciale, non cataloguée (catalog.ts n'y fait aucune
// référence), robots noindex (voir page.tsx). Prouve le flux complet : paramètres utilisateur ->
// calcul géométrique -> TraceModel -> rendu vectoriel -> couches -> pas-à-pas -> mode chantier.
//
// Sélecteur en <select> natif avec <optgroup> : reste lisible sur mobile même à 13 entrées,
// aucune grosse navigation ajoutée (§18).
import { useMemo, useState } from "react";
import { TraceViewer } from "./TraceViewer";
import { TraceSteps } from "./TraceSteps";
import { SiteMode } from "./SiteMode";
import { TraceParametersForm } from "./TraceParametersForm";
import { circleDivisionParameters, createCircleDivisionGeometry } from "@/lib/geometry/models/circle-division";
import { createStarGeometry, starParameters } from "@/lib/geometry/models/star";
import { createRosetteGeometry, rosetteParameters } from "@/lib/geometry/models/rosette";
import { createHeartGeometry, heartParameters } from "@/lib/geometry/models/heart";
import { archFullRoundParameters, createArchFullRoundGeometry } from "@/lib/geometry/models/arch-full-round";
import { createOgiveGeometry, ogiveParameters } from "@/lib/geometry/models/ogive";
import { createEllipsePedagogicalGeometry, ellipsePedagogicalParameters } from "@/lib/geometry/models/ellipse-pedagogical";
import { createSpiralGeometry, spiralParameters } from "@/lib/geometry/models/spiral";
import { createFlower4Geometry, flower4Parameters } from "@/lib/geometry/models/flower4";
import { createFlower5Geometry, flower5Parameters } from "@/lib/geometry/models/flower5";
import { createFlower6ElongatedGeometry, flower6ElongatedParameters } from "@/lib/geometry/models/flower6-elongated";
import { createTurbineGeometry, turbineParameters } from "@/lib/geometry/models/turbine";
import { createDoubleSGeometry, doubleSParameters } from "@/lib/geometry/models/double-s";
import type { TraceModel, TraceParameter } from "@/lib/geometry/trace-model";

type ModelKey =
  | "circle-division" | "star-5" | "rosette-6" | "heart" | "arch-full-round" | "ogive-equilateral" | "ellipse-pedagogical" | "spiral-archimedes"
  | "flower-4" | "flower-5" | "flower-6-elongated" | "turbine" | "double-s";

type ModelDefinition = { label: string; group: "Fondamentaux" | "Décoratifs"; parameters: readonly TraceParameter[]; build: (values: Record<string, number>) => TraceModel };

const MODEL_DEFINITIONS: Record<ModelKey, ModelDefinition> = {
  "circle-division": { label: "Cercle divisé", group: "Fondamentaux", parameters: circleDivisionParameters, build: (v) => createCircleDivisionGeometry({ diameter: v.diameter, divisions: v.divisions, startAngle: v.startAngle }) },
  "star-5": { label: "Étoile 5 branches", group: "Fondamentaux", parameters: starParameters, build: (v) => createStarGeometry({ outerDiameter: v.outerDiameter, innerRatio: v.innerRatio, rotation: v.rotation }) },
  "rosette-6": { label: "Rosace 6 pétales simple", group: "Fondamentaux", parameters: rosetteParameters, build: (v) => createRosetteGeometry({ diameter: v.diameter, rotation: v.rotation }) },
  heart: { label: "Cœur géométrique", group: "Fondamentaux", parameters: heartParameters, build: (v) => createHeartGeometry({ width: v.width, height: v.height }) },
  "arch-full-round": { label: "Arche plein cintre", group: "Fondamentaux", parameters: archFullRoundParameters, build: (v) => createArchFullRoundGeometry({ width: v.width }) },
  "ogive-equilateral": { label: "Ogive équilatérale à deux centres", group: "Fondamentaux", parameters: ogiveParameters, build: (v) => createOgiveGeometry({ width: v.width }) },
  "ellipse-pedagogical": { label: "Ellipse pédagogique", group: "Fondamentaux", parameters: ellipsePedagogicalParameters, build: (v) => createEllipsePedagogicalGeometry({ width: v.width, height: v.height }) },
  "spiral-archimedes": { label: "Spirale d'Archimède", group: "Fondamentaux", parameters: spiralParameters, build: (v) => createSpiralGeometry({ startRadius: v.startRadius, endRadius: v.endRadius, turns: v.turns, rotation: v.rotation }) },
  "flower-4": { label: "Fleur 4 pétales", group: "Décoratifs", parameters: flower4Parameters, build: (v) => createFlower4Geometry({ diameter: v.diameter, rotation: v.rotation }) },
  "flower-5": { label: "Fleur 5 pétales", group: "Décoratifs", parameters: flower5Parameters, build: (v) => createFlower5Geometry({ diameter: v.diameter, rotation: v.rotation }) },
  "flower-6-elongated": { label: "Fleur 6 pétales allongés", group: "Décoratifs", parameters: flower6ElongatedParameters, build: (v) => createFlower6ElongatedGeometry({ diameter: v.diameter, rotation: v.rotation }) },
  turbine: { label: "Rosace tournante (turbine)", group: "Décoratifs", parameters: turbineParameters, build: (v) => createTurbineGeometry({ diameter: v.diameter, branches: v.branches, twist: v.twist, rotation: v.rotation }) },
  "double-s": { label: "Composition double-S", group: "Décoratifs", parameters: doubleSParameters, build: (v) => createDoubleSGeometry({ width: v.width, height: v.height, waistRatio: v.waistRatio }) },
};

const MODEL_KEYS = Object.keys(MODEL_DEFINITIONS) as ModelKey[];
const GROUPS: ModelDefinition["group"][] = ["Fondamentaux", "Décoratifs"];

function defaultValues(parameters: readonly TraceParameter[]): Record<string, number> {
  return Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
}

export function TracesPreviewWorkspace() {
  const [modelKey, setModelKey] = useState<ModelKey>("circle-division");
  const [valuesByModel, setValuesByModel] = useState<Record<ModelKey, Record<string, number>>>(() =>
    Object.fromEntries(MODEL_KEYS.map((key) => [key, defaultValues(MODEL_DEFINITIONS[key].parameters)])) as Record<ModelKey, Record<string, number>>,
  );
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [view, setView] = useState<"steps" | "site">("steps");

  const definition = MODEL_DEFINITIONS[modelKey];
  const values = valuesByModel[modelKey];

  const result = useMemo((): { model: TraceModel } | { error: string } => {
    try {
      return { model: definition.build(values) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Paramètres invalides." };
    }
  }, [definition, values]);

  function updateValue(id: string, value: number) {
    setValuesByModel((current) => ({ ...current, [modelKey]: { ...current[modelKey], [id]: value } }));
    setStepIndex(null);
  }

  function selectModel(next: ModelKey) {
    setModelKey(next);
    setStepIndex(null);
  }

  const activeStep = "model" in result && stepIndex !== null ? result.model.steps[Math.min(stepIndex, result.model.steps.length - 1)] ?? null : null;

  return (
    <main className="traces-preview">
      <header className="traces-preview-header">
        <p className="eyebrow">INTERNE · NON PUBLIÉ</p>
        <h1>Prévisualisation technique — Tracés &amp; Géométrie</h1>
        <p>Page de travail non commerciale : ces {MODEL_KEYS.length} modèles ne sont pas dans le catalogue public.</p>
      </header>

      <label className="traces-preview-model-select">
        <span>Modèle ({definition.group})</span>
        <select value={modelKey} onChange={(event) => selectModel(event.target.value as ModelKey)} aria-label="Choisir un modèle">
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {MODEL_KEYS.filter((key) => MODEL_DEFINITIONS[key].group === group).map((key) => (
                <option key={key} value={key}>{MODEL_DEFINITIONS[key].label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="traces-preview-body">
        <section className="traces-preview-parameters" aria-label="Paramètres">
          <TraceParametersForm parameters={definition.parameters} values={values} onChange={updateValue} />
        </section>

        {"error" in result ? (
          <p className="traces-preview-error" role="alert">{result.error}</p>
        ) : (
          <>
            <section aria-label="Rendu vectoriel">
              <TraceViewer model={result.model} activeStep={activeStep} />
            </section>

            <div className="traces-preview-view-toggle" role="group" aria-label="Vue">
              <button type="button" aria-pressed={view === "steps"} className={view === "steps" ? "active" : ""} onClick={() => setView("steps")}>Étape par étape</button>
              <button type="button" aria-pressed={view === "site"} className={view === "site" ? "active" : ""} onClick={() => setView("site")}>Mode chantier</button>
            </div>

            {view === "steps" ? (
              <TraceSteps steps={result.model.steps} activeIndex={stepIndex} onChangeIndex={setStepIndex} />
            ) : (
              <SiteMode steps={result.model.steps} activeIndex={stepIndex ?? 0} onChangeIndex={setStepIndex} />
            )}

            {result.model.explanation && (
              <section className="traces-preview-explanation" aria-label="Explication">
                <h2>Explication</h2>
                {result.model.explanation.objective && <p><strong>Objectif :</strong> {result.model.explanation.objective}</p>}
                {result.model.explanation.principle && <p><strong>Principe :</strong> {result.model.explanation.principle}</p>}
                {result.model.explanation.finalCheck && <p><strong>Contrôle final :</strong> {result.model.explanation.finalCheck}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
