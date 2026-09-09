import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  DESCRIPTIONS,
  MOTIF_DUREE_INVALIDE,
  MOTIF_NON_CONFIGURE,
  VARIABLES_CONSERVATION,
  decisionsPurge,
  dureesConfigurees,
  purgeActive,
} from "@/lib/conservation/politique";

const MAINTENANT = new Date("2026-09-10T12:00:00.000Z");

describe("fail-closed : sans consigne, rien n'est détruit", () => {
  it("aucune catégorie n'est purgeable sur une configuration vide", () => {
    const decisions = decisionsPurge({}, MAINTENANT);
    expect(decisions).toHaveLength(CATEGORIES.length);
    expect(decisions.every((d) => !d.purgeable)).toBe(true);
    expect(purgeActive(decisions)).toBe(false);
    for (const decision of decisions) expect(decision.motif).toBe(MOTIF_NON_CONFIGURE);
  });

  it("une durée nulle vaut « ne rien purger », pas « purger tout de suite »", () => {
    const [photo] = decisionsPurge({ photo_metier: null }, MAINTENANT);
    expect(photo.purgeable).toBe(false);
    expect(photo.avant).toBeNull();
  });

  it("une durée illisible ne vaut jamais « pas de limite » : une faute de frappe ne détruit rien", () => {
    for (const absurde of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      const [photo] = decisionsPurge({ photo_metier: absurde }, MAINTENANT);
      expect(photo.purgeable, String(absurde)).toBe(false);
      expect(photo.motif).toBe(MOTIF_DUREE_INVALIDE);
    }
  });
});

describe("calcul de la coupure", () => {
  it("désigne la date d'ancienneté attendue", () => {
    const [photo] = decisionsPurge({ photo_metier: 30 }, MAINTENANT);
    expect(photo.purgeable).toBe(true);
    expect(photo.dureeJours).toBe(30);
    expect(photo.avant?.toISOString()).toBe("2026-08-11T12:00:00.000Z");
  });

  it("ne dépend pas de l'horloge du serveur : la date est un paramètre", () => {
    const a = decisionsPurge({ resultat_ocr: 7 }, new Date("2026-01-01T00:00:00.000Z"))[3];
    const b = decisionsPurge({ resultat_ocr: 7 }, new Date("2027-01-01T00:00:00.000Z"))[3];
    expect(a.avant).not.toEqual(b.avant);
  });

  it("chaque catégorie se configure séparément", () => {
    const decisions = decisionsPurge({ resultat_ocr: 7 }, MAINTENANT);
    expect(decisions.filter((d) => d.purgeable).map((d) => d.categorie)).toEqual(["resultat_ocr"]);
    expect(purgeActive(decisions)).toBe(true);
  });
});

describe("lecture de l'environnement", () => {
  it("ignore une variable absente ou vide", () => {
    expect(dureesConfigurees({})).toEqual({});
    expect(dureesConfigurees({ COLORS_CONSERVATION_PHOTO_JOURS: "   " })).toEqual({});
  });

  it("retient une durée lisible", () => {
    expect(dureesConfigurees({ COLORS_CONSERVATION_PHOTO_JOURS: "180" })).toEqual({ photo_metier: 180 });
  });

  it("transmet une valeur illisible telle quelle, pour que la décision la refuse", () => {
    const durees = dureesConfigurees({ COLORS_CONSERVATION_OCR_JOURS: "trente jours" });
    expect(Number.isNaN(durees.resultat_ocr)).toBe(true);
    expect(decisionsPurge(durees, MAINTENANT).find((d) => d.categorie === "resultat_ocr")?.purgeable).toBe(false);
  });

  it("aucune variable de conservation n'est publique", () => {
    for (const nom of Object.values(VARIABLES_CONSERVATION)) {
      expect(nom.startsWith("NEXT_PUBLIC_")).toBe(false);
    }
  });
});

describe("inventaire des catégories", () => {
  it("chaque catégorie est décrite : emplacement, contenu, raison d'être", () => {
    for (const categorie of CATEGORIES) {
      const description = DESCRIPTIONS[categorie];
      expect(description.libelle).toMatch(/\S/);
      expect(description.emplacement).toMatch(/\S/);
      expect(description.contenu).toMatch(/\S/);
      expect(description.raison).toMatch(/\S/);
    }
  });

  it("l'inventaire dit que la photo conserve ses métadonnées d'origine", () => {
    // Ce n'est pas un détail : une photo prise sur un chantier peut porter des
    // coordonnées GPS. Le taire dans l'inventaire reviendrait à le cacher.
    expect(DESCRIPTIONS.photo_metier.contenu).toMatch(/GPS/);
  });

  it("distingue bien la photo métier, le rendu, les métadonnées et l'OCR", () => {
    expect(new Set(CATEGORIES).size).toBe(4);
    expect(DESCRIPTIONS.resultat_ocr.contenu).toMatch(/Jamais l'image|Jamais l’image/);
  });
});
