import { describe, expect, it } from "vitest";
import { traceModelRegistry } from "./index";
import type { TraceModel } from "../trace-model";

/**
 * ENGINE-B-STEP-MEASUREMENTS-V1 §6/§7 — Contrat de mode chantier, vérifié sur les 13 modèles.
 *
 * `TraceSteps` et `SiteMode` lisent `step.measurements.length` sans garde : le champ doit rester
 * un tableau pour TOUT modèle, mesures publiées ou non (le pont `geometry/adapters` retombe sur
 * `[]`). Ce test parcourt le registre réel plutôt qu'une liste recopiée, pour qu'un 14ᵉ modèle
 * soit couvert d'office.
 */
const slugs = Object.keys(traceModelRegistry);

async function buildModel(slug: string): Promise<TraceModel> {
  const loaded = await traceModelRegistry[slug]();
  const entry = Object.entries(loaded).find(([name, value]) => /^create.*Geometry$/.test(name) && typeof value === "function");
  if (!entry) throw new Error(`Aucun générateur create…Geometry exporté par le modèle "${slug}".`);
  return (entry[1] as () => TraceModel)();
}

describe("mesures chantier des 13 modèles", () => {
  it("le registre couvre bien les 13 modèles internes", () => {
    expect(slugs).toHaveLength(13);
  });

  it.each(slugs)("%s : chaque étape porte un tableau de mesures exploitables telles quelles", async (slug) => {
    const model = await buildModel(slug);
    expect(model.steps.length).toBeGreaterThan(0);
    for (const step of model.steps) {
      expect(Array.isArray(step.measurements)).toBe(true);
      for (const measurement of step.measurements) {
        expect(typeof measurement).toBe("string");
        expect(measurement.trim().length).toBeGreaterThan(0);
        expect(/NaN|Infinity|undefined/.test(measurement)).toBe(false);
      }
    }
  });

  it("les modèles de la famille rosace publient réellement des mesures (non-régression du mode chantier)", async () => {
    for (const slug of ["flower-4", "flower-5", "rosette-6", "arch-full-round", "ogive-equilateral"]) {
      const model = await buildModel(slug);
      expect(model.steps.some((step) => step.measurements.length > 0)).toBe(true);
    }
  });
});
