import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CALQUE_DES_CATEGORIES, EQUIPEMENT_OBJETS, EQUIPMENT_ISSUE_CODES, EQUIPMENT_ISSUE_MESSAGES, PLAN_CALQUES,
  calquesEffectifs, catalogueEntry, countByCategorie, equipementAnomalie, equipementDonnees, equipementFromElement, equipementsDeLaPiece,
  newPlanEquipement, normalizeRotation, type PlanEquipement,
} from "./equipement";
import { EQUIPEMENT_CATEGORIES, EQUIPEMENT_CATEGORIES_LOT2, EQUIPEMENT_ETATS_PROJET } from "./model";
import {
  EMPTY_PLAN_DOCUMENT, PLAN_EXPORT_LAYERS, diffPlan, equipementFootprint, isPlanOperationsEmpty, planExportEntities, validatePlanDocument, validatePlanSave,
  type PlanDocument, type PlanMur,
} from "./plan";
import { InMemoryPlanRepository, PlanRuleError } from "./plan-memory";

const lot7 = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260928000701_tools_releve_metre_equipements_calques_v1.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ").replace(/, /g, ",").replace(/\( /g, "(").replace(/ \)/g, ")");
const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");

const mur = (id: string, ax: number, ay: number, bx: number, by: number): PlanMur => ({ id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" });
const obj = (id: string, objet: string, x = 500, y = 500, extra: Partial<PlanEquipement> = {}) => newPlanEquipement(objet, id, { x, y }, extra);
const doc = (patch: Partial<PlanDocument>): PlanDocument => ({ ...EMPTY_PLAN_DOCUMENT, ...patch });

describe("Lot 7 — parité domaine ↔ migration 1101", () => {
  it("catégories : sur-ensemble ordonné du Lot 2, identiques au SQL (contrat générique ET contrôle d'objet)", () => {
    expect(EQUIPEMENT_CATEGORIES.slice(0, EQUIPEMENT_CATEGORIES_LOT2.length)).toEqual([...EQUIPEMENT_CATEGORIES_LOT2]);
    for (const categorie of ["sanitaire", "cuisine", "electricite", "cvc", "plomberie", "securite", "rangement", "technique", "mobilier", "autre"]) {
      expect(EQUIPEMENT_CATEGORIES).toContain(categorie);
    }
    expect(lot7.split(quoted(EQUIPEMENT_CATEGORIES)).length - 1).toBe(2);
  });

  it("catalogue d'objets identique au SQL", () => {
    expect(lot7).toContain(`not in (${quoted(EQUIPEMENT_OBJETS)})`);
    expect(new Set(EQUIPEMENT_OBJETS).size).toBe(EQUIPEMENT_OBJETS.length);
  });

  it("objets minimum du cahier des charges présents dans la bonne catégorie", () => {
    const attendus: Record<string, string[]> = {
      mobilier: ["bureau", "chaise", "table", "armoire", "etagere", "lit", "canape", "meuble"],
      sanitaire: ["wc", "lavabo", "douche", "baignoire", "urinoir"],
      cuisine: ["evier", "meuble_bas", "meuble_haut", "plan_travail", "refrigerateur", "four", "plaque"],
    };
    for (const [categorie, objets] of Object.entries(attendus)) for (const objet of objets) expect(catalogueEntry(objet).categorie).toBe(categorie);
    // Technique (calque) : radiateur, climatiseur, VMC, tableau, prise, interrupteur.
    for (const objet of ["radiateur", "climatiseur", "vmc", "tableau_electrique", "prise", "interrupteur"]) {
      expect(CALQUE_DES_CATEGORIES[catalogueEntry(objet).categorie]).toBe("technique");
    }
    for (const objet of ["radiateur", "meuble_haut", "prise", "interrupteur"]) expect(catalogueEntry(objet).mural).toBe(true);
  });

  it("états projetés et messages identiques au SQL", () => {
    expect(lot7).toContain(`not in (${quoted(EQUIPEMENT_ETATS_PROJET)})`);
    for (const code of EQUIPMENT_ISSUE_CODES) {
      if (code === "invalide") { expect(lot7).toContain(`else '${EQUIPMENT_ISSUE_MESSAGES.invalide.replace(/'/g, "''")}'`); continue; }
      expect(lot7).toContain(`when '${code}' then '${EQUIPMENT_ISSUE_MESSAGES[code].replace(/'/g, "''")}'`);
    }
  });

  it("bornes identiques au SQL", () => {
    expect(lot7).toContain("> 50000");
    expect(lot7).toContain("> 6.2832");
    expect(lot7).toContain("char_length(p_donnees->>'libelle') > 200");
    expect(lot7).toContain("char_length(p_donnees->>'commentaire') > 2000");
  });
});

describe("Lot 7 — objet de plan", () => {
  it("objet du catalogue : dimensions, niveau, attributs par défaut ; aller-retour élément sans perte", () => {
    const radiateur = obj("r", "radiateur");
    expect(radiateur).toMatchObject({ categorie: "cvc", largeurMm: 1000, profondeurMm: 100, niveauMm: 150, visible: true, verrouille: false, pieceAuto: true });
    const complet = { ...radiateur, commentaire: "Fonte", murId: "m", face: "gauche" as const, decalageMm: 1500, etatProjet: "deplace" as const, origineId: "o" };
    const back = equipementFromElement({ id: "r" as never, pieceId: null, donnees: equipementDonnees(complet) as never });
    expect(back).toEqual({ ...complet });
    expect(equipementAnomalie(complet)).toBeNull();
  });

  it("équipement du Lot 2 (sans objet ni dimensions) relu avec des valeurs par défaut", () => {
    const legacy = equipementFromElement({ id: "l" as never, pieceId: null, donnees: { categorie: "eclairage", libelle: "Spot", position: { x: 1, y: 2 }, rotationRad: 0, largeurMm: null, profondeurMm: null, hauteurMm: null } });
    expect(legacy).toMatchObject({ objet: "objet", largeurMm: 600, profondeurMm: 600, visible: true, verrouille: false });
  });

  it.each([
    ["categorie", { categorie: "jardin" }], ["objet", { objet: "arbre" }], ["libelle", { libelle: " " }], ["position", { position: { x: 2e6, y: 0 } }],
    ["dimensions", { largeurMm: 0 }], ["dimensions", { hauteurMm: -1 }], ["rotation", { rotationRad: 9 }], ["niveau", { niveauMm: -5 }],
    ["commentaire", { commentaire: "x".repeat(2001) }], ["etat_projet", { etatProjet: "futur" }], ["invalide", { face: "haut" }],
  ] as const)("anomalie %s", (code, patch) => {
    expect(equipementAnomalie({ ...obj("x", "wc"), ...(patch as object) } as PlanEquipement)).toBe(code);
  });

  it("rotation normalisée dans ]−π, π]", () => {
    expect(normalizeRotation(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeRotation(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it("emprise : rectangle orienté centré sur la position", () => {
    const points = equipementFootprint({ position: { x: 1000, y: 1000 }, rotationRad: Math.PI / 2, largeurMm: 200, profondeurMm: 100 });
    expect(points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[1050, 900], [1050, 1100], [950, 1100], [950, 900]]);
  });

  it("calques : 9 calques, défaut visible et déverrouillé, mémorisés partiellement", () => {
    expect(PLAN_CALQUES).toEqual(["structure", "ouvertures", "mobilier", "sanitaire", "cuisine", "technique", "photos", "annotations", "cotations"]);
    const calques = calquesEffectifs({ mobilier: { visible: false }, structure: { verrouille: true } });
    expect(calques.mobilier).toEqual({ visible: false, verrouille: false });
    expect(calques.structure).toEqual({ visible: true, verrouille: true });
    expect(calques.cotations).toEqual({ visible: true, verrouille: false });
  });
});

describe("Lot 7 — document, différence, validation", () => {
  const base = doc({ murs: [mur("m1", 0, 0, 4000, 0)], equipements: [obj("a", "wc"), obj("b", "radiateur", 2000, 150, { murId: "m1", face: "gauche", decalageMm: 2000 })] });

  it("diff : création, modification, suppression, restauration", () => {
    const created = diffPlan(EMPTY_PLAN_DOCUMENT, base);
    expect(created.equipements?.map((item) => item.id)).toEqual(["a", "b"]);
    const moved = doc({ ...base, equipements: [{ ...base.equipements[0], position: { x: 900, y: 500 } }, base.equipements[1]] });
    const ops = diffPlan(base, moved);
    expect(ops.equipements?.map((item) => item.id)).toEqual(["a"]);
    expect(ops.supprimes).toEqual([]);
    const removed = diffPlan(base, doc({ ...base, equipements: [base.equipements[1]] }));
    expect(removed.supprimes).toEqual(["a"]);
    expect(isPlanOperationsEmpty(diffPlan(base, base))).toBe(true);
    // Restauration : l'objet réapparaît → il est ré-envoyé (le serveur le restaure).
    expect(diffPlan(doc({ ...base, equipements: [base.equipements[1]] }), base).equipements?.map((item) => item.id)).toEqual(["a"]);
  });

  it("validation : mur absent signalé ; le pré-contrôle d'enregistrement ne bloque que les objets du lot", () => {
    const orphan = doc({ ...base, murs: [] });
    expect(validatePlanDocument(orphan).map((issue) => issue.equipmentCode)).toContain("mur_absent");
    const ops = diffPlan(base, orphan);
    expect(ops.supprimes).toEqual(["m1"]);
    expect(validatePlanSave(orphan, ops).some((issue) => issue.equipmentCode === "mur_absent")).toBe(true);
    const detached = doc({ ...orphan, equipements: [base.equipements[0], { ...base.equipements[1], murId: null, face: null, decalageMm: null }] });
    expect(validatePlanSave(detached, diffPlan(base, detached))).toEqual([]);
  });

  it("export neutre : objets visibles sur le calque de leur catégorie ; objets masqués exclus", () => {
    expect(PLAN_EXPORT_LAYERS).toEqual(expect.arrayContaining(["MOBILIER", "SANITAIRE", "CUISINE", "TECHNIQUE"]));
    const entities = planExportEntities(doc({ ...base, equipements: [...base.equipements, obj("c", "lit", 0, 0, { visible: false })] }));
    expect(entities.filter((e) => e.layer === "SANITAIRE" && e.kind === "polygon").map((e) => e.ref)).toEqual(["a"]);
    expect(entities.filter((e) => e.layer === "TECHNIQUE" && e.kind === "polygon").map((e) => e.ref)).toEqual(["b"]);
    expect(entities.some((e) => e.ref === "c")).toBe(false);
  });

  it("fiche pièce : objets du plan de référence et hors plan, compteur réel (pas de double compte des copies)", () => {
    const d = (objet: string) => equipementDonnees(obj("_", objet)) as never;
    const rows = [
      { id: "1", planId: "p1", pieceId: "piece", donnees: d("wc") },
      { id: "2", planId: "p2", pieceId: "piece", donnees: d("wc") },
      { id: "3", planId: "p2", pieceId: "piece", donnees: d("lavabo") },
      { id: "4", planId: null, pieceId: "piece", donnees: d("radiateur") },
      { id: "5", planId: "p2", pieceId: "autre", donnees: d("lit") },
    ];
    const list = equipementsDeLaPiece(rows, [{ id: "p1", numero: 1, deletedAt: null }, { id: "p2", numero: 2, deletedAt: null }], "piece");
    expect(list.map((item) => item.id).sort()).toEqual(["2", "3", "4"]);
    expect(countByCategorie(list)).toEqual({ sanitaire: 2, cvc: 1 });
  });
});

describe("Lot 7 — dépôt mémoire (mêmes règles que la RPC)", () => {
  const context = { entrepriseId: "e", releveId: "r", actorId: "u" };
  it("création, verrou, suppression, corbeille, restauration, dérivation, gel", async () => {
    let n = 0;
    const repo = new InMemoryPlanRepository(context, () => `2026-09-28T00:00:0${n}Z`, () => `id-${++n}`);
    const plan = await repo.createPlan("etage", "initial");
    const start = doc({ murs: [mur("m1", 0, 0, 4000, 0)], equipements: [obj("a", "wc"), obj("b", "radiateur", 2000, 150, { murId: "m1", face: "gauche", decalageMm: 2000, verrouille: true })] });
    let revision = (await repo.savePlan(plan.id, 1, diffPlan(EMPTY_PLAN_DOCUMENT, start))).revision;
    const loaded = await repo.loadPlan(plan.id);
    expect(loaded.document.equipements.map((item) => item.id)).toEqual(["a", "b"]);
    // Verrou : ni déplacement, ni suppression.
    const moved = doc({ ...start, equipements: [start.equipements[0], { ...start.equipements[1], position: { x: 0, y: 0 } }] });
    await expect(repo.savePlan(plan.id, revision, diffPlan(start, moved))).rejects.toBeInstanceOf(PlanRuleError);
    await expect(repo.savePlan(plan.id, revision, { murs: [], ouvertures: [], supprimes: ["b"] })).rejects.toThrow(/verrouillé/);
    // Suppression douce puis restauration.
    revision = (await repo.savePlan(plan.id, revision, { murs: [], ouvertures: [], supprimes: ["a"] })).revision;
    expect((await repo.listDeletedEquipements(plan.id)).map((item) => item.objet.id)).toEqual(["a"]);
    revision = (await repo.savePlan(plan.id, revision, diffPlan(doc({ ...start, equipements: [start.equipements[1]] }), start))).revision;
    expect(await repo.listDeletedEquipements(plan.id)).toEqual([]);
    // Gel puis dérivation : copie, lignée, liaison au mur reportée.
    await repo.freezePlan(plan.id, revision);
    await expect(repo.savePlan(plan.id, revision + 1, diffPlan(start, EMPTY_PLAN_DOCUMENT))).rejects.toThrow(/figé/);
    const projete = await repo.createPlan("etage", "projete");
    const copy = await repo.loadPlan(projete.id);
    const radiateur = copy.document.equipements.find((item) => item.objet === "radiateur")!;
    expect(radiateur.origineId).toBe("b");
    expect(copy.document.murs.find((item) => item.id === radiateur.murId)?.origineId).toBe("m1");
  });
});
