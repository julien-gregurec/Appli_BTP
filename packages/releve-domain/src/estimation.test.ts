import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MetreStructure } from "./metre";
import {
  agregerEstimation, buildEstimationGpPayload, centimesText, comparerEstimations, ESTIMATION_ANOMALIE_CODES, ESTIMATION_CSV_COLUMNS, ESTIMATION_GP_CONTRACT,
  estimationAnomalieMessage, estimationDetails, estimationToCsv, evaluerEstimation, evaluerEstimationAvecParametres, forfaitCentimes, PARAMETRES_VIDES, formatHeures, formatMontant, formatPrixUnitaire,
  planEstimationFromJson, PRIX_ISSUE_MESSAGES, PRIX_TYPES, prixAnomalie, prixGlobal, prixTexte, prixUnitaireComposite, syntheseCouts, totalEstimation,
  validateEstimationGpPayload,
  type EstimationEntree, type EstimationParametresDonnees, type EstimationSource, type PlanEstimation, type PrixDonnees,
} from "./estimation";
import { evaluerQuantitatif, OUVRAGE_CATALOGUE_STANDARD, validateQuantitatifGpPayload, type OuvrageRecord, type PlanQuantitatif } from "./quantitatif";

const B = (value: number | string) => BigInt(value);
const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261002001114_tools_releve_metre_estimation_simplifiee_v1.sql", import.meta.url)), "utf8").replace(/\s+/g, " ");
type Cas = { entree: EstimationEntree; attendu: unknown };
const parite = JSON.parse(readFileSync(fileURLToPath(new URL("./estimation-parite.fixture.json", import.meta.url)), "utf8")) as { cas: Cas[] };
const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");

describe("parité domaine ↔ migration 20261002001114", () => {
  it("énumérations identiques (types de prix, codes d'anomalie)", () => {
    const flat = sql.replace(/, /g, ",");
    expect(flat).toContain(`not in (${quoted(PRIX_TYPES)})`);
    expect(flat).toContain(`array[${quoted(ESTIMATION_ANOMALIE_CODES)}]`);
  });
  it("messages identiques au SQL", () => {
    for (const message of Object.values(PRIX_ISSUE_MESSAGES)) expect(sql).toContain(message.replace(/'/g, "''"));
    for (const code of ESTIMATION_ANOMALIE_CODES.filter((c) => c !== "prix_invalide")) expect(sql).toContain(estimationAnomalieMessage(code, "").replace(/'/g, "''"));
  });
  it(`P1. le miroir TypeScript reproduit EXACTEMENT le serveur (${parite.cas.length} cas déterministes, jeu vérifié aussi par pgTAP)`, () => {
    expect(parite.cas.length).toBeGreaterThanOrEqual(40);
    for (const cas of parite.cas) expect(JSON.parse(JSON.stringify(evaluerEstimation(cas.entree)))).toEqual(cas.attendu);
  });
  // Jeu étendu (ex. 3 000 cas) produit par scripts/releve/estimation-parite.mjs, fourni hors dépôt.
  const extra = process.env.ESTIMATION_PARITE_EXTRA;
  it.runIf(!!extra && existsSync(extra))("P1 étendu : jeu de parité supplémentaire (ESTIMATION_PARITE_EXTRA)", () => {
    const big = JSON.parse(readFileSync(extra as string, "utf8")) as { cas: Cas[] };
    let lignes = 0;
    for (const cas of big.cas) { const r = evaluerEstimation(cas.entree); lignes += r.lignes.length; expect(JSON.parse(JSON.stringify(r))).toEqual(cas.attendu); }
    expect(lignes).toBeGreaterThan(0);
  });
});

describe("contrat d'un prix estimatif", () => {
  const ok: PrixDonnees = { composantes: [{ type: "materiau", prixUnitaire: 3.5 }, { type: "main_d_oeuvre", heuresParUnite: 0.25, tauxHoraire: 45 }, { type: "forfait", montant: 120 }, { type: "autre", prixUnitaire: 0 }], coefficient: 1.1 };
  it.each([
    [ok, null],
    [prixGlobal(12.5), null],
    [{ composantes: [] }, "composantes"],
    [{ composantes: [{ type: "remise", prixUnitaire: 1 }] }, "type"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1 }], tva: 20 }, "cle"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1 }], marge: 15 }, "cle"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1, prixVente: 2 }] }, "cle"],
    [{ composantes: [{ type: "materiau", montant: 1 }] }, "cle"],
    [{ composantes: [{ type: "materiau", prixUnitaire: -1 }] }, "prix_unitaire"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1.23456 }] }, "prix_unitaire"],
    [{ composantes: [{ type: "main_d_oeuvre", heuresParUnite: 1, tauxHoraire: 45.123 }] }, "taux"],
    [{ composantes: [{ type: "main_d_oeuvre", heuresParUnite: 0.12345, tauxHoraire: 45 }] }, "heures"],
    [{ composantes: [{ type: "forfait", montant: 10.001 }] }, "forfait"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1 }], coefficient: 0 }, "coefficient"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1, libelle: "x".repeat(121) }] }, "libelle"],
    [{ composantes: [{ type: "materiau", prixUnitaire: 1 }], commentaire: "x".repeat(501) }, "commentaire"],
    ["12", "invalide"],
  ])("%j → %s", (input, code) => { expect(prixAnomalie(input)).toBe(code); });
  it("prix unitaire composite, forfait, libellé", () => {
    expect(prixUnitaireComposite(ok)).toBe(B(162250)); // (3,50 + 0,25 × 45) × 1,1 = 16,225 €
    expect(forfaitCentimes(ok)).toBe(B(13200));
    expect(prixUnitaireComposite({ composantes: [{ type: "forfait", montant: 10 }] })).toBeNull();
    expect(prixTexte(ok, "m2")).toBe("Matériau 3,50 €/m² + Main d'œuvre 0,25 h/m² × 45,00 €/h + Forfait 120,00 € + Autre 0,00 €/m² · coefficient × 1,1 (HT)");
    expect(formatMontant(B(123456789))).toBe("1 234 567,89 €");
    expect(formatMontant(B(-505))).toBe("-5,05 €");
    expect(formatPrixUnitaire(16.225)).toBe("16,225 €");
    expect(formatHeures(B(8590))).toBe("8,59 h");
  });
});

