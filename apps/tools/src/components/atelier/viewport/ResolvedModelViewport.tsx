"use client";

/**
 * ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §2/§3/§4/§6/§7 — le viewport de l'Atelier
 * branché sur un modèle réellement résolu par Engine B.
 *
 * Ce composant n'appelle PAS le moteur : la résolution est faite une seule fois par l'écran
 * parent (elle sert aussi à la carte d'état et à l'export) et arrive ici en prop. Il ne fait
 * que deux choses :
 *
 *   - montrer la géométrie du modèle quand elle existe, via `AtelierViewportWorkspace` ;
 *   - montrer l'état UX déjà prévu (`buildModelResolutionViewModel`) quand elle n'existe pas
 *     — `none`, `unknown-model`, `invalid-params`, `failed`. Aucun de ces cas ne rend un
 *     écran vide ni ne laisse remonter d'exception (§2).
 *
 * La sélection est locale à la vue : désigner une entité ne modifie ni le projet, ni la
 * géométrie, ni l'export. Rien de ce qui est affiché ici n'est persisté (§11).
 *
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 — `editing` est un simple relais vers l'écran parent, qui
 * détient les paramètres, l'historique et l'autosave. Ce composant continue de ne rien
 * posséder d'autre que la sélection : sans `editing`, il se comporte exactement comme avant
 * ce lot, ce qui laisse l'écran d'export en lecture seule sans branche conditionnelle.
 */

import { useCallback, useMemo, useState } from "react";
import { EMPTY_SELECTION, primarySelection, retainExisting, type SelectionSet } from "@/lib/viewport/selection-set";
import type { SiteStep } from "@/lib/geometry/shape-model";
import type { TracingModelResolution } from "@/lib/tracing/model-resolver";
import { buildModelResolutionViewModel } from "../model/model-resolution-view-model";
import { AtelierViewportWorkspace, type AtelierEditingApi } from "./AtelierViewportWorkspace";
import { listSceneEntities } from "./plan-scene";
import { atelierViewKey, planSceneForStep, resolvedPlanScene } from "./resolved-scene";

export type ResolvedModelViewportProps = {
  resolution: TracingModelResolution;
  /** Identité du tracé — avec le modèle, elle décide quand le cadrage repart de zéro (§4). */
  projectId?: string;
  /** Étape de chantier active : restreint la visibilité si l'étape la déclare (§8). */
  activeStep?: SiteStep | null;
  /** Édition des sommets. Absente, le plan reste en lecture seule. */
  editing?: AtelierEditingApi;
};

export function ResolvedModelViewport({ resolution, projectId, activeStep = null, editing }: ResolvedModelViewportProps) {
  /**
   * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — la sélection est désormais un ENSEMBLE ordonné.
   * L'entité active en est dérivée (`primarySelection`), jamais stockée en double : deux états
   * pour une seule vérité finiraient par diverger sur un chemin oublié.
   */
  const [selection, setSelection] = useState<SelectionSet>(EMPTY_SELECTION);

  const scene = resolvedPlanScene(resolution);
  const slug = resolution.status === "resolved" ? resolution.slug : undefined;

  // Changer de modèle rend la sélection précédente caduque : ses identifiants n'existent plus.
  const viewKey = atelierViewKey(projectId, slug);
  const [selectionKey, setSelectionKey] = useState(viewKey);
  if (selectionKey !== viewKey) {
    setSelectionKey(viewKey);
    setSelection(EMPTY_SELECTION);
  }

  const stepScene = useMemo(() => (scene ? planSceneForStep(scene, activeStep) : null), [scene, activeStep]);

  /**
   * §7/§8 — une étape de chantier masque des entités : celles qui disparaissent quittent la
   * sélection. Sans cela, le panneau détaillerait un objet que le plan ne dessine plus, et le
   * compte affiché ne correspondrait à rien de visible. Dérivé, jamais recopié dans un état.
   */
  const visibleSelection = useMemo(() => {
    if (!stepScene || selection.length === 0) return EMPTY_SELECTION;
    return retainExisting(selection, new Set(listSceneEntities(stepScene).map((entity) => entity.id)));
  }, [stepScene, selection]);

  const onSelectEntities = useCallback((entityIds: readonly string[]) => setSelection(entityIds), []);
  // Conservé pour les composants écrits autour d'un identifiant unique : ils continuent de
  // fonctionner sans savoir qu'un ensemble existe.
  const onSelectEntity = useCallback(
    (entityId: string | null) => setSelection((current) => (primarySelection(current) === entityId ? current : entityId ? [entityId] : EMPTY_SELECTION)),
    [],
  );

  if (!stepScene) {
    const view = buildModelResolutionViewModel(resolution);
    return (
      <div className="atelier-empty" role={view.tone === "error" ? "alert" : undefined}>
        <span aria-hidden="true">◇</span>
        <h2>{view.title}</h2>
        <p>{view.message}</p>
      </div>
    );
  }

  return (
    <AtelierViewportWorkspace
      scene={stepScene}
      viewKey={viewKey}
      selectedEntityId={primarySelection(visibleSelection)}
      onSelectEntity={onSelectEntity}
      selectedEntityIds={visibleSelection}
      onSelectEntities={onSelectEntities}
      editing={editing}
    />
  );
}
