/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §9 — l'édition passe réellement par l'autosave existant.
 *
 * On ne re-teste pas `AutosaveController` (couvert par `autosave.test.ts`) : on vérifie que
 * l'édition d'un sommet et l'annulation empruntent le MÊME chemin d'enregistrement que le
 * reste de l'Atelier — debounce compris, `flushAutosave` compris — et que ce qui est écrit se
 * relit à l'identique. Le socle est inchangé, et ce test est là pour qu'il le reste.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveController, DEFAULT_AUTOSAVE_DELAY_MS } from "./autosave";
import { MemoryTracingProjectRepository } from "./repository";
import { createTracingProject, validateTracingProject, type TracingProject } from "./project";
import { touchTracingProject } from "./atelier";
import { resolveTracingProjectModel } from "./model-resolver";
import { findTraceModelDescriptor } from "../geometry/models/catalog";
import { buildEditableHandles } from "./handle-map";
import { paramsForHandleTarget } from "./editable-handle";
import {
  EMPTY_PARAM_HISTORY,
  overridesForProject,
  overridesOf,
  pushParamHistory,
  undoParamHistory,
  type ParamHistory,
} from "./param-history";

const MODEL = "rosette-6";

function resolved(project: Pick<TracingProject, "modelId" | "modelParams">) {
  const resolution = resolveTracingProjectModel(project);
  if (resolution.status !== "resolved") throw new Error("modèle non résolu");
  return resolution;
}

/** Écran d'édition réduit à ce qui touche la persistance. */
function atelier() {
  const repository = new MemoryTracingProjectRepository();
  const saved: string[] = [];
  const controller = new AutosaveController({
    save: async (project) => {
      await repository.save(project);
      saved.push(project.updatedAt);
    },
    bindLifecycle: () => () => {},
  });

  let project = createTracingProject(
    { id: "trace-persist", name: "Rosace plafond", type: "ceiling", modelId: MODEL },
    new Date("2026-09-05T10:00:00.000Z"),
  );
  let history: ParamHistory = EMPTY_PARAM_HISTORY;
  const descriptor = findTraceModelDescriptor(MODEL)!;

  const persist = (overrides: Record<string, number> | undefined, at: string) => {
    project = touchTracingProject(project, { modelParams: overrides }, new Date(at));
    controller.schedule(project);
  };

  return {
    repository,
    controller,
    saved,
    get project() {
      return project;
    },
    get history() {
      return history;
    },
    async seed() {
      project = await repository.create(project);
    },
    handles() {
      const resolution = resolved(project);
      return buildEditableHandles(descriptor, resolution.params, resolution.model);
    },
    commit(values: Record<string, number>, label: string, source: string, at: string) {
      const defaults = resolved(project).defaults;
      const before = overridesOf(resolved(project).params, defaults);
      const after = overridesOf(values, defaults);
      history = pushParamHistory(history, { label, source, coalesce: false, before, after });
      persist(overridesForProject(after), at);
    },
    undo(at: string) {
      const move = undoParamHistory(history);
      if (!move) return null;
      history = move.history;
      persist(overridesForProject(move.overrides), at);
      return move;
    },
  };
}

