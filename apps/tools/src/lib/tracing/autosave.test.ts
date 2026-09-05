import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTracingProject } from "./project";
import { AutosaveController, DEFAULT_AUTOSAVE_DELAY_MS, type AutosaveLifecycleBinder } from "./autosave";
import { touchTracingProject } from "./atelier";

const p0 = createTracingProject(
  { id: "trace-auto001", name: "Arche garage", type: "arch" },
  new Date("2026-09-05T09:00:00Z"),
);

function edit(name: string, at: string) {
  return touchTracingProject(p0, { name }, new Date(at));
}

describe("AutosaveController (§4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("regroupe les modifications rapprochées en une seule écriture après ~1,5 s", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController({ save, bindLifecycle: () => () => {} });

    controller.schedule(edit("a", "2026-09-05T09:00:01Z"));
    vi.advanceTimersByTime(500);
    controller.schedule(edit("ab", "2026-09-05T09:00:02Z"));
    vi.advanceTimersByTime(500);
    controller.schedule(edit("abc", "2026-09-05T09:00:03Z"));
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFAULT_AUTOSAVE_DELAY_MS);
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].name).toBe("abc");
    controller.dispose();
  });

  it("flush() écrit immédiatement l'état en attente sans attendre le debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController({ save, bindLifecycle: () => () => {} });

    controller.schedule(edit("pending", "2026-09-05T09:00:01Z"));
    expect(controller.pending).toBe(true);
    await controller.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.pending).toBe(false);
    controller.dispose();
  });

  it("flush sur le cycle de vie de la page (visibilitychange / pagehide)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    let fireLifecycle: () => void = () => {};
    const binder: AutosaveLifecycleBinder = (flush) => {
      fireLifecycle = flush;
      return () => {};
    };
    const controller = new AutosaveController({ save, bindLifecycle: binder });

    controller.schedule(edit("vie", "2026-09-05T09:00:01Z"));
    fireLifecycle(); // équivaut à l'onglet masqué / pagehide
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("n'installe aucune boucle permanente (aucun setInterval)", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const controller = new AutosaveController({ save: vi.fn().mockResolvedValue(undefined), bindLifecycle: () => () => {} });
    controller.schedule(edit("x", "2026-09-05T09:00:01Z"));
    expect(spy).not.toHaveBeenCalled();
    controller.dispose();
    spy.mockRestore();
  });

  it("une écriture qui échoue est remise en file sans boucle serrée", async () => {
    const save = vi
      .fn<(project: unknown) => Promise<void>>()
      .mockRejectedValueOnce(new Error("IndexedDB indisponible"))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const controller = new AutosaveController({ save, onError, bindLifecycle: () => () => {} });

    controller.schedule(edit("retry", "2026-09-05T09:00:01Z"));
    await controller.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controller.pending).toBe(true); // l'état n'est pas perdu

    await controller.flush(); // nouvelle tentative explicite
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.pending).toBe(false);
    controller.dispose();
  });

  it("persiste aussi l'état arrivé pendant une écriture en cours", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saved: string[] = [];
    const save = vi.fn(async (project: { name: string }) => {
      if (saved.length === 0) await gate;
      saved.push(project.name);
    });
    const controller = new AutosaveController({ save, bindLifecycle: () => () => {} });

    controller.schedule(edit("premier", "2026-09-05T09:00:01Z"));
    const first = controller.flush();
    controller.schedule(edit("second", "2026-09-05T09:00:02Z"));
    release();
    await first;

    expect(saved).toEqual(["premier", "second"]);
    controller.dispose();
  });

  it("dispose() débranche le cycle de vie et annule le debounce", () => {
    const unbind = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new AutosaveController({ save, bindLifecycle: () => unbind });

    controller.schedule(edit("y", "2026-09-05T09:00:01Z"));
    controller.dispose();
    vi.advanceTimersByTime(10_000);

    expect(unbind).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
