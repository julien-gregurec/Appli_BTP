import { describe, expect, it, vi } from "vitest";
import { evaluerSante } from "@elsatia/incident-control";
import {
  configurationEmailCoherente,
  configurationStripeCoherente,
  controlesSanteGestionPro,
  profondeurDemandee,
} from "./sante";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  STRIPE_SECRET_KEY: "sk_test_SECRETVALUE123",
  STRIPE_WEBHOOK_SECRET: "whsec_SECRETWEBHOOK",
  BREVO_API_KEY: "xkeysib-SECRETBREVO",
  EMAIL_FROM_ADDRESS: "noreply@elsatia.fr",
  CRON_SECRET: "cron-secret-value",
};

describe("profondeurDemandee", () => {
  it("complète uniquement avec le bon CRON_SECRET", () => {
    expect(profondeurDemandee(null, ENV)).toBe("publique");
    expect(profondeurDemandee("Bearer faux", ENV)).toBe("publique");
    expect(profondeurDemandee("Bearer cron-secret-value", ENV)).toBe("complete");
    expect(profondeurDemandee("Bearer ", { ...ENV, CRON_SECRET: undefined })).toBe("publique");
  });
});

describe("configurationStripeCoherente", () => {
  it("refuse une clé live hors Production et une clé test en Production", () => {
    expect(configurationStripeCoherente(ENV)).toBe("ok");
    expect(configurationStripeCoherente({ ...ENV, STRIPE_SECRET_KEY: "sk_live_x" })).toBe("ko");
    expect(configurationStripeCoherente({ ...ENV, VERCEL_ENV: "production" })).toBe("ko");
    expect(configurationStripeCoherente({ ...ENV, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "rk_live_x" })).toBe("ok");
  });
  it("secret de webhook mal formé ou absent = ko ; clé absente = non_configure", () => {
    expect(configurationStripeCoherente({ ...ENV, STRIPE_WEBHOOK_BOUTIQUE_SECRET: "mauvais" })).toBe("ko");
    expect(configurationStripeCoherente({ ...ENV, STRIPE_WEBHOOK_SECRET: undefined })).toBe("ko");
    expect(configurationStripeCoherente({})).toBe("non_configure");
    expect(configurationStripeCoherente({ ...ENV, STRIPE_SECRET_KEY: "pk_test_x" })).toBe("ko");
  });
});

describe("configurationEmailCoherente", () => {
  it("vérifie la présence et la forme, jamais la valeur", () => {
    expect(configurationEmailCoherente(ENV)).toBe("ok");
    expect(configurationEmailCoherente({})).toBe("non_configure");
    expect(configurationEmailCoherente({ ...ENV, BREVO_API_KEY: "abc" })).toBe("ko");
    expect(configurationEmailCoherente({ ...ENV, EMAIL_FROM_ADDRESS: "" })).toBe("ko");
  });
});

describe("controlesSanteGestionPro", () => {
  it("publique : sondes Supabase seulement, aucun appel externe Stripe/Brevo", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const rapport = await evaluerSante({
      app: "gestion_pro",
      etat: null,
      controles: controlesSanteGestionPro({ env: ENV, profondeur: "publique", fetchImpl }),
    });
    expect(rapport.statut).toBe("OPERATIONAL");
    const urls = fetchImpl.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls.sort()).toEqual([
      "https://abc.supabase.co/auth/v1/health",
      "https://abc.supabase.co/rest/v1/rpc/incident_etat_public",
      "https://abc.supabase.co/storage/v1/status",
    ]);
  });

  it("complète : vérifie aussi Brevo et Stripe en lecture", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await evaluerSante({
      app: "gestion_pro",
      etat: null,
      controles: controlesSanteGestionPro({ env: ENV, profondeur: "complete", fetchImpl }),
    });
    const urls = fetchImpl.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toContain("https://api.brevo.com/v3/account");
    expect(urls).toContain("https://api.stripe.com/v1/balance");
  });

  it("base KO → OUTAGE ; Storage KO → DEGRADED ; aucune valeur secrète dans la réponse", async () => {
    const panne = (motif: string) =>
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes(motif)) throw new Error(`connect ECONNREFUSED ${ENV.STRIPE_SECRET_KEY}`);
        return new Response("{}", { status: 200 });
      });
    const dbKo = await evaluerSante({
      app: "gestion_pro",
      etat: null,
      controles: controlesSanteGestionPro({ env: ENV, profondeur: "complete", fetchImpl: panne("/rest/v1/") }),
    });
    expect(dbKo).toMatchObject({ statut: "OUTAGE", controles: { db: "ko" } });
    const storageKo = await evaluerSante({
      app: "gestion_pro",
      etat: null,
      controles: controlesSanteGestionPro({ env: ENV, profondeur: "publique", fetchImpl: panne("/storage/") }),
    });
    expect(storageKo).toMatchObject({ statut: "DEGRADED", controles: { storage: "ko", db: "ok", auth: "ok" } });
    const texte = JSON.stringify([dbKo, storageKo]);
    for (const valeur of Object.values(ENV)) expect(texte).not.toContain(valeur);
    expect(texte).not.toContain("abc.supabase.co");
  });

  it("Stripe live en Preview → ko sans appeler Stripe", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await evaluerSante({
      app: "gestion_pro",
      etat: null,
      controles: controlesSanteGestionPro({
        env: { ...ENV, STRIPE_SECRET_KEY: "sk_live_oops" },
        profondeur: "complete",
        fetchImpl,
      }),
    });
    expect(r.controles.stripe_configuration).toBe("ko");
    expect(fetchImpl.mock.calls.map((c) => String((c as unknown[])[0]))).not.toContain("https://api.stripe.com/v1/balance");
  });
});
