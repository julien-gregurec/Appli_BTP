import { describe, expect, it } from "vitest";
import { canAccessTier, ENTITLEMENT_SOURCES, FREE_ACCESS, hasCapability, resolveAccess } from "./access";

describe("entitlements Free / Pro", () => {
  it("accorde durablement les calculs fondamentaux au niveau Free", () => {
    expect(canAccessTier(FREE_ACCESS, "free")).toBe(true);
    expect(hasCapability(FREE_ACCESS, "basic-calculation")).toBe(true);
    expect(hasCapability(FREE_ACCESS, "export-pdf")).toBe(false);
  });

  it.each(["web", "apple", "google", "elsatia", "internal"] as const)("peut accorder Pro depuis la source %s", (source) => {
    const access = resolveAccess([{ tier: "pro", source }]);
    expect(access.tier).toBe("pro");
    expect(hasCapability(access, "export-svg")).toBe(true);
    expect(hasCapability(access, "print-plan")).toBe(true);
    expect(hasCapability(access, "native-share")).toBe(true);
    expect(hasCapability(access, "project-duplicate")).toBe(true);
    expect(hasCapability(access, "project-archive")).toBe(true);
  });

  it("ignore un droit expiré", () => {
    expect(resolveAccess([{ tier: "pro", source: "apple", expiresAt: "2020-01-01" }]).tier).toBe("free");
  });

  it("énumère les sources futures sans dépendre d’un fournisseur de paiement", () => {
    expect(ENTITLEMENT_SOURCES).toEqual(["free-default", "web", "apple", "google", "elsatia", "internal"]);
  });

  it("ne contient aucun mécanisme client permettant de forcer Pro", async () => {
    expect("getLocalAccess" in await import("./access")).toBe(false);
  });
});
