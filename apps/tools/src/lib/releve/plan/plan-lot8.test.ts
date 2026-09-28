import { describe, expect, it } from "vitest";
import {
  EMPTY_PLAN_DOCUMENT, buildMetreGpPayload, buildMetreTree, computePlanMetre, diffPlan, metreToCsv, newPlanCote,
  type MetreStructure, type PlanDocument, type PlanMur, type PlanOuverture, type PlanRevetement,
} from "@elsatia/releve-domain";
import { createHistory, currentState, pushHistory, redo, undo } from "@/lib/tracing/history";
import {
  addCote, deleteCote, dimensionGeometry, facingWallDistances, hitTestCote, implantationDimensions, manualDimension, openingDimension, roomExtents,
  roomInteriorDimensions, updateCote, wallChainDimensions, wallFaceDimensions,
} from "./dimensions";
import { planGeometryEntities } from "./export-entities";
import { contourFromRoom, detectRooms } from "./geometry";
import { createEquipment } from "./equipments";
import { computeWallNetwork } from "./wall-geometry";

const mur = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<PlanMur> = {}): PlanMur => ({
  id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", ...extra,
});
const ouv = (id: string, murId: string, typeOuverture: PlanOuverture["typeOuverture"], decalageMm: number, largeurMm: number, hauteurMm: number, allegeMm: number | null): PlanOuverture =>
  ({ id, murId, typeOuverture, decalageMm, largeurMm, hauteurMm, allegeMm, sens: "gauche" });

/** Maison 6 × 4 m à l'axe, cloison de 10 cm en x = 3 000 : deux pièces, contours produits par l'ÉDITEUR (Engine B). */
function maison(): PlanDocument {
  const murs = [
    mur("s", 0, 0, 6000, 0), mur("e", 6000, 0, 6000, 4000), mur("n", 6000, 4000, 0, 4000), mur("w", 0, 4000, 0, 0),
    mur("c", 3000, 0, 3000, 4000, { epaisseurMm: 100, typeMur: "cloison" }),
  ];
  const rooms = detectRooms(murs);
  const contours = rooms.map((room) => contourFromRoom(room.seed.x < 3000 ? "gauche" : "droite", room));
  return {
    ...EMPTY_PLAN_DOCUMENT, murs, contours,
    ouvertures: [ouv("porte-ext", "s", "porte", 1000, 900, 2150, 0), ouv("porte-int", "c", "porte", 1500, 800, 2040, 0), ouv("fen", "n", "fenetre", 1000, 1200, 1250, 900)],
  };
}

describe("Lot 8 — cotes automatiques", () => {
  const doc = maison();
  const gauche = doc.contours.find((contour) => contour.pieceId === "gauche")!;

  it("cotes intérieures : une par arête, valeurs au nu des murs, posées DANS la pièce", () => {
    const dims = roomInteriorDimensions(gauche, 200);
    expect(dims.map((dim) => dim.valueMm).sort((a, b) => a - b)).toEqual([2850, 2850, 3800, 3800]);
    // Décalage vers l'intérieur : le milieu de la ligne de cote est dans le contour.
    for (const dim of dims) {
      const { mid } = dimensionGeometry(dim);
      expect(mid.x).toBeGreaterThan(100); expect(mid.x).toBeLessThan(2950); expect(mid.y).toBeGreaterThan(100); expect(mid.y).toBeLessThan(3900);
    }
  });

  it("largeur, longueur, diagonale de pièce (orientation de l'arête la plus longue)", () => {
    const extents = roomExtents(gauche)!;
    expect([extents.longueurMm, extents.largeurMm]).toEqual([3800, 2850]);
    expect(extents.diagonaleMm).toBe(Math.round(Math.hypot(3800, 2850) * 10) / 10);
    expect(extents.dimensions.map((dim) => dim.kind)).toEqual(["longueur", "largeur", "diagonale"]);
  });

  it("cotes partielles et cumulées le long d'un mur (tableaux des ouvertures)", () => {
    const dims = wallChainDimensions(doc.murs[0], doc.ouvertures, 100);
    expect(dims.filter((dim) => dim.kind === "partielle").map((dim) => dim.valueMm)).toEqual([1000, 900, 4100]);
    expect(dims.filter((dim) => dim.kind === "cumulee").map((dim) => dim.valueMm)).toEqual([1000, 1900]);
  });

  it("cotes des faces raccordées : extérieure (la plus longue) et intérieure", () => {
    const dims = wallFaceDimensions(doc.murs[0], computeWallNetwork(doc.murs), 300);
    const ext = dims.find((dim) => dim.kind === "exterieure")!; const int = dims.find((dim) => dim.kind === "interieure")!;
    expect(ext.valueMm).toBe(6200);
    expect(int.valueMm).toBeLessThan(6200);
  });

  it("cote d'ouverture « largeur × hauteur », distance entre murs parallèles, implantation d'un objet", () => {
    expect(openingDimension(doc.murs[0], doc.ouvertures[0], 100).text).toBe("90,0 cm × 215,0 cm");
    const facing = facingWallDistances(doc.murs[3], doc.murs);
    expect(facing.map((dim) => dim.valueMm)).toEqual([2850]);
    const bureau = createEquipment("bureau", "b1", { position: { x: 1000, y: 800 }, rotationRad: 0, link: null });
    const imp = implantationDimensions(bureau, doc.murs);
    // Bureau 140 × 70 centré en (1 000, 800) : 45 cm du mur sud (face à y = 100), 20 cm du mur ouest (face à x = 100).
    expect(imp.map((dim) => dim.valueMm).sort((a, b) => a - b)).toEqual([200, 350]);
  });
});

