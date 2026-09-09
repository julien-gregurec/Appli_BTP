import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyserNuancier, RAISONS_NUANCIER, type EtatNuancier } from "@/lib/nuancier/contrat";
import { lireNuancier } from "@/lib/nuancier/source";
import {
  LIBELLES_ECART,
  niveauEcart,
  proposerReference,
  referencesLesPlusProches,
} from "@/lib/nuancier/correspondance";

const NUANCIER_VALIDE = {
  source: "Nuancier interne de recette",
  version: "2026-09",
  licence: "Jeu de recette ELSATIA, aucune donnée tierce",
  references: [
    { code: "TEST-BLANC", nom: "Blanc atelier", hex: "#FFFFFF" },
    { code: "TEST-NOIR", nom: "Noir profond", hex: "#0A0A0A" },
    { code: "TEST-BLEU", nom: "Bleu chantier", hex: "#2E5B8A" },
  ],
};

const dossiers: string[] = [];
function fichierTemporaire(contenu: string) {
  const dossier = mkdtempSync(join(tmpdir(), "colors-nuancier-"));
  dossiers.push(dossier);
  const chemin = join(dossier, "nuancier.json");
  writeFileSync(chemin, contenu, "utf8");
  return chemin;
}
afterEach(() => {
  while (dossiers.length) rmSync(dossiers.pop()!, { recursive: true, force: true });
});

describe("analyserNuancier — entête", () => {
  it("charge un nuancier complet", () => {
    const etat = analyserNuancier(NUANCIER_VALIDE);
    expect(etat.disponible).toBe(true);
    if (!etat.disponible) return;
    expect(etat.source).toBe("Nuancier interne de recette");
    expect(etat.version).toBe("2026-09");
    expect(etat.licence).toContain("aucune donnée tierce");
    expect(etat.references).toHaveLength(3);
  });

  it("refuse en bloc un nuancier sans mention de licence", () => {
    const { licence: _licence, ...sansLicence } = NUANCIER_VALIDE;
    expect(analyserNuancier(sansLicence)).toEqual({ disponible: false, raison: "format_invalide" });
  });

  it("refuse un nuancier sans source ni version — rien n'y serait citable", () => {
    expect(analyserNuancier({ ...NUANCIER_VALIDE, source: "  " })).toMatchObject({ disponible: false });
    expect(analyserNuancier({ ...NUANCIER_VALIDE, version: "" })).toMatchObject({ disponible: false });
  });

  it("refuse ce qui n'est pas un objet", () => {
    for (const absurde of [null, 42, "nuancier", [NUANCIER_VALIDE]]) {
      expect(analyserNuancier(absurde)).toEqual({ disponible: false, raison: "format_invalide" });
    }
  });
});

describe("analyserNuancier — références", () => {
  it("écarte une par une les lignes inexploitables sans perdre les bonnes", () => {
    const etat = analyserNuancier({
      ...NUANCIER_VALIDE,
      references: [
        { code: "OK", hex: "#123456" },
        { code: "SANS-HEX" },
        { hex: "#654321" },
        { code: "HEX-FAUX", hex: "bleu" },
        { code: "HEX-COURT", hex: "#FFF" },
        "separateur",
      ],
    });
    expect(etat.disponible).toBe(true);
    if (!etat.disponible) return;
    expect(etat.references.map((r) => r.code)).toEqual(["OK"]);
  });

  it("ignore un code en double plutôt que de proposer deux fois la même référence", () => {
    const etat = analyserNuancier({
      ...NUANCIER_VALIDE,
      references: [{ code: "X", hex: "#111111" }, { code: "X", hex: "#222222" }],
    });
    expect(etat.disponible && etat.references).toHaveLength(1);
  });

  it("normalise la casse du HEX", () => {
    const etat = analyserNuancier({ ...NUANCIER_VALIDE, references: [{ code: "X", hex: "#abcdef" }] });
    expect(etat.disponible && etat.references[0].hex).toBe("#ABCDEF");
  });

  it("déclare vide un nuancier dont aucune référence n'est exploitable", () => {
    expect(analyserNuancier({ ...NUANCIER_VALIDE, references: [{ code: "X" }] }))
      .toEqual({ disponible: false, raison: "vide" });
  });
});

