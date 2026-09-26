import { describe, expect, it } from "vitest";
import {
  applicationsAssistables,
  applicationsCiblables,
  estCodeApplication,
  trouverApplication,
  type ApplicationCatalogue,
} from "./applications";

const catalogue: ApplicationCatalogue[] = [
  { code: "gestion_pro", nom: "ELSATIA Gestion Pro", actif: true, portee: "entreprise" },
  { code: "colors", nom: "ELSATIA Colors", actif: true, portee: "entreprise" },
  { code: "reserves", nom: "ELSATIA Réserves", actif: true, portee: "entreprise" },
  { code: "tools", nom: "ELSATIA Tools", actif: true, portee: "compte" },
  { code: "drone", nom: "ELSATIA Drone / Scan", actif: false, portee: "entreprise" },
];

describe("catalogue", () => {
  it("valide un code d'application", () => {
    expect(estCodeApplication("drone_scan")).toBe(true);
    expect(estCodeApplication("Drone")).toBe(false);
    expect(estCodeApplication("")).toBe(false);
    expect(estCodeApplication(42)).toBe(false);
  });

  it("une application « compte » n'est jamais assistable au titre d'une entreprise", () => {
    expect(applicationsAssistables(catalogue).map((a) => a.code)).toEqual([
      "gestion_pro",
      "colors",
      "reserves",
    ]);
  });

  it("une communication peut cibler Tools, contrairement à une session d'assistance", () => {
    expect(applicationsCiblables(catalogue).map((a) => a.code)).toContain("tools");
  });

  it("une application inactive est exclue des deux", () => {
    expect(applicationsAssistables(catalogue).map((a) => a.code)).not.toContain("drone");
    expect(applicationsCiblables(catalogue).map((a) => a.code)).not.toContain("drone");
  });

  it("une application future activée entre sans modification de code", () => {
    const avecDrone = catalogue.map((a) => (a.code === "drone" ? { ...a, actif: true } : a));
    expect(applicationsAssistables(avecDrone).map((a) => a.code)).toContain("drone");
  });

  it("retrouve une application par code", () => {
    expect(trouverApplication(catalogue, "colors")?.nom).toBe("ELSATIA Colors");
    expect(trouverApplication(catalogue, "inconnue")).toBeNull();
  });
});
