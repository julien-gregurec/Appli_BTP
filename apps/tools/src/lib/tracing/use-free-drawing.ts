"use client";

/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §9/§10 — source unique du tracé libre d'un projet.
 *
 * Jumeau exact de `use-model-editing.ts`, pour la source libre au lieu des `modelParams`, et
 * les deux hooks partagent leur architecture pour une raison précise : ce qui rendait §10 du
 * lot précédent structurel — « il n'y a rien à synchroniser, donc rien qui puisse diverger » —
 * doit rester vrai maintenant que trois gestes écrivent au lieu d'un.
 *
 * ## Un seul chemin d'écriture, trois entrées
 *
 * Créer, déplacer et supprimer aboutissent tous à `commit`, qui fait dans cet ordre et sans
 * exception : appliquer l'opération, l'empiler, persister. Aucun geste ne peut donc oublier
 * l'historique, ni l'autosave — et « annuler » n'est pas un quatrième chemin, c'est le même,
 * avec une opération jouée à l'envers.
 *
 * ## Pourquoi la prévisualisation est un état SÉPARÉ
 *
 * Pendant un glissement de sommet, la géométrie doit suivre le doigt à chaque trame, sans rien
 * enregistrer. Écrire dans `geometry` et « valider » au relâchement serait un piège identique
 * à celui décrit dans `use-model-editing.ts` : au relâchement, la position d'AVANT le geste
 * aurait déjà été écrasée par la dernière trame, et l'opération empilée aurait un `before`
 * égal à son `after`. Annuler ne ferait alors plus rien.
 *
 * `preview` est donc un calque transitoire posé PAR-DESSUS `geometry`, jamais dedans.
 *
 * ## Ce qui est persisté
 *
 * Le document libre lui-même, car il EST la source (§1). C'est la différence avec le modèle
 * paramétrique, dont on ne persiste que les écarts aux défauts : ici, il n'existe aucun défaut
 * à partir duquel régénérer quoi que ce soit. L'HISTORIQUE, lui, reste en mémoire et n'empile
 * que des opérations (§9) — jamais des instantanés du tracé.
 */

import { useCallback, useMemo, useState } from "react";
import {
  createFreeEntity,
  deletableFreeEntityIds,
  EMPTY_FREE_GEOMETRY,
  findFreeEntity,
  freeEntityLabel,
  freeEntityVertex,
  moveFreeVertex,
  nextFreeEntityId,
  removeFreeEntities,
  type FreeEntity,
  type FreeEntityKind,
  type FreeGeometry,
  type FreeVertex,
} from "./free-geometry";
import {
  applyFreeOperation,
  canRedoFree,
  canUndoFree,
  EMPTY_FREE_HISTORY,
  pushFreeHistory,
  redoFreeHistory,
  undoFreeHistory,
  type FreeEditOperation,
  type FreeHistory,
} from "./free-history";

export type FreeDrawingOptions = {
  /** Tracé déjà enregistré dans le projet — lu UNIQUEMENT à la (ré)initialisation. */
  initialGeometry: FreeGeometry | undefined;
  /**
   * Identité de ce qui est tracé. Un changement remet tracé ET historique à plat, sans effet
   * de nettoyage et donc sans rendu intermédiaire incohérent.
   */
  projectKey: string;
  /** Enregistrement réel : projet + autosave. Jamais appelé pendant une prévisualisation. */
  onPersist: (geometry: FreeGeometry | undefined) => void;
};

export type FreeDrawingAnnouncement = { kind: "undo" | "redo"; label: string };

