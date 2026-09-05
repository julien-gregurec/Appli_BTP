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
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import { useAccount } from "./AccountProvider";
import { Brand } from "./HomeDashboard";

type Step = "type" | "infos" | "modele" | "photo" | "done";
const STEP_ORDER: readonly Step[] = ["type", "infos", "modele", "photo"];
const LATER = "__later__";

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
        setStep("modele");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [available, repository]);

  const models = useMemo(() => (type ? atelierModelsForType(type) : []), [type]);

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
      const next = touchTracingProject(project, { modelId: modelId ?? undefined });
      setProject(next);
      scheduleAutosave(next);
      setStep("photo");
    },
    [project, scheduleAutosave],
  );

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
              <button type="button" onClick={() => setStep("modele")}>
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
