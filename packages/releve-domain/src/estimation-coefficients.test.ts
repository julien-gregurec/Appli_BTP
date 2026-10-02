/**
 * Lot 10 (complément, migration 20261002001115) : coefficients facultatifs (ouvrage > lot > général, sans cumul),
 * hypothèses, valeur source et obsolescence d'une correction sur changement de QUANTITÉ, estimation séparée par état,
 * contrat Gestion Pro `elsatia.tools.estimation` 1.1.0, calculs décimaux exacts et grands volumes.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MetreStructure } from "./metre";
import {
  agregerEstimation, buildEstimationGpPayload, centimesText, COEFFICIENT_PRIORITE, ESTIMATION_CSV_COLUMNS, ESTIMATION_GP_CONTRACT, estimationAnomalieMessage,
  estimationDetails, estimationToCsv, evaluerEstimation, evaluerEstimationAvecParametres, filtrerParEtats, lotsDesOuvrages, PARAMETRES_ISSUE_MESSAGES,
  parametresAnomalie, planEstimationFromJson, prixEffectifs, syntheseCouts, totalEstimation, validateEstimationGpPayload,
  type EstimationEntree, type EstimationParametresDonnees, type EstimationSource, type PlanEstimation,
} from "./estimation";
import { OUVRAGE_LOT_PAR_CATEGORIE, ouvrageLot, type OuvrageRecord, type PlanQuantitatif } from "./quantitatif";

const B = (value: number | string) => BigInt(value);
const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261002001115_tools_releve_metre_estimation_coefficients_v1.sql", import.meta.url)), "utf8");
type Cas = { entree: EstimationEntree & { parametres: EstimationParametresDonnees | null; ouvrages: (Pick<OuvrageRecord, "id" | "etatTravaux" | "categorie"> & { lot?: string })[] }; attendu: { prixEffectifs: unknown; resultat: unknown } };
const parite = JSON.parse(readFileSync(fileURLToPath(new URL("./estimation-parite-coefficients.fixture.json", import.meta.url)), "utf8")) as { cas: Cas[] };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("parité domaine ↔ migration 20261002001115", () => {
  it(`P2. coefficients + obsolescence sur quantité : le miroir reproduit EXACTEMENT le serveur (${parite.cas.length} cas, jeu vérifié aussi par pgTAP)`, () => {
    expect(parite.cas.length).toBeGreaterThanOrEqual(40);
    for (const cas of parite.cas) {
      const { prixEffectifs: eff, ...resultat } = evaluerEstimationAvecParametres(cas.entree, cas.entree.parametres);
      expect(json(eff)).toEqual(cas.attendu.prixEffectifs);
      expect(json(resultat)).toEqual(cas.attendu.resultat);
    }
  });
  const extra = process.env.ESTIMATION_COEF_PARITE_EXTRA;
  it.runIf(!!extra && existsSync(extra))("P2 étendu : jeu supplémentaire (ESTIMATION_COEF_PARITE_EXTRA)", () => {
    const big = JSON.parse(readFileSync(extra as string, "utf8")) as { cas: Cas[] };
    for (const cas of big.cas) {
      const { prixEffectifs: eff, ...resultat } = evaluerEstimationAvecParametres(cas.entree, cas.entree.parametres);
      expect(json(eff)).toEqual(cas.attendu.prixEffectifs);
      expect(json(resultat)).toEqual(cas.attendu.resultat);
    }
  });
  it("lot par catégorie : table SQL identique à OUVRAGE_LOT_PAR_CATEGORIE (19 catégories)", () => {
    const pairs = [...sql.matchAll(/when '([a-z_]+)' then '([^']+)'/g)].map((m) => [m[1], m[2]] as const).filter(([k]) => k in OUVRAGE_LOT_PAR_CATEGORIE);
    expect(Object.fromEntries(pairs)).toEqual(OUVRAGE_LOT_PAR_CATEGORIE);
  });
  it("messages des paramètres et d'obsolescence identiques au SQL", () => {
    for (const message of Object.values(PARAMETRES_ISSUE_MESSAGES)) expect(sql).toContain(message.replace(/'/g, "''"));
    expect(sql).toContain(estimationAnomalieMessage("estimation_obsolete", "quantite_modifiee").replace(/'/g, "''"));
    expect(sql).toContain(estimationAnomalieMessage("estimation_obsolete", "ajustement_perime").replace(/'/g, "''"));
  });
});

describe("contrat des paramètres : coefficient général, coefficients par lot, hypothèses — rien de commercial", () => {
  it.each([
    [{}, null], [{ coefficientGeneral: 1.1 }, null], [{ coefficientsLots: { Peinture: 1.2, "Lot A": 0.95 } }, null], [{ hypotheses: "Site occupé" }, null],
    [{ coefficientGeneral: null, coefficientsLots: null, hypotheses: null }, null],
    [[], "invalide"], [null, "invalide"],
    [{ marge: 10 }, "cle"], [{ remise: 5 }, "cle"], [{ tva: 20 }, "cle"], [{ acompte: 30 }, "cle"], [{ conditionsCommerciales: "30 j" }, "cle"], [{ numeroDevis: "D-1" }, "cle"],
    [{ coefficientGeneral: 0 }, "coefficient_general"], [{ coefficientGeneral: 10.00001 }, "coefficient_general"], [{ coefficientGeneral: "1.1" }, "coefficient_general"],
    [{ coefficientsLots: [] }, "coefficients_lots"], [{ coefficientsLots: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`L${i}`, 1])) }, "coefficients_lots"],
    [{ coefficientsLots: { " Peinture": 1.2 } }, "lot"], [{ coefficientsLots: { "": 1.2 } }, "lot"], [{ coefficientsLots: { ["x".repeat(81)]: 1 } }, "lot"],
    [{ coefficientsLots: { Peinture: 11 } }, "coefficient_lot"], [{ coefficientsLots: { Peinture: null } }, "coefficient_lot"],
    [{ hypotheses: "x".repeat(2001) }, "hypotheses"], [{ hypotheses: 12 }, "hypotheses"],
  ])("%j → %s", (input, code) => expect(parametresAnomalie(input)).toBe(code));
});

describe("priorité des coefficients : ouvrage > lot > général, jamais cumulés", () => {
  const ouvrages = [
    { id: "PEI", categorie: "peinture" as const }, { id: "CLO", categorie: "cloisons" as const }, { id: "SOL", categorie: "sols" as const, lot: " Peinture\t" },
    { id: "RAD", categorie: "cvc" as const },
  ];
  const p = (coefficient?: number | null) => ({ composantes: [{ type: "materiau" as const, prixUnitaire: 10 }], ...(coefficient !== undefined ? { coefficient } : {}) });
  const parametres = { coefficientGeneral: 1.05, coefficientsLots: { Peinture: 1.2, "Plâtrerie – cloisons": 1.3 } };
  it("le plus précis l'emporte", () => {
    const eff = prixEffectifs(ouvrages, [
      { ouvrageId: "PEI", donnees: p(0.9) }, { ouvrageId: "CLO", donnees: p() }, { ouvrageId: "SOL", donnees: p() }, { ouvrageId: "RAD", donnees: p() },
    ], parametres);
    expect(eff.map((e) => `${e.ouvrageId}:${e.coefficientSource}:${e.coefficientApplique}`)).toEqual(["PEI:ouvrage:0.9", "CLO:lot:1.3", "SOL:lot:1.2", "RAD:general:1.05"]);
    expect(eff[1].donnees.coefficient).toBe(1.3);
  });
  it("coefficient 1 saisi sur l'ouvrage : il prime (neutralise lot et général) ; coefficient nul = hérité", () => {
    const eff = prixEffectifs(ouvrages, [{ ouvrageId: "PEI", donnees: p(1) }, { ouvrageId: "CLO", donnees: p(null) }], parametres);
    expect(eff.map((e) => `${e.coefficientSource}:${e.coefficientApplique}`)).toEqual(["ouvrage:1", "lot:1.3"]);
  });
  it("sans paramètres : coefficient 1, provenance « aucun » ; paramètres invalides ignorés ; prix invalide transmis tel quel", () => {
    expect(prixEffectifs(ouvrages, [{ ouvrageId: "PEI", donnees: p() }], null)[0]).toMatchObject({ coefficientApplique: 1, coefficientSource: "aucun" });
    expect(prixEffectifs(ouvrages, [{ ouvrageId: "PEI", donnees: p() }], { coefficientGeneral: 2, marge: 3 } as never)[0]).toMatchObject({ coefficientSource: "aucun" });
    const invalide = { composantes: [{ type: "materiau" as const, prixUnitaire: 1 }], tva: 20 } as never;
    expect(prixEffectifs(ouvrages, [{ ouvrageId: "PEI", donnees: invalide }], parametres)[0]).toEqual({ ouvrageId: "PEI", donnees: invalide, coefficientApplique: null, coefficientSource: null });
  });
  it("aucun cumul : 10 € × 2 m² avec général 1,05 et lot 1,2 = 24,00 € (pas 25,20 €)", () => {
    const r = evaluerEstimationAvecParametres({ ouvrages: [{ id: "PEI", categorie: "peinture", etatTravaux: "nouveau" }],
      lignes: [{ ouvrageId: "PEI", pieceId: "p1", etatProjet: "nouveau", unite: "m2", quantiteRetenue: 2 }], prix: [{ ouvrageId: "PEI", donnees: p() }] }, parametres);
    expect(r.lignes[0].montantCalcule).toBe(24);
    expect(r.lignes[0].prixUnitaire).toBe(12);
  });
  it("le lot suit la saisie de l'ouvrage (blancs retirés comme le SQL) ou sa catégorie ; lots proposés à l'écran", () => {
    expect(ouvrageLot({ lot: " Lot A　", categorie: "autre" })).toBe("Lot A");
    expect(lotsDesOuvrages([{ categorie: "peinture" }, { categorie: "sols", lot: "Peinture" }, { categorie: "cvc" }])).toEqual(["Peinture", "CVC"]);
    expect(COEFFICIENT_PRIORITE).toEqual(["ouvrage", "lot", "general"]);
  });
});

describe("traçabilité : valeur source, override motivé, obsolescence sur QUANTITÉ", () => {
  const ouvrages = [{ id: "PLI", categorie: "plinthes" as const, etatTravaux: "nouveau" as const }, { id: "SANS", categorie: "autre" as const, etatTravaux: "nouveau" as const }];
  const ligne = (ouvrageId: string, q: number | null) => ({ ouvrageId, pieceId: "p1", etatProjet: "nouveau" as const, unite: "ml" as const, quantiteRetenue: q });
  const aj = (ouvrageId: string, extra: Record<string, unknown>) => ({ id: `a-${ouvrageId}`, ouvrageId, pieceId: "p1", etatProjet: "nouveau" as const, nature: "quantite" as const,
    valeurCalculee: null as number | null, valeurRetenue: 100, raison: "Mesure contradictoire", auteurId: "u1", date: "2026-10-02T08:00:00Z", ...extra });
  it("quantité inchangée : correction active, non obsolète ; valeur source conservée", () => {
    const r = evaluerEstimation({ ouvrages, lignes: [ligne("PLI", 12.915)], prix: [{ ouvrageId: "PLI", donnees: { composantes: [{ type: "materiau", prixUnitaire: 8.9 }] } }],
      ajustements: [aj("PLI", { valeurCalculee: 114.94, quantiteSource: 12.915 })] });
    expect(r.lignes[0]).toMatchObject({ montantCalcule: 114.94, montantRetenu: 100, ajustement: { perime: false, quantiteSource: 12.915, motifPerime: null, raison: "Mesure contradictoire", auteurId: "u1" } });
    expect(r.anomalies.filter((a) => a.code === "estimation_obsolete")).toHaveLength(0);
  });
  it("quantité modifiée : obsolète (motif quantité), le montant retenu n'est JAMAIS remplacé en silence", () => {
    const r = evaluerEstimation({ ouvrages, lignes: [ligne("PLI", 13.5)], prix: [{ ouvrageId: "PLI", donnees: { composantes: [{ type: "materiau", prixUnitaire: 8.9 }] } }],
      ajustements: [aj("PLI", { valeurCalculee: 114.94, quantiteSource: 12.915 })] });
    expect(r.lignes[0]).toMatchObject({ montantCalcule: 120.15, montantRetenu: 100, ajustement: { perime: true, motifPerime: "quantite" } });
    expect(r.anomalies.find((a) => a.code === "estimation_obsolete")).toMatchObject({ detail: "quantite_modifiee", message: "Estimation obsolète : la quantité a changé depuis la correction, montant retenu à revoir." });
  });
  it("ouvrage SANS prix : montant automatique inchangé (0) mais quantité changée → obsolète quand même", () => {
    const r = evaluerEstimation({ ouvrages, lignes: [ligne("SANS", 7)], ajustements: [aj("SANS", { valeurCalculee: null, quantiteSource: 5 })] });
    expect(r.lignes[0].ajustement).toMatchObject({ perime: true, motifPerime: "quantite" });
    const avant1402 = evaluerEstimation({ ouvrages, lignes: [ligne("SANS", 7)], ajustements: [aj("SANS", { valeurCalculee: null })] });
    expect(avant1402.lignes[0].ajustement?.perime).toBe(false);
    expect(avant1402.lignes[0].ajustement).not.toHaveProperty("motifPerime");
  });
  it("montant automatique modifié (prix ou coefficient) à quantité égale : obsolète, motif montant", () => {
    const r = evaluerEstimationAvecParametres({ ouvrages: [{ ...ouvrages[0] }], lignes: [ligne("PLI", 12.915)],
      prix: [{ ouvrageId: "PLI", donnees: { composantes: [{ type: "materiau", prixUnitaire: 8.9 }] } }], ajustements: [aj("PLI", { valeurCalculee: 114.94, quantiteSource: 12.915 })] },
    { coefficientGeneral: 1.1 });
    expect(r.lignes[0]).toMatchObject({ montantCalcule: 126.44, montantRetenu: 100, ajustement: { perime: true, motifPerime: "montant" } });
  });
  it("ligne devenue non calculable : obsolète (quantité source 12,915 → aucune)", () => {
    const r = evaluerEstimation({ ouvrages, lignes: [ligne("PLI", null)], prix: [{ ouvrageId: "PLI", donnees: { composantes: [{ type: "materiau", prixUnitaire: 8.9 }] } }],
      ajustements: [aj("PLI", { valeurCalculee: 114.94, quantiteSource: 12.915 })] });
    expect(r.lignes[0].ajustement).toMatchObject({ perime: true, motifPerime: "quantite" });
  });
});

describe("calculs décimaux EXACTS (entiers, arrondi moitié loin de zéro au centime)", () => {
  const o = [{ id: "X", categorie: "autre" as const, etatTravaux: "nouveau" as const }];
  const run = (q: number, pu: number, coefficient?: number) => evaluerEstimation({ ouvrages: o, lignes: [{ ouvrageId: "X", pieceId: null, etatProjet: "nouveau", unite: "u", quantiteRetenue: q }],
    prix: [{ ouvrageId: "X", donnees: { composantes: [{ type: "materiau", prixUnitaire: pu }], ...(coefficient ? { coefficient } : {}) } }] }).lignes[0].montantCalcule;
  it("1 × 1,005 € = 1,01 € (le flottant donnerait 1,00 €)", () => { expect(Math.round(1.005 * 100) / 100).toBe(1); expect(run(1, 1.005)).toBe(1.01); });
  it("0,333 × 0,3333 € × 1,0001 = 0,11 € ; 2,675 × 1 = 2,68 €", () => { expect(run(0.333, 0.3333, 1.0001)).toBe(0.11); expect(run(2.675, 1)).toBe(2.68); });
  it("très grands montants exacts : 90 000 × 1 000 000 € × 10 = 900 000 000 000,00 €", () => {
    const r = evaluerEstimation({ ouvrages: o, lignes: [{ ouvrageId: "X", pieceId: null, etatProjet: "nouveau", unite: "u", quantiteRetenue: 90000 }],
      prix: [{ ouvrageId: "X", donnees: { composantes: [{ type: "materiau", prixUnitaire: 1000000 }], coefficient: 10 } }] });
    expect(r.totaux.montant).toBe(900000000000);
  });
  it("10 lignes à 0,10 € : total 1,00 € exactement (sommes de centimes)", () => {
    const r = evaluerEstimation({ ouvrages: o, lignes: Array.from({ length: 10 }, (_, i) => ({ ouvrageId: "X", pieceId: `p${i}`, etatProjet: "nouveau" as const, unite: "u" as const, quantiteRetenue: 1 })),
      prix: [{ ouvrageId: "X", donnees: { composantes: [{ type: "materiau", prixUnitaire: 0.1 }] } }] });
    expect(r.totaux.montant).toBe(1);
  });
});

// ── Sources de test (comme le serveur : coefficients résolus, puis moteur) ────

const structure: MetreStructure = {
  chantiers: [{ id: "c1", nom: "Chantier A", ordre: 0, deletedAt: null }],
  batiments: [{ id: "b1", chantierId: "c1", nom: "Bât. 1", ordre: 0, deletedAt: null }],
  etages: [{ id: "e1", batimentId: "b1", nom: "RDC", niveau: 0, ordre: 0, deletedAt: null }],
  zones: [],
  pieces: [{ id: "p1", etageId: "e1", zoneId: null, nom: "Séjour", ordre: 0, deletedAt: null }, { id: "p2", etageId: "e1", zoneId: null, nom: "Chambre", ordre: 1, deletedAt: null }],
};
const ouv = (id: string, extra: Partial<OuvrageRecord> = {}): OuvrageRecord => ({
  id, nom: id, code: id, categorie: "peinture", unite: "m2", regle: { source: "saisie", valeur: 1 }, pertePourcent: 0, arrondi: { mode: "aucun" }, etatTravaux: "nouveau", etats: ["nouveau"], ...extra,
});
type L = { ouvrageId: string; pieceId: string | null; etatProjet: "existant" | "a_deposer" | "nouveau" | "deplace"; quantiteRetenue: number | null };
function source(planId: string, ouvrages: OuvrageRecord[], lignes: L[], prix: NonNullable<EstimationEntree["prix"]>, parametres: EstimationParametresDonnees,
  ajustements: EstimationEntree["ajustements"] = []): EstimationSource {
  const qLignes = lignes.map((l) => ({ ...l, source: "saisie" as const, uniteSource: "m2" as const, unite: ouvrages.find((o) => o.id === l.ouvrageId)!.unite, elements: 1, nonCalculables: 0, base: l.quantiteRetenue,
    quantiteBrute: l.quantiteRetenue, quantiteAvecPerte: l.quantiteRetenue, quantiteCalculee: l.quantiteRetenue, ajustement: null, annotations: [] }));
  const quantitatif: PlanQuantitatif = { version: 1, planId, etageId: "e1", etat: "projete", numero: 2, ouvrages, moteur: "quantitatif-v1", lignes: qLignes, anomalies: [] };
  const { prixEffectifs: eff, ...e } = evaluerEstimationAvecParametres({ ouvrages, lignes: qLignes, prix, ajustements }, parametres);
  const estimation: PlanEstimation = { version: 1, planId, etageId: "e1", etat: "projete", numero: 2, base: "HT", devise: "EUR", ...e,
    parametres: { donnees: parametres, revision: 3, updatedAt: "2026-10-02T08:00:00Z", updatedBy: "u1", priorite: [...COEFFICIENT_PRIORITE] },
    prix: prix.map((p, i) => ({ ...p, origine: "saisie" as const, bibliothequeId: null, revision: 1, updatedAt: null, updatedBy: null,
      coefficientApplique: eff[i].coefficientApplique, coefficientSource: eff[i].coefficientSource })) };
  return { etageId: "e1", planId, numero: 2, etat: "projete", figeLe: null, libelle: null, quantitatif, estimation };
}

describe("estimation séparée : travaux à créer / déposer / déplacer, sous-totaux", () => {
  const ouvrages = [ouv("PEI", { lot: "Peinture" }), ouv("DEM", { categorie: "demolition", etatTravaux: "a_deposer", unite: "u" }), ouv("RAD", { categorie: "cvc", unite: "u" }), ouv("EXI", { categorie: "portes", unite: "u", etatTravaux: "existant" })];
  const src = source("pA", ouvrages, [
    { ouvrageId: "PEI", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 20 }, { ouvrageId: "DEM", pieceId: "p1", etatProjet: "a_deposer", quantiteRetenue: 2 },
    { ouvrageId: "RAD", pieceId: "p2", etatProjet: "deplace", quantiteRetenue: 1 }, { ouvrageId: "EXI", pieceId: "p2", etatProjet: "existant", quantiteRetenue: 3 },
  ], [
    { ouvrageId: "PEI", donnees: { composantes: [{ type: "materiau", prixUnitaire: 10 }] } }, { ouvrageId: "DEM", donnees: { composantes: [{ type: "autre", prixUnitaire: 35 }] } },
    { ouvrageId: "RAD", donnees: { composantes: [{ type: "main_d_oeuvre", heuresParUnite: 2, tauxHoraire: 50 }] } }, { ouvrageId: "EXI", donnees: { composantes: [{ type: "autre", prixUnitaire: 5 }] } },
  ], { coefficientGeneral: 1.1, coefficientsLots: { Peinture: 1.2 } });
  const details = estimationDetails(structure, [src]);
  it("par état : créer 240,00 (PEI × lot 1,2) · déposer 77,00 · déplacer 110,00 · existant 16,50 (général 1,1)", () => {
    const c = syntheseCouts(totalEstimation(details));
    expect([c.neuf, c.depose, c.deplacement, c.existant, c.total].map(centimesText)).toEqual(["240.00", "77.00", "110.00", "16.50", "443.50"]);
  });
  it("filtre : seuls les travaux à créer / déposer / déplacer (existant exclu) ; tous les états = tout", () => {
    const travaux = filtrerParEtats(details, ["nouveau", "a_deposer", "deplace"]);
    expect(centimesText(totalEstimation(travaux).montant)).toBe("427.00");
    expect(filtrerParEtats(details, [])).toHaveLength(details.length);
    expect(filtrerParEtats(details, ["a_deposer"]).map((d) => d.ouvrage.id)).toEqual(["DEM"]);
  });
  it("sous-totaux à tous les niveaux : somme exacte = total général", () => {
    const total = totalEstimation(details).montant;
    for (const niveau of ["chantier", "batiment", "etage", "zone", "piece", "lot", "ouvrage"] as const) {
      expect(agregerEstimation(details, niveau).reduce((s, g) => s + g.total.montant, B(0)), niveau).toBe(total);
    }
  });
  it("CSV : coefficient appliqué et sa provenance, colonnes de traçabilité", () => {
    const rows = estimationToCsv(details).slice(1).trim().split("\r\n");
    expect(rows[0]).toBe(ESTIMATION_CSV_COLUMNS.join(";"));
    expect(rows[1].split(";").slice(-4)).toEqual(["1,2", "lot", "", ""]);
    expect(rows[4].split(";").slice(-4)).toEqual(["1,1", "général", "", ""]);
  });
});

describe("contrat Gestion Pro 1.1.0 : ouvrages, quantités, prix simplifiés, hypothèses / coefficients, métadonnées de source", () => {
  const ouvrages = [ouv("PEI", { lot: "Peinture" }), ouv("PLI", { categorie: "plinthes", unite: "ml" })];
  const lignes: L[] = [{ ouvrageId: "PEI", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 20 }, { ouvrageId: "PLI", pieceId: "p1", etatProjet: "nouveau", quantiteRetenue: 13.5 }];
  const prix = [{ ouvrageId: "PEI", donnees: { composantes: [{ type: "materiau" as const, prixUnitaire: 10 }] } }, { ouvrageId: "PLI", donnees: { composantes: [{ type: "materiau" as const, prixUnitaire: 8.9 }], coefficient: 1 } }];
  const parametres = { coefficientGeneral: 1.05, coefficientsLots: { Peinture: 1.2 }, hypotheses: "Site occupé, accès par escalier" };
  const ajustements = [{ id: "a1", ouvrageId: "PLI", pieceId: "p1", etatProjet: "nouveau" as const, nature: "quantite" as const, valeurCalculee: 114.94, valeurRetenue: 100,
    raison: "Mesure contradictoire", auteurId: "u1", date: "2026-10-02T08:00:00Z", quantiteSource: 12.915 }];
  const src = source("pA", ouvrages, lignes, prix, parametres, ajustements);
  const details = estimationDetails(structure, [src]);
  const payload = buildEstimationGpPayload({ releveId: "r1", etat: "projete", structure, sources: [src], details, exporteLe: "2026-10-02T09:00:00.000Z" });
  it("version 1.1.0, recevable, aucun devis, Gestion Pro libre de rechiffrer", () => {
    expect(payload.contract).toEqual({ name: "elsatia.tools.estimation", version: "1.1.0" });
    expect(ESTIMATION_GP_CONTRACT.version).toBe("1.1.0");
    expect(validateEstimationGpPayload(payload)).toEqual([]);
    expect(payload.readiness.devis).toBe("not-generated");
    expect(payload.perimetre.gestionProLibreDeRechiffrer).toBe(true);
    expect(payload.source).toMatchObject({ application: "elsatia-tools", module: "releve-metre", exporteLe: "2026-10-02T09:00:00.000Z", releveId: "r1" });
  });
  it("hypothèses et coefficients par plan, règle de priorité explicite", () => {
    expect(payload.hypotheses.priorite).toEqual(["ouvrage", "lot", "general"]);
    expect(payload.hypotheses.plans).toEqual([{ planRef: "pA", coefficientGeneral: "1.05", coefficientsLots: [{ lot: "Peinture", coefficient: "1.2" }],
      texte: "Site occupé, accès par escalier", revision: 3, modifieLe: "2026-10-02T08:00:00Z", modifiePar: "u1" }]);
  });
  it("prix simplifiés : coefficient appliqué, saisi, provenance ; PU avec coefficient", () => {
    expect(payload.prix.map((p) => [p.ouvrageRef, p.coefficient, p.coefficientSaisi, p.coefficientSource, p.prixUnitaire])).toEqual([
      ["PEI", "1.2", null, "lot", "12"], ["PLI", "1", "1", "ouvrage", "8.9"]]);
  });
  it("correction : valeur source, obsolescence (quantité 12,915 → 13,5), montant retenu conservé", () => {
    const l = payload.lignes.find((x) => x.ouvrageRef === "PLI");
    expect(l).toMatchObject({ quantite: "13.500", montantCalcule: "120.15", montantRetenu: "100.00",
      correction: { raison: "Mesure contradictoire", auteurRef: "u1", montantCalcule: "114.94", quantiteSource: "12.915", obsolete: true, motifObsolescence: "quantite" } });
    expect(payload.totaux.correctionsObsoletes).toBe(1);
  });
  it("idempotence : même contenu → même clé ; hypothèses modifiées → nouvelle clé (nouvelle version côté GP)", () => {
    expect(buildEstimationGpPayload({ releveId: "r1", etat: "projete", structure, sources: [src], details }).idempotencyKey).toBe(payload.idempotencyKey);
    const autre = source("pA", ouvrages, lignes, prix, { ...parametres, hypotheses: "Site vide" }, ajustements);
    expect(buildEstimationGpPayload({ releveId: "r1", etat: "projete", structure, sources: [autre], details: estimationDetails(structure, [autre]) }).idempotencyKey).not.toBe(payload.idempotencyKey);
  });
  it("interdits : numérotation de devis, conditions commerciales, acompte, TVA, marge, remise, signature, facture", () => {
    for (const cle of ["numeroDevis", "conditionsCommerciales", "conditionsPaiement", "acompte", "tauxTva", "margeCommerciale", "remiseCommerciale", "signatureClient", "numeroFacture"]) {
      expect(validateEstimationGpPayload({ ...payload, totaux: { ...payload.totaux, [cle]: "1" } })[0], cle).toMatch(/donnée commerciale interdite/);
    }
    expect(JSON.stringify(payload)).not.toMatch(/"[^"]*(numeroDevis|facture|commande|signature|marge|remise|tva|ttc|prixVente|acompte|conditionsCommerciales)[^"]*"\s*:/i);
  });
  it("hypothèses incohérentes refusées ; contrat 1.0.x sans hypothèses toujours recevable (rétro-compatibilité)", () => {
    expect(validateEstimationGpPayload({ ...payload, hypotheses: { ...payload.hypotheses, plans: [{ ...payload.hypotheses.plans[0], planRef: "inconnu" }] } })).toContain("hypothèses : plan inconnu inconnu");
    expect(validateEstimationGpPayload({ ...payload, hypotheses: { ...payload.hypotheses, plans: [{ ...payload.hypotheses.plans[0], coefficientGeneral: "11" }] } })[0]).toMatch(/coefficient général invalide/);
    const v10: Record<string, unknown> = { ...payload, contract: { name: "elsatia.tools.estimation", version: "1.0.0" } };
    delete v10.hypotheses;
    expect(validateEstimationGpPayload(v10)).toEqual([]);
  });
});

describe("JSON serveur : estimation figée AVANT 1402 (sans paramètres ni provenance)", () => {
  it("valeurs par défaut sûres : aucun paramètre, coefficient du prix", () => {
    const raw = { version: 1, planId: "p", etageId: "e1", etat: "projete", numero: 1, base: "HT", devise: "EUR", moteur: "estimation-v1", lignes: [], anomalies: [], totaux: {},
      prix: [{ ouvrageId: "A", donnees: { composantes: [{ type: "materiau", prixUnitaire: 1 }], coefficient: 1.5 }, origine: "saisie", revision: 1 },
        { ouvrageId: "B", donnees: { composantes: [{ type: "materiau", prixUnitaire: 1 }] }, origine: "saisie", revision: 1 }] };
    const e = planEstimationFromJson(raw);
    expect(e.parametres).toMatchObject({ donnees: {}, revision: 0 });
    expect(e.prix.map((p) => `${p.coefficientSource}:${p.coefficientApplique}`)).toEqual(["ouvrage:1.5", "aucun:1"]);
  });
});

describe("grands volumes : 1 000 / 5 000 / 20 000 lignes avec coefficients et corrections", () => {
  it.each([1000, 5000, 20000])("%i lignes", (n) => {
    const nOuvrages = Math.max(1, Math.round(n / 5));
    const cats = ["peinture", "cloisons", "sols", "cvc", "plomberie"] as const;
    const ouvrages = Array.from({ length: nOuvrages }, (_, i) => ouv(`O${String(i).padStart(5, "0")}`, { categorie: cats[i % 5] }));
    // 5 lignes par ouvrage, toutes distinctes (pièce × état) : k = 0..3 en Séjour (4 états), k = 4 en Chambre.
    const lignes = Array.from({ length: n }, (_, i) => { const k = Math.floor(i / nOuvrages);
      return { ouvrageId: ouvrages[i % nOuvrages].id, pieceId: k < 4 ? "p1" : "p2", etatProjet: (["existant", "a_deposer", "nouveau", "deplace"] as const)[k % 4], quantiteRetenue: 1 + (i % 97) / 8 }; });
    const prix = ouvrages.map((o, i) => ({ ouvrageId: o.id, donnees: { composantes: [{ type: "materiau" as const, prixUnitaire: 2 + (i % 9) / 3 }, { type: "main_d_oeuvre" as const, heuresParUnite: 0.2, tauxHoraire: 42 }], ...(i % 7 === 0 ? { coefficient: 1.15 } : {}) } }));
    const ajustements = lignes.filter((_, i) => i % 50 === 0).map((l, i) => ({ id: `a${i}`, ...l, nature: "quantite" as const, valeurCalculee: null, valeurRetenue: 10, raison: "Contrôle", quantiteSource: i % 2 ? l.quantiteRetenue : 0 }));
    const t0 = performance.now();
    const src = source("pP", ouvrages, lignes, prix, { coefficientGeneral: 1.05, coefficientsLots: { Peinture: 1.2, CVC: 0.9 } }, ajustements);
    const details = estimationDetails(structure, [src]);
    const total = totalEstimation(details);
    const t1 = performance.now();
    for (const niveau of ["piece", "lot", "ouvrage"] as const) expect(agregerEstimation(details, niveau).reduce((s, g) => s + g.total.montant, B(0))).toBe(total.montant);
    const gp = buildEstimationGpPayload({ releveId: "r", etat: "projete", structure, sources: [src], details });
    const t2 = performance.now();
    expect(gp.lignes).toHaveLength(details.length);
    expect(validateEstimationGpPayload(gp)).toEqual([]);
    expect(gp.totaux.correctionsObsoletes).toBeGreaterThan(0);
    expect(src.estimation.prix.filter((p) => p.coefficientSource === "lot").length).toBeGreaterThan(0);
    console.info(`[perf estimation+coefficients ${n} lignes] calcul + détail + total ${Math.round(t1 - t0)} ms · sous-totaux + contrat GP ${Math.round(t2 - t1)} ms`);
    expect(t2 - t0).toBeLessThan(30_000);
  });
});
