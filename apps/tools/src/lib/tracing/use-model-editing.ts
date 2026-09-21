"use client";

/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §9/§10 — source unique des réglages d'un modèle.
 *
 * ## Une seule source, deux entrées
 *
 * Le formulaire et les poignées écrivent le MÊME état. Il n'existe pas de « valeurs du
 * viewport » distinctes des « valeurs du formulaire » : les deux appellent `commitValues`,
 * qui empile l'historique, met à jour le projet et déclenche l'autosave. C'est ce qui rend
 * l'exigence §10 structurelle plutôt que surveillée — il n'y a rien à synchroniser, donc rien
 * qui puisse diverger.
 *
 * ## Pourquoi la prévisualisation est un état SÉPARÉ
 *
 * Pendant un glissement, la géométrie doit suivre le doigt à chaque trame, mais rien ne doit
 * être enregistré ni empilé. La tentation serait d'écrire dans `values` et de ne « valider »
 * qu'au relâchement — c'est un piège : au relâchement, l'état d'avant le geste aurait déjà
 * été écrasé par la dernière trame, et l'entrée d'historique aurait un `before` égal à son
 * `after`. Annuler ne ferait alors plus rien.
 *
 * `preview` est donc un calque transitoire posé PAR-DESSUS `values`, jamais dedans. `values`
 * ne change qu'à la validation, et porte toujours l'état réellement enregistré.
 *
 * ## Ce qui est persisté
 *
 * Les SURCHARGES (`modelParams`), pas les valeurs effectives : les défauts appartiennent au
 * modèle (§4 du bridge Engine B). Un changement de modèle ou de projet remet à zéro les
 * valeurs ET l'historique — annuler vers les paramètres d'un autre modèle n'aurait aucun sens.
 */

import { useCallback, useMemo, useState } from "react";
import { traceModelDefaults, type TraceModelDescriptor } from "../geometry/models/catalog";
import {
  EMPTY_PARAM_HISTORY,
  canRedo as canRedoHistory,
  canUndo as canUndoHistory,
  overridesForProject,
  overridesOf,
  pushParamHistory,
  redoParamHistory,
  undoParamHistory,
  valuesOf,
  type ParamHistory,
  type ParamOverrides,
} from "./param-history";

export type ModelEditingOptions = {
  /** Modèle en cours de réglage. `undefined` : aucun réglage possible (tracé sans modèle). */
  descriptor: TraceModelDescriptor | undefined;
  /** Surcharges déjà enregistrées dans le projet — lues UNIQUEMENT à la (ré)initialisation. */
  initialOverrides: Readonly<ParamOverrides> | undefined;
  /**
   * Identité de ce qui est réglé : projet + modèle. Un changement remet valeurs et historique
   * à plat, sans effet de nettoyage et donc sans rendu intermédiaire incohérent.
   */
  modelKey: string;
  /** Enregistrement réel : projet + autosave. Jamais appelé pendant une prévisualisation. */
  onPersist: (overrides: ParamOverrides | undefined) => void;
};

export type ModelEditingAnnouncement = { kind: "undo" | "redo"; label: string };

export type ModelEditing = {
  /** Valeurs effectives à afficher et à résoudre — prévisualisation comprise. */
  values: Record<string, number>;
  /** Valeurs réellement enregistrées, hors prévisualisation. */
  committedValues: Record<string, number>;
  defaults: Record<string, number>;
  /** `true` pendant un glissement : le parent peut surseoir à un travail coûteux. */
  previewing: boolean;
  /** Saisie au formulaire — fusionnée avec les frappes voisines du même champ (§7). */
  setValueFromForm: (paramId: string, value: number, label: string) => void;
  /** Glissement en cours : afficher sans enregistrer. */
  previewValues: (values: Record<string, number>) => void;
  /** Fin de geste : historique + projet + autosave. */
  commitValues: (values: Record<string, number>, label: string, source: string, coalesce?: boolean) => void;
  /** Retour aux valeurs proposées par le modèle — annulable comme le reste. */
  resetToDefaults: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Dernière annulation ou rétablissement joué, pour un retour visible et annoncé. */
  announcement: ModelEditingAnnouncement | null;
};

