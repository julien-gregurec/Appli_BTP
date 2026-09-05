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
import { hitTest, hitTestAll } from "@/lib/geometry/hit-test";
import { snap, type SnapCandidate } from "@/lib/geometry/snap";
import { chooseGridStep } from "@/lib/viewport/grid";
import {
  advanceSelectionCycle,
  cycleAnchorPx,
  IDLE_SELECTION_CYCLE,
  resetSelectionCycle,
  type SelectionCycleState,
} from "@/lib/viewport/selection-cycle";
import { primarySelection, selectSingle, toggleSelection, type SelectionSet } from "@/lib/viewport/selection-set";
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
import { PlanViewport, type CanvasClickModifiers } from "./PlanViewport";
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
import { countSceneEntities, describeSceneEntity, describeSceneSelection, type PlanScene } from "./plan-scene";
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
  /** Entité ACTIVE — celle que le panneau détaille et dont la poignée est mise en avant. */
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  /**
   * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — sélection complète, entité active comprise.
   *
   * Additif et OPTIONNEL : sans `onSelectEntities`, la multisélection est inerte (Shift +
   * clic se comporte comme un clic simple) et ce composant reste strictement celui d'avant ce
   * lot pour ses appelants existants — l'écran d'export, notamment, n'a pas à être touché.
   */
  selectedEntityIds?: readonly string[];
  onSelectEntities?: (entityIds: readonly string[]) => void;
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

/** Référence stable pour « sélection réduite à l'entité active ». */
const NO_MULTISELECTION: readonly string[] = [];

