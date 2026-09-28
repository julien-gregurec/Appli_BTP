import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COTE_ISSUE_CODES, COTE_ISSUE_MESSAGES, COTE_TYPES, METRE_CSV_COLUMNS, METRE_GRANDEURS, REVETEMENT_FAMILLES, REVETEMENT_ISSUE_CODES, REVETEMENT_ISSUE_MESSAGES,
  buildMetreGpPayload, buildMetreTree, computePlanMetre, coteAnomalie, coteDonnees, coteEcartMm, coteFromElement, metreLignes, metreToCsv, newPlanCote,
  ouvertureFranchissable, piecesSansMetre, planMetreFromJson, revetementAnomalie, revetementDonnees, revetementFromElement, revetementTotaux,
  type MetreInput, type MetreStructure, type PlanCote, type PlanRevetement,
} from "./metre";
import { REVETEMENT_TYPES, REVETEMENT_TYPES_LOT8 } from "./model";
import { EMPTY_PLAN_DOCUMENT, diffPlan, isPlanOperationsEmpty, murDonnees, murFromElement, ouvertureDonnees, planExportEntities, validatePlanDocument, validatePlanSave, type PlanDocument, type PlanMur, type PlanOuverture } from "./plan";
import { InMemoryPlanRepository } from "./plan-memory";

const lot8Raw = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260928001201_tools_releve_metre_metres_revetements_v1.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");
const lot8 = lot8Raw.replace(/, /g, ",").replace(/\( /g, "(").replace(/ \)/g, ")");
const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");
const sqlMessage = (fn: string, code: string) => {
  const match = new RegExp(`function public\\.${fn}\\(p_code text\\).*?end;`).exec(lot8Raw)![0];
  const found = new RegExp(`when '${code}' then '((?:[^']|'')*)'`).exec(match);
  return found ? found[1].replace(/''/g, "'") : new RegExp(`else '((?:[^']|'')*)' end`).exec(match)![1].replace(/''/g, "'");
};

