import {
  appliquerCouponAbonnement,
  creerCouponRemise,
  observerRemiseDepuisAbonnement,
  recupererAbonnementStripe,
  retirerCouponAbonnement,
} from "@/lib/stripe-abonnement";
import type { EtatSouhaiteRemise, PasserelleStripeRemise } from "@/lib/stripe-discount-consistency";

export const passerelleStripeRemise: PasserelleStripeRemise = {
  lire: recupererAbonnementStripe,
  observer: observerRemiseDepuisAbonnement,
  creerCoupon: (souhait: EtatSouhaiteRemise, cleIdempotence: string) => creerCouponRemise({
    type: souhait.type!,
    valeur: souhait.valeur!,
    duree: souhait.duree!,
    dureeMois: souhait.duree_mois ?? undefined,
    nom: souhait.nom_coupon!,
    cleIdempotence,
  }),
  appliquerCoupon: appliquerCouponAbonnement,
  retirerCoupon: retirerCouponAbonnement,
};
