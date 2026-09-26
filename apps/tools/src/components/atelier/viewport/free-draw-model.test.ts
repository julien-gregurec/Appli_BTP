/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §4/§6 — automate de tracé.
 *
 * Ce qui est vérifié : une primitive ne sort de l'automate qu'une fois, complète, et un tracé
 * abandonné ne produit RIEN — pas de commit, pas de sommet résiduel.
 */

import { describe, expect, it } from "vitest";
import { MAX_FREE_POLYLINE_VERTICES } from "../../../lib/tracing/free-geometry";
import {
  FREE_DRAW_TOOLS,
  beginFreeDraw,
  canFinishFreeDraw,
  closesFreeContour,
  freeDrawCancel,
  freeDrawClick,
  freeDrawContourPreview,
  freeDrawFinish,
  freeDrawGhostSegments,
  freeDrawHint,
  isFreeDrawInProgress,
  type FreeDrawState,
} from "./free-draw-model";
import { buildToolbarModel, freeDrawToolOf, DEFAULT_TOOLBAR_STATE, showsSnapFeedback } from "./toolbar-model";

const A = { x: 0, y: 0 };
const B = { x: 1000, y: 0 };
const C = { x: 1000, y: 800 };

/** Rejoue une suite de clics et rend l'état final avec tout ce qui a été validé. */
function clicks(state: FreeDrawState, vertices: readonly { x: number; y: number }[]) {
  const commits: { kind: string; points: readonly { x: number; y: number }[] }[] = [];
  const rejects: string[] = [];
  let current = state;
  for (const vertex of vertices) {
    const step = freeDrawClick(current, vertex);
    current = step.state;
    if (step.commit) commits.push({ kind: step.commit.kind, points: step.commit.points });
    if (step.rejected) rejects.push(step.rejected);
  }
  return { state: current, commits, rejects };
}

describe("outil Point (§4)", () => {
  it("valide un point par clic, et reste armé pour le suivant", () => {
    const { state, commits } = clicks(beginFreeDraw("point"), [A, B, C]);
    expect(commits).toEqual([
      { kind: "point", points: [A] },
      { kind: "point", points: [B] },
      { kind: "point", points: [C] },
    ]);
    // Aucun sommet en attente : un point n'a rien à accumuler.
    expect(state.pending).toEqual([]);
    expect(isFreeDrawInProgress(state)).toBe(false);
  });
});

describe("outil Segment (§4)", () => {
  it("valide au second clic et repart à vide", () => {
    const { state, commits } = clicks(beginFreeDraw("segment"), [A, B]);
    expect(commits).toEqual([{ kind: "segment", points: [A, B] }]);
    expect(state.pending).toEqual([]);
  });

  it("ne valide rien après un seul clic", () => {
    const { state, commits } = clicks(beginFreeDraw("segment"), [A]);
    expect(commits).toEqual([]);
    expect(state.pending).toEqual([A]);
    expect(isFreeDrawInProgress(state)).toBe(true);
  });

  it("refuse un second clic confondu avec le premier, plutôt que de créer un segment nul", () => {
    const { state, commits, rejects } = clicks(beginFreeDraw("segment"), [A, { x: 0.0001, y: 0 }]);
    expect(commits).toEqual([]);
    expect(rejects).toHaveLength(1);
    // Le premier sommet est CONSERVÉ : le geste continue, il n'est pas cassé par un clic raté.
    expect(state.pending).toEqual([A]);
  });

  it("Échap abandonne le geste sans rien produire", () => {
    const started = clicks(beginFreeDraw("segment"), [A]).state;
    const cancelled = freeDrawCancel(started);
    expect(cancelled.pending).toEqual([]);
    expect(isFreeDrawInProgress(cancelled)).toBe(false);
  });
});