describe("lireNuancier — source du fichier", () => {
  it("déclare l'absence de configuration sans lever", () => {
    expect(lireNuancier(undefined)).toEqual({ disponible: false, raison: "non_configure" });
    expect(lireNuancier("   ")).toEqual({ disponible: false, raison: "non_configure" });
  });

  it("distingue un fichier introuvable d'un fichier illisible", () => {
    expect(lireNuancier("/chemin/qui/n/existe/pas/nuancier.json"))
      .toEqual({ disponible: false, raison: "introuvable" });
  });

  it("refuse un JSON malformé sans faire tomber l'application", () => {
    expect(lireNuancier(fichierTemporaire("{ ceci n'est pas du JSON")))
      .toEqual({ disponible: false, raison: "format_invalide" });
  });

  it("charge un fichier conforme", () => {
    const etat = lireNuancier(fichierTemporaire(JSON.stringify(NUANCIER_VALIDE)));
    expect(etat.disponible).toBe(true);
  });

  it("chaque raison d'absence a un libellé affichable", () => {
    for (const raison of Object.keys(RAISONS_NUANCIER)) {
      expect(RAISONS_NUANCIER[raison as keyof typeof RAISONS_NUANCIER]).toMatch(/\S/);
    }
  });
});

describe("proposerReference", () => {
  const charge = analyserNuancier(NUANCIER_VALIDE) as Extract<EtatNuancier, { disponible: true }>;
  const absent: EtatNuancier = { disponible: false, raison: "non_configure" };

  it("propose la référence la plus proche, avec son écart et sa provenance", () => {
    const resultat = proposerReference("#FEFEFE", charge);
    expect(resultat).toMatchObject({
      statut: "proposition",
      code: "TEST-BLANC",
      source: "Nuancier interne de recette",
      version: "2026-09",
    });
    if (resultat.statut !== "proposition") return;
    expect(resultat.distance).toBeGreaterThanOrEqual(0);
    expect(resultat.niveau).toBe("imperceptible");
  });

  it("ne propose rien quand aucun nuancier n'est chargé — et le dit", () => {
    expect(proposerReference("#FFFFFF", absent)).toEqual({ statut: "sans_proposition", raison: "nuancier_absent" });
  });

  it("distingue une teinte non saisie d'une teinte invalide et d'un nuancier absent", () => {
    expect(proposerReference(null, charge)).toEqual({ statut: "sans_proposition", raison: "teinte_non_declaree" });
    expect(proposerReference("   ", charge)).toEqual({ statut: "sans_proposition", raison: "teinte_non_declaree" });
    expect(proposerReference("bleu roi", charge)).toEqual({ statut: "sans_proposition", raison: "teinte_invalide" });
  });

  it("ne lève jamais sur une teinte aberrante", () => {
    expect(() => proposerReference("#GGGGGG", charge)).not.toThrow();
  });
});

describe("niveauEcart", () => {
  it("qualifie l'écart perçu, du plus proche au plus éloigné", () => {
    expect(niveauEcart(0)).toBe("imperceptible");
    expect(niveauEcart(0.99)).toBe("imperceptible");
    expect(niveauEcart(1)).toBe("faible");
    expect(niveauEcart(2)).toBe("visible");
    expect(niveauEcart(3.5)).toBe("net");
    expect(niveauEcart(5)).toBe("eloigne");
    expect(niveauEcart(120)).toBe("eloigne");
  });

  it("n'emploie jamais un vocabulaire de certitude", () => {
    for (const libelle of Object.values(LIBELLES_ECART)) {
      expect(libelle).not.toMatch(/certain|exact|identique|garanti|correspond/i);
    }
  });
});

describe("referencesLesPlusProches", () => {
  const references = (analyserNuancier(NUANCIER_VALIDE) as Extract<EtatNuancier, { disponible: true }>).references;

  it("classe par écart croissant et respecte la coupe demandée", () => {
    const proches = referencesLesPlusProches("#FFFFFF", references, 2);
    expect(proches).toHaveLength(2);
    expect(proches[0].code).toBe("TEST-BLANC");
    expect(proches[0].distance).toBeLessThanOrEqual(proches[1].distance);
  });

  it("renvoie une liste vide sur une teinte invalide plutôt que de lever", () => {
    expect(referencesLesPlusProches("rouge", references)).toEqual([]);
  });
});
