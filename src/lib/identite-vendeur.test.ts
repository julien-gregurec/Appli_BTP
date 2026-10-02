import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IDENTITE_LEGALE_ELSATIA, ligneLegale } from "@elsatia/email";
import { champsVendeurNonTranches, IDENTITE_VENDEUR, ligneLegaleVendeur } from "./identite-vendeur";

const JURIDIQUE = path.join(process.cwd(), "docs/juridique");
const lire = (f: string) => fs.readFileSync(path.join(JURIDIQUE, f), "utf8");

describe("identité vendeur — source unique", () => {
  it("chaque champ prouvé a une valeur et une provenance ; chaque champ non tranché n'a PAS de valeur", () => {
    for (const [nom, champ] of Object.entries(IDENTITE_VENDEUR)) {
      expect(champ.provenance.length, nom).toBeGreaterThan(10);
      if (champ.statut === "PROUVE") expect(champ.valeur, nom).toBeTruthy();
      else expect(champ.valeur, nom).toBeNull();
    }
  });

  it("aucune décision n'est prise à la place de l'exploitant (TVA, adresse, APE, RNE)", () => {
    expect(champsVendeurNonTranches()).toEqual(
      expect.arrayContaining(["regimeTva", "numeroTvaIntracommunautaire", "adresse", "codeApe", "rne"]),
    );
  });

  it("SIREN, SIRET et RCS sont cohérents entre eux", () => {
    const siren = IDENTITE_VENDEUR.siren.valeur!.replace(/\s/g, "");
    expect(siren).toMatch(/^\d{9}$/);
    expect(IDENTITE_VENDEUR.siret.valeur!.replace(/\s/g, "")).toMatch(new RegExp(`^${siren}\\d{5}$`));
    expect(IDENTITE_VENDEUR.rcs.valeur!.replace(/\s/g, "")).toContain(siren);
  });

  it("clé de Luhn du SIREN et du SIRET", () => {
    const luhn = (n: string) =>
      [...n].reverse().reduce((s, c, i) => {
        let d = Number(c);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        return s + d;
      }, 0) % 10 === 0;
    expect(luhn(IDENTITE_VENDEUR.siren.valeur!.replace(/\s/g, ""))).toBe(true);
    expect(luhn(IDENTITE_VENDEUR.siret.valeur!.replace(/\s/g, ""))).toBe(true);
  });

  it("la ligne légale des e-mails (@elsatia/email) est identique à la source", () => {
    expect(IDENTITE_LEGALE_ELSATIA.editeur).toBe(IDENTITE_VENDEUR.exploitant.valeur);
    expect(IDENTITE_LEGALE_ELSATIA.forme).toBe(IDENTITE_VENDEUR.formeAbregee.valeur);
    expect(IDENTITE_LEGALE_ELSATIA.rcs).toBe(IDENTITE_VENDEUR.rcs.valeur);
    expect(ligneLegale()).toBe(ligneLegaleVendeur());
  });

  // cgu.md ne nomme pas l'Éditeur (constat du rapport §2, à compléter lors de la relecture
  // juridique : la modifier crée une nouvelle version à faire accepter).
  it.each(["mentions-legales.md", "cgv.md", "politique-confidentialite.md", "dpa-entreprises-clientes.md"])(
    "%s nomme l'exploitant de la source",
    (fichier) => {
      expect(lire(fichier)).toContain(IDENTITE_VENDEUR.exploitant.valeur!);
    },
  );

  it("les mentions légales portent le RCS de la source et laissent SIRET / TVA aux variables d'environnement", () => {
    const mentions = lire("mentions-legales.md");
    expect(mentions).toContain(IDENTITE_VENDEUR.rcs.valeur!);
    expect(mentions).toContain("[EDITEUR_SIRET]");
    expect(mentions).toContain("[EDITEUR_MENTION_TVA]");
  });

  it("aucun régime de TVA n'est affirmé en dur dans les documents publiés", () => {
    for (const f of ["mentions-legales.md", "cgv.md", "cgu.md"]) {
      expect(lire(f), f).not.toMatch(/293\s*B|TVA non applicable|franchise en base/i);
    }
  });

  it("la source ne contient aucune adresse postale ni donnée personnelle superflue", () => {
    const serialise = JSON.stringify(IDENTITE_VENDEUR);
    expect(serialise).not.toMatch(/Rhinau|Maréchal Leclerc|67860|naissance|\+33|0[67]\d{8}/i);
  });
});
