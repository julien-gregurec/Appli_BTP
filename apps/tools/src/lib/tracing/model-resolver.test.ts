import { describe, expect, it } from "vitest";
import {
  LEGACY_MODEL_ID_ALIASES,
  describeModelResolution,
  normaliseModelParameters,
  resolveTracingProjectModel,
  traceModelLabelFor,
} from "./model-resolver";
import { TRACE_MODEL_CATALOG, TRACE_MODEL_SLUGS, traceModelDefaults } from "../geometry/models/catalog";
import { createTracingProject, validateTracingProject } from "./project";

function project(modelId?: string, modelParams?: Record<string, number>) {
  return { modelId, modelParams };
}

describe("résolution d'un modelId (§3)", () => {
  it("résout chacun des 13 modèles du registre avec ses seuls défauts", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const resolution = resolveTracingProjectModel(project(slug));
      expect(resolution.status, slug).toBe("resolved");
      if (resolution.status !== "resolved") continue;
      expect(resolution.slug).toBe(slug);
      expect(resolution.model.slug.length).toBeGreaterThan(0);
      expect(resolution.params).toEqual(traceModelDefaults(TRACE_MODEL_CATALOG[slug]));
      expect(resolution.overrides).toEqual({});
      expect(resolution.warnings).toEqual([]);
    }
  });

  it("traite l'absence de modelId comme un état explicite, pas comme une erreur", () => {
    expect(resolveTracingProjectModel(project(undefined)).status).toBe("none");
    expect(describeModelResolution(resolveTracingProjectModel(project(undefined)))).toMatch(/aucun modèle/i);
  });

  it("refuse un modelId inconnu sans jamais retomber sur un autre modèle", () => {
    const resolution = resolveTracingProjectModel(project("modele-fantome"));
    expect(resolution.status).toBe("unknown-model");
    if (resolution.status !== "unknown-model") return;
    expect(resolution.modelId).toBe("modele-fantome");
    expect(resolution.message).toMatch(/n'existe pas/i);
    expect(resolution).not.toHaveProperty("model");
  });

  it("ne se laisse pas résoudre par une clé du prototype d'Object", () => {
    for (const hostile of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(resolveTracingProjectModel(project(hostile)).status, hostile).toBe("unknown-model");
    }
  });
});

describe("alias des anciens slugs de l'assistant", () => {
  it("traduit chaque ancien slug vers le modèle correspondant, en le signalant", () => {
    for (const [legacy, target] of Object.entries(LEGACY_MODEL_ID_ALIASES)) {
      const resolution = resolveTracingProjectModel(project(legacy));
      if (target === null) {
        expect(resolution.status, legacy).toBe("none");
        continue;
      }
      expect(resolution.status, legacy).toBe("resolved");
      if (resolution.status !== "resolved") continue;
      expect(resolution.slug).toBe(target);
      // Le renommage est visible : jamais une substitution muette (§3).
      expect(resolution.warnings.some((warning) => warning.kind === "legacy-model-id")).toBe(true);
    }
  });

  it("affiche un libellé pour un ancien slug sans calculer sa géométrie", () => {
    expect(traceModelLabelFor("rosace")).toBe("Rosace 6 pétales simple");
    expect(traceModelLabelFor("trace-libre")).toBeNull();
    expect(traceModelLabelFor("inconnu")).toBeNull();
    expect(traceModelLabelFor(undefined)).toBeNull();
  });
});

