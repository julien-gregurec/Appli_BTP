import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_CADRE, EMPTY_PLAN_DOCUMENT, PLAN_EXPORT_LAYERS, defaultPlan, denormalizeOnPlan, diffPlan, freezeCreatesVersion,
  isPlanEditable, isPlanOperationsEmpty, murDonnees, murFromElement, murLineage, normalizeOnPlan, photoMarkersOnPlan,
  planCreationRule, planExportEntities, referencePlan, validatePlanDocument, validatePlanMur, validatePlanOuverture,
  type PlanDocument, type PlanMur, type PlanOuverture,
} from "./plan";
import { InMemoryPlanRepository, PlanRuleError } from "./plan-memory";
import { ReleveConflictError } from "./repository";
import type { ReleveElement } from "./model";

const mur = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<PlanMur> = {}): PlanMur => ({
  id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", ...extra,
});
const porte = (id: string, murId: string, decalageMm = 500, largeurMm = 900): PlanOuverture => ({
  id, murId, decalageMm, largeurMm, hauteurMm: 2040, allegeMm: null, typeOuverture: "porte", sens: "gauche",
});
const doc = (murs: readonly PlanMur[], ouvertures: readonly PlanOuverture[] = []): PlanDocument => ({ ...EMPTY_PLAN_DOCUMENT, murs, ouvertures });
const plan = (numero: number, etat: "initial" | "corrige" | "projete" | "as_built", fige = false, supprime = false) => ({
  id: `p${numero}`, numero, etatDocumente: etat, figeLe: fige ? "2026-09-27T10:00:00Z" : null, deletedAt: supprime ? "2026-09-27T11:00:00Z" : null,
});

describe("règles de création (miroir tools_releve_plan_creer)", () => {
  it("plan initial : unique et premier, sans base", () => {
    expect(planCreationRule([], "initial")).toEqual({ ok: true, numero: 1, baseId: null });
    expect(planCreationRule([plan(1, "initial")], "initial")).toMatchObject({ ok: false, code: "initial_not_first" });
    expect(planCreationRule([], "initial", "x")).toMatchObject({ ok: false, code: "initial_with_base" });
  });
  it("plan dérivé : exige le plan initial ; base par défaut = plan le plus récent", () => {
    expect(planCreationRule([], "corrige")).toMatchObject({ ok: false, code: "initial_missing" });
    expect(planCreationRule([plan(1, "initial", true), plan(2, "projete", true)], "corrige")).toEqual({ ok: true, numero: 3, baseId: "p2" });
    expect(planCreationRule([plan(1, "initial", true)], "corrige", "inconnu")).toMatchObject({ ok: false, code: "base_not_found" });
  });
  it("un seul plan MODIFIABLE par état : on corrige un plan figé en dérivant", () => {
    expect(planCreationRule([plan(1, "initial", true), plan(2, "corrige")], "corrige")).toMatchObject({ ok: false, code: "editable_exists" });
    expect(planCreationRule([plan(1, "initial", true), plan(2, "corrige", true)], "corrige")).toMatchObject({ ok: true, numero: 3 });
  });
  it("plan figé non modifiable ; plan par défaut = modifiable le plus récent", () => {
    expect(isPlanEditable(plan(1, "initial", true))).toBe(false);
    expect(isPlanEditable(plan(1, "initial"))).toBe(true);
    const plans = [plan(1, "initial", true), plan(2, "corrige"), plan(3, "projete", true)];
    expect(defaultPlan(plans)?.id).toBe("p2");
    expect(referencePlan(plans)?.id).toBe("p3");
    expect(referencePlan([plan(1, "initial", false, true)])).toBeNull();
  });
  it("gel : version du relevé créée seulement si la chaîne le permet", () => {
    expect(freezeCreatesVersion("initial", [])).toBe(true);
    expect(freezeCreatesVersion("initial", [{ typeVersion: "initial" }])).toBe(false);
    expect(freezeCreatesVersion("corrige", [])).toBe(false);
    expect(freezeCreatesVersion("as_built", [{ typeVersion: "initial" }])).toBe(true);
  });
});

describe("validation (miroir SQL)", () => {
  it("mur : longueur non nulle, épaisseur, hauteur, repère", () => {
    expect(validatePlanMur(mur("m", 0, 0, 1000, 0))).toEqual([]);
    expect(validatePlanMur(mur("m", 5, 5, 5, 5)).map((i) => i.path)).toContain("b");
    expect(validatePlanMur(mur("m", 0, 0, 1, 0, { epaisseurMm: 2500 })).map((i) => i.path)).toContain("epaisseurMm");
    expect(validatePlanMur(mur("m", 0, 0, 1, 0, { hauteurMm: 100 })).map((i) => i.path)).toContain("hauteurMm");
    expect(validatePlanMur(mur("m", 0, 0, 2_000_000, 0)).map((i) => i.path)).toContain("b");
  });
  it("ouverture : dans son mur (tolérance 1 mm)", () => {
    const hote = mur("m", 0, 0, 3000, 0);
    expect(validatePlanOuverture(porte("o", "m", 2100, 900), hote)).toEqual([]);
    expect(validatePlanOuverture(porte("o", "m", 2102, 900), hote).map((i) => i.path)).toContain("largeurMm");
    expect(validatePlanOuverture(porte("o", "m"), null).map((i) => i.path)).toEqual(["murId"]);
  });
  it("document : contour unique par pièce, contours fermés", () => {
    const contour = { pieceId: "p", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], murIds: [], graine: null };
    expect(validatePlanDocument({ ...doc([]), contours: [contour] })).toEqual([]);
    expect(validatePlanDocument({ ...doc([]), contours: [contour, contour] }).length).toBe(1);
    expect(validatePlanDocument({ ...doc([]), contours: [{ ...contour, points: contour.points.slice(0, 2) }] }).length).toBe(1);
  });
});

