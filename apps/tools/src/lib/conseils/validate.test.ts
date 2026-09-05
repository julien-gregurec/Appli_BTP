import { describe, expect, it } from "vitest";
import { CONSEIL_FICHES } from "./registry";
import type { ConseilFiche } from "./types";
import { validateConseilFiche, validateConseilRegistry } from "./validate";

function baseFiche(overrides: Partial<ConseilFiche> = {}): ConseilFiche {
  return {
    id: "cf-test",
    slug: "fiche-de-test",
    title: "Fiche de test",
    shortDescription: "Une description assez longue pour passer la validation.",
    category: "mesures",
    trades: ["tous"],
    tags: ["test"],
    difficulty: "facile",
    materials: ["Un mètre"],
    preparation: ["Préparer la zone"],
    steps: [{ title: "Étape 1", text: "Faire quelque chose de précis." }],
    tips: [],
    commonErrors: [],
    finalCheck: ["Vérifier le résultat"],
    warnings: [],
    relatedToolIds: [],
    relatedTraceIds: [],
    media: [],
    version: 1,
    status: "published",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateConseilFiche", () => {
  it("accepte une fiche bien formée", () => {
    expect(validateConseilFiche(baseFiche())).toEqual([]);
  });

  it("rejette un slug non kebab-case", () => {
    expect(validateConseilFiche(baseFiche({ slug: "Fiche_Test" })).join(" ")).toContain("slug invalide");
  });

  it("exige au moins une étape avec un texte", () => {
    expect(validateConseilFiche(baseFiche({ steps: [] })).join(" ")).toContain("au moins une étape");
    expect(
      validateConseilFiche(baseFiche({ steps: [{ title: "T", text: "" }] })).join(" "),
    ).toContain("steps[0].text");
  });

  it("exige un finalCheck non vide", () => {
    expect(validateConseilFiche(baseFiche({ finalCheck: [] })).join(" ")).toContain("finalCheck");
  });

  it("refuse une catégorie inconnue", () => {
    expect(
      validateConseilFiche(baseFiche({ category: "inexistante" as ConseilFiche["category"] })).join(" "),
    ).toContain("category inconnue");
  });

  it("refuse une origine de média externe", () => {
    const fiche = baseFiche({
      media: [
        {
          type: "image",
          src: "/x.png",
          alt: "x",
          source: { label: "Externe", origin: "tiers" as never },
        },
      ],
    });
    expect(validateConseilFiche(fiche).join(" ")).toContain("interne");
  });

  it("refuse updatedAt antérieure à createdAt", () => {
    expect(
      validateConseilFiche(
        baseFiche({ createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
      ).join(" "),
    ).toContain("antérieure");
  });
});

describe("validateConseilRegistry", () => {
  it("détecte les slugs dupliqués", () => {
    const dup = [baseFiche(), baseFiche({ id: "cf-test-2" })];
    expect(validateConseilRegistry(dup).join(" ")).toContain("slug dupliqué");
  });

  it("valide le registre réel sans aucun problème", () => {
    expect(validateConseilRegistry(CONSEIL_FICHES)).toEqual([]);
  });
});
