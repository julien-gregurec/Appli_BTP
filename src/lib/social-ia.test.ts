import { afterEach, describe, expect, it, vi } from "vitest";

// Fournisseur IA simulé : renvoie successivement les propositions prévues par le test.
const reponses: Array<Record<string, unknown>> = [];
vi.mock("@/lib/ai/provider", () => ({
  obtenirProviderIA: () => ({
    completer: async ({ forcerOutil }: { forcerOutil?: string }) => ({ texte: "", appelsOutils: [{ id: "1", nom: forcerOutil ?? "", entree: reponses.shift() ?? {} }] }),
  }),
}));

const { genererVariantes, variantesIdentiques } = await import("@/lib/social/ia");
const { controlerConfiguration, versionLinkedInAgeMois } = await import("@/lib/social/configuration");

afterEach(() => {
  reponses.length = 0;
  vi.unstubAllEnvs();
});

const differentes = {
  facebook: "Découvrez ELSATIA Réserves : levée des réserves de chantier simplifiée. Essayez-le dès aujourd’hui.",
  instagram: "Fini les réserves oubliées ✅\nELSATIA Réserves suit chaque point jusqu’à sa levée.\n#BTP #ELSATIA #Chantier",
  linkedin: "Conducteurs de travaux : ELSATIA Réserves centralise la levée des réserves, du constat à la réception. #BTP #ELSATIA",
  hashtags: ["#BTP", "#ELSATIA", "pas-un-hashtag"],
  cta: "Demander une démo",
};

describe("Assistant Social : variantes par réseau", () => {
  it("produit trois variantes différentes à partir d'un même texte maître", async () => {
    reponses.push(differentes);
    const v = await genererVariantes({ texte: "ELSATIA Réserves simplifie la levée des réserves.", application: "reserves", lien: null, reseaux: ["facebook", "instagram", "linkedin"] });
    expect(new Set([v.facebook, v.instagram, v.linkedin]).size).toBe(3);
    expect(v.instagram.length).toBeLessThan(v.facebook.length + 200);
    expect(v.hashtags).toEqual(["#BTP", "#ELSATIA"]);
  });

  it("redemande si deux variantes sont identiques, puis refuse", async () => {
    const identiques = { ...differentes, instagram: differentes.facebook };
    reponses.push(identiques, differentes);
    await expect(genererVariantes({ texte: "x", application: "elsatia", lien: null, reseaux: [] })).resolves.toMatchObject({ instagram: differentes.instagram });
    reponses.push(identiques, identiques);
    await expect(genererVariantes({ texte: "x", application: "elsatia", lien: null, reseaux: [] })).rejects.toThrow(/identiques/);
  });

  it("ignore ponctuation et hashtags pour détecter les doublons", () => {
    expect(variantesIdentiques({ facebook: "Bonjour à tous !", instagram: "bonjour à tous #BTP", linkedin: "Autre" })).toBe(false);
    expect(variantesIdentiques({ facebook: "Bonjour à tous !", instagram: "Bonjour à tous", linkedin: "Autre" })).toBe(true);
  });

  it("refuse un texte maître vide", async () => {
    await expect(genererVariantes({ texte: "  ", application: "elsatia", lien: null, reseaux: [] })).rejects.toThrow(/texte principal/);
  });
});

describe("assistant de configuration", () => {
  it("ne renvoie jamais la valeur d'un secret", () => {
    const secrets = { SOCIAL_TOKEN_ENCRYPTION_KEY: "a".repeat(64), CRON_SECRET: "c".repeat(40), META_APP_SECRET: "b".repeat(32), META_WEBHOOK_VERIFY_TOKEN: "v".repeat(20), LINKEDIN_CLIENT_SECRET: "l".repeat(16), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(50), OPENAI_API_KEY: "o".repeat(30) };
    for (const [k, v] of Object.entries(secrets)) vi.stubEnv(k, v);
    const sortie = JSON.stringify(controlerConfiguration());
    for (const v of Object.values(secrets)) expect(sortie).not.toContain(v);
  });

  it("signale clé absente, clé de mauvaise taille et CRON_SECRET trop court", () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("CRON_SECRET", "court");
    const c = controlerConfiguration();
    expect(c.find((x) => x.cle === "SOCIAL_TOKEN_ENCRYPTION_KEY")?.etat).toBe("manquant");
    expect(c.find((x) => x.cle === "CRON_SECRET")?.etat).toBe("invalide");
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "abcd");
    expect(controlerConfiguration().find((x) => x.cle === "SOCIAL_TOKEN_ENCRYPTION_KEY")?.etat).toBe("invalide");
  });

  it("indique le mode simulation et la version LinkedIn périmée", () => {
    vi.stubEnv("SOCIAL_DRY_RUN", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(controlerConfiguration().find((x) => x.cle === "SOCIAL_DRY_RUN")?.detail).toMatch(/MODE SIMULATION/);
    expect(versionLinkedInAgeMois("202609", new Date("2026-10-03"))).toBe(1);
    vi.stubEnv("LINKEDIN_API_VERSION", "202509");
    expect(controlerConfiguration(new Date("2026-10-03")).find((x) => x.cle === "LINKEDIN_API_VERSION")?.etat).toBe("invalide");
  });
});
