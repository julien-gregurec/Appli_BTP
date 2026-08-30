import { describe, expect, it } from "vitest";
import { canAccessTier, FREE_ACCESS, hasCapability, resolveAccess } from "./access";

describe("entitlements Free / Pro", () => {
  it("accorde durablement les calculs fondamentaux au niveau Free", () => {
    expect(canAccessTier(FREE_ACCESS, "free")).toBe(true);
    expect(hasCapability(FREE_ACCESS, "basic-calculation")).toBe(true);
    expect(hasCapability(FREE_ACCESS, "export-pdf")).toBe(false);
  });

  it.each(["direct-purchase", "tools-subscription", "elsatia-ecosystem", "internal"] as const)("peut accorder Pro depuis la source %s", (source) => {
    const access = resolveAccess([{ tier: "pro", source }]);
    expect(access.tier).toBe("pro");
    expect(hasCapability(access, "export-svg")).toBe(true);
  });

  it("ignore un droit expiré", () => {
    expect(resolveAccess([{ tier: "pro", source: "tools-subscription", expiresAt: "2020-01-01" }]).tier).toBe("free");
  });
});
