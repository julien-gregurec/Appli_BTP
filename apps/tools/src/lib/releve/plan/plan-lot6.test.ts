import { describe, expect, it } from "vitest";
import { EMPTY_PLAN_DOCUMENT, validatePlanDocument, type PlanDocument, type PlanMur, type PlanOuverture } from "@elsatia/releve-domain";
import { polygonArea } from "@/lib/geometry/engine/area";
import { createHistory, currentState, pushHistory, redo, undo } from "@/lib/tracing/history";
import {
  cleanupJunctions, deleteOpening, moveVertex, moveWall, rotateWall, setWallAngle, setWallLength, splitWallAtJunctions, withRefreshedContours,
  assignRoom,
} from "./editor";
import { planToDxf } from "./export-dxf";
import { planGeometryEntities } from "./export-entities";
import { planToSvg } from "./export-svg";
import { detectRooms, pointAlongWall } from "./geometry";
import {
  changeOpeningKind, moveOpening, OPENING_KIND_PRESETS, OPENING_KINDS, openingKindOf, patchChecked, placeOpening, placeOpeningAtPoint, resizeOpening,
  snapOpeningPosition,
} from "./openings";
import { openingSymbol } from "./render";
import { resolvePlanSnap } from "./snap";
import { computeWallNetwork, freeSpans, junctionSummary, openingIssues, wallFeatures, wallParts } from "./wall-geometry";

const mur = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<PlanMur> = {}): PlanMur => ({
  id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", ...extra,
});
/** Rectangle d'axes 6000 × 4000 (murs de 200) + cloison intérieure en T (x = 3000, 100 mm). */
const maison = (): PlanDocument => ({
  ...EMPTY_PLAN_DOCUMENT,
  murs: [
    mur("s", 0, 0, 6000, 0), mur("e", 6000, 0, 6000, 4000), mur("n", 6000, 4000, 0, 4000), mur("w", 0, 4000, 0, 0),
    mur("c", 3000, 0, 3000, 4000, { epaisseurMm: 100, typeMur: "cloison" }),
  ],
});
let seq = 0;
const nextId = () => `o-${++seq}`;
const place = (doc: PlanDocument, murId: string, kind: keyof typeof OPENING_KIND_PRESETS, centre: number | null = null) => {
  const result = placeOpening(doc, computeWallNetwork(doc.murs), murId, centre, OPENING_KIND_PRESETS[kind], nextId());
  if (result.error) throw new Error(result.error);
  return { doc: result.document, id: result.id! };
};
const opening = (doc: PlanDocument, id: string) => doc.ouvertures.find((o) => o.id === id)!;
const worldStart = (doc: PlanDocument, id: string) => { const o = opening(doc, id); return pointAlongWall(doc.murs.find((m) => m.id === o.murId)!, o.decalageMm); };

