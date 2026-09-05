import { describe, expect, it } from "vitest";
import { TRACE_MODEL_SLUGS } from "../geometry/models/catalog";
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
  modelParamsAfterModelChoice,
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
    const withModel = touchTracingProject(project, { modelId: "ogive-equilateral" }, new Date("2026-09-05T08:05:00Z"));
    expect(withModel.modelId).toBe("ogive-equilateral");
    expect(withModel.updatedAt).toBe("2026-09-05T08:05:00.000Z");

    const withPhoto = touchTracingProject(withModel, { startFromPhoto: true }, new Date("2026-09-05T08:06:00Z"));
    expect(withPhoto.startFromPhoto).toBe(true);
    expect(withPhoto.modelId).toBe("ogive-equilateral");
  });

  it("le catalogue de modèles est exactement celui du registre géométrique", () => {
    // ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §3 : plus de liste de slugs propre à l'Atelier —
    // l'assistant ne peut proposer que des modèles que le moteur sait résoudre.
    expect(ATELIER_MODEL_OPTIONS.map((option) => option.modelId).sort()).toEqual([...TRACE_MODEL_SLUGS].sort());
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
    expect(findAtelierModel("ogive-equilateral")?.label).toBe("Ogive équilatérale à deux centres");
    expect(findAtelierModel("inexistant")).toBeUndefined();
    expect(findAtelierModel(undefined)).toBeUndefined();
    expect(isKnownAtelierModel("rosette-6")).toBe(true);
    expect(isKnownAtelierModel("nope")).toBe(false);
    // Les anciens slugs de l'assistant ne sont plus proposés à la création — ils restent
    // lisibles par le résolveur (alias), mais ne rentrent pas dans un nouveau projet.
    expect(isKnownAtelierModel("rosace")).toBe(false);
  });

  it("propose les modèles pertinents pour le type d'ouvrage en premier", () => {
    const forArch = atelierModelsForType("arch");
    expect(forArch).toHaveLength(ATELIER_MODEL_OPTIONS.length);
    const firstIds = forArch.slice(0, 3).map((m) => m.modelId);
    expect(firstIds).toContain("arch-full-round");
    expect(firstIds).toContain("ogive-equilateral");
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
      { modelId: "rosette-6", startFromPhoto: true },
      new Date("2026-09-05T09:00:00Z"),
    );
    expect(describeTracingProject(project)).toEqual({
      id: "trace-desc0001",
      name: "Niche salon",
      typeLabel: "Niche",
      dimensionsLabel: "1,2 × 2 m",
      modelLabel: "Rosace 6 pétales simple",
      startFromPhoto: true,
      updatedAt: "2026-09-05T09:00:00.000Z",
    });
  });
});

/* ---- ATELIER-VERTEX-EDIT-UNDO-REDO-V1 — (re)choix de modèle ---- */

describe("modelParamsAfterModelChoice", () => {
  const reglé = { modelId: "rosette-6", modelParams: { diameter: 14000 } };

  it("conserve les réglages quand on re-choisit le même modèle", () => {
    // C'est le cas de la reprise : l'étape « modèle » revient avec le modèle déjà retenu, et
    // le re-toucher ne doit pas effacer ce qui a été enregistré.
    expect(modelParamsAfterModelChoice(reglé, "rosette-6")).toEqual({ diameter: 14000 });
  });

  it("abandonne les réglages quand on change réellement de modèle", () => {
    // `diameter` n'existe pas sur l'ogive : le transporter produirait un paramètre inconnu.
    expect(modelParamsAfterModelChoice(reglé, "ogive-equilateral")).toBeUndefined();
  });

  it("abandonne les réglages quand on repasse à « décider plus tard »", () => {
    expect(modelParamsAfterModelChoice(reglé, null)).toBeUndefined();
    expect(modelParamsAfterModelChoice(reglé, undefined)).toBeUndefined();
  });

  it("traite « aucun modèle » et « décider plus tard » comme le même choix", () => {
    const sansModele = { modelId: undefined, modelParams: undefined };
    expect(modelParamsAfterModelChoice(sansModele, null)).toBeUndefined();
  });

  it("ne rend rien quand le projet n'avait aucune surcharge", () => {
    expect(modelParamsAfterModelChoice({ modelId: "rosette-6", modelParams: undefined }, "rosette-6")).toBeUndefined();
  });
});
