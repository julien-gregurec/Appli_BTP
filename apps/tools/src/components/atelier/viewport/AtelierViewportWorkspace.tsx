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
 *
 * ## ATELIER-FREE-DRAWING-FOUNDATION-V1 §4/§6/§7/§8 — tracé libre
 *
 * Trois gestes s'ajoutent, et aucun ne change la règle ci-dessus : ce composant ORCHESTRE, il
 * ne décide de rien et ne possède aucune géométrie.
 *
 * - **créer** (§4/§6) : l'automate `free-draw-model` accumule les sommets d'une primitive en
 *   cours. Elle n'existe que là, et n'en sort qu'une fois complète, par `onCreateEntity`. Un
 *   `Échap` la fait disparaître sans que rien n'ait été enregistré ni empilé ;
 * - **déplacer un sommet** (§7) : le MÊME cycle que la poignée paramétrique — même prise, même
 *   arbitrage de geste, même accrochage, même gel de la scène. Seule la fin diffère, et elle
 *   se lit sur la poignée : `handle.vertex` renseigné signifie que le déplacement s'écrit dans
 *   la géométrie source (classe C), sinon il se traduit en `modelParams` (classe A) ;
 * - **supprimer** (§8) : `Suppr` / `Retour arrière` transmet la SÉLECTION au parent, qui seul
 *   sait ce qui lui appartient. Ce composant ne filtre rien — il ne connaît pas le document
 *   libre — et c'est ce qui rend structurellement impossible de supprimer une primitive
 *   dérivée d'Engine B par ce chemin.
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
import {
  EMPTY_SELECTION,
  primarySelection,
  selectSingle,
  toggleSelection,
  type SelectionSet,
} from "@/lib/viewport/selection-set";
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
import type { FreeVertex } from "@/lib/tracing/free-geometry";
import {
  beginFreeDraw,
  canFinishFreeDraw,
  freeDrawCancel,
  freeDrawClick,
  freeDrawFinish,
  freeDrawHint,
  isFreeDrawInProgress,
  type FreeDrawCommit,
  type FreeDrawState,
} from "./free-draw-model";
import { FreeDrawPreviewLayer } from "./FreeDrawPreviewLayer";
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
  freeDrawToolOf,
  selectTool,
  showsSnapFeedback,
  toggleGrid,
  toggleProperties,
  type AtelierTool,
  type ToolbarActionId,
  type ToolbarState,
} from "./toolbar-model";
import {
  countSceneEntities,
  describeSceneEntity,
  describeSceneSelection,
  formatWorldPoint,
  type PlanScene,
} from "./plan-scene";
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

/**
 * §4/§7/§8 — intentions du tracé libre. Absente, le viewport se comporte exactement comme
 * avant ce lot : pas d'outil de création, pas de suppression, pas de déplacement direct.
 *
 * Toutes les fonctions reçoivent une INTENTION, jamais un document : le viewport n'a pas de
 * géométrie libre à donner, il n'en possède aucune.
 */
export type AtelierFreeDrawingApi = {
  /** §4/§6 — une primitive complète, validée par le geste. Seul chemin de création. */
  onCreateEntity: (commit: FreeDrawCommit) => void;
  /** §7 — pendant le glissement d'un sommet : afficher sans enregistrer ni empiler. */
  onPreviewVertex: (move: FreeVertexMove) => void;
  /** §7 — fin du geste : c'est ici, et seulement ici, qu'historique et autosave entrent. */
  onCommitVertex: (move: FreeVertexMove) => void;
  /** §8 — la sélection courante, telle quelle. Le parent en retient ce qui lui appartient. */
  onDeleteEntities: (entityIds: readonly string[]) => void;
};

/** §7 — un sommet libre et la position monde où il doit aller, en millimètres. */
export type FreeVertexMove = { entityId: string; index: number; position: FreeVertex };

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
  /** §4 — outils de création, déplacement direct et suppression du tracé libre. */
  drawing?: AtelierFreeDrawingApi;
};