describe("Lot 6 — jonctions et épaisseur", () => {
  it("rectangle + cloison : 4 L, 2 T ; solides raccordés sans chevauchement", () => {
    const doc = maison();
    const network = computeWallNetwork(doc.murs);
    expect(junctionSummary(network)).toMatchObject({ L: 4, T: 2, X: 0 });
    const s = network.walls.get("s")!;
    expect([s.startJoin, s.endJoin]).toEqual(["onglet", "onglet"]);
    expect(network.walls.get("c")!.startJoin).toBe("about");
    expect(s.obstructions).toEqual([{ from: 2950, to: 3050, murId: "c", kind: "T" }]);
    // La cloison s'arrête sur la face intérieure des murs sud et nord.
    const c = network.walls.get("c")!;
    expect(c.faces.left.start.y).toBeCloseTo(100); expect(c.faces.left.end.y).toBeCloseTo(3900);
    // Aire totale = somme des aires, emprise exacte (aucun chevauchement : L en onglet, T en about).
    const murs = new Map(doc.murs.map((m) => [m.id, m]));
    const total = doc.murs.flatMap((m) => wallParts(network, murs, m, [])).reduce((sum, part) => sum + polygonArea({ points: part }), 0);
    expect(total).toBeCloseTo(6200 * 4200 - 5800 * 3800 + 100 * 3800, 3);
  });

  it("faces intérieure / extérieure : la face gauche (référence) d'un mur tracé en sens trigonométrique est intérieure", () => {
    const network = computeWallNetwork(maison().murs);
    const s = network.walls.get("s")!;
    expect(s.faces.left.start.y).toBeCloseTo(100);
    expect(s.faces.right.start.y).toBeCloseTo(-100);
    expect(s.faces.right.start.x).toBeCloseTo(-100);
  });

  it("X : croisement de deux murs (intérieurs), aucune pièce perdue", () => {
    const doc: PlanDocument = { ...maison(), murs: [...maison().murs, mur("x", 0, 2000, 6000, 2000, { epaisseurMm: 100 })] };
    const summary = junctionSummary(computeWallNetwork(doc.murs));
    expect(summary.X).toBe(1);
    expect(detectRooms(doc.murs)).toHaveLength(4);
    // Refend qui croise la cloison sans fermer de pièce : il ne change ni les pièces ni leur surface
    // (sommet colinéaire sur la cloison compris).
    const refend = { ...maison(), murs: [...maison().murs, mur("r", 2000, 2000, 4000, 2000, { epaisseurMm: 100 })] };
    expect(junctionSummary(computeWallNetwork(refend.murs)).X).toBe(1);
    expect(detectRooms(refend.murs).map((room) => Math.round(room.areaMm2))).toEqual([2850 * 3800, 2850 * 3800]);
  });
});

