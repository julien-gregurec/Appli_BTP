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
 * | Contour | clics successifs | clic sur le premier sommet, `Entrée` ou double-clic, à partir de trois sommets |
 *
 * `Escape` annule le tracé en cours, sans historique (§6).
 *
 * ATELIER-FREE-CONTOUR-AREA-V1 §4 — le contour ajoute UNE seule voie de fin aux deux
 * existantes : le clic sur son premier sommet. C'est le geste que tout le monde essaie en
 * premier, et l'accrochage le rend fiable — le sommet arrive ici déjà posé exactement sur le
 * premier, pas « à quelques pixels ».
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
  MIN_FREE_CONTOUR_VERTICES,
  sameFreeVertex,
  type FreeEntityKind,
  type FreeVertex,
} from "../../../lib/tracing/free-geometry";

/** Outils de création (§3/§4). Cercle, arc et texte ne sont pas déclarés : ils n'existent pas. */
export type FreeDrawTool = Extract<FreeEntityKind, "point" | "segment" | "polyline" | "polygon">;

export const FREE_DRAW_TOOLS: readonly FreeDrawTool[] = ["point", "segment", "polyline", "polygon"];

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §3/§4 — outils dont le tracé se termine par un geste EXPLICITE.
 *
 * La polyligne et le contour partagent tout leur flux de création : des clics successifs, puis
 * une fin décidée par l'utilisateur (`Entrée`, double-clic, ou le bouton de la barre d'état).
 * Ils ne diffèrent que par deux choses — le nombre minimal de sommets, et le fait qu'un clic sur
 * le PREMIER sommet referme le contour. Les traiter comme deux automates aurait dupliqué le
 * reste, y compris l'absorption du second clic d'un double-clic, qui est la partie délicate.
 */
const FINISHABLE_TOOLS: readonly FreeDrawTool[] = ["polyline", "polygon"];

function isFinishable(tool: FreeDrawTool): boolean {
  return FINISHABLE_TOOLS.includes(tool);
}

/** Nombre minimal de sommets qu'un outil à fin explicite exige pour produire une primitive. */
function minimumVertices(tool: FreeDrawTool): number {
  return tool === "polygon" ? MIN_FREE_CONTOUR_VERTICES : 2;
}

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

/**
 * `true` si le tracé en cours peut être validé tel quel — polyligne d'au moins deux sommets,
 * contour d'au moins trois (§4).
 */
export function canFinishFreeDraw(state: FreeDrawState): boolean {
  return isFinishable(state.tool) && state.pending.length >= minimumVertices(state.tool);
}

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §4 — `true` si un clic à cet endroit REFERMERAIT le contour.
 *
 * Sert au retour visuel autant qu'au geste : c'est ce que la couche de prévisualisation
 * interroge pour mettre le premier sommet en évidence quand le curseur l'approche, et l'on veut
 * que ce qui est montré et ce qui sera fait soient décidés par la même fonction (§18).
 *
 * ## Pourquoi une tolérance de VISÉE, et pourquoi elle est sans danger ici
 *
 * Les sommets d'un tracé EN COURS ne sont pas dans la scène : ils ne sont pas encore engagés,
 * donc l'accrochage ne les propose pas comme cibles. Attendre du clic de fermeture qu'il tombe
 * au millième de millimètre sur le premier sommet reviendrait à rendre la fermeture à la souris
 * impossible — le geste le plus évident du contour, et celui que tout le monde essaie d'abord.
 *
 * `toleranceMm` est donc la tolérance de VISÉE, convertie depuis les pixels par l'appelant,
 * exactement comme celle de la désignation. Ce qui la rend sans risque est que le clic de
 * fermeture **n'enregistre aucun sommet** : il valide `pending` tel quel, avec les positions
 * accrochées qui y sont déjà. Approcher le premier sommet ne le déplace pas et n'en crée pas de
 * jumeau — c'est ce qui distingue ce clic de tous les autres, où la précision de la position
 * décide de la donnée.
 *
 * Le défaut reste `FREE_VERTEX_EPSILON_MM` : un appelant qui ne dit rien de son pointeur obtient
 * la règle stricte, et non une tolérance devinée à sa place.
 */
