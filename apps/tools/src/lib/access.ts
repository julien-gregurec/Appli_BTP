export const ACCESS_TIERS = ["free", "pro"] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];

/** Capabilities du palier Pro — miroir de `tools_capabilities_pro()` (SQL). */
export const PRO_CAPABILITIES = [
  "basic-calculation", "basic-tracing", "site-instructions", "advanced-layout",
  "dimensioned-plan", "export-pdf", "export-svg", "saved-projects",
  "advanced-tracing", "promotion-free",
  "advanced-geometry", "construction-points", "design-shapes", "derived-quantities",
  "print-plan", "native-share", "project-duplicate", "project-archive",
] as const;
/**
 * Capabilities d'add-on (`tools_capabilities_addon()`), vendues séparément du palier Pro et
 * JAMAIS déduites d'un palier : seul le serveur peut les renvoyer. `releve-metre` ouvre le
 * sous-produit premium Relevé & Métré (non commercialisé, attribution interne uniquement).
 */
export const ADDON_CAPABILITIES = ["releve-metre"] as const;
export const CAPABILITIES = [...PRO_CAPABILITIES, ...ADDON_CAPABILITIES] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type AddonCapability = (typeof ADDON_CAPABILITIES)[number];
// `plateforme` n'est pas une source d'achat : elle identifie le niveau Pro résolu par le
// serveur pour le propriétaire global ELSATIA (et les administrateurs plateforme « total »).
// Elle n'est jamais écrite dans `entitlements_utilisateurs_elsatia` et ne peut pas être
// produite côté client : seule `tools_resoudre_entitlements()` peut la renvoyer.
export const ENTITLEMENT_SOURCES = ["free-default", "web", "apple", "google", "elsatia", "internal", "plateforme"] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];
export type AccessGrant = { tier: AccessTier; source: EntitlementSource; expiresAt?: string };
export type AccessContext = { tier: AccessTier; capabilities: ReadonlySet<Capability>; source: EntitlementSource };

const TIER_CAPABILITIES: Record<AccessTier, readonly Capability[]> = {
  free: ["basic-calculation", "basic-tracing", "site-instructions"],
  pro: PRO_CAPABILITIES,
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
