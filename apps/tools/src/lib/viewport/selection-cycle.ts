/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §7 — cycle « re-cliquer pour prendre l'entité en dessous ».
 *
 * Module pur : pas de React, pas de DOM, pas d'évènement. Il reçoit la liste ordonnée des
 * candidats sous le pointeur (produite par `hitTestAll`) et répond lequel prendre.
 *
 * ## Le problème que ce module résout
 *
 * Au centre d'une rosace, huit cercles, deux axes et un point nommé se superposent dans un
 * disque de 12 px. La priorité du hit-test tranche toujours dans le même sens — c'est ce qui
 * la rend prévisible — mais elle rend du même coup les entités du dessous INATTEIGNABLES à la
 * souris. Le cycle est la réponse habituelle des logiciels de dessin : le clic répété au même
 * endroit descend d'un cran, puis reboucle.
 *
 * ## Les quatre règles
 *
 * 1. **le cycle est ancré à un ENDROIT, pas à une entité.** Tant que les clics successifs
 *    tombent dans un rayon écran serré, ils continuent le même cycle ; un clic plus loin en
 *    ouvre un nouveau. Le rayon est exprimé en PIXELS, comme la tolérance de désignation : la
 *    main tremble en pixels, pas en millimètres ;
 *
 * 2. **le cycle est ancré à un CONTEXTE.** Projet, modèle, mode, étape : `key` résume ce qui,
 *    en changeant, rendrait les identifiants mémorisés caducs. Une clé différente ouvre un
 *    nouveau cycle sans qu'aucun appelant ait à penser à le réinitialiser ;
 *
 * 3. **le cycle est ancré à une LISTE.** Si les candidats sous le pointeur ne sont plus les
 *    mêmes — la géométrie a bougé sous le curseur pendant un réglage — l'index mémorisé ne
 *    désigne plus la même entité : on repart de la tête plutôt que de sauter au hasard ;
 *
 * 4. **rien ici n'est un état React.** L'automate est une valeur ; le composant le garde dans
 *    une `ref`. Un cycle rangé dans un `useState` serait remis à zéro par toute cascade de
 *    rendu — un survol, un changement de zoom — et le deuxième clic ne descendrait jamais
 *    d'un cran (§7 : « éviter de réinitialiser le cycle au moindre rendu React »).
 */

import type { PointerPrecision } from "./pointer-targeting";

export type CyclePoint = { x: number; y: number };

export type SelectionCycleState = {
  /** Contexte du cycle (projet, modèle, mode…). Un changement l'invalide. */
  key: string;
  /** Point ÉCRAN d'ancrage, ou `null` quand aucun cycle n'est ouvert. */
  anchor: CyclePoint | null;
  /** Candidats retenus à l'ouverture, dans l'ordre du hit-test. */
  candidates: readonly string[];
  /** Position dans `candidates` du dernier identifiant rendu. */
  index: number;
};

export const IDLE_SELECTION_CYCLE: SelectionCycleState = { key: "", anchor: null, candidates: [], index: 0 };

/**
 * Rayon écran sous lequel deux clics sont tenus pour « au même endroit », en pixels.
 *
 * Volontairement plus SERRÉ que la tolérance de désignation (12 px) : le cycle doit se
 * déclencher sur une intention de re-cliquer, pas sur deux clics voisins qui visaient deux
 * entités différentes. Au doigt, le contact se repose rarement au même pixel — d'où une valeur
 * nettement plus généreuse, sans quoi le cycle serait inaccessible au tactile (§9).
 */
export const CYCLE_ANCHOR_PX = 5;
export const TOUCH_CYCLE_ANCHOR_PX = 16;

export function cycleAnchorPx(precision: PointerPrecision): number {
  return precision === "coarse" ? TOUCH_CYCLE_ANCHOR_PX : CYCLE_ANCHOR_PX;
}

export type SelectionCycleInput = {
  /** Contexte courant — règle 2. */
  key: string;
  /** Point du clic, en pixels écran locaux au viewport. */
  point: CyclePoint;
  /** Candidats sous le pointeur, déjà triés par pertinence (`hitTestAll`). */
  candidates: readonly string[];
  /** Rayon d'ancrage en pixels — `cycleAnchorPx(precision)` chez l'appelant. */
  anchorPx: number;
};

export type SelectionCycleStep = {
  state: SelectionCycleState;
  /** Entité à désigner, ou `null` si rien n'est sous le pointeur. */
  entityId: string | null;
  /** Vrai quand ce clic a fait avancer un cycle déjà ouvert (utile au retour visuel, §11). */
  cycled: boolean;
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function withinAnchor(anchor: CyclePoint | null, point: CyclePoint, anchorPx: number): boolean {
  if (!anchor) return false;
  const radius = Number.isFinite(anchorPx) && anchorPx > 0 ? anchorPx : 0;
  return Math.hypot(point.x - anchor.x, point.y - anchor.y) <= radius;
}

/**
 * Un clic : ouvre un cycle, ou fait avancer celui qui est ouvert.
 *
 * Un clic à vide (`candidates` vide) FERME le cycle et ne désigne rien — c'est aussi ce qui
 * désélectionne, côté appelant. Fermer plutôt que conserver évite qu'un clic à vide suivi d'un
 * clic au même endroit reparte au milieu de l'ancienne liste.
 */
export function advanceSelectionCycle(
  state: SelectionCycleState,
  input: SelectionCycleInput,
): SelectionCycleStep {
  const { key, point, candidates, anchorPx } = input;

  if (candidates.length === 0) {
    return { state: { ...IDLE_SELECTION_CYCLE, key }, entityId: null, cycled: false };
  }

  const continues =
    state.key === key && withinAnchor(state.anchor, point, anchorPx) && sameList(state.candidates, candidates);

  // Le cycle avance, mais l'ANCRE ne bouge pas : sinon une dérive d'un pixel par clic
  // finirait par sortir de la zone sans qu'on ait jamais cliqué ailleurs.
  const index = continues ? (state.index + 1) % candidates.length : 0;
  const anchor = continues ? state.anchor : { x: point.x, y: point.y };

  return {
    state: { key, anchor, candidates: [...candidates], index },
    entityId: candidates[index],
    cycled: continues,
  };
}

/**
 * Ferme le cycle en cours sans rien désigner. Appelé quand la sélection est vidée autrement
 * que par un clic (changement de modèle, d'étape, de mode), pour que le prochain clic reparte
 * bien de la tête de liste.
 */
export function resetSelectionCycle(key: string): SelectionCycleState {
  return { ...IDLE_SELECTION_CYCLE, key };
}
