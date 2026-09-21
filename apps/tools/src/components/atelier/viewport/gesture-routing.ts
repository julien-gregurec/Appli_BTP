/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §4 — arbitrage entre déplacement du plan et glissement
 * d'une poignée.
 *
 * Extrait de `use-viewport-gestures` pour être testable sans DOM. C'est un automate minuscule
 * mais c'est lui qui porte l'exigence « un pan ne doit jamais devenir un drag de poignée » :
 * il mérite d'être vérifié pour lui-même plutôt qu'à travers un composant monté.
 *
 * ## Les trois règles
 *
 * 1. **l'arbitrage a lieu au `pointerdown`, une fois.** Le contact appartient à une poignée ou
 *    au plan pour toute sa durée. Trancher plus tard — au premier mouvement, ou après un seuil
 *    de distance — laisserait le plan glisser avant que la poignée ne prenne la main ;
 * 2. **un contact capté ne déplace pas le plan.** Il ne rejoint pas la table des pointeurs :
 *    ni pan, ni calcul de pincement ne le voient ;
 * 3. **tant qu'une poignée est tenue, les autres contacts sont ignorés.** Un second doigt ne
 *    doit pas démarrer un pincement au milieu d'un réglage — le zoom sauterait, et le sommet
 *    tenu partirait avec lui. Ignorer est le comportement sûr : le geste en cours reste
 *    maître, et le doigt surnuméraire n'a aucun effet.
 */

export type GestureRoute = "handle" | "viewport" | "ignored";

export type GestureRoutingState = {
  /** Contact capté par une poignée, s'il y en a un. Un seul à la fois. */
  grabbedPointerId: number | null;
};

export const IDLE_GESTURE_ROUTING: GestureRoutingState = { grabbedPointerId: null };

export type GestureRoutingStep = { state: GestureRoutingState; route: GestureRoute };

/**
 * `claimed` est la réponse de l'appelant à « ce point est-il sur une poignée saisissable ? ».
 * Elle n'est posée que s'il n'y a pas déjà de poignée tenue.
 */
export function routePointerDown(
  state: GestureRoutingState,
  pointerId: number,
  claim: () => boolean,
): GestureRoutingStep {
  if (state.grabbedPointerId !== null) return { state, route: "ignored" };
  if (claim()) return { state: { grabbedPointerId: pointerId }, route: "handle" };
  return { state, route: "viewport" };
}

export function routePointerMove(state: GestureRoutingState, pointerId: number): GestureRoute {
  if (state.grabbedPointerId === null) return "viewport";
  return state.grabbedPointerId === pointerId ? "handle" : "ignored";
}

export function routePointerUp(state: GestureRoutingState, pointerId: number): GestureRoutingStep {
  if (state.grabbedPointerId === null) return { state, route: "viewport" };
  if (state.grabbedPointerId !== pointerId) return { state, route: "ignored" };
  return { state: IDLE_GESTURE_ROUTING, route: "handle" };
}
