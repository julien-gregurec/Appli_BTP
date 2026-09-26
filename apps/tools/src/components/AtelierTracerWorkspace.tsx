"use client";

/**
 * TRACING-WORKSHOP-UI-V1 — l'ATELIER DE TRAÇAGE proprement dit.
 *
 * C'est l'écran de travail : on y ouvre un tracé enregistré, on règle son modèle ou on dessine
 * librement, on lit sa construction étape par étape, ses cotes et ses points de report, on y
 * verse un relevé photo, et on part de là vers l'export chantier. Il complète l'assistant
 * `/atelier/nouveau` (créer) et l'écran `/atelier/export` (sortir) — il ne les remplace pas.
 *
 * ## WORKSHOP-UI-CANONICAL-V2 — réconciliation avec le canon image/vectorisation
 *
 * Trois principes tiennent la réécriture, et ils viennent tous du même constat : la version
 * précédente de cet écran avait REFAIT à sa manière ce que le canon possédait déjà.
 *
 * 1. **Une seule source de réglages.** `useModelEditing` — le hook du canon — porte valeurs,
 *    prévisualisation, historique et persistance. L'ancien état local `paramValues` + son
 *    autosave maison ont disparu : ils constituaient une seconde vérité, sans annulation, à
 *    côté de celle que `/atelier/nouveau` emprunte déjà. Formulaire, poignées et annulation
 *    passent désormais par le même chemin, ici comme là-bas ;
 * 2. **Les deux modes du canon sont servis.** `tracingProjectMode` distingue le tracé
 *    PARAMÉTRIQUE du tracé LIBRE, et cet écran monte la source correspondante :
 *    `resolveTracingProjectModel` d'un côté, `useFreeDrawing` + `freeGeometryToShape` de
 *    l'autre. Un tracé libre n'est pas un projet « sans modèle » à réparer — c'est un mode de
 *    plein exercice, avec ses outils de création, ses poignées, sa multisélection et son
 *    undo/redo ;
 * 3. **Rien n'est calculé ici.** Géométrie, cotes, points, mesures de contour, vectorisation :
 *    tout vient d'Engine B ou de `lib/tracing/`. Cet écran choisit ce qui est MONTRÉ.
 *
 * Fonctions volontairement ABSENTES plutôt que simulées (§22 : aucun bouton mort) — le
 * positionnement du motif dans la pièce (§11), l'éclairage et les gorges LED (§18/§19) :
 * `TraceModel` ne porte ni transformation de placement ni luminaire, et les inventer ici
 * produirait un plan qui ne correspondrait pas à l'export.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { findTraceModelDescriptor } from "@/lib/geometry/models/catalog";
import { touchTracingProject, formatRoomDimensions, ouvrageLabel } from "@/lib/tracing/atelier";
import { resolveTracingProjectModel } from "@/lib/tracing/model-resolver";
import { tracingProjectMode, type TracingProject } from "@/lib/tracing/project";
import { buildEditableHandles } from "@/lib/tracing/handle-map";
import { useModelEditing } from "@/lib/tracing/use-model-editing";
import { useFreeDrawing } from "@/lib/tracing/use-free-drawing";
import { useUndoRedoShortcuts } from "@/lib/tracing/use-undo-redo-shortcuts";
import type { ParamOverrides } from "@/lib/tracing/param-history";
import { countFreeEntitiesByKind, freeGeometryLength, type FreeGeometry } from "@/lib/tracing/free-geometry";
import { freeContourTotals } from "@/lib/tracing/free-contour";
import { buildFreeVertexHandles } from "@/lib/tracing/free-handles";
import { freeGeometryToShape } from "@/lib/tracing/free-shape";
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import { EMPTY_SELECTION, retainExisting } from "@/lib/viewport/selection-set";
import {
  AtelierViewportWorkspace,
  DEFAULT_TOOLBAR_STATE,
  atelierViewKey,
  formatMillimetres,
  formatSquareMetres,
  type AtelierEditingApi,
  type AtelierFreeDrawingApi,
  type ToolbarState,
} from "@/components/atelier/viewport";
import { ModelResolutionCard } from "@/components/atelier/model/ModelResolutionCard";
import { buildModelResolutionViewModel } from "@/components/atelier/model/model-resolution-view-model";
import { ReferenceImagePanel } from "@/components/atelier/photo/ReferenceImagePanel";
import {
  DimensionsPanel,
  ExpertPanel,
  FREE_LAYERS,
  GridPanel,
  LayersPanel,
  ModeSwitcher,
  PARAMETRIC_LAYERS,
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
  workshopFreeScene,
  workshopScene,
  workshopSource,
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

/** Les paramètres n'ont pas de sens sur un tracé libre : ces deux voies restent inertes. */
function noParams() {}