describe("Lot 6 — ouvertures graphiques", () => {
  it("pose au point touché : projection sur l'axe, centrée, dans la partie libre", () => {
    const doc = maison();
    const result = placeOpeningAtPoint(doc, computeWallNetwork(doc.murs), "s", { x: 1500, y: 40 }, OPENING_KIND_PRESETS.porte, "p");
    expect(result.error).toBeNull();
    expect(opening(result.document, "p")).toMatchObject({ murId: "s", decalageMm: 1085, largeurMm: 830, vantaux: 1, poussee: "tirant", modele: "battant" });
    // Tout contre l'angle : ramenée hors de l'onglet (100 mm).
    const corner = placeOpeningAtPoint(doc, computeWallNetwork(doc.murs), "s", { x: 50, y: 0 }, OPENING_KIND_PRESETS.porte, "q");
    expect(opening(corner.document, "q").decalageMm).toBe(100);
    // Sur la jonction en T : décalée à côté de la cloison.
    const onT = placeOpeningAtPoint(doc, computeWallNetwork(doc.murs), "s", { x: 3000, y: 0 }, OPENING_KIND_PRESETS.porte, "t");
    const t = opening(onT.document, "t");
    expect(t.decalageMm + t.largeurMm <= 2950 || t.decalageMm >= 3050).toBe(true);
    expect(openingIssues(onT.document)).toEqual([]);
  });

  it("toutes les menuiseries de la palette ; attributs enregistrés et relus", () => {
    let doc: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 20_000, 0)] };
    for (const kind of OPENING_KINDS) doc = place(doc, "m", kind).doc;
    expect(doc.ouvertures.map(openingKindOf)).toEqual([...OPENING_KINDS]);
    expect(validatePlanDocument(doc)).toEqual([]);
    expect(openingIssues(doc)).toEqual([]);
  });

  it("validations : hors mur, plus large que le mur, chevauchement, jonction, largeur nulle, hauteur incohérente", () => {
    const base = maison();
    const network = computeWallNetwork(base.murs);
    const { doc, id } = place(base, "s", "porte", 1500);
    const other = place(doc, "s", "fenetre", 4500);
    expect(placeOpening(base, network, "c", null, { ...OPENING_KIND_PRESETS.baie, largeurMm: 5000 }, "x").error).toMatch(/plus large que son mur/);
    expect(placeOpening(base, network, "s", null, { ...OPENING_KIND_PRESETS.porte, largeurMm: 0 }, "x").error).toMatch(/Largeur nulle/);
    expect(placeOpening(base, network, "s", null, { ...OPENING_KIND_PRESETS.porte, hauteurMm: 2400, allegeMm: 300 }, "x").error).toMatch(/Hauteur incohérente/);
    expect(patchChecked(other.doc, network, id, { decalageMm: 4000 }).error).toMatch(/chevauchent|jonction/);
    expect(patchChecked(other.doc, network, other.id, { decalageMm: 1500 }).error).toMatch(/chevauchent/);
    expect(patchChecked(doc, network, id, { decalageMm: 2500 }).error).toMatch(/jonction/);
    expect(patchChecked(doc, network, id, { decalageMm: 20 }).error).toMatch(/jonction/);
    expect(patchChecked(doc, network, id, { largeurMm: 0 }).error).toMatch(/Largeur/);
    expect(patchChecked(doc, network, id, { hauteurMm: 2600 }).error).toMatch(/Hauteur incohérente/);
    expect(patchChecked(doc, network, id, { decalageMm: 6000 }).error).toMatch(/sort de son mur|dépasse/);
    // Une modification valide passe ; le document d'origine n'est jamais modifié.
    expect(patchChecked(doc, network, id, { decalageMm: 1200, sens: "droite", poussee: "poussant" }).error).toBeNull();
    expect(opening(doc, id).decalageMm).toBe(1085);
  });

  it("glisser le long du mur : borné par les jonctions et les autres ouvertures, jamais de saut", () => {
    const first = place(maison(), "s", "porte", 1500);
    const second = place(first.doc, "s", "fenetre", 4500);
    const network = computeWallNetwork(second.doc.murs);
    // Vers la droite : arrêtée par la cloison (T à 2950).
    expect(opening(moveOpening(second.doc, network, first.id, 2600).document, first.id).decalageMm).toBe(2950 - 830);
    // Vers la gauche : arrêtée par l'onglet.
    expect(opening(moveOpening(second.doc, network, first.id, -500).document, first.id).decalageMm).toBe(100);
    // Redimensionner : bord B jusqu'à la cloison au plus, largeur minimale 10 cm.
    const wider = resizeOpening(second.doc, network, first.id, "end", 5000);
    expect(opening(wider.document, first.id)).toMatchObject({ decalageMm: 1085, largeurMm: 2950 - 1085 });
    expect(opening(resizeOpening(second.doc, network, first.id, "start", 5000).document, first.id).largeurMm).toBe(100);
    expect(openingIssues(wider.document)).toEqual([]);
  });

  it("accrochage de position : centre du mur, tableaux voisins, limites de jonction, pas de 1 cm", () => {
    const { doc } = place(maison(), "s", "porte", 1500);
    const network = computeWallNetwork(doc.murs);
    const s = doc.murs[0];
    expect(snapOpeningPosition(doc, network, s, null, 2585, 30, "centre", 830)).toMatchObject({ kind: "centre", valueMm: 2585 });
    expect(snapOpeningPosition(doc, network, s, null, 1925, 30, "centre", 400)).toMatchObject({ kind: "tableau", valueMm: 1915 });
    expect(snapOpeningPosition(doc, network, s, null, 3060, 30, "bord")).toMatchObject({ kind: "jonction", valueMm: 3050 });
    expect(snapOpeningPosition(doc, network, s, null, 4444, 5, "bord")).toMatchObject({ kind: "pas", valueMm: 4440 });
  });

  it("changement de menuiserie : porte → double → coulissante → châssis fixe (dimensions conservées)", () => {
    const { doc, id } = place(maison(), "s", "porte", 1500);
    const network = computeWallNetwork(doc.murs);
    const double = changeOpeningKind(doc, network, id, "porte_double").document;
    expect(opening(double, id)).toMatchObject({ vantaux: 2, largeurMm: 830 });
    const sliding = changeOpeningKind(double, network, id, "porte_coulissante").document;
    expect(opening(sliding, id)).toMatchObject({ sens: "coulissant", modele: "coulissant" });
    const fixe = changeOpeningKind(sliding, network, id, "chassis_fixe");
    expect(fixe.error).toMatch(/Hauteur incohérente/); // allège 90 + 204 cm > 250 cm
  });
});

