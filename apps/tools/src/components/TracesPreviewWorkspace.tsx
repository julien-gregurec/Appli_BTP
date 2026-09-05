"use client";

// Page interne de démonstration du futur module "Tracés & Géométrie" (FIRST-FUNCTIONAL-LOT-V1
// §13, étendue en FUNDAMENTAL-MODELS-V1 §20-21 à 8 modèles). Non commerciale, non cataloguée
// (catalog.ts n'y fait aucune référence), robots noindex (voir page.tsx). Prouve le flux
// complet : paramètres utilisateur -> calcul géométrique -> TraceModel -> rendu vectoriel ->
// couches -> pas-à-pas -> mode chantier.
//
// Sélecteur en <select> natif plutôt qu'une rangée de 8 onglets (§21 : illisible sur mobile
// avec autant d'entrées) — pas de refonte de l'UI existante, juste le contrôle le plus simple et
// déjà accessible par défaut.
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
import type { TraceModel, TraceParameter } from "@/lib/geometry/trace-model";

type ModelKey = "circle-division" | "star-5" | "rosette-6" | "heart" | "arch-full-round" | "ogive-equilateral" | "ellipse-pedagogical" | "spiral-archimedes";

const MODEL_DEFINITIONS: Record<ModelKey, { label: string; parameters: readonly TraceParameter[]; build: (values: Record<string, number>) => TraceModel }> = {
  "circle-division": {
    label: "Cercle divisé",
    parameters: circleDivisionParameters,
    build: (values) => createCircleDivisionGeometry({ diameter: values.diameter, divisions: values.divisions, startAngle: values.startAngle }),
  },
  "star-5": {
    label: "Étoile 5 branches",
    parameters: starParameters,
    build: (values) => createStarGeometry({ outerDiameter: values.outerDiameter, innerRatio: values.innerRatio, rotation: values.rotation }),
  },
  "rosette-6": {
    label: "Rosace 6 pétales simple",
    parameters: rosetteParameters,
    build: (values) => createRosetteGeometry({ diameter: values.diameter, rotation: values.rotation }),
  },
  heart: {
    label: "Cœur géométrique",
    parameters: heartParameters,
    build: (values) => createHeartGeometry({ width: values.width, height: values.height }),
  },
  "arch-full-round": {
    label: "Arche plein cintre",
    parameters: archFullRoundParameters,
    build: (values) => createArchFullRoundGeometry({ width: values.width }),
  },
  "ogive-equilateral": {
    label: "Ogive simple à deux centres",
    parameters: ogiveParameters,
    build: (values) => createOgiveGeometry({ width: values.width }),
  },
  "ellipse-pedagogical": {
    label: "Ellipse pédagogique",
    parameters: ellipsePedagogicalParameters,
    build: (values) => createEllipsePedagogicalGeometry({ width: values.width, height: values.height }),
  },
  "spiral-archimedes": {
    label: "Spirale d'Archimède",
    parameters: spiralParameters,
    build: (values) => createSpiralGeometry({ startRadius: values.startRadius, endRadius: values.endRadius, turns: values.turns, rotation: values.rotation }),
  },
};

const MODEL_KEYS = Object.keys(MODEL_DEFINITIONS) as ModelKey[];

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
        <span>Modèle</span>
        <select value={modelKey} onChange={(event) => selectModel(event.target.value as ModelKey)} aria-label="Choisir un modèle">
          {MODEL_KEYS.map((key) => <option key={key} value={key}>{MODEL_DEFINITIONS[key].label}</option>)}
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
