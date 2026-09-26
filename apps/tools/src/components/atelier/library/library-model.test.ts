/**
 * TRACING-WORKSHOP-UI-V1 §24 — la bibliothèque éprouvée sur le registre RÉEL.
 *
 * Aucune fixture : les entrées viennent de `TRACE_MODEL_CATALOG` et leur géométrie du moteur.
 * Un modèle retiré, renommé ou dont les tags changent fait tomber ces tests — c'est le but :
 * la bibliothèque ne doit jamais décrire autre chose que ce que l'outil sait tracer.
 */

import { describe, expect, it } from "vitest";
import { TRACE_MODEL_SLUGS } from "../../../lib/geometry/models/catalog";
import {
  buildTraceLibrary,
  filterLibrary,
  headlineParameters,
  libraryFamilies,
  libraryOuvrages,
} from "./library-model";

const LIBRARY = buildTraceLibrary();

describe("construction de la bibliothèque (§7)", () => {
  it("expose tous les modèles du registre, aperçu compris", () => {
    expect(LIBRARY.map((entry) => entry.slug).sort()).toEqual([...TRACE_MODEL_SLUGS].sort());
  });

  it("chaque carte porte des informations publiées par le moteur", () => {
    for (const entry of LIBRARY) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.parameters.length).toBeGreaterThan(0);
      expect(entry.model.slug).toBe(entry.slug);
      expect(entry.stepCount).toBe(entry.model.steps.length);
      expect(entry.dimensionCount).toBe(entry.model.dimensions.length);
    }
  });

  it("chaque aperçu a une géométrie dessinable et des bornes finies", () => {
    for (const entry of LIBRARY) {
      const { bounds } = entry.model;
      expect(Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)).toBe(true);
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      const drawable =
        entry.model.segments.length +
        entry.model.arcs.length +
        entry.model.circles.length +
        entry.model.ellipses.length +
        (entry.model.polylines?.length ?? 0) +
        (entry.model.polygons?.length ?? 0);
      expect(drawable).toBeGreaterThan(0);
    }
  });

  it("met en avant les premiers paramètres publiés, dans l'ordre du modèle", () => {
    for (const entry of LIBRARY) {
      expect(headlineParameters(entry, 2)).toEqual(entry.parameters.slice(0, 2));
    }
  });
});

describe("familles et ouvrages (§5)", () => {
  it("ne propose aucune famille vide", () => {
    for (const family of libraryFamilies(LIBRARY)) expect(family.count).toBeGreaterThan(0);
  });

  it("chaque famille correspond à des tags réellement publiés", () => {
    const families = libraryFamilies(LIBRARY).map((family) => family.id);
    expect(families).toContain("tous");
    // Ces familles ne sont proposées que parce que des modèles les revendiquent par leurs tags.
    expect(families).toContain("rosaces");
    expect(families).toContain("floral");
    expect(families).toContain("arches");
    // Rien dans le registre n'alimente « LED » ni « Personnalisé » : ils n'existent pas ici.
    expect(families).not.toContain("led");
  });

  it("ne propose aucun type d'ouvrage sans modèle", () => {
    for (const ouvrage of libraryOuvrages(LIBRARY)) expect(ouvrage.count).toBeGreaterThan(0);
  });
});

describe("recherche et filtres (§5)", () => {
  it("une recherche vide ne filtre rien", () => {
    expect(filterLibrary(LIBRARY, { query: "   " })).toHaveLength(LIBRARY.length);
  });

  it("ignore la casse et les accents", () => {
    const accented = filterLibrary(LIBRARY, { query: "étoile" }).map((entry) => entry.slug);
    const plain = filterLibrary(LIBRARY, { query: "ETOILE" }).map((entry) => entry.slug);
    expect(accented.length).toBeGreaterThan(0);
    expect(plain).toEqual(accented);
  });

  it("trouve un modèle par son tag comme par son nom", () => {
    expect(filterLibrary(LIBRARY, { query: "rosace" }).length).toBeGreaterThan(0);
    expect(filterLibrary(LIBRARY, { query: "Arche plein cintre" }).map((entry) => entry.slug)).toContain(
      "arch-full-round",
    );
  });

  it("le filtre de famille ne ramène que des membres de la famille", () => {
    const arches = filterLibrary(LIBRARY, { family: "arches" });
    expect(arches.length).toBeGreaterThan(0);
    for (const entry of arches) expect(entry.tags.some((tag) => tag === "arche" || tag === "ogive")).toBe(true);
  });

  it("le filtre d'ouvrage ne ramène que des modèles qui le revendiquent", () => {
    const ceilings = filterLibrary(LIBRARY, { ouvrage: "ceiling" });
    expect(ceilings.length).toBeGreaterThan(0);
    for (const entry of ceilings) expect(entry.ouvrages).toContain("ceiling");
  });

  it("cumule recherche, famille et ouvrage", () => {
    const combined = filterLibrary(LIBRARY, { query: "fleur", family: "floral", ouvrage: "ceiling" });
    for (const entry of combined) {
      expect(entry.tags).toContain("fleur");
      expect(entry.ouvrages).toContain("ceiling");
    }
  });

  it("une recherche sans correspondance ne ramène rien plutôt qu'un repli", () => {
    expect(filterLibrary(LIBRARY, { query: "zzzz-inexistant" })).toHaveLength(0);
  });
});
