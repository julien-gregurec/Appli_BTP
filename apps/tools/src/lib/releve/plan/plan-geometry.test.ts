import { describe, expect, it } from "vitest";
import { EMPTY_PLAN_DOCUMENT, diffPlan, isPlanOperationsEmpty, validatePlanDocument, type PlanDocument, type PlanMur } from "@elsatia/releve-domain";
import { createHistory, currentState, pushHistory, redo, undo } from "@/lib/tracing/history";
import {
  addOpening, addWall, alignWalls, assignRoom, deleteWalls, fitOpenings, mergeWalls, moveVertex, moveWall, OPENING_PRESETS, pointAtLength,
  setWallAngle, setWallLength, splitWall, straightenWall, unassignRoom, updateOpening, withRefreshedContours, DEFAULT_WALL,
} from "./editor";
import { planToSvg } from "./export-svg";
import { contourArea, detectRooms, hitTestVertex, hitTestWall, openingSegment, planBounds, refreshContours, roomAt, wallAngleDegrees, wallLength } from "./geometry";
import {
  formatLongueurCm, formatLongueurM, openingSymbol, overallDimensions, parseAngleDegres, parseEpaisseurCm, parseLongueurCm, visibleWalls, wallDimension,
} from "./render";
import { resolvePlanSnap } from "./snap";

const mur = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<PlanMur> = {}): PlanMur => ({
  id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", ...extra,
});
/** Rectangle d'axes 4200 × 3200, murs de 200 : intérieur 4000 × 3000 = 12 m². */
const rectangle = (): PlanDocument => ({
  ...EMPTY_PLAN_DOCUMENT,
  murs: [mur("s", 0, 0, 4200, 0), mur("e", 4200, 0, 4200, 3200), mur("n", 4200, 3200, 0, 3200), mur("w", 0, 3200, 0, 0)],
});
let seq = 0;
const id = () => `id-${++seq}`;

describe("géométrie du plan (adaptateur Engine B)", () => {
  it("longueur, angle, emprise", () => {
    const doc = rectangle();
    expect(wallLength(doc.murs[0])).toBe(4200);
    expect(wallAngleDegrees(doc.murs[1])).toBe(90);
    expect(wallAngleDegrees(doc.murs[2])).toBe(180);
    expect(planBounds(doc)).toEqual({ minX: 0, minY: 0, maxX: 4200, maxY: 3200 });
    expect(planBounds(EMPTY_PLAN_DOCUMENT)).toEqual(EMPTY_PLAN_DOCUMENT.cadre);
  });

  it("détection de pièce : contour intérieur au nu des murs (épaisseurs par mur)", () => {
    const rooms = detectRooms(rectangle().murs);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaMm2).toBeCloseTo(12_000_000);
    expect(rooms[0].murIds.sort()).toEqual(["e", "n", "s", "w"]);
    const mixed = { ...rectangle(), murs: rectangle().murs.map((m) => (m.id === "w" ? { ...m, epaisseurMm: 100 } : m)) };
    expect(detectRooms(mixed.murs)[0].areaMm2).toBeCloseTo(4050 * 3000);
  });

  it("deux pièces séparées par une cloison en T ; pièce trouvée par un point intérieur", () => {
    const doc = { ...rectangle(), murs: [...rectangle().murs, mur("c", 2100, 0, 2100, 3200, { epaisseurMm: 100 })] };
    const rooms = detectRooms(doc.murs);
    expect(rooms).toHaveLength(2);
    expect(roomAt(rooms, { x: 500, y: 500 })?.areaMm2).toBeCloseTo((2100 - 100 - 50) * 3000);
    expect(roomAt(rooms, { x: 9000, y: 500 })).toBeNull();
  });

  it("désignation : mur (demi-épaisseur + tolérance) et sommet", () => {
    const doc = rectangle();
    expect(hitTestWall(doc.murs, { x: 2000, y: 90 }, 5)?.murId).toBe("s");
    expect(hitTestWall(doc.murs, { x: 2000, y: 400 }, 5)).toBeNull();
    expect(hitTestVertex(doc.murs, { x: 4195, y: 3204 }, 10)?.point).toEqual({ x: 4200, y: 3200 });
  });
});