type EditingState = {
  key: string;
  values: Record<string, number>;
  history: ParamHistory;
};

const NO_DEFAULTS: Record<string, number> = {};

export function useModelEditing({
  descriptor,
  initialOverrides,
  modelKey,
  onPersist,
}: ModelEditingOptions): ModelEditing {
  const defaults = useMemo(() => (descriptor ? traceModelDefaults(descriptor) : NO_DEFAULTS), [descriptor]);

  const [state, setState] = useState<EditingState>(() => ({
    key: modelKey,
    values: valuesOf(defaults, initialOverrides),
    history: EMPTY_PARAM_HISTORY,
  }));
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [announcement, setAnnouncement] = useState<ModelEditingAnnouncement | null>(null);

  // Réinitialisation dérivée du changement d'identité, pas d'un effet : un effet provoquerait
  // un rendu avec les paramètres de l'ancien modèle, donc une géométrie fausse le temps d'une
  // trame — voire refusée par le résolveur si les paramètres n'existent pas sur le nouveau.
  if (state.key !== modelKey) {
    setState({ key: modelKey, values: valuesOf(defaults, initialOverrides), history: EMPTY_PARAM_HISTORY });
    setPreview(null);
    setAnnouncement(null);
  }

  const commitValues = useCallback(
    (nextValues: Record<string, number>, label: string, source: string, coalesce = false) => {
      setPreview(null);
      setAnnouncement(null);
      const after = overridesOf(nextValues, defaults);
      setState((current) => {
        const before = overridesOf(current.values, defaults);
        return {
          key: current.key,
          values: nextValues,
          history: pushParamHistory(current.history, { label, source, coalesce, before, after }),
        };
      });
      onPersist(overridesForProject(after));
    },
    [defaults, onPersist],
  );

  const setValueFromForm = useCallback(
    (paramId: string, value: number, label: string) => {
      // On part des valeurs ENREGISTRÉES, jamais d'une prévisualisation en cours : la saisie
      // au clavier et le glissement d'une poignée ne peuvent pas coexister, et bâtir sur un
      // calque transitoire rendrait le `before` de l'historique incohérent avec son `after`.
      // Clé de fusion par champ : taper « 2400 » ne doit coûter qu'une seule annulation (§7).
      commitValues({ ...state.values, [paramId]: value }, label, `form:${paramId}`, true);
    },
    [commitValues, state.values],
  );

  const previewValues = useCallback((values: Record<string, number>) => {
    setPreview(values);
  }, []);

  const resetToDefaults = useCallback(() => {
    commitValues({ ...defaults }, "Valeurs du modèle", "reset", false);
  }, [commitValues, defaults]);

  /**
   * Annuler et rétablir partagent la même mécanique : jouer un mouvement de la pile, restaurer
   * les surcharges qu'il porte, et les enregistrer. Le mouvement est calculé UNE fois — le
   * recalculer dans le `setState` risquerait de le rejouer deux fois en mode strict.
   */
  const move = useCallback(
    (kind: "undo" | "redo") => {
      const played = kind === "undo" ? undoParamHistory(state.history) : redoParamHistory(state.history);
      if (!played) return;
      setPreview(null);
      setAnnouncement({ kind, label: played.label });
      setState((current) => ({
        key: current.key,
        values: valuesOf(defaults, played.overrides),
        history: played.history,
      }));
      onPersist(overridesForProject(played.overrides));
    },
    [defaults, onPersist, state.history],
  );

  const undo = useCallback(() => move("undo"), [move]);
  const redo = useCallback(() => move("redo"), [move]);

  return {
    values: preview ?? state.values,
    committedValues: state.values,
    defaults,
    previewing: preview !== null,
    setValueFromForm,
    previewValues,
    commitValues,
    resetToDefaults,
    undo,
    redo,
    canUndo: canUndoHistory(state.history),
    canRedo: canRedoHistory(state.history),
    announcement,
  };
}
