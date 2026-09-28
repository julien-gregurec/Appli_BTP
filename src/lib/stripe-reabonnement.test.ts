import { describe, expect, it } from "vitest";
import {
  ecranReabonnement,
  MESSAGE_REFUS_CHECKOUT,
  MESSAGES_REABONNEMENT,
  offresSouscriptibles,
  parcoursDepuisSubscription,
  parcoursViaPortail,
  subscriptionBloqueCheckout,
} from "./stripe-reabonnement";

// ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 — décision de parcours (pure).

describe("parcours depuis l'état Stripe relu", () => {
  it.each([
    [null, "premier_abonnement"],
    [{ status: "canceled" }, "nouveau_checkout"],
    [{ status: "incomplete_expired" }, "nouveau_checkout"],
    [{ status: "canceled", cancel_at_period_end: true }, "nouveau_checkout"],
    [{ status: "active", cancel_at_period_end: true }, "reprendre_portail"],
    [{ status: "trialing", cancel_at_period_end: true }, "reprendre_portail"],
    [{ status: "active", cancel_at: 1_800_000_000 }, "reprendre_portail"],
    [{ status: "past_due" }, "paiement_requis"],
    [{ status: "unpaid" }, "paiement_requis"],
    [{ status: "incomplete" }, "paiement_requis"],
    [{ status: "past_due", cancel_at_period_end: true }, "paiement_requis"],
    [{ status: "active" }, "actif"],
    [{ status: "trialing" }, "actif"],
    [{ status: "paused" }, "support"],
    [{ status: "statut_inconnu_futur" }, "support"],
  ] as const)("%j → %s", (sub, attendu) => {
    expect(parcoursDepuisSubscription(sub)).toBe(attendu);
  });

  it("réactivation préférée : toute subscription non terminée interdit un nouveau Checkout", () => {
    for (const status of ["trialing", "active", "past_due", "unpaid", "incomplete", "paused", "statut_inconnu"]) {
      expect(subscriptionBloqueCheckout({ status })).toBe(true);
    }
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(subscriptionBloqueCheckout({ status })).toBe(false);
    }
  });

  it("le Portail porte la reprise et le paiement ; jamais un Checkout", () => {
    expect(parcoursViaPortail("reprendre_portail")).toBe(true);
    expect(parcoursViaPortail("paiement_requis")).toBe(true);
    for (const p of ["premier_abonnement", "actif", "nouveau_checkout", "support"] as const) {
      expect(parcoursViaPortail(p)).toBe(false);
    }
  });
});

describe("écrans (état local, affichage seulement)", () => {
  const base = { stripeSubscriptionId: "sub_1", annulationPrevueAt: null, derniereFactureStatut: null, derniereFactureUrl: null };

  it("abonnement annulé → écran « Abonnement annulé » + offres re-souscriptibles", () => {
    expect(ecranReabonnement({ ...base, abonnementStatut: "annule" })).toEqual({ cle: "abonnement_annule" });
    expect(offresSouscriptibles({ abonnementStatut: "annule", stripeSubscriptionId: "sub_1" })).toBe(true);
  });

  it("résiliation programmée → « Reprendre l'abonnement »", () => {
    expect(ecranReabonnement({ ...base, abonnementStatut: "actif", annulationPrevueAt: "2026-12-31T00:00:00Z" }))
      .toEqual({ cle: "reprendre", finPrevueAt: "2026-12-31T00:00:00Z" });
  });

  it("paiement requis → lien de facture Stripe uniquement en https et si la facture est impayée", () => {
    expect(ecranReabonnement({ ...base, abonnementStatut: "suspendu", derniereFactureStatut: "open", derniereFactureUrl: "https://invoice.stripe.com/i/x" }))
      .toEqual({ cle: "paiement_requis", urlFacture: "https://invoice.stripe.com/i/x" });
    expect(ecranReabonnement({ ...base, abonnementStatut: "suspendu", derniereFactureStatut: "open", derniereFactureUrl: "javascript:alert(1)" }))
      .toEqual({ cle: "paiement_requis", urlFacture: null });
  });

  it("suspension sans facture impayée (administrative) : écran générique, jamais « Paiement requis »", () => {
    expect(ecranReabonnement({ ...base, abonnementStatut: "suspendu", derniereFactureStatut: "paid", derniereFactureUrl: "https://invoice.stripe.com/i/x" })).toBeNull();
    expect(ecranReabonnement({ ...base, abonnementStatut: "suspendu" })).toBeNull();
  });

  it("jamais souscrit ou actif sans résiliation → aucun écran de reprise ; offres ouvertes seulement sans subscription", () => {
    expect(ecranReabonnement({ ...base, stripeSubscriptionId: null, abonnementStatut: "annule" })).toBeNull();
    expect(ecranReabonnement({ ...base, abonnementStatut: "actif" })).toBeNull();
    expect(offresSouscriptibles({ abonnementStatut: "essai", stripeSubscriptionId: null })).toBe(true);
    for (const statut of ["essai", "actif", "suspendu"]) {
      expect(offresSouscriptibles({ abonnementStatut: statut, stripeSubscriptionId: "sub_1" })).toBe(false);
    }
  });

  it("messages : annulé, réactiver, reprendre, paiement requis, échec — sans promesse d'essai au réabonnement", () => {
    expect(MESSAGES_REABONNEMENT.abonnement_annule.titre).toBe("Abonnement annulé");
    expect(MESSAGES_REABONNEMENT.reactiver.libelle).toBe("Réactiver mon abonnement");
    expect(MESSAGES_REABONNEMENT.reprendre.libelle).toBe("Reprendre l’abonnement");
    expect(MESSAGES_REABONNEMENT.paiement_requis.titre).toBe("Paiement requis");
    expect(MESSAGES_REABONNEMENT.echec.titre).toBe("Réabonnement non finalisé");
    expect(MESSAGES_REABONNEMENT.abonnement_annule.description).toContain("sans nouvelle période d’essai");
    for (const texte of [MESSAGES_REABONNEMENT.reactiver.description, MESSAGES_REABONNEMENT.en_attente.description]) {
      expect(texte).not.toMatch(/essai gratuit|30 jours/);
    }
    expect(Object.keys(MESSAGE_REFUS_CHECKOUT).sort()).toEqual(["actif", "paiement_requis", "reprendre_portail", "support"]);
  });
});