export type FreeDrawing = {
  /** Tracé à afficher — prévisualisation comprise. */
  geometry: FreeGeometry;
  /** Tracé réellement enregistré, hors prévisualisation. */
  committedGeometry: FreeGeometry;
  /** `true` pendant un glissement : le parent peut surseoir à un travail coûteux. */
  previewing: boolean;
  /** §4 — valide une primitive complète. L'identifiant est attribué ici, de façon déterministe. */
  createEntity: (kind: FreeEntityKind, points: readonly FreeVertex[]) => void;
  /** §7 — glissement en cours : afficher sans enregistrer. */
  previewVertex: (entityId: string, index: number, position: FreeVertex) => void;
  /** §7 — fin de geste : historique + projet + autosave. */
  commitVertex: (entityId: string, index: number, position: FreeVertex) => void;
  /** §8 — supprime ce qui, dans la sélection, appartient au tracé libre. */
  deleteEntities: (entityIds: readonly string[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Dernier refus opposé à un geste (limite atteinte, entité introuvable), ou `null`. */
  error: string | null;
  /** Dernière annulation ou rétablissement joué, pour un retour visible et annoncé. */
  announcement: FreeDrawingAnnouncement | null;
};

type DrawingState = {
  key: string;
  geometry: FreeGeometry;
  history: FreeHistory;
};

/** `undefined` plutôt qu'un document vide : `TracingProject.freeGeometry` est optionnel. */
function forProject(geometry: FreeGeometry): FreeGeometry | undefined {
  return geometry.entities.length ? geometry : undefined;
}

export function useFreeDrawing({ initialGeometry, projectKey, onPersist }: FreeDrawingOptions): FreeDrawing {
  const [state, setState] = useState<DrawingState>(() => ({
    key: projectKey,
    geometry: initialGeometry ?? EMPTY_FREE_GEOMETRY,
    history: EMPTY_FREE_HISTORY,
  }));
  const [preview, setPreview] = useState<FreeGeometry | null>(null);
  const [announcement, setAnnouncement] = useState<FreeDrawingAnnouncement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Réinitialisation dérivée du changement d'identité, pas d'un effet : un effet provoquerait
  // un rendu avec le tracé de l'ancien projet, donc une géométrie fausse le temps d'une trame.
  if (state.key !== projectKey) {
    setState({ key: projectKey, geometry: initialGeometry ?? EMPTY_FREE_GEOMETRY, history: EMPTY_FREE_HISTORY });
    setPreview(null);
    setAnnouncement(null);
    setError(null);
  }

  /**
   * §9/§10 — SEUL chemin d'écriture. L'opération est appliquée puis empilée puis persistée,
   * dans cet ordre : appliquer d'abord permet de refuser un geste impossible (tracé plein,
   * entité disparue) AVANT d'avoir touché à l'historique, ce qui laisse toujours la pile
   * cohérente avec le tracé.
   */
  const commit = useCallback(
    (operation: FreeEditOperation, label: string, source: string, coalesce = false) => {
      setPreview(null);
      setAnnouncement(null);
      let applied: FreeGeometry;
      try {
        applied = applyFreeOperation(state.geometry, operation);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Ce geste n'a pas pu être appliqué au tracé.");
        return;
      }
      setError(null);
      setState((current) => ({
        key: current.key,
        geometry: applied,
        history: pushFreeHistory(current.history, { label, source, coalesce, operation }),
      }));
      onPersist(forProject(applied));
    },
    [onPersist, state.geometry],
  );

  const createEntity = useCallback(
    (kind: FreeEntityKind, points: readonly FreeVertex[]) => {
      let entity: FreeEntity;
      try {
        // L'identifiant est attribué au moment de la validation, à partir du tracé COURANT :
        // c'est ce qui le rend prévisible pour un test et jamais en collision, sans compteur
        // à faire vivre à côté du document.
        entity = createFreeEntity(kind, points, nextFreeEntityId(state.geometry, kind));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Cette primitive libre est invalide.");
        return;
      }
      commit({ kind: "create", entity }, freeEntityLabel(entity), `create:${entity.id}`);
    },
    [commit, state.geometry],
  );

  const previewVertex = useCallback(
    (entityId: string, index: number, position: FreeVertex) => {
      try {
        setPreview(moveFreeVertex(state.geometry, entityId, index, position));
      } catch {
        // Une prévisualisation impossible n'est pas une erreur à afficher : le geste n'a rien
        // enregistré, et le relâchement retombera de toute façon sur l'état courant.
        setPreview(null);
      }
    },
    [state.geometry],
  );

  const commitVertex = useCallback(
    (entityId: string, index: number, position: FreeVertex) => {
      const entity = findFreeEntity(state.geometry, entityId);
      const before = freeEntityVertex(state.geometry, entityId, index);
      if (!entity || !before) {
        setPreview(null);
        setError("Ce sommet n'existe plus dans le tracé.");
        return;
      }
      commit(
        { kind: "move-vertex", entityId, index, before, after: position },
        `${freeEntityLabel(entity)} — sommet ${index + 1}`,
        // Un glissement se valide une fois, au relâchement : deux glissements successifs sur
        // le même sommet restent deux gestes, donc deux annulations (§9).
        `vertex:${entityId}:${index}`,
      );
    },
    [commit, state.geometry],
  );

  const deleteEntities = useCallback(
    (entityIds: readonly string[]) => {
      // §8 — le filtre est ici et nulle part ailleurs : ce qui n'appartient pas au tracé libre
      // n'est pas supprimable, quelle que soit la sélection reçue. Une primitive dérivée
      // d'Engine B ne peut donc pas être atteinte par ce chemin.
      const deletable = deletableFreeEntityIds(state.geometry, entityIds);
      if (!deletable.length) {
        setError(
          entityIds.length
            ? "La sélection ne contient aucune primitive libre : rien n'a été supprimé."
            : null,
        );
        return;
      }
      const { removed } = removeFreeEntities(state.geometry, deletable);
      const label =
        removed.length === 1
          ? freeEntityLabel(removed[0].entity)
          : `${removed.length} primitives libres`;
      commit({ kind: "delete", removed }, label, `delete:${deletable.join(",")}`);
    },
    [commit, state.geometry],
  );

  /**
   * Annuler et rétablir partagent la même mécanique : jouer un mouvement de la pile, appliquer
   * le tracé qu'il produit, et l'enregistrer. Le mouvement est calculé UNE fois — le
   * recalculer dans le `setState` risquerait de le rejouer deux fois en mode strict.
   */
  const move = useCallback(
    (kind: "undo" | "redo") => {
      const played =
        kind === "undo" ? undoFreeHistory(state.history, state.geometry) : redoFreeHistory(state.history, state.geometry);
      if (!played) return;
      setPreview(null);
      setError(null);
      setAnnouncement({ kind, label: played.label });
      setState((current) => ({ key: current.key, geometry: played.geometry, history: played.history }));
      onPersist(forProject(played.geometry));
    },
    [onPersist, state.geometry, state.history],
  );

  const undo = useCallback(() => move("undo"), [move]);
  const redo = useCallback(() => move("redo"), [move]);

  const canUndo = useMemo(() => canUndoFree(state.history), [state.history]);
  const canRedo = useMemo(() => canRedoFree(state.history), [state.history]);

  return {
    geometry: preview ?? state.geometry,
    committedGeometry: state.geometry,
    previewing: preview !== null,
    createEntity,
    previewVertex,
    commitVertex,
    deleteEntities,
    undo,
    redo,
    canUndo,
    canRedo,
    error,
    announcement,
  };
}
