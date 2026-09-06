/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §4/§6 — automate de tracé en cours.
 *
 * ## Pourquoi un automate séparé
 *
 * Entre le premier clic et la validation, une primitive n'existe pas encore : elle est une
 * intention. Cette intention doit être visible (§6 : segment fantôme, point courant,
 * accrochage actif) sans jamais toucher au document — sinon un `Escape` devrait « défaire »
 * quelque chose, l'historique se remplirait de tracés abandonnés, et l'autosave enregistrerait
 * des demi-segments.
 *
 * L'intention vit donc ici, dans un état pur, et la seule chose qui en sort est un `commit` :
 * la primitive complète, une fois et une seule, au moment exact où elle est valide. Rien
 * d'autre ne franchit la frontière. C'est ce qui rend §6 (« ne persister qu'au commit ») et
 * §9 (« annuler ne rejoue pas un tracé abandonné ») vrais par construction plutôt que par
 * vigilance.
 *
 * ## Les trois flux
 *
 * | outil | geste | validation |
 * | ----- | ----- | ---------- |
 * | Point | un clic | immédiate |
 * | Segment | clic A, clic B | au second clic |
 * | Polyligne | clics successifs | `Entrée` ou double-clic, à partir de deux sommets |
 *
 * `Escape` annule le tracé en cours, sans historique (§6).
 *
 * ## Le clic répété
 *
 * Un clic qui retombe sur le sommet précédent est REFUSÉ, et ce refus fait un vrai travail :
 * il écarte le segment de longueur nulle que la validation rejetterait de toute façon, et il
 * absorbe le second clic d'un double-clic de fin de polyligne — sans quoi terminer une
 * polyligne y ajouterait un sommet en double juste avant de la fermer. Deux symptômes, une
 * seule cause : un sommet qui ne dit rien de neuf.
 *
 * Module PUR : ni React, ni DOM, ni pixel — l'accrochage a déjà eu lieu quand un sommet
 * arrive ici (§5), et il arrive en millimètres monde.
 */

import {
  FREE_VERTEX_EPSILON_MM,
  MAX_FREE_POLYLINE_VERTICES,
  sameFreeVertex,
  type FreeEntityKind,
  type FreeVertex,
} from "../../../lib/tracing/free-geometry";

/** Outils de création du lot (§3/§4). Cercle, arc et texte ne sont pas déclarés : ils n'existent pas. */
export type FreeDrawTool = Extract<FreeEntityKind, "point" | "segment" | "polyline">;

export const FREE_DRAW_TOOLS: readonly FreeDrawTool[] = ["point", "segment", "polyline"];

export type FreeDrawState = {
  tool: FreeDrawTool;
  /** Sommets déjà posés du tracé en cours. Jamais persistés (§6). */
  pending: readonly FreeVertex[];
};

/** Primitive prête à être validée — la seule chose qui sort de l'automate. */
export type FreeDrawCommit = { kind: FreeEntityKind; points: readonly FreeVertex[] };

export type FreeDrawStep = {
  state: FreeDrawState;
  /** `null` tant que la primitive n'est pas complète. */
  commit: FreeDrawCommit | null;
  /** Renseigné quand le geste a été ignoré, avec la raison — jamais un échec silencieux. */
  rejected?: string;
};

export function beginFreeDraw(tool: FreeDrawTool): FreeDrawState {
  return { tool, pending: [] };
}

/** `true` si un tracé est commencé mais pas terminé — ce qu'`Escape` a de quoi annuler. */
export function isFreeDrawInProgress(state: FreeDrawState): boolean {
  return state.pending.length > 0;
}

/** `true` si le tracé en cours peut être validé tel quel (polyligne d'au moins deux sommets). */
export function canFinishFreeDraw(state: FreeDrawState): boolean {
  return state.tool === "polyline" && state.pending.length >= 2;
}

function step(state: FreeDrawState, commit: FreeDrawCommit | null = null, rejected?: string): FreeDrawStep {
  return rejected ? { state, commit, rejected } : { state, commit };
}

/**
 * §4 — un clic, déjà accroché et déjà en millimètres (§5).
 *
 * L'accrochage a lieu AVANT cet appel, et c'est essentiel : le sommet enregistré est celui qui
 * a été accroché, pas la position brute du curseur. Accrocher seulement pour l'affichage
 * reviendrait à mentir sur ce qui va être tracé — la même règle que le glissement de poignée
 * du lot précédent.
 */
export function freeDrawClick(state: FreeDrawState, vertex: FreeVertex): FreeDrawStep {
  const last = state.pending[state.pending.length - 1];
  if (last && sameFreeVertex(last, vertex)) {
    return step(state, null, "Ce sommet est confondu avec le précédent : il est ignoré.");
  }

  switch (state.tool) {
    case "point":
      // Rien à accumuler : un point est complet dès qu'il est posé, et l'outil reste armé pour
      // le suivant. Poser dix repères ne doit pas demander dix aller-retours à la barre.
      return step(state, { kind: "point", points: [vertex] });

    case "segment": {
      if (state.pending.length === 0) return step({ ...state, pending: [vertex] });
      return step({ ...state, pending: [] }, { kind: "segment", points: [state.pending[0], vertex] });
    }

    case "polyline": {
      if (state.pending.length >= MAX_FREE_POLYLINE_VERTICES) {
        return step(
          state,
          null,
          `Cette polyligne atteint ${MAX_FREE_POLYLINE_VERTICES} sommets : terminez-la (Entrée) avant d'en tracer une autre.`,
        );
      }
      return step({ ...state, pending: [...state.pending, vertex] });
    }
  }
}

/**
 * §4 — fin explicite d'une polyligne (`Entrée` ou double-clic).
 *
 * Un seul sommet posé n'est pas une polyligne : le geste est abandonné plutôt que transformé
 * en point, parce que rien ne dit que l'utilisateur voulait un point — il a choisi l'outil
 * polyligne, et deviner à sa place laisserait dans le tracé une entité qu'il n'a pas demandée.
 */
export function freeDrawFinish(state: FreeDrawState): FreeDrawStep {
  if (state.tool !== "polyline" || state.pending.length === 0) return step(state);
  if (state.pending.length < 2) {
    return step({ ...state, pending: [] }, null, "Une polyligne demande au moins deux sommets : tracé abandonné.");
  }
  return step({ ...state, pending: [] }, { kind: "polyline", points: state.pending });
}

/** §6 — `Escape` : le tracé en cours disparaît sans laisser de trace, historique compris. */
export function freeDrawCancel(state: FreeDrawState): FreeDrawState {
  return state.pending.length === 0 ? state : { ...state, pending: [] };
}

/**
 * §6 — segments fantômes à dessiner : ceux déjà posés, plus celui qui rejoint le curseur.
 *
 * Le lien vers le curseur n'est produit que si l'outil en trace un : sur l'outil Point, il n'y
 * a rien à relier, et afficher une amorce laisserait croire qu'un geste est en cours.
 */
export function freeDrawGhostSegments(
  state: FreeDrawState,
  cursor: FreeVertex | null,
): readonly (readonly [FreeVertex, FreeVertex])[] {
  const drawn: (readonly [FreeVertex, FreeVertex])[] = [];
  for (let index = 1; index < state.pending.length; index += 1) {
    drawn.push([state.pending[index - 1], state.pending[index]]);
  }
  const last = state.pending[state.pending.length - 1];
  if (cursor && last && !sameFreeVertex(last, cursor)) drawn.push([last, cursor]);
  return drawn;
}

/** §6 — consigne affichée dans la barre d'état : ce que le prochain geste fera, à tout instant. */
export function freeDrawHint(state: FreeDrawState): string {
  switch (state.tool) {
    case "point":
      return "Point libre : cliquez pour poser un repère.";
    case "segment":
      return state.pending.length === 0
        ? "Segment libre : cliquez le point de départ."
        : "Segment libre : cliquez l’arrivée (Échap pour annuler).";
    case "polyline":
      if (state.pending.length === 0) return "Polyligne libre : cliquez le premier sommet.";
      if (state.pending.length === 1) return "Polyligne libre : cliquez le sommet suivant (Échap pour annuler).";
      return `Polyligne libre : ${state.pending.length} sommets — Entrée ou double-clic pour terminer, Échap pour annuler.`;
  }
}

/**
 * Distance en deçà de laquelle deux sommets sont confondus, réexportée pour les appelants qui
 * doivent prendre la même décision que l'automate (rendu du point courant, notamment).
 */
export const FREE_DRAW_EPSILON_MM = FREE_VERTEX_EPSILON_MM;
