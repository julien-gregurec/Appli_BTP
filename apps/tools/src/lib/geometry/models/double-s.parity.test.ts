// Parité géométrique avant/après migration vers Engine B (C4-LOT4-CURVES-V1 §7). Valeurs figées
// extraites de l'ancien modèle (commit 46e3ee9a35be44fb26f5eea70f3d19c281f5aa61) via
// `git show <commit>:.../models/double-s.ts` dans un fichier temporaire, dumpées puis supprimées —
// jamais recalculées ici. Correspondance d'id ancien -> nouveau (Engine B) :
//   S{n}-A -> S{n}-P2 (bas)   S{n}-M -> S{n}-P1 (milieu)   S{n}-B -> S{n}-P0 (haut)
//   S{n}-CL -> S{n}-C1 (centre arc bas)   S{n}-CU -> S{n}-C0 (centre arc haut)
import { describe, expect, it } from "vitest";
import { createDoubleSGeometry } from "./double-s";

function byId(model: ReturnType<typeof createDoubleSGeometry>, id: string) {
  const p = model.points.find((pt) => pt.id === id);
  if (!p) throw new Error(`point ${id} introuvable`);
  return p;
}

describe("createDoubleSGeometry — parité Engine B (jeu A : valeurs historiques par défaut)", () => {
  const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });

  it("largeur, hauteur, bombement, rayon, entraxe", () => {
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(2000, 9);
    expect(model.dimensions.find((d) => d.id === "dim-bulge")?.value).toBeCloseTo(240, 9);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(640.8333333333334, 6);
    expect(model.dimensions.find((d) => d.id === "dim-spacing")?.value).toBeCloseTo(640, 9);
  });

  it("points A/M/B du premier S", () => {
    expect(byId(model, "S1-P2")).toMatchObject({ x: 0, y: 0 });
    expect(byId(model, "S1-P1")).toMatchObject({ x: 0, y: 1000 });
    expect(byId(model, "S1-P0")).toMatchObject({ x: 0, y: 2000 });
  });

  it("points A/M/B du second S", () => {
    expect(byId(model, "S2-P2")).toMatchObject({ x: 640, y: 0 });
    expect(byId(model, "S2-P1")).toMatchObject({ x: 640, y: 1000 });
    expect(byId(model, "S2-P0")).toMatchObject({ x: 640, y: 2000 });
  });

  it("centres d'arcs du premier S", () => {
    const cl = byId(model, "S1-C1");
    const cu = byId(model, "S1-C0");
    expect(cl.x).toBeCloseTo(-400.83333333333337, 6);
    expect(cl.y).toBeCloseTo(500, 6);
    expect(cu.x).toBeCloseTo(400.8333333333334, 6);
    expect(cu.y).toBeCloseTo(1500, 6);
  });

  it("centres d'arcs du second S (bombement inversé)", () => {
    const cl = byId(model, "S2-C1");
    const cu = byId(model, "S2-C0");
    expect(cl.x).toBeCloseTo(1040.8333333333335, 6);
    expect(cl.y).toBeCloseTo(500, 6);
    expect(cu.x).toBeCloseTo(239.16666666666657, 6);
    expect(cu.y).toBeCloseTo(1500, 6);
  });

  it("symétrie : même hauteur, même rayon pour les deux S", () => {
    expect(model.arcs[0].radius).toBeCloseTo(model.arcs[2].radius, 9);
    expect(model.arcs[1].radius).toBeCloseTo(model.arcs[3].radius, 9);
  });
});

describe("createDoubleSGeometry — parité Engine B (jeu B : dimensions différentes)", () => {
  const model = createDoubleSGeometry({ width: 1500, height: 3600, waistRatio: 0.18 });

  it("bombement, rayon, entraxe", () => {
    expect(model.dimensions.find((d) => d.id === "dim-bulge")?.value).toBeCloseTo(270, 9);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1635, 6);
    expect(model.dimensions.find((d) => d.id === "dim-spacing")?.value).toBeCloseTo(840, 9);
  });

  it("points A/M/B des deux S", () => {
    expect(byId(model, "S1-P2")).toMatchObject({ x: 0, y: 0 });
    expect(byId(model, "S1-P1")).toMatchObject({ x: 0, y: 1800 });
    expect(byId(model, "S1-P0")).toMatchObject({ x: 0, y: 3600 });
    expect(byId(model, "S2-P2")).toMatchObject({ x: 840, y: 0 });
    expect(byId(model, "S2-P1")).toMatchObject({ x: 840, y: 1800 });
    expect(byId(model, "S2-P0")).toMatchObject({ x: 840, y: 3600 });
  });

  it("centres d'arcs des deux S", () => {
    const s1cl = byId(model, "S1-C1"); const s1cu = byId(model, "S1-C0");
    const s2cl = byId(model, "S2-C1"); const s2cu = byId(model, "S2-C0");
    expect(s1cl.x).toBeCloseTo(-1365, 5); expect(s1cl.y).toBeCloseTo(900, 6);
    expect(s1cu.x).toBeCloseTo(1365, 5); expect(s1cu.y).toBeCloseTo(2700, 6);
    expect(s2cl.x).toBeCloseTo(2205, 5); expect(s2cl.y).toBeCloseTo(900, 6);
    expect(s2cu.x).toBeCloseTo(-524.9999999999999, 5); expect(s2cu.y).toBeCloseTo(2700, 6);
  });

  it("hauteur", () => {
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(3600, 9);
  });
});
