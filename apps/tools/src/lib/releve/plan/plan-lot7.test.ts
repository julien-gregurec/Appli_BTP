import { describe, expect, it } from "vitest";
import {
  EMPTY_PLAN_DOCUMENT, EQUIPEMENT_CATALOGUE, calquesEffectifs, catalogueEntry, diffPlan, newPlanEquipement, validatePlanDocument,
  type PlanDocument, type PlanEquipement, type PlanMur,
} from "@elsatia/releve-domain";
import { createHistory, currentState, pushHistory, redo, undo } from "@/lib/tracing/history";
import { assignRoom, deleteWalls, mergeWalls, moveWall, rotateWall, setWallLength, splitWall, withRefreshedContours } from "./editor";
import { planToDxf } from "./export-dxf";
import { planGeometryEntities } from "./export-entities";
import { planPrintLayout, planToPrintSvg, planToSvg } from "./export-svg";
import { resolveEquipmentSnap } from "./equipment-snap";
import { equipmentSymbol } from "./equipment-symbols";
import {
  addEquipment, assignEquipmentPiece, autoPieces, changeEquipmentKind, createEquipment, deleteEquipments, duplicateEquipments, footprint, groupIds,
  hitTestEquipment, moveEquipment, pieceAt, placementOnWall, resizeEquipment, restoreEquipments, rotateEquipment, setEquipmentsLocked,
  setEquipmentsVisible, syncEquipements, translateEquipments, turnEquipment, updateEquipment, worldToLocal,
} from "./equipments";
import { computeWallNetwork } from "./wall-geometry";

const mur = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<PlanMur> = {}): PlanMur => ({
  id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", ...extra,
});
/** Deux pièces : rectangle 6000 × 4000 (murs de 200, sens trigonométrique) + cloison x = 3000. */
const maison = (): PlanDocument => {
  let doc: PlanDocument = {
    ...EMPTY_PLAN_DOCUMENT,
    murs: [
      mur("s", 0, 0, 6000, 0), mur("e", 6000, 0, 6000, 4000), mur("n", 6000, 4000, 0, 4000), mur("w", 0, 4000, 0, 0),
      mur("c", 3000, 0, 3000, 4000, { epaisseurMm: 100, typeMur: "cloison" }),
    ],
  };
  doc = assignRoom(doc, { x: 1500, y: 2000 }, "sdb").document;
  doc = assignRoom(doc, { x: 4500, y: 2000 }, "bureau").document;
  return doc;
};
let seq = 0;
const nextId = () => `eq-${++seq}`;
const obj = (objet: string, x: number, y: number, extra: Partial<PlanEquipement> = {}) => newPlanEquipement(objet, nextId(), { x, y }, extra);
const find = (doc: PlanDocument, id: string) => doc.equipements.find((item) => item.id === id)!;
const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 0.6) => Math.hypot(a.x - b.x, a.y - b.y) <= eps;

