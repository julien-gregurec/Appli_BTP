"use client";

/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §2/§4/§7/§8 — plan de travail du tracé libre.
 *
 * Ce composant est au tracé libre ce que `ResolvedModelViewport` est au modèle paramétrique :
 * le point où la source rencontre le viewport. Il possède l'état (`useFreeDrawing`), en dérive
 * la scène et les poignées, et relaie les intentions du viewport vers le hook.
 *
 * Trois choix méritent d'être dits :
 *
 * - **la scène est DÉRIVÉE du tracé, jamais tenue à part.** `freeGeometryToShape` est appelée à
 *   chaque changement, et c'est volontaire : garder une scène en mémoire à côté du document
 *   créerait la seconde source de vérité que tout ce lot s'attache à éviter. Le coût est celui
 *   d'une recopie de sommets, mesuré au repère de charge du lot (§16) ;
 * - **le cadre demandé est la FEUILLE, pas le contenu.** Le cadrage automatique du viewport suit
 *   les bornes tant que l'utilisateur n'a pas déplacé le plan : des bornes collées au tracé
 *   feraient donc changer l'échelle à chaque primitive posée, et l'on tracerait sur un fond qui
 *   bouge. L'export, lui, demande le cadre du contenu — cf. `freeSceneBounds` ;
 * - **la sélection est ÉLAGUÉE sur la scène.** Supprimer une entité doit la faire disparaître
 *   de la sélection, sinon le panneau propriétés continuerait d'annoncer une entité qui n'est
 *   plus là. `retainExisting` le fait par dérivation, sans effet de nettoyage ;
 * - **`editing` est fourni pour ses POIGNÉES et son historique, pas pour ses paramètres.** Un
 *   tracé libre n'a pas de `modelParams` : les deux rappels paramétriques ne sont jamais
 *   appelés, parce qu'aucune poignée de ce plan ne porte de `drives` (§7). Les passer inertes
 *   plutôt que de scinder l'API garde un seul chemin de geste dans le viewport — donc un seul
 *   endroit où l'arbitrage pan / poignée est écrit et vérifié.
 */

import { useCallback, useMemo, useState } from "react";
import {
  AtelierViewportWorkspace,
  type AtelierEditingApi,
  type AtelierFreeDrawingApi,
} from "@/components/atelier/viewport";
import { countFreeEntitiesByKind, freeGeometryLength, type FreeGeometry } from "@/lib/tracing/free-geometry";
import { freeContourTotals } from "@/lib/tracing/free-contour";
import { buildFreeVertexHandles } from "@/lib/tracing/free-handles";
import { freeGeometryToShape } from "@/lib/tracing/free-shape";
import { useFreeDrawing } from "@/lib/tracing/use-free-drawing";
import { useUndoRedoShortcuts } from "@/lib/tracing/use-undo-redo-shortcuts";
import { EMPTY_SELECTION, retainExisting } from "@/lib/viewport/selection-set";
import { formatMillimetres, formatSquareMetres } from "@/components/atelier/viewport";

export type FreeDrawingBoardProps = {
  projectId: string;
  projectName: string;
  /** Tracé enregistré du projet — lu à l'initialisation, puis possédé par le hook. */
  geometry: FreeGeometry | undefined;
  /** Écriture réelle : projet + autosave. Le composant ne connaît ni IndexedDB ni le projet. */
  onPersist: (geometry: FreeGeometry | undefined) => void;
};

/** Les paramètres n'ont pas de sens sur un tracé libre : ces deux voies restent inertes (§7). */
function noParams() {}