describe("outil Polyligne (§4)", () => {
  it("accumule les sommets et valide sur la fin explicite", () => {
    const { state, commits } = clicks(beginFreeDraw("polyline"), [A, B, C]);
    expect(commits).toEqual([]);
    expect(state.pending).toEqual([A, B, C]);
    expect(canFinishFreeDraw(state)).toBe(true);

    const finished = freeDrawFinish(state);
    expect(finished.commit).toEqual({ kind: "polyline", points: [A, B, C] });
    expect(finished.state.pending).toEqual([]);
  });

  it("absorbe le second clic d'un double-clic de fin", () => {
    // Un double-clic émet DEUX clics puis la fin : sans le refus du sommet confondu, la
    // polyligne se refermerait sur un sommet en double.
    const { state, rejects } = clicks(beginFreeDraw("polyline"), [A, B, C, { ...C }]);
    expect(rejects).toHaveLength(1);
    expect(freeDrawFinish(state).commit).toEqual({ kind: "polyline", points: [A, B, C] });
  });

  it("abandonne un tracé d'un seul sommet plutôt que de le transformer en point", () => {
    const single = clicks(beginFreeDraw("polyline"), [A]).state;
    const finished = freeDrawFinish(single);
    expect(finished.commit).toBeNull();
    expect(finished.rejected).toMatch(/au moins deux/);
    expect(finished.state.pending).toEqual([]);
  });

  it("ne fait rien si l'on termine sans avoir commencé", () => {
    const empty = beginFreeDraw("polyline");
    expect(freeDrawFinish(empty).commit).toBeNull();
    expect(canFinishFreeDraw(empty)).toBe(false);
  });

  it("refuse un sommet au-delà de la limite, sans perdre le tracé en cours", () => {
    const many = Array.from({ length: MAX_FREE_POLYLINE_VERTICES }, (_, index) => ({ x: index * 10, y: 0 }));
    const filled = clicks(beginFreeDraw("polyline"), many).state;
    expect(filled.pending).toHaveLength(MAX_FREE_POLYLINE_VERTICES);

    const overflow = freeDrawClick(filled, { x: 999_000, y: 5 });
    expect(overflow.commit).toBeNull();
    expect(overflow.rejected).toMatch(/Entrée/);
    expect(overflow.state.pending).toHaveLength(MAX_FREE_POLYLINE_VERTICES);
    // Le tracé reste terminable : la limite bloque l'ajout, jamais la validation.
    expect(freeDrawFinish(overflow.state).commit?.points).toHaveLength(MAX_FREE_POLYLINE_VERTICES);
  });

  it("Échap n'émet aucun commit, quel que soit le nombre de sommets posés", () => {
    const started = clicks(beginFreeDraw("polyline"), [A, B, C]).state;
    expect(freeDrawCancel(started).pending).toEqual([]);
  });
});

describe("prévisualisation (§6)", () => {
  it("relie les sommets posés puis le curseur", () => {
    const state = clicks(beginFreeDraw("polyline"), [A, B]).state;
    expect(freeDrawGhostSegments(state, C)).toEqual([
      [A, B],
      [B, C],
    ]);
  });

  it("ne trace aucune amorce sans curseur ni sans sommet posé", () => {
    expect(freeDrawGhostSegments(clicks(beginFreeDraw("polyline"), [A]).state, null)).toEqual([]);
    expect(freeDrawGhostSegments(beginFreeDraw("point"), C)).toEqual([]);
  });

  it("n'amorce rien vers un curseur confondu avec le dernier sommet", () => {
    const state = clicks(beginFreeDraw("segment"), [A]).state;
    expect(freeDrawGhostSegments(state, { x: 0.0001, y: 0 })).toEqual([]);
  });

  it("annonce ce que le prochain geste fera, à chaque étape", () => {
    expect(freeDrawHint(beginFreeDraw("segment"))).toMatch(/point de départ/);
    expect(freeDrawHint(clicks(beginFreeDraw("segment"), [A]).state)).toMatch(/arrivée/);
    expect(freeDrawHint(clicks(beginFreeDraw("polyline"), [A, B]).state)).toMatch(/Entrée/);
  });
});

