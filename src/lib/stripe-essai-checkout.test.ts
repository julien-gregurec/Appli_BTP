import { afterEach, describe, expect, it } from "vitest";
import { essaiEnCours } from "./acces-socle-essai";
import {
  calculerEssaiCheckout,
  DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES,
  finEssaiLocaleUnix,
  parametresEssaiCheckout,
  suffixeIdempotenceEssai,
} from "./stripe-essai-checkout";

/**
 * ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1 — Stripe reprend uniquement le temps
 * restant de l'essai ELSATIA. Essai local de référence : début 2026-10-01,
 * fin 2026-10-31 (début + 30), ouvert jusqu'au 2026-10-31T23:59:59Z.
 */
const DEBUT = "2026-10-01";
const FIN = "2026-10-31";
const ESSAI = { essaiDebut: DEBUT, essaiFin: FIN };
const FIN_LOCALE_UNIX = Date.parse("2026-10-31T23:59:59Z") / 1000;
const JOUR = 86_400;

const a = (iso: string) => new Date(iso);
const dateUtc = (secondes: number) => new Date(secondes * 1000).toISOString().slice(0, 10);
/** Prédicat de `entreprises_essai_dates_coherentes`. */
function contrainteBase(debut: string, fin: string) {
  const d = Date.parse(`${debut}T00:00:00Z`);
  const f = Date.parse(`${fin}T00:00:00Z`);
  return f >= d && f <= d + 30 * JOUR * 1000;
}

