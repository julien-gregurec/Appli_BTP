import { hasCapability, type AccessContext } from "./access";
import { EXTERNAL_URLS } from "./site";

export type PromotionPlacement = "tool-result" | "tool-footer" | "home-footer";
export type PromotionContext = "painting" | "quantitative" | "project" | "general";
export type ElsatiaPromotion = { id: string; application: "gestion-pro" | "colors"; title: string; description: string; cta: string; url: string; placement: PromotionPlacement; contexts: readonly PromotionContext[]; active: boolean; priority: number };

export const promotions: readonly ElsatiaPromotion[] = [
  { id: "gestion-pro-quantitatifs", application: "gestion-pro", title: "Continuez dans ELSATIA Gestion Pro", description: "Transformez vos quantitatifs en suivi de chantier, devis et commandes.", cta: "Découvrir Gestion Pro", url: EXTERNAL_URLS.gestionPro, placement: "tool-footer", contexts: ["quantitative", "project"], active: true, priority: 10 },
  { id: "colors-peinture", application: "colors", title: "Vous gérez aussi vos restes de peinture ?", description: "Centralisez vos nuanciers, références et stocks dans ELSATIA Colors.", cta: "Découvrir Colors", url: EXTERNAL_URLS.colors, placement: "tool-footer", contexts: ["painting"], active: true, priority: 20 },
];

export function getPromotion(id?: string) { return id ? promotions.find((promotion) => promotion.id === id && promotion.active) : undefined; }

export function getPromotionForAccess(id: string | undefined, access: AccessContext) {
  if (hasCapability(access, "promotion-free")) return undefined;
  return getPromotion(id);
}