describe("Lot 6 — une ouverture reste attachée à son mur", () => {
  it("mur déplacé : l'ouverture suit (même position relative), sans état intermédiaire écrasé", () => {
    const { doc, id } = place({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 4000, 0)] }, "m", "porte", 2000);
    const moved = moveWall(doc, "m", { x: 3500, y: 1000 }); // Lot 5 : l'état intermédiaire (mur de 500) écrasait la porte
    expect(opening(moved, id)).toMatchObject({ decalageMm: opening(doc, id).decalageMm, largeurMm: 830 });
    expect(worldStart(moved, id)).toEqual({ x: worldStart(doc, id).x + 3500, y: 1000 });
  });

  it("mur allongé ou raccourci par B : distance à A conservée ; par A : l'ouverture reste en place", () => {
    const { doc, id } = place({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 4000, 0)] }, "m", "porte", 2000);
    const before = worldStart(doc, id);
    expect(worldStart(setWallLength(doc, "m", 6000), id)).toEqual(before);
    expect(worldStart(moveVertex(doc, { x: 0, y: 0 }, { x: -1000, y: 0 }), id)).toEqual(before);
    expect(worldStart(moveVertex(doc, { x: 0, y: 0 }, { x: 1000, y: 0 }), id)).toEqual(before);
    // Raccourci au point de toucher l'ouverture : elle glisse dans le mur, largeur conservée.
    const short = setWallLength(doc, "m", 2400);
    expect(opening(short, id)).toMatchObject({ largeurMm: 830, decalageMm: 2400 - 830 });
    // Plus court que l'ouverture : refusé.
    expect(setWallLength(doc, "m", 800)).toBe(doc);
  });

  it("mur pivoté : l'ouverture pivote avec lui", () => {
    const { doc, id } = place({ ...EMPTY_PLAN_DOCUMENT, murs: [mur("m", 0, 0, 4000, 0)] }, "m", "porte", 2000);
    const turned = setWallAngle(doc, "m", 90);
    const start = worldStart(turned, id);
    expect(start.x).toBeCloseTo(0); expect(start.y).toBeCloseTo(opening(doc, id).decalageMm);
    const spun = rotateWall(doc, "m", 180);
    expect(opening(spun, id).decalageMm).toBe(opening(doc, id).decalageMm);
    expect(spun.murs[0].a).toEqual({ x: 4000, y: 0 });
  });

  it("jonction en T : la cloison suit le mur qu'elle aboute", () => {
    const moved = moveWall(maison(), "n", { x: 0, y: 500 });
    expect(moved.murs.find((m) => m.id === "c")!.b).toEqual({ x: 3000, y: 4500 });
    const stretched = setWallLength(maison(), "s", 8000);
    expect(stretched.murs.find((m) => m.id === "c")!.a).toEqual({ x: 3000, y: 0 });
  });

  it("déplacer un mur sur une ouverture voisine (jonction) : signalé, pas corrompu", () => {
    const { doc, id } = place(maison(), "s", "porte", 1500);
    const moved = moveWall(doc, "c", { x: -1200, y: 0 }); // la cloison arrive sur la porte
    expect(openingIssues(moved).map((issue) => [issue.ouvertureId, issue.code])).toEqual([[id, "jonction"]]);
    expect(validatePlanDocument(moved)).toEqual([]);
  });
});

