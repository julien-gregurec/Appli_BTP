import { describe, expect, it } from "vitest";
import {
  createTracingProject,
  newReferenceImage,
  TRACING_PROJECT_SCHEMA_VERSION,
  validateTracingProject,
} from "./project";

const baseInput = { id: "trace-000001", name: "Plafond salle réunion", type: "ceiling" as const };

describe("projet de traçage (§2)", () => {
  it("crée un projet valide avec échelle non définie et calques par défaut", () => {
    const project = createTracingProject(baseInput, new Date("2026-09-05T09:00:00Z"));
    expect(project.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
    expect(project.scaleStatus).toBe("undefined");
    expect(project.layers.reference.locked).toBe(true);
    expect(project.exportSettings.witnessMm).toBe(100);
    expect(project.units).toBe("mm");
  });

  it("refuse un type inconnu, un identifiant court ou un schéma incompatible", () => {
    expect(() => validateTracingProject({ ...createTracingProject(baseInput), type: "roof" })).toThrow(/type/i);
    expect(() => validateTracingProject({ ...createTracingProject(baseInput), id: "x" })).toThrow(/identifiant/i);
    expect(() => validateTracingProject({ ...createTracingProject(baseInput), schemaVersion: 99 })).toThrow(/version/i);
  });

  it("borne les dimensions de pièce et le nombre d'images", () => {
    expect(() => validateTracingProject({ ...createTracingProject(baseInput), roomWidthMm: -5 })).toThrow(/hors limites/);
    expect(() => validateTracingProject({ ...createTracingProject(baseInput), referenceImages: new Array(21).fill({}) })).toThrow(/images de référence/);
  });

  it("réhydrate en normalisant les réglages d'export hors bornes", () => {
    const project = createTracingProject(baseInput);
    const rehydrated = validateTracingProject({
      ...project,
      exportSettings: { ...project.exportSettings, marginMm: 999, paperFormat: "A9", witnessMm: 1 },
    });
    expect(rehydrated.exportSettings.marginMm).toBe(50);
    expect(rehydrated.exportSettings.paperFormat).toBe("A4");
    expect(rehydrated.exportSettings.witnessMm).toBe(10);
  });

  it("fabrique une image de référence avec calibration non définie", () => {
    const image = newReferenceImage("img-1", "Photo mur", "camera", "jpg", 4000, 3000);
    expect(image.calibration.status).toBe("undefined");
    expect(image.layer.locked).toBe(true);
    expect(image.assetRef).toBeUndefined();
  });

  it("porte un modelId et une intention photo optionnels (§8, §9)", () => {
    const project = createTracingProject({ ...baseInput, modelId: "ogive", startFromPhoto: true });
    expect(project.modelId).toBe("ogive");
    expect(project.startFromPhoto).toBe(true);
    const rehydrated = validateTracingProject(JSON.parse(JSON.stringify(project)));
    expect(rehydrated.modelId).toBe("ogive");
    expect(rehydrated.startFromPhoto).toBe(true);
  });

  it("laisse modelId et startFromPhoto absents par défaut et rejette un modelId mal formé", () => {
    const project = createTracingProject(baseInput);
    expect(project.modelId).toBeUndefined();
    expect(project.startFromPhoto).toBeUndefined();
    expect(() => validateTracingProject({ ...project, modelId: "Ogive Brisée!" })).toThrow(/modèle/i);
  });
});