/**
 * Référence stable pour « aucune poignée ». Un littéral `[]` écrit à l'appel serait une
 * nouvelle valeur à chaque rendu, ce qui périmerait les mémos qui en dépendent et
 * reconstruirait la liste des poignées à chaque trame de pan.
 */
const NO_HANDLES: readonly EditableHandle[] = [];

/**
 * §6 du lot précédent, §7 de celui-ci — scène d'accrochage gelée, privée de ce qu'on tient.
 *
 * Ce qui est retiré diffère selon la classe de la poignée, et la différence a une raison :
 *
 * - **classe A** (paramétrique) : seul le POINT tenu disparaît. Le reste du modèle est
 *   recalculé à chaque trame mais reste une cible légitime — on règle souvent un sommet sur un
 *   axe ou un cercle de la même figure ;
 * - **classe C** (libre) : l'ENTITÉ entière disparaît. Son autre extrémité n'est pas une cible
 *   souhaitable — s'y accrocher produirait le segment de longueur nulle que la validation
 *   refuse — et ses propres sommets suivraient le geste, donc s'accrocheraient à eux-mêmes.
 */
function freezeSnapScene(scene: PlanScene, handle: EditableHandle): PlanScene {
  if (!handle.vertex) {
    return { ...scene, points: (scene.points ?? []).filter((point) => point.id !== handle.entityId) };
  }
  const held = handle.vertex.entityId;
  const without = <T extends { id: string }>(items: readonly T[] | undefined): readonly T[] | undefined =>
    items && items.filter((item) => item.id !== held);
  return {
    ...scene,
    points: without(scene.points),
    segments: without(scene.segments),
    polylines: without(scene.polylines),
    polygons: without(scene.polygons),
  };
}

