import { describe, expect, it, vi } from "vitest";
import { ReleveConflictError } from "@elsatia/releve-domain";
import { AutosaveController, isConflictError, type AutosaveState } from "./autosave";

function harness(save: (patch: Record<string, unknown>, revision: number) => Promise<{ revision: number }>) {
  const timers: Array<() => void> = [];
  const states: AutosaveState[] = [];
  const controller = new AutosaveController<Record<string, unknown>>({
    revision: 1, save, onState: (state) => states.push(state),
    setTimer: (callback) => { timers.push(callback); return timers.length; }, clearTimer: () => undefined,
  });
  const tick = async () => { const pending = timers.splice(0); for (const callback of pending) callback(); await Promise.resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); };
  return { controller, states, tick };
}

describe("sauvegarde automatique (saving / saved / error / retry / conflict)", () => {
  it("regroupe les frappes rapprochées en une seule écriture avec la révision lue", async () => {
    const save = vi.fn(async (_patch: Record<string, unknown>, revision: number) => ({ revision: revision + 1 }));
    const { controller, states, tick } = harness(save);
    controller.queue({ nom: "B" }); controller.queue({ nom: "Bu" }); controller.queue({ commentaire: "RAS" });
    expect(controller.current.status).toBe("pending");
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ nom: "Bu", commentaire: "RAS" }, 1);
    expect(states.map((state) => state.status)).toEqual(["pending", "pending", "pending", "saving", "saved"]);
    expect(controller.current.revision).toBe(2);
    controller.queue({ nom: "Bureau" }, { immediate: true });
    await tick();
    expect(save).toHaveBeenLastCalledWith({ nom: "Bureau" }, 2);
  });

  it("erreur réseau : la saisie est conservée puis renvoyée par « Réessayer »", async () => {
    let fail = true;
    const save = vi.fn(async (_patch: Record<string, unknown>, revision: number) => { if (fail) throw new Error("Hors ligne"); return { revision: revision + 1 }; });
    const { controller, tick } = harness(save);
    controller.queue({ nom: "Séjour" });
    await tick();
    expect(controller.current).toMatchObject({ status: "error", message: "Hors ligne" });
    expect(controller.hasPending).toBe(true);
    fail = false;
    await controller.retry();
    expect(save).toHaveBeenLastCalledWith({ nom: "Séjour" }, 1);
    expect(controller.current.status).toBe("saved");
  });

  it("deux onglets : conflit détecté, rien n'est écrasé sans choix explicite", async () => {
    const save = vi.fn(async (_patch: Record<string, unknown>, revision: number) => {
      if (revision !== 5) throw new ReleveConflictError(5);
      return { revision: 6 };
    });
    const { controller, tick } = harness(save);
    controller.queue({ nom: "Onglet 2" });
    await tick();
    expect(controller.current.status).toBe("conflict");
    controller.queue({ commentaire: "suite" });
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    await controller.overwrite(5);
    expect(save).toHaveBeenLastCalledWith({ nom: "Onglet 2", commentaire: "suite" }, 5);
    expect(controller.current).toMatchObject({ status: "saved", revision: 6 });
  });

  it("conflit : « Recharger » abandonne la saisie locale", async () => {
    const { controller, tick } = harness(async () => { throw new ReleveConflictError(9); });
    controller.queue({ nom: "X" });
    await tick();
    controller.reloadFromServer(9);
    expect(controller.hasPending).toBe(false);
    expect(controller.current).toMatchObject({ status: "idle", revision: 9 });
  });

  it("une saisie pendant une écriture part juste après, avec la nouvelle révision", async () => {
    let release: (() => void) | null = null;
    const save = vi.fn((_patch: Record<string, unknown>, revision: number) => new Promise<{ revision: number }>((resolve) => { release = () => resolve({ revision: revision + 1 }); }));
    const { controller } = harness(save);
    controller.queue({ nom: "A" }, { immediate: true });
    await Promise.resolve();
    controller.queue({ nom: "AB" }, { immediate: true });
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(save.mock.calls.map(([patch, revision]) => [patch, revision])).toEqual([[{ nom: "A" }, 1], [{ nom: "AB" }, 2]]);
    expect(controller.current).toMatchObject({ status: "saved", revision: 3 });
    expect(isConflictError(new ReleveConflictError(1))).toBe(true);
    expect(isConflictError(new Error("x"))).toBe(false);
  });
});
