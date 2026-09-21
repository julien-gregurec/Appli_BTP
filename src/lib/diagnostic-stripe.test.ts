import { describe, expect, it } from "vitest";
import {
  abonnementsSilencieux,
  dernierEvenementParEntreprise,
  joursDepuis,
  modeDepuisPayload,
  texteDepuisPayload,
  STATUTS_FACTURE_EN_ECHEC,
} from "./diagnostic-stripe";

const MAINTENANT = Date.parse("2026-09-05T12:00:00.000Z");
const jour = (n: number) => new Date(MAINTENANT - n * 86_400_000).toISOString();

describe("joursDepuis", () => {
  it("compte les jours écoulés", () => {
    expect(joursDepuis(jour(3), MAINTENANT)).toBe(3);
  });
  it("renvoie null sur une valeur absente ou invalide", () => {
    expect(joursDepuis(null, MAINTENANT)).toBeNull();
    expect(joursDepuis("pas-une-date", MAINTENANT)).toBeNull();
  });
});

describe("dernierEvenementParEntreprise", () => {
  it("retient le plus récent et ignore les évènements sans entreprise", () => {
    const dernier = dernierEvenementParEntreprise([
      { entreprise_id: "a", created_at: jour(1) },
      { entreprise_id: "a", created_at: jour(9) },
      { entreprise_id: null, created_at: jour(0) },
    ]);
    expect(dernier.get("a")?.created_at).toBe(jour(1));
    expect(dernier.size).toBe(1);
  });
});

describe("abonnementsSilencieux", () => {
  const abonnements = [
    { id: "a", abonnement_statut: "actif", stripe_subscription_id: "sub_a" },
    { id: "b", abonnement_statut: "actif", stripe_subscription_id: "sub_b" },
    { id: "c", abonnement_statut: "annule", stripe_subscription_id: "sub_c" },
    { id: "d", abonnement_statut: "actif", stripe_subscription_id: null },
    { id: "e", abonnement_statut: "essai", stripe_subscription_id: "sub_e" },
  ];

  it("signale un abonnement actif silencieux au-delà du seuil, jamais un abonnement récent", () => {
    const dernier = dernierEvenementParEntreprise([
      { entreprise_id: "a", created_at: jour(1) },
      { entreprise_id: "b", created_at: jour(30) },
    ]);
    const silencieux = abonnementsSilencieux(abonnements, dernier, { maintenant: MAINTENANT });
    expect(silencieux.map((s) => s.id).sort()).toEqual(["b", "e"]);
  });

  it("ignore les abonnements annulés et ceux sans subscription Stripe", () => {
    const silencieux = abonnementsSilencieux(abonnements, new Map(), { maintenant: MAINTENANT });
    expect(silencieux.map((s) => s.id)).not.toContain("c");
    expect(silencieux.map((s) => s.id)).not.toContain("d");
  });

  it("traite l'absence totale d'évènement comme un silence", () => {
    const silencieux = abonnementsSilencieux(abonnements, new Map(), { maintenant: MAINTENANT });
    expect(silencieux.map((s) => s.id).sort()).toEqual(["a", "b", "e"]);
  });
});

describe("lecture bornée du payload journalisé", () => {
  it("n'expose que des chaînes non vides des clés attendues", () => {
    const payload = { subscription_id: "sub_1", object_id: "", customer_id: 42, livemode: false };
    expect(texteDepuisPayload(payload, "subscription_id")).toBe("sub_1");
    expect(texteDepuisPayload(payload, "object_id")).toBeNull();
    expect(texteDepuisPayload(payload, "customer_id")).toBeNull();
    expect(texteDepuisPayload(payload, "secret")).toBeNull();
    expect(texteDepuisPayload(null, "subscription_id")).toBeNull();
  });

  it("restitue le mode Stripe sans jamais inventer de valeur", () => {
    expect(modeDepuisPayload({ livemode: true })).toBe("live");
    expect(modeDepuisPayload({ livemode: false })).toBe("test");
    expect(modeDepuisPayload({})).toBeNull();
    expect(modeDepuisPayload(null)).toBeNull();
  });
});

describe("statuts de facture en échec", () => {
  it("exclut les factures payées et les brouillons", () => {
    expect(STATUTS_FACTURE_EN_ECHEC).not.toContain("paid");
    expect(STATUTS_FACTURE_EN_ECHEC).not.toContain("draft");
  });
});
