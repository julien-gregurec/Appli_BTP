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
  freeDrawCancel,
  freeDrawClick,
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
