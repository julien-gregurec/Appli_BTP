"use client";

/**
 * Assemblage viewport + barre d'outils + panneau propriétés (§9/§10/§11).
 *
 * C'est la brique que le futur Atelier montera à la place de son aperçu statique. La sélection
 * est CONTRÔLÉE : `selectedEntityId` / `onSelectEntity` sont fournis par le parent, de sorte que
 * le jour où le hit-testing géométrique complet arrivera, il remplacera la source des
 * sélections sans toucher à cette composition.
 *
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §7 — la sélection vient désormais du hit-test géométrique :
 * le clic est converti en point MONDE, puis `hitTest` désigne l'entité la plus pertinente dans
 * la tolérance. Le clic à vide désélectionne. La couche de rendu ne porte plus aucune zone de
 * clic : elle dessine, elle n'écoute plus.
 *
 * Le point d'accrochage est CALCULÉ et AFFICHÉ, jamais appliqué (§11) : ce lot pose la fondation,
 * il n'édite pas la géométrie.
 *
 * Limites assumées : aucune modification de forme, aucun sommet éditable, aucun undo/redo,
 * aucun import photo, aucun appel au moteur géométrique.
 */

import { useCallback, useMemo, useState } from "react";
import { hitTest } from "@/lib/geometry/hit-test";
import { snap } from "@/lib/geometry/snap";
import { resolveGridStep } from "@/lib/viewport/grid";
import { screenToWorld, type ScreenPoint } from "@/lib/viewport/viewport-math";
import { selectionTolerancePx, snapTolerancePx, toleranceWorldFor, type PointerPrecision } from "@/lib/viewport/pointer-targeting";
import { usePlanViewport } from "./use-plan-viewport";
import { PlanViewport } from "./PlanViewport";
import { PlanSceneLayer } from "./PlanSceneLayer";
import { AtelierToolbar } from "./AtelierToolbar";
import { PropertiesSheet } from "./PropertiesSheet";
import { canSelectEntities, DEFAULT_TOOLBAR_STATE, selectTool, toggleGrid, toggleProperties, type AtelierTool, type ToolbarActionId, type ToolbarState } from "./toolbar-model";
import { countSceneEntities, describeSceneEntity, type PlanScene } from "./plan-scene";
import styles from "./viewport.module.css";

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
  /**
   * TRACING-WORKSHOP-UI-V1 §12/§16 — barre d'outils CONTRÔLÉE.
   *
   * Fournir `toolbarState` + `onToolbarStateChange` transfère l'état au parent : l'Atelier
   * peut alors partager un même interrupteur de grille entre sa barre et son panneau Grille,
   * au lieu d'avoir deux vérités qui se contredisent à l'écran. Sans ces props, la barre
   * reste autonome, exactement comme avant ce lot.
   */
  toolbarState?: ToolbarState;
  onToolbarStateChange?: (next: ToolbarState) => void;
  /** Pas de grille imposé (§16) ; `null` laisse le pas suivre le zoom. */
  gridStepMm?: number | null;
  /** Cotations du modèle (§15). */
  showDimensions?: boolean;
  /** Étiquettes des points et des cotes. */
  showLabels?: boolean;
};