describe("moteur : cas BTP (valeurs exactes)", () => {
  const PEI = "PEI-MUR";
  const lignes = (q: number | null) => [{ ouvrageId: PEI, pieceId: "p1", etatProjet: "nouveau" as const, unite: "m2" as const, quantiteRetenue: q }];
  const ouvrages = [{ id: PEI, etatTravaux: "nouveau" as const }];
  it("peinture : 31,238 m² (perte 5 % DÉJÀ dans la quantité du Lot 9) × (3,50 + 0,25 h × 45 €) × 1,1", () => {
    const r = evaluerEstimation({ ouvrages, lignes: lignes(31.238), prix: [{ ouvrageId: PEI, donnees: { composantes: [{ type: "materiau", prixUnitaire: 3.5 }, { type: "main_d_oeuvre", heuresParUnite: 0.25, tauxHoraire: 45 }], coefficient: 1.1 } }] });
    expect(r.lignes[0]).toMatchObject({ quantite: 31.238, prixUnitaire: 16.225, materiau: 120.27, mainOeuvre: 386.57, heures: 8.59, montantCalcule: 506.84, montantRetenu: 506.84 });
    expect(r.totaux).toMatchObject({ montant: 506.84, parType: { materiau: 120.27, main_d_oeuvre: 386.57, forfait: 0, autre: 0 }, heures: 8.59 });
  });
  it("la perte n'est jamais appliquée deux fois : 29,75 m² nets + 5 % = 31,238 m² (Lot 9) → 31,238 × 10 € = 312,38 €", () => {
    const q = evaluerQuantitatif({
      metre: { pieces: [{ pieceId: "p1", retenu: { surface_murs: 29_750_000 } } as never], ouvertures: [], equipements: [], revetements: [] },
      ouvrages: [{ ...OUVRAGE_CATALOGUE_STANDARD[0], id: PEI }],
    });
    expect(q.lignes[0].quantiteRetenue).toBe(31.238);
    const r = evaluerEstimation({ ouvrages, lignes: q.lignes, prix: [{ ouvrageId: PEI, donnees: prixGlobal(10) }] });
    expect(r.lignes[0].montantCalcule).toBe(312.38);
    expect(Object.keys(prixGlobal(10))).not.toContain("pertePourcent");
    expect(prixAnomalie({ composantes: [{ type: "materiau", prixUnitaire: 10 }], pertePourcent: 5 })).toBe("cle");
  });
  it("arrondi moitié loin de zéro au centime, PAR composante ; montant = somme des composantes", () => {
    // 1,005 u × 1 € = 1,005 € → 1,01 € ; deux composantes à 0,005 € chacune → 0,01 + 0,01 = 0,02 €.
    const r = evaluerEstimation({ ouvrages, lignes: [{ ...lignes(1.005)[0], unite: "u" }], prix: [{ ouvrageId: PEI, donnees: { composantes: [{ type: "materiau", prixUnitaire: 1 }] } }] });
    expect(r.lignes[0].montantCalcule).toBe(1.01);
    const r2 = evaluerEstimation({ ouvrages, lignes: [{ ...lignes(1)[0], unite: "u" }], prix: [{ ouvrageId: PEI, donnees: { composantes: [{ type: "materiau", prixUnitaire: 0.005 }, { type: "autre", prixUnitaire: 0.005 }] } }] });
    expect(r2.lignes[0]).toMatchObject({ materiau: 0.01, autre: 0.01, montantCalcule: 0.02 });
  });
  it("forfait : une ligne par ouvrage, état de travaux, coefficient compris", () => {
    const r = evaluerEstimation({ ouvrages: [{ id: "DEP", etatTravaux: "a_deposer" }], lignes: [{ ouvrageId: "DEP", pieceId: "p1", etatProjet: "a_deposer", unite: "u", quantiteRetenue: 2 }],
      prix: [{ ouvrageId: "DEP", donnees: { composantes: [{ type: "autre", prixUnitaire: 35 }, { type: "forfait", montant: 150, libelle: "Évacuation" }], coefficient: 1.2 } }] });
    expect(r.lignes.map((l) => `${l.nature}:${l.pieceId}:${l.etatProjet}:${l.montantCalcule}`)).toEqual(["quantite:p1:a_deposer:84", "forfait:null:a_deposer:180"]);
    expect(r.totaux.parEtat.a_deposer).toBe(264);
  });
  it("ouvrage sans prix : exploitable en quantitatif, hors total, signalé (info) ; quantité non calculable signalée", () => {
    const r = evaluerEstimation({ ouvrages: [...ouvrages, { id: "B", etatTravaux: "nouveau" }],
      lignes: [...lignes(null), { ouvrageId: "B", pieceId: "p1", etatProjet: "nouveau", unite: "u", quantiteRetenue: 3 }],
      prix: [{ ouvrageId: PEI, donnees: prixGlobal(10) }] });
    expect(r.lignes.map((l) => [l.prixDefini, l.quantite, l.montantCalcule])).toEqual([[true, null, null], [false, 3, null]]);
    expect(r.anomalies.map((a) => `${a.ouvrageId}:${a.code}:${a.gravite}`)).toEqual(["PEI-MUR:quantite_non_calculable:avertissement", "B:prix_absent:info"]);
    expect(r.totaux).toMatchObject({ montant: 0, lignes: 2, lignesChiffrees: 0, lignesSansPrix: 1 });
  });
  it("correction : montant retenu, automatique conservé, écart ; obsolète si le calcul change ; orpheline", () => {
    const prix = [{ ouvrageId: PEI, donnees: prixGlobal(10) }];
    const aj = { id: "a1", ouvrageId: PEI, pieceId: "p1", etatProjet: "nouveau" as const, nature: "quantite" as const, valeurCalculee: 312.38, valeurRetenue: 300, raison: "Remise fournisseur connue", auteurId: "u1", date: "2026-09-30T10:00:00Z" };
    const r = evaluerEstimation({ ouvrages, lignes: lignes(31.238), prix, ajustements: [aj] });
    expect(r.lignes[0]).toMatchObject({ montantCalcule: 312.38, montantRetenu: 300, ajustement: { perime: false, raison: "Remise fournisseur connue", auteurId: "u1" } });
    expect(r.totaux).toMatchObject({ montant: 300, ecartAjustements: -12.38, lignesAjustees: 1 });
    const r2 = evaluerEstimation({ ouvrages, lignes: lignes(32), prix, ajustements: [aj] });
    expect(r2.lignes[0].ajustement?.perime).toBe(true);
    expect(r2.anomalies.map((a) => a.code)).toEqual(["estimation_obsolete"]);
    const r3 = evaluerEstimation({ ouvrages, lignes: lignes(31.238), prix, ajustements: [{ ...aj, pieceId: "zz" }] });
    expect(r3.anomalies.map((a) => a.code)).toEqual(["ajustement_orphelin"]);
  });
  it("prix invalide : ignoré (aucun montant), erreur signalée ; premier prix d'un ouvrage retenu", () => {
    const r = evaluerEstimation({ ouvrages, lignes: lignes(2), prix: [{ ouvrageId: PEI, donnees: { composantes: [{ type: "materiau", prixUnitaire: 1 }], tva: 20 } as never }, { ouvrageId: PEI, donnees: prixGlobal(10) }] });
    expect(r.lignes[0].montantCalcule).toBeNull();
    expect(r.anomalies[0]).toMatchObject({ code: "prix_invalide", detail: "cle", gravite: "erreur" });
  });
});

