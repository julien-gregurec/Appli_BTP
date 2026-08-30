export const ACCESS_TIERS = ["free", "pro"] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];

export const CAPABILITIES = [
  "basic-calculation", "basic-tracing", "site-instructions", "advanced-layout",
  "dimensioned-plan", "export-pdf", "export-svg", "saved-projects",
  "advanced-tracing", "promotion-free",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type EntitlementSource = "free-default" | "direct-purchase" | "tools-subscription" | "elsatia-ecosystem" | "internal";
export type AccessGrant = { tier: AccessTier; source: EntitlementSource; expiresAt?: string };
export type AccessContext = { tier: AccessTier; capabilities: ReadonlySet<Capability>; source: EntitlementSource };

const TIER_CAPABILITIES: Record<AccessTier, readonly Capability[]> = {
  free: ["basic-calculation", "basic-tracing", "site-instructions"],
  pro: CAPABILITIES,
};

export const FREE_ACCESS: AccessContext = { tier: "free", capabilities: new Set(TIER_CAPABILITIES.free), source: "free-default" };

export function resolveAccess(grants: readonly AccessGrant[] = []): AccessContext {
  const now = Date.now();
  const active = grants.filter((grant) => !grant.expiresAt || Date.parse(grant.expiresAt) > now);
  const best = active.find((grant) => grant.tier === "pro") ?? active[0];
  const tier = best?.tier ?? "free";
  return { tier, capabilities: new Set(TIER_CAPABILITIES[tier]), source: best?.source ?? "free-default" };
}

export function hasCapability(access: AccessContext, capability: Capability) { return access.capabilities.has(capability); }
export function canAccessTier(access: AccessContext, required: AccessTier) { return required === "free" || access.tier === "pro"; }