describe("Lot 6 — scission, nettoyage des jonctions, annuler / rétablir", () => {
  it("scinder aux jonctions : un mur par travée, ouvertures réparties", () => {
    const { doc, id } = place(maison(), "s", "fenetre", 4500);
    const result = splitWallAtJunctions(doc, computeWallNetwork(doc.murs), "s", nextId);
    expect(result.error).toBeNull();
    const parts = result.document.murs.filter((m) => m.a.y === 0 && m.b.y === 0);
    expect(parts.map((m) => [m.a.x, m.b.x]).sort((x, y) => x[0] - y[0])).toEqual([[0, 3000], [3000, 6000]]);
    const moved = opening(result.document, id);
    expect(moved.murId).not.toBe("s");
    expect(openingIssues(result.document)).toEqual([]);
    expect(junctionSummary(computeWallNetwork(result.document.murs)).T).toBe(2);
    expect(detectRooms(result.document.murs)).toHaveLength(2);
  });

  it("nettoyer les jonctions : extrémités presque confondues, about approximatif, dépassement", () => {
    const messy: PlanDocument = {
      ...EMPTY_PLAN_DOCUMENT,
      murs: [
        mur("s", 0, 0, 6000, 0), mur("e", 6012, 8, 6000, 4000), mur("n", 6000, 4000, 0, 4000), mur("w", 0, 4000, -9, 14),
        mur("c", 3000, 25, 3000, 3000, { epaisseurMm: 100 }), mur("d", 1500, 4080, 1500, 2500, { epaisseurMm: 100 }),
      ],
    };
    const { document, report } = cleanupJunctions(messy);
    expect(report).toEqual({ fusionnes: 2, raccordes: 1, recoupes: 1 });
    const summary = junctionSummary(computeWallNetwork(document.murs));
    expect(summary).toMatchObject({ L: 4, T: 2 });
    expect(document.murs.find((m) => m.id === "d")!.a).toEqual({ x: 1500, y: 4000 });
    expect(cleanupJunctions(document).report).toEqual({ fusionnes: 0, raccordes: 0, recoupes: 0 });
  });

  it("annuler / rétablir : ajout, déplacement, redimensionnement, suppression d'ouverture, scission, nettoyage", () => {
    let history = createHistory(maison(), "départ", 100);
    const push = (next: PlanDocument, label: string) => { history = pushHistory(history, next, label); };
    const added = place(currentState(history), "s", "porte", 1500); push(added.doc, "ajout");
    const network = () => computeWallNetwork(currentState(history).murs);
    push(moveOpening(currentState(history), network(), added.id, 400).document, "déplacement");
    push(resizeOpening(currentState(history), network(), added.id, "end", 1600).document, "resize");
    push(splitWallAtJunctions(currentState(history), network(), "s", nextId).document, "scission");
    push(cleanupJunctions(currentState(history)).document, "nettoyage");
    push(deleteOpening(currentState(history), added.id), "suppression");
    expect(currentState(history).ouvertures).toHaveLength(0);
    for (let i = 0; i < 6; i++) history = undo(history);
    expect(currentState(history)).toEqual(maison());
    for (let i = 0; i < 3; i++) history = redo(history);
    expect(opening(currentState(history), added.id)).toMatchObject({ decalageMm: 400, largeurMm: 1200 });
  });
});

describe("Lot 6 — pièces malgré les ouvertures, surface", () => {
  it("les pièces restent détectées et associées ; la surface ne dépend pas des ouvertures", () => {
    let doc = maison();
    for (const [wall, kind, centre] of [["s", "porte", 1500], ["n", "fenetre", 1500], ["c", "porte", 2000], ["e", "baie", 2000]] as const) doc = place(doc, wall, kind, centre).doc;
    expect(openingIssues(doc)).toEqual([]);
    expect(detectRooms(doc.murs)).toHaveLength(2);
    const assigned = assignRoom(doc, { x: 1500, y: 2000 }, "sejour").document;
    expect(assigned.contours[0].points.length).toBe(4);
    const refreshed = withRefreshedContours(moveWall(assigned, "c", { x: 500, y: 0 }));
    expect(refreshed.ouverts).toEqual([]);
  });
});

