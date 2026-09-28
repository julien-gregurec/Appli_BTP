import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MetreStructure } from "./metre";
import {
  agregerQuantitatif, appliquerRegle, ARRONDI_MODES, buildQuantitatifGpPayload, decimalString, evaluerQuantitatif, formatQuantiteOuvrage, formuleTexte,
  milliText, OUVRAGE_CATALOGUE_STANDARD, OUVRAGE_CATEGORIES, OUVRAGE_ISSUE_MESSAGES, OUVRAGE_OPERATIONS, OUVRAGE_SOURCES, OUVRAGE_UNITES, ouvrageAnomalie,
  ouvrageOrigine, planQuantitatifFromJson, QUANTITATIF_ANOMALIE_CODES, QUANTITATIF_CSV_COLUMNS, QUANTITATIF_GP_CONTRACT, quantitatifAnomalieMessage,
  quantitatifDetails, quantitatifToCsv, rdiv, regleUnite, scaled, syntheseTravaux, validateQuantitatifGpPayload,
  type OuvrageDonnees, type OuvrageRecord, type PlanQuantitatif, type QuantitatifEntree, type QuantitatifSource,
} from "./quantitatif";

const B = (value: number | string) => BigInt(value);
const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260929001301_tools_releve_metre_quantitatifs_ouvrages_v1.sql", import.meta.url)), "utf8").replace(/\s+/g, " ");
const parite = JSON.parse(readFileSync(fileURLToPath(new URL("./quantitatif-parite.fixture.json", import.meta.url)), "utf8")) as { cas: { entree: QuantitatifEntree; attendu: unknown }[] };
const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");

const base = (extra: Partial<OuvrageDonnees> = {}): OuvrageDonnees => ({
  nom: "Ouvrage", categorie: "peinture", unite: "m2", regle: { source: "surface_sol" }, pertePourcent: 0, arrondi: { mode: "aucun" },
  etatTravaux: "nouveau", etats: ["existant", "nouveau"], ...extra,
});

