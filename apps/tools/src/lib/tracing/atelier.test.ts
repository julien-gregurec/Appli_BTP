import { describe, expect, it } from "vitest";
import { validateTracingProject } from "./project";
import {
  ATELIER_MODEL_OPTIONS,
  atelierModelsForType,
  findAtelierModel,
  isKnownAtelierModel,
} from "./atelier-models";
import {
  TRACING_OUVRAGE_LABELS,
  TRACING_OUVRAGE_ORDER,
  buildTracingProjectFromInput,
  describeTracingProject,
  formatRoomDimensions,
  metresInputToMm,
  touchTracingProject,
} from "./atelier";

describe("assistant nouveau tracé (§7)", () => {
  it("crée réellement un TracingProject valide à partir de la saisie", () => {
    const project = buildTracingProjectFromInput(
      { type: "ceiling", name: "  Plafond réunion  ", roomWidthMm: 5000, roomHeightMm: 4000 },
      { id: "trace-build001", now: new Date("2026-09-05T08:00:00Z") },
    );
    expect(() => validateTracingProject(project)).not.toThrow();
    expect(project.name).toBe("Plafond réunion");
    expect(project.type).toBe("ceiling");
    expect(project.roomWidthMm).toBe(5000);
    expect(project.scaleStatus).toBe("undefined");
    expect(project.modelId).toBeUndefined();
    expect(project.startFromPhoto).toBeUndefined();
  });

  it("refuse un type d'ouvrage inconnu", () => {
    expect(() =>
      buildTracingProjectFromInput({ type: "roof" as never, name: "X" }, { id: "trace-build002" }),
    ).toThrow(/type d'ouvrage/i);
  });

  it("expose les 5 types d'ouvrage dans l'ordre du prompt", () => {
    expect(TRACING_OUVRAGE_ORDER.map((t) => TRACING_OUVRAGE_LABELS[t])).toEqual([
      "Plafond",
      "Mur",
      "Niche",
      "Arche",
      "Autre",
    ]);
  });

  it("convertit et borne les dimensions de pièce optionnelles", () => {
    expect(metresInputToMm("")).toBeUndefined();
    expect(metresInputToMm("4,2")).toBe(4200);
    expect(metresInputToMm("4.2")).toBe(4200);
    expect(() => metresInputToMm("0")).toThrow(/0 et 1000/);
    expect(() => metresInputToMm("2000")).toThrow(/0 et 1000/);
    expect(() => metresInputToMm("abc")).toThrow();
  });
});

describe("étapes modèle et photo (§8, §9)", () => {
  it("touchTracingProject applique modelId + startFromPhoto et remonte updatedAt", () => {
    const project = buildTracingProjectFromInput(
      { type: "arch", name: "Arche couloir" },
      { id: "trace-touch001", now: new Date("2026-09-05T08:00:00Z") },
    );
    const withModel = touchTracingProject(project, { modelId: "ogive" }, new Date("2026-09-05T08:05:00Z"));
    expect(withModel.modelId).toBe("ogive");
    expect(withModel.updatedAt).toBe("2026-09-05T08:05:00.000Z");

    const withPhoto = touchTracingProject(withModel, { startFromPhoto: true }, new Date("2026-09-05T08:06:00Z"));
    expect(withPhoto.startFromPhoto).toBe(true);
    expect(withPhoto.modelId).toBe("ogive");
  });

  it("le catalogue de modèles est une courte liste de slugs stables et valides", () => {
    expect(ATELIER_MODEL_OPTIONS.length).toBeLessThanOrEqual(12);
    for (const option of ATELIER_MODEL_OPTIONS) {
      expect(option.modelId).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
      // Un projet portant ce modelId doit passer la validation stricte.
      const project = touchTracingProject(
        buildTracingProjectFromInput({ type: "ceiling", name: "M" }, { id: "trace-cat00001" }),
        { modelId: option.modelId },
      );
      expect(project.modelId).toBe(option.modelId);
    }
  });

  it("résout un modèle connu et rejette l'inconnu", () => {
    expect(findAtelierModel("ogive")?.label).toBe("Ogive");
    expect(findAtelierModel("inexistant")).toBeUndefined();
    expect(findAtelierModel(undefined)).toBeUndefined();
    expect(isKnownAtelierModel("rosace")).toBe(true);
    expect(isKnownAtelierModel("nope")).toBe(false);
  });

  it("propose les modèles pertinents pour le type d'ouvrage en premier", () => {
    const forArch = atelierModelsForType("arch");
    expect(forArch).toHaveLength(ATELIER_MODEL_OPTIONS.length);
    const firstIds = forArch.slice(0, 3).map((m) => m.modelId);
    expect(firstIds).toContain("arche-plein-cintre");
    expect(firstIds).toContain("ogive");
  });
});

describe("projets récents (§6)", () => {
  it("formate les dimensions de pièce en mètres", () => {
    expect(formatRoomDimensions(5000, 4000)).toBe("5 × 4 m");
    expect(formatRoomDimensions(4200, undefined)).toBe("Largeur 4,2 m");
    expect(formatRoomDimensions(undefined, 2500)).toBe("Hauteur 2,5 m");
    expect(formatRoomDimensions(undefined, undefined)).toBeNull();
  });

  it("décrit un projet pour la liste (nom, type, dimensions, modèle, modification)", () => {
    const project = touchTracingProject(
      buildTracingProjectFromInput(
        { type: "niche", name: "Niche salon", roomWidthMm: 1200, roomHeightMm: 2000 },
        { id: "trace-desc0001", now: new Date("2026-09-05T08:00:00Z") },
      ),
      { modelId: "rosace", startFromPhoto: true },
      new Date("2026-09-05T09:00:00Z"),
    );
    expect(describeTracingProject(project)).toEqual({
      id: "trace-desc0001",
      name: "Niche salon",
      typeLabel: "Niche",
      dimensionsLabel: "1,2 × 2 m",
      modelLabel: "Rosace",
      startFromPhoto: true,
      updatedAt: "2026-09-05T09:00:00.000Z",
    });
  });
});