describe("barre d'outils (§4)", () => {
  it("expose les trois outils de création, désactivés hors du mode tracé libre", () => {
    const off = buildToolbarModel(DEFAULT_TOOLBAR_STATE);
    for (const tool of FREE_DRAW_TOOLS) {
      const button = off.find((entry) => entry.id === tool);
      expect(button?.disabled).toBe(true);
      expect(button?.ariaLabel).toMatch(/paramétrique/);
    }

    const on = buildToolbarModel(DEFAULT_TOOLBAR_STATE, { drawingAvailable: true });
    for (const tool of FREE_DRAW_TOOLS) {
      expect(on.find((entry) => entry.id === tool)?.disabled).toBe(false);
    }
  });

  it("désigne l'outil de création actif, et lui seul", () => {
    expect(freeDrawToolOf({ ...DEFAULT_TOOLBAR_STATE, tool: "polyline" })).toBe("polyline");
    expect(freeDrawToolOf({ ...DEFAULT_TOOLBAR_STATE, tool: "select" })).toBeNull();
    expect(freeDrawToolOf({ ...DEFAULT_TOOLBAR_STATE, tool: "edit" })).toBeNull();
  });

  it("montre l'accrochage pendant la création comme pendant la sélection (§5/§6)", () => {
    expect(showsSnapFeedback({ ...DEFAULT_TOOLBAR_STATE, tool: "segment" })).toBe(true);
    expect(showsSnapFeedback({ ...DEFAULT_TOOLBAR_STATE, tool: "select" })).toBe(true);
    expect(showsSnapFeedback({ ...DEFAULT_TOOLBAR_STATE, tool: "pan" })).toBe(false);
  });
});

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §3/§4/§18 — outil Contour.
 *
 * Le contour partage tout le flux de la polyligne et n'y ajoute qu'une chose : le clic sur le
 * PREMIER sommet referme la forme. C'est ce clic-là qui est vérifié sous tous ses angles, parce
 * que c'est le seul geste réellement nouveau — et parce que l'automate le rencontre au moment
 * précis où il aurait autrement rejeté un « sommet qui ne dit rien de neuf ».
 */
