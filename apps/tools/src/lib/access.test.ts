import { describe, expect, it } from "vitest";
import { TOOLS_ADDON_CAPABILITIES } from "@elsatia/releve-domain";
import { ADDON_CAPABILITIES, CAPABILITIES, canAccessTier, ENTITLEMENT_SOURCES, FREE_ACCESS, hasCapability, PRO_CAPABILITIES, resolveAccess } from "./access";
import { entitlementToAccess } from "./entitlements";

describe("entitlements Free / Pro", () => {
  it("accorde durablement les calculs fondamentaux au niveau Free", () => {
    expect(canAccessTier(FREE_ACCESS, "free")).toBe(true);
    expect(hasCapability(FREE_ACCESS, "basic-calculation")).toBe(true);
    expect(hasCapability(FREE_ACCESS, "export-pdf")).toBe(false);
  });

  it.each(["web", "apple", "google", "elsatia", "internal", "plateforme"] as const)("peut accorder Pro depuis la source %s", (source) => {
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
    expect(ENTITLEMENT_SOURCES).toEqual(["free-default", "web", "apple", "google", "elsatia", "internal", "plateforme"]);
  });

  it("ne contient aucun mécanisme client permettant de forcer Pro", async () => {
    expect("getLocalAccess" in await import("./access")).toBe(false);
  });
});

describe("capability d'add-on releve-metre", () => {
  it("n'est jamais incluse dans le palier Pro", () => {
    expect(ADDON_CAPABILITIES).toEqual(["releve-metre"]);
    expect(PRO_CAPABILITIES).toHaveLength(18);
    expect(PRO_CAPABILITIES as readonly string[]).not.toContain("releve-metre");
    for (const source of ["web", "apple", "google", "elsatia", "internal", "plateforme"] as const) {
      expect(hasCapability(resolveAccess([{ tier: "pro", source }]), "releve-metre")).toBe(false);
    }
  });

  it("est reconnue quand le serveur la renvoie pour un compte Pro", () => {
    const base = { application: "tools" as const, source: "internal" as const, expires_at: null, validated_at: "2026-09-26T10:00:00Z", cache_version: 1, grace_seconds: 604800 };
    expect(hasCapability(entitlementToAccess({ ...base, tier: "pro", capabilities: ["saved-projects", "releve-metre"] }), "releve-metre")).toBe(true);
    expect(hasCapability(entitlementToAccess({ ...base, tier: "pro", capabilities: ["saved-projects"] }), "releve-metre")).toBe(false);
    /* Un palier Free ne porte jamais d'add-on, même si une charge forgée le prétend. */
    expect(hasCapability(entitlementToAccess({ ...base, tier: "free", capabilities: ["releve-metre"] }), "releve-metre")).toBe(false);
  });

  it("reste alignée sur la liste SQL et sur le domaine partagé", () => {
    expect([...PRO_CAPABILITIES, ...ADDON_CAPABILITIES]).toEqual([...CAPABILITIES]);
    expect([...ADDON_CAPABILITIES]).toEqual([...TOOLS_ADDON_CAPABILITIES]);
  });
});