describe("Lot 7 — objets : création, pièce, édition", () => {
  it("ajout : pièce déduite de la position (auto), changement de pièce à la main", () => {
    const wc = obj("wc", 1000, 1000);
    let doc = addEquipment(maison(), wc);
    expect(find(doc, wc.id).pieceId).toBe("sdb");
    doc = moveEquipment(doc, wc.id, { x: 4500, y: 1000 }).document;
    expect(find(doc, wc.id).pieceId).toBe("bureau");
    doc = assignEquipmentPiece(doc, wc.id, "sdb").document;
    expect(find(doc, wc.id)).toMatchObject({ pieceId: "sdb", pieceAuto: false });
    doc = moveEquipment(doc, wc.id, { x: 5000, y: 1000 }).document;
    expect(find(doc, wc.id).pieceId).toBe("sdb"); // choisie à la main : conservée
    doc = assignEquipmentPiece(doc, wc.id, null).document;
    expect(find(doc, wc.id)).toMatchObject({ pieceId: "bureau", pieceAuto: true });
    expect(pieceAt(doc.contours, { x: -500, y: 0 })).toBeNull();
  });

  it("déplacer, tourner, redimensionner (coin opposé fixe), dupliquer, masquer, verrouiller, supprimer, restaurer", () => {
    const table = obj("table", 4500, 2000);
    let doc = addEquipment(maison(), table);
    doc = turnEquipment(doc, [table.id], Math.PI / 2).document;
    expect(find(doc, table.id).rotationRad).toBeCloseTo(Math.PI / 2);
    const corner = footprint(find(doc, table.id))[0];
    doc = resizeEquipment(doc, table.id, 2000, 1000, { x: -1, y: -1 }).document;
    expect(find(doc, table.id)).toMatchObject({ largeurMm: 2000, profondeurMm: 1000 });
    expect(close(footprint(find(doc, table.id))[0], corner)).toBe(true);
    const dup = duplicateEquipments(doc, [table.id], nextId);
    doc = dup.document;
    expect(doc.equipements).toHaveLength(2);
    doc = setEquipmentsVisible(doc, [dup.ids[0]], false).document;
    expect(find(doc, dup.ids[0]).visible).toBe(false);
    doc = setEquipmentsLocked(doc, [table.id], true).document;
    expect(moveEquipment(doc, table.id, { x: 0, y: 0 }).error).toMatch(/verrouillé/);
    expect(updateEquipment(doc, table.id, { libelle: "X" }).error).toMatch(/verrouillé/);
    const del = deleteEquipments(doc, [table.id, dup.ids[0]]);
    expect(del.skipped).toBe(1);
    expect(del.removed.map((item) => item.id)).toEqual([dup.ids[0]]);
    doc = restoreEquipments(del.document, del.removed);
    expect(doc.equipements.map((item) => item.id).sort()).toEqual([table.id, dup.ids[0]].sort());
    doc = updateEquipment(doc, table.id, { verrouille: false }).document;
    expect(find(doc, table.id).verrouille).toBe(false);
    doc = changeEquipmentKind(doc, table.id, "bureau").document;
    expect(find(doc, table.id)).toMatchObject({ objet: "bureau", categorie: "mobilier", libelle: "Bureau" });
    expect(resizeEquipment(doc, table.id, 0, 100).error).not.toBeNull();
  });

  it("désignation : objet sous le doigt, le plus petit d'abord", () => {
    const table = obj("table", 4500, 2000);
    const chaise = obj("chaise", 4500, 2000);
    const doc = addEquipment(addEquipment(maison(), table), chaise);
    expect(hitTestEquipment(doc.equipements, { x: 4500, y: 2000 }, 10)?.id).toBe(chaise.id);
    expect(hitTestEquipment(doc.equipements, { x: 5200, y: 2000 }, 10)?.id).toBe(table.id);
    expect(hitTestEquipment(doc.equipements, { x: 100, y: 100 }, 10)).toBeNull();
  });

  it("tout supprimer / masquer un groupe, avec restauration", () => {
    let doc = maison();
    for (const [objet, x] of [["wc", 800], ["lavabo", 1600], ["douche", 2400], ["bureau", 4500]] as const) doc = addEquipment(doc, obj(objet, x, 1000));
    const sanitaire = groupIds(doc, "sanitaire");
    expect(sanitaire).toHaveLength(3);
    const hidden = setEquipmentsVisible(doc, sanitaire, false).document;
    expect(hidden.equipements.filter((item) => !item.visible)).toHaveLength(3);
    const removed = deleteEquipments(doc, sanitaire);
    expect(removed.document.equipements.map((item) => item.objet)).toEqual(["bureau"]);
    expect(diffPlan(doc, removed.document).supprimes.sort()).toEqual([...sanitaire].sort());
    const restored = restoreEquipments(removed.document, removed.removed);
    expect(restored.equipements).toHaveLength(4);
    expect(diffPlan(removed.document, restored).equipements?.map((item) => item.id).sort()).toEqual([...sanitaire].sort());
  });
});

