/**
 * Garde de l'ouverture de la vue d'impression.
 *
 * `window.open(url, name, "noopener")` renvoie TOUJOURS `null` par specification : la vue
 * d'impression ne peut donc pas etre demandee avec cette option, sans quoi l'utilisateur
 * recoit systematiquement « Autorisez l'ouverture de la vue d'impression. » alors que la
 * fenetre s'est bien ouverte. Le test verrouille le contrat : handle exploitable, ecoute du
 * `load` posee AVANT `document.close()` (qui declenche cet evenement), puis `print()`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createToolProject } from "../projects/model";
import { proToolDefaults } from "../pro-engine";
import { buildProjectDocument } from "./document";
import { printProjectDocument } from "./print";

const original = Reflect.get(globalThis, "window");

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis, "window");
  else Reflect.set(globalThis, "window", original);
});

const project = createToolProject({ name: "Impression / Recette", siteName: "Pilote", toolId: "fleur-6", inputParameters: proToolDefaults["fleur-6"], notes: "" }, new Date("2026-09-06T10:00:00Z"), "12345678-1234-1234-1234-123456789012");
const projectDocument = buildProjectDocument(project, new Date("2026-09-06T12:00:00Z"));

function installFakeWindow() {
  const calls: string[] = [];
  let written = "";
  let features: string | undefined = "unset";
  const target = {
    opener: {} as unknown,
    document: {
      open: () => { calls.push("open"); },
      write: (html: string) => { written = html; calls.push("write"); },
      close: () => { calls.push("close"); listeners.forEach((listener) => listener()); },
    },
    focus: () => { calls.push("focus"); },
    print: () => { calls.push("print"); },
    addEventListener: (type: string, listener: () => void) => { calls.push(`listen:${type}`); listeners.push(listener); },
  };
  const listeners: Array<() => void> = [];
  Reflect.set(globalThis, "window", { open: (_url: string, _name: string, feat?: string) => { features = feat; return target; } });
  return { calls, target, getWritten: () => written, getFeatures: () => features };
}

describe("ouverture de la vue d'impression", () => {
  it("n'utilise aucune option `noopener` : sinon le handle est toujours nul", () => {
    const fake = installFakeWindow();
    printProjectDocument(projectDocument);
    expect(fake.getFeatures()).toBeUndefined();
  });

  it("ecrit le document puis declenche l'impression", () => {
    const fake = installFakeWindow();
    printProjectDocument(projectDocument);
    expect(fake.calls).toEqual(["listen:load", "open", "write", "close", "focus", "print"]);
    expect(fake.getWritten()).toContain("ELSATIA");
  });

  it("coupe `opener` : la fenetre ecrite ne garde pas de lien vers l'application", () => {
    const fake = installFakeWindow();
    printProjectDocument(projectDocument);
    expect(fake.target.opener).toBeNull();
  });

  it("signale a l'utilisateur un blocage reel de fenetre", () => {
    Reflect.set(globalThis, "window", { open: () => null });
    expect(() => printProjectDocument(projectDocument)).toThrow(/Autorisez/);
  });
});
