/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §12 — accrochages.
 */

import { describe, expect, it } from "vitest";
import { geometrySnapCandidates, snap, snapCandidates, snapToGrid, SNAP_PRIORITY, type SnapKind } from "./snap";
import type { HitTestScene } from "./hit-test";
import { point } from "./primitives";

const SCENE: HitTestScene = {
  points: [point("O", 0, 0, "Origine", "center")],
  segments: [{ id: "AB", start: point("A", 0, 0), end: point("B", 400, 0) }],
  arcs: [{ id: "arc", centre: point("C", 1000, 0), radius: 200, startAngle: 0, endAngle: Math.PI }],
  circles: [{ id: "cercle", centre: point("Z", -1000, -1000), radius: 50 }],
  ellipses: [{ id: "ell", centre: point("E", 2000, 2000), radiusX: 300, radiusY: 100 }],
  polylines: [{ id: "pl", points: [point("p1", 0, 500), point("p2", 200, 500), point("p3", 200, 700)] }],
  polygons: [{ id: "gon", points: [point("q1", -500, 0), point("q2", -300, 0), point("q3", -300, 200)] }],
};

function kindsAt(target: { x: number; y: number }, tolerance: number, gridStepMm?: number): SnapKind[] {
  return snapCandidates(SCENE, target, { toleranceWorld: tolerance, gridStepMm }).map((c) => c.kind);
}

describe("grille (§6)", () => {
  it("arrondit au pas le plus proche, en millimètres", () => {
    expect(snapToGrid({ x: 143, y: -287 }, 100)).toEqual({ x: 100, y: -300 });
    expect(snapToGrid({ x: 151, y: 249 }, 100)).toEqual({ x: 200, y: 200 });
  });

  it("est déterministe", () => {
    expect(snapToGrid({ x: 77.7, y: 12.3 }, 50)).toEqual(snapToGrid({ x: 77.7, y: 12.3 }, 50));
  });

  it("laisse la cible intacte si le pas est absurde", () => {
    expect(snapToGrid({ x: 7, y: 9 }, 0)).toEqual({ x: 7, y: 9 });
    expect(snapToGrid({ x: 7, y: 9 }, Number.NaN)).toEqual({ x: 7, y: 9 });
  });

  it("n'est proposée que si le point de grille est lui-même dans la tolérance", () => {
    // (1300, 1300) : loin de toute géométrie. Le noeud de grille le plus proche est (1300,1300).
    expect(kindsAt({ x: 1300, y: 1300 }, 20, 100)).toEqual(["grid"]);
    // Décalé de 40 mm du noeud, tolérance 20 : rien ne doit être proposé.
    expect(kindsAt({ x: 1340, y: 1340 }, 20, 100)).toEqual([]);
  });

  it("n'est jamais proposée sans pas de grille", () => {
    expect(kindsAt({ x: 1300, y: 1300 }, 20)).toEqual([]);
  });

  it("cède devant une géométrie réelle au même endroit", () => {
    // (0,0) porte l'origine nommée ET un noeud de grille : le point nommé doit gagner.
    const best = snap(SCENE, { x: 2, y: 2 }, { toleranceWorld: 20, gridStepMm: 100 });
    expect(best?.kind).toBe("point");
    expect(best?.label).toBe("Origine");
  });
});

describe("points existants", () => {
  it("propose le point nommé du modèle avec son libellé", () => {
    const best = snap(SCENE, { x: 5, y: 3 }, { toleranceWorld: 20 });
    expect(best?.kind).toBe("point");
    expect(best?.entityId).toBe("O");
    expect(best?.position).toEqual({ x: 0, y: 0 });
  });
});

describe("extrémités", () => {
  it("propose le départ et l'arrivée d'un segment", () => {
    const near = snap(SCENE, { x: 398, y: 4 }, { toleranceWorld: 20 });
    expect(near?.kind).toBe("endpoint");
    expect(near?.position).toEqual({ x: 400, y: 0 });
  });

  it("propose les extrémités réelles d'un arc, pas celles de sa corde", () => {
    const found = geometrySnapCandidates(SCENE, { x: 1200, y: 0 }).filter((c) => c.entityId === "arc" && c.kind === "endpoint");
    const positions = found.map((c) => [Math.round(c.position.x), Math.round(c.position.y)]);
    expect(positions).toContainEqual([1200, 0]);
    expect(positions).toContainEqual([800, 0]);
  });

  it("propose les sommets d'une polyligne et d'un contour", () => {
    expect(snap(SCENE, { x: 198, y: 702 }, { toleranceWorld: 20 })?.position).toEqual({ x: 200, y: 700 });
    expect(snap(SCENE, { x: -302, y: 198 }, { toleranceWorld: 20 })?.position).toEqual({ x: -300, y: 200 });
  });
});

