"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TracingProjectError, type TracingProject, type TracingProjectType } from "@/lib/tracing/project";
import {
  TRACING_OUVRAGE_LABELS,
  TRACING_OUVRAGE_ORDER,
  buildTracingProjectFromInput,
  metresInputToMm,
  touchTracingProject,
} from "@/lib/tracing/atelier";
import { atelierModelsForType } from "@/lib/tracing/atelier-models";
import { resolveTracingProjectModel } from "@/lib/tracing/model-resolver";
import { findTraceModelDescriptor, traceModelDefaults } from "@/lib/geometry/models/catalog";
import { TraceParametersForm } from "./TraceParametersForm";
import { ModelResolutionCard } from "@/components/atelier/model/ModelResolutionCard";
import { ResolvedModelViewport } from "@/components/atelier/viewport";
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import { useAccount } from "./AccountProvider";
import { Brand } from "./HomeDashboard";

type Step = "type" | "infos" | "modele" | "parametres" | "photo" | "done";
const STEP_ORDER: readonly Step[] = ["type", "infos", "modele", "parametres", "photo"];
const LATER = "__later__";

/**
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §4 — n'enregistrer que ce que l'utilisateur a
 * réellement changé. Les défauts restent publiés par le modèle et ne sont jamais recopiés
 * dans le projet : `modelParams` ne porte que les écarts.
 */