describe("accrochage", () => {
  const doc = rectangle();
  const options = { toleranceWorld: 50 };
  it("extrémité prioritaire sur le milieu et l'axe", () => {
    expect(resolvePlanSnap({ x: 4180, y: 20 }, doc.murs, options)).toMatchObject({ kind: "extremite", point: { x: 4200, y: 0 } });
    expect(resolvePlanSnap({ x: 2110, y: 10 }, doc.murs, options)).toMatchObject({ kind: "milieu", point: { x: 2100, y: 0 } });
  });
  it("horizontal / vertical / angle usuel depuis le point de départ", () => {
    const origin = { x: 1000, y: 6000 };
    expect(resolvePlanSnap({ x: 3000, y: 6030 }, doc.murs, { ...options, origin })).toMatchObject({ kind: "horizontal", angleDegrees: 0 });
    expect(resolvePlanSnap({ x: 1030, y: 8000 }, doc.murs, { ...options, origin })).toMatchObject({ kind: "vertical", angleDegrees: 90 });
    const diagonal = resolvePlanSnap({ x: 3000, y: 8040 }, doc.murs, { ...options, origin });
    expect(diagonal.kind).toBe("angle");
    expect(diagonal.angleDegrees).toBe(45);
  });
  it("horizontale combinée à l'axe d'une extrémité existante", () => {
    const snap = resolvePlanSnap({ x: 4230, y: 6020 }, doc.murs, { ...options, origin: { x: 1000, y: 6000 } });
    expect(snap).toMatchObject({ kind: "horizontal", point: { x: 4200, y: 6000 } });
  });
  it("alignement seul, sur le mur, grille, libre, désactivé", () => {
    expect(resolvePlanSnap({ x: 4230, y: 9000 }, doc.murs, options)).toMatchObject({ kind: "alignement", point: { x: 4200, y: 9000 } });
    const oblique = resolvePlanSnap({ x: 1020, y: 980 }, [mur("d", 0, 0, 3000, 3000)], options);
    expect(oblique.kind).toBe("sur_mur");
    expect(oblique.point.x).toBeCloseTo(1000); expect(oblique.point.y).toBeCloseTo(1000);
    expect(resolvePlanSnap({ x: 9013, y: 9088 }, doc.murs, { ...options, gridMm: 100 })).toMatchObject({ kind: "grille", point: { x: 9000, y: 9100 } });
    expect(resolvePlanSnap({ x: 9013, y: 9088 }, doc.murs, options).kind).toBe("libre");
    expect(resolvePlanSnap({ x: 4180, y: 20 }, doc.murs, { ...options, enabled: false }).kind).toBe("libre");
  });
  it("500 murs : accrochage < 5 ms en moyenne (préfiltre des murs voisins)", () => {
    const grid: PlanMur[] = [];
    for (let i = 0; i < 250; i++) grid.push(mur(`h${i}`, 0, i * 1000, 20_000, i * 1000), mur(`v${i}`, (i % 20) * 1000, 0, (i % 20) * 1000, 250_000));
    const started = performance.now();
    for (let k = 0; k < 200; k++) resolvePlanSnap({ x: 5000 + k, y: 5000 + k * 3 }, grid, { toleranceWorld: 40, origin: { x: 0, y: 0 } });
    expect((performance.now() - started) / 200).toBeLessThan(5);
  });
});

