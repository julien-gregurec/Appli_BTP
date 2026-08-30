import { describe, expect, it } from "vitest";
import { canAccessTier, ENTITLEMENT_SOURCES, FREE_ACCESS, getLocalAccess, hasCapability, resolveAccess } from "./access";

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

  it("n’accorde Pro localement que par le mécanisme interne explicite", () => {
    const previous = process.env.NEXT_PUBLIC_TOOLS_INTERNAL_PRO;
    delete process.env.NEXT_PUBLIC_TOOLS_INTERNAL_PRO;
    expect(getLocalAccess().tier).toBe("free");
    process.env.NEXT_PUBLIC_TOOLS_INTERNAL_PRO = "1";
    expect(getLocalAccess()).toMatchObject({ tier: "pro", source: "internal" });
    if (previous === undefined) delete process.env.NEXT_PUBLIC_TOOLS_INTERNAL_PRO; else process.env.NEXT_PUBLIC_TOOLS_INTERNAL_PRO = previous;
  });
});