// ── Détail, agrégations, exports, contrat GP ──────────────────────────────────

const structure: MetreStructure = {
  chantiers: [{ id: "c1", nom: "Chantier A", ordre: 0, deletedAt: null }],
  batiments: [{ id: "b1", chantierId: "c1", nom: "Bât. 1", ordre: 0, deletedAt: null }],
  etages: [{ id: "e1", batimentId: "b1", nom: "RDC", niveau: 0, ordre: 0, deletedAt: null }],
  zones: [{ id: "z1", etageId: "e1", nom: "Logement", ordre: 0, deletedAt: null }],
  pieces: [{ id: "p1", etageId: "e1", zoneId: "z1", nom: "Séjour", ordre: 0, deletedAt: null }, { id: "p2", etageId: "e1", zoneId: null, nom: "Chambre", ordre: 1, deletedAt: null }],
};
const ouv = (id: string, extra: Partial<OuvrageRecord> = {}): OuvrageRecord => ({
  id, nom: id, code: id, categorie: "peinture", unite: "m2", regle: { source: "saisie", valeur: 1 }, pertePourcent: 0, arrondi: { mode: "aucun" }, etatTravaux: "nouveau", etats: ["nouveau"], ...extra,
});
function sourceDe(planId: string, ouvrages: OuvrageRecord[], lignes: { ouvrageId: string; pieceId: string | null; etatProjet: "existant" | "a_deposer" | "nouveau" | "deplace"; quantiteRetenue: number | null }[],
  prix: EstimationEntree["prix"], ajustements: EstimationEntree["ajustements"] = [], parametres: EstimationParametresDonnees = {}): EstimationSource {
  const qLignes = lignes.map((l) => ({ ...l, source: "saisie" as const, uniteSource: "m2" as const, unite: ouvrages.find((o) => o.id === l.ouvrageId)!.unite, elements: 1, nonCalculables: 0, base: l.quantiteRetenue,
    quantiteBrute: l.quantiteRetenue, quantiteAvecPerte: l.quantiteRetenue, quantiteCalculee: l.quantiteRetenue, ajustement: null, annotations: [] }));
  const quantitatif: PlanQuantitatif = { version: 1, planId, etageId: "e1", etat: "projete", numero: 2, ouvrages, moteur: "quantitatif-v1", lignes: qLignes, anomalies: [] };
  // Comme le serveur (1402) : coefficients résolus, puis moteur ; prix enrichis du coefficient appliqué et de sa provenance.
  const { prixEffectifs: eff, ...e } = evaluerEstimationAvecParametres({ ouvrages, lignes: qLignes, prix, ajustements }, parametres);
  const estimation: PlanEstimation = { version: 1, planId, etageId: "e1", etat: "projete", numero: 2, base: "HT", devise: "EUR", ...e,
    parametres: { ...PARAMETRES_VIDES, donnees: parametres, revision: Object.keys(parametres).length ? 1 : 0 },
    prix: (prix ?? []).map((p, i) => ({ ...p, origine: "saisie", bibliothequeId: null, revision: 1, updatedAt: null, updatedBy: null,
      coefficientApplique: eff[i].coefficientApplique, coefficientSource: eff[i].coefficientSource })) };
  return { etageId: "e1", planId, numero: 2, etat: "projete", figeLe: null, libelle: `Solution ${planId}`, quantitatif, estimation };
}