describe("outil Contour (§3/§4)", () => {
  const D = { x: 0, y: 800 };

  it("n'ouvre aucune primitive avant le troisième sommet", () => {
    const { state, commits } = clicks(beginFreeDraw("polygon"), [A, B, C]);
    expect(commits).toEqual([]);
    expect(state.pending).toHaveLength(3);
  });

  it("referme sur un clic au premier sommet, sans y répéter ce sommet", () => {
    const { state, commits } = clicks(beginFreeDraw("polygon"), [A, B, C, D, A]);
    expect(commits).toHaveLength(1);
    expect(commits[0].kind).toBe("polygon");
    expect(commits[0].points).toEqual([A, B, C, D]);
    expect(state.pending).toEqual([]);
  });

  it("referme aussi par Entrée / double-clic, à partir de trois sommets", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    expect(canFinishFreeDraw(started.state)).toBe(true);
    const finished = freeDrawFinish(started.state);
    expect(finished.commit).toEqual({ kind: "polygon", points: [A, B, C] });
    expect(finished.state.pending).toEqual([]);
  });

  it("refuse de refermer à deux sommets — un contour de deux côtés n'enferme rien", () => {
    const two = clicks(beginFreeDraw("polygon"), [A, B]);
    expect(canFinishFreeDraw(two.state)).toBe(false);
    // Le clic sur le premier sommet ne referme pas non plus, et n'ajoute PAS un sommet en
    // double : il est refusé sur-le-champ, en disant ce qui manque.
    const back = freeDrawClick(two.state, A);
    expect(back.commit).toBeNull();
    expect(back.rejected).toMatch(/au moins 3 sommets pour refermer/);
    expect(back.state.pending).toEqual([A, B]);
  });

  it("abandonne un tracé trop court plutôt que d'inventer une forme", () => {
    const abandoned = freeDrawFinish(clicks(beginFreeDraw("polygon"), [A, B]).state);
    expect(abandoned.commit).toBeNull();
    expect(abandoned.rejected).toMatch(/au moins trois/);
    expect(abandoned.state.pending).toEqual([]);
  });

  it("§6 — Échap efface le tracé en cours sans rien valider", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    expect(isFreeDrawInProgress(started.state)).toBe(true);
    const cancelled = freeDrawCancel(started.state);
    expect(cancelled.pending).toEqual([]);
    expect(isFreeDrawInProgress(cancelled)).toBe(false);
  });

  it("continue de refuser un sommet confondu avec le précédent", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B]);
    const repeated = freeDrawClick(started.state, { x: B.x, y: B.y });
    expect(repeated.commit).toBeNull();
    expect(repeated.rejected).toMatch(/confondu/);
    expect(repeated.state.pending).toHaveLength(2);
  });

  it("annonce la fermeture possible exactement quand elle l'est", () => {
    expect(closesFreeContour(clicks(beginFreeDraw("polygon"), [A, B]).state, A)).toBe(false);
    expect(closesFreeContour(clicks(beginFreeDraw("polygon"), [A, B, C]).state, A)).toBe(true);
    // Un demi-millimètre plus loin, ce n'est plus le premier sommet : l'accrochage n'a pas mordu.
    expect(closesFreeContour(clicks(beginFreeDraw("polygon"), [A, B, C]).state, { x: 0.5, y: 0 })).toBe(false);
    // Une polyligne ne referme jamais, quel que soit le clic.
    expect(closesFreeContour(clicks(beginFreeDraw("polyline"), [A, B, C]).state, A)).toBe(false);
  });

  it("§18 — dessine le côté de fermeture pendant le tracé", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    const ghosts = freeDrawGhostSegments(started.state, D);
    // A→B, B→C, C→curseur, puis curseur→A : la forme enfermée est visible avant le dernier clic.
    expect(ghosts).toHaveLength(4);
    expect(ghosts[3]).toEqual([D, A]);
  });

  it("§18 — ne double pas le trait quand un seul sommet est posé", () => {
    const one = clicks(beginFreeDraw("polygon"), [A]);
    expect(freeDrawGhostSegments(one.state, B)).toEqual([[A, B]]);
  });

  it("§18 — la prévisualisation de surface est la forme qui SERAIT validée", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B]);
    expect(freeDrawContourPreview(started.state, null)).toBeNull(); // deux sommets : rien à mesurer
    expect(freeDrawContourPreview(started.state, C)).toEqual([A, B, C]);
    expect(freeDrawContourPreview(clicks(beginFreeDraw("polyline"), [A, B, C]).state, D)).toBeNull();
  });

  it("plafonne le nombre de sommets en le disant", () => {
    let state = beginFreeDraw("polygon");
    for (let index = 0; index < MAX_FREE_POLYLINE_VERTICES; index += 1) {
      state = freeDrawClick(state, { x: index * 10, y: index % 2 === 0 ? 0 : 10 }).state;
    }
    const refused = freeDrawClick(state, { x: 99_999, y: 42 });
    expect(refused.rejected).toMatch(new RegExp(`${MAX_FREE_POLYLINE_VERTICES} sommets`));
    expect(refused.state.pending).toHaveLength(MAX_FREE_POLYLINE_VERTICES);
  });

  it("guide le geste à chaque étape, sans promettre un geste impossible", () => {
    expect(freeDrawHint(beginFreeDraw("polygon"))).toMatch(/premier sommet/);
    expect(freeDrawHint(clicks(beginFreeDraw("polygon"), [A]).state)).toMatch(/encore 2/);
    expect(freeDrawHint(clicks(beginFreeDraw("polygon"), [A, B]).state)).toMatch(/encore 1/);
    // Refermer n'est proposé qu'une fois possible.
    expect(freeDrawHint(clicks(beginFreeDraw("polygon"), [A, B]).state)).not.toMatch(/refermer/);
    expect(freeDrawHint(clicks(beginFreeDraw("polygon"), [A, B, C]).state)).toMatch(/refermer/);
  });

  it("est proposé par la barre au même titre que les autres outils de création", () => {
    expect(FREE_DRAW_TOOLS).toContain("polygon");
    expect(freeDrawToolOf({ ...DEFAULT_TOOLBAR_STATE, tool: "polygon" })).toBe("polygon");
    expect(showsSnapFeedback({ ...DEFAULT_TOOLBAR_STATE, tool: "polygon" })).toBe(true);
    const button = buildToolbarModel(DEFAULT_TOOLBAR_STATE, { drawingAvailable: true }).find(
      (entry) => entry.id === "polygon",
    );
    expect(button?.label).toBe("Contour");
    expect(button?.disabled).toBe(false);
  });
});

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §4 — portée de VISÉE du clic de fermeture.
 *
 * Les sommets d'un tracé en cours ne sont pas dans la scène : l'accrochage ne les propose pas
 * comme cibles, donc le clic de fermeture ne peut pas tomber au millième de millimètre sur le
 * premier sommet. Cette tolérance est ce qui rend la fermeture à la souris réalisable — et ce
 * qui est vérifié ici est qu'elle ne coûte AUCUNE précision sur la forme enregistrée.
 */