describe("Lot 7 — objets liés au mur", () => {
  const linked = (doc: PlanDocument, objet: string, murId: string, decalageMm: number, face: "gauche" | "droite" = "gauche") => {
    const host = doc.murs.find((item) => item.id === murId)!;
    const placed = placementOnWall(host, face, decalageMm, catalogueEntry(objet).profondeurMm);
    const created = createEquipment(objet, nextId(), { ...placed, link: { murId, face, decalageMm } });
    return { doc: addEquipment(doc, created), id: created.id };
  };

  it("posé contre la face (dos au mur, tourné vers la pièce) ; suit le mur déplacé, pivoté, raccourci", () => {
    const start = linked(maison(), "radiateur", "s", 1500);
    let doc = start.doc;
    // Mur sud (0,0)→(6000,0), face gauche = intérieur : dos à y = 100, centre à 100 + 50.
    expect(find(doc, start.id).position).toEqual({ x: 1500, y: 150 });
    expect(find(doc, start.id).rotationRad).toBeCloseTo(0);
    doc = moveWall(doc, "s", { x: 0, y: 300 });
    expect(find(doc, start.id).position).toEqual({ x: 1500, y: 450 });
    doc = rotateWall(doc, "s", 5);
    expect(find(doc, start.id).rotationRad).toBeCloseTo((5 * Math.PI) / 180, 3);
    const short = linked(maison(), "prise", "w", 3500);
    doc = setWallLength(short.doc, "w", 3000);
    expect(find(doc, short.id).decalageMm).toBeLessThanOrEqual(3000);
  });

  it("mur supprimé : l'objet est libéré et reste en place ; mur scindé / fusionné : liaison reportée", () => {
    const start = linked(maison(), "meuble_haut", "n", 1000);
    const before = find(start.doc, start.id).position;
    const deleted = deleteWalls(start.doc, ["n"]);
    expect(find(deleted, start.id)).toMatchObject({ murId: null, position: before });
    const split = splitWall(start.doc, "n", 500, "n2");
    expect(find(split.document, start.id)).toMatchObject({ murId: "n2", decalageMm: 500 });
    expect(close(find(split.document, start.id).position, before)).toBe(true);
    const merged = mergeWalls(split.document, "n", "n2");
    expect(merged.error).toBeNull();
    expect(find(merged.document, start.id).murId).toBe("n");
    expect(close(find(merged.document, start.id).position, before)).toBe(true);
  });

  it("déplacement libre : la liaison est retirée ; validation « mur absent »", () => {
    const start = linked(maison(), "interrupteur", "e", 800);
    const moved = moveEquipment(start.doc, start.id, { x: 4000, y: 2000 });
    expect(find(moved.document, start.id).murId).toBeNull();
    const broken = { ...start.doc, equipements: start.doc.equipements.map((item) => ({ ...item, murId: "fantome" })) };
    expect(validatePlanDocument(broken).some((issue) => issue.equipmentCode === "mur_absent")).toBe(true);
    // Synchronisation : un lien vers un mur disparu est retiré.
    expect(syncEquipements(broken).equipements[0].murId).toBeNull();
  });
});

