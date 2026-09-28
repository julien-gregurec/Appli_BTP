// ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1 — B-5 : l'écran de souscription annonce
// exactement ce que Checkout fera (essai restant, moins de 48 h, expiré, réabonnement).
import { describe, expect, it } from "vitest";
import { calculerEssaiCheckout, essaiReabonnement, libellesSouscription } from "./stripe-essai-checkout";

const essai = { essaiDebut: "2026-10-01", essaiFin: "2026-10-31" };

describe("libellesSouscription", () => {
  it("essai en cours (≥ 48 h) : aucun paiement avant la fin de l'essai local", () => {
    const l = libellesSouscription(calculerEssaiCheckout(essai, new Date("2026-10-10T12:00:00Z")), false);
    expect(l).toMatchObject({ bouton: "Choisir cette offre", paiementImmediat: false });
    expect(l.description).toContain("31/10/2026");
  });

  it("moins de 48 h : paiement immédiat annoncé", () => {
    const l = libellesSouscription(calculerEssaiCheckout(essai, new Date("2026-10-30T23:59:59Z")), false);
    expect(l).toMatchObject({ bouton: "Souscrire (paiement immédiat)", paiementImmediat: true });
    expect(l.description).toContain("moins de 48 heures");
  });

  it("frontière exacte 48 h : encore un essai", () => {
    // fin locale = 2026-10-31T23:59:59Z ; 48 h avant = 2026-10-29T23:59:59Z.
    expect(libellesSouscription(calculerEssaiCheckout(essai, new Date("2026-10-29T23:59:59Z")), false).paiementImmediat).toBe(false);
    expect(libellesSouscription(calculerEssaiCheckout(essai, new Date("2026-10-30T00:00:00Z")), false).paiementImmediat).toBe(true);
  });

  it("essai expiré : jamais « essai gratuit », paiement immédiat", () => {
    const l = libellesSouscription(calculerEssaiCheckout(essai, new Date("2026-11-02T00:00:00Z")), false);
    expect(l.description).toContain("période d’essai est terminée");
    expect(l.bouton).not.toMatch(/essai/i);
    expect(l.paiementImmediat).toBe(true);
  });

  it("réabonnement : aucun essai, libellés de réactivation inchangés", () => {
    expect(libellesSouscription(essaiReabonnement(), false)).toMatchObject({ bouton: "Réactiver avec cette offre", paiementImmediat: true });
    expect(libellesSouscription(calculerEssaiCheckout(essai, new Date("2026-10-10T00:00:00Z")), true).bouton).toBe("Réactiver avec cette offre");
  });
});
