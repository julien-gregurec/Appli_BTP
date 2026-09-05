"use client";

/**
 * Assemblage viewport + barre d'outils + panneau propriétés (§9/§10/§11).
 *
 * C'est la brique que le futur Atelier montera à la place de son aperçu statique. La sélection
 * est CONTRÔLÉE : `selectedEntityId` / `onSelectEntity` sont fournis par le parent, de sorte que
 * le jour où le hit-testing géométrique complet arrivera, il remplacera la source des
 * sélections sans toucher à cette composition.
 *
 * Limites assumées de ce lot : aucune modification de forme, aucun sommet éditable, aucun snap,
 * aucun undo/redo, aucun import photo, aucun appel au moteur géométrique.
 */

import { useCallback, useMemo, useState } from "react";
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
};

export function AtelierViewportWorkspace({
  scene,
  selectedEntityId,
  onSelectEntity,
  initialToolbarState = DEFAULT_TOOLBAR_STATE,
  viewKey,
}: AtelierViewportWorkspaceProps) {
  const [toolbar, setToolbar] = useState<ToolbarState>(initialToolbarState);
  const controller = usePlanViewport({ bounds: scene.bounds, viewKey });

  const details = useMemo(() => describeSceneEntity(scene, selectedEntityId), [scene, selectedEntityId]);
  const entityCount = useMemo(() => countSceneEntities(scene), [scene]);

  const onSelectTool = useCallback((tool: AtelierTool) => {
    setToolbar((current) => selectTool(current, tool));
  }, []);

  const onAction = useCallback(
    (action: ToolbarActionId) => {
      if (action === "grid") setToolbar(toggleGrid);
      else if (action === "properties") setToolbar(toggleProperties);
      else controller.recenter();
    },
    [controller],
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
        tool={toolbar.tool}
        onBackgroundClick={() => onSelectEntity(null)}
        status={
          <>
            <span>{entityCount} entités</span>
            {details && <span>Sélection : {details.label}</span>}
          </>
        }
      >
        {({ view, size, consumeDrag }) => (
          <PlanSceneLayer
            scene={scene}
            view={view}
            size={size}
            selectedEntityId={selectedEntityId}
            onPickEntity={
              canSelectEntities(toolbar)
                ? (entityId) => {
                    if (consumeDrag()) return;
                    pickEntity(entityId);
                  }
                : undefined
            }
          />
        )}
      </PlanViewport>

      <PropertiesSheet open={toolbar.propertiesOpen} details={details} onClose={closeProperties} floating />
    </div>
  );
}
