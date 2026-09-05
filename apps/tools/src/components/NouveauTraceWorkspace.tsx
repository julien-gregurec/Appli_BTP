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
  modelParamsAfterModelChoice,
  touchTracingProject,
} from "@/lib/tracing/atelier";
import { atelierModelsForType } from "@/lib/tracing/atelier-models";
import { resolveTracingProjectModel } from "@/lib/tracing/model-resolver";
import { findTraceModelDescriptor } from "@/lib/geometry/models/catalog";
import { buildEditableHandles } from "@/lib/tracing/handle-map";
import { useModelEditing } from "@/lib/tracing/use-model-editing";
import { useUndoRedoShortcuts } from "@/lib/tracing/use-undo-redo-shortcuts";
import type { ParamOverrides } from "@/lib/tracing/param-history";
import { TraceParametersForm } from "./TraceParametersForm";
import { ModelResolutionCard } from "@/components/atelier/model/ModelResolutionCard";
import { ResolvedModelViewport, type AtelierEditingApi } from "@/components/atelier/viewport";
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import { useAccount } from "./AccountProvider";
import { Brand } from "./HomeDashboard";

type Step = "type" | "infos" | "modele" | "parametres" | "photo" | "done";
const STEP_ORDER: readonly Step[] = ["type", "infos", "modele", "parametres", "photo"];
const LATER = "__later__";

/*
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §9/§10 — l'ancien `overridesOnly` local a disparu : le
 * calcul des surcharges vit désormais dans `lib/tracing/param-history.ts`, avec l'historique
 * qui s'en sert. Une seule définition de « ce qui est enregistré », partagée par le
 * formulaire, les poignées, l'annulation et l'autosave.
 */

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
        // Reprise : `useModelEditing` s'amorce lui-même sur `modelParams`, complété par les
        // défauts du modèle. Rien à recopier ici — c'était la seconde source de vérité qui
        // pouvait diverger du formulaire (§10).
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

  /**
   * §9 — enregistrement d'une modification de réglage : projet remonté puis autosave. C'est
   * le SEUL chemin d'écriture, emprunté aussi bien par le formulaire que par une poignée ou
   * une annulation, ce qui garantit qu'aucune de ces voies ne peut oublier de sauvegarder.
   *
   * `flushAutosave`, la reprise IndexedDB et le schéma v3 sont intacts : on continue d'écrire
   * `modelParams` — le même champ, avec la même forme — via `touchTracingProject`, qui revalide
   * strictement le projet avant de le rendre.
   */
  const persistOverrides = useCallback(
    (overrides: ParamOverrides | undefined) => {
      setProject((current) => {
        if (!current) return current;
        const next = touchTracingProject(current, { modelParams: overrides });
        scheduleAutosave(next);
        return next;
      });
    },
    [scheduleAutosave],
  );

  const editingState = useModelEditing({
    descriptor,
    initialOverrides: project?.modelParams,
    // Changer de projet ou de modèle remet réglages ET historique à plat : annuler vers les
    // paramètres d'un autre modèle n'aurait aucun sens.
    modelKey: `${project?.id ?? "sans-projet"}::${descriptor?.slug ?? "sans-modele"}`,
    onPersist: persistOverrides,
  });
  const paramValues = editingState.values;

  const previewResolution = useMemo(
    () => (modelId ? resolveTracingProjectModel({ modelId, modelParams: paramValues }) : null),
    [modelId, paramValues],
  );

  /**
   * §1/§2 — poignées du modèle courant. Construites à partir de la résolution DÉJÀ calculée :
   * aucun second appel au moteur, et les positions sont lues dans la géométrie affichée, donc
   * exactement là où l'utilisateur les voit.
   */
  const handles = useMemo(() => {
    if (!descriptor || previewResolution?.status !== "resolved") return [];
    return buildEditableHandles(descriptor, previewResolution.params, previewResolution.model);
  }, [descriptor, previewResolution]);

  useUndoRedoShortcuts({ onUndo: editingState.undo, onRedo: editingState.redo, enabled: step === "parametres" });

  const editing = useMemo<AtelierEditingApi>(
    () => ({
      handles,
      onPreviewParams: editingState.previewValues,
      onCommitParams: (values, label, source) => editingState.commitValues(values, label, source),
      canUndo: editingState.canUndo,
      canRedo: editingState.canRedo,
      onUndo: editingState.undo,
      onRedo: editingState.redo,
    }),
    [handles, editingState],
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
      // Changer de modèle abandonne les surcharges de l'ancien ; re-choisir le même les
      // conserve — cf. `modelParamsAfterModelChoice`, qui porte la règle et son pourquoi.
      const next = touchTracingProject(project, {
        modelId: modelId ?? undefined,
        modelParams: modelParamsAfterModelChoice(project, modelId),
      });
      setProject(next);
      scheduleAutosave(next);
      // Sur un vrai changement de modèle, les valeurs repartent des défauts par le seul fait
      // que la clé d'identité change : `useModelEditing` se réinitialise, historique compris.
      setStep(findTraceModelDescriptor(modelId) ? "parametres" : "photo");
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
    // Plus rien à enregistrer ici : chaque réglage — au formulaire comme à la poignée — a déjà
    // été validé et confié à l'autosave au moment où il a été fait (§9). « Continuer » ne fait
    // donc qu'avancer d'étape, et quitter la page en cours de réglage ne perd plus rien.
    setStep("photo");
  }, [project, descriptor, previewResolution]);

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
              Les valeurs proposées sont celles du modèle. Ajustez-les au formulaire, ou passez le plan en mode
              Édition pour tirer directement un sommet réglable : les deux modifient les mêmes réglages, et tout est
              annulable (Ctrl+Z). Seules vos modifications sont enregistrées, la géométrie reste calculée par le
              moteur.
            </p>
            <TraceParametersForm
              parameters={descriptor.parameters}
              values={paramValues}
              onChange={(id, value, label) => editingState.setValueFromForm(id, value, label)}
            />
            {/*
              ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §5 — le plan suit les réglages en
              direct. La résolution est celle déjà calculée ci-dessus (`previewResolution`) :
              aucun second appel au moteur, et le zoom/pan survit aux frappes puisque la vue
              est identifiée par le projet et le modèle, pas par les bornes de la géométrie.
            */}
            {previewResolution && (
              <ResolvedModelViewport resolution={previewResolution} projectId={project.id} editing={editing} />
            )}
            {previewResolution && <ModelResolutionCard resolution={previewResolution} />}
            <p className="atelier-feedback" aria-live="polite">
              {editingState.announcement
                ? `${editingState.announcement.kind === "undo" ? "Annulé" : "Rétabli"} : ${editingState.announcement.label}`
                : feedback}
            </p>
            <div className="atelier-nav">
              <button type="button" onClick={() => setStep("modele")}>
                Retour
              </button>
              <button type="button" onClick={editingState.resetToDefaults}>
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
