"use client";

/**
 * TRACING-WORKSHOP-UI-V1 — l'ATELIER DE TRAÇAGE proprement dit.
 *
 * C'est l'écran de travail : on y ouvre un tracé enregistré, on règle son modèle, on lit sa
 * construction étape par étape, ses cotes et ses points de report, et on part de là vers
 * l'export chantier. Il complète l'assistant `/atelier/nouveau` (créer) et l'écran
 * `/atelier/export` (sortir) — il ne les remplace pas.
 *
 * Frontières tenues :
 *   - la géométrie vient d'Engine B via `resolveTracingProjectModel`, appelé UNE fois ici et
 *     partagé par le plan et tous les panneaux. Cet écran ne calcule aucune coordonnée, aucune
 *     cote, aucun point ;
 *   - ce qui est modifiable, ce sont les PARAMÈTRES du modèle. Aucune géométrie n'est éditée à
 *     la main : ni sommet déplacé, ni contour tracé — ces lots existent ailleurs ;
 *   - seuls les écarts aux défauts du modèle sont enregistrés (`modelParamOverrides`), par
 *     l'autosave déjà en place.
 *
 * Fonctions volontairement ABSENTES plutôt que simulées (§22 : aucun bouton mort) — le
 * positionnement du motif dans la pièce (§11), l'éclairage et les gorges LED (§18/§19) :
 * `TraceModel` ne porte ni transformation de placement ni luminaire, et les inventer ici
 * produirait un plan qui ne correspondrait pas à l'export.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { findTraceModelDescriptor, traceModelDefaults } from "@/lib/geometry/models/catalog";
import { modelParamOverrides, touchTracingProject, formatRoomDimensions, ouvrageLabel } from "@/lib/tracing/atelier";
import { resolveTracingProjectModel } from "@/lib/tracing/model-resolver";
import type { TracingProject } from "@/lib/tracing/project";
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import { AtelierViewportWorkspace, DEFAULT_TOOLBAR_STATE, atelierViewKey, type ToolbarState } from "@/components/atelier/viewport";
import { ModelResolutionCard } from "@/components/atelier/model/ModelResolutionCard";
import { buildModelResolutionViewModel } from "@/components/atelier/model/model-resolution-view-model";
import {
  DimensionsPanel,
  ExpertPanel,
  GridPanel,
  LayersPanel,
  ModeSwitcher,
  ReportPointsPanel,
  StepNavigator,
  WorkshopPanel,
  activeStep,
  canGoNext,
  canGoPrevious,
  createWorkshopState,
  dimensionGroups,
  exitStepByStep,
  isDimensionKindVisible,
  nextStep,
  previousStep,
  setWorkshopGridStep,
  setWorkshopMode,
  startStepByStep,
  stepCount,
  stepProgressLabel,
  toggleDimensionKind,
  toggleExpertMode,
  toggleWorkshopGrid,
  toggleWorkshopLayer,
  workshopScene,
  type WorkshopState,
} from "@/components/atelier/workshop";
import workshop from "@/components/atelier/workshop/workshop.module.css";
import { TraceParametersForm } from "./TraceParametersForm";
import { useAccount } from "./AccountProvider";
import { Brand } from "./HomeDashboard";

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; project: TracingProject };

export function AtelierTracerWorkspace() {
  const { activeCompany } = useAccount();
  const persistence = useAtelierPersistence(activeCompany?.id ?? null);
  const { ready, available, repository, scheduleAutosave, flushAutosave } = persistence;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [workshopState, setWorkshopState] = useState<WorkshopState>(() => createWorkshopState("forme"));
  const [toolbar, setToolbar] = useState<ToolbarState>({ ...DEFAULT_TOOLBAR_STATE, tool: "select" });
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Identifiant lu côté client (?projectId=<id>), comme /atelier/export : jamais un segment de
  // route dynamique, incompatible avec l'export statique natif (Capacitor).
  useEffect(() => {
    if (!available || !repository) return;
    let cancelled = false;
    void (async () => {
      const projectId = new URLSearchParams(window.location.search).get("projectId");
      if (!projectId) {
        if (!cancelled) setState({ status: "error", message: "Aucun tracé indiqué : ouvrez l’Atelier depuis la liste de vos tracés." });
        return;
      }
      try {
        // Une modification encore en attente d'écriture ne doit pas être écrasée par la lecture.
        await flushAutosave();
        const project = await repository.get(projectId);
        if (cancelled) return;
        if (!project) {
          setState({ status: "not-found" });
          return;
        }
        // Réglages effectifs = défauts publiés par le modèle, complétés par les écarts du projet.
        const descriptor = findTraceModelDescriptor(project.modelId);
        setParamValues(descriptor ? { ...traceModelDefaults(descriptor), ...(project.modelParams ?? {}) } : {});
        setState({ status: "ready", project });
      } catch (cause) {
        if (cancelled) return;
        setState({ status: "error", message: cause instanceof Error ? cause.message : "Chargement du tracé impossible." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available, repository, flushAutosave]);

  const project = state.status === "ready" ? state.project : null;
  const descriptor = useMemo(() => findTraceModelDescriptor(project?.modelId), [project?.modelId]);

  /**
   * Résolution unique, partagée par le plan, la carte d'état et tous les panneaux. La
   * recalculer par panneau donnerait autant de géométries potentiellement différentes.
   */
  const resolution = useMemo(
    () => (project ? resolveTracingProjectModel({ ...project, modelParams: paramValues }) : null),
    [project, paramValues],
  );
  const model = resolution?.status === "resolved" ? resolution.model : null;

  const scene = useMemo(() => (model ? workshopScene(model, workshopState) : null), [model, workshopState]);
  const step = useMemo(() => activeStep(model, workshopState), [model, workshopState]);
  const groups = useMemo(() => (model ? dimensionGroups(model) : []), [model]);

  /** Un réglage change la géométrie : la sélection précédente peut ne plus exister. */
  const onParameterChange = useCallback(
    (id: string, value: number) => {
      setSelectedEntityId(null);
      setParamValues((current) => {
        const next = { ...current, [id]: value };
        if (project && descriptor) {
          scheduleAutosave(
            touchTracingProject(project, { modelParams: modelParamOverrides(next, traceModelDefaults(descriptor)) }),
          );
        }
        return next;
      });
    },
    [project, descriptor, scheduleAutosave],
  );

  const resetParameters = useCallback(() => {
    if (!project || !descriptor) return;
    setSelectedEntityId(null);
    setParamValues(traceModelDefaults(descriptor));
    scheduleAutosave(touchTracingProject(project, { modelParams: undefined }));
  }, [project, descriptor, scheduleAutosave]);

  const roomLabel = project ? formatRoomDimensions(project.roomWidthMm, project.roomHeightMm) : null;
  const totalSteps = stepCount(model);
  const resolutionView = resolution ? buildModelResolutionViewModel(resolution) : null;

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
          <p className="eyebrow">ATELIER DE TRAÇAGE</p>
          <h1>{project ? project.name : "Atelier"}</h1>
          <p>
            {project
              ? [ouvrageLabel(project.type), roomLabel ? `pièce ${roomLabel}` : null].filter(Boolean).join(" · ")
              : "Ouvrez un tracé enregistré pour le régler, le lire pas à pas et le porter sur chantier."}
          </p>
        </div>
      </section>

      <section className="shell atelier-section">
        {!ready ? (
          <p className="atelier-feedback" aria-live="polite">
            Chargement…
          </p>
        ) : !available ? (
          <div className="atelier-empty">
            <span aria-hidden="true">◇</span>
            <h2>Stockage local indisponible</h2>
            <p>Cet environnement ne permet pas de retrouver vos tracés.</p>
          </div>
        ) : state.status === "loading" ? (
          <p className="atelier-feedback" aria-live="polite">
            Ouverture du tracé…
          </p>
        ) : state.status === "not-found" ? (
          <div className="atelier-empty">
            <span aria-hidden="true">◇</span>
            <h2>Tracé introuvable</h2>
            <p>Ce tracé n’existe plus sur cet appareil, ou l’adresse est incorrecte.</p>
            <Link href="/atelier" className="atelier-cta">
              Retour à l’Atelier
            </Link>
          </div>
        ) : state.status === "error" ? (
          <p className="atelier-feedback" role="alert">
            {state.message}
          </p>
        ) : (
          <div className={workshop.workshop}>
            <ModeSwitcher
              mode={workshopState.mode}
              onChange={(mode) => setWorkshopState((current) => setWorkshopMode(current, mode))}
            />

            {scene && model ? (
              <AtelierViewportWorkspace
                scene={scene}
                viewKey={atelierViewKey(project?.id, model.slug)}
                selectedEntityId={selectedEntityId}
                onSelectEntity={setSelectedEntityId}
                toolbarState={{ ...toolbar, gridVisible: workshopState.gridVisible }}
                onToolbarStateChange={(next) => {
                  // La grille appartient à l'état de l'Atelier : la barre et le panneau Grille
                  // commandent le même interrupteur, jamais deux états qui divergent.
                  setToolbar(next);
                  if (next.gridVisible !== workshopState.gridVisible) {
                    setWorkshopState((current) => toggleWorkshopGrid(current));
                  }
                }}
                gridStepMm={workshopState.gridStepMm}
                showDimensions={workshopState.layers.dimensions}
                showLabels={workshopState.layers.labels}
              />
            ) : (
              <div className="atelier-empty" role={resolutionView?.tone === "error" ? "alert" : undefined}>
                <span aria-hidden="true">◇</span>
                <h2>{resolutionView?.title ?? "Aucun modèle"}</h2>
                <p>{resolutionView?.message ?? "Ce tracé n’a pas encore de modèle."}</p>
                <Link href={`/atelier/nouveau?reprendre=${encodeURIComponent(project?.id ?? "")}`} className="atelier-cta">
                  Choisir un modèle
                </Link>
              </div>
            )}

            {model && (
              <WorkshopPanel
                title="Construction pas à pas"
                badge={totalSteps > 0 ? `${totalSteps} étapes` : undefined}
                defaultOpen={workshopState.stepIndex !== null}
              >
                <StepNavigator
                  step={step}
                  total={totalSteps}
                  progressLabel={stepProgressLabel(workshopState, model)}
                  canPrevious={canGoPrevious(workshopState)}
                  canNext={canGoNext(workshopState, model)}
                  onStart={() => setWorkshopState((current) => startStepByStep(current, model))}
                  onPrevious={() => setWorkshopState((current) => previousStep(current, model))}
                  onNext={() => setWorkshopState((current) => nextStep(current, model))}
                  onExit={() => setWorkshopState(exitStepByStep)}
                />
              </WorkshopPanel>
            )}

            {descriptor && (
              <WorkshopPanel title="Réglages du modèle" badge={`${descriptor.parameters.length} paramètres`}>
                <p className={workshop.hint}>
                  Le plan suit chaque réglage. Seules vos modifications sont enregistrées — la géométrie reste
                  calculée par le moteur.
                </p>
                <TraceParametersForm
                  parameters={descriptor.parameters}
                  values={paramValues}
                  onChange={onParameterChange}
                />
                <div className={workshop.stepNav}>
                  <button type="button" onClick={resetParameters}>
                    Revenir aux valeurs du modèle
                  </button>
                </div>
                {resolution && <ModelResolutionCard resolution={resolution} />}
              </WorkshopPanel>
            )}

            {model && (
              <WorkshopPanel title="Cotations" badge={`${model.dimensions.length} cotes`}>
                <DimensionsPanel
                  groups={groups}
                  dimensions={scene?.dimensions ?? []}
                  layerVisible={workshopState.layers.dimensions}
                  isVisible={(kind) => isDimensionKindVisible(workshopState, kind)}
                  onToggleKind={(kind) => setWorkshopState((current) => toggleDimensionKind(current, kind))}
                />
              </WorkshopPanel>
            )}

            {model && (
              <WorkshopPanel title="Points de report" badge={`${model.points.length} points`}>
                <ReportPointsPanel model={model} />
              </WorkshopPanel>
            )}

            <WorkshopPanel title="Calques">
              <LayersPanel
                layers={workshopState.layers}
                onToggle={(layer) => setWorkshopState((current) => toggleWorkshopLayer(current, layer))}
              />
            </WorkshopPanel>

            <WorkshopPanel title="Grille">
              <GridPanel
                visible={workshopState.gridVisible}
                stepMm={workshopState.gridStepMm}
                onToggleVisible={() => setWorkshopState(toggleWorkshopGrid)}
                onChangeStep={(stepMm) => setWorkshopState((current) => setWorkshopGridStep(current, stepMm))}
              />
            </WorkshopPanel>

            <WorkshopPanel title="Ouvrage">
              <p className={workshop.hint}>
                {ouvrageLabel(state.project.type)}
                {roomLabel ? ` · pièce ${roomLabel}` : " · dimensions de pièce non renseignées"}.
              </p>
              <p className={workshop.empty}>
                Le positionnement du motif dans la pièce — centrage, rotation, miroir, distances aux murs — n’est
                pas encore disponible : le modèle géométrique ne porte pas de transformation de placement. Il
                arrivera avec le lot dédié, plutôt qu’en montrant ici des distances qui ne correspondraient à rien.
              </p>
            </WorkshopPanel>

            {model && (
              <WorkshopPanel title="Mode expert" defaultOpen={workshopState.expert}>
                <div className={workshop.toggles}>
                  <button
                    type="button"
                    className={workshop.toggle}
                    aria-pressed={workshopState.expert}
                    onClick={() => setWorkshopState(toggleExpertMode)}
                  >
                    <span className={workshop.dot} aria-hidden="true" />
                    Afficher les détails géométriques
                  </button>
                </div>
                {workshopState.expert ? (
                  <ExpertPanel model={model} />
                ) : (
                  <p className={workshop.hint}>
                    Coordonnées, centres, rayons, grandeurs et contrôles chantier du modèle. Désactivé par défaut
                    pour garder l’écran lisible.
                  </p>
                )}
              </WorkshopPanel>
            )}

            <div className={workshop.actionBar}>
              <Link href="/atelier">Mes tracés</Link>
              <Link
                href={`/atelier/export?projectId=${encodeURIComponent(state.project.id)}`}
                className={workshop.primary}
              >
                Exporter
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
