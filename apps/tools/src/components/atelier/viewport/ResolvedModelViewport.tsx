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
 */

import { useCallback, useMemo, useState } from "react";
import type { SiteStep } from "@/lib/geometry/shape-model";
import type { TracingModelResolution } from "@/lib/tracing/model-resolver";
import { buildModelResolutionViewModel } from "../model/model-resolution-view-model";
import { AtelierViewportWorkspace } from "./AtelierViewportWorkspace";
import { atelierViewKey, planSceneForStep, resolvedPlanScene } from "./resolved-scene";

export type ResolvedModelViewportProps = {
  resolution: TracingModelResolution;
  /** Identité du tracé — avec le modèle, elle décide quand le cadrage repart de zéro (§4). */
  projectId?: string;
  /** Étape de chantier active : restreint la visibilité si l'étape la déclare (§8). */
  activeStep?: SiteStep | null;
};

export function ResolvedModelViewport({ resolution, projectId, activeStep = null }: ResolvedModelViewportProps) {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const scene = resolvedPlanScene(resolution);
  const slug = resolution.status === "resolved" ? resolution.slug : undefined;

  // Changer de modèle rend la sélection précédente caduque : ses identifiants n'existent plus.
  const viewKey = atelierViewKey(projectId, slug);
  const [selectionKey, setSelectionKey] = useState(viewKey);
  if (selectionKey !== viewKey) {
    setSelectionKey(viewKey);
    setSelectedEntityId(null);
  }

  const stepScene = useMemo(() => (scene ? planSceneForStep(scene, activeStep) : null), [scene, activeStep]);

  const onSelectEntity = useCallback((entityId: string | null) => setSelectedEntityId(entityId), []);

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
      selectedEntityId={selectedEntityId}
      onSelectEntity={onSelectEntity}
    />
  );
}
