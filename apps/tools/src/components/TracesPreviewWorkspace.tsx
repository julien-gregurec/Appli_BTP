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
import { TRACE_MODEL_CATALOG, TRACE_MODEL_SLUGS, traceModelDefaults, type TraceModelSlug } from "@/lib/geometry/models/catalog";
import type { TraceModel, TraceParameter } from "@/lib/geometry/trace-model";

// ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §2 : la table modèle → paramètres → générateur vivait
// ici, dans un composant React, donc hors de portée de l'Atelier, de l'export et des tests.
// Elle est remontée dans `lib/geometry/models/catalog.ts` ; cette page la consomme.
type ModelKey = TraceModelSlug;
type ModelDefinition = { label: string; group: "Fondamentaux" | "Décoratifs"; parameters: readonly TraceParameter[]; build: (values: Record<string, number>) => TraceModel };

const GROUP_LABELS: Record<"fondamentaux" | "decoratifs", ModelDefinition["group"]> = { fondamentaux: "Fondamentaux", decoratifs: "Décoratifs" };

const MODEL_DEFINITIONS: Record<ModelKey, ModelDefinition> = Object.fromEntries(
  TRACE_MODEL_SLUGS.map((slug) => {
    const descriptor = TRACE_MODEL_CATALOG[slug];
    return [slug, { label: descriptor.label, group: GROUP_LABELS[descriptor.group], parameters: descriptor.parameters, build: descriptor.build }];
  }),
) as Record<ModelKey, ModelDefinition>;

const MODEL_KEYS = Object.keys(MODEL_DEFINITIONS) as ModelKey[];
const GROUPS: ModelDefinition["group"][] = ["Fondamentaux", "Décoratifs"];

function defaultValues(key: ModelKey): Record<string, number> {
  return traceModelDefaults(TRACE_MODEL_CATALOG[key]);
}

export function TracesPreviewWorkspace() {
  const [modelKey, setModelKey] = useState<ModelKey>("circle-division");
  const [valuesByModel, setValuesByModel] = useState<Record<ModelKey, Record<string, number>>>(() =>
    Object.fromEntries(MODEL_KEYS.map((key) => [key, defaultValues(key)])) as Record<ModelKey, Record<string, number>>,
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
