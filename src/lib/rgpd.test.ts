import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TABLES_ANONYMISEES_PURGE, TABLES_CONSERVEES_PURGE, cheminsStorageEmployeAAnonymiser, tablesEligiblesPurge } from "./rgpd";

describe("cheminsStorageEmployeAAnonymiser", () => {
  it("retourne les trois chemins quand ils sont tous présents", () => {
    expect(
      cheminsStorageEmployeAAnonymiser({
        photo_storage_path: "e1/emp1/portrait-a.png",
        signature_storage_path: "e1/emp1/signature-b.png",
        carte_btp_storage_path: "e1/emp1/carte-btp-c.pdf",
      })
    ).toEqual(["e1/emp1/portrait-a.png", "e1/emp1/signature-b.png", "e1/emp1/carte-btp-c.pdf"]);
  });

  it("ignore les colonnes nulles, vides ou absentes", () => {
    expect(
      cheminsStorageEmployeAAnonymiser({
        photo_storage_path: "e1/emp1/portrait-a.png",
        signature_storage_path: null,
        carte_btp_storage_path: "",
      })
    ).toEqual(["e1/emp1/portrait-a.png"]);
  });

  it("retourne un tableau vide pour un employé sans aucun fichier", () => {
    expect(cheminsStorageEmployeAAnonymiser({})).toEqual([]);
  });

  it("retourne un tableau vide si l'employé est introuvable (null)", () => {
    expect(cheminsStorageEmployeAAnonymiser(null)).toEqual([]);
  });
});

describe("tablesEligiblesPurge", () => {
  it("exclut les tables conservées pour raison comptable/légale et les tables anonymisées (F3)", () => {
    const toutes = ["employes", "factures", "chantiers", "paiements", "notes_frais", "journal_activite", "clients"];
    const eligibles = tablesEligiblesPurge(toutes);
    // employes/clients sont ANONYMIZE (ligne conservée, PII vidée), pas DELETE : F3.
    expect(eligibles).toEqual(["chantiers"]);
    for (const conservee of TABLES_CONSERVEES_PURGE) {
      expect(eligibles).not.toContain(conservee);
    }
    for (const anonymisee of TABLES_ANONYMISEES_PURGE) {
      expect(eligibles).not.toContain(anonymisee);
    }
  });

  it("ne modifie pas la liste d'entrée", () => {
    const toutes = ["employes", "factures"];
    tablesEligiblesPurge(toutes);
    expect(toutes).toEqual(["employes", "factures"]);
  });

  it("gère une liste vide", () => {
    expect(tablesEligiblesPurge([])).toEqual([]);
  });
});

describe("TABLES_CONSERVEES_PURGE — miroir de la SQL", () => {
  it("est identique à la dernière définition de public.tables_conservees_purge() dans les migrations", () => {
    const dossier = join(process.cwd(), "supabase", "migrations");
    const definitions = readdirSync(dossier)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dossier, f), "utf8"))
      .flatMap((sql) => [...sql.matchAll(/function public\.tables_conservees_purge\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/g)].map((m) => m[1]));
    const derniere = definitions.at(-1) ?? "";
    const tablesSql = [...derniere.replace(/--.*$/gm, "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(tablesSql.length).toBeGreaterThan(0);
    expect([...tablesSql].sort()).toEqual([...TABLES_CONSERVEES_PURGE].sort());
  });
});