describe("fermeture à la visée (§4)", () => {
  const REACH = 25;
  const near = { x: A.x + 12, y: A.y - 9 }; // à 15 mm du premier sommet

  it("referme quand le clic tombe dans la portée annoncée", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    expect(closesFreeContour(started.state, near, REACH)).toBe(true);
    const closed = freeDrawClick(started.state, near, { closeToleranceMm: REACH });
    expect(closed.commit?.kind).toBe("polygon");
  });

  it("n'enregistre PAS la position du clic : le contour validé est celui qui était posé", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    const closed = freeDrawClick(started.state, near, { closeToleranceMm: REACH });
    // Trois sommets, exactement ceux qui ont été accrochés — pas quatre, et pas `near`.
    expect(closed.commit?.points).toEqual([A, B, C]);
  });

  it("ne referme pas hors de la portée", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    const far = { x: A.x + 200, y: A.y };
    expect(closesFreeContour(started.state, far, REACH)).toBe(false);
    expect(freeDrawClick(started.state, far, { closeToleranceMm: REACH }).commit).toBeNull();
  });

  it("reste strict quand l'appelant ne dit rien de son pointeur", () => {
    const started = clicks(beginFreeDraw("polygon"), [A, B, C]);
    expect(closesFreeContour(started.state, near)).toBe(false);
    expect(closesFreeContour(started.state, A)).toBe(true);
  });

  it("refuse une fermeture prématurée dans la portée, sans ajouter de sommet", () => {
    const two = clicks(beginFreeDraw("polygon"), [A, B]);
    const early = freeDrawClick(two.state, near, { closeToleranceMm: REACH });
    expect(early.commit).toBeNull();
    expect(early.rejected).toMatch(/au moins 3 sommets pour refermer/);
    expect(early.state.pending).toEqual([A, B]);
  });

  it("n'applique jamais la portée à une polyligne", () => {
    const started = clicks(beginFreeDraw("polyline"), [A, B, C]);
    expect(closesFreeContour(started.state, near, REACH)).toBe(false);
    // Le clic pose un quatrième sommet, comme n'importe quel autre.
    expect(freeDrawClick(started.state, near, { closeToleranceMm: REACH }).state.pending).toHaveLength(4);
  });
});