describe("Lot 6 — accrochage bâtiment", () => {
  it("coins de jonction, faces, tableaux d'ouverture", () => {
    const { doc } = place(maison(), "s", "porte", 1500);
    const network = computeWallNetwork(doc.murs);
    const features = wallFeatures(doc, network);
    const options = { toleranceWorld: 30, features };
    expect(resolvePlanSnap({ x: -90, y: -110 }, doc.murs, options)).toMatchObject({ kind: "coin", point: { x: -100, y: -100 } });
    expect(resolvePlanSnap({ x: 4000, y: 110 }, doc.murs, options)).toMatchObject({ kind: "face" });
    expect(resolvePlanSnap({ x: 1087, y: 95 }, doc.murs, options)).toMatchObject({ kind: "ouverture", point: { x: 1085, y: 100 } });
    // Sans la géométrie du Lot 6 : comportement du Lot 5 inchangé.
    expect(resolvePlanSnap({ x: -90, y: -110 }, doc.murs, { toleranceWorld: 30 }).kind).not.toBe("coin");
  });
});

describe("Lot 6 — export SVG / DXF", () => {
  const complet = () => {
    let doc = maison();
    for (const [wall, kind, centre] of [["s", "porte", 1500], ["n", "fenetre", 1500], ["e", "baie", 2000], ["c", "ouverture_libre", 2000], ["w", "porte_double", 2000]] as const) doc = place(doc, wall, kind, centre).doc;
    return assignRoom(doc, { x: 1500, y: 2000 }, "sejour").document;
  };
  it("entités neutres : murs en polygones découpés, ouvertures en traits et arcs", () => {
    const entities = planGeometryEntities(complet());
    const murs = entities.filter((e) => e.layer === "MURS");
    expect(murs.every((e) => e.kind === "polygon")).toBe(true);
    expect(murs.length).toBe(5 + 5); // 5 murs, 5 ouvertures (chacune coupe son mur en deux)
    expect(entities.filter((e) => e.kind === "arc").length).toBe(1 + 2 + 2); // porte, fenêtre 2 vantaux, porte double
  });
  it("SVG : épaisseur réelle, portes, fenêtres, baies", () => {
    const svg = planToSvg(complet(), { pieceName: () => "Séjour" });
    expect(svg).toContain('<g id="MURS"');
    expect(svg.match(/<polygon/g)!.length).toBeGreaterThanOrEqual(10);
    expect(svg).toContain('stroke="#2563eb"'); // vitrages
    expect(svg).toContain('stroke-dasharray="60 40"'); // linteau du passage, rail
    expect(svg.match(/ A\d/g)!.length).toBe(5);
  });
  it("DXF R12 : sections, calques, entités, unités mm", () => {
    const dxf = planToDxf(complet());
    const lines = dxf.split("\n");
    expect(lines[0]).toBe("0"); expect(lines[1]).toBe("SECTION");
    expect(dxf).toContain("$INSUNITS\n70\n4\n");
    for (const layer of ["MURS", "OUVERTURES", "PIECES", "COTES", "PHOTOS"]) expect(dxf).toContain(`LAYER\n2\n${layer}\n`);
    expect(dxf.match(/\nARC\n/g)!.length).toBe(5);
    expect(dxf.match(/\nPOLYLINE\n/g)!.length).toBe(10 + 1);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    // Paires code / valeur : nombre de lignes pair.
    expect(lines.filter((line, i) => i < lines.length - 1).length % 2).toBe(0);
  });
  it("symboles : poussée et paumelles changent de côté", () => {
    const host = mur("m", 0, 0, 3000, 0);
    const base: PlanOuverture = { ...OPENING_KIND_PRESETS.porte, id: "p", murId: "m", decalageMm: 1000 } as PlanOuverture;
    const tirant = openingSymbol(host, base).lines[0];
    const poussant = openingSymbol(host, { ...base, poussee: "poussant" }).lines[0];
    expect(tirant.b.y).toBeGreaterThan(0); expect(poussant.b.y).toBeLessThan(0);
    expect(openingSymbol(host, { ...base, sens: "droite" }).lines[0].a.x).toBeCloseTo(1830);
    expect(openingSymbol(host, { ...base, vantaux: 2 }).arcs).toHaveLength(2);
    expect(openingSymbol(host, { ...base, modele: "coulissant", sens: "coulissant" }).arcs).toHaveLength(0);
  });
});