// Même fixture que la recette pgTAP `elsatia_tools_releve_metre_lot8_metres_revetements.test.sql`.
const M = (n: number) => `d8600000-0000-0000-0000-00000000000${n}`;
const O = (n: number) => `d8700000-0000-0000-0000-00000000000${n}`;
const PIECE = "d8500000-0000-0000-0000-000000000001";
const mur = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<PlanMur> = {}): PlanMur =>
  ({ id, pieceId: null, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur", ...extra });
const ouv = (id: string, murId: string, typeOuverture: PlanOuverture["typeOuverture"], decalageMm: number, largeurMm: number, hauteurMm: number, allegeMm: number | null): PlanOuverture =>
  ({ id, murId, typeOuverture, decalageMm, largeurMm, hauteurMm, allegeMm, sens: "gauche" });
const document: PlanDocument = {
  ...EMPTY_PLAN_DOCUMENT,
  murs: [mur(M(1), 0, 0, 4000, 0), mur(M(2), 4000, 0, 4000, 3000), mur(M(3), 4000, 3000, 0, 3000), mur(M(4), 0, 3000, 0, 0)],
  ouvertures: [ouv(O(1), M(1), "porte", 1000, 900, 2100, 0), ouv(O(2), M(3), "fenetre", 1500, 1200, 1000, 1000), ouv(O(3), M(2), "fenetre", 1000, 400, 400, 1200)],
  contours: [{ pieceId: PIECE, points: [{ x: 100, y: 100 }, { x: 3900, y: 100 }, { x: 3900, y: 2900 }, { x: 100, y: 2900 }], murIds: [M(1), M(2), M(3), M(4)], graine: { x: 2000, y: 1500 } }],
  cotes: [newPlanCote("d8800000-0000-0000-0000-000000000003", { x: 2000, y: 1500 }, null, { typeCote: "hauteur", source: "manuel", valeurMm: 2480, pieceId: PIECE, priseLe: "2026-09-28T10:00:00Z" })],
};
const rev = (id: string, patch: Partial<PlanRevetement>): PlanRevetement => ({
  id, pieceId: PIECE, support: "sol", famille: "carrelage", libelle: "Revêtement", pertePourcent: 10, application: { mode: "tous" },
  sensPose: null, format: null, commentaire: null, ...patch,
});
const R = (n: number) => `d8900000-0000-0000-0000-00000000000${n}`;
const revetements: PlanRevetement[] = [
  rev(R(1), { libelle: "Carrelage 60×60", format: "60x60", sensPose: "droit" }),
  rev(R(2), { support: "mur", famille: "peinture", pertePourcent: 5 }),
  rev(R(3), { support: "plafond", famille: "peinture", pertePourcent: 0 }),
  rev(R(4), { support: "plinthe", famille: "plinthe", pertePourcent: 0 }),
  rev(R(5), { support: "plinthe", famille: "corniche", pertePourcent: 0 }),
  rev(R(6), { support: "mur", famille: "papier_peint", pertePourcent: 0, application: { mode: "murs", murIds: [M(1)] } }),
  rev(R(7), { support: "mur", famille: "faience", pertePourcent: 12.5, application: { mode: "zone", murId: M(2), debutMm: 500, finMm: 2500, basMm: 0, hautMm: 1500 } }),
];
const input = (patch: Partial<MetreInput> = {}): MetreInput => ({
  planId: "p1", etageId: "e1", etat: "initial", numero: 1, document, revetements,
  pieces: [{ id: PIECE, hauteurSousPlafondMm: 2500 }], etageHauteurMm: null, ...patch,
});

describe("Lot 8 — parité domaine ↔ migration 1201", () => {
  it("types de cote, familles par support, grandeurs d'ajustement identiques au SQL", () => {
    expect(lot8).toContain(`not in (${quoted(COTE_TYPES)})`);
    expect(lot8).toContain(`when 'sol' then v_fam in (${quoted(REVETEMENT_FAMILLES.sol)})`);
    expect(lot8).toContain(`when 'mur' then v_fam in (${quoted(REVETEMENT_FAMILLES.mur)})`);
    expect(lot8).toContain(`when 'plafond' then v_fam in (${quoted(REVETEMENT_FAMILLES.plafond)})`);
    expect(lot8).toContain(`else v_fam in (${quoted(REVETEMENT_FAMILLES.plinthe)})`);
    expect(lot8).toContain(`grandeur in (${quoted(METRE_GRANDEURS)})`);
  });

  it("contrat générique : familles Lot 8 = sur-ensemble ordonné de la Recovery V2", () => {
    expect(REVETEMENT_TYPES_LOT8.slice(0, REVETEMENT_TYPES.length)).toEqual([...REVETEMENT_TYPES]);
    expect(lot8).toContain(`p_donnees->>'revetement' in (${quoted(REVETEMENT_TYPES_LOT8)})`);
    for (const familles of Object.values(REVETEMENT_FAMILLES)) for (const famille of familles) expect(REVETEMENT_TYPES_LOT8).toContain(famille);
  });

  it("messages de refus identiques client / serveur", () => {
    for (const code of COTE_ISSUE_CODES) expect(sqlMessage("tools_releve_plan_cote_message", code)).toBe(COTE_ISSUE_MESSAGES[code]);
    for (const code of REVETEMENT_ISSUE_CODES) expect(sqlMessage("tools_releve_plan_revetement_message", code)).toBe(REVETEMENT_ISSUE_MESSAGES[code]);
  });
});

describe("Lot 8 — métré (valeurs identiques à la recette pgTAP)", () => {
  const metre = computePlanMetre(input());
  const room = metre.pieces[0];
  const q = (id: string) => metre.revetements.find((item) => item.id === id)!;

  it("surfaces, périmètres, faces, déductions, volume (M1–M13)", () => {
    expect(room.surfaceSolBruteMm2).toBe(10_640_000);
    expect(room.surfaceSolNetteMm2).toBe(10_640_000);
    expect(room.surfacePlafondMm2).toBe(10_640_000);
    expect(room.perimetreBrutMm).toBe(13_200);
    expect(room.perimetreUtileMm).toBe(12_300);
    expect(room.faces.map((face) => face.murId)).toEqual([M(1), M(2), M(3), M(4)]);
    expect([room.surfaceMursBruteMm2, room.deductionsMm2, room.surfaceMursNetteMm2]).toEqual([33_000_000, 3_250_000, 29_750_000]);
    expect(room.volumeMm3).toBe(26_600_000_000);
    expect(room.ouvertures.map((o) => `${o.typeOuverture}:${o.surfaceMm2}:${o.franchissable}`)).toEqual(["porte:1890000:true", "fenetre:1200000:false", "fenetre:160000:false"]);
    expect(room.faces[0].surfaceNetteMm2).toBe(7_610_000);
    expect(room.hauteursPonctuelles[0].valeurMm).toBe(2480);
    expect(room.hauteurSource).toBe("piece");
  });

  it("hauteur inconnue : volume et murs NON calculables, jamais de hauteur inventée ; étage puis pièce (M7–M9)", () => {
    const sans = computePlanMetre(input({ pieces: [{ id: PIECE, hauteurSousPlafondMm: null }] })).pieces[0];
    expect([sans.hauteurMm, sans.volumeMm3, sans.surfaceMursBruteMm2, sans.surfaceMursNetteMm2, sans.deductionsMm2]).toEqual([null, null, null, null, 3_250_000]);
    const etage = computePlanMetre(input({ pieces: [{ id: PIECE, hauteurSousPlafondMm: null }], etageHauteurMm: 2600 })).pieces[0];
    expect([etage.hauteurMm, etage.hauteurSource]).toEqual([2600, "etage"]);
    // La hauteur des murs (2,50 m par défaut dans l'éditeur) n'est jamais utilisée.
    expect(document.murs.every((item) => item.hauteurMm === 2500)).toBe(true);
    const revs = computePlanMetre(input({ pieces: [{ id: PIECE, hauteurSousPlafondMm: null }] })).revetements;
    expect(revs.find((item) => item.id === R(2))).toMatchObject({ quantite: null, calculable: false, raison: "hauteur_inconnue" });
  });

  it("option « petites ouvertures » : seuil choisi par l'utilisateur, aucun défaut (M15–M16)", () => {
    const seuil = computePlanMetre(input({ document: { ...document, reglages: { metre: { seuilDeductionMm2: 200_000 } } } })).pieces[0];
    expect(seuil.surfaceMursNetteMm2).toBe(29_910_000);
    expect(seuil.ouvertures.find((o) => o.id === O(3))!.deduite).toBe(false);
    expect(metre.seuilDeductionMm2).toBeNull();
  });

  it("revêtements : sol, murs (tous, choisis, zone), plafond, plinthe, corniche, perte (R2–R5)", () => {
    expect([q(R(1)).quantite, q(R(1)).quantiteAvecPerte]).toEqual([10_640_000, 11_704_000]);
    expect([q(R(2)).quantite, q(R(2)).quantiteAvecPerte]).toEqual([29_750_000, 31_237_500]);
    expect([q(R(3)).quantite, q(R(4)).quantite, q(R(5)).quantite]).toEqual([10_640_000, 12_300, 13_200]);
    expect([q(R(6)).quantite, q(R(7)).quantite, q(R(7)).quantiteAvecPerte]).toEqual([7_610_000, 2_880_000, 3_240_000]);
  });

  it("ajustements : valeur calculée conservée, valeur retenue propagée, péremption (A1–A3)", () => {
    const ajuste = computePlanMetre(input({ ajustements: [
      { id: "a1", pieceId: PIECE, revetementId: null, grandeur: "surface_sol", unite: "mm2", valeurCalculee: 10_640_000, valeurRetenue: 10_500_000, raison: "Poteau", auteurId: "u", date: "2026-09-28" },
      { id: "a2", pieceId: PIECE, revetementId: R(2), grandeur: "quantite", unite: "mm2", valeurCalculee: 29_000_000, valeurRetenue: 30_000_000, raison: "Arrondi", auteurId: "u", date: "2026-09-28" },
    ] }));
    const p = ajuste.pieces[0];
    expect([p.surfaceSolNetteMm2, p.retenu.surface_sol, p.ajustements[0].perime]).toEqual([10_640_000, 10_500_000, false]);
    const sol = ajuste.revetements.find((item) => item.id === R(1))!;
    expect([sol.quantite, sol.quantiteAvecPerte]).toEqual([10_500_000, 11_550_000]);
    const murs = ajuste.revetements.find((item) => item.id === R(2))!;
    expect([murs.quantiteCalculee, murs.quantite, murs.ajustement?.perime]).toEqual([29_750_000, 30_000_000, true]);
  });

  it("travaux du projeté : existant / dépose / neuf distingués (V10–V11)", () => {
    const projete = computePlanMetre(input({ etat: "projete", document: {
      ...document, murs: document.murs.map((item) => (item.id === M(2) ? { ...item, etatProjet: "a_deposer" as const } : item)),
      ouvertures: [...document.ouvertures, { ...ouv("d8700000-0000-0000-0000-000000000009", M(4), "porte", 500, 800, 2100, 0), etatProjet: "nouveau" as const }],
    } }));
    expect(projete.travaux.murs.a_deposer).toEqual({ nombre: 1, longueurMm: 3000, surfaceMm2: 7_500_000, sansHauteur: 0 });
    expect(projete.travaux.murs.existant?.nombre).toBe(3);
    expect(projete.travaux.ouvertures.nouveau).toEqual({ nombre: 1, surfaceMm2: 1_680_000 });
  });

  it("franchissabilité au sol : portes, passages ; baie / trémie seulement à allège 0", () => {
    expect([ouvertureFranchissable("porte", null), ouvertureFranchissable("passage", null), ouvertureFranchissable("fenetre", 0),
      ouvertureFranchissable("baie", null), ouvertureFranchissable("baie", 0), ouvertureFranchissable("tremie", 0)]).toEqual([true, true, false, false, true, true]);
  });

  it("le JSON serveur (numeric en chaîne) est normalisé", () => {
    const normalized = planMetreFromJson({ ...metre, hauteurEtageMm: "2600.0", pieces: [{ ...room, hauteurMm: "2500.0" }] });
    expect(normalized.hauteurEtageMm).toBe(2600);
    expect(normalized.pieces[0].hauteurMm).toBe(2500);
  });
});

describe("Lot 8 — cotes", () => {
  const base = newPlanCote("c1", { x: 100, y: 100 }, { x: 3900, y: 100 }, { priseLe: "2026-09-28T10:00:00Z" });
  it("cote calculée = longueur ; relevée : écart signalé, jamais écrasée", () => {
    expect([base.valeurMm, base.source, coteAnomalie(base), coteEcartMm(base)]).toEqual([3800, "calcule", null, null]);
    const releve: PlanCote = { ...base, source: "laser", valeurMm: 3795 };
    expect([coteAnomalie(releve), coteEcartMm(releve)]).toEqual([null, -5]);
    expect(coteAnomalie({ ...base, valeurMm: 3700 })).toBe("valeur");
    expect(coteAnomalie({ ...base, b: { x: 100, y: 100 } })).toBe("points");
    expect(coteAnomalie({ ...base, typeCote: "oblique" as never })).toBe("type_cote");
    expect(coteAnomalie({ ...base, etatProjet: "demoli" as never })).toBe("etat_projet");
    expect(coteAnomalie(newPlanCote("h", { x: 0, y: 0 }, null, { valeurMm: 2480 }))).toBeNull();
    expect(coteAnomalie(newPlanCote("h", { x: 0, y: 0 }, null, { valeurMm: 2480, source: "calcule" }))).toBe("valeur");
  });
  it("aller-retour élément ↔ cote, différence d'enregistrement, contrôle avant envoi", () => {
    const donnees = coteDonnees(base, "e1");
    expect(donnees).toMatchObject({ cible: { kind: "etage", id: "e1" }, typeMesure: "longueur", unite: "mm", valeur: 3800, typeCote: "libre" });
    expect(coteFromElement({ id: "c1", pieceId: null, donnees })).toEqual(base);
    const before: PlanDocument = { ...EMPTY_PLAN_DOCUMENT };
    const after: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, cotes: [base] };
    const ops = diffPlan(before, after, { etageId: "e1" });
    expect(ops.cotes?.[0].donnees).toEqual(donnees);
    expect(isPlanOperationsEmpty(diffPlan(after, after))).toBe(true);
    expect(diffPlan(after, before).supprimes).toEqual(["c1"]);
    const bad: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, cotes: [{ ...base, valeurMm: 1 }] };
    expect(validatePlanDocument(bad).map((issue) => issue.coteCode)).toEqual(["valeur"]);
    expect(validatePlanSave(bad, diffPlan(before, bad))).toHaveLength(1);
    expect(planExportEntities(after).filter((entity) => entity.layer === "COTES").map((entity) => entity.kind)).toEqual(["line", "text"]);
  });
  it("état projeté des murs et ouvertures : aller-retour et contrôle", () => {
    const m = { ...mur("m", 0, 0, 10, 0), etatProjet: "a_deposer" as const };
    expect(murDonnees(m).etatProjet).toBe("a_deposer");
    expect(murFromElement({ id: "m" as never, pieceId: null, donnees: murDonnees(m) as never }).etatProjet).toBe("a_deposer");
    expect(murFromElement({ id: "m" as never, pieceId: null, donnees: murDonnees(mur("m", 0, 0, 10, 0)) as never })).not.toHaveProperty("etatProjet");
    expect(ouvertureDonnees({ ...ouv("o", "m", "porte", 0, 5, 5, 0), etatProjet: "nouveau" }).etatProjet).toBe("nouveau");
    expect(validatePlanDocument({ ...EMPTY_PLAN_DOCUMENT, murs: [{ ...m, etatProjet: "x" as never }] }).map((issue) => issue.message)).toEqual(["État projeté inconnu."]);
  });
  it("dépôt mémoire : cotes enregistrées, copiées dans un plan dérivé, refus motivé", async () => {
    const repo = new InMemoryPlanRepository({ entrepriseId: "t", releveId: "r", actorId: "u" });
    const plan = await repo.createPlan("e1", "initial");
    await repo.savePlan(plan.id, plan.revision, diffPlan(EMPTY_PLAN_DOCUMENT, { ...EMPTY_PLAN_DOCUMENT, cotes: [base] }, { etageId: "e1" }));
    expect((await repo.loadPlan(plan.id)).document.cotes).toEqual([base]);
    const reloaded = await repo.loadPlan(plan.id);
    await expect(repo.savePlan(plan.id, reloaded.plan.revision, { murs: [], ouvertures: [], supprimes: [], cotes: [{ id: "c2", pieceId: null, donnees: { ...coteDonnees(base, "e1"), valeur: 1 } }] }))
      .rejects.toThrow("Valeur de cote invalide.");
    await repo.freezePlan(plan.id, reloaded.plan.revision);
    const derived = await repo.createPlan("e1", "corrige");
    const copies = (await repo.loadPlan(derived.id)).document.cotes!;
    expect(copies).toHaveLength(1);
    expect(copies[0].origineId).toBe("c1");
  });
});