describe("enregistrement par différence", () => {
  const before = doc([mur("a", 0, 0, 1000, 0), mur("b", 1000, 0, 1000, 1000)], [porte("o", "a", 0, 800)]);
  it("rien n'a changé : lot vide", () => {
    const rebuilt = doc(before.murs.map((m) => ({ typeMur: m.typeMur, hauteurMm: m.hauteurMm, epaisseurMm: m.epaisseurMm, b: m.b, a: m.a, pieceId: m.pieceId, id: m.id })), before.ouvertures);
    expect(isPlanOperationsEmpty(diffPlan(before, rebuilt))).toBe(true);
  });
  it("mur modifié, mur ajouté, mur supprimé (ses ouvertures partent avec lui, côté serveur)", () => {
    const after = doc([mur("a", 0, 0, 1200, 0), mur("c", 0, 0, 0, 900)], []);
    const ops = diffPlan(before, after);
    expect(ops.murs.map((m) => m.id)).toEqual(["a", "c"]);
    expect(ops.supprimes).toEqual(["b", "o"]);
    const withoutHost = diffPlan(before, doc([mur("b", 1000, 0, 1000, 1000)]));
    expect(withoutHost.supprimes).toEqual(["a"]);
  });
  it("contours, cadre et réglages partent seulement s'ils changent (surface serveur ignorée)", () => {
    const contour = { pieceId: "p", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], murIds: ["a"], graine: null };
    const saved = { ...before, contours: [{ ...contour, surfaceMm2: 0.5 }] };
    expect(diffPlan(saved, { ...before, contours: [contour] }).contours).toBeUndefined();
    expect(diffPlan(saved, { ...before, contours: [] }).contours).toEqual([]);
    expect(diffPlan(before, { ...before, cadre: { ...DEFAULT_PLAN_CADRE, maxX: 30_000 } }).cadre?.maxX).toBe(30_000);
    expect(diffPlan(before, { ...before, reglages: { epaisseurMm: 100 } }).reglages).toEqual({ epaisseurMm: 100 });
  });
  it("charge donnees stable et compatible avec l'élément Relevé", () => {
    const m = mur("a", 1, 2, 3, 4, { origineId: "z" });
    expect(murDonnees(m)).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", origineId: "z" });
    expect(murFromElement({ id: "a" as never, pieceId: null, donnees: murDonnees(m) as never })).toEqual(m);
  });
});

describe("cadre et repères photo", () => {
  const cadre = { minX: -1000, minY: -1000, maxX: 9000, maxY: 7000 };
  it("normalisation aller-retour, origine en haut à gauche", () => {
    expect(normalizeOnPlan(cadre, { x: -1000, y: 7000 })).toEqual({ x: 0, y: 0 });
    expect(denormalizeOnPlan(cadre, { x: 0.5, y: 0.5 })).toEqual({ x: 4000, y: 3000 });
    const p = { x: 1234, y: 5678 };
    const back = denormalizeOnPlan(cadre, normalizeOnPlan(cadre, p));
    expect(back.x).toBeCloseTo(p.x); expect(back.y).toBeCloseTo(p.y);
  });
  it("repères : plan, point, mur (lignée des plans dérivés), pièce ; les autres sans position", () => {
    const anchor = (id: string, ancre: unknown): ReleveElement => ({ id, type: "photo_anchor", deletedAt: null, donnees: { mediaId: `media-${id}`, ancre, directionRad: null, legende: null } } as unknown as ReleveElement);
    const document: PlanDocument = {
      ...doc([mur("m2", 0, 0, 4000, 0, { origineId: "m1" })]), cadre,
      contours: [{ pieceId: "piece", points: [], murIds: [], graine: { x: 2000, y: 1500 } }],
    };
    const markers = photoMarkersOnPlan([
      anchor("1", { kind: "plan", etageId: "E", x: 0.5, y: 0.5 }),
      anchor("2", { kind: "point", etageId: "E", point: { x: 10, y: 20 } }),
      anchor("3", { kind: "entite", ref: { kind: "element", id: "m1" } }),
      anchor("4", { kind: "entite", ref: { kind: "piece", id: "piece" } }),
      anchor("5", { kind: "entite", ref: { kind: "etage", id: "E" } }),
      anchor("6", { kind: "plan", etageId: "AUTRE", x: 0.1, y: 0.1 }),
    ], document, "E");
    expect(markers.map((m) => `${m.anchorId}:${m.source}:${m.point.x},${m.point.y}`)).toEqual([
      "1:plan:4000,3000", "2:point:10,20", "3:mur:2000,0", "4:piece:2000,1500",
    ]);
    expect(murLineage([{ id: "m3", origineId: "m2" }, { id: "m2", origineId: "m1" }], "m3")).toEqual(["m3", "m2", "m1"]);
  });
});