describe("sous-totaux, total chantier, dépose / neuf / déplacement, exports, contrat GP", () => {
  const ouvrages = [ouv("PEI", { lot: "Peinture" }), ouv("DEM", { categorie: "demolition", lot: "Démolition – dépose", etatTravaux: "a_deposer", unite: "u" }), ouv("RAD", { categorie: "cvc", unite: "u", lot: "CVC" }), ouv("SANS", { lot: "Peinture" })];
  const src = sourceDe("pA", ouvrages, [
    { ouvrageId: "PEI", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 31.238 },
    { ouvrageId: "PEI", pieceId: "p2", etatProjet: "nouveau", quantiteRetenue: 20 },
    { ouvrageId: "DEM", pieceId: "p1", etatProjet: "a_deposer", quantiteRetenue: 2 },
    { ouvrageId: "RAD", pieceId: "p2", etatProjet: "deplace", quantiteRetenue: 1 },
    { ouvrageId: "SANS", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 5 },
  ], [
    { ouvrageId: "PEI", donnees: { composantes: [{ type: "materiau", prixUnitaire: 3.5 }, { type: "main_d_oeuvre", heuresParUnite: 0.25, tauxHoraire: 45 }] } },
    { ouvrageId: "DEM", donnees: { composantes: [{ type: "autre", prixUnitaire: 35 }, { type: "forfait", montant: 150 }] } },
    { ouvrageId: "RAD", donnees: { composantes: [{ type: "main_d_oeuvre", heuresParUnite: 2, tauxHoraire: 50 }] } },
  ]);
  const details = estimationDetails(structure, [src]);
  it("total ligne, sous-total lot, total chantier : sommes EXACTES de lignes", () => {
    // PEI : 31,238 × 14,75 = 460,76 (109,33 + 351,43) ; 20 × 14,75 = 295,00 ; DEM : 70 + forfait 150 ; RAD : 100.
    expect(details.map((d) => `${d.ouvrage.code}:${d.piece?.nom ?? "étage"}:${centimesText(d.retenuCentimes ?? B(-1))}`)).toEqual([
      "PEI:Séjour:460.76", "PEI:Chambre:295.00", "DEM:Séjour:70.00", "DEM:étage:150.00", "RAD:Chambre:100.00", "SANS:Séjour:-0.01",
    ]);
    const total = totalEstimation(details);
    expect(centimesText(total.montant)).toBe("1075.76");
    expect(total.sansPrix).toBe(1);
    const lots = agregerEstimation(details, "lot");
    expect(lots.map((g) => `${g.libelle}=${centimesText(g.total.montant)}`)).toEqual(["Peinture=755.76", "Démolition – dépose=220.00", "CVC=100.00"]);
    expect(lots.reduce((s, g) => s + g.total.montant, B(0))).toBe(total.montant);
    for (const niveau of ["chantier", "batiment", "etage", "zone", "piece", "lot", "ouvrage"] as const) {
      expect(agregerEstimation(details, niveau).reduce((s, g) => s + g.total.montant, B(0)), niveau).toBe(total.montant);
    }
    expect(formatHeures(total.heures)).toBe("14,81 h");
  });
  it("coût dépose, neuf, déplacement, total projet", () => {
    const c = syntheseCouts(totalEstimation(details));
    expect([c.depose, c.neuf, c.deplacement, c.existant, c.total].map(centimesText)).toEqual(["220.00", "755.76", "100.00", "0.00", "1075.76"]);
  });
  it("multi-scénario : solution A / solution B (écart par lot, par état, total)", () => {
    const b = estimationDetails(structure, [sourceDe("pB", ouvrages, [{ ouvrageId: "PEI", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 31.238 }], [{ ouvrageId: "PEI", donnees: prixGlobal(20) }])]);
    const cmp = comparerEstimations(details, b);
    expect(centimesText(cmp.total.a)).toBe("1075.76");
    expect(centimesText(cmp.total.b)).toBe("624.76");
    expect(centimesText(cmp.total.ecart)).toBe("-451.00");
    expect(cmp.parLot.find((l) => l.cle === "Peinture")).toMatchObject({ a: B(75576), b: B(62476) });
  });
  it("CSV Excel FR : BOM, `;`, montants HT exacts, ligne de total", () => {
    const csv = estimationToCsv(details);
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).trim().split("\r\n");
    expect(rows[0]).toBe(ESTIMATION_CSV_COLUMNS.join(";"));
    expect(rows[1]).toBe("Chantier A;Bât. 1;RDC;Logement;Séjour;Peinture;Peinture;PEI;PEI;Quantité;Nouveau;m²;31,238;14,75;109,33;351,43;0,00;0,00;7,810;460,76;460,76;non;;;1;aucun;;");
    expect(rows.at(-1)).toContain("Total chantier HT (estimation)");
    expect(rows.at(-1)).toContain(";1075,76;");
  });
  it("contrat GP estimation 1.1.0 : quantitatif 1.0.0 imbriqué SANS prix, prix structurés, HT, aucun devis, idempotent", () => {
    const payload = buildEstimationGpPayload({ releveId: "r1", etat: "projete", structure, sources: [src], details,
      photos: [{ ref: "m1", storagePath: "t/r1/photos/m1.jpg", mimeType: "image/jpeg", legende: "Mur humide", pieceRef: "p1", etatDocumente: "initial", priseLe: null }],
      annotations: [{ ref: "a1", texte: "Fissure", forme: "texte", pieceRef: "p1", cible: null }] });
    expect(payload.contract).toEqual(ESTIMATION_GP_CONTRACT);
    expect(payload.readiness.devis).toBe("not-generated");
    expect(payload.montants).toEqual({ devise: "EUR", base: "HT", nature: "estimative" });
    expect(validateEstimationGpPayload(payload)).toEqual([]);
    expect(validateQuantitatifGpPayload(payload.quantitatif)).toEqual([]);
    expect(payload.totaux.total).toBe("1075.76");
    expect(payload.etatsProjetes).toEqual({ depose: "220.00", neuf: "755.76", deplacement: "100.00", existant: "0.00", total: "1075.76" });
    expect(payload.prix.find((p) => p.ouvrageRef === "PEI")).toMatchObject({ prixUnitaire: "14.75", composantes: [{ type: "materiau", prixUnitaire: "3.5" }, { type: "main_d_oeuvre", heuresParUnite: "0.25", tauxHoraire: "45" }] });
    expect(payload.lignes[0]).toMatchObject({ quantite: "31.238", montantRetenu: "460.76", quantiteRef: payload.quantitatif.lignes[0].ref });
    expect(payload.pieces.map((p) => p.nom)).toEqual(["Séjour", "Chambre"]);
    expect(payload.photos).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(/"[^"]*(numeroDevis|facture|commande|signature|marge|remise|tva|ttc|prixVente)[^"]*"\s*:/i);
    expect(buildEstimationGpPayload({ releveId: "r1", etat: "projete", structure, sources: [src], details }).idempotencyKey).toBe(payload.idempotencyKey);
    const corrige = estimationDetails(structure, [sourceDe("pA", ouvrages, [{ ouvrageId: "PEI", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 31.238 }], [{ ouvrageId: "PEI", donnees: prixGlobal(20) }])]);
    expect(buildEstimationGpPayload({ releveId: "r1", etat: "projete", structure, sources: [src], details: corrige }).idempotencyKey).not.toBe(payload.idempotencyKey);
    expect(validateEstimationGpPayload({ ...payload, numeroDevis: "D-2026-001" })[0]).toMatch(/donnée commerciale interdite/);
    expect(validateEstimationGpPayload({ ...payload, totaux: { ...payload.totaux, tauxTva: "20" } })[0]).toMatch(/donnée commerciale interdite/);
    expect(validateEstimationGpPayload({ ...payload, contract: { name: ESTIMATION_GP_CONTRACT.name, version: "2.0.0" } })).toContain("version de contrat non prise en charge");
    expect(validateEstimationGpPayload({ ...payload, lignes: [{ ...payload.lignes[0], montantRetenu: 460.76 }] })[0]).toMatch(/montant non décimal/);
  });
  it("JSON serveur normalisé (numeric éventuellement en chaîne)", () => {
    const parsed = planEstimationFromJson({ ...src.estimation, numero: "2", lignes: [{ ...src.estimation.lignes[0], montantRetenu: "460.76" }], totaux: { ...src.estimation.totaux, montant: "1075.76" } });
    expect(parsed.lignes[0].montantRetenu).toBe(460.76);
    expect(parsed.totaux.montant).toBe(1075.76);
  });
});