describe("milieux", () => {
  it("propose le milieu d'un segment", () => {
    const best = snap(SCENE, { x: 203, y: 3 }, { toleranceWorld: 20 });
    expect(best?.kind).toBe("midpoint");
    expect(best?.position).toEqual({ x: 200, y: 0 });
  });

  it("propose le milieu SUR l'arc, pas le milieu de la corde", () => {
    // Demi-cercle de centre (1000,0) rayon 200 : milieu de l'arc = (1000, 200) ;
    // milieu de la corde = (1000, 0). Ce sont deux endroits différents.
    const best = snap(SCENE, { x: 1000, y: 197 }, { toleranceWorld: 20 });
    expect(best?.kind).toBe("midpoint");
    expect(best?.position.x).toBeCloseTo(1000, 6);
    expect(best?.position.y).toBeCloseTo(200, 6);
  });

  it("propose le milieu du côté de fermeture d'un contour", () => {
    // Côté q3(-300,200) → q1(-500,0) : milieu (-400, 100).
    const best = snap(SCENE, { x: -398, y: 102 }, { toleranceWorld: 20 });
    expect(best?.kind).toBe("midpoint");
    expect(best?.position).toEqual({ x: -400, y: 100 });
  });

  it("ne propose pas de milieu de fermeture pour une polyligne ouverte", () => {
    // Milieu du côté p3(200,700) → p1(0,500) serait (100,600) : il ne doit pas exister.
    const found = geometrySnapCandidates(SCENE, { x: 100, y: 600 }).filter(
      (c) => c.entityId === "pl" && Math.abs(c.position.x - 100) < 1e-6 && Math.abs(c.position.y - 600) < 1e-6,
    );
    expect(found).toEqual([]);
  });
});

describe("centres", () => {
  it("propose le centre d'un cercle", () => {
    const best = snap(SCENE, { x: -998, y: -1002 }, { toleranceWorld: 20 });
    expect(best?.kind).toBe("center");
    expect(best?.position).toEqual({ x: -1000, y: -1000 });
  });

  it("propose le centre d'une ellipse", () => {
    expect(snap(SCENE, { x: 2001, y: 2001 }, { toleranceWorld: 20 })?.position).toEqual({ x: 2000, y: 2000 });
  });

  it("propose le centre d'un arc", () => {
    const best = snap(SCENE, { x: 1001, y: 1 }, { toleranceWorld: 20 });
    expect(best?.entityId).toBe("arc");
    expect(best?.position).toEqual({ x: 1000, y: 0 });
  });
});

describe("priorité et dédoublonnage", () => {
  it("classe point < endpoint < midpoint < center < grille", () => {
    expect(SNAP_PRIORITY.point).toBeLessThan(SNAP_PRIORITY.endpoint);
    expect(SNAP_PRIORITY.endpoint).toBeLessThan(SNAP_PRIORITY.midpoint);
    expect(SNAP_PRIORITY.midpoint).toBeLessThan(SNAP_PRIORITY.center);
    expect(SNAP_PRIORITY.center).toBeLessThan(SNAP_PRIORITY.grid);
  });

  it("ne propose qu'un seul candidat par endroit", () => {
    // (0,0) porte : le point nommé O, l'extrémité A du segment, et un sommet du contour absent.
    const at = snapCandidates(SCENE, { x: 0, y: 0 }, { toleranceWorld: 5, gridStepMm: 100 });
    const positions = at.map((c) => `${c.position.x}|${c.position.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("garde le candidat le plus signifiant en cas de superposition", () => {
    expect(snapCandidates(SCENE, { x: 0, y: 0 }, { toleranceWorld: 5 })[0].kind).toBe("point");
  });

  it("respecte le filtre de natures", () => {
    const only = snapCandidates(SCENE, { x: 2, y: 2 }, { toleranceWorld: 20, gridStepMm: 100, kinds: ["grid"] });
    expect(only.map((c) => c.kind)).toEqual(["grid"]);
  });

  it("est ordonné et déterministe", () => {
    const options = { toleranceWorld: 300, gridStepMm: 100 };
    const first = snapCandidates(SCENE, { x: 120, y: 40 }, options);
    expect(first).toEqual(snapCandidates(SCENE, { x: 120, y: 40 }, options));
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index - 1].priority).toBeLessThanOrEqual(first[index].priority);
    }
  });

  it("ne renvoie rien sur une scène vide", () => {
    expect(snap({}, { x: 0, y: 0 }, { toleranceWorld: 100 })).toBeNull();
  });
});