export function AtelierViewportWorkspace({
  scene,
  selectedEntityId,
  onSelectEntity,
  initialToolbarState = DEFAULT_TOOLBAR_STATE,
  viewKey,
  toolbarState,
  onToolbarStateChange,
  gridStepMm = null,
  showDimensions = false,
  showLabels = true,
}: AtelierViewportWorkspaceProps) {
  const [internalToolbar, setInternalToolbar] = useState<ToolbarState>(initialToolbarState);
  const toolbar = toolbarState ?? internalToolbar;

  // Un seul point de mutation pour les deux régimes : les gestionnaires ci-dessous ignorent
  // complètement de savoir qui détient l'état.
  const setToolbar = useCallback(
    (update: (current: ToolbarState) => ToolbarState) => {
      if (toolbarState && onToolbarStateChange) onToolbarStateChange(update(toolbarState));
      else setInternalToolbar(update);
    },
    [toolbarState, onToolbarStateChange],
  );
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);
  const controller = usePlanViewport({ bounds: scene.bounds, viewKey });

  const details = useMemo(() => describeSceneEntity(scene, selectedEntityId), [scene, selectedEntityId]);
  const entityCount = useMemo(() => countSceneEntities(scene), [scene]);

  // Dérivé du mode courant plutôt que remis à zéro par un effet : passer en « Déplacer » éteint
  // aussitôt le survol et l'accrochage, sans état résiduel à nettoyer.
  const feedbackVisible = canSelectEntities(toolbar);

  // Le hit-test a besoin de la vue courante pour convertir un pixel en millimètres. Ces
  // gestionnaires sont donc reconstruits à chaque changement de vue — c'est sans coût : pendant
  // un pan, la couche SVG se redessine de toute façon à chaque trame, et rien ici n'est mémoïsé
  // plus haut. Lire la vue dans une ref pour l'éviter serait un accès de ref pendant le rendu,
  // c'est-à-dire un moyen fiable de désigner l'entité d'après un zoom périmé.
  const { view, size } = controller;

  /** Point monde d'un point écran local, à la vue courante. */
  const worldOf = useCallback((local: ScreenPoint) => screenToWorld(local, view, size), [view, size]);

  const onSelectTool = useCallback(
    (tool: AtelierTool) => {
      setToolbar((current) => selectTool(current, tool));
    },
    [setToolbar],
  );

  const onAction = useCallback(
    (action: ToolbarActionId) => {
      if (action === "grid") setToolbar(toggleGrid);
      else if (action === "properties") setToolbar(toggleProperties);
      else controller.recenter();
    },
    [controller, setToolbar],
  );

  const closeProperties = useCallback(() => {
    setToolbar((current) => (current.propertiesOpen ? toggleProperties(current) : current));
  }, [setToolbar]);

  const pickEntity = useCallback(
    (entityId: string) => {
      onSelectEntity(entityId);
      setToolbar((current) => (current.propertiesOpen ? current : toggleProperties(current)));
    },
    [onSelectEntity, setToolbar],
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
   * §9 — survol : l'entité qu'un clic prendrait, et le point d'accrochage qu'un futur outil
   * d'édition proposerait. Purement visuel — rien n'est appliqué, rien n'est enregistré (§11).
   */
  const onCanvasHover = useCallback(
    (local: ScreenPoint | null, precision: PointerPrecision) => {
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
        gridStepMm: resolveGridStep(view.scale, gridStepMm),
      });
      setSnapPoint(candidate ? candidate.position : null);
    },
    [gridStepMm, scene, view, worldOf],
  );

  return (
    <div className={styles.workspace} data-properties={toolbar.propertiesOpen ? "open" : "closed"}>
      <AtelierToolbar
        state={toolbar}
        hasSelection={Boolean(selectedEntityId)}
        onSelectTool={onSelectTool}
        onAction={onAction}
      />

      <PlanViewport
        controller={controller}
        label={`Plan interactif — ${scene.name}`}
        gridVisible={toolbar.gridVisible}
        gridStepMm={gridStepMm}
        tool={toolbar.tool}
        onCanvasClick={canSelectEntities(toolbar) ? onCanvasClick : undefined}
        onCanvasHover={canSelectEntities(toolbar) ? onCanvasHover : undefined}
        status={
          <>
            <span>{entityCount} entités</span>
            {details && <span>Sélection : {details.label}</span>}
          </>
        }
      >
        {({ view: frameView, size: frameSize }) => (
          <PlanSceneLayer
            scene={scene}
            view={frameView}
            size={frameSize}
            selectedEntityId={selectedEntityId}
            hoveredEntityId={feedbackVisible ? hoveredEntityId : null}
            snapPoint={feedbackVisible ? snapPoint : null}
            showDimensions={showDimensions}
            showLabels={showLabels}
          />
        )}
      </PlanViewport>

      <PropertiesSheet open={toolbar.propertiesOpen} details={details} onClose={closeProperties} floating />
    </div>
  );
}
