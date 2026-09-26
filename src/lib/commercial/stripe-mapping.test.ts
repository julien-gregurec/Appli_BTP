import { describe, expect, it } from "vitest";
import {
  LONGUEUR_MAX_NOM_COUPON,
  couponAbonnementSuffit,
  mecanismeStripePour,
  metadonneesStripeRemise,
  variablePrixForfait,
  variablePrixModule,
  variablesStripeAttendues,
} from "@/lib/commercial/stripe-mapping";
import type { Remise } from "@/lib/commercial/types";

const base: Remise = {
  id: "r1",
  type: "pourcentage",
  valeur: 50,
  perimetre: { cible: "abonnement" },
  duree: { mode: "nb_echeances", debut: "2026-10-01", nombre: 2 },
  etat: "active",
  motif: "Geste commercial de lancement",
};

describe("mapping Stripe du catalogue", () => {
  it("réutilise les variables de forfait existantes", () => {
    expect(variablePrixForfait("mini", "mensuel")).toBe("STRIPE_PRICE_MINI_MENSUEL");
    expect(variablesStripeAttendues().existantes).toContain("STRIPE_PRICE_COMPTE_SUP_PRO_ANNUEL");
  });

  it("nomme les Price modules à créer, uniquement là où le module est vendable", () => {
    const { aCreer } = variablesStripeAttendues();
    expect(aCreer).toContain(variablePrixModule("stock", "mini", "mensuel"));
    expect(aCreer).toContain(variablePrixModule("rentabilite_avancee", "pro", "annuel"));
    // Inclus dans Business : aucun Price à la carte.
    expect(aCreer).not.toContain(variablePrixModule("stock", "business", "mensuel"));
    // Non vendable (statut « bientôt ») : aucun Price.
    expect(aCreer.some((v) => v.includes("SAFETY"))).toBe(false);
    // Non proposé sur Mini.
    expect(aCreer).not.toContain(variablePrixModule("rentabilite_avancee", "mini", "mensuel"));
  });
});

describe("mécanisme Stripe par type de remise", () => {
  it("un pourcentage passe par un coupon, jamais par un Price dédié", () => {
    const mensuel = mecanismeStripePour(base, "mensuel");
    expect(mensuel).toEqual({ mecanisme: "coupon", duration: "repeating", durationInMonths: 2, champ: "percent_off" });
  });

  it("une remise d'une échéance est un coupon `once`", () => {
    expect(mecanismeStripePour({ ...base, duree: { mode: "une_echeance", debut: "2026-10-01" } }, "mensuel"))
      .toMatchObject({ mecanisme: "coupon", duration: "once" });
  });

  it("une remise permanente ou jusqu'à révocation est un coupon `forever`", () => {
    expect(mecanismeStripePour({ ...base, duree: { mode: "permanente", debut: "2026-10-01" } }, "mensuel"))
      .toMatchObject({ duration: "forever" });
    expect(mecanismeStripePour({ ...base, duree: { mode: "jusqu_a_revocation", debut: "2026-10-01" } }, "mensuel"))
      .toMatchObject({ duration: "forever" });
  });

  it("un montant fixe est un `amount_off`", () => {
    expect(mecanismeStripePour({ ...base, type: "montant", valeur: 1_000 }, "mensuel"))
      .toMatchObject({ champ: "amount_off" });
  });

  it("un prix négocié exige un Price dédié, jamais un coupon recalculé", () => {
    const mecanisme = mecanismeStripePour({ ...base, type: "prix_negocie", valeur: 3_950 }, "mensuel");
    expect(mecanisme.mecanisme).toBe("price_dedie");
  });

  it("refuse d'exprimer des échéances annuelles avec `duration_in_months`", () => {
    expect(mecanismeStripePour(base, "annuel").mecanisme).toBe("credit_commercial");
  });

  it("refuse d'exprimer une fenêtre de dates par un coupon", () => {
    expect(mecanismeStripePour({ ...base, duree: { mode: "dates", debut: "2026-10-01", fin: "2026-12-01" } }, "mensuel").mecanisme)
      .toBe("credit_commercial");
  });

  it("sait qu'un coupon d'abonnement ne suffit pas pour un périmètre restreint", () => {
    expect(couponAbonnementSuffit(base)).toBe(true);
    expect(couponAbonnementSuffit({ ...base, perimetre: { cible: "modules", cles: ["stock"] } })).toBe(false);
    expect(couponAbonnementSuffit({ ...base, perimetre: { cible: "forfait" } })).toBe(false);
  });

  it("attache une métadonnée traçable et ne dépasse pas la limite de nom", () => {
    const metadonnees = metadonneesStripeRemise(base);
    expect(metadonnees.elsatia_remise_id).toBe("r1");
    expect(metadonnees.elsatia_perimetre).toBe("abonnement");
    expect(LONGUEUR_MAX_NOM_COUPON).toBe(40);
  });
});