export function closesFreeContour(
  state: FreeDrawState,
  vertex: FreeVertex,
  toleranceMm: number = FREE_VERTEX_EPSILON_MM,
): boolean {
  return (
    state.tool === "polygon" &&
    state.pending.length >= MIN_FREE_CONTOUR_VERTICES &&
    aimsAtFirstVertex(state, vertex, toleranceMm)
  );
}

/**
 * Le clic vise-t-il le premier sommet du tracé en cours ? Sans considération du nombre de
 * sommets déjà posés — c'est `closesFreeContour` qui juge si ce geste peut aboutir, et
 * `freeDrawClick` qui explique pourquoi il n'aboutit pas encore.
 */
function aimsAtFirstVertex(state: FreeDrawState, vertex: FreeVertex, toleranceMm: number): boolean {
  const first = state.pending[0];
  if (!first) return false;
  const reach = Number.isFinite(toleranceMm) ? Math.max(toleranceMm, FREE_VERTEX_EPSILON_MM) : FREE_VERTEX_EPSILON_MM;
  return Math.hypot(first.x - vertex.x, first.y - vertex.y) <= reach;
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
export type FreeDrawClickOptions = {
  /**
   * §4 — tolérance de visée du clic de FERMETURE, en millimètres monde. Voir
   * `closesFreeContour` : elle ne concerne QUE la reconnaissance du geste, jamais la position
   * enregistrée. Absente, la règle stricte s'applique.
   */
  closeToleranceMm?: number;
};

export function freeDrawClick(
  state: FreeDrawState,
  vertex: FreeVertex,
  options: FreeDrawClickOptions = {},
): FreeDrawStep {
  /*
   * ATELIER-FREE-CONTOUR-AREA-V1 §4 — le clic de FERMETURE passe avant le refus de doublon.
   *
   * L'ordre compte. Sur un contour, un clic qui retombe sur le premier sommet n'est pas un
   * sommet qui « ne dit rien de neuf » : c'est le geste de fermeture, celui que l'on attend
   * depuis le début du tracé. Tester le doublon d'abord l'aurait écarté comme un clic parasite,
   * et refermer un contour à la souris serait devenu impossible.
   *
   * Le premier sommet n'est pas ajouté à la liste : la fermeture est implicite dans la donnée
   * (cf. `FreeEntity.points`), et l'y écrire produirait le sommet en double que la validation
   * refuse.
   */
  if (closesFreeContour(state, vertex, options.closeToleranceMm)) {
    // Le contour validé est `pending` TEL QUEL : la position du clic de fermeture est un geste,
    // pas une donnée, et elle n'entre nulle part dans la forme enregistrée.
    return step({ ...state, pending: [] }, { kind: "polygon", points: state.pending });
  }

  /*
   * §4 — le premier sommet, recliqué TROP TÔT, est refusé plutôt qu'ajouté.
   *
   * Sans ce refus, un clic de fermeture prématuré (deux sommets posés seulement) serait accepté
   * comme un troisième sommet — confondu avec le premier. Le contour partirait alors à la
   * validation avec un côté de fermeture de longueur nulle, et serait rejeté à ce moment-là,
   * par un message parlant de « double emploi » que rien à l'écran n'expliquerait. Le refuser
   * ici le dit au bon moment, et dit ce qui manque : un sommet de plus.
   */
  if (
    state.tool === "polygon" &&
    state.pending.length > 1 &&
    aimsAtFirstVertex(state, vertex, options.closeToleranceMm ?? FREE_VERTEX_EPSILON_MM)
  ) {
    return step(
      state,
      null,
      `Il faut au moins ${MIN_FREE_CONTOUR_VERTICES} sommets pour refermer un contour : posez-en encore un.`,
    );
  }

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

    case "polyline":
    case "polygon": {
      if (state.pending.length >= MAX_FREE_POLYLINE_VERTICES) {
        const what = state.tool === "polygon" ? "Ce contour atteint" : "Cette polyligne atteint";
        return step(
          state,
          null,
          `${what} ${MAX_FREE_POLYLINE_VERTICES} sommets : terminez-le (Entrée) avant d'en tracer un autre.`,
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
  if (!isFinishable(state.tool) || state.pending.length === 0) return step(state);
  if (state.pending.length < minimumVertices(state.tool)) {
    return step(
      { ...state, pending: [] },
      null,
      state.tool === "polygon"
        ? "Un contour demande au moins trois sommets : tracé abandonné."
        : "Une polyligne demande au moins deux sommets : tracé abandonné.",
    );
  }
  return step({ ...state, pending: [] }, { kind: state.tool, points: state.pending });
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
  const first = state.pending[0];
  const last = state.pending[state.pending.length - 1];
  if (cursor && last && !sameFreeVertex(last, cursor)) drawn.push([last, cursor]);

  /*
   * ATELIER-FREE-CONTOUR-AREA-V1 §18 — le côté de FERMETURE est dessiné pendant le tracé.
   *
   * Sans lui, on trace une ligne brisée en devinant la forme qu'elle enfermera, et l'on ne
   * découvre la surface réelle qu'au moment de refermer — trop tard pour ajuster. Avec lui,
   * l'aire est visible en permanence et le dernier clic ne réserve aucune surprise.
   *
   * Il n'est tracé qu'à partir de deux sommets posés : sur un seul, il se confondrait avec le
   * lien vers le curseur, et l'on verrait un trait dessiné deux fois.
   */
  if (state.tool === "polygon" && first && state.pending.length >= 2) {
    const closingFrom = cursor && last && !sameFreeVertex(last, cursor) ? cursor : last;
    if (closingFrom && !sameFreeVertex(closingFrom, first)) drawn.push([closingFrom, first]);
  }
  return drawn;
}

/**
 * §18 — sommets du contour tel qu'il serait validé à cet instant, curseur compris.
 *
 * Sert au retour de surface pendant le tracé : c'est la liste exacte que `freeDrawClick`
 * produirait, donc l'aire annoncée est celle qu'on obtiendra — pas une approximation.
 * `null` hors d'un tracé de contour assez avancé pour enfermer quoi que ce soit.
 */
export function freeDrawContourPreview(state: FreeDrawState, cursor: FreeVertex | null): readonly FreeVertex[] | null {
  if (state.tool !== "polygon" || state.pending.length === 0) return null;
  const last = state.pending[state.pending.length - 1];
  const points = cursor && !sameFreeVertex(last, cursor) ? [...state.pending, cursor] : [...state.pending];
  return points.length >= MIN_FREE_CONTOUR_VERTICES ? points : null;
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
    /*
     * ATELIER-FREE-CONTOUR-AREA-V1 §18 — la consigne nomme les TROIS façons de refermer dès
     * qu'elles deviennent possibles, et pas avant.
     *
     * Annoncer « cliquez le premier sommet » alors qu'il n'y a que deux sommets posés inviterait
     * à un geste qui serait refusé — un contour à deux sommets n'enferme rien. La consigne suit
     * donc ce que le prochain geste peut réellement faire, à chaque étape.
     */
    case "polygon":
      if (state.pending.length === 0) return "Contour libre : cliquez le premier sommet.";
      if (state.pending.length < MIN_FREE_CONTOUR_VERTICES) {
        const remaining = MIN_FREE_CONTOUR_VERTICES - state.pending.length;
        return `Contour libre : ${state.pending.length} sommet${state.pending.length > 1 ? "s" : ""} — encore ${remaining} pour enfermer une surface (Échap pour annuler).`;
      }
      return `Contour libre : ${state.pending.length} sommets — cliquez le premier sommet, Entrée ou double-clic pour refermer, Échap pour annuler.`;
  }
}

/**
 * Distance en deçà de laquelle deux sommets sont confondus, réexportée pour les appelants qui
 * doivent prendre la même décision que l'automate (rendu du point courant, notamment).
 */
export const FREE_DRAW_EPSILON_MM = FREE_VERTEX_EPSILON_MM;
