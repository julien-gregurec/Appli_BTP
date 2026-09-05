"use client";

/**
 * Assemblage viewport + barre d'outils + panneau propriétés (§9/§10/§11).
 *
 * C'est la brique que l'Atelier monte à la place de son aperçu statique. La sélection est
 * CONTRÔLÉE : `selectedEntityId` / `onSelectEntity` sont fournis par le parent.
 *
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §7 — la sélection vient du hit-test géométrique : le clic
 * est converti en point MONDE, puis `hitTest` désigne l'entité la plus pertinente dans la
 * tolérance. Le clic à vide désélectionne. La couche de rendu ne porte aucune zone de clic.
 *
 * ## ATELIER-VERTEX-EDIT-UNDO-REDO-V1 — édition d'un sommet
 *
 * Ce composant orchestre le geste ; il ne décide de rien. Le cycle est
 * `pointerdown → glissement → accrochage → prévisualisation → validation` (§4), et à chaque
 * étape il RELAIE : `onPreviewParams` pendant le geste, `onCommitParams` au relâchement. Il
 * ne touche ni au projet, ni à l'autosave, ni à l'historique — le parent en est propriétaire,
 * ce qui garantit qu'une modification par poignée et une modification par formulaire suivent
 * exactement le même chemin (§10).
 *
 * Trois invariants tiennent le geste :
 *
 * 1. **la poignée est GELÉE au `pointerdown`**. La prévisualisation reconstruit la géométrie à
 *    chaque trame, donc la poignée « courante » se déplace sous le curseur ; inverser depuis
 *    elle cumulerait les écarts et le sommet partirait à l'infini. L'inversion part toujours
 *    de l'état du début du geste ;
 * 2. **la scène d'accrochage est gelée elle aussi, et privée du point tenu** (§6). Un point
 *    qui suit le curseur n'est pas une cible d'accrochage : il collerait à lui-même et
 *    figerait le glissement ;
 * 3. **la position ACCROCHÉE est celle qui est validée**, pas seulement celle qui est
 *    affichée (§6) — c'est elle qui traverse l'inversion, la quantification et le bornage.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { hitTest } from "@/lib/geometry/hit-test";
import { snap } from "@/lib/geometry/snap";
import { chooseGridStep } from "@/lib/viewport/grid";
import { screenToWorld, type ScreenPoint } from "@/lib/viewport/viewport-math";
import {
  handleGrabPx,
  pointerPrecisionOf,
  selectionTolerancePx,
  snapTolerancePx,
  toleranceWorldFor,
  type PointerPrecision,
} from "@/lib/viewport/pointer-targeting";
import { describeHandleValues, type EditableHandle } from "@/lib/tracing/editable-handle";
import { paramsForHandleTarget } from "@/lib/tracing/editable-handle";
import { nearestEditableHandle } from "@/lib/tracing/handle-map";
import { usePlanViewport } from "./use-plan-viewport";
import { PlanViewport } from "./PlanViewport";
import { PlanSceneLayer } from "./PlanSceneLayer";
import { HandleLayer } from "./HandleLayer";
import { AtelierToolbar } from "./AtelierToolbar";
import { PropertiesSheet } from "./PropertiesSheet";
import {
  canEditHandles,
  canSelectEntities,
  DEFAULT_TOOLBAR_STATE,
  selectTool,
  toggleGrid,
  toggleProperties,
  type AtelierTool,
  type ToolbarActionId,
  type ToolbarState,
} from "./toolbar-model";
import { countSceneEntities, describeSceneEntity, type PlanScene } from "./plan-scene";
import styles from "./viewport.module.css";

/**
 * Tout ce qu'il faut pour éditer. Absent, le viewport se comporte exactement comme avant ce
 * lot : pas de mode Édition, pas de poignée, pas d'annulation.
 */
