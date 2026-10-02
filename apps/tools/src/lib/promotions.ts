import { hasCapability, type AccessContext } from "./access";
import { elsatiaAppUrls, type ElsatiaAppUrls } from "./site";

export type PromotionPlacement = "tool-result" | "tool-footer" | "home-footer";
export type PromotionContext = "painting" | "quantitative" | "project" | "general";
export type ElsatiaPromotion = { id: string; application: "gestion-pro" | "colors"; title: string; description: string; cta: string; url: string; placement: PromotionPlacement; contexts: readonly PromotionContext[]; active: boolean; priority: number };

/** URL de l'application promue pour l'environnement ; `null` désactive la promotion (A-08). */
export function buildPromotions(urls: ElsatiaAppUrls = elsatiaAppUrls()): readonly ElsatiaPromotion[] {
  const promotion = (p: Omit<ElsatiaPromotion, "url" | "active">, url: string | null): ElsatiaPromotion => ({ ...p, url: url ?? "", active: url !== null });
  return [
    promotion({ id: "gestion-pro-quantitatifs", application: "gestion-pro", title: "Continuez dans ELSATIA Gestion Pro", description: "Transformez vos quantitatifs en suivi de chantier, devis et commandes.", cta: "Découvrir Gestion Pro", placement: "tool-footer", contexts: ["quantitative", "project"], priority: 10 }, urls.gestionPro),
    promotion({ id: "colors-peinture", application: "colors", title: "Vous gérez aussi vos restes de peinture ?", description: "Centralisez vos nuanciers, références et stocks dans ELSATIA Colors.", cta: "Découvrir Colors", placement: "tool-footer", contexts: ["painting"], priority: 20 }, urls.colors),
  ];
}

export const promotions: readonly ElsatiaPromotion[] = buildPromotions();

export function getPromotion(id?: string) { return id ? promotions.find((promotion) => promotion.id === id && promotion.active) : undefined; }

export function getPromotionForAccess(id: string | undefined, access: AccessContext) {
  if (hasCapability(access, "promotion-free")) return undefined;
  return getPromotion(id);
}