// ── Performance : 100 / 1 000 / 5 000 lignes ──────────────────────────────────

describe("performance (Vitest, sans réseau) : calcul, édition de prix, recalcul, agrégation, export", () => {
  it.each([100, 1000, 5000])("%i lignes", (n) => {
    const nOuvrages = Math.max(1, Math.round(n / 5));
    const ouvrages = Array.from({ length: nOuvrages }, (_, i) => ouv(`O${String(i).padStart(5, "0")}`, { lot: `Lot ${i % 12}` }));
    const lignes = Array.from({ length: n }, (_, i) => ({ ouvrageId: ouvrages[i % nOuvrages].id, pieceId: `p${i}`, etatProjet: (["existant", "a_deposer", "nouveau", "deplace"] as const)[i % 4], quantiteRetenue: 1 + (i % 97) / 8 }));
    const prix = ouvrages.map((o, i) => ({ ouvrageId: o.id, donnees: { composantes: [{ type: "materiau" as const, prixUnitaire: 2 + (i % 9) }, { type: "main_d_oeuvre" as const, heuresParUnite: 0.2, tauxHoraire: 42 }] } }));
    const pieces = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, etageId: "e1", zoneId: null, nom: `Pièce ${i}`, ordre: i, deletedAt: null }));
    const st: MetreStructure = { ...structure, pieces };
    const t0 = performance.now();
    const src = sourceDe("pP", ouvrages, lignes, prix);
    const t1 = performance.now();
    const edited = [{ ...prix[0], donnees: prixGlobal(99) }, ...prix.slice(1)];
    const src2 = sourceDe("pP", ouvrages, lignes, edited);
    const t2 = performance.now();
    const details = estimationDetails(st, [src2]);
    const lots = agregerEstimation(details, "lot");
    const t3 = performance.now();
    const csv = estimationToCsv(details);
    const gp = buildEstimationGpPayload({ releveId: "r", etat: "projete", structure: st, sources: [src2], details });
    const t4 = performance.now();
    expect(src.estimation.lignes).toHaveLength(n);
    expect(lots.reduce((s, g) => s + g.total.montant, B(0))).toBe(totalEstimation(details).montant);
    expect(csv.split("\r\n").length).toBe(n + 3);
    expect(gp.lignes).toHaveLength(n);
    console.info(`[perf estimation ${n} lignes] calcul ${Math.round(t1 - t0)} ms · édition prix + recalcul ${Math.round(t2 - t1)} ms · détail + sous-totaux ${Math.round(t3 - t2)} ms · export CSV + GP ${Math.round(t4 - t3)} ms`);
    expect(t4 - t0).toBeLessThan(20_000);
  });
});