describe("édition", () => {
  it("créer un mur (point de départ, arrivée, longueur saisie)", () => {
    const doc = addWall(EMPTY_PLAN_DOCUMENT, { x: 0, y: 0 }, pointAtLength({ x: 0, y: 0 }, { x: 0, y: 50 }, 3000), DEFAULT_WALL, "m1");
    expect(doc.murs[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 0, y: 3000 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "cloison" });
    expect(addWall(doc, { x: 0, y: 0 }, { x: 3, y: 0 }, DEFAULT_WALL, "m2")).toBe(doc);
  });
  it("déplacer un point : le joint suit (les deux murs)", () => {
    const doc = moveVertex(rectangle(), { x: 4200, y: 0 }, { x: 4500, y: -100 });
    expect(doc.murs.find((m) => m.id === "s")!.b).toEqual({ x: 4500, y: -100 });
    expect(doc.murs.find((m) => m.id === "e")!.a).toEqual({ x: 4500, y: -100 });
    expect(moveVertex(rectangle(), { x: 4200, y: 0 }, { x: 4200, y: 3195 })).toEqual(rectangle()); // mur nul refusé : tout ou rien
  });
  it("déplacer un mur : translation, murs voisins étirés", () => {
    const doc = moveWall(rectangle(), "e", { x: 300, y: 0 });
    expect(doc.murs.find((m) => m.id === "e")).toMatchObject({ a: { x: 4500, y: 0 }, b: { x: 4500, y: 3200 } });
    expect(wallLength(doc.murs.find((m) => m.id === "s")!)).toBe(4500);
    expect(wallLength(doc.murs.find((m) => m.id === "n")!)).toBe(4500);
  });
  it("modifier la longueur et l'angle (a fixe)", () => {
    const longer = setWallLength(rectangle(), "s", 5000);
    expect(longer.murs.find((m) => m.id === "s")!.b).toEqual({ x: 5000, y: 0 });
    expect(longer.murs.find((m) => m.id === "e")!.a).toEqual({ x: 5000, y: 0 });
    const turned = setWallAngle({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 1000, 0)] }, "m", 90);
    expect(turned.murs[0].b.x).toBeCloseTo(0); expect(turned.murs[0].b.y).toBeCloseTo(1000);
  });
  it("supprimer : murs, ouvertures, références de contour", () => {
    let doc = addOpening(rectangle(), "s", OPENING_PRESETS.porte, "o1");
    doc = { ...doc, contours: [{ pieceId: "p", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], murIds: ["s", "e"], graine: null }] };
    const next = deleteWalls(doc, ["s"]);
    expect(next.murs.map((m) => m.id)).toEqual(["e", "n", "w"]);
    expect(next.ouvertures).toEqual([]);
    expect(next.contours[0].murIds).toEqual(["e"]);
  });
  it("annuler / rétablir (historique partagé avec l'Atelier)", () => {
    let history = createHistory(rectangle(), "initial");
    history = pushHistory(history, moveWall(currentState(history), "e", { x: 100, y: 0 }), "Déplacement");
    history = pushHistory(history, deleteWalls(currentState(history), ["n"]), "Suppression");
    expect(currentState(undo(undo(history)))).toEqual(rectangle());
    expect(currentState(redo(undo(history))).murs).toHaveLength(3);
  });
  it("redresser : un mur à 3° devient horizontal, longueur conservée", () => {
    const doc = straightenWall({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 3000, 157)] }, "m");
    expect(doc.murs[0].b.y).toBeCloseTo(0, 0);
    expect(wallLength(doc.murs[0])).toBeCloseTo(Math.hypot(3000, 157), 0);
  });
  it("aligner : second mur rendu colinéaire au premier", () => {
    const doc = alignWalls({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("a", 0, 0, 2000, 0), mur("b", 3000, 40, 5000, -30)] }, ["a", "b"]);
    expect(doc.murs[1].a.y).toBeCloseTo(0); expect(doc.murs[1].b.y).toBeCloseTo(0);
  });
  it("fusionner deux murs alignés ; refus si non alignés ou disjoints", () => {
    const base: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: [mur("a", 0, 0, 2000, 0), mur("b", 2000, 0, 5000, 0)], ouvertures: [{ ...OPENING_PRESETS.porte, id: "o", murId: "b", decalageMm: 500, origineId: null } as never] };
    const merged = mergeWalls(base, "a", "b");
    expect(merged.error).toBeNull();
    expect(merged.document.murs).toEqual([{ ...base.murs[0], b: { x: 5000, y: 0 } }]);
    expect(merged.document.ouvertures[0]).toMatchObject({ murId: "a", decalageMm: 2500 });
    expect(mergeWalls({ ...base, murs: [mur("a", 0, 0, 2000, 0), mur("b", 2000, 0, 2000, 3000)] }, "a", "b").error).toMatch(/alignés/);
    expect(mergeWalls({ ...base, murs: [mur("a", 0, 0, 2000, 0), mur("b", 2500, 0, 4000, 0)] }, "a", "b").error).toMatch(/extrémité/);
  });
  it("scinder : deux murs, ouvertures réparties ; refus si une ouverture est à cheval", () => {
    const base = addOpening({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 4000, 0)] }, "m", { ...OPENING_PRESETS.fenetre, decalageMm: 2500 }, "f");
    const split = splitWall(base, "m", 2000, "m2");
    expect(split.document.murs.map((m) => [m.id, m.a.x, m.b.x])).toEqual([["m", 0, 2000], ["m2", 2000, 4000]]);
    expect(split.document.ouvertures[0]).toMatchObject({ murId: "m2", decalageMm: 500 });
    expect(splitWall(base, "m", 3000, "m3").error).toMatch(/cheval/);
  });
  it("ouvertures : porte / fenêtre / baie / ouverture libre, toujours contenues dans le mur", () => {
    let doc: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 3000, 0)] };
    for (const kind of ["porte", "fenetre", "baie", "ouverture_libre"] as const) doc = addOpening(doc, "m", OPENING_PRESETS[kind], id());
    expect(doc.ouvertures.map((o) => o.typeOuverture)).toEqual(["porte", "fenetre", "baie", "passage"]);
    doc = updateOpening(doc, doc.ouvertures[0].id, { decalageMm: 2900 });
    expect(doc.ouvertures[0].decalageMm + doc.ouvertures[0].largeurMm).toBeLessThanOrEqual(3000);
    const shorter = fitOpenings(setWallLength(doc, "m", 1000));
    expect(shorter.ouvertures.every((o) => o.decalageMm + o.largeurMm <= 1000)).toBe(true);
    expect(validatePlanDocument(shorter)).toEqual([]);
  });
  it("pièces : association à la pièce métier, recalage quand un mur bouge, contour ouvert signalé", () => {
    const assigned = assignRoom(rectangle(), { x: 2000, y: 1500 }, "piece-1");
    expect(assigned.error).toBeNull();
    expect(contourArea(assigned.document.contours[0])).toBeCloseTo(12_000_000);
    const moved = withRefreshedContours(moveWall(assigned.document, "e", { x: 1000, y: 0 }));
    expect(contourArea(moved.document.contours[0])).toBeCloseTo(5000 * 3000);
    const opened = refreshContours(deleteWalls(assigned.document, ["n"]));
    expect(opened.ouverts).toEqual(["piece-1"]);
    expect(assignRoom(rectangle(), { x: 9000, y: 9000 }, "p").error).toMatch(/Aucune pièce fermée/);
    expect(unassignRoom(assigned.document, "piece-1").contours).toEqual([]);
  });
  it("enregistrement par différence après édition : seules les modifications partent", () => {
    const before = rectangle();
    const after = moveWall(before, "e", { x: 100, y: 0 });
    const ops = diffPlan(before, after);
    expect(ops.murs.map((m) => m.id).sort()).toEqual(["e", "n", "s"]);
    expect(isPlanOperationsEmpty(diffPlan(after, after))).toBe(true);
  });
});

