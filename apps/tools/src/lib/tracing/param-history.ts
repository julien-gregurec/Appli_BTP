/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §7 — pile d'annulation des réglages d'un modèle.
 *
 * ## Ce qui est empilé : la SOURCE, jamais la géométrie
 *
 * Une entrée porte les `modelParams` avant et après — c'est-à-dire les seules SURCHARGES du
 * projet, pas les valeurs effectives, et surtout pas un instantané du `TraceModel`. Trois
 * raisons, dans l'ordre d'importance :
 *
 * 1. un instantané de `TraceModel` serait une seconde source de vérité géométrique, que rien
 *    ne garantirait cohérente avec Engine B au moment de l'annulation ;
 * 2. les défauts appartiennent au modèle et peuvent évoluer avec lui : les recopier dans
 *    l'historique figerait la version du jour ;
 * 3. le poids. Une entrée pèse quelques nombres, pas quelques centaines de points.
 *
 * Annuler, c'est donc restaurer des `modelParams` puis laisser le moteur recalculer.
 *
 * ## Fusion des saisies
 *
 * Taper « 2000 » dans un champ nombre émet quatre changements. Sans fusion, il faudrait
 * quatre `Cmd+Z` pour revenir en arrière d'une seule correction. Les entrées consécutives
 * qui portent la même clé `source` et se déclarent fusionnables sont donc réunies en une
 * seule, en conservant le `before` de la première. Un glissement de poignée ne se déclare
 * jamais fusionnable : deux glissements successifs sur la même poignée restent deux gestes,
 * donc deux annulations.
 *
 * Module pur : ni React, ni persistance, ni horloge.
 */

/** Surcharges de paramètres — exactement la forme de `TracingProject.modelParams`. */
export type ParamOverrides = Record<string, number>;

export type ParamHistoryEntry = {
  /** Ce que l'annulation dira à l'utilisateur : « Diamètre », « Pointe S ». */
  label: string;
  /** Clé de fusion. Deux entrées consécutives fusionnables et de même clé n'en font qu'une. */
  source: string;
  coalesce: boolean;
  before: Readonly<ParamOverrides>;
  after: Readonly<ParamOverrides>;
};

export type ParamHistory = {
  past: readonly ParamHistoryEntry[];
  future: readonly ParamHistoryEntry[];
};

export const EMPTY_PARAM_HISTORY: ParamHistory = { past: [], future: [] };

/**
 * Profondeur maximale. Au-delà, les plus anciennes entrées tombent : un historique de
 * réglages n'a pas vocation à remonter à la création du tracé, et une pile non bornée
 * finirait par peser sur un téléphone.
 */
export const PARAM_HISTORY_LIMIT = 100;

function sameOverrides(a: Readonly<ParamOverrides>, b: Readonly<ParamOverrides>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/**
 * Empile une modification. Une modification qui ne change rien n'est pas empilée — sans quoi
 * un `Cmd+Z` pourrait ne rien faire de visible, ce qui donne l'impression d'un historique
 * cassé.
 *
 * Toute nouvelle action **invalide le futur** (§12) : c'est la règle universelle d'un
 * historique linéaire, et la seule qui évite de rejouer un « refaire » devenu incohérent avec
 * l'état courant.
 */
export function pushParamHistory(history: ParamHistory, entry: ParamHistoryEntry): ParamHistory {
  if (sameOverrides(entry.before, entry.after)) return history;

  const last = history.past[history.past.length - 1];
  // La fusion ne vaut que sur le sommet de pile ET quand rien n'a été annulé entre-temps :
  // fusionner par-dessus un « refaire » disponible masquerait une branche abandonnée.
  if (last && entry.coalesce && last.coalesce && last.source === entry.source && history.future.length === 0) {
    const merged: ParamHistoryEntry = { ...entry, before: last.before };
    if (sameOverrides(merged.before, merged.after)) {
      // La saisie est revenue à son point de départ : l'entrée n'a plus lieu d'être.
      return { past: history.past.slice(0, -1), future: [] };
    }
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }

  const past = [...history.past, entry];
  return { past: past.length > PARAM_HISTORY_LIMIT ? past.slice(past.length - PARAM_HISTORY_LIMIT) : past, future: [] };
}

export function canUndo(history: ParamHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: ParamHistory): boolean {
  return history.future.length > 0;
}

export type ParamHistoryMove = {
  history: ParamHistory;
  /** `modelParams` à appliquer au projet. */
  overrides: Readonly<ParamOverrides>;
  /** Libellé de l'action jouée, pour un retour visible à l'utilisateur. */
  label: string;
};

/** `null` quand il n'y a rien à annuler — l'appelant n'a alors rien à enregistrer. */
export function undoParamHistory(history: ParamHistory): ParamHistoryMove | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    overrides: entry.before,
    label: entry.label,
  };
}

/** `null` quand il n'y a rien à refaire. */
export function redoParamHistory(history: ParamHistory): ParamHistoryMove | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    history: { past: [...history.past, entry], future: history.future.slice(1) },
    overrides: entry.after,
    label: entry.label,
  };
}

/**
 * §4 du bridge Engine B — ne retenir que les ÉCARTS aux défauts du modèle. Les défauts
 * restent publiés par le modèle et ne sont jamais recopiés dans le projet : c'est ce qui
 * permet à un modèle de faire évoluer ses valeurs proposées sans réécrire les tracés
 * enregistrés.
 */
export function overridesOf(
  values: Readonly<Record<string, number>>,
  defaults: Readonly<Record<string, number>>,
): ParamOverrides {
  const overrides: ParamOverrides = {};
  for (const [id, value] of Object.entries(values)) {
    if (defaults[id] !== value) overrides[id] = value;
  }
  return overrides;
}

/** Chemin inverse : valeurs effectives à partir des défauts du modèle et des surcharges. */
export function valuesOf(
  defaults: Readonly<Record<string, number>>,
  overrides: Readonly<ParamOverrides> | undefined,
): Record<string, number> {
  return { ...defaults, ...(overrides ?? {}) };
}

/** `undefined` plutôt qu'un objet vide : `TracingProject.modelParams` est optionnel. */
export function overridesForProject(overrides: Readonly<ParamOverrides>): ParamOverrides | undefined {
  return Object.keys(overrides).length ? { ...overrides } : undefined;
}
