import { afterEach, describe, expect, it, vi } from "vitest";

const { ouvrirBase } = vi.hoisted(() => ({ ouvrirBase: vi.fn(async () => null) }));
vi.mock("@/lib/mobile/offline/base-locale", async (original) => ({
  ...(await original<typeof import("@/lib/mobile/offline/base-locale")>()),
  ouvrirBase,
}));

import { viderLaFile } from "@/lib/mobile/offline/synchronisation";

const IDENTITE = { entrepriseId: "ent-a", utilisateurId: "usr-1" };

function verrous(disponible: boolean) {
  const request = vi.fn(async (_nom: string, _options: { ifAvailable: boolean }, rappel: (verrou: object | null) => unknown) =>
    rappel(disponible ? {} : null));
  vi.stubGlobal("navigator", { locks: { request }, onLine: true });
  return request;
}

afterEach(() => { vi.unstubAllGlobals(); ouvrirBase.mockClear(); });

describe("une seule vidange à la fois", () => {
  it("s'efface si une autre vidange tient le verrou, sans ouvrir la base ni rien remettre en file", async () => {
    // Deux vidanges simultanées reprenaient chacune l'envoi « en cours » de l'autre, et le
    // justificatif partait deux fois. Celle qui n'obtient pas le verrou ne touche à rien.
    verrous(false);
    const resultat = await viderLaFile(IDENTITE);
    expect(resultat.reporte).toBe(true);
    expect(ouvrirBase).not.toHaveBeenCalled();
  });

  it("vide la file quand le verrou est libre", async () => {
    const request = verrous(true);
    await viderLaFile(IDENTITE);
    expect(ouvrirBase).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe("elsatia:gp:vidange:ent-a:usr-1");
    expect(request.mock.calls[0][1]).toEqual({ ifAvailable: true });
  });

  it("un verrou par identité : deux comptes du même appareil ne s'attendent pas", async () => {
    const request = verrous(true);
    await viderLaFile({ entrepriseId: "ent-a", utilisateurId: "usr-2" });
    expect(request.mock.calls[0][0]).toBe("elsatia:gp:vidange:ent-a:usr-2");
  });

  it("sans Web Locks (navigateur ancien), la vidange a lieu quand même", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    await viderLaFile(IDENTITE);
    expect(ouvrirBase).toHaveBeenCalledOnce();
  });
});