describe("rendu et unités", () => {
  it("formats terrain : m au cm, saisie en cm, angle en degrés", () => {
    expect(formatLongueurM(4205)).toBe("4,21 m");
    expect(formatLongueurCm(4205)).toBe("420,5");
    expect(parseLongueurCm("420,5")).toEqual({ ok: true, value: 4205 });
    expect(parseLongueurCm("abc").ok).toBe(false);
    expect(parseEpaisseurCm("250").ok).toBe(false);
    expect(parseAngleDegres("-90")).toEqual({ ok: true, value: 270 });
  });
  it("cote lisible à l'endroit, à côté du mur", () => {
    const label = wallDimension(mur("m", 3000, 0, 0, 0), 100);
    expect(label.text).toBe("3,00 m");
    expect(label.angleDegrees).toBeGreaterThan(-90); expect(label.angleDegrees).toBeLessThanOrEqual(90);
  });
  it("dimensions principales hors tout", () => {
    expect(overallDimensions(rectangle())).toMatchObject({ widthMm: 4400, heightMm: 3400 });
    expect(overallDimensions(EMPTY_PLAN_DOCUMENT)).toBeNull();
  });
  it("symboles d'ouverture : baie dans le mur, vantail + arc pour une porte", () => {
    const hote = mur("m", 0, 0, 3000, 0);
    const porte = { ...OPENING_PRESETS.porte, id: "o", murId: "m", decalageMm: 1000 } as never;
    expect(openingSegment(hote, porte)).toEqual({ start: { x: 1000, y: 0 }, end: { x: 1830, y: 0 } });
    const symbol = openingSymbol(hote, porte);
    expect(symbol.arc?.radius).toBe(830);
    expect(openingSymbol(hote, { ...OPENING_PRESETS.fenetre, id: "f", murId: "m", decalageMm: 0 } as never).lines).toHaveLength(3);
  });
  it("seuls les murs visibles sont dessinés", () => {
    expect(visibleWalls(rectangle().murs, { minX: -50, minY: 1000, maxX: 50, maxY: 2000 }).map((m) => m.id)).toEqual(["w"]);
  });
});

describe("compatibilité export SVG (DXF / PDF à venir)", () => {
  it("SVG en millimètres, calques nommés, Y retourné une seule fois", () => {
    const doc = { ...assignRoom(addOpening(rectangle(), "s", OPENING_PRESETS.porte, "o"), { x: 2000, y: 1500 }, "p").document };
    const svg = planToSvg(doc, { pieceName: () => "Séjour <1>" });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 5200 4200" width="5200mm"/);
    for (const layer of ["MURS", "OUVERTURES", "PIECES", "COTES"]) expect(svg).toContain(`<g id="${layer}"`);
    expect(svg).toContain('x1="0" y1="0" x2="4200" y2="0" stroke-width="200"');
    expect(svg).toContain("Séjour &lt;1&gt;");
    expect(svg.match(/scale\(1 -1\)/g)!.length).toBe(1 + 4 + 1); // groupe racine + 4 cotes + 1 nom de pièce
  });
});