function overridesOnly(values: Readonly<Record<string, number>>, defaults: Readonly<Record<string, number>>): Record<string, number> | undefined {
  const overrides: Record<string, number> = {};
  for (const [id, value] of Object.entries(values)) {
    if (defaults[id] !== value) overrides[id] = value;
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

export function NouveauTraceWorkspace() {
  const router = useRouter();
  const { activeCompany } = useAccount();
  const persistence = useAtelierPersistence(activeCompany?.id ?? null);
  const { ready, available, repository, scheduleAutosave, markClosed } = persistence;

  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<TracingProjectType | null>(null);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [project, setProject] = useState<TracingProject | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  // Reprise d'un tracé existant (?reprendre=<id>) — on saute à l'étape « modèle ».
  useEffect(() => {
    if (!available || !repository || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("reprendre");
    if (!id) return;
    let cancelled = false;
    void repository
      .get(id)
      .then((found) => {
        if (cancelled || !found) return;
        setProject(found);
        setType(found.type);
        setName(found.name);
        // Reprise : repartir des réglages déjà enregistrés, complétés par les défauts du
        // modèle — jamais d'un jeu de valeurs recréé ici (§4).
        const known = findTraceModelDescriptor(found.modelId);
        setParamValues(known ? { ...traceModelDefaults(known), ...(found.modelParams ?? {}) } : {});
        setStep("modele");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [available, repository]);

  const models = useMemo(() => (type ? atelierModelsForType(type) : []), [type]);

  // Descripteur et résolution du modèle en cours de réglage — le composant ne calcule
  // aucune géométrie lui-même : il interroge le résolveur (§2).
  const modelId = project?.modelId;
  const descriptor = useMemo(() => findTraceModelDescriptor(modelId), [modelId]);
  const previewResolution = useMemo(
    () => (modelId ? resolveTracingProjectModel({ modelId, modelParams: paramValues }) : null),
    [modelId, paramValues],
  );

  const createProject = useCallback(async () => {
    if (!type || !repository) return;
    setFeedback("");
    let roomWidthMm: number | undefined;
    let roomHeightMm: number | undefined;
    try {
      roomWidthMm = metresInputToMm(width);
      roomHeightMm = metresInputToMm(height);
    } catch (cause) {
      setFeedback(cause instanceof TracingProjectError ? cause.message : "Dimensions de pièce invalides.");
      return;
    }
    if (!name.trim()) {
      setFeedback("Le nom du tracé est obligatoire.");
      return;
    }
    setBusy(true);
    try {
      const draft = buildTracingProjectFromInput({ type, name, roomWidthMm, roomHeightMm });
      const created = await repository.create(draft);
      setProject(created);
      setStep("modele");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Création du tracé impossible.");
    } finally {
      setBusy(false);
    }
  }, [type, repository, width, height, name]);

  const chooseModel = useCallback(
    (modelId: string | null) => {
      if (!project) return;
      // Changer de modèle invalide les surcharges de l'ancien : on repart de ses défauts
      // plutôt que de transporter des paramètres qui n'ont plus de sens (§4).
      const next = touchTracingProject(project, { modelId: modelId ?? undefined, modelParams: undefined });
      setProject(next);
      scheduleAutosave(next);
      const chosen = findTraceModelDescriptor(modelId);
      if (!chosen) {
        setParamValues({});
        setStep("photo");
        return;
      }
      setParamValues(traceModelDefaults(chosen));
      setStep("parametres");
    },
    [project, scheduleAutosave],
  );

  const confirmParameters = useCallback(() => {
    if (!project || !descriptor) return;
    if (previewResolution && previewResolution.status !== "resolved") {
      setFeedback("Corrigez les paramètres avant de continuer.");
      return;
    }
    setFeedback("");
    const next = touchTracingProject(project, { modelParams: overridesOnly(paramValues, traceModelDefaults(descriptor)) });
    setProject(next);
    scheduleAutosave(next);
    setStep("photo");
  }, [project, descriptor, previewResolution, paramValues, scheduleAutosave]);

  const choosePhoto = useCallback(
    async (startFromPhoto: boolean) => {
      if (!project) return;
      setBusy(true);
      const next = touchTracingProject(project, { startFromPhoto });
      setProject(next);
      try {
        await markClosed(next);
      } finally {
        setBusy(false);
      }
      setStep("done");
    },
    [project, markClosed],
  );

  const activeIndex = STEP_ORDER.indexOf(step === "done" ? "photo" : step);

  return (
    <main className="atelier-page">
      <header className="calculator-header shell">
        <Brand />
        <Link href="/atelier" className="all-tools">
          Atelier <span>×</span>
        </Link>
      </header>

      <section className="atelier-hero">
        <div className="shell">
          <p className="eyebrow">NOUVEAU TRACÉ</p>
          <h1>Décrire l’ouvrage</h1>
          <p>Trois étapes rapides. Le tracé est créé et sauvegardé dès l’étape 2.</p>
          <div className="atelier-steps" aria-hidden="true">
            {STEP_ORDER.map((label, index) => (
              <span key={label} className={index <= activeIndex ? "on" : ""} />
            ))}
          </div>
        </div>
      </section>

      <section className="shell atelier-wizard">
        {!ready && <p className="atelier-feedback" aria-live="polite">Chargement…</p>}
        {ready && !available && (
          <p className="atelier-feedback">Le stockage local est indisponible : impossible de créer un tracé ici.</p>
        )}

        {available && step === "type" && (
          <>
            <h2>Type d’ouvrage</h2>
            <p className="hint">Sur quoi porte ce tracé ?</p>
            <div className="atelier-choices">
              {TRACING_OUVRAGE_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`atelier-choice ${type === value ? "on" : ""}`}
                  onClick={() => {
                    setType(value);
                    setStep("infos");
                  }}
                >
                  <b>{TRACING_OUVRAGE_LABELS[value]}</b>
                </button>
              ))}
            </div>
          </>
        )}

        {available && step === "infos" && (
          <>
            <h2>{type ? TRACING_OUVRAGE_LABELS[type] : "Ouvrage"} — informations</h2>
            <p className="hint">Le nom est obligatoire. Les dimensions de la pièce sont facultatives (en mètres).</p>
            <div className="atelier-fields">
              <label>
                Nom du tracé
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Plafond séjour"
                  maxLength={100}
                  autoFocus
                />
              </label>
              <label>
                Largeur de la pièce (m)
                <input
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                  inputMode="decimal"
                  placeholder="ex. 5"
                />
              </label>
              <label>
                Hauteur ou longueur de la pièce (m)
                <input
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  inputMode="decimal"
                  placeholder="ex. 4"
                />
              </label>
            </div>
            <p className="atelier-feedback">{feedback}</p>
            <div className="atelier-nav">
              <button type="button" onClick={() => setStep("type")}>
                Retour
              </button>
              <button type="button" className="primary" onClick={() => void createProject()} disabled={busy}>
                Continuer
              </button>
            </div>
          </>
        )}

        {available && step === "modele" && project && (
          <>
            <h2>Modèle de départ</h2>
            <p className="hint">Choisissez un modèle ou décidez plus tard. Il pourra changer ensuite.</p>
            <div className="atelier-choices">
              {models.map((model) => (
                <button
                  key={model.modelId}
                  type="button"
                  className={`atelier-choice ${project.modelId === model.modelId ? "on" : ""}`}
                  onClick={() => chooseModel(model.modelId)}
                >
                  <b>{model.label}</b>
                  <small>{model.description}</small>
                </button>
              ))}
              <button
                key={LATER}
                type="button"
                className={`atelier-choice ${project.modelId ? "" : "on"}`}
                onClick={() => chooseModel(null)}
              >
                <b>Décider plus tard</b>
                <small>Commencer sans modèle imposé.</small>
              </button>
            </div>
          </>
        )}

        {available && step === "parametres" && project && descriptor && (
          <>
            <h2>Réglages du modèle</h2>
            <p className="hint">
              Les valeurs proposées sont celles du modèle. Ajustez-les si besoin : seules vos modifications sont
              enregistrées, la géométrie reste calculée par le moteur.
            </p>
            <TraceParametersForm
              parameters={descriptor.parameters}
              values={paramValues}
              onChange={(id, value) => setParamValues((current) => ({ ...current, [id]: value }))}
            />
            {/*
              ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §5 — le plan suit les réglages en
              direct. La résolution est celle déjà calculée ci-dessus (`previewResolution`) :
              aucun second appel au moteur, et le zoom/pan survit aux frappes puisque la vue
              est identifiée par le projet et le modèle, pas par les bornes de la géométrie.
            */}
            {previewResolution && <ResolvedModelViewport resolution={previewResolution} projectId={project.id} />}
            {previewResolution && <ModelResolutionCard resolution={previewResolution} />}
            <p className="atelier-feedback">{feedback}</p>
            <div className="atelier-nav">
              <button type="button" onClick={() => setStep("modele")}>
                Retour
              </button>
              <button type="button" onClick={() => setParamValues(traceModelDefaults(descriptor))}>
                Valeurs du modèle
              </button>
              <button type="button" className="primary" onClick={confirmParameters}>
                Continuer
              </button>
            </div>
          </>
        )}

        {available && step === "photo" && project && (
          <>
            <h2>Partir d’une photo ?</h2>
            <p className="hint">
              L’import de photo, le cadrage et la calibration arriveront dans une prochaine version. Pour l’instant, on
              enregistre seulement votre intention.
            </p>
            <div className="atelier-yesno">
              <button
                type="button"
                className={project.startFromPhoto ? "on" : ""}
                onClick={() => void choosePhoto(true)}
                disabled={busy}
              >
                Oui
              </button>
              <button type="button" onClick={() => void choosePhoto(false)} disabled={busy}>
                Non
              </button>
            </div>
            <div className="atelier-nav">
              <button type="button" onClick={() => setStep(project.modelId ? "parametres" : "modele")}>
                Retour
              </button>
            </div>
          </>
        )}

        {step === "done" && project && (
          <>
            <h2>Tracé créé</h2>
            <p className="hint">« {project.name} » est enregistré sur cet appareil.</p>
            <div className="atelier-nav">
              <button type="button" className="primary" onClick={() => router.push("/atelier")}>
                Retour à l’Atelier
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