export function AtelierTracerWorkspace() {
  const { activeCompany } = useAccount();
  const persistence = useAtelierPersistence(activeCompany?.id ?? null);
  const { ready, available, repository, scheduleAutosave, flushAutosave } = persistence;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [workshopState, setWorkshopState] = useState<WorkshopState>(() => createWorkshopState("forme"));
  const [toolbar, setToolbar] = useState<ToolbarState>({ ...DEFAULT_TOOLBAR_STATE, tool: "select" });
  const [selection, setSelection] = useState<readonly string[]>(EMPTY_SELECTION);
  /**
   * WORKSHOP-UI-CANONICAL-V2 §6 — révision du tracé libre, incrémentée par les écritures qui
   * viennent d'AILLEURS que du plan.
   *
   * `useFreeDrawing` possède sa géométrie : il lit `initialGeometry` à la (ré)initialisation
   * seulement, et se réinitialise sur changement de `projectKey`. C'est exactement ce qu'il
   * faut tant que le plan est la seule voie d'écriture — mais le versement d'un relevé photo
   * écrit `freeGeometry` par l'API canonique, sans passer par lui. Sans cette révision, le
   * hook garderait sa copie d'avant : le relevé n'apparaîtrait pas, et le premier geste
   * suivant l'écraserait à l'autosave.
   *
   * Le prix est la remise à plat de l'historique du tracé au moment du versement. Il est
   * assumé, et c'est d'ailleurs la règle du canon pour tout changement d'identité : annuler
   * par-dessus un relevé qu'on vient de verser reviendrait à défaire un travail que
   * l'historique ne décrit pas.
   */
  const [freeRevision, setFreeRevision] = useState(0);

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
  const mode = project ? tracingProjectMode(project) : "undecided";

  /**
   * §9 du canon — écriture d'un réglage : projet remonté puis autosave. Même chemin que
   * `/atelier/nouveau`, donc même `touchTracingProject` et même revalidation stricte. C'est le
   * SEUL chemin d'écriture des paramètres depuis cet écran.
   */
  const persistOverrides = useCallback(
    (overrides: ParamOverrides | undefined) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        const next = touchTracingProject(current.project, { modelParams: overrides });
        scheduleAutosave(next);
        return { status: "ready", project: next };
      });
    },
    [scheduleAutosave],
  );

  /** FREE-DRAWING §10 — même voie, pour la géométrie libre. */
  const persistFreeGeometry = useCallback(
    (freeGeometry: FreeGeometry | undefined) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        const next = touchTracingProject(current.project, { freeGeometry });
        scheduleAutosave(next);
        return { status: "ready", project: next };
      });
    },
    [scheduleAutosave],
  );

  /**
   * Le relevé photo confirmé réécrit PLUSIEURS champs à la fois (image, contour, forme,
   * `freeGeometry`, statut d'échelle) : `confirmVectorizationIntoProject` rend le projet
   * complet, déjà revalidé. On le repose donc tel quel plutôt que d'en rejouer les morceaux.
   */
  const persistProject = useCallback(
    (next: TracingProject) => {
      // La révision n'avance que si le tracé libre a RÉELLEMENT changé : attacher une image
      // ou calibrer ne doit pas coûter l'historique du tracé.
      if (project?.freeGeometry !== next.freeGeometry) setFreeRevision((revision) => revision + 1);
      setState({ status: "ready", project: next });
      scheduleAutosave(next);
    },
    [project, scheduleAutosave],
  );

  const editingState = useModelEditing({
    descriptor,
    initialOverrides: project?.modelParams,
    modelKey: `${project?.id ?? "sans-projet"}::${descriptor?.slug ?? "sans-modele"}`,
    onPersist: persistOverrides,
  });

  const drawingState = useFreeDrawing({
    initialGeometry: project?.freeGeometry,
    projectKey: `${project?.id ?? "sans-projet"}::libre::${freeRevision}`,
    onPersist: persistFreeGeometry,
  });

  /**
   * Résolution unique, partagée par le plan, la carte d'état et tous les panneaux. La
   * recalculer par panneau donnerait autant de géométries potentiellement différentes.
   */
  const resolution = useMemo(
    () =>
      project && project.modelId
        ? resolveTracingProjectModel({ modelId: project.modelId, modelParams: editingState.values })
        : null,
    [project, editingState.values],
  );
  const model = resolution?.status === "resolved" ? resolution.model : null;

  /* ---- Source PARAMÉTRIQUE ------------------------------------------------ */

  const modelScene = useMemo(() => (model ? workshopScene(model, workshopState) : null), [model, workshopState]);
  const step = useMemo(() => activeStep(model, workshopState), [model, workshopState]);
  const groups = useMemo(() => (model ? dimensionGroups(model) : []), [model]);

  /**
   * §1/§2 du canon — poignées du modèle, construites sur la résolution DÉJÀ calculée : aucun
   * second appel au moteur, et les poignées sont là où l'utilisateur voit les sommets.
   */
  const modelHandles = useMemo(() => {
    if (!descriptor || resolution?.status !== "resolved") return [];
    return buildEditableHandles(descriptor, resolution.params, resolution.model);
  }, [descriptor, resolution]);

  /* ---- Source LIBRE ------------------------------------------------------- */

  const freeSource = useMemo(
    () =>
      project
        ? freeGeometryToShape(drawingState.geometry, {
            id: `libre-${project.id}`,
            name: project.name,
            frame: "sheet",
          })
        : null,
    [drawingState.geometry, project],
  );
  const freeScene = useMemo(
    () => (freeSource ? workshopFreeScene(freeSource, workshopState) : null),
    [freeSource, workshopState],
  );
  const freeHandles = useMemo(() => buildFreeVertexHandles(drawingState.geometry), [drawingState.geometry]);

  /* ---- Ce que le viewport reçoit ------------------------------------------ */

  /** §5 — la règle vit dans `workshop-model`, avec son pourquoi et ses tests. */
  const isFree = workshopSource(mode, Boolean(project?.modelId)) === "free";
  const scene = isFree ? freeScene : modelScene;

  /**
   * Une entité supprimée — ou effacée par un changement de paramètre — doit quitter la
   * sélection. La dériver de la scène le garantit sans aucun effet de nettoyage.
   */
  const liveSelection = useMemo(() => {
    if (!scene) return EMPTY_SELECTION;
    const known = new Set<string>();
    for (const list of [
      scene.points,
      scene.segments,
      scene.constructionLines,
      scene.arcs,
      scene.circles,
      scene.ellipses,
      scene.polylines,
      scene.polygons,
    ]) {
      for (const item of list ?? []) known.add(item.id);
    }
    return retainExisting(selection, known);
  }, [scene, selection]);

  const undo = isFree ? drawingState.undo : editingState.undo;
  const redo = isFree ? drawingState.redo : editingState.redo;
  useUndoRedoShortcuts({ onUndo: undo, onRedo: redo });

  const editing = useMemo<AtelierEditingApi>(
    () =>
      isFree
        ? {
            handles: freeHandles,
            onPreviewParams: noParams,
            onCommitParams: noParams,
            canUndo: drawingState.canUndo,
            canRedo: drawingState.canRedo,
            onUndo: drawingState.undo,
            onRedo: drawingState.redo,
          }
        : {
            handles: modelHandles,
            onPreviewParams: editingState.previewValues,
            onCommitParams: (values, label, source) => editingState.commitValues(values, label, source),
            canUndo: editingState.canUndo,
            canRedo: editingState.canRedo,
            onUndo: editingState.undo,
            onRedo: editingState.redo,
          },
    [isFree, freeHandles, modelHandles, drawingState, editingState],
  );

  /** Les outils de création et la suppression n'existent que sur un tracé libre. */
  const drawing = useMemo<AtelierFreeDrawingApi | undefined>(
    () =>
      isFree
        ? {
            onCreateEntity: (commit) => drawingState.createEntity(commit.kind, commit.points),
            onPreviewVertex: (move) => drawingState.previewVertex(move.entityId, move.index, move.position),
            onCommitVertex: (move) => drawingState.commitVertex(move.entityId, move.index, move.position),
            onDeleteEntities: (entityIds) => drawingState.deleteEntities(entityIds),
          }
        : undefined,
    [isFree, drawingState],
  );

  const onSelectEntity = useCallback((entityId: string | null) => {
    setSelection(entityId ? [entityId] : EMPTY_SELECTION);
  }, []);

  const resetParameters = editingState.resetToDefaults;

  const roomLabel = project ? formatRoomDimensions(project.roomWidthMm, project.roomHeightMm) : null;
  const totalSteps = stepCount(model);
  const resolutionView = resolution ? buildModelResolutionViewModel(resolution) : null;

  const freeCounts = countFreeEntitiesByKind(drawingState.committedGeometry);
  const freeTotal = drawingState.committedGeometry.entities.length;
  const contours = useMemo(() => freeContourTotals(drawingState.committedGeometry), [drawingState.committedGeometry]);

  const announcement = isFree ? drawingState.announcement : editingState.announcement;

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
              ? [ouvrageLabel(project.type), isFree ? "tracé libre" : null, roomLabel ? `pièce ${roomLabel}` : null]
                  .filter(Boolean)
                  .join(" · ")
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
              onChange={(next) => setWorkshopState((current) => setWorkshopMode(current, next))}
            />

            {scene ? (
              <AtelierViewportWorkspace
                scene={scene}
                viewKey={isFree ? `${state.project.id}::libre` : atelierViewKey(state.project.id, model?.slug)}
                selectedEntityId={liveSelection[0] ?? null}
                selectedEntityIds={liveSelection}
                onSelectEntity={onSelectEntity}
                onSelectEntities={setSelection}
                editing={editing}
                drawing={drawing}
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
                <p>
                  {resolutionView?.message ??
                    "Ce tracé n’a pas encore de modèle. Choisissez-en un, ou versez-y un relevé photo pour le poursuivre en tracé libre."}
                </p>
                <Link href={`/atelier/nouveau?reprendre=${encodeURIComponent(state.project.id)}`} className="atelier-cta">
                  Choisir un modèle
                </Link>
              </div>
            )}

            <p className="atelier-feedback" aria-live="polite">
              {(isFree && drawingState.error) ||
                (announcement ? `${announcement.kind === "undo" ? "Annulé" : "Rétabli"} : ${announcement.label}` : "")}
            </p>

            {isFree && (
              <WorkshopPanel
                title="Tracé libre"
                badge={`${freeTotal} primitive${freeTotal > 1 ? "s" : ""}`}
                defaultOpen
              >
                <p className={workshop.hint}>
                  Choisissez <strong>Point</strong>, <strong>Segment</strong>, <strong>Polyligne</strong> ou{" "}
                  <strong>Contour</strong> dans la barre du plan, puis cliquez. Chaque sommet s’accroche à la
                  géométrie voisine et à la grille — c’est la position accrochée qui est enregistrée. En mode
                  <strong> Édition</strong>, tirez un sommet pour le déplacer ; <kbd>Suppr</kbd> retire la
                  sélection. Tout est annulable (Ctrl+Z) et enregistré en continu.
                </p>
                <p className={workshop.hint} aria-live="polite">
                  {freeTotal === 0
                    ? "Aucune primitive pour l’instant."
                    : `${freeCounts.point} point${freeCounts.point > 1 ? "s" : ""}, ${freeCounts.segment} segment${freeCounts.segment > 1 ? "s" : ""}, ${freeCounts.polyline} polyligne${freeCounts.polyline > 1 ? "s" : ""}, ${freeCounts.polygon} contour${freeCounts.polygon > 1 ? "s" : ""} · développé ${formatMillimetres(freeGeometryLength(drawingState.committedGeometry))}`}
                </p>
                {contours.contourCount > 0 && (
                  <p className={workshop.hint} aria-live="polite">
                    {`${contours.contourCount} contour${contours.contourCount > 1 ? "s" : ""} · périmètre cumulé ${formatMillimetres(contours.perimeterMm)} · `}
                    {contours.areaM2 === null
                      ? "aucune surface exploitable"
                      : `surface cumulée ${formatSquareMetres(contours.areaM2)}`}
                    {contours.exploitableCount < contours.contourCount &&
                      ` — ${contours.contourCount - contours.exploitableCount} contour${
                        contours.contourCount - contours.exploitableCount > 1 ? "s" : ""
                      } hors surface (contour croisé ou aplati)`}
                  </p>
                )}
              </WorkshopPanel>
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
                  Le plan suit chaque réglage — au formulaire comme à la poignée. Seules vos modifications sont
                  enregistrées, et chacune est annulable (Ctrl+Z) : la géométrie reste calculée par le moteur.
                </p>
                <TraceParametersForm
                  parameters={descriptor.parameters}
                  values={editingState.values}
                  onChange={(id, value, label) => editingState.setValueFromForm(id, value, label)}
                />
                <div className={workshop.stepNav}>
                  <button type="button" onClick={editingState.undo} disabled={!editingState.canUndo}>
                    Annuler
                  </button>
                  <button type="button" onClick={editingState.redo} disabled={!editingState.canRedo}>
                    Rétablir
                  </button>
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
                  dimensions={modelScene?.dimensions ?? []}
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

            <WorkshopPanel title="Image de référence" badge={`${state.project.referenceImages.length} image(s)`}>
              <ReferenceImagePanel project={state.project} onProjectChange={persistProject} />
            </WorkshopPanel>

            <WorkshopPanel title="Calques">
              <LayersPanel
                layers={workshopState.layers}
                available={isFree ? FREE_LAYERS : model ? PARAMETRIC_LAYERS : []}
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
