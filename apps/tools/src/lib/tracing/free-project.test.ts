/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §1/§2/§10 — le tracé libre dans le contrat de projet.
 *
 * Trois questions, et ce sont celles qui décident du lot :
 *
 * 1. le tracé libre survit-il à un aller-retour complet par la persistance locale ?
 * 2. l'exclusivité modèle / tracé libre (§2) tient-elle partout, y compris à la relecture d'un
 *    document écrit à la main ?
 * 3. la migration v3 → v4 se fait-elle sans rien inventer ni rien perdre ?
 */

import { describe, expect, it } from "vitest";
import {
  TRACING_PROJECT_SCHEMA_VERSION,
  TracingProjectError,
  createTracingProject,
  tracingProjectMode,
  validateTracingProject,
} from "./project";
import { migrateTracingProject, SUPPORTED_TRACING_SCHEMA_VERSIONS } from "./migration";
import { MemoryTracingProjectRepository } from "./repository";
import { touchTracingProject } from "./atelier";
import { FREE_GEOMETRY_VERSION, type FreeGeometry } from "./free-geometry";

const DRAWING: FreeGeometry = {
  version: FREE_GEOMETRY_VERSION,
  entities: [
    { id: "pt-1", kind: "point", points: [{ x: 120, y: 340 }] },
    {
      id: "sg-1",
      kind: "segment",
      points: [
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
      ],
    },
    {
      id: "pl-1",
      kind: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 800 },
        { x: 1200, y: 0 },
      ],
    },
  ],
};

function newProject(extra: Record<string, unknown> = {}) {
  return createTracingProject(
    { id: "trace-libre001", name: "Plafond séjour", type: "ceiling", ...extra },
    new Date("2026-09-06T09:00:00.000Z"),
  );
}

describe("mode de projet (§2)", () => {
  it("déduit le mode de ce que le projet porte, sans drapeau stocké", () => {
    expect(tracingProjectMode(newProject())).toBe("undecided");
    expect(tracingProjectMode(newProject({ modelId: "rosette-6" }))).toBe("parametric");
    expect(tracingProjectMode(newProject({ freeGeometry: DRAWING }))).toBe("free");
  });

  it("traite un document libre VIDE comme une absence de tracé", () => {
    const project = newProject({ freeGeometry: { version: FREE_GEOMETRY_VERSION, entities: [] } });
    expect(project.freeGeometry).toBeUndefined();
    expect(tracingProjectMode(project)).toBe("undecided");
  });

  it("refuse un projet portant à la fois un modèle et un tracé libre", () => {
    expect(() => newProject({ modelId: "rosette-6", freeGeometry: DRAWING })).toThrow(TracingProjectError);
    // Le refus vit dans la VALIDATION, donc il tient aussi pour un document écrit à la main
    // (import, écriture directe en base locale), pas seulement pour le chemin de l'UI.
    expect(() =>
      validateTracingProject({ ...newProject(), modelId: "rosette-6", freeGeometry: DRAWING }),
    ).toThrow(/l'un des deux/);
  });

  it("refuse un tracé libre invalide au niveau du projet, avec le message de la géométrie", () => {
    expect(() =>
      newProject({
        freeGeometry: {
          version: FREE_GEOMETRY_VERSION,
          entities: [{ id: "sg-1", kind: "segment", points: [{ x: 0, y: Number.NaN }, { x: 1, y: 1 }] }],
        },
      }),
    ).toThrow(/nombre fini/);
  });
});

describe("persistance locale (§10)", () => {
  it("survit à un aller-retour complet par le repository, sommet pour sommet", async () => {
    const repository = new MemoryTracingProjectRepository();
    const created = await repository.create(newProject({ freeGeometry: DRAWING }));
    expect(created.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);

    const reloaded = await repository.get(created.id);
    expect(reloaded?.freeGeometry).toEqual(DRAWING);
    expect(tracingProjectMode(reloaded!)).toBe("free");
  });

  it("enregistre une modification du tracé par la voie habituelle (touch + save)", async () => {
    const repository = new MemoryTracingProjectRepository();
    let project = await repository.create(newProject({ freeGeometry: DRAWING }));

    const grown: FreeGeometry = {
      version: FREE_GEOMETRY_VERSION,
      entities: [...DRAWING.entities, { id: "pt-2", kind: "point", points: [{ x: 900, y: 10 }] }],
    };
    project = touchTracingProject(project, { freeGeometry: grown }, new Date("2026-09-06T09:05:00.000Z"));
    await repository.save(project);

    const reloaded = await repository.get(project.id);
    expect(reloaded?.freeGeometry?.entities).toHaveLength(4);
    expect(reloaded?.updatedAt).toBe("2026-09-06T09:05:00.000Z");
  });

  it("efface le tracé quand la dernière primitive est supprimée", async () => {
    const repository = new MemoryTracingProjectRepository();
    let project = await repository.create(newProject({ freeGeometry: DRAWING }));
    project = touchTracingProject(project, { freeGeometry: undefined });
    await repository.save(project);

    const reloaded = await repository.get(project.id);
    expect(reloaded?.freeGeometry).toBeUndefined();
    expect(tracingProjectMode(reloaded!)).toBe("undecided");
  });
});

describe("migration (§10)", () => {
  it("déclare la v4 parmi les versions supportées", () => {
    expect([...SUPPORTED_TRACING_SCHEMA_VERSIONS]).toContain(4);
    expect(TRACING_PROJECT_SCHEMA_VERSION).toBe(4);
  });

  it("migre un projet v3 sans inventer de tracé libre", () => {
    const legacy = { ...JSON.parse(JSON.stringify(newProject({ modelId: "rosette-6" }))), schemaVersion: 3 };
    delete legacy.freeGeometry;
    const migrated = migrateTracingProject(legacy);
    expect(migrated.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
    expect(migrated.freeGeometry).toBeUndefined();
    expect(migrated.modelId).toBe("rosette-6");
    // Aucun projet migré ne peut violer l'exclusivité : la primitive n'existait pas avant v4.
    expect(tracingProjectMode(migrated)).toBe("parametric");
  });

  it("relit un projet v4 portant un tracé libre", () => {
    const stored = JSON.parse(JSON.stringify(newProject({ freeGeometry: DRAWING })));
    expect(migrateTracingProject(stored).freeGeometry).toEqual(DRAWING);
  });

  it("refuse toujours un champ de premier niveau inconnu", () => {
    const stored = { ...JSON.parse(JSON.stringify(newProject())), freeShapes: [] };
    expect(() => migrateTracingProject(stored)).toThrow(/champ inconnu/);
  });
});