describe("Lot 8 — cotes manuelles dans l'éditeur", () => {
  it("pose, valeur relevée (écart signalé), décalage, suppression, annuler / rétablir", () => {
    let history = createHistory<PlanDocument>(maison(), "Plan", 100);
    const cote = newPlanCote("c1", { x: 100, y: 100 }, { x: 2950, y: 100 }, { priseLe: "2026-09-28T10:00:00Z" });
    history = pushHistory(history, addCote(currentState(history), cote), "Cote");
    expect(manualDimension(currentState(history).cotes![0])!.text).toBe("285,0 cm");
    history = pushHistory(history, updateCote(currentState(history), "c1", { source: "laser", valeurMm: 2845 }), "Valeur relevée");
    const releve = manualDimension(currentState(history).cotes![0])!;
    expect([releve.text, releve.ecartMm]).toEqual(["284,5 cm (plan 285,0 cm)", -5]);
    // Une cote calculée ne peut pas porter une valeur figée : elle suit la longueur.
    const forced = updateCote(currentState(history), "c1", { source: "calcule", valeurMm: 1 });
    expect(forced.cotes![0].valeurMm).toBe(2850);
    expect(hitTestCote(currentState(history).cotes!, { x: 1500, y: 100 + 300 }, 20)?.id).toBe("c1");
    history = pushHistory(history, deleteCote(currentState(history), "c1"), "Suppression");
    expect(currentState(history).cotes).toEqual([]);
    history = undo(undo(history));
    expect(currentState(history).cotes![0].source).toBe("calcule");
    history = redo(history);
    expect(currentState(history).cotes![0].valeurMm).toBe(2845);
    const ops = diffPlan(maison(), currentState(history), { etageId: "e1" });
    expect(ops.cotes).toHaveLength(1);
    expect(ops.cotes![0].donnees).toMatchObject({ source: "laser", valeur: 2845, cible: { kind: "etage", id: "e1" } });
  });

  it("export : cotes manuelles sur le calque COTES (ligne, attaches, valeur), hauteur ponctuelle en texte", () => {
    const doc = { ...maison(), cotes: [newPlanCote("c1", { x: 100, y: 100 }, { x: 2950, y: 100 }), newPlanCote("h1", { x: 1500, y: 2000 }, null, { valeurMm: 2480, typeCote: "hauteur", source: "manuel" })] };
    const cotes = planGeometryEntities(doc).filter((entity) => entity.ref === "c1" || entity.ref === "h1");
    expect(cotes.map((entity) => entity.kind)).toEqual(["line", "line", "line", "text", "text"]);
    expect(cotes.every((entity) => entity.layer === "COTES")).toBe(true);
  });
});

describe("Lot 8 — métré sur la géométrie produite par l'éditeur", () => {
  it("contours de l'éditeur : chaque arête retrouve son mur ; cloison partagée déduite des deux côtés", () => {
    const doc = maison();
    const metre = computePlanMetre({
      planId: "p", etageId: "e", etat: "initial", numero: 1, document: doc, revetements: [],
      pieces: [{ id: "gauche", hauteurSousPlafondMm: 2500 }, { id: "droite", hauteurSousPlafondMm: null }], etageHauteurMm: null,
    });
    const gauche = metre.pieces.find((p) => p.pieceId === "gauche")!; const droite = metre.pieces.find((p) => p.pieceId === "droite")!;
    expect(gauche.faces.every((face) => face.murId !== null)).toBe(true);
    expect(droite.faces.every((face) => face.murId !== null)).toBe(true);
    expect(gauche.surfaceSolBruteMm2).toBe(2850 * 3800);
    expect(gauche.perimetreBrutMm).toBe(2 * (2850 + 3800));
    // Porte extérieure (sud) + porte de la cloison : franchissables → périmètre utile.
    expect(gauche.perimetreUtileMm).toBe(2 * (2850 + 3800) - 900 - 800);
    expect(gauche.ouvertures.map((o) => o.id)).toEqual(["porte-ext", "porte-int"]);
    expect(droite.ouvertures.map((o) => o.id)).toEqual(["fen", "porte-int"]);
    // Pièce droite sans hauteur : volume non calculable, jamais la hauteur des murs (2,50 m).
    expect([droite.volumeMm3, droite.surfaceMursNetteMm2]).toEqual([null, null]);
  });
});