describe("Lot 7 — accrochage", () => {
  const doc = maison();
  const network = computeWallNetwork(doc.murs);
  const context = (extra = {}) => ({ murs: doc.murs, network, others: [] as PlanEquipement[], toleranceWorld: 80, ...extra });

  it("face de mur : dos contre la face, orientation vers la pièce, liaison pour un objet mural", () => {
    const snap = resolveEquipmentSnap({ centre: { x: 1500, y: 180 }, rotationRad: 1, largeurMm: 1000, profondeurMm: 100, mural: true }, context());
    expect(snap.kind).toBe("face");
    expect(snap.position.y).toBeCloseTo(150);
    expect(snap.rotationRad).toBeCloseTo(0);
    expect(snap.link).toMatchObject({ murId: "s", face: "gauche" });
    const north = resolveEquipmentSnap({ centre: { x: 1500, y: 3700 }, rotationRad: 0, largeurMm: 600, profondeurMm: 600, mural: false }, context());
    expect(north.kind).toBe("face");
    expect(north.position.y).toBeCloseTo(3900 - 300);
    expect(Math.abs(north.rotationRad)).toBeCloseTo(Math.PI);
    expect(north.link).toBeNull();
  });

  it("coin : objet dans l'angle de la pièce", () => {
    const snap = resolveEquipmentSnap({ centre: { x: 420, y: 420 }, rotationRad: 0, largeurMm: 600, profondeurMm: 600, mural: false }, context());
    expect(snap.kind).toBe("coin");
    const box = footprint({ position: snap.position, rotationRad: snap.rotationRad, largeurMm: 600, profondeurMm: 600 });
    expect(Math.min(...box.map((p) => p.x))).toBeCloseTo(100);
    expect(Math.min(...box.map((p) => p.y))).toBeCloseTo(100);
  });

  it("objet contre objet, alignement d'axe, grille, libre, désactivé", () => {
    const table = obj("table", 4500, 2000);
    const others = [table];
    const side = resolveEquipmentSnap({ centre: { x: 4500 + 800 + 225 + 40, y: 2000 }, rotationRad: 0, largeurMm: 450, profondeurMm: 500, mural: false }, context({ others }));
    expect(side.kind).toBe("objet");
    expect(side.position.x).toBeCloseTo(4500 + 800 + 225);
    const axis = resolveEquipmentSnap({ centre: { x: 4530, y: 1000 }, rotationRad: 0, largeurMm: 300, profondeurMm: 300, mural: false }, context({ others }));
    expect(axis.kind).toBe("axe");
    expect(axis.position.x).toBe(4500);
    const grid = resolveEquipmentSnap({ centre: { x: 4213, y: 1287 }, rotationRad: 0, largeurMm: 100, profondeurMm: 100, mural: false }, context({ gridMm: 100 }));
    expect(grid).toMatchObject({ kind: "grille", position: { x: 4200, y: 1300 } });
    const free = resolveEquipmentSnap({ centre: { x: 4213, y: 1287 }, rotationRad: 0.3, largeurMm: 100, profondeurMm: 100, mural: false }, context());
    expect(free).toMatchObject({ kind: "libre", position: { x: 4213, y: 1287 }, rotationRad: 0.3 });
    const off = resolveEquipmentSnap({ centre: { x: 1500, y: 180 }, rotationRad: 1, largeurMm: 1000, profondeurMm: 100, mural: true }, context({ enabled: false }));
    expect(off.kind).toBe("libre");
  });
});

describe("Lot 7 — symboles, export, calques", () => {
  it("chaque objet du catalogue a un symbole dans son emprise", () => {
    for (const entry of EQUIPEMENT_CATALOGUE) {
      const objet = newPlanEquipement(entry.objet, entry.objet, { x: 1000, y: 1000 }, { rotationRad: 0.7 });
      const symbol = equipmentSymbol(objet);
      expect(symbol.outline).toHaveLength(4);
      const inside = (p: { x: number; y: number }) => { const l = worldToLocal(objet, p); return Math.abs(l.x) <= objet.largeurMm / 2 + 1 && Math.abs(l.y) <= objet.profondeurMm / 2 + 1; };
      for (const line of symbol.lines) expect(inside(line.a) && inside(line.b)).toBe(true);
      for (const polygon of symbol.polygons) expect(polygon.every(inside)).toBe(true);
      for (const circle of symbol.circles) expect(inside(circle.centre)).toBe(true);
    }
  });

  it("SVG et DXF conservent les objets (calques, cercles natifs) ; objets et calques masqués exclus ; PDF préparé", () => {
    let doc = maison();
    doc = addEquipment(doc, obj("wc", 800, 800));
    doc = addEquipment(doc, obj("plaque", 4500, 600));
    doc = addEquipment(doc, obj("lit", 4500, 2500));
    doc = addEquipment(doc, obj("radiateur", 2000, 150, { visible: false }));
    const entities = planGeometryEntities(doc);
    expect(new Set(entities.filter((e) => ["MOBILIER", "SANITAIRE", "CUISINE", "TECHNIQUE"].includes(e.layer)).map((e) => e.layer))).toEqual(new Set(["SANITAIRE", "CUISINE", "MOBILIER"]));
    const svg = planToSvg(doc);
    expect(svg).toContain('<g id="SANITAIRE"');
    expect((svg.match(/<circle /g) ?? []).length).toBe(4); // 4 feux de plaque
    const dxf = planToDxf(doc);
    expect(dxf).toContain("\nMOBILIER\n");
    expect((dxf.match(/\nCIRCLE\n/g) ?? []).length).toBe(4);
    const hiddenLayer = planGeometryEntities(doc, { calques: calquesEffectifs({ cuisine: { visible: false } }) });
    expect(hiddenLayer.some((e) => e.layer === "CUISINE")).toBe(false);
    expect(planPrintLayout(doc, "A3").scale).toBe(20);
    expect(planPrintLayout(doc, "A4").scale).toBe(50);
    const print = planToPrintSvg(doc, { paper: "A4", title: "RDC" });
    expect(print).toContain('width="297mm"');
    expect(print).toContain("échelle 1:50");
  });
});

