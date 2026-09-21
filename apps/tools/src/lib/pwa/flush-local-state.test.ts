/**
 * Garde de la mise a l'abri du travail local avant un rechargement de mise a jour.
 *
 * Le test verifie le CONTRAT public emprunte a l'Atelier — un `pagehide` sur `window` — et non une
 * implementation interne : c'est precisement parce que l'Atelier ne doit pas etre modifie que ce
 * contrat doit rester teste ici.
 */
import { afterEach, describe, expect, it } from "vitest";
import { flushLocalState, FLUSH_GRACE_MS } from "./flush-local-state";

const original = Reflect.get(globalThis, "window");

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis, "window");
  else Reflect.set(globalThis, "window", original);
});

function installFakeWindow(dispatch: (event: Event) => boolean) {
  Reflect.set(globalThis, "window", { dispatchEvent: dispatch });
}

describe("mise a l'abri du travail local", () => {
  it("emet `pagehide` sur window — l'evenement auquel l'autosave Atelier est deja abonne", async () => {
    const seen: string[] = [];
    installFakeWindow((event) => { seen.push(event.type); return true; });

    await flushLocalState(0);
    expect(seen).toEqual(["pagehide"]);
  });

  it("laisse un delai a l'ecriture locale avant de rendre la main", async () => {
    installFakeWindow(() => true);
    const started = Date.now();
    await flushLocalState(30);
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    expect(FLUSH_GRACE_MS).toBeGreaterThan(0);
  });

  it("ne jette pas si l'emission echoue : le rechargement reste possible", async () => {
    installFakeWindow(() => { throw new Error("pas d'evenement ici"); });
    await expect(flushLocalState(0)).resolves.toBeUndefined();
  });

  it("ne fait rien hors navigateur (rendu serveur)", async () => {
    Reflect.deleteProperty(globalThis, "window");
    await expect(flushLocalState(0)).resolves.toBeUndefined();
  });
});
