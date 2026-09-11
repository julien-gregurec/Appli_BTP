import { afterEach, describe, expect, it, vi } from "vitest";

const { ouvrirBase } = vi.hoisted(() => ({ ouvrirBase: vi.fn(async () => null) }));
vi.mock("@/lib/mobile/offline/base-locale", async (original) => ({
  ...(await original<typeof import("@/lib/mobile/offline/base-locale")>()),
  ouvrirBase,
}));

import { viderLaFile } from "@/lib/mobile/offline/synchronisation";

const IDENTITE = { entrepriseId: "ent-a", utilisateurId: "usr-1" };

/** Gestionnaire de verrous minimal, fidèle à Web Locks : un seul détenteur, les autres ATTENDENT. */
function verrous() {
  let file = Promise.resolve();
  const request = vi.fn((_nom: string, rappel: () => Promise<unknown>) => {
    const tour = file.then(rappel);
    file = tour.then(() => undefined, () => undefined);
    return tour;
  });
  vi.stubGlobal("navigator", { locks: { request }, onLine: true });
  return request;
}

afterEach(() => { vi.unstubAllGlobals(); ouvrirBase.mockReset(); ouvrirBase.mockImplementation(async () => null); });

describe("une seule vidange à la fois", () => {
  it("deux vidanges simultanées s'exécutent l'une APRÈS l'autre, jamais ensemble", async () => {
    // Deux vidanges simultanées reprenaient chacune l'envoi « en cours » de l'autre, et le
    // justificatif partait deux fois. Sous verrou, la seconde attend la fin de la première.
    verrous();
    let enCours = 0, maximum = 0;
    ouvrirBase.mockImplementation(async () => {
      enCours += 1; maximum = Math.max(maximum, enCours);
      await new Promise((r) => setTimeout(r, 5));
      enCours -= 1;
      return null;
    });
    await Promise.all([viderLaFile(IDENTITE), viderLaFile(IDENTITE)]);
    expect(ouvrirBase).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });

  it("la seconde vidange ne s'efface pas : elle part quand le verrou se libère", async () => {
    // Une première version passait son chemin si le verrou était pris : une note restait
    // « en attente » après le retour du réseau. Attendre son tour garantit l'envoi.
    verrous();
    const resultats = await Promise.all([viderLaFile(IDENTITE), viderLaFile(IDENTITE)]);
    expect(resultats.every((r) => r.reporte === false)).toBe(true);
  });

  it("vide la file quand le verrou est libre", async () => {
    const request = verrous();
    await viderLaFile(IDENTITE);
    expect(ouvrirBase).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe("elsatia:gp:vidange:ent-a:usr-1");
  });

  it("un verrou par identité : deux comptes du même appareil ne s'attendent pas", async () => {
    const request = verrous();
    await viderLaFile({ entrepriseId: "ent-a", utilisateurId: "usr-2" });
    expect(request.mock.calls[0][0]).toBe("elsatia:gp:vidange:ent-a:usr-2");
  });

  it("sans Web Locks (navigateur ancien), la vidange a lieu quand même", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    await viderLaFile(IDENTITE);
    expect(ouvrirBase).toHaveBeenCalledOnce();
  });
});
