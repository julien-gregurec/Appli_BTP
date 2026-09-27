import { describe, expect, it } from "vitest";
import { calculerEssaiCheckout, DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES } from "./stripe-essai-checkout";
// Miroir sans dépendance utilisé par le script Stripe Test distant.
import { DELAI_MINIMUM_SECONDES, essaiCheckout } from "../../scripts/qualification/stripe-trial-test-mode.mjs";

describe("parité application ↔ script Stripe Test (stripe-trial-test-mode.mjs)", () => {
  it("même seuil Checkout", () => {
    expect(DELAI_MINIMUM_SECONDES).toBe(DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES);
  });
  it("même décision sur une grille fenêtres × instants", () => {
    const fenetres: Array<[string, string | null]> = [
      ["2026-10-01", "2026-10-31"], ["2026-10-01", "2026-10-10"], ["2026-10-01", null],
      ["2026-10-01", "2026-12-31"], ["2026-10-01", "2026-09-01"], ["2026-03-15", "2026-04-14"],
    ];
    const depart = Date.parse("2026-09-28T00:00:00Z");
    for (const [debut, fin] of fenetres) {
      for (let h = 0; h <= 36 * 24; h += 7) {
        const maintenant = new Date(depart + h * 3600 * 1000);
        const app = calculerEssaiCheckout({ essaiDebut: debut, essaiFin: fin }, maintenant);
        const script = essaiCheckout(debut, fin, Math.floor(maintenant.getTime() / 1000));
        expect(script.mode).toBe(app.mode);
        expect(script.restantSecondes).toBe(app.restantSecondes);
        if (app.mode === "trial_end") expect(script.trialEnd).toBe(app.trialEnd);
        else expect(script.raison).toBe(app.raison);
      }
    }
  });
});
