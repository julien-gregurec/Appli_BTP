import { describe, expect, it } from "vitest";
import { CONSEIL_FICHES_PUBLISHED } from "./registry";
import { createConseilSearchIndex, searchConseils } from "./search";
import { formatEstimatedDuration, normalizeText } from "./text";

const index = createConseilSearchIndex(CONSEIL_FICHES_PUBLISHED);
const slugs = (query: string) => searchConseils(index, query).map((f) => f.slug);

describe("normalizeText", () => {
  it("retire accents, casse et apostrophes", () => {
    expect(normalizeText("ÉQUERRAGE")).toBe("equerrage");
    expect(normalizeText("d’un   rectangle")).toBe("d un rectangle");
    expect(normalizeText("  Entraxe\tRégulier ")).toBe("entraxe regulier");
  });
});

describe("formatEstimatedDuration", () => {
  it("met en forme minutes et heures", () => {
    expect(formatEstimatedDuration(25)).toBe("25 min");
    expect(formatEstimatedDuration(60)).toBe("1 h");
    expect(formatEstimatedDuration(90)).toBe("1 h 30");
    expect(formatEstimatedDuration(0)).toBe("—");
  });
});

describe("recherche locale Conseils", () => {
  it("retourne toutes les fiches pour une requête vide", () => {
    expect(searchConseils(index, "   ")).toHaveLength(CONSEIL_FICHES_PUBLISHED.length);
  });

  it("est insensible à la casse et aux accents", () => {
    expect(slugs("EQUERRAGE")).toContain("verifier-un-angle-droit-au-3-4-5");
    expect(slugs("équerrage")).toContain("verifier-un-angle-droit-au-3-4-5");
  });

  it("cherche dans les tags", () => {
    expect(slugs("suspentes")).toContain("diviser-une-longueur-en-entraxes-reguliers");
    expect(slugs("anodisation")).toContain("entretenir-une-menuiserie-aluminium-et-son-vitrage");
  });

  it("cherche dans l'outillage cité par la fiche", () => {
    expect(slugs("ventouses")).toContain("estimer-le-poids-et-manutentionner-un-vitrage");
    expect(slugs("telemetre")).toContain("prendre-les-cotes-d-une-baie-avant-commande");
  });

  it("cherche par catégorie et par métier", () => {
    expect(slugs("implantation").length).toBeGreaterThanOrEqual(3);
    expect(slugs("vitrier").length).toBeGreaterThanOrEqual(3);
  });

  it("retrouve les termes métier même quand la fiche emploie le mot savant", () => {
    // « placo » n'apparaît dans aucun titre : c'est la table de synonymes qui répond.
    expect(slugs("placo").length).toBeGreaterThanOrEqual(2);
    expect(slugs("vitre")).toContain("caler-un-vitrage-dans-son-chassis");
    expect(slugs("huisserie")).toContain("caler-un-dormant-sans-le-deformer");
    expect(slugs("ovale")).toContain("tracer-une-ellipse-par-les-foyers");
  });

  it("privilégie la correspondance littérale sur la correspondance par synonyme", () => {
    const result = slugs("vitrage");
    expect(result[0]).toMatch(/vitrage|vitrages/);
  });

  it("exige que tous les jetons correspondent", () => {
    expect(slugs("angle droit")).toEqual(["verifier-un-angle-droit-au-3-4-5"]);
    expect(slugs("angle carreleur")).toEqual([]);
    expect(slugs("zzzinexistant")).toEqual([]);
  });

  it("classe la correspondance de titre avant la correspondance de tag", () => {
    expect(slugs("centre")[0]).toBe("trouver-le-centre-d-un-rectangle");
    expect(slugs("cheville")[0]).toBe("choisir-une-cheville-selon-le-support");
  });
});