describe("contrat d'export (PDF / DXF / SVG)", () => {
  it("entités neutres en mm, calques DXF valides", () => {
    const document: PlanDocument = { ...doc([mur("a", 0, 0, 3000, 0)], [porte("o", "a", 1000, 900)]), contours: [{ pieceId: "p", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], murIds: [], graine: { x: 0.5, y: 0.5 } }] };
    const entities = planExportEntities(document, { piece: () => "Séjour" });
    expect(entities.map((e) => `${e.layer}:${e.kind}`)).toEqual(["MURS:line", "COTES:text", "OUVERTURES:line", "PIECES:polygon", "PIECES:text"]);
    expect(entities[2]).toMatchObject({ a: { x: 1000, y: 0 }, b: { x: 1900, y: 0 }, widthMm: 200 });
    for (const layer of PLAN_EXPORT_LAYERS) expect(layer).toMatch(/^[A-Z_]+$/);
  });
});

describe("dépôt en mémoire (règles serveur)", () => {
  const setup = () => {
    let n = 0;
    const repo = new InMemoryPlanRepository({ entrepriseId: "t", releveId: "r", actorId: "u" }, () => "2026-09-27T10:00:00Z", () => `id-${++n}`);
    repo.piecesParEtage.set("E", new Set(["piece"]));
    return repo;
  };
  it("création, enregistrement, conflit, gel, dérivation", async () => {
    const repo = setup();
    const initial = await repo.createPlan("E", "initial");
    const ops = diffPlan(EMPTY_PLAN_DOCUMENT, doc([mur("a", 0, 0, 4000, 0), mur("b", 4000, 0, 4000, 3000)], [porte("o", "a")]));
    const saved = await repo.savePlan(initial.id, 1, { ...ops, contours: [{ pieceId: "piece", points: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], murIds: ["a", "b"], graine: null }] });
    expect(saved.revision).toBe(2);
    expect(saved.contours[0].surfaceMm2).toBe(12_000_000);
    await expect(repo.savePlan(initial.id, 1, ops)).rejects.toBeInstanceOf(ReleveConflictError);
    await expect(repo.savePlan(initial.id, 2, { murs: [], ouvertures: [], supprimes: [], contours: [{ pieceId: "autre", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], murIds: [], graine: null }] })).rejects.toBeInstanceOf(PlanRuleError);
    const figé = await repo.freezePlan(initial.id, 2, "Existant");
    expect(figé.versionId).not.toBeNull();
    await expect(repo.savePlan(initial.id, figé.revision, ops)).rejects.toThrow(/figé/);
    const corrige = await repo.createPlan("E", "corrige");
    const loaded = await repo.loadPlan(corrige.id);
    expect(loaded.document.murs).toHaveLength(2);
    expect(loaded.document.murs.every((m) => m.origineId === "a" || m.origineId === "b")).toBe(true);
    expect(loaded.document.ouvertures[0].murId).toBe(loaded.document.murs.find((m) => m.origineId === "a")!.id);
    expect(loaded.document.contours[0].murIds).toEqual(loaded.document.murs.map((m) => m.id));
    // Le plan figé n'a pas bougé.
    expect((await repo.loadPlan(initial.id)).document.murs.map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("lot atomique : une ouverture invalide n'écrit rien", async () => {
    const repo = setup();
    const p = await repo.createPlan("E", "initial");
    await expect(repo.savePlan(p.id, 1, diffPlan(EMPTY_PLAN_DOCUMENT, doc([mur("a", 0, 0, 1000, 0)], [porte("o", "a", 500, 900)])))).rejects.toThrow(/Ouverture invalide/);
    expect((await repo.loadPlan(p.id)).document.murs).toHaveLength(0);
    expect(repo.plans.get(p.id)!.revision).toBe(1);
  });
  it("suppression puis annulation (ré-envoi) : restauration", async () => {
    const repo = setup();
    const p = await repo.createPlan("E", "initial");
    const one = doc([mur("a", 0, 0, 1000, 0)], [porte("o", "a", 0, 500)]);
    await repo.savePlan(p.id, 1, diffPlan(EMPTY_PLAN_DOCUMENT, one));
    await repo.savePlan(p.id, 2, diffPlan(one, EMPTY_PLAN_DOCUMENT));
    expect((await repo.loadPlan(p.id)).document.ouvertures).toHaveLength(0);
    await repo.savePlan(p.id, 3, diffPlan(EMPTY_PLAN_DOCUMENT, one));
    const restored = await repo.loadPlan(p.id);
    expect([restored.document.murs.length, restored.document.ouvertures.length]).toEqual([1, 1]);
  });
});
