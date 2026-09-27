/**
 * Contrat technique de l'entitlement premium `releve-metre`.
 *
 * Décisions matérialisées (lot 2) :
 * - Relevé & Métré reste **dans Tools** : même application, même compte, même résolveur
 *   `tools_resoudre_entitlements()`.
 * - C'est une **capability d'add-on**, pas un troisième palier : elle n'est jamais incluse
 *   dans `tier: "pro"` par défaut. Un Tools Pro existant ne l'obtient pas.
 * - Prix **de référence** 24,90 € HT / mois / utilisateur et 249 € HT / an / utilisateur,
 *   définis UNIQUEMENT dans {@link RELEVE_METRE_OFFER} (ni SQL, ni UI, ni store).
 *   Aucun produit Stripe, App Store ni Google Play n'existe ; aucun SKU n'est accepté par la
 *   base (`tools_monetization_subscriptions.product_sku` inchangé). L'attribution n'est
 *   possible que par la plateforme (source `internal` / `elsatia`, rôle total/facturation,
 *   AAL2) ou pour le propriétaire global (`plateforme`).
 */

export const RELEVE_METRE_CAPABILITY = "releve-metre" as const;
export type ReleveMetreCapability = typeof RELEVE_METRE_CAPABILITY;

/** Capabilities vendues séparément du palier Pro. */
export const TOOLS_ADDON_CAPABILITIES = [RELEVE_METRE_CAPABILITY] as const;

export type ReleveMetreOffer = {
  readonly capability: ReleveMetreCapability;
  readonly currency: "EUR";
  readonly vat: "HT";
  readonly perUser: true;
  readonly monthlyPriceCents: number;
  readonly annualPriceCents: number;
  /** SKU prévus (lot 21). Aucun n'est accepté par la base ni publié dans un store. */
  readonly plannedSkus: readonly ["tools_releve_monthly", "tools_releve_annual"];
  /** Relevé Pro inclut les capabilities Tools Pro (recommandation audit §0.2-3). */
  readonly includesToolsPro: true;
  /** `working-price` tant que la décision de prix finale (lot 21) n'est pas prise. */
  readonly status: "working-price" | "active";
  /** Interrupteur unique, validé explicitement par le dirigeant avant toute vente. */
  readonly commercialActivation: boolean;
};

/** Seul interrupteur de la relation d'inclusion côté domaine (miroir de `offres_incluses`). */
const RELEVE_METRE_OFFER_INCLUDES_TOOLS_PRO = true;

export const RELEVE_METRE_OFFER: ReleveMetreOffer = Object.freeze({
  capability: RELEVE_METRE_CAPABILITY,
  currency: "EUR",
  vat: "HT",
  perUser: true,
  monthlyPriceCents: 2490,
  annualPriceCents: 24900,
  plannedSkus: ["tools_releve_monthly", "tools_releve_annual"] as const,
  includesToolsPro: RELEVE_METRE_OFFER_INCLUDES_TOOLS_PRO,
  status: "working-price",
  commercialActivation: false,
});

/** Sources autorisées à porter `releve-metre` tant que la commercialisation est fermée. */
export const RELEVE_METRE_GRANT_SOURCES = ["internal", "elsatia", "plateforme"] as const;

// ── Offres (relation Relevé Pro ⊃ Tools Pro) ──────────────────────────────────

/**
 * 18 capabilities du palier Tools Pro — miroir de `tools_capabilities_pro()` (SQL) et de
 * `PRO_CAPABILITIES` (apps/tools/src/lib/access.ts) ; la parité est testée.
 */
export const TOOLS_PRO_CAPABILITIES = [
  "basic-calculation", "basic-tracing", "site-instructions", "advanced-layout", "dimensioned-plan",
  "export-pdf", "export-svg", "saved-projects", "advanced-tracing", "promotion-free",
  "advanced-geometry", "construction-points", "design-shapes", "derived-quantities",
  "print-plan", "native-share", "project-duplicate", "project-archive",
] as const;

export type ToolsOfferCode = "tools_pro" | "releve_pro";
export type ToolsOffer = {
  readonly code: ToolsOfferCode;
  readonly libelle: string;
  /** Capability qui signale l'offre ; `null` pour le palier de base (jamais déduit). */
  readonly capabilityCle: string | null;
  readonly capabilities: readonly string[];
  readonly offresIncluses: readonly ToolsOfferCode[];
  readonly commercialementActive: boolean;
};

/**
 * Miroir de `tools_offres_catalogue` (migration 20260926000501). Aucun prix ici : le prix de
 * référence n'existe qu'en un seul endroit, {@link RELEVE_METRE_OFFER}.
 */
export const TOOLS_OFFERS: Readonly<Record<ToolsOfferCode, ToolsOffer>> = Object.freeze({
  tools_pro: { code: "tools_pro", libelle: "Tools Pro", capabilityCle: null, capabilities: TOOLS_PRO_CAPABILITIES, offresIncluses: [], commercialementActive: true },
  releve_pro: {
    code: "releve_pro", libelle: "Relevé & Métré Pro", capabilityCle: RELEVE_METRE_CAPABILITY, capabilities: TOOLS_ADDON_CAPABILITIES,
    // Décision de travail (à confirmer au lot 21) : Relevé Pro inclut Tools Pro.
    offresIncluses: RELEVE_METRE_OFFER_INCLUDES_TOOLS_PRO ? ["tools_pro"] : [],
    commercialementActive: false,
  },
});

/** Capabilities d'une offre, offres incluses comprises (miroir de `tools_capabilities_offre`). */
export function offerCapabilities(code: ToolsOfferCode): string[] {
  const offer = TOOLS_OFFERS[code];
  const all = new Set<string>(offer.capabilities);
  for (const included of offer.offresIncluses) for (const capability of TOOLS_OFFERS[included].capabilities) all.add(capability);
  return [...all].sort();
}

/**
 * Étend des capabilities avec celles des offres qu'elles signalent (miroir de
 * `tools_capabilities_etendues`). Tools Free / Pro sans add-on : ensemble inchangé.
 */
export function expandOfferCapabilities(capabilities: Iterable<string>): string[] {
  const all = new Set<string>(capabilities);
  for (const offer of Object.values(TOOLS_OFFERS)) {
    if (offer.capabilityCle && all.has(offer.capabilityCle)) for (const capability of offerCapabilities(offer.code)) all.add(capability);
  }
  return [...all].sort();
}

export function hasReleveMetre(capabilities: Iterable<string>): boolean {
  for (const capability of capabilities) if (capability === RELEVE_METRE_CAPABILITY) return true;
  return false;
}

/**
 * Garde-fou de non-activation : vrai uniquement si un parcours d'achat pouvait réellement
 * vendre le module. Tant que l'offre est en prix de travail, toujours faux.
 */
export function isReleveMetrePurchasable(offer: ReleveMetreOffer = RELEVE_METRE_OFFER): boolean {
  return offer.commercialActivation === true && offer.status !== "working-price";
}

export function formatWorkingPrice(cents: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} € HT`;
}