/** Grille de N pièces 3 × 3 m (murs de 20 cm), une porte et une fenêtre par pièce, deux revêtements par pièce. */
function grille(count: number) {
  const cols = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count / cols); const step = 3000;
  const murs: PlanMur[] = [];
  for (let r = 0; r <= rows; r++) murs.push(mur(`h${r}`, 0, r * step, cols * step, r * step));
  for (let c = 0; c <= cols; c++) murs.push(mur(`v${c}`, c * step, 0, c * step, rows * step));
  // Murs découpés à chaque croisement (pièces fermées par des murs en L / T / X).
  const split: PlanMur[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) split.push(mur(`h${r}-${c}`, c * step, r * step, (c + 1) * step, r * step));
  for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) split.push(mur(`v${c}-${r}`, c * step, r * step, c * step, (r + 1) * step));
  const rooms = detectRooms(split).slice(0, count);
  const contours = rooms.map((room, i) => contourFromRoom(`p${i}`, room));
  const ouvertures: PlanOuverture[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    ouvertures.push(ouv(`po${r}-${c}`, `h${r}-${c}`, "porte", 1000, 900, 2100, 0));
    ouvertures.push(ouv(`fe${r}-${c}`, `v${c}-${r}`, "fenetre", 900, 1200, 1000, 1000));
  }
  const revetements: PlanRevetement[] = contours.flatMap((contour) => [
    { id: `rs-${contour.pieceId}`, pieceId: contour.pieceId, support: "sol" as const, famille: "carrelage", libelle: "Carrelage", pertePourcent: 10, application: { mode: "tous" as const }, sensPose: null, format: null, commentaire: null },
    { id: `rm-${contour.pieceId}`, pieceId: contour.pieceId, support: "mur" as const, famille: "peinture", libelle: "Peinture", pertePourcent: 5, application: { mode: "tous" as const }, sensPose: null, format: null, commentaire: null },
  ]);
  const document: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: split, ouvertures, contours };
  return { document, revetements, pieces: contours.map((contour) => ({ id: contour.pieceId, hauteurSousPlafondMm: 2500 })) };
}

describe("Lot 8 — performance du métré (moteur seul)", () => {
  it.each([50, 200, 500])("%i pièces : calcul, recalcul après édition, synthèse, exports sous budget", (count) => {
    const { document, revetements, pieces } = grille(count);
    expect(document.contours).toHaveLength(count);
    const input = { planId: "p", etageId: "e", etat: "initial" as const, numero: 1, document, revetements, pieces, etageHauteurMm: null };
    let t = performance.now();
    const metre = computePlanMetre(input);
    const calcul = performance.now() - t;
    expect(metre.pieces).toHaveLength(count);
    expect(metre.pieces.every((piece) => piece.faces.every((face) => face.murId !== null))).toBe(true);
    // Édition : une fenêtre élargie → recalcul complet.
    t = performance.now();
    const edited = computePlanMetre({ ...input, document: { ...document, ouvertures: document.ouvertures.map((o, i) => (i === 1 ? { ...o, largeurMm: 1400 } : o)) } });
    const recalcul = performance.now() - t;
    expect(edited.pieces.map((p) => p.surfaceMursNetteMm2)).not.toEqual(metre.pieces.map((p) => p.surfaceMursNetteMm2));
    const structure: MetreStructure = {
      chantiers: [{ id: "c", nom: "C", ordre: 0, deletedAt: null }], batiments: [{ id: "b", chantierId: "c", nom: "B", ordre: 0, deletedAt: null }],
      etages: [{ id: "e", batimentId: "b", nom: "RDC", niveau: 0, ordre: 0, deletedAt: null }], zones: [],
      pieces: pieces.map((piece, i) => ({ id: piece.id, etageId: "e", zoneId: null, nom: `Pièce ${i}`, ordre: i, deletedAt: null })),
    };
    t = performance.now();
    const sources = [{ etageId: "e", planId: "p", numero: 1, etat: "initial" as const, figeLe: null, metre }];
    const tree = buildMetreTree(structure, sources, { id: "r", nom: "R" });
    const csv = metreToCsv(tree);
    const gp = buildMetreGpPayload(tree, sources, "existant");
    const exports = performance.now() - t;
    expect(tree.totaux.pieces).toBe(count);
    expect(csv.split("\r\n").length).toBeGreaterThan(count * 10);
    expect(gp.pieces).toHaveLength(count);
    expect(calcul).toBeLessThan(1500);
    expect(recalcul).toBeLessThan(1500);
    expect(exports).toBeLessThan(1500);
  });
});
