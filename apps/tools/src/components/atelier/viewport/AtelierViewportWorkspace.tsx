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
 * ## ATELIER-INTERSECTIONS-MULTISELECT-V1 §4/§5 — cycle et sélection multiple
 *
 * Le clic ne consulte plus `hitTest` mais `hitTestAll`, et confie la liste au cycle : re-cliquer
 * au même endroit descend d'un cran dans les entités superposées, ce qui rend enfin atteignable
 * l'axe qui passe SOUS celui que la priorité désigne. Les deux décisions — quel candidat, quelle
 * sélection en résulte — vivent dans des modules purs (`lib/viewport/selection-cycle.ts`,
 * `lib/viewport/selection-set.ts`) ; ce composant ne fait que les enchaîner.
 *
 * La sélection est doublement CONTRÔLÉE et rétro-compatible : `onSelectEntities` reçoit la liste
 * complète, `onSelectEntity` continue de recevoir l'entité principale. Un parent resté en
 * sélection unique fonctionne donc sans changement, et l'édition par poignée — qui ne connaît
 * qu'une entité (§9) — continue de viser la principale.
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
import { snap } from "@/lib/geometry/snap";
import { chooseGridStep } from "@/lib/viewport/grid";
import {
  advanceSelectionCycle,
  SELECTION_CYCLE_ANCHOR_PX,
  type SelectionCycleState,
} from "@/lib/viewport/selection-cycle";
import { applySelectionClick, EMPTY_SELECTION, primarySelection, selectionFromId } from "@/lib/viewport/selection-set";
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
import { PlanViewport } from "./PlanViewport";
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
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  /**
   * §5 — sélection multiple. Absente, la sélection reste celle de `selectedEntityId` et le
   * composant se comporte exactement comme avant ce lot.
   */
  selectedEntityIds?: readonly string[];
  /**
   * §5 — nouvelle sélection complète. Toujours appelée EN PLUS de `onSelectEntity`, jamais à sa
   * place : un parent qui n'écoute que la sélection simple continue d'être servi, et la
   * principale qu'il reçoit est bien celle de la liste — les deux ne peuvent pas diverger.
   */
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
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);
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
   * §4 — cycle de sélection. Une `ref` et non un état : le cycle ne se DESSINE pas, il ne fait
   * que mémoriser ce qu'a désigné le clic précédent. En faire un état déclencherait un rendu
   * supplémentaire à chaque clic sans qu'aucun pixel change.
   */
  const cycle = useRef<SelectionCycleState | null>(null);
  const controller = usePlanViewport({ bounds: scene.bounds, viewKey });

  /**
   * §5 — sélection effective. `selectedEntityIds` l'emporte quand le parent la fournit ; sinon on
   * relit la sélection simple. Le `useMemo` garde la référence stable tant que rien ne change,
   * ce dont dépendent les mémos en aval.
   */
  const selection = useMemo(
    () => selectedEntityIds ?? selectionFromId(selectedEntityId),
    [selectedEntityIds, selectedEntityId],
  );
  const selectionSummary = useMemo(() => describeSceneSelection(scene, selection), [scene, selection]);
  const multiple = selection.length > 1;

  // La fiche détaillée décrit la PRINCIPALE ; au-delà d'une entité, c'est le résumé qui est
  // affiché, et calculer une fiche qu'on n'affiche pas serait du travail perdu à chaque clic.
  const primaryId = primarySelection(selection);
  const details = useMemo(
    () => (multiple ? null : describeSceneEntity(scene, primaryId)),
    [multiple, scene, primaryId],
  );
  const entityCount = useMemo(() => countSceneEntities(scene), [scene]);

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

  /**
   * §5 — publie une nouvelle sélection sur les DEUX canaux, et ouvre le panneau si elle n'est
   * pas vide. L'entité principale est dérivée de la liste, jamais transmise à part : c'est ce
   * qui interdit à `selectedEntityId` et `selectedEntityIds` de se contredire.
   */
  const publishSelection = useCallback(
    (next: readonly string[]) => {
      onSelectEntities?.(next);
      onSelectEntity(primarySelection(next));
      if (next.length > 0) setToolbar((current) => (current.propertiesOpen ? current : toggleProperties(current)));
    },
    [onSelectEntities, onSelectEntity],
  );

  /**
   * §4/§5 — un clic désigne une entité, ou désélectionne si rien n'est assez proche.
   *
   * L'enchaînement est : tolérance écran → tolérance monde (§2, identique à l'œil quel que soit
   * le zoom) → `hitTestAll` (liste ordonnée, déterministe) → cycle (quel rang dans cette liste)
   * → règle de sélection (remplacer ou ajouter).
   *
   * Le cycle est nourri de la clé de vue et de l'identifiant de la scène : changer de modèle,
   * d'étape de chantier ou de paramètre change cette clé, ce qui referme le cycle sans qu'aucun
   * effet de nettoyage soit nécessaire (§4).
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
    (local: ScreenPoint, precision: PointerPrecision, additive: boolean) => {
      const world = worldOf(local);
      const tolerance = toleranceWorldFor(selectionTolerancePx(precision), view);
      const candidates = hitTestAll(scene, world, tolerance);

      const step = advanceSelectionCycle(cycle.current, {
        world,
        scale: view.scale,
        sceneKey: `${viewKey ?? ""}|${scene.id}`,
        candidateIds: candidates.map((candidate) => candidate.entityId),
        anchorToleranceWorld: toleranceWorldFor(SELECTION_CYCLE_ANCHOR_PX, view),
        // Composer une sélection ne doit pas déplacer la cible : le Maj+clic lit le rang
        // courant sans le faire tourner, faute de quoi il ne pourrait jamais rien retirer (§5).
        advance: !additive,
      });
      cycle.current = step.state;

      publishSelection(applySelectionClick(selection, step.entityId, additive));
    },
    [publishSelection, scene, selection, view, viewKey, worldOf],
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
        setDrawCursor(null);
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
        setSnapPoint(null);
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
        setSnapPoint(candidate?.position ?? null);

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
        setSnapPoint(null);
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
        publishSelection(EMPTY_SELECTION);
        return true;
      }
      return false;
    },
    [draw, drawing, finishDraw, publishSelection, selection],
  );

  // §9 — pas d'édition simultanée dans ce lot : au-delà d'une entité sélectionnée, aucune
  // poignée n'est mise en avant. Le panneau le dit explicitement plutôt que de laisser une
  // poignée orpheline suggérer que le réglage vaudrait pour tout le lot.
  const selectedHandle = useMemo(
    () => (multiple ? null : handles.find((handle) => handle.entityId === primaryId) ?? null),
    [handles, multiple, primaryId],
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
            ) : multiple ? (
              <span>{selection.length} éléments sélectionnés</span>
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
              selectedEntityIds={selection}
              hoveredEntityId={feedbackVisible ? hoveredEntityId : null}
              snapPoint={snapFeedbackVisible ? snapPoint : null}
            />
            {editMode && (
              <HandleLayer
                handles={handles}
                view={frameView}
                size={frameSize}
                activeHandleId={activeHandleId}
                selectedEntityId={multiple ? null : primaryId}
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
        selection={selectionSummary}
        handle={selectedHandle}
        onClose={closeProperties}
        floating
      />
    </div>
  );
}
