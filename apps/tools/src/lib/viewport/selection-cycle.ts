/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §4 — cycle de sélection sur entités superposées.
 *
 * Module pur : aucun React, aucun DOM, aucun pixel d'écran. Il ne fait qu'une chose — répondre
 * « quelle entité ce clic désigne-t-il, sachant les clics précédents ? » — et l'appelant garde
 * l'état qu'il lui rend.
 *
 * ## Le problème
 *
 * Le hit-test départage les entités superposées par une priorité déterministe : au croisement de
 * deux axes, c'est toujours le même axe qui gagne. Cette stabilité est indispensable — sans
 * elle, le même clic désignerait une entité différente d'une fois sur l'autre — mais elle rend
 * l'autre axe DÉFINITIVEMENT inatteignable au pointeur. Le cycle est ce qui réconcilie les deux :
 * le premier clic reste parfaitement prévisible, et re-cliquer descend d'un cran.
 *
 * ## Ce qui ferme le cycle
 *
 * Un cycle est une conversation : « pas celle-là, la suivante ». Elle n'a de sens que si les deux
 * clics parlent du même endroit et de la même scène. Quatre changements la referment, et chacun
 * répond à une façon réelle de se tromper :
 *
 * - **la cible bouge** au-delà de la tolérance : viser ailleurs est une nouvelle demande, pas la
 *   suite de la précédente. La comparaison se fait en coordonnées MONDE, ce qui traite le pan
 *   sans le mesurer : déplacer le plan sous un curseur immobile change le point monde visé, donc
 *   ferme le cycle — ce qu'on veut, puisque les entités sous le curseur ne sont plus les mêmes ;
 * - **le zoom change** notablement : à un autre grossissement la tolérance ne couvre plus les
 *   mêmes entités, et l'utilisateur a de toute façon zoomé POUR viser autrement ;
 * - **la scène change** (autre modèle, autre étape, paramètre modifié) : les identifiants
 *   mémorisés peuvent avoir disparu ;
 * - **la liste des candidats change** : l'index mémorisé désignerait une autre entité que celle
 *   qu'il désignait, et le cycle sauterait un cran sans raison visible.
 *
 * Un cycle refermé n'est pas une erreur : on repart simplement du candidat prioritaire.
 */

import type { PlanePoint } from "@/lib/geometry/closest-point";

/**
 * Deux clics séparés de moins de ceci, à l'écran, visent « le même endroit » (§4).
 *
 * Volontairement plus large que la tolérance de sélection (12 px) : entre deux clics la main
 * bouge, surtout au trackpad, et une valeur trop serrée casserait le cycle en plein milieu — le
 * défaut le plus agaçant possible, puisqu'il renvoie sur l'entité déjà refusée. Trop large,
 * en revanche, ferait continuer le cycle alors qu'on vise déjà autre chose : 18 px est le
 * compromis, à peine plus qu'un rayon de sélection.
 */
export const SELECTION_CYCLE_ANCHOR_PX = 18;

/**
 * Rapport de zoom au-delà duquel le cycle se referme (§4). Un cran de molette vaut environ
 * ×1,15 : le seuil laisse donc passer les micro-ajustements du trackpad, mais pas un vrai
 * changement d'échelle.
 */
export const SELECTION_CYCLE_SCALE_RATIO = 1.25;

export type SelectionCycleState = {
  /** Point MONDE du clic qui a ouvert le cycle. Jamais réactualisé — cf. `advanceSelectionCycle`. */
  anchor: PlanePoint;
  /** Échelle à laquelle le cycle a été ouvert. */
  scale: number;
  /** Identité de la scène ; sa valeur importe peu, seule sa stabilité compte. */
  sceneKey: string;
  /** Candidats retenus à l'ouverture, dans l'ordre déterministe de `hitTestAll` (§3). */
  entityIds: readonly string[];
  /** Rang courant dans `entityIds`. */
  index: number;
};