describe("Lot 8 — revêtements", () => {
  it("contrôles miroir (famille par support, unité, perte, application, mur absent)", () => {
    const ok = rev("r", {});
    expect(revetementAnomalie(ok)).toBeNull();
    expect(revetementAnomalie(rev("r", { support: "plafond", famille: "parquet" }))).toBe("famille");
    expect(revetementAnomalie(rev("r", { pertePourcent: 150 }))).toBe("perte");
    expect(revetementAnomalie(rev("r", { pertePourcent: 10.555 }))).toBe("perte");
    expect(revetementAnomalie(rev("r", { application: { mode: "murs", murIds: [M(1)] } }))).toBe("application");
    expect(revetementAnomalie(rev("r", { support: "mur", famille: "peinture", application: { mode: "zone", murId: M(1), debutMm: 10, finMm: 5, basMm: 0, hautMm: 10 } }))).toBe("application");
    expect(revetementAnomalie(rev("r", { libelle: " " }))).toBe("texte");
    expect(revetementAnomalie(rev("r", { support: "mur", famille: "peinture", application: { mode: "murs", murIds: ["x"] } }), new Set([M(1)]))).toBe("mur_absent");
  });
  it("aller-retour élément ↔ revêtement ; unité déduite du support", () => {
    const item = rev("r", { support: "plinthe", famille: "corniche", commentaire: "Plâtre", etatProjet: "nouveau" });
    const donnees = revetementDonnees(item);
    expect(donnees).toMatchObject({ categorie: "plinthe", unite: "ml", revetement: "corniche", etatProjet: "nouveau" });
    expect(revetementFromElement({ id: "r", pieceId: PIECE, donnees })).toEqual({ ...item, origineId: null });
  });
});