/** Geste en cours. Gelé au `pointerdown`, jeté au relâchement. */
type DragSession = {
  handle: EditableHandle;
  precision: PointerPrecision;
  /** Scène d'accrochage figée, privée du point tenu (§6). */
  snapScene: PlanScene;
  /** Dernières valeurs prévisualisées, ou `null` si rien n'a bougé (classe A). */
  pending: Record<string, number> | null;
  /**
   * Dernière position visée du sommet libre, ou `null` si le curseur n'a pas quitté sa
   * position d'origine (classe C, §7). Les deux champs ne sont jamais renseignés ensemble :
   * `handle.vertex` dit lequel des deux est le bon, et il ne change pas pendant le geste.
   */
  pendingVertex: FreeVertex | null;
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
  drawing,
}: AtelierViewportWorkspaceProps) {
  const [toolbar, setToolbar] = useState<ToolbarState>(initialToolbarState);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [snapCandidate, setSnapCandidate] = useState<SnapCandidate | null>(null);
  const [activeHandleId, setActiveHandleId] = useState<string | null>(null);
  const [liveReadout, setLiveReadout] = useState<string | null>(null);
  /** §4/§6 — tracé en cours. `null` hors d'un outil de création : rien à afficher, rien à annuler. */
  const [draw, setDraw] = useState<FreeDrawState | null>(null);
  /** §6 — point courant ACCROCHÉ, en millimètres monde : là où le prochain clic posera un sommet. */
  const [drawCursor, setDrawCursor] = useState<FreeVertex | null>(null);
  /** §4 — dernier geste refusé, dit à l'utilisateur plutôt qu'avalé en silence. */
  const [drawNotice, setDrawNotice] = useState<string | null>(null);
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
  const drawingAvailable = Boolean(drawing);

  // Le mode Édition ne peut pas rester actif si le modèle cesse d'offrir des poignées (autre
  // modèle, paramètres invalides) : on retombe sur la sélection, par dérivation et non par un
  // effet de nettoyage qui provoquerait un second rendu. Même règle pour les trois outils de
  // création sur un projet qui n'est pas en tracé libre (§4).
  const requestedDrawTool = freeDrawToolOf(toolbar);
  const effectiveTool: AtelierTool =
    (toolbar.tool === "edit" && !editingAvailable) || (requestedDrawTool !== null && !drawingAvailable)
      ? "select"
      : toolbar.tool;
  const effectiveState: ToolbarState = { ...toolbar, tool: effectiveTool };

  const feedbackVisible = canSelectEntities(effectiveState);
  const snapFeedbackVisible = showsSnapFeedback(effectiveState);
  const editMode = canEditHandles(effectiveState) && editingAvailable;
  const drawTool = drawingAvailable ? freeDrawToolOf(effectiveState) : null;

  /*
   * §4/§6 — l'automate suit l'outil, par DÉRIVATION et non par un effet.
   *
   * Changer d'outil au milieu d'une polyligne doit abandonner le tracé en cours : le
   * reconstruire ici, pendant le rendu, garantit qu'aucune trame n'affiche les sommets d'un
   * outil avec le comportement d'un autre — ce qu'un `useEffect` de nettoyage laisserait
   * arriver le temps d'un rendu.
   */
  if ((draw?.tool ?? null) !== drawTool) {
    setDraw(drawTool ? beginFreeDraw(drawTool) : null);
    setDrawCursor(null);
    setDrawNotice(null);
  }

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
  /**
   * §5 — position ACCROCHÉE d'un point écran. Un seul chemin pour la création et pour la
   * prévisualisation : le sommet dessiné sous le curseur et celui qui sera enregistré sont
   * calculés par le même appel, donc ils ne peuvent pas différer (§5 : « le point créé doit
   * utiliser la position accrochée, pas seulement un retour visuel »).
   */
  const snappedWorldOf = useCallback(
    (local: ScreenPoint, precision: PointerPrecision): { position: FreeVertex; snapped: boolean } => {
      const world = worldOf(local);
      const candidate = snap(scene, world, {
        toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view),
        gridStepMm: chooseGridStep(view.scale),
      });
      return { position: candidate?.position ?? world, snapped: Boolean(candidate) };
    },
    [scene, view, worldOf],
  );

  /**
   * §4/§6 — un clic en mode création : il pose un sommet, et publie la primitive dès qu'elle
   * est complète. Rien n'est enregistré tant que l'automate ne rend pas de `commit`.
   */
  const onDrawClick = useCallback(
    (local: ScreenPoint, precision: PointerPrecision) => {
      if (!draw || !drawing) return;
      const { position } = snappedWorldOf(local, precision);
      const step = freeDrawClick(draw, position);
      setDraw(step.state);
      setDrawNotice(step.rejected ?? null);
      if (step.commit) drawing.onCreateEntity(step.commit);
    },
    [draw, drawing, snappedWorldOf],
  );

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
        setDrawCursor(null);
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
      // §6 — le point courant du tracé en cours EST la position accrochée : le fantôme montre
      // donc exactement le sommet que le clic posera, et non la position brute du curseur.
      setDrawCursor(candidate ? candidate.position : world);
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
          snapScene: freezeSnapScene(scene, found),
          pending: null,
          pendingVertex: null,
        };
        setActiveHandleId(found.id);
        setSnapCandidate(null);
        setHoveredEntityId(null);
        setLiveReadout(
          found.vertex ? formatWorldPoint(found.position) : describeHandleValues(found, found.baseParams),
        );
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

        // §7 — classe C : la position visée EST la nouvelle donnée. Aucune inversion, aucune
        // quantification, aucun bornage — il n'y a pas de paramètre derrière ce sommet.
        const vertex = session.handle.vertex;
        if (vertex && drawing) {
          session.pendingVertex = target;
          setLiveReadout(formatWorldPoint(target));
          drawing.onPreviewVertex({ ...vertex, position: target });
          return;
        }

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

        const vertex = session.handle.vertex;
        if (vertex && drawing) {
          if (session.pendingVertex) drawing.onCommitVertex({ ...vertex, position: session.pendingVertex });
          // Le sommet n'a pas bougé : remettre l'état de départ plutôt que de laisser une
          // prévisualisation orpheline, et n'empiler rien (même règle que la classe A).
          else drawing.onPreviewVertex({ ...vertex, position: session.handle.position });
          return;
        }

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
  }, [drawing, editMode, editing, scene, view, worldOf]);

  /**
   * §4 — fin explicite d'une polyligne. Deux chemins, un seul comportement : la touche
   * `Entrée` au clavier, et le double-clic — qui est aussi ce que le mobile produit par un
   * double-tap, seul geste de fin disponible sans clavier.
   */
  const finishDraw = useCallback(() => {
    if (!draw || !drawing) return false;
    if (!canFinishFreeDraw(draw)) return false;
    const step = freeDrawFinish(draw);
    setDraw(step.state);
    setDrawNotice(step.rejected ?? null);
    if (step.commit) drawing.onCreateEntity(step.commit);
    return true;
  }, [draw, drawing]);

  /**
   * §4/§6/§8 — touches consommées par le plan, dans l'ordre de spécificité.
   *
   * `Échap` passe avant tout : c'est la sortie de secours, et elle doit marcher même quand un
   * geste est à moitié fait. `Suppr` n'agit qu'en dehors d'un tracé en cours — pendant un
   * tracé, la seule chose qu'on veut supprimer est ce tracé, et c'est `Échap` qui le fait.
   */
  const onCanvasKeyDown = useCallback(
    (key: string) => {
      if (key === "Escape" && draw && isFreeDrawInProgress(draw)) {
        // §6 — annulation SANS historique : rien n'ayant été enregistré, il n'y a rien à défaire.
        setDraw(freeDrawCancel(draw));
        setDrawNotice("Tracé en cours annulé.");
        return true;
      }
      if (key === "Enter") return finishDraw();
      if ((key === "Delete" || key === "Backspace") && drawing && selection.length > 0) {
        // La sélection part telle quelle : le parent seul sait ce qui lui appartient (§8).
        drawing.onDeleteEntities(selection);
        applySelection(EMPTY_SELECTION);
        return true;
      }
      return false;
    },
    [draw, drawing, finishDraw, applySelection, selection],
  );

  const selectedHandle = useMemo(
    () => handles.find((handle) => handle.entityId === selectedEntityId) ?? null,
    [handles, selectedEntityId],
  );

  return (
    <div className={styles.workspace} data-properties={toolbar.propertiesOpen ? "open" : "closed"}>
      <AtelierToolbar
        state={effectiveState}
        hasSelection={selection.length > 0}
        editingAvailable={editingAvailable}
        drawingAvailable={drawingAvailable}
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
        onCanvasClick={drawTool ? onDrawClick : feedbackVisible ? onCanvasClick : undefined}
        onCanvasHover={snapFeedbackVisible ? onCanvasHover : undefined}
        onCanvasDoubleClick={drawTool ? finishDraw : undefined}
        onCanvasKeyDown={drawing ? onCanvasKeyDown : undefined}
        status={
          <>
            <span>{entityCount} entités</span>
            {editMode && <span>{editableCount} sommets réglables</span>}
            {/*
              §6/§14 — la consigne du tracé en cours passe avant tout le reste : c'est la seule
              information qui dit ce que le prochain geste va faire, et c'est aussi la seule que
              le mobile ne peut pas déduire d'un survol.
            */}
            {draw && <span aria-live="polite">{drawNotice ?? freeDrawHint(draw)}</span>}
            {draw && canFinishFreeDraw(draw) && (
              // Sans clavier, `Entrée` n'existe pas et le double-tap n'est pas une évidence :
              // un bouton explicite est le seul moyen sûr de terminer une polyligne au doigt (§14).
              <button type="button" className={styles.statusAction} onClick={finishDraw}>
                Terminer la polyligne
              </button>
            )}
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
              snapPoint={snapFeedbackVisible ? snapCandidate?.position ?? null : null}
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
            {draw && (
              <FreeDrawPreviewLayer state={draw} cursor={drawCursor} view={frameView} size={frameSize} />
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
