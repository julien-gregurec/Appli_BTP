"use client";

import { useEffect, useState } from "react";
import { AUTOSAVE_LABELS, AutosaveController, ReleveConflictError, type AutosaveState } from "@elsatia/releve-domain";
import styles from "./releve.module.css";

type Values = Record<string, unknown>;

const shallowEqual = (a: Values, b: Values) => Object.keys({ ...a, ...b }).every((key) => Object.is(a[key], b[key]));

/**
 * Enregistrement automatique des champs d'UN nœud (chantier, bâtiment, étage, zone, pièce).
 * Un seul contrôleur par nœud : tous ses champs partagent la même révision, si bien que deux
 * champs modifiés à la suite ne se contredisent pas, tandis qu'une modification faite ailleurs
 * (autre onglet, autre utilisateur) est détectée et jamais écrasée.
 * Le composant appelant est monté avec `key={node.id}`.
 */
export function useNodeAutosave<T extends Values>(initial: T, revision: number, save: (patch: Partial<T>, revision: number) => Promise<number>) {
  // `save` est figé à la création : les appelants le mémorisent (useCallback) et sont montés
  // avec `key={node.id}`, si bien qu'il ne change pas pendant la vie du contrôleur.
  const [state, setState] = useState<AutosaveState<T>>({ status: "idle", value: initial, savedValue: initial, revision, error: null });
  const [controller] = useState(() => {
    const created: AutosaveController<T> = new AutosaveController<T>({
      value: initial, revision,
      equals: shallowEqual as (a: T, b: T) => boolean,
      isConflict: (error) => error instanceof ReleveConflictError,
      onChange: setState,
      save: (value, expected) => {
        const saved = created.current.savedValue;
        const patch = Object.fromEntries(Object.entries(value).filter(([key, item]) => !Object.is(item, saved[key]))) as Partial<T>;
        return save(patch, expected);
      },
    });
    return created;
  });

  // Nouvelle révision venue du serveur (rechargement) : on repart d'elle si rien n'est en attente.
  useEffect(() => {
    const current = controller.current;
    if (revision > current.revision && (current.status === "idle" || current.status === "saved")) controller.reset(initial, revision);
  }, [controller, initial, revision]);
  useEffect(() => () => { void controller.flush(); controller.dispose(); }, [controller]);

  return {
    values: state.value,
    state,
    set: <K extends keyof T>(key: K, value: T[K]) => controller.edit({ ...controller.current.value, [key]: value }),
    flush: () => controller.flush(),
    retry: () => controller.retry(),
    reset: (value: T, next: number) => controller.reset(value, next),
  };
}

/** Pastille d'état : Enregistrement… / Enregistré / Échec — réessayer / Modifié ailleurs — recharger. */
export function AutosaveBadge({ state, onRetry, onReload, label }: { state: AutosaveState<unknown>; onRetry(): void; onReload(): void; label?: string }) {
  return <span className={styles.autosave} data-status={state.status} role="status" aria-live="polite" aria-label={label ? `${label} : ${AUTOSAVE_LABELS[state.status] || "à jour"}` : undefined}>
    {AUTOSAVE_LABELS[state.status]}
    {state.status === "error" && <button type="button" className={styles.linkButton} onClick={onRetry}>Réessayer</button>}
    {state.status === "conflict" && <button type="button" className={styles.linkButton} onClick={onReload}>Recharger</button>}
  </span>;
}