describe("parité domaine ↔ migration 20260929001301", () => {
  it("énumérations identiques (catégories, unités, sources, opérations, arrondis, états d'anomalie)", () => {
    const flat = sql.replace(/, /g, ",");
    expect(flat).toContain(`not in (${quoted(OUVRAGE_CATEGORIES)})`);
    expect(flat).toContain(`not in (${quoted(OUVRAGE_UNITES)})`);
    expect(flat).toContain(`not in (${quoted(OUVRAGE_SOURCES)})`);
    expect(flat).toContain(`not in (${quoted(OUVRAGE_OPERATIONS)})`);
    expect(flat).toContain(`not in (${quoted(ARRONDI_MODES)})`);
    expect(flat).toContain(`array[${quoted(QUANTITATIF_ANOMALIE_CODES)}]`);
  });
  it("messages identiques au SQL", () => {
    for (const message of Object.values(OUVRAGE_ISSUE_MESSAGES)) expect(sql).toContain(message.replace(/'/g, "''"));
    for (const [code, detail] of [["quantite_negative", "negative"], ["surface_impossible", "surface"], ["source_absente", "aucune_donnee"], ["source_absente", "piece_sans_contour"],
      ["source_absente", "non_calculable"], ["objet_supprime", "piece_supprimee"], ["objet_supprime", "ajustement_orphelin"], ["metre_obsolete", "ajustement_perime"], ["metre_obsolete", "source_perimee"]] as const) {
      expect(sql).toContain(quantitatifAnomalieMessage(code, detail).replace(/'/g, "''"));
    }
  });
  it(`P1. le miroir TypeScript reproduit EXACTEMENT le serveur (${parite.cas.length} cas déterministes, jeu vérifié aussi par pgTAP)`, () => {
    expect(parite.cas.length).toBeGreaterThanOrEqual(40);
    for (const cas of parite.cas) expect(JSON.parse(JSON.stringify(evaluerQuantitatif(cas.entree)))).toEqual(cas.attendu);
  });
});

describe("arithmétique exacte", () => {
  it("division arrondie moitié loin de zéro, décimaux exacts", () => {
    expect([rdiv(B(5), B(2)), rdiv(B(-5), B(2)), rdiv(B(7), B(3)), rdiv(B(-7), B(3))]).toEqual([B(3), B(-3), B(2), B(-2)]);
    expect(scaled(0.1, 6)).toBe(B(100000));
    expect(scaled(1.0005, 3)).toBe(B(1001));
    expect(scaled(-1.0005, 3)).toBe(B(-1001));
    expect(decimalString(1e-7)).toBe("0.0000001");
    expect(decimalString(1.5e21)).toBe("1500000000000000000000");
    expect(milliText(B(-1500))).toBe("-1.500");
  });
  it("0,1 + 0,2 : aucune dérive flottante (milli-unités entières)", () => {
    const r1 = appliquerRegle(B(100000), base())!; const r2 = appliquerRegle(B(200000), base())!;
    expect(milliText(r1[2] + r2[2])).toBe("0.300");
  });
  it("chaîne : opérations → perte → arrondi", () => {
    expect(appliquerRegle(B(4000000), base({ unite: "u", regle: { source: "longueur_murs", operations: [{ op: "entraxe", valeur: 0.6 }, { op: "ajouter", valeur: 1 }] }, arrondi: { mode: "superieur", pas: 1 } })))
      .toEqual([B(7666667), B(7666667), B(8000)]);
    expect(appliquerRegle(B(10640000), base({ pertePourcent: 7, arrondi: { mode: "superieur", pas: 0.01 } }))).toEqual([B(10640000), B(11384800), B(11390)]);
    expect(appliquerRegle(B(2500000), base({ arrondi: { mode: "inferieur", pas: 1 } }))?.[2]).toBe(B(2000));
    expect(appliquerRegle(B(2500000), base({ arrondi: { mode: "proche", pas: 1 } }))?.[2]).toBe(B(3000));
    expect(appliquerRegle(null, base())).toBeNull();
  });
});

describe("contrat d'un ouvrage (formules sûres, unités)", () => {
  it("catalogue standard : chaque entrée est valide, sans prix, avec un code unique", () => {
    for (const entry of OUVRAGE_CATALOGUE_STANDARD) expect(ouvrageAnomalie(entry), entry.code).toBeNull();
    expect(new Set(OUVRAGE_CATALOGUE_STANDARD.map((e) => e.code)).size).toBe(OUVRAGE_CATALOGUE_STANDARD.length);
    expect(JSON.stringify(OUVRAGE_CATALOGUE_STANDARD)).not.toMatch(/"[^"]*(prix|price|tarif|montant|cout)[^"]*"\s*:/i);
    expect(new Set(OUVRAGE_CATALOGUE_STANDARD.map((e) => e.categorie)).size).toBeGreaterThanOrEqual(15);
  });
  it.each([
    [{ unite: "ml" }, "unite_incoherente"],
    [{ regle: { source: "surface_sol", operations: [{ op: "eval", valeur: 1 }] } }, "formule_invalide"],
    [{ unite: "u", regle: { source: "perimetre_utile", operations: [{ op: "entraxe", valeur: 0 }] } }, "formule_invalide"],
    [{ regle: { source: "surface_sol", operations: [{ op: "coefficient", valeur: 1.0000001 }] } }, "formule_invalide"],
    [{ prixUnitaire: 12 }, "prix"],
    [{ script: "1+1" }, "invalide"],
    [{ unite: "kg" }, "unite_incoherente"],
    [{ unite: "m3", regle: { source: "surface_sol", operations: [{ op: "epaisseur", valeur: 0.05 }] } }, null],
    [{ unite: "kg", regle: { source: "saisie", valeur: 120 } }, null],
    [{ unite: "forfait", regle: { source: "forfait", operations: [{ op: "entraxe", valeur: 1 }] } }, "unite_incoherente"],
    [{ regle: { source: "quantite_revetement" } }, "filtre"],
    [{ regle: { source: "surface_sol", filtre: { typesOuverture: ["porte"] } } }, "filtre"],
    [{ arrondi: { mode: "superieur" } }, "arrondi"],
    [{ pertePourcent: 10.555 }, "perte"],
    [{ etats: [] }, "etats"],
    [{ pieceIds: ["pas-un-uuid"] }, "pieces"],
    [{ regle: { source: "surface_sol", valeur: 3 } }, "valeur"],
  ])("%j → %s", (extra, code) => {
    expect(ouvrageAnomalie({ ...base(), ...extra })).toBe(code);
  });
  it("unité produite par la règle et formule lisible", () => {
    const plaques = OUVRAGE_CATALOGUE_STANDARD.find((e) => e.code === "CLO-BA13")!;
    expect(regleUnite(plaques.regle, "u")).toBe("u");
    expect(regleUnite({ source: "surface_sol", operations: [{ op: "entraxe", valeur: 1 }] }, "u")).toBeNull();
    expect(formuleTexte(plaques)).toBe("Surface de murs (longueur × hauteur du mur) × 2 ÷ 3 m² / u + perte 10 % → arrondi supérieur (1) = u");
    expect(ouvrageOrigine(plaques)).toBe("auto");
    expect(ouvrageOrigine(OUVRAGE_CATALOGUE_STANDARD.find((e) => e.code === "DIV-NET")!)).toBe("manuelle");
  });
});

// ── Cas BTP réels (mêmes valeurs que pgTAP Q2–Q16) ────────────────────────────

const SEJ = "d9500000-0000-0000-0000-000000000001";
const murs = [4000, 3000, 4000, 3000].map((l, i) => ({ id: `m${i + 1}`, longueurMm: l, hauteurMm: 2500, etatProjet: "existant" as const }));
const metre: QuantitatifEntree["metre"] = {
  pieces: [{
    pieceId: SEJ, hauteurMm: 2500, hauteurSource: "piece", surfaceSolBruteMm2: 10640000, surfaceSolNetteMm2: 10640000, surfacePlafondMm2: 10640000,
    perimetreBrutMm: 13200, perimetreUtileMm: 12300, surfaceMursBruteMm2: 33000000, deductionsMm2: 3250000, surfaceMursNetteMm2: 29750000, volumeMm3: 26600000000,
    faces: murs.map((m, index) => ({ index, murId: m.id, longueurMm: 0, debutMm: 0, finMm: 0, surfaceBruteMm2: 0, deductionsMm2: 0, surfaceNetteMm2: 0 })),
    ouvertures: [{ id: "o1" } as never], hauteursPonctuelles: [], ajustements: [],
    retenu: { surface_sol: 10640000, surface_plafond: 10640000, perimetre_brut: 13200, perimetre_utile: 12300, surface_murs: 29750000, volume: 26600000000 },
  }],
  ouvertures: [{ id: "o1", murId: "m1", typeOuverture: "porte", largeurMm: 900, hauteurMm: 2100, allegeMm: 0, surfaceMm2: 1890000, etatProjet: "existant" }],
  equipements: [
    { id: "e1", objet: "wc", categorie: "sanitaire", libelle: "WC", pieceId: SEJ, etatProjet: "nouveau" },
    { id: "e2", objet: "lavabo", categorie: "sanitaire", libelle: "Lavabo", pieceId: SEJ, etatProjet: "a_deposer" },
  ],
  revetements: [
    { id: "r1", pieceId: SEJ, categorie: "mur", revetement: "faience", libelle: "Faïence", unite: "m2", application: { mode: "tous" }, pertePourcent: 0, etatProjet: "nouveau",
      calculable: true, raison: null, quantiteCalculee: 2880000, ajustement: null, quantite: 2880000, quantiteAvecPerte: 2880000 },
    { id: "r2", pieceId: SEJ, categorie: "mur", revetement: "panneau_decoratif", libelle: "Panneaux", unite: "m2", application: { mode: "tous" }, pertePourcent: 0, etatProjet: "nouveau",
      calculable: true, raison: null, quantiteCalculee: 7610000, ajustement: null, quantite: 7610000, quantiteAvecPerte: 7610000 },
    { id: "r3", pieceId: SEJ, categorie: "sol", revetement: "moquette", libelle: "Moquette", unite: "m2", application: { mode: "tous" }, pertePourcent: 0, etatProjet: "a_deposer",
      calculable: true, raison: null, quantiteCalculee: 10640000, ajustement: null, quantite: 10640000, quantiteAvecPerte: 10640000 },
  ],
};
const catalogue = (code: string, extra: Partial<OuvrageDonnees> = {}): OuvrageRecord => {
  const entry = OUVRAGE_CATALOGUE_STANDARD.find((e) => e.code === code)!;
  // Plan existant : les éléments « conservés » comptent aussi (sauf ouvrages de dépose).
  const etats = entry.etatTravaux === "a_deposer" || entry.etats.includes("existant") ? entry.etats : [...entry.etats, "existant" as const];
  return { ...entry, etats, ...extra, id: code };
};

describe("takeoff : cas réels du cahier des charges", () => {
  const codes = ["PEI-MUR", "PLI-ML", "SOL-STR", "POR-U", "CLO-M2", "CLO-MON", "CLO-BA13", "CAR-SOL", "FAI-MUR", "PAN-DEC", "CLO-BPH", "SOL-RAG", "CVC-VOL", "DIV-NET", "SAN-U", "DEP-MOQ", "PLI-BAR"];
  const q = evaluerQuantitatif({ metre, murs, ouvrages: codes.map((code) => catalogue(code, ["FAI-MUR", "PAN-DEC"].includes(code) ? { etats: ["nouveau"] } : {})) });
  const total = (code: string) => q.lignes.filter((l) => l.ouvrageId === code).map((l) => `${l.etatProjet}=${l.quantiteRetenue}`).join(",");
  it.each([
    ["PEI-MUR", "nouveau=31.238", "m² de peinture : 29,75 + 5 %"],
    ["PLI-ML", "nouveau=12.915", "ml de plinthes : 12,30 + 5 %"],
    ["PLI-BAR", "nouveau=6", "barres de 2,40 m : 12,30 ÷ 2,4 × 1,1 = 5,64 → 6"],
    ["SOL-STR", "nouveau=11.39", "m² de stratifié : 10,64 + 7 % → 0,01 sup."],
    ["POR-U", "existant=1", "nombre de portes"],
    ["CLO-M2", "existant=35", "m² de cloisons (existant : 14 ml × 2,50)"],
    ["CLO-MON", "existant=28", "montants selon entraxe, par mur"],
    ["CLO-BA13", "existant=28", "plaques selon surface, par mur"],
    ["CAR-SOL", "nouveau=11.704", "carrelage + perte 10 %"],
    ["FAI-MUR", "nouveau=3.168", "faïence (zone Lot 8) + 10 %"],
    ["PAN-DEC", "nouveau=12", "panneaux décoratifs 0,72 m²"],
    ["CLO-BPH", "existant=7.35", "barrière phonique 14 ml × 0,50 + 5 %"],
    ["SOL-RAG", "nouveau=50", "ragréage 47,88 kg → sacs de 25 kg"],
    ["CVC-VOL", "nouveau=26.6", "volume"],
    ["DIV-NET", "nouveau=1", "forfait"],
    ["SAN-U", "nouveau=1", "sanitaires neufs (le lavabo à déposer n'est pas compté)"],
    ["DEP-MOQ", "a_deposer=10.64", "dépose de moquette"],
  ])("%s → %s (%s)", (code, attendu) => {
    expect(total(code)).toBe(attendu);
  });
  it("aucune anomalie sur un plan cohérent", () => {
    expect(q.anomalies).toEqual([]);
  });
});

describe("existant / dépose / neuf / déplacé", () => {
  it("lignes séparées par état ; à déposer / à créer / conservée", () => {
    const tous = ["existant", "a_deposer", "nouveau", "deplace"] as const;
    const mursProjet = [...murs.slice(0, 3), { ...murs[3], etatProjet: "a_deposer" as const }, { id: "m5", longueurMm: 2800, hauteurMm: 2500, etatProjet: "nouveau" as const }, { id: "m6", longueurMm: 1000, hauteurMm: 2500, etatProjet: "deplace" as const }];
    const q = evaluerQuantitatif({ metre, murs: mursProjet, ouvrages: [{ ...base({ categorie: "cloisons", regle: { source: "surface_murs_plan" }, etats: [...tous] }), id: "murs" }] });
    expect(q.lignes.map((l) => `${l.pieceId === null ? "etage" : "sejour"}|${l.etatProjet}=${l.quantiteRetenue}|${l.annotations.join("+")}`))
      .toEqual(["sejour|existant=27.5|", "sejour|a_deposer=7.5|", "etage|nouveau=7|hors_piece", "etage|deplace=2.5|hors_piece"]);
    const details = quantitatifDetails(structure, [source(q)]);
    const [groupe] = agregerQuantitatif(details, "ouvrage");
    expect(syntheseTravaux(groupe.totaux[0])).toEqual({ conservee: B(27500), aDeposer: B(7500), aCreer: B(7000), deplacee: B(2500) });
  });
});

describe("ajustements et anomalies", () => {
  const ouvrage: OuvrageRecord = { ...base({ regle: { source: "surface_murs" }, pertePourcent: 5 }), id: "pei" };
  it("quantité retenue sans écraser la calculée ; ajustement périmé signalé", () => {
    const aj = { id: "a1", ouvrageId: "pei", pieceId: SEJ, etatProjet: "nouveau" as const, valeurCalculee: 31.238, valeurRetenue: 30, raison: "Arrondi commande", auteurId: "u", date: "2026-09-29" };
    const q = evaluerQuantitatif({ metre, ouvrages: [ouvrage], ajustements: [aj] });
    expect(q.lignes[0]).toMatchObject({ quantiteCalculee: 31.238, quantiteRetenue: 30, ajustement: { perime: false, raison: "Arrondi commande" } });
    const perime = evaluerQuantitatif({ metre, ouvrages: [ouvrage], ajustements: [{ ...aj, valeurCalculee: 30.5 }] });
    expect(perime.lignes[0].ajustement?.perime).toBe(true);
    expect(perime.anomalies.map((a) => `${a.code}:${a.detail}`)).toEqual(["metre_obsolete:ajustement_perime"]);
    const orphelin = evaluerQuantitatif({ metre, ouvrages: [ouvrage], ajustements: [{ ...aj, etatProjet: "existant" }] });
    expect(orphelin.anomalies.map((a) => `${a.code}:${a.detail}:${a.gravite}`)).toEqual(["objet_supprime:ajustement_orphelin:erreur"]);
  });
  it("hauteur inconnue, quantité négative, surface impossible, pièce supprimée, métré source périmé", () => {
    const sansHauteur = { ...metre, pieces: [{ ...metre.pieces[0], retenu: { ...metre.pieces[0].retenu, surface_murs: null, surface_sol: 0 }, ajustements: [{ grandeur: "surface_sol", perime: true } as never] }] };
    const q = evaluerQuantitatif({
      metre: sansHauteur, piecesSupprimees: ["d9500000-0000-0000-0000-0000000000ff"],
      ouvrages: [
        { ...base({ regle: { source: "surface_murs" } }), id: "a" },
        { ...base({ unite: "u", regle: { source: "saisie", valeur: 1, operations: [{ op: "ajouter", valeur: -5 }] } }), id: "b" },
        { ...base(), id: "c" },
        { ...base({ pieceIds: ["d9500000-0000-0000-0000-0000000000ff"] }), id: "d" },
        { ...base({ unite: "ml" }), id: "e" },
      ],
    });
    expect(q.lignes.find((l) => l.ouvrageId === "a")).toMatchObject({ quantiteCalculee: null, quantiteRetenue: null, nonCalculables: 1 });
    expect(q.anomalies.map((a) => `${a.ouvrageId}:${a.code}:${a.detail}`)).toEqual([
      "a:source_absente:non_calculable", "b:quantite_negative:negative", "c:surface_impossible:surface", "c:metre_obsolete:source_perimee",
      "d:objet_supprime:piece_supprimee", "d:source_absente:aucune_donnee", "e:unite_incoherente:unite_incoherente",
    ]);
  });
});

// ── Synthèse, exports, contrat GP ─────────────────────────────────────────────

const structure: MetreStructure = {
  chantiers: [{ id: "c1", nom: "Chantier A", ordre: 0, deletedAt: null }],
  batiments: [{ id: "b1", chantierId: "c1", nom: "Bât. 1", ordre: 0, deletedAt: null }],
  etages: [{ id: "e1", batimentId: "b1", nom: "RDC", niveau: 0, ordre: 0, deletedAt: null }],
  zones: [{ id: "z1", etageId: "e1", nom: "Logement", ordre: 0, deletedAt: null }],
  pieces: [{ id: SEJ, etageId: "e1", zoneId: "z1", nom: "Séjour", ordre: 0, deletedAt: null }],
};
function source(result: ReturnType<typeof evaluerQuantitatif>, ouvrages?: OuvrageRecord[]): QuantitatifSource {
  const q: PlanQuantitatif = { version: 1, planId: "p1", etageId: "e1", etat: "projete", numero: 2, ouvrages: ouvrages ?? [{ ...base({ categorie: "cloisons", regle: { source: "surface_murs_plan" }, etats: ["existant", "a_deposer", "nouveau", "deplace"] }), id: "murs" }], ...result };
  return { etageId: "e1", planId: "p1", numero: 2, etat: "projete", figeLe: null, quantitatif: q };
}

describe("synthèse, CSV, contrat Gestion Pro", () => {
  const ouvrages = OUVRAGE_CATALOGUE_STANDARD.slice(0, 6).map((entry) => ({ ...entry, etats: ["existant", "nouveau"] as never, id: entry.code }));
  const result = evaluerQuantitatif({ metre, murs, ouvrages });
  const sources = [source(result, ouvrages)];
  const details = quantitatifDetails(structure, sources);
  it("agrégation par chantier, bâtiment, étage, zone, pièce, lot, ouvrage (exacte)", () => {
    for (const niveau of ["chantier", "batiment", "etage", "zone", "piece", "lot", "ouvrage"] as const) {
      const groupes = agregerQuantitatif(details, niveau);
      const somme = groupes.flatMap((g) => g.totaux).filter((t) => t.cle === "pei-mur|m2").reduce((s, t) => s + t.total, B(0));
      expect(milliText(somme), niveau).toBe("31.238");
    }
    expect(agregerQuantitatif(details, "piece")[0].chemin).toEqual(["Chantier A", "Bât. 1", "RDC", "Logement", "Séjour"]);
    expect(agregerQuantitatif(details, "lot").map((g) => g.libelle)).toContain("Peinture");
    expect(formatQuantiteOuvrage(B(31238), "m2")).toBe("31,238 m²");
    expect(formatQuantiteOuvrage(B(29680), "m2")).toBe("29,68 m²");
    expect(formatQuantiteOuvrage(B(8000), "u")).toBe("8 u");
    expect(formatQuantiteOuvrage(B(1234567000), "ml")).toBe("1 234 567,00 ml");
  });
  it("CSV Excel FR : BOM, `;`, décimale virgule, quantités exactes", () => {
    const csv = quantitatifToCsv(details);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, first] = csv.slice(1).split("\r\n");
    expect(header).toBe(QUANTITATIF_CSV_COLUMNS.join(";"));
    expect(first).toContain("Chantier A;Bât. 1;RDC;Logement;Séjour;Peinture;Peinture;PEI-MUR;Peinture murs (2 couches);m²;31,238;31,238;non;;");
  });
  it("contrat GP 1.0.0 : quantités décimales exactes, aucun prix, idempotent, valide", () => {
    const payload = buildQuantitatifGpPayload("r1", "projete", sources, details);
    expect(payload.contract).toEqual(QUANTITATIF_GP_CONTRACT);
    expect(payload.readiness).toEqual({ status: "contract-only", devis: "not-generated" });
    expect(payload.lignes[0]).toMatchObject({ quantite: "31.238", unite: "m2", etatProjet: "nouveau", emplacement: { piece: { id: SEJ, nom: "Séjour" }, zone: { id: "z1", nom: "Logement" } } });
    expect(validateQuantitatifGpPayload(payload)).toEqual([]);
    expect(buildQuantitatifGpPayload("r1", "projete", sources, details).idempotencyKey).toBe(payload.idempotencyKey);
    const ajuste = evaluerQuantitatif({ metre, murs, ouvrages, ajustements: [{ id: "a", ouvrageId: "PEI-MUR", pieceId: SEJ, etatProjet: "nouveau", valeurCalculee: 31.238, valeurRetenue: 30, raison: "x" }] });
    const autre = buildQuantitatifGpPayload("r1", "projete", [source(ajuste, ouvrages)], quantitatifDetails(structure, [source(ajuste, ouvrages)]));
    expect(autre.idempotencyKey).not.toBe(payload.idempotencyKey);
    expect(validateQuantitatifGpPayload({ ...payload, lignes: [{ ...payload.lignes[0], prixUnitaire: 3 }] })).toContain("prix interdit dans le contrat");
    expect(validateQuantitatifGpPayload({ ...payload, contract: { name: QUANTITATIF_GP_CONTRACT.name, version: "2.0.0" } })).toContain("version de contrat non prise en charge");
    expect(validateQuantitatifGpPayload({ ...payload, lignes: [{ ...payload.lignes[0], quantite: 31.238 }] })[0]).toMatch(/quantité non décimale/);
  });
  it("JSON serveur normalisé (numeric éventuellement en chaîne)", () => {
    const parsed = planQuantitatifFromJson({ ...sources[0].quantitatif, numero: "2", lignes: [{ ...result.lignes[0], quantiteRetenue: "31.238", elements: "1" }] });
    expect(parsed.lignes[0].quantiteRetenue).toBe(31.238);
    expect(parsed.numero).toBe(2);
  });
});

// ── Performance : 100 / 1 000 ouvrages, 5 000 lignes ──────────────────────────

function grosPlan(pieces: number): QuantitatifEntree["metre"] {
  const p0 = metre.pieces[0];
  return {
    pieces: Array.from({ length: pieces }, (_, i) => ({ ...p0, pieceId: `p${String(i).padStart(5, "0")}`, faces: [], ouvertures: [] })),
    ouvertures: [], equipements: Array.from({ length: pieces * 2 }, (_, i) => ({ id: `e${i}`, objet: "prise", categorie: "electricite", libelle: "Prise", pieceId: `p${String(i % pieces).padStart(5, "0")}`, etatProjet: "nouveau" as const })),
    revetements: [],
  };
}
const perfStructure = (pieces: number): MetreStructure => ({ ...structure, zones: [], pieces: Array.from({ length: pieces }, (_, i) => ({ id: `p${String(i).padStart(5, "0")}`, etageId: "e1", zoneId: null, nom: `Pièce ${i}`, ordre: i, deletedAt: null })) });

describe("performance du moteur (Vitest, sans réseau)", () => {
  it.each([
    [100, 50, "100 ouvrages × 50 pièces = 5 000 lignes"],
    [1000, 5, "1 000 ouvrages × 5 pièces = 5 000 lignes"],
  ])("%i ouvrages (%s)", (nOuvrages, nPieces) => {
    const ouvrages: OuvrageRecord[] = Array.from({ length: nOuvrages }, (_, i) => ({ ...OUVRAGE_CATALOGUE_STANDARD[i % 6], code: `C${i}`, etats: ["nouveau", "existant"] as never, id: `o${String(i).padStart(5, "0")}` }));
    const entree = { metre: grosPlan(nPieces), ouvrages, murs: [] };
    const t0 = performance.now();
    const result = evaluerQuantitatif(entree);
    const t1 = performance.now();
    evaluerQuantitatif({ ...entree, metre: { ...entree.metre, pieces: entree.metre.pieces.map((p) => ({ ...p, retenu: { ...p.retenu, surface_sol: 12000000 } })) } });
    const t2 = performance.now();
    const src = source(result, ouvrages);
    const details = quantitatifDetails(perfStructure(nPieces), [src]);
    for (const niveau of ["piece", "lot", "ouvrage"] as const) agregerQuantitatif(details, niveau);
    const t3 = performance.now();
    const csv = quantitatifToCsv(details);
    const gp = JSON.stringify(buildQuantitatifGpPayload("r1", "projete", [src], details));
    const t4 = performance.now();
    expect(result.lignes.length).toBe(5000);
    expect(csv.split("\r\n").length).toBe(5002);
    expect(gp.length).toBeGreaterThan(0);
    console.info(`[perf lot9] ${nOuvrages} ouvrages / ${result.lignes.length} lignes : calcul ${Math.round(t1 - t0)} ms, recalcul ${Math.round(t2 - t1)} ms, agrégation ${Math.round(t3 - t2)} ms, export ${Math.round(t4 - t3)} ms`);
    expect(t4 - t0).toBeLessThan(5000);
  });
});
