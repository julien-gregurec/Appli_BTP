import { describe, expect, it } from "vitest";
import { CONSEIL_CATEGORY_IDS } from "./types";
import {
  CONSEIL_FICHES,
  CONSEIL_FICHES_PUBLISHED,
  CONSEILS_CONTENT_VERSION,
  assertConseilRegistryIntegrity,
  browseConseils,
  getConseilById,
  getConseilBySlug,
} from "./registry";

describe("registre Conseils & Techniques", () => {
  it("expose une version de contenu sémantique", () => {
    expect(CONSEILS_CONTENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("charge les 3 fiches de démonstration, toutes publiées", () => {
    expect(CONSEIL_FICHES).toHaveLength(3);
    expect(CONSEIL_FICHES_PUBLISHED).toHaveLength(3);
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

  it("ne référence que des catégories connues", () => {
    for (const fiche of CONSEIL_FICHES) {
      expect(CONSEIL_CATEGORY_IDS).toContain(fiche.category);
    }
  });

  it("laisse relatedTraceIds vide (contrat de chaîne seulement)", () => {
    for (const fiche of CONSEIL_FICHES) {
      expect(Array.isArray(fiche.relatedTraceIds)).toBe(true);
      expect(fiche.relatedTraceIds).toHaveLength(0);
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
    const all = browseConseils("", {});
    expect(all).toHaveLength(3);
    const angle = browseConseils("angle droit", {});
    expect(angle[0]?.slug).toBe("verifier-un-angle-droit-au-3-4-5");
    const facilesImplantation = browseConseils("", { category: "implantation", difficulty: "facile" });
    expect(facilesImplantation.map((f) => f.slug)).toEqual(["trouver-le-centre-d-un-rectangle"]);
  });
});