describe("édition d'un sommet et persistance (§9)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("enregistre le sommet déplacé après le debounce, et le relit à l'identique", async () => {
    const app = atelier();
    await app.seed();

    const C1 = app.handles().find((handle) => handle.entityId === "C1")!;
    const values = paramsForHandleTarget(C1, { x: C1.position.x + 400, y: C1.position.y })!;
    app.commit(values, "Centre de pétale C1", "handle:handle-C1", "2026-09-05T10:00:05.000Z");

    // Rien n'est encore écrit : l'autosave regroupe, comme pour toute autre modification.
    expect(app.saved).toHaveLength(0);
    vi.advanceTimersByTime(DEFAULT_AUTOSAVE_DELAY_MS);
    await vi.runAllTimersAsync();
    expect(app.saved).toHaveLength(1);

    const reloaded = await app.repository.get("trace-persist");
    expect(reloaded?.modelParams).toEqual(app.project.modelParams);
    expect(reloaded?.modelParams?.diameter).toBeGreaterThan(2400);
    // Et la géométrie relue est celle qu'on avait sous les yeux.
    expect(resolved(reloaded!).model.points).toEqual(resolved(app.project).model.points);
    app.controller.dispose();
  });

  it("regroupe une rafale de glissements en une seule écriture", async () => {
    const app = atelier();
    await app.seed();

    for (let index = 1; index <= 4; index += 1) {
      const C1 = app.handles().find((handle) => handle.entityId === "C1")!;
      const values = paramsForHandleTarget(C1, { x: C1.position.x + 100, y: C1.position.y })!;
      app.commit(values, "C1", `handle:handle-C1#${index}`, `2026-09-05T10:00:0${index}.000Z`);
      vi.advanceTimersByTime(200);
    }
    vi.advanceTimersByTime(DEFAULT_AUTOSAVE_DELAY_MS);
    await vi.runAllTimersAsync();

    expect(app.saved).toHaveLength(1);
    const reloaded = await app.repository.get("trace-persist");
    expect(reloaded?.modelParams?.diameter).toBe(app.project.modelParams?.diameter);
    app.controller.dispose();
  });

  it("`flushAutosave` écrit l'édition en cours sans attendre le debounce", async () => {
    const app = atelier();
    await app.seed();

    const C1 = app.handles().find((handle) => handle.entityId === "C1")!;
    app.commit(paramsForHandleTarget(C1, { x: C1.position.x + 400, y: C1.position.y })!, "C1", "handle:handle-C1", "2026-09-05T10:00:05.000Z");

    await app.controller.flush();
    expect(app.saved).toHaveLength(1);
    expect((await app.repository.get("trace-persist"))?.modelParams).toEqual(app.project.modelParams);
    app.controller.dispose();
  });

  it("enregistre aussi une annulation : le retour en arrière est un état, pas un oubli", async () => {
    const app = atelier();
    await app.seed();

    const C1 = app.handles().find((handle) => handle.entityId === "C1")!;
    app.commit(paramsForHandleTarget(C1, { x: C1.position.x + 400, y: C1.position.y })!, "C1", "handle:handle-C1", "2026-09-05T10:00:05.000Z");
    await app.controller.flush();
    expect((await app.repository.get("trace-persist"))?.modelParams).toBeDefined();

    app.undo("2026-09-05T10:00:09.000Z");
    await app.controller.flush();

    const reloaded = await app.repository.get("trace-persist");
    // Annuler ramène à « aucune surcharge » : le champ redevient absent, pas vide.
    expect(reloaded?.modelParams).toBeUndefined();
    expect(() => validateTracingProject(reloaded!)).not.toThrow();
    app.controller.dispose();
  });

  it("remonte `updatedAt` à chaque édition, ce dont dépend la reprise de brouillon", async () => {
    const app = atelier();
    await app.seed();
    const before = app.project.updatedAt;

    const C1 = app.handles().find((handle) => handle.entityId === "C1")!;
    app.commit(paramsForHandleTarget(C1, { x: C1.position.x + 400, y: C1.position.y })!, "C1", "handle:handle-C1", "2026-09-05T10:04:00.000Z");
    expect(app.project.updatedAt).toBe("2026-09-05T10:04:00.000Z");
    expect(app.project.updatedAt > before).toBe(true);

    await app.controller.flush();
    expect((await app.repository.get("trace-persist"))?.updatedAt).toBe("2026-09-05T10:04:00.000Z");
    app.controller.dispose();
  });

  it("garde le projet au schéma v3 : l'édition n'ajoute aucun champ", async () => {
    const app = atelier();
    await app.seed();
    const keysBefore = Object.keys(app.project).sort();

    const C1 = app.handles().find((handle) => handle.entityId === "C1")!;
    app.commit(paramsForHandleTarget(C1, { x: C1.position.x + 400, y: C1.position.y })!, "C1", "handle:handle-C1", "2026-09-05T10:00:05.000Z");
    await app.controller.flush();

    const reloaded = (await app.repository.get("trace-persist"))!;
    expect(Object.keys(reloaded).sort()).toEqual([...new Set([...keysBefore, "modelParams"])].sort());
    expect(reloaded.schemaVersion).toBe(app.project.schemaVersion);
    app.controller.dispose();
  });
});