describe("Lot 6 — propriétés et performance", () => {
  function prng(seed: number) { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; }; }

  it("poses et glissements aléatoires : jamais d'ouverture invalide acceptée", () => {
    const random = prng(2026);
    for (let run = 0; run < 30; run++) {
      let doc = maison();
      for (let k = 0; k < 12; k++) {
        const target = doc.murs[Math.floor(random() * doc.murs.length)];
        const kind = OPENING_KINDS[Math.floor(random() * OPENING_KINDS.length)];
        const result = placeOpening(doc, computeWallNetwork(doc.murs), target.id, random() * 6000, OPENING_KIND_PRESETS[kind], nextId());
        if (!result.error) doc = result.document;
        if (doc.ouvertures.length) {
          const o = doc.ouvertures[Math.floor(random() * doc.ouvertures.length)];
          const moved = random() < 0.5 ? moveOpening(doc, computeWallNetwork(doc.murs), o.id, random() * 6000 - 500)
            : resizeOpening(doc, computeWallNetwork(doc.murs), o.id, random() < 0.5 ? "start" : "end", random() * 6000);
          if (!moved.error) doc = moved.document;
        }
        expect(openingIssues(doc)).toEqual([]);
        expect(validatePlanDocument(doc)).toEqual([]);
      }
    }
  });

  it("espaces libres : jamais sur une jonction ni une autre ouverture", () => {
    const { doc } = place(maison(), "s", "porte", 1500);
    const network = computeWallNetwork(doc.murs);
    expect(freeSpans(network, doc, doc.murs[0])).toEqual([{ from: 100, to: 1085 }, { from: 1915, to: 2950 }, { from: 3050, to: 5900 }]);
  });

  for (const [walls, openings] of [[100, 50], [250, 150], [500, 300]] as const) {
    it(`${walls} murs + ${openings} ouvertures : réseau, découpe, validations`, () => {
      const murs: PlanMur[] = [];
      const side = Math.ceil(Math.sqrt(walls / 2));
      for (let i = 0; murs.length < walls; i++) {
        const x = (i % side) * 3000; const y = Math.floor(i / side) * 3000;
        murs.push(mur(`h${i}`, x, y, x + 3000, y));
        if (murs.length < walls) murs.push(mur(`v${i}`, x, y, x, y + 3000, { epaisseurMm: 100 }));
      }
      let doc: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs };
      const ouvertures: PlanOuverture[] = [];
      for (let k = 0; k < openings; k++) ouvertures.push({ ...OPENING_KIND_PRESETS.porte, id: `o${k}`, murId: murs[k].id, decalageMm: 1085 } as PlanOuverture);
      doc = { ...doc, ouvertures };
      const t0 = performance.now();
      const network = computeWallNetwork(doc.murs);
      const t1 = performance.now();
      const byId = new Map(doc.murs.map((m) => [m.id, m]));
      const parts = doc.murs.reduce((count, m) => count + wallParts(network, byId, m, doc.ouvertures).length, 0);
      const t2 = performance.now();
      const issues = openingIssues(doc, network);
      const t3 = performance.now();
      expect(parts).toBeGreaterThanOrEqual(walls);
      expect(issues).toEqual([]);
      // Budgets généreux (machine de CI) ; les mesures réelles sont dans le rapport.
      expect(t1 - t0).toBeLessThan(150);
      expect(t2 - t1).toBeLessThan(150);
      expect(t3 - t2).toBeLessThan(150);
    });
  }
});