describe("paramètres : défauts, surcharges, validation (§4)", () => {
  it("applique les surcharges du projet par-dessus les défauts du modèle", () => {
    const resolution = resolveTracingProjectModel(project("circle-division", { diameter: 3000, divisions: 8 }));
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.overrides).toEqual({ diameter: 3000, divisions: 8 });
    expect(resolution.params).toEqual({ diameter: 3000, divisions: 8, startAngle: 0 });
    // La géométrie suit réellement le paramètre : rayon = diamètre / 2.
    expect(resolution.model.circles[0].radius).toBeCloseTo(1500, 6);
    // 8 divisions demandées ⇒ 8 points de division réellement produits par Engine B.
    expect(resolution.model.points.filter((point) => /^P\d+$/.test(point.id))).toHaveLength(8);
  });

  it("produit une géométrie différente selon les paramètres (aucune fixture)", () => {
    const small = resolveTracingProjectModel(project("ellipse-pedagogical", { width: 1000, height: 600 }));
    const large = resolveTracingProjectModel(project("ellipse-pedagogical", { width: 4000, height: 2000 }));
    expect(small.status).toBe("resolved");
    expect(large.status).toBe("resolved");
    if (small.status !== "resolved" || large.status !== "resolved") return;
    expect(small.model.ellipses[0].radiusX).toBeCloseTo(500, 6);
    expect(large.model.ellipses[0].radiusX).toBeCloseTo(2000, 6);
    expect(small.model.bounds).not.toEqual(large.model.bounds);
  });

  it("refuse une valeur hors bornes au lieu de la ramener dans les limites", () => {
    const resolution = resolveTracingProjectModel(project("circle-division", { divisions: 99 }));
    expect(resolution.status).toBe("invalid-params");
    if (resolution.status !== "invalid-params") return;
    expect(resolution.issues).toHaveLength(1);
    expect(resolution.issues[0].parameterId).toBe("divisions");
    expect(resolution.issues[0].message).toMatch(/maximum/i);
    expect(describeModelResolution(resolution)).toMatch(/hors limites/i);
  });

  it("refuse une valeur qui ne tombe pas sur le pas déclaré", () => {
    const resolution = resolveTracingProjectModel(project("circle-division", { divisions: 6.5 }));
    expect(resolution.status).toBe("invalid-params");
    if (resolution.status !== "invalid-params") return;
    expect(resolution.issues[0].message).toMatch(/pas valide/i);
  });

  it("accepte les pas fractionnaires réellement utilisés par les modèles", () => {
    expect(resolveTracingProjectModel(project("star-5", { innerRatio: 0.37 })).status).toBe("resolved");
    expect(resolveTracingProjectModel(project("spiral-archimedes", { turns: 4.75 })).status).toBe("resolved");
    expect(resolveTracingProjectModel(project("star-5", { innerRatio: 0.375 })).status).toBe("invalid-params");
  });

  it("ignore un paramètre inconnu du modèle mais le signale", () => {
    const resolution = resolveTracingProjectModel(project("arch-full-round", { width: 1500, hauteurDeGorge: 42 }));
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.params).toEqual({ width: 1500 });
    expect(resolution.warnings).toEqual([
      expect.objectContaining({ kind: "unknown-parameter", parameterId: "hauteurDeGorge" }),
    ]);
  });

  it("n'invente aucun défaut : ils viennent du contrat publié par le modèle", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const descriptor = TRACE_MODEL_CATALOG[slug];
      const { defaults } = normaliseModelParameters(descriptor, undefined);
      for (const parameter of descriptor.parameters) {
        expect(defaults[parameter.id], `${slug}.${parameter.id}`).toBe(parameter.defaultValue);
      }
    }
  });
});

describe("mesures des étapes de construction (§6)", () => {
  it("expose les measurements produites par Engine B sur les modèles qui en publient", () => {
    // Familles couvertes par ENGINE-B-STEP-MEASUREMENTS-V1 (cf. models/step-measurements.test.ts).
    for (const slug of ["flower-4", "flower-5", "rosette-6", "arch-full-round", "ogive-equilateral"]) {
      const resolution = resolveTracingProjectModel(project(slug));
      expect(resolution.status, slug).toBe("resolved");
      if (resolution.status !== "resolved") continue;
      expect(resolution.model.steps.some((step) => step.measurements.length > 0), slug).toBe(true);
    }
  });

  it("les mesures suivent les paramètres du projet, jamais un défaut figé", () => {
    const wide = resolveTracingProjectModel(project("arch-full-round", { width: 2400 }));
    const narrow = resolveTracingProjectModel(project("arch-full-round", { width: 1000 }));
    expect(wide.status).toBe("resolved");
    expect(narrow.status).toBe("resolved");
    if (wide.status !== "resolved" || narrow.status !== "resolved") return;
    const measurementsOf = (r: typeof wide) => r.model.steps.flatMap((step) => step.measurements).join(" | ");
    expect(measurementsOf(wide)).not.toBe(measurementsOf(narrow));
    expect(measurementsOf(wide)).toContain("1200");
  });

  it("donne à chaque modèle des étapes non vides", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const resolution = resolveTracingProjectModel(project(slug));
      if (resolution.status !== "resolved") throw new Error(`${slug} non résolu`);
      expect(resolution.model.steps.length, slug).toBeGreaterThan(0);
    }
  });
});

describe("intégration avec le contrat TracingProject", () => {
  it("accepte un projet réel portant modelId + modelParams", () => {
    const created = createTracingProject({
      id: "trace-resolve01",
      name: "Plafond rosace",
      type: "ceiling",
      modelId: "rosette-6",
      modelParams: { diameter: 2600 },
    });
    expect(created.schemaVersion).toBe(3);
    const resolution = resolveTracingProjectModel(created);
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.overrides).toEqual({ diameter: 2600 });
  });

  it("rejette des paramètres de modèle non numériques au niveau du projet", () => {
    expect(() => validateTracingProject({ ...createTracingProject({ id: "trace-resolve02", name: "X", type: "wall" }), modelParams: { diameter: "grand" } })).toThrow(/nombre/i);
    expect(() => validateTracingProject({ ...createTracingProject({ id: "trace-resolve03", name: "X", type: "wall" }), modelParams: { "mauvais-id": 1 } })).toThrow(/identifiant/i);
  });
});
