/**
 * Contrat technique de l'entitlement premium `releve-metre`.
 *
 * Décisions matérialisées (lot 2) :
 * - Relevé & Métré reste **dans Tools** : même application, même compte, même résolveur
 *   `tools_resoudre_entitlements()`.
 * - C'est une **capability d'add-on**, pas un troisième palier : elle n'est jamais incluse
 *   dans `tier: "pro"` par défaut. Un Tools Pro existant ne l'obtient pas.
 * - Prix **de travail** 24,90 € HT / mois / utilisateur et 249 € HT / an / utilisateur.
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

export const RELEVE_METRE_OFFER: ReleveMetreOffer = Object.freeze({
  capability: RELEVE_METRE_CAPABILITY,
  currency: "EUR",
  vat: "HT",
  perUser: true,
  monthlyPriceCents: 2490,
  annualPriceCents: 24900,
  plannedSkus: ["tools_releve_monthly", "tools_releve_annual"] as const,
  includesToolsPro: true,
  status: "working-price",
  commercialActivation: false,
});

/** Sources autorisées à porter `releve-metre` tant que la commercialisation est fermée. */
export const RELEVE_METRE_GRANT_SOURCES = ["internal", "elsatia", "plateforme"] as const;

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