export function FreeDrawingBoard({ projectId, projectName, geometry, onPersist }: FreeDrawingBoardProps) {
  const drawingState = useFreeDrawing({
    initialGeometry: geometry,
    projectKey: `${projectId}::libre`,
    onPersist,
  });
  const [selection, setSelection] = useState<readonly string[]>(EMPTY_SELECTION);

  const scene = useMemo(
    () => freeGeometryToShape(drawingState.geometry, { id: `libre-${projectId}`, name: projectName, frame: "sheet" }),
    [drawingState.geometry, projectId, projectName],
  );
  const handles = useMemo(() => buildFreeVertexHandles(drawingState.geometry), [drawingState.geometry]);

  // Une entité supprimée doit quitter la sélection : la dériver de la scène le garantit sans
  // qu'aucun geste ait à y penser.
  const liveSelection = useMemo(
    () => retainExisting(selection, new Set(drawingState.geometry.entities.map((entity) => entity.id))),
    [drawingState.geometry, selection],
  );

  useUndoRedoShortcuts({ onUndo: drawingState.undo, onRedo: drawingState.redo });

  const editing = useMemo<AtelierEditingApi>(
    () => ({
      handles,
      onPreviewParams: noParams,
      onCommitParams: noParams,
      canUndo: drawingState.canUndo,
      canRedo: drawingState.canRedo,
      onUndo: drawingState.undo,
      onRedo: drawingState.redo,
    }),
    [handles, drawingState.canUndo, drawingState.canRedo, drawingState.undo, drawingState.redo],
  );

  const drawing = useMemo<AtelierFreeDrawingApi>(
    () => ({
      onCreateEntity: (commit) => drawingState.createEntity(commit.kind, commit.points),
      onPreviewVertex: (move) => drawingState.previewVertex(move.entityId, move.index, move.position),
      onCommitVertex: (move) => drawingState.commitVertex(move.entityId, move.index, move.position),
      onDeleteEntities: (entityIds) => drawingState.deleteEntities(entityIds),
    }),
    [drawingState],
  );

  const onSelectEntity = useCallback((entityId: string | null) => {
    setSelection(entityId ? [entityId] : EMPTY_SELECTION);
  }, []);

  const counts = countFreeEntitiesByKind(drawingState.committedGeometry);
  const total = drawingState.committedGeometry.entities.length;

  /**
   * ATELIER-FREE-CONTOUR-AREA-V1 §13/§14 — report du tracé libre : ce que les contours mesurent.
   *
   * Calculé sur la géométrie ENGAGÉE, pas sur celle qui suit le doigt : un chiffre qui change
   * à chaque trame de glissement ne se lit pas, et il n'est de toute façon pas encore acquis.
   *
   * Deux règles de lecture, et ce sont celles de tout le lot : une surface non démontrable
   * n'est pas écrite « 0 m² » mais dite non exploitable, et le total ne compte que les contours
   * exploitables — en disant combien manquent, plutôt qu'en les additionnant à zéro.
   */
  const contours = useMemo(() => freeContourTotals(drawingState.committedGeometry), [drawingState.committedGeometry]);

  return (
    <div className="atelier-free-board">
      <AtelierViewportWorkspace
        scene={scene}
        selectedEntityId={liveSelection[0] ?? null}
        selectedEntityIds={liveSelection}
        onSelectEntity={onSelectEntity}
        onSelectEntities={setSelection}
        // Démarrer sur l'outil Segment plutôt que sur « Déplacer » : un plan de tracé libre
        // s'ouvre vide, et la première chose qu'on y fait est de tracer, pas de le déplacer.
        initialToolbarState={{ tool: "segment", gridVisible: true, propertiesOpen: false }}
        viewKey={`${projectId}::libre`}
        editing={editing}
        drawing={drawing}
      />

      <p className="atelier-free-summary" aria-live="polite">
        {total === 0
          ? "Aucune primitive libre pour l’instant : choisissez Point, Segment, Polyligne ou Contour, puis cliquez sur le plan."
          : `${total} primitive${total > 1 ? "s" : ""} — ${counts.point} point${counts.point > 1 ? "s" : ""}, ${counts.segment} segment${counts.segment > 1 ? "s" : ""}, ${counts.polyline} polyligne${counts.polyline > 1 ? "s" : ""}, ${counts.polygon} contour${counts.polygon > 1 ? "s" : ""} · développé ${formatMillimetres(freeGeometryLength(drawingState.committedGeometry))}`}
      </p>

      {contours.contourCount > 0 && (
        <p className="atelier-free-summary" aria-live="polite">
          {`${contours.contourCount} contour${contours.contourCount > 1 ? "s" : ""} · périmètre cumulé ${formatMillimetres(contours.perimeterMm)} · `}
          {contours.areaM2 === null
            ? "aucune surface exploitable"
            : `surface cumulée ${formatSquareMetres(contours.areaM2)}`}
          {contours.exploitableCount < contours.contourCount &&
            ` — ${contours.contourCount - contours.exploitableCount} contour${contours.contourCount - contours.exploitableCount > 1 ? "s" : ""} hors surface (contour croisé ou aplati)`}
        </p>
      )}

      <p className="atelier-feedback" aria-live="polite">
        {drawingState.error ??
          (drawingState.announcement
            ? `${drawingState.announcement.kind === "undo" ? "Annulé" : "Rétabli"} : ${drawingState.announcement.label}`
            : "")}
      </p>
    </div>
  );
}
