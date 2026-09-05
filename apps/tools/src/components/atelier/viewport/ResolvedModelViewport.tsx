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
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §5 — la sélection devient une LISTE. Elle reste locale à
 * la vue et hors persistance : désigner plusieurs entités ne modifie ni le projet, ni la
 * géométrie, ni l'export. Deux nettoyages la gardent cohérente sans effet de bord :
 * changer de modèle la vide (les identifiants n'existent plus), et changer d'étape de chantier
 * la RESTREINT aux entités encore visibles — vider dans ce cas punirait l'utilisateur qui avait
 * sélectionné trois entités dont deux subsistent à l'étape suivante.
 *
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 — `editing` est un simple relais vers l'écran parent, qui
 * détient les paramètres, l'historique et l'autosave. Ce composant continue de ne rien
 * posséder d'autre que la sélection : sans `editing`, il se comporte exactement comme avant
 * ce lot, ce qui laisse l'écran d'export en lecture seule sans branche conditionnelle.
 */

import { useCallback, useMemo, useState } from "react";
import { EMPTY_SELECTION, pruneSelection } from "@/lib/viewport/selection-set";
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
  const [selectedEntityIds, setSelectedEntityIds] = useState<readonly string[]>(EMPTY_SELECTION);

  const scene = resolvedPlanScene(resolution);
  const slug = resolution.status === "resolved" ? resolution.slug : undefined;

  // Changer de modèle rend la sélection précédente caduque : ses identifiants n'existent plus.
  const viewKey = atelierViewKey(projectId, slug);
  const [selectionKey, setSelectionKey] = useState(viewKey);
  if (selectionKey !== viewKey) {
    setSelectionKey(viewKey);
    setSelectedEntityIds(EMPTY_SELECTION);
  }

  const stepScene = useMemo(() => (scene ? planSceneForStep(scene, activeStep) : null), [scene, activeStep]);

  // Élagage DÉRIVÉ, pas corrigé par un effet : une entité masquée par l'étape courante ne doit
  // plus compter comme sélectionnée, et le rendu suivant part déjà de la bonne liste.
  // `pruneSelection` rend la même référence quand rien ne disparaît, ce qui laisse les mémos en
  // aval intacts dans le cas courant.
  const visibleSelection = useMemo(() => {
    if (!stepScene || selectedEntityIds.length === 0) return EMPTY_SELECTION;
    return pruneSelection(selectedEntityIds, new Set(listSceneEntities(stepScene).map((entity) => entity.id)));
  }, [stepScene, selectedEntityIds]);

  const onSelectEntities = useCallback((entityIds: readonly string[]) => setSelectedEntityIds(entityIds), []);
  // Conservé pour le contrat de `AtelierViewportWorkspace`, qui appelle toujours les deux : la
  // liste étant la source de vérité, ce rappel n'a rien à enregistrer de plus.
  const onSelectEntity = useCallback(() => {}, []);

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
      selectedEntityId={visibleSelection.at(-1) ?? null}
      onSelectEntity={onSelectEntity}
      selectedEntityIds={visibleSelection}
      onSelectEntities={onSelectEntities}
      editing={editing}
    />
  );
}