describe("Lot 7 — annuler / rétablir et versioning client", () => {
  it("toutes les opérations sont réversibles (document identique après annulation complète)", () => {
    const base = maison();
    let history = createHistory(base, "départ", 100);
    const table = obj("table", 4500, 2000);
    const steps: [PlanDocument, string][] = [];
    let doc = addEquipment(base, table); steps.push([doc, "ajout"]);
    doc = moveEquipment(doc, table.id, { x: 4000, y: 1500 }).document; steps.push([doc, "déplacement"]);
    doc = rotateEquipment(doc, [table.id], 0.5).document; steps.push([doc, "rotation"]);
    doc = resizeEquipment(doc, table.id, 1800, 900).document; steps.push([doc, "redimension"]);
    const dup = duplicateEquipments(doc, [table.id], nextId); doc = dup.document; steps.push([doc, "duplication"]);
    doc = setEquipmentsVisible(doc, dup.ids, false).document; steps.push([doc, "masquer"]);
    doc = setEquipmentsLocked(doc, [table.id], true).document; steps.push([doc, "verrouiller"]);
    doc = deleteEquipments(doc, dup.ids).document; steps.push([doc, "supprimer"]);
    for (const [state, label] of steps) history = pushHistory(history, state, label);
    const end = currentState(history);
    for (let i = 0; i < steps.length; i++) history = undo(history);
    expect(currentState(history)).toBe(base);
    for (let i = 0; i < steps.length; i++) history = redo(history);
    expect(currentState(history)).toBe(end);
    expect(diffPlan(base, end).equipements).toHaveLength(1);
  });

  it("recalage des contours : pièce auto recalculée après un changement de murs", () => {
    let doc = addEquipment(maison(), obj("bureau", 3200, 2000));
    expect(find(doc, doc.equipements[0].id).pieceId).toBe("bureau");
    doc = moveWall(doc, "c", { x: 500, y: 0 });
    doc = autoPieces(withRefreshedContours(doc).document);
    expect(find(doc, doc.equipements[0].id).pieceId).toBe("sdb");
  });
});

describe("Lot 7 — performance (moteur seul)", () => {
  it.each([50, 250, 500, 1000])("%i objets : synchronisation, accrochage, symboles, export sous budget", (count) => {
    const murs: PlanMur[] = [];
    for (let i = 0; i <= 10; i++) { murs.push(mur(`h${i}`, 0, i * 3000, 30000, i * 3000)); murs.push(mur(`v${i}`, i * 3000, 0, i * 3000, 30000)); }
    let doc: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs };
    const kinds = EQUIPEMENT_CATALOGUE.map((item) => item.objet);
    const equipements = Array.from({ length: count }, (_, i) => newPlanEquipement(kinds[i % kinds.length], `p${i}`, { x: 400 + (i * 733) % 29000, y: 400 + ((i * 1237) % 29000) }));
    doc = { ...doc, equipements };
    const network = computeWallNetwork(doc.murs);
    let t = performance.now();
    syncEquipements(doc);
    for (let i = 0; i < 60; i++) resolveEquipmentSnap({ centre: { x: 100 * i, y: 150 }, rotationRad: 0, largeurMm: 600, profondeurMm: 600, mural: true }, { murs: doc.murs, network, others: equipements, toleranceWorld: 80 });
    const interaction = performance.now() - t;
    t = performance.now();
    for (const objet of equipements) equipmentSymbol(objet);
    planToSvg(doc, { network });
    const render = performance.now() - t;
    expect(interaction).toBeLessThan(400);
    expect(render).toBeLessThan(1500);
  });
});
