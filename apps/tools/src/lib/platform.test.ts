import { describe, expect, it } from "vitest";
import { normalizeRuntimePlatform, resolveToolsDeepLink } from "./platform";

describe("plateformes et liens applicatifs", () => {
  it("ne considère iOS ou Android comme natif que dans Capacitor", () => {
    expect(normalizeRuntimePlatform("ios", true)).toBe("ios");
    expect(normalizeRuntimePlatform("android", true)).toBe("android");
    expect(normalizeRuntimePlatform("ios", false)).toBe("web");
    expect(normalizeRuntimePlatform("electron", true)).toBe("web");
  });

  it("accepte uniquement les routes Tools sûres du domaine canonique", () => {
    expect(resolveToolsDeepLink("https://tools.elsatia.fr/outils/pythagore")).toBe("/outils/pythagore");
    expect(resolveToolsDeepLink("https://tools.elsatia.fr/outils/pente/?mode=2")).toBe("/outils/pente/?mode=2");
    expect(resolveToolsDeepLink("https://example.com/outils/pente")).toBeNull();
    expect(resolveToolsDeepLink("https://tools.elsatia.fr/admin")).toBeNull();
  });
});