export type SelectionCycleRequest = {
  /** Point monde du clic. */
  world: PlanePoint;
  /** Échelle courante du viewport. */
  scale: number;
  sceneKey: string;
  /** Identifiants candidats, ordre de `hitTestAll` — le premier est celui qu'un clic isolé prend. */
  candidateIds: readonly string[];
  /** Rayon monde en deçà duquel deux clics visent le même endroit (px écran ÷ échelle). */
  anchorToleranceWorld: number;
  /**
   * §4/§5 — ce clic doit-il faire AVANCER le cycle ? Vrai par défaut.
   *
   * Un clic ADDITIF (Maj) le met à `false`, et c'est ce qui réconcilie les deux gestes. Sans
   * cela, Maj+clic répété au même endroit descendrait dans la pile et AJOUTERAIT chaque entité
   * l'une après l'autre : il deviendrait alors impossible de retirer par Maj+clic ce qu'un
   * Maj+clic vient d'ajouter, alors que c'est précisément ce que ce geste veut dire partout
   * ailleurs. Le clic additif désigne donc l'entité du rang COURANT, sans le changer.
   *
   * L'entité du dessous reste atteignable, et sans ambiguïté : on clique normalement jusqu'à
   * elle — le cycle avance — puis on la compose au Maj+clic.
   */
  advance?: boolean;
};

export type SelectionCycleStep = {
  /** État à conserver pour le clic suivant, ou `null` si rien n'a été désigné. */
  state: SelectionCycleState | null;
  /** Entité désignée par ce clic, ou `null` si aucun candidat. */
  entityId: string | null;
  /** `true` si ce clic a poursuivi le cycle précédent, `false` s'il en a ouvert un nouveau. */
  continued: boolean;
};

function sameIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

/**
 * Le nouveau clic poursuit-il le cycle mémorisé ?
 *
 * Les quatre conditions sont conjointes et volontairement écrites à plat : chacune correspond à
 * une ligne de la matrice de réinitialisation, ce qui rend la lecture du code et celle des tests
 * superposables.
 */
function continues(previous: SelectionCycleState, request: SelectionCycleRequest): boolean {
  if (previous.sceneKey !== request.sceneKey) return false;
  if (!sameIds(previous.entityIds, request.candidateIds)) return false;

  const ratio = previous.scale > 0 && request.scale > 0 ? Math.max(previous.scale / request.scale, request.scale / previous.scale) : Infinity;
  if (!Number.isFinite(ratio) || ratio > SELECTION_CYCLE_SCALE_RATIO) return false;

  // Tolérance absente, nulle ou non finie : le viewport n'est pas en état de dire si deux clics
  // visent le même endroit (échelle non encore mesurée, par exemple). On referme plutôt que de
  // décider sur `0 <= 0`, qui ferait dépendre le cycle d'une égalité exacte de flottants.
  if (!Number.isFinite(request.anchorToleranceWorld) || request.anchorToleranceWorld <= 0) return false;

  return Math.hypot(request.world.x - previous.anchor.x, request.world.y - previous.anchor.y) <= request.anchorToleranceWorld;
}

/**
 * §4 — entité désignée par un clic, en tenant compte des clics précédents au même endroit.
 *
 * Premier clic : le candidat prioritaire, exactement comme `hitTest`. Clic suivant au même
 * endroit : le candidat d'après, et ainsi de suite jusqu'à revenir au premier — le cycle boucle,
 * il ne se bloque pas sur le dernier, sans quoi il faudrait viser ailleurs puis revenir pour
 * récupérer l'entité prioritaire.
 *
 * Un clic marqué `advance: false` (le Maj+clic, §5) fait exception : il lit le rang courant sans
 * l'avancer, pour que composer une sélection ne déplace pas la cible sous le doigt.
 *
 * L'ancre reste celle du PREMIER clic du cycle, et n'est pas réactualisée à chaque tour. Sinon
 * une dérive de quelques pixels par clic — inévitable à la main — promènerait l'ancre aussi loin
 * qu'on veut sans jamais franchir la tolérance, et le cycle continuerait sur des entités qui ne
 * sont plus sous le curseur.
 */
export function advanceSelectionCycle(
  previous: SelectionCycleState | null,
  request: SelectionCycleRequest,
): SelectionCycleStep {
  if (request.candidateIds.length === 0) return { state: null, entityId: null, continued: false };

  if (previous && continues(previous, request)) {
    // `advance: false` relit le rang courant sans le faire tourner (cf. `advance`).
    const index = request.advance === false ? previous.index : (previous.index + 1) % previous.entityIds.length;
    return {
      state: { ...previous, scale: request.scale, index },
      entityId: previous.entityIds[index],
      continued: true,
    };
  }

  return {
    state: {
      anchor: { x: request.world.x, y: request.world.y },
      scale: request.scale,
      sceneKey: request.sceneKey,
      entityIds: [...request.candidateIds],
      index: 0,
    },
    entityId: request.candidateIds[0],
    continued: false,
  };
}