const TZ_INITIAL = process.env.TZ;
afterEach(() => {
  if (TZ_INITIAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_INITIAL;
});

describe("local_trial_end", () => {
  it("fin du jour UTC de abonnement_essai_fin", () => {
    expect(finEssaiLocaleUnix(ESSAI)).toEqual({ finUnix: FIN_LOCALE_UNIX, finLocale: FIN });
  });
  it("sa date UTC retombe exactement sur essai_fin (acceptée par la contrainte au retour)", () => {
    const fin = finEssaiLocaleUnix(ESSAI);
    expect("finUnix" in fin && dateUtc(fin.finUnix)).toBe(FIN);
  });
  it("essai_fin absente : repli sur début + 30 (comme finEssaiEffective)", () => {
    expect(finEssaiLocaleUnix({ essaiDebut: DEBUT, essaiFin: null })).toEqual({ finUnix: FIN_LOCALE_UNIX, finLocale: FIN });
  });
  it("essai_fin raccourcie : la fin raccourcie fait foi", () => {
    expect(finEssaiLocaleUnix({ essaiDebut: DEBUT, essaiFin: "2026-10-10" })).toMatchObject({ finLocale: "2026-10-10" });
  });
  it("essai_fin au-delà de début + 30 : bornée à la fenêtre autorisée", () => {
    expect(finEssaiLocaleUnix({ essaiDebut: DEBUT, essaiFin: "2026-12-31" })).toEqual({ finUnix: FIN_LOCALE_UNIX, finLocale: FIN });
  });
  it("accepte un timestamp ISO complet (colonne relue en texte)", () => {
    expect(finEssaiLocaleUnix({ essaiDebut: "2026-10-01T00:00:00+00:00", essaiFin: "2026-10-31" })).toMatchObject({ finLocale: FIN });
  });
});

describe("remaining_trial_seconds = max(0, local_trial_end - now)", () => {
  const cas: Array<[string, string, "trial_end" | "aucun", number]> = [
    ["jour 0 (création)", "2026-10-01T09:00:00Z", "trial_end", FIN_LOCALE_UNIX - Date.parse("2026-10-01T09:00:00Z") / 1000],
    ["jour 1", "2026-10-02T09:00:00Z", "trial_end", FIN_LOCALE_UNIX - Date.parse("2026-10-02T09:00:00Z") / 1000],
    ["jour 15", "2026-10-16T09:00:00Z", "trial_end", FIN_LOCALE_UNIX - Date.parse("2026-10-16T09:00:00Z") / 1000],
    ["jour 28 (reliquat 2 j 15 h ≥ 48 h)", "2026-10-29T09:00:00Z", "trial_end", 2 * JOUR + 14 * 3600 + 3599],
    ["jour 29 (reliquat 1 j 15 h < 48 h)", "2026-10-30T09:00:00Z", "aucun", JOUR + 14 * 3600 + 3599],
    ["jour 30 (dernier jour)", "2026-10-31T09:00:00Z", "aucun", 14 * 3600 + 3599],
    ["jour 30, dernière seconde", "2026-10-31T23:59:58Z", "aucun", 1],
    ["essai expiré (fin exacte)", "2026-10-31T23:59:59Z", "aucun", 0],
    ["essai expiré (lendemain)", "2026-11-01T00:00:00Z", "aucun", 0],
    ["essai expiré (longtemps après)", "2027-03-01T12:00:00Z", "aucun", 0],
  ];
  it.each(cas)("%s", (_libelle, maintenant, mode, restant) => {
    const essai = calculerEssaiCheckout(ESSAI, a(maintenant));
    expect(essai.mode).toBe(mode);
    expect(essai.restantSecondes).toBe(restant);
    if (essai.mode === "trial_end") {
      expect(essai.trialEnd).toBe(FIN_LOCALE_UNIX);
      expect(parametresEssaiCheckout(essai)).toEqual({ "subscription_data[trial_end]": String(FIN_LOCALE_UNIX) });
    } else {
      expect(parametresEssaiCheckout(essai)).toEqual({});
    }
  });

  it("jour 29 : raison explicite (minimum Checkout 48 h)", () => {
    expect(calculerEssaiCheckout(ESSAI, a("2026-10-30T09:00:00Z"))).toMatchObject({ mode: "aucun", raison: "restant_inferieur_minimum_stripe" });
  });
  it("expiré : raison essai_expire", () => {
    expect(calculerEssaiCheckout(ESSAI, a("2026-11-01T00:00:00Z"))).toMatchObject({ mode: "aucun", raison: "essai_expire", restantSecondes: 0 });
  });
  it("seuil 48 h exact : essai accordé ; 48 h - 1 s : refusé", () => {
    const seuil = new Date((FIN_LOCALE_UNIX - DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES) * 1000);
    expect(calculerEssaiCheckout(ESSAI, seuil).mode).toBe("trial_end");
    expect(calculerEssaiCheckout(ESSAI, new Date(seuil.getTime() + 1000)).mode).toBe("aucun");
  });
  it("jamais trial_period_days", () => {
    const essai = calculerEssaiCheckout(ESSAI, a("2026-10-01T09:00:00Z"));
    expect(Object.keys(parametresEssaiCheckout(essai))).not.toContain("subscription_data[trial_period_days]");
  });
});

describe("dates incohérentes : aucun essai Stripe (fail-closed, pas de second essai)", () => {
  const maintenant = a("2026-10-05T10:00:00Z");
  it.each([
    ["aucune date", { essaiDebut: null, essaiFin: null }, "dates_absentes"],
    ["début absent, fin présente", { essaiDebut: null, essaiFin: FIN }, "dates_incoherentes"],
    ["fin avant début", { essaiDebut: DEBUT, essaiFin: "2026-09-15" }, "dates_incoherentes"],
    ["date impossible", { essaiDebut: "2026-02-30", essaiFin: "2026-03-20" }, "dates_incoherentes"],
    ["texte arbitraire", { essaiDebut: DEBUT, essaiFin: "bientôt" }, "dates_incoherentes"],
    ["début non ISO", { essaiDebut: "01/10/2026", essaiFin: FIN }, "dates_incoherentes"],
  ] as const)("%s", (_l, etat, raison) => {
    expect(calculerEssaiCheckout(etat, maintenant)).toMatchObject({ mode: "aucun", raison });
  });
  it("début dans le futur (horloge décalée) : jamais au-delà de début + 30", () => {
    const essai = calculerEssaiCheckout({ essaiDebut: "2026-10-10", essaiFin: "2026-11-09" }, maintenant);
    expect(essai.mode).toBe("trial_end");
    expect(essai.mode === "trial_end" && dateUtc(essai.trialEnd)).toBe("2026-11-09");
  });
  it("horloge invalide : erreur explicite", () => {
    expect(() => calculerEssaiCheckout(ESSAI, new Date(Number.NaN))).toThrow("Horloge invalide");
  });
});

describe("fuseau, heure d'été, UTC", () => {
  it.each(["UTC", "Europe/Paris", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Australia/Lord_Howe"])(
    "résultat identique avec TZ=%s",
    (tz) => {
      process.env.TZ = tz;
      const essai = calculerEssaiCheckout(ESSAI, a("2026-10-16T09:00:00Z"));
      expect(essai).toMatchObject({ mode: "trial_end", trialEnd: FIN_LOCALE_UNIX, finLocale: FIN });
    },
  );
  it("DST automne (Paris, 25/10/2026) dans la fenêtre : fin UTC exacte, pas d'heure en plus", () => {
    process.env.TZ = "Europe/Paris";
    const essai = calculerEssaiCheckout({ essaiDebut: "2026-10-10", essaiFin: "2026-11-09" }, a("2026-10-24T22:30:00Z"));
    expect(essai).toMatchObject({ mode: "trial_end", trialEnd: Date.parse("2026-11-09T23:59:59Z") / 1000 });
  });
  it("DST printemps (Paris, 29/03/2026) dans la fenêtre : fin UTC exacte, pas d'heure en moins", () => {
    process.env.TZ = "Europe/Paris";
    const essai = calculerEssaiCheckout({ essaiDebut: "2026-03-15", essaiFin: "2026-04-14" }, a("2026-03-29T01:30:00Z"));
    expect(essai).toMatchObject({ mode: "trial_end", trialEnd: Date.parse("2026-04-14T23:59:59Z") / 1000 });
  });
  it("minuit Paris ≠ minuit UTC : un client parisien à 00:30 le 01/11 (23:30Z le 31/10) a encore 29 min 59 s", () => {
    const essai = calculerEssaiCheckout(ESSAI, a("2026-10-31T23:30:00Z"));
    expect(essai).toMatchObject({ mode: "aucun", raison: "restant_inferieur_minimum_stripe", restantSecondes: 1799 });
  });
});

describe("invariants sur toute la fenêtre (pas horaire, J-2 → J+33)", () => {
  it("trial_end jamais au-delà de la fenêtre locale ; cohérent avec l'accès applicatif", () => {
    const depart = Date.parse("2026-09-29T00:00:00Z");
    for (let h = 0; h <= 35 * 24; h++) {
      const maintenant = new Date(depart + h * 3600 * 1000);
      const essai = calculerEssaiCheckout(ESSAI, maintenant);
      expect(essai.restantSecondes).toBe(Math.max(0, FIN_LOCALE_UNIX - Math.floor(maintenant.getTime() / 1000)));
      if (essai.mode === "trial_end") {
        expect(essai.trialEnd).toBeLessThanOrEqual(FIN_LOCALE_UNIX);
        expect(essai.trialEnd - maintenant.getTime() / 1000).toBeGreaterThanOrEqual(DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES);
        expect(contrainteBase(DEBUT, dateUtc(essai.trialEnd))).toBe(true);
        expect(essaiEnCours({ abonnementStatut: "essai", essaiDebut: DEBUT, essaiFin: FIN }, maintenant)).toBe(true);
      }
      if (!essaiEnCours({ abonnementStatut: "essai", essaiDebut: DEBUT, essaiFin: FIN }, maintenant)) {
        expect(essai.mode).toBe("aucun");
      }
    }
  });
});

describe("clé d'idempotence", () => {
  it("stable pendant l'essai (redémarrage de Checkout = même session)", () => {
    const j1 = calculerEssaiCheckout(ESSAI, a("2026-10-02T09:00:00Z"));
    const j1bis = calculerEssaiCheckout(ESSAI, a("2026-10-02T21:00:00Z"));
    expect(suffixeIdempotenceEssai(j1)).toBe(suffixeIdempotenceEssai(j1bis));
    expect(suffixeIdempotenceEssai(j1)).toBe(`essai-${FIN_LOCALE_UNIX}`);
  });
  it("change quand l'essai n'est plus exprimable (Stripe refuse une clé rejouée avec d'autres paramètres)", () => {
    const avant = calculerEssaiCheckout(ESSAI, a("2026-10-28T09:00:00Z"));
    const apres = calculerEssaiCheckout(ESSAI, a("2026-10-30T09:00:00Z"));
    expect(suffixeIdempotenceEssai(avant)).not.toBe(suffixeIdempotenceEssai(apres));
    expect(suffixeIdempotenceEssai(apres)).toBe("sans-essai");
  });
});
