import { describe, expect, it } from "vitest";
import { createTracingProject, TRACING_PROJECT_SCHEMA_VERSION } from "./project";
import { migrateTracingProject, SUPPORTED_TRACING_SCHEMA_VERSIONS } from "./migration";

const base = createTracingProject(
  { id: "trace-000042", name: "Plafond séjour", type: "ceiling" },
  new Date("2026-09-05T09:00:00Z"),
);

describe("migrateTracingProject (§3)", () => {
  it("accepte un projet valide à la version courante sans le modifier", () => {
    const out = migrateTracingProject(JSON.parse(JSON.stringify(base)));
    expect(out).toEqual(base);
    expect(out.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
  });

  it("migre un projet v1 connu vers la version courante", () => {
    const legacy = { ...JSON.parse(JSON.stringify(base)), schemaVersion: 1 };
    delete legacy.modelId;
    delete legacy.modelParams;
    delete legacy.startFromPhoto;
    const out = migrateTracingProject(legacy);
    expect(out.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
    expect(out.modelId).toBeUndefined();
    expect(out.modelParams).toBeUndefined();
    expect(out.startFromPhoto).toBeUndefined();
    expect(out.id).toBe(base.id);
  });

  it("migre un projet v2 sans inventer de paramètres de modèle", () => {
    const legacy = { ...JSON.parse(JSON.stringify(base)), schemaVersion: 2, modelId: "circle-division" };
    delete legacy.modelParams;
    const out = migrateTracingProject(legacy);
    // La chaîne de migration va jusqu'à la version courante : v2 → v3 (modelParams) → v4
    // (freeGeometry). Comparer à la constante plutôt qu'à un littéral évite de réécrire ce
    // test à chaque palier — ce qu'il vérifie est qu'aucun champ n'a été inventé au passage.
    expect(out.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
    expect(out.modelId).toBe("circle-division");
    // v2 n'avait pas de surcharges : la résolution retombera sur les seuls défauts du modèle.
    expect(out.modelParams).toBeUndefined();
  });

  it("conserve les surcharges de paramètres d'un projet v3", () => {
    const out = migrateTracingProject({ ...JSON.parse(JSON.stringify(base)), modelId: "circle-division", modelParams: { diameter: 3000, divisions: 8 } });
    expect(out.modelParams).toEqual({ diameter: 3000, divisions: 8 });
  });

  it("refuse une version plus récente que celle supportée", () => {
    expect(() => migrateTracingProject({ ...base, schemaVersion: 99 })).toThrow(/plus récente/i);
  });

  it("refuse une version absente ou illisible", () => {
    expect(() => migrateTracingProject({ ...base, schemaVersion: "2" })).toThrow(/version/i);
    expect(() => migrateTracingProject({ ...base, schemaVersion: undefined })).toThrow(/version/i);
    expect(() => migrateTracingProject(null)).toThrow(/objet valide/i);
    expect(() => migrateTracingProject([])).toThrow(/objet valide/i);
  });

  it("refuse — sans l'ignorer — un champ inconnu au premier niveau", () => {
    expect(() => migrateTracingProject({ ...base, rogueField: "x" })).toThrow(/champ inconnu/i);
  });

  it("refuse des données incohérentes (identifiant, type, dates)", () => {
    expect(() => migrateTracingProject({ ...base, id: "x" })).toThrow(/identifiant/i);
    expect(() => migrateTracingProject({ ...base, type: "roof" })).toThrow(/type/i);
    expect(() => migrateTracingProject({ ...base, updatedAt: "pas-une-date" })).toThrow(/dates/i);
  });

  it("déclare explicitement les versions supportées", () => {
    expect([...SUPPORTED_TRACING_SCHEMA_VERSIONS]).toEqual([1, 2, 3, 4]);
    expect(SUPPORTED_TRACING_SCHEMA_VERSIONS).toContain(TRACING_PROJECT_SCHEMA_VERSION);
  });
});
