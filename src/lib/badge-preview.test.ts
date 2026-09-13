import { describe, expect, it } from "vitest";
import { badgePreviewVisible } from "./badge-preview";

describe("badgePreviewVisible", () => {
  it("n'apparaît que si le drapeau vaut 1", () => {
    expect(badgePreviewVisible({ drapeau: undefined, vercelEnv: "preview", appUrl: "https://elsatia-preview.vercel.app" })).toBe(false);
    expect(badgePreviewVisible({ drapeau: "0", vercelEnv: "preview", appUrl: "https://elsatia-preview.vercel.app" })).toBe(false);
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: "preview", appUrl: "https://elsatia-preview.vercel.app" })).toBe(true);
  });

  it("est absent de tout déploiement promu en Production, même drapeau posé", () => {
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: "production", appUrl: "https://elsatia-preview.vercel.app" })).toBe(false);
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: "Production", appUrl: undefined })).toBe(false);
  });

  it("est absent sous l'adresse publique de Production, même sans indice Vercel", () => {
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: undefined, appUrl: "https://app.elsatia.fr" })).toBe(false);
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: undefined, appUrl: "app.elsatia.fr/" })).toBe(false);
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: undefined, appUrl: "https://staging.elsatia.fr" })).toBe(true);
  });

  it("reste visible en développement local sans indice", () => {
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: undefined, appUrl: "http://localhost:3000" })).toBe(true);
    expect(badgePreviewVisible({ drapeau: "1", vercelEnv: undefined, appUrl: "n'importe quoi" })).toBe(true);
  });
});