export type AtelierEditingApi = {
  handles: readonly EditableHandle[];
  /** Pendant le glissement : recalculer et afficher, sans rien enregistrer ni empiler. */
  onPreviewParams: (values: Record<string, number>) => void;
  /** Fin du geste : c'est ici — et seulement ici — que l'historique et l'autosave entrent. */
  onCommitParams: (values: Record<string, number>, label: string, source: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export type AtelierViewportWorkspaceProps = {
  scene: PlanScene;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  /** État initial de la barre (utile pour une preview qui veut démarrer en mode Sélection). */
  initialToolbarState?: ToolbarState;
  /**
   * Identité de ce que montre le viewport (§4/§5) — transmise telle quelle à `usePlanViewport`.
   * Sans elle, le cadrage repart des bornes et se réinitialise à chaque changement de
   * paramètre ; avec elle, le zoom et le pan ne sont perdus qu'au changement de modèle.
   */
  viewKey?: string;
  editing?: AtelierEditingApi;
};

/**
 * Référence stable pour « aucune poignée ». Un littéral `[]` écrit à l'appel serait une
 * nouvelle valeur à chaque rendu, ce qui périmerait les mémos qui en dépendent et
 * reconstruirait la liste des poignées à chaque trame de pan.
 */
const NO_HANDLES: readonly EditableHandle[] = [];

/** Geste en cours. Gelé au `pointerdown`, jeté au relâchement. */
type DragSession = {
  handle: EditableHandle;
  precision: PointerPrecision;
  /** Scène d'accrochage figée, privée du point tenu (§6). */
  snapScene: PlanScene;
  /** Dernières valeurs prévisualisées, ou `null` si rien n'a bougé. */
  pending: Record<string, number> | null;
};

export function AtelierViewportWorkspace({
  scene,
  selectedEntityId,
  onSelectEntity,
  initialToolbarState = DEFAULT_TOOLBAR_STATE,
  viewKey,
  editing,
}: AtelierViewportWorkspaceProps) {
  const [toolbar, setToolbar] = useState<ToolbarState>(initialToolbarState);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeHandleId, setActiveHandleId] = useState<string | null>(null);
  const [liveReadout, setLiveReadout] = useState<string | null>(null);
  const drag = useRef<DragSession | null>(null);
  const controller = usePlanViewport({ bounds: scene.bounds, viewKey });

  const details = useMemo(() => describeSceneEntity(scene, selectedEntityId), [scene, selectedEntityId]);
  const entityCount = useMemo(() => countSceneEntities(scene), [scene]);

  const handles = editing?.handles ?? NO_HANDLES;
  const editableCount = useMemo(() => handles.filter((handle) => handle.editable).length, [handles]);
  const editingAvailable = Boolean(editing) && editableCount > 0;

  // Dérivé du mode courant plutôt que remis à zéro par un effet : passer en « Déplacer » éteint
  // aussitôt le survol et l'accrochage, sans état résiduel à nettoyer.
  const feedbackVisible = canSelectEntities(toolbar);
  const editMode = canEditHandles(toolbar) && editingAvailable;

  // Le mode Édition ne peut pas rester actif si le modèle cesse d'offrir des poignées (autre
  // modèle, paramètres invalides) : on retombe sur la sélection, par dérivation et non par un
  // effet de nettoyage qui provoquerait un second rendu.
  const effectiveTool: AtelierTool = toolbar.tool === "edit" && !editingAvailable ? "select" : toolbar.tool;

  const { view, size } = controller;

  /** Point monde d'un point écran local, à la vue courante. */
  const worldOf = useCallback((local: ScreenPoint) => screenToWorld(local, view, size), [view, size]);

  const onSelectTool = useCallback((tool: AtelierTool) => {
    setToolbar((current) => selectTool(current, tool));
  }, []);

  const onAction = useCallback(
    (action: ToolbarActionId) => {
      if (action === "grid") setToolbar(toggleGrid);
      else if (action === "properties") setToolbar(toggleProperties);
      else if (action === "undo") editing?.onUndo();
      else if (action === "redo") editing?.onRedo();
      else controller.recenter();
    },
    [controller, editing],
  );

  const closeProperties = useCallback(() => {
    setToolbar((current) => (current.propertiesOpen ? toggleProperties(current) : current));
  }, []);

  const pickEntity = useCallback(
    (entityId: string) => {
      onSelectEntity(entityId);
      setToolbar((current) => (current.propertiesOpen ? current : toggleProperties(current)));
    },
    [onSelectEntity],
  );

  /**
   * §7 — un clic désigne l'entité la plus pertinente sous le pointeur, ou désélectionne si
   * rien n'est assez proche. La tolérance est convertie depuis les pixels à la vue courante,
   * donc identique à l'œil quel que soit le zoom (§2).
   */
  const onCanvasClick = useCallback(
    (local: ScreenPoint, precision: PointerPrecision) => {
      const tolerance = toleranceWorldFor(selectionTolerancePx(precision), view);
      const found = hitTest(scene, worldOf(local), tolerance);
      if (found) pickEntity(found.entityId);
      else onSelectEntity(null);
    },
    [onSelectEntity, pickEntity, scene, view, worldOf],
  );

  /**
   * §9 — survol : l'entité qu'un clic prendrait, et le point d'accrochage qu'un glissement
   * utiliserait. Purement visuel tant qu'aucune poignée n'est tenue.
   */
  const onCanvasHover = useCallback(
    (local: ScreenPoint | null, precision: PointerPrecision) => {
      if (drag.current) return;
      if (!local) {
        setHoveredEntityId(null);
        setSnapPoint(null);
        return;
      }
      const world = worldOf(local);
      const found = hitTest(scene, world, toleranceWorldFor(selectionTolerancePx(precision), view));
      setHoveredEntityId(found?.entityId ?? null);
      const candidate = snap(scene, world, {
        toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view),
        gridStepMm: chooseGridStep(view.scale),
      });
      setSnapPoint(candidate ? candidate.position : null);
    },
    [scene, view, worldOf],
  );

  /**
   * §4/§6 — saisie, glissement et validation d'une poignée.
   *
   * `onDown` répond une fois pour toutes si le contact appartient à une poignée : c'est ce qui
   * garantit qu'un pan ne se transforme jamais en édition, et réciproquement.
   */
  const grab = useMemo(() => {
    if (!editMode || !editing) return undefined;
    return {
      onDown: (local: ScreenPoint, pointerType: string | undefined) => {
        const precision = pointerPrecisionOf(pointerType);
        const world = worldOf(local);
        const found = nearestEditableHandle(
          editing.handles,
          world,
          toleranceWorldFor(handleGrabPx(precision), view),
        );
        if (!found) return false;

        drag.current = {
          handle: found,
          precision,
          // Scène d'accrochage gelée et privée du point tenu (§6) : les cibles ne doivent pas
          // bouger avec la géométrie qu'on est en train de déformer.
          snapScene: { ...scene, points: (scene.points ?? []).filter((point) => point.id !== found.entityId) },
          pending: null,
        };
        setActiveHandleId(found.id);
        setSnapPoint(null);
        setHoveredEntityId(null);
        setLiveReadout(describeHandleValues(found, found.baseParams));
        return true;
      },

      onMove: (local: ScreenPoint) => {
        const session = drag.current;
        if (!session) return;
        const world = worldOf(local);
        const candidate = snap(session.snapScene, world, {
          toleranceWorld: toleranceWorldFor(snapTolerancePx(session.precision), view),
          gridStepMm: chooseGridStep(view.scale),
        });
        // La position ACCROCHÉE est celle qui traverse l'inversion (§6) : accrocher pour
        // l'affichage seulement reviendrait à mentir sur ce qui va être enregistré.
        const target = candidate?.position ?? world;
        setSnapPoint(candidate?.position ?? null);

        const next = paramsForHandleTarget(session.handle, target);
        session.pending = next;
        const values = next ?? session.handle.baseParams;
        setLiveReadout(describeHandleValues(session.handle, values));
        editing.onPreviewParams({ ...values });
      },

      onUp: () => {
        const session = drag.current;
        drag.current = null;
        setActiveHandleId(null);
        setSnapPoint(null);
        setLiveReadout(null);
        if (!session) return;
        if (session.pending) {
          editing.onCommitParams(
            session.pending,
            `${session.handle.role} ${session.handle.entityId}`,
            `handle:${session.handle.id}`,
          );
        } else {
          // Rien n'a bougé d'un pas entier : on remet l'état de départ plutôt que de laisser
          // une prévisualisation orpheline, et on n'empile rien.
          editing.onPreviewParams({ ...session.handle.baseParams });
        }
      },
    };
  }, [editMode, editing, scene, view, worldOf]);

  const selectedHandle = useMemo(
    () => handles.find((handle) => handle.entityId === selectedEntityId) ?? null,
    [handles, selectedEntityId],
  );

  return (
    <div className={styles.workspace} data-properties={toolbar.propertiesOpen ? "open" : "closed"}>
      <AtelierToolbar
        state={{ ...toolbar, tool: effectiveTool }}
        hasSelection={Boolean(selectedEntityId)}
        editingAvailable={editingAvailable}
        canUndo={editing?.canUndo ?? false}
        canRedo={editing?.canRedo ?? false}
        onSelectTool={onSelectTool}
        onAction={onAction}
      />

      <PlanViewport
        controller={controller}
        label={`Plan interactif — ${scene.name}`}
        gridVisible={toolbar.gridVisible}
        tool={effectiveTool}
        grab={grab}
        onCanvasClick={feedbackVisible ? onCanvasClick : undefined}
        onCanvasHover={feedbackVisible ? onCanvasHover : undefined}
        status={
          <>
            <span>{entityCount} entités</span>
            {editMode && <span>{editableCount} sommets réglables</span>}
            {liveReadout ? <span aria-live="polite">{liveReadout}</span> : details && <span>Sélection : {details.label}</span>}
          </>
        }
      >
        {({ view: frameView, size: frameSize }) => (
          <>
            <PlanSceneLayer
              scene={scene}
              view={frameView}
              size={frameSize}
              selectedEntityId={selectedEntityId}
              hoveredEntityId={feedbackVisible ? hoveredEntityId : null}
              snapPoint={feedbackVisible ? snapPoint : null}
            />
            {editMode && (
              <HandleLayer
                handles={handles}
                view={frameView}
                size={frameSize}
                activeHandleId={activeHandleId}
                selectedEntityId={selectedEntityId}
              />
            )}
          </>
        )}
      </PlanViewport>

      <PropertiesSheet
        open={toolbar.propertiesOpen}
        details={details}
        handle={selectedHandle}
        onClose={closeProperties}
        floating
      />
    </div>
  );
}
