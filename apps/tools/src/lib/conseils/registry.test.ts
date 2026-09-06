import { describe, expect, it } from "vitest";
import { CONSEIL_CATEGORY_IDS } from "./types";
import { CONSEIL_CATEGORIES } from "./categories";
import { isConseilTraceModelId } from "./trace-models";
import {
  CONSEIL_FICHES,
  CONSEIL_FICHES_PUBLISHED,
  CONSEILS_CONTENT_VERSION,
  assertConseilRegistryIntegrity,
  browseConseils,
  getConseilById,
  getConseilBySlug,
} from "./registry";

/** Cible éditoriale du lot d'extension : une base métier initiale réellement utilisable. */
const MIN_FICHES = 25;

describe("registre Conseils & Techniques", () => {
  it("expose une version de contenu sémantique", () => {
    expect(CONSEILS_CONTENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("charge une bibliothèque d'au moins 25 fiches, toutes publiées", () => {
    expect(CONSEIL_FICHES.length).toBeGreaterThanOrEqual(MIN_FICHES);
    expect(CONSEIL_FICHES_PUBLISHED).toHaveLength(CONSEIL_FICHES.length);
    expect(CONSEIL_FICHES_PUBLISHED.every((fiche) => fiche.status === "published")).toBe(true);
  });

  it("trie les fiches par titre en locale FR", () => {
    const titles = CONSEIL_FICHES.map((fiche) => fiche.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("n'a aucun id ni slug dupliqué", () => {
    expect(new Set(CONSEIL_FICHES.map((f) => f.id)).size).toBe(CONSEIL_FICHES.length);
    expect(new Set(CONSEIL_FICHES.map((f) => f.slug)).size).toBe(CONSEIL_FICHES.length);
  });

  it("dérive l'id du slug, de façon prévisible", () => {
    for (const fiche of CONSEIL_FICHES) {
      expect(fiche.id).toBe(`cf-${fiche.slug}`);
    }
  });

  it("ne référence que des catégories connues et déclarées", () => {
    const declared = new Set(CONSEIL_CATEGORIES.map((category) => category.id));
    for (const fiche of CONSEIL_FICHES) {
      expect(CONSEIL_CATEGORY_IDS).toContain(fiche.category);
      expect(declared.has(fiche.category)).toBe(true);
    }
  });

  it("couvre les grands domaines métier attendus", () => {
    const used = new Set(CONSEIL_FICHES.map((fiche) => fiche.category));
    for (const expected of [
      "tracage",
      "implantation",
      "mesures",
      "vitrage",
      "cloisons",
      "menuiserie",
      "etancheite",
      "fixation",
      "securite",
      "diagnostic",
      "finitions",
      "entretien",
    ] as const) {
      expect(used.has(expected)).toBe(true);
    }
  });

  it("ne référence que des modèles de tracés réels dans relatedTraceIds", () => {
    for (const fiche of CONSEIL_FICHES) {
      expect(Array.isArray(fiche.relatedTraceIds)).toBe(true);
      for (const traceId of fiche.relatedTraceIds) {
        expect(isConseilTraceModelId(traceId)).toBe(true);
      }
    }
  });

  it("relie effectivement les fiches de traçage à des modèles", () => {
    const linked = CONSEIL_FICHES.filter((fiche) => fiche.relatedTraceIds.length > 0);
    expect(linked.length).toBeGreaterThanOrEqual(5);
  });

  it("donne à chaque fiche une durée estimée et un outillage", () => {
    for (const fiche of CONSEIL_FICHES) {
      expect(fiche.estimatedMinutes).toBeGreaterThan(0);
      expect(fiche.tools.length).toBeGreaterThan(0);
      expect(fiche.finalCheck.length).toBeGreaterThan(0);
      expect(fiche.commonErrors.length).toBeGreaterThan(0);
      expect(fiche.tags.length).toBeGreaterThan(0);
    }
  });

  it("résout une fiche par id et par slug", () => {
    const fiche = CONSEIL_FICHES[0]!;
    expect(getConseilById(fiche.id)).toBe(fiche);
    expect(getConseilBySlug(fiche.slug)).toBe(fiche);
    expect(getConseilById("inconnu")).toBeUndefined();
    expect(getConseilBySlug("inconnu")).toBeUndefined();
  });

  it("valide son intégrité structurelle sans lever d'exception", () => {
    expect(() => assertConseilRegistryIntegrity()).not.toThrow();
  });

  it("combine recherche et filtres via browseConseils", () => {
    expect(browseConseils("", {})).toHaveLength(CONSEIL_FICHES_PUBLISHED.length);
    expect(browseConseils("angle droit", {})[0]?.slug).toBe("verifier-un-angle-droit-au-3-4-5");

    const tracage = browseConseils("", { category: "tracage" });
    expect(tracage.length).toBeGreaterThanOrEqual(5);
    expect(tracage.every((fiche) => fiche.category === "tracage")).toBe(true);

    const vitrageAvance = browseConseils("", { category: "vitrage", difficulty: "avance" });
    expect(vitrageAvance.map((f) => f.slug)).toEqual(["caler-un-vitrage-dans-son-chassis"]);
  });

  it("reste sérialisable tel quel (contenu embarqué, hors ligne)", () => {
    const json = JSON.stringify(CONSEIL_FICHES);
    const restored = JSON.parse(json) as typeof CONSEIL_FICHES;
    expect(restored).toHaveLength(CONSEIL_FICHES.length);
    expect(restored[0]?.slug).toBe(CONSEIL_FICHES[0]?.slug);
    expect(json).not.toContain("http://");
    expect(json).not.toContain("https://");
  });
});