describe("Lot 8 — synthèse, CSV, contrat Gestion Pro", () => {
  const structure: MetreStructure = {
    chantiers: [{ id: "c", nom: "Chantier", ordre: 0, deletedAt: null }],
    batiments: [{ id: "b", chantierId: "c", nom: "Bâtiment A", ordre: 0, deletedAt: null }],
    etages: [{ id: "e1", batimentId: "b", nom: "RDC", niveau: 0, ordre: 0, deletedAt: null }, { id: "e2", batimentId: "b", nom: "R+1", niveau: 1, ordre: 1, deletedAt: null }],
    zones: [{ id: "z", etageId: "e1", nom: "Logement 1", ordre: 0, deletedAt: null }],
    pieces: [{ id: PIECE, etageId: "e1", zoneId: "z", nom: "Séjour; salon", ordre: 0, deletedAt: null }, { id: "p2", etageId: "e1", zoneId: null, nom: "Cellier", ordre: 1, deletedAt: null }],
  };
  const metre = computePlanMetre(input());
  const sources = [{ etageId: "e1", planId: "p1", numero: 1, etat: "initial" as const, figeLe: null, metre }];
  const tree = buildMetreTree(structure, sources, { id: "r1", nom: "Relevé" });

  it("arbre chantier → bâtiment → étage → zone → pièce, totaux cumulés", () => {
    const etage = tree.children[0].children[0].children[0];
    expect([tree.kind, tree.children[0].kind, tree.children[0].children[0].kind, etage.kind, etage.children[0].kind, etage.children[0].children[0].kind])
      .toEqual(["releve", "chantier", "batiment", "etage", "zone", "piece"]);
    expect(tree.totaux).toMatchObject({ pieces: 1, surfaceSolMm2: 10_640_000, surfaceMursMm2: 29_750_000, perimetreUtileMm: 12_300, volumeMm3: 26_600_000_000, ouvertures: 3, sansHauteur: 0 });
    expect(tree.children[0].children[0].children[1].plan).toBeUndefined();
    expect(piecesSansMetre(structure, sources)).toEqual(["p2"]);
    expect(revetementTotaux(tree.revetements).find((total) => total.support === "plinthe" && total.famille === "plinthe")?.quantite).toBe(12_300);
  });

  it("CSV : séparateur ; décimale virgule, BOM, valeurs exactes, cellules échappées", () => {
    const csv = metreToCsv(tree);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[0].replace("﻿", "")).toBe(METRE_CSV_COLUMNS.join(";"));
    expect(lines).toContain('Chantier;Bâtiment A;RDC;Logement 1;"Séjour; salon";Surface de sol;10,64;m²;;10,64;non;;');
    expect(lines).toContain('Chantier;Bâtiment A;RDC;Logement 1;"Séjour; salon";Volume;26,600;m³;;26,600;non;;');
    expect(lines.some((line) => line.includes("Sol · Carrelage · Carrelage 60×60;10,64;m²;11,70;10,64;non;;Existant"))).toBe(true);
    expect(metreLignes(tree)).toHaveLength(8 + 7);
  });

  it("contrat GP : unités d'échange exactes (m, m², m³), pas de prix, clé d'idempotence", () => {
    const payload = buildMetreGpPayload(tree, sources, "existant");
    expect(payload.pieces[0]).toMatchObject({ surfaceSolM2: 10.64, perimetreUtileM: 12.3, surfaceMursNetteM2: 29.75, volumeM3: 26.6, hauteurM: 2.5 });
    expect(payload.revetements.find((item) => item.ref === R(7))).toMatchObject({ unite: "m²", quantite: 2.88, quantiteAvecPerte: 3.24, pertePourcent: 12.5 });
    expect(payload.ouvertures.map((item) => item.surfaceM2)).toEqual([1.89, 1.2, 0.16]);
    expect(payload.quantites.find((item) => item.designation === "Ouvertures")?.quantite).toBe(3);
    expect(JSON.stringify(payload)).not.toMatch(/prix|montant/i);
    expect(payload.idempotencyKey).toBe("r1:existant:p1#1");
  });
});
