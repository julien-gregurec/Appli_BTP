import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  estFinitionColors,
  FINITIONS,
  finitionSur,
  LIBELLES_FINITION,
} from "@/lib/finition-colors";

describe("finitionSur", () => {
  it("reconnaît une finition déclarée et le dit", () => {
    const finition = finitionSur("satine");
    expect(finition).toMatchObject({ valeur: "satine", origine: "declaree", libelle: "Satiné" });
    expect(finition.mention).toContain("déclarée");
  });

  it("traite l'absence comme un état de plein droit, pas comme un échec", () => {
    for (const absent of [null, undefined, "", "indetermine"]) {
      const finition = finitionSur(absent);
      expect(finition.valeur).toBe("indetermine");
      expect(finition.origine).toBe("inconnue");
      expect(finition.libelle).toBe("Finition inconnue");
    }
  });

  it("refuse une valeur hors du modèle plutôt que de l'accepter en l'état", () => {
    expect(finitionSur("mate-veloutee").origine).toBe("inconnue");
    expect(finitionSur(3).origine).toBe("inconnue");
  });

  it("chaque finition du modèle a un libellé", () => {
    for (const valeur of FINITIONS) expect(LIBELLES_FINITION[valeur]).toMatch(/\S/);
  });

  it("estFinitionColors ne reconnaît que le modèle", () => {
    expect(estFinitionColors("brillant")).toBe(true);
    expect(estFinitionColors("BRILLANT")).toBe(false);
    expect(estFinitionColors(null)).toBe(false);
  });
});

describe("invariant : aucune finition estimée", () => {
  it("le modèle n'admet que deux origines, déclarée ou inconnue", () => {
    const source = readFileSync(fileURLToPath(new URL("./finition-colors.ts", import.meta.url)), "utf8");
    expect(source).toContain('"declaree" | "inconnue"');
    // Une photographie ne permet pas de conclure sur une finition. Si une
    // origine « estimée » apparaît un jour, ce test doit être discuté, pas
    // ajusté en silence.
    expect(source).not.toMatch(/origine\s*:\s*"estimee"/);
  });

  it("aucun libellé ne présente une finition comme certaine", () => {
    for (const libelle of Object.values(LIBELLES_FINITION)) {
      expect(libelle).not.toMatch(/certain|garanti|mesur/i);
    }
  });
});

describe("écriture de la finition — contrat avec la base", () => {
  it("le modèle applicatif et la contrainte SQL déclarent exactement les mêmes valeurs", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const migration = readFileSync(
      fileURLToPath(new URL("../../../../supabase/migrations/20260909000281_colors_finition_reference_nuancier_v15.sql", import.meta.url)),
      "utf8",
    );
    // Deux listes qui divergeraient laisseraient l'application proposer une
    // valeur que la base refuse — un formulaire qui échoue à l'enregistrement.
    const contrainte = migration.match(/check \(finition in \(([^)]+)\)\)/)?.[1];
    expect(contrainte).toBeTruthy();
    const valeursSql = contrainte!.split(",").map((v) => v.trim().replace(/'/g, ""));
    expect([...valeursSql].sort()).toEqual([...FINITIONS].sort());
  });

  it("la RPC de finition est la seule voie d'écriture citée par l'application", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const actions = readFileSync(fileURLToPath(new URL("../app/actions-metier.ts", import.meta.url)), "utf8");
    expect(actions).toContain('rpc("colors_definir_finition"');
    expect(actions).not.toMatch(/from\("colors_seaux"\)[\s\S]{0,80}finition/);
  });
});
