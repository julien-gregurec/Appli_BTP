import { describe, expect, it } from "vitest";
import { TRACE_MODEL_CATALOG, TRACE_MODEL_SLUGS, findTraceModelDescriptor, traceModelDefaults } from "./catalog";
import { traceModelGroups, traceModelRegistry } from "./index";

describe("catalogue de modèles ↔ registre paresseux", () => {
  it("couvre exactement les mêmes slugs que le registre", () => {
    expect([...TRACE_MODEL_SLUGS].sort()).toEqual(Object.keys(traceModelRegistry).sort());
  });

  it("annonce le même groupe que le registre pour chaque modèle", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      expect(TRACE_MODEL_CATALOG[slug].group).toBe(traceModelGroups[slug]);
    }
  });

  it("expose pour chaque modèle la même fonction que son module (aucune géométrie dupliquée)", async () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const descriptor = TRACE_MODEL_CATALOG[slug];
      const built = descriptor.build(traceModelDefaults(descriptor));
      const loaded = await traceModelRegistry[slug]();
      const createFn = Object.values(loaded).find((value): value is (input?: unknown) => unknown => typeof value === "function");
      expect(createFn).toBeDefined();
      // Même modèle produit, sans passer par le catalogue : le catalogue n'apporte aucune valeur propre.
      expect(built.slug).toBe((createFn!() as { slug: string }).slug);
    }
  });

  it("construit les 13 modèles avec leurs seules valeurs par défaut", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const descriptor = TRACE_MODEL_CATALOG[slug];
      const model = descriptor.build(traceModelDefaults(descriptor));
      expect(model.slug.length).toBeGreaterThan(0);
      expect(model.parameters).toBe(descriptor.parameters);
    }
  });

  it("ne renvoie aucun descripteur de repli pour un slug inconnu", () => {
    expect(findTraceModelDescriptor("cercle-division")).toBeUndefined();
    expect(findTraceModelDescriptor(undefined)).toBeUndefined();
    expect(findTraceModelDescriptor("")).toBeUndefined();
    expect(findTraceModelDescriptor("constructor")).toBeUndefined();
  });
});