export function AtelierViewportWorkspace({
  scene,
  selectedEntityId,
  onSelectEntity,
  selectedEntityIds,
  onSelectEntities,
  initialToolbarState = DEFAULT_TOOLBAR_STATE,
  viewKey,
  editing,
}: AtelierViewportWorkspaceProps) {
  const [toolbar, setToolbar] = useState<ToolbarState>(initialToolbarState);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [snapCandidate, setSnapCandidate] = useState<SnapCandidate | null>(null);
  const [activeHandleId, setActiveHandleId] = useState<string | null>(null);
  const [liveReadout, setLiveReadout] = useState<string | null>(null);
  const drag = useRef<DragSession | null>(null);
  /**
   * §7 — le cycle vit dans une `ref`, JAMAIS dans un état. Un état serait recréé à chaque
   * cascade de rendu (survol, zoom, prévisualisation d'un paramètre) et le deuxième clic ne
   * descendrait alors jamais d'un cran.
   */
  const cycle = useRef<SelectionCycleState>(IDLE_SELECTION_CYCLE);
  const controller = usePlanViewport({ bounds: scene.bounds, viewKey });

  const details = useMemo(() => describeSceneEntity(scene, selectedEntityId), [scene, selectedEntityId]);
  const entityCount = useMemo(() => countSceneEntities(scene), [scene]);

  /**
   * §8 — la sélection effective. Sans contrat multiple, c'est l'entité active seule : tous les
   * chemins de rendu (mise en évidence, panneau) partagent donc une seule source, et le mode
   * simple n'est pas un cas particulier mais l'ensemble à un élément.
   */
  const multiSelectionEnabled = Boolean(onSelectEntities);
  const selection: SelectionSet = useMemo(() => {
    if (selectedEntityIds) return selectedEntityIds;
    return selectedEntityId ? [selectedEntityId] : NO_MULTISELECTION;
  }, [selectedEntityIds, selectedEntityId]);

  const selectionDetails = useMemo(
    () => (selection.length > 1 ? describeSceneSelection(scene, selection) : null),
    [scene, selection],
  );

  /**
   * Contexte du cycle (§7) : ce qui, en changeant, rend les identifiants mémorisés caducs.
   * Le mode en fait partie — passer de Sélection à Édition change ce qu'un clic signifie.
   */
  const cycleKey = `${viewKey ?? scene.id}::${toolbar.tool}`;

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

  const openProperties = useCallback(() => {
    setToolbar((current) => (current.propertiesOpen ? current : toggleProperties(current)));
  }, []);

  /**
   * Applique une nouvelle sélection par UN SEUL canal.
   *
   * Notifier les deux rappels ferait dépendre le résultat de l'ordre de traitement des deux
   * `setState` du parent — le second écraserait le premier dès qu'un appelant les stocke
   * séparément. Un parent qui écoute l'ensemble dérive l'entité active lui-même
   * (`primarySelection`) ; un parent qui ne connaît que l'entité active reçoit exactement ce
   * qu'il recevait avant ce lot.
   */
  const applySelection = useCallback(
    (next: SelectionSet) => {
      if (onSelectEntities) onSelectEntities(next);
      else onSelectEntity(primarySelection(next));
    },
    [onSelectEntities, onSelectEntity],
  );

  /**
   * §7/§8 — un clic sur la toile.
   *
   * Trois comportements, dans cet ordre :
   *
   * 1. **Shift + clic sur une entité** : ajoute ou retire, sans toucher au reste. Le cycle est
   *    volontairement CONTOURNÉ — on construit une sélection, on n'explore pas une pile, et
   *    faire les deux à la fois rendrait le geste imprévisible ;
   * 2. **clic simple sur une entité** : sélection simple, avec cycle. Re-cliquer au même
   *    endroit descend d'un cran dans les entités superposées ;
   * 3. **clic à vide** : désélectionne et ferme le cycle. Shift + clic à vide ne touche à
   *    rien — Shift est un modificateur ADDITIF, et détruire une sélection de dix entités
   *    parce que le doigt a glissé de trois pixels serait le pire résultat possible du geste.
   *
   * La tolérance est convertie depuis les pixels à la vue courante, donc identique à l'œil
   * quel que soit le zoom (§2).
   */
  const onCanvasClick = useCallback(
    (local: ScreenPoint, precision: PointerPrecision, modifiers: CanvasClickModifiers) => {
      const tolerance = toleranceWorldFor(selectionTolerancePx(precision), view);
      const world = worldOf(local);
      const additive = modifiers.additive && multiSelectionEnabled;

      if (additive) {
        const found = hitTest(scene, world, tolerance);
        // Shift + clic à vide : la sélection est conservée telle quelle (§8).
        if (!found) return;
        cycle.current = resetSelectionCycle(cycleKey);
        applySelection(toggleSelection(selection, found.entityId));
        openProperties();
        return;
      }

      // Dédoublonné : deux primitives de natures différentes peuvent porter le même
      // identifiant métier, et le cycle doit alors s'arrêter une fois sur cette entité, pas deux.
      const candidates = [...new Set(hitTestAll(scene, world, tolerance).map((item) => item.entityId))];
      const step = advanceSelectionCycle(cycle.current, {
        key: cycleKey,
        point: local,
        candidates,
        anchorPx: cycleAnchorPx(precision),
      });
      cycle.current = step.state;

      if (!step.entityId) {
        applySelection(selectSingle(selection, null));
        return;
      }
      applySelection(selectSingle(selection, step.entityId));
      openProperties();
    },
    [applySelection, cycleKey, multiSelectionEnabled, openProperties, scene, selection, view, worldOf],
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
        setSnapCandidate(null);
        return;
      }
      const world = worldOf(local);
      const found = hitTest(scene, world, toleranceWorldFor(selectionTolerancePx(precision), view));
      setHoveredEntityId(found?.entityId ?? null);
      // Les intersections entrent ici sans code dédié : `snap` les produit désormais
      // lui-même, bornées à la tolérance (§5). Le survol reste donc un seul appel par trame.
      const candidate = snap(scene, world, {
        toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view),
        gridStepMm: chooseGridStep(view.scale),
      });
      setSnapCandidate(candidate);
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
        setSnapCandidate(null);
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
        setSnapCandidate(candidate);

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
        setSnapCandidate(null);
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
            {liveReadout ? (
              <span aria-live="polite">{liveReadout}</span>
            ) : selection.length > 1 ? (
              // §11 — sur une sélection multiple, le compte prime : c'est l'information que le
              // plan lui-même ne donne pas d'un coup d'œil quand dix traits sont en ambre.
              <span aria-live="polite">Sélection : {selection.length} éléments</span>
            ) : (
              details && <span>Sélection : {details.label}</span>
            )}
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
              selectedEntityIds={selection}
              hoveredEntityId={feedbackVisible ? hoveredEntityId : null}
              snapPoint={feedbackVisible ? snapCandidate?.position ?? null : null}
              snapIsIntersection={snapCandidate?.kind === "intersection"}
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
        selection={selectionDetails}
        onClose={closeProperties}
        floating
      />
    </div>
  );
}
