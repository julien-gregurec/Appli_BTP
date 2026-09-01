import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerConfigurationMarquePublique } from "./brand";
import {
  baseUrlPubliqueAuth,
  construireUrlCallbackAuth,
  urlCallbackReinitialisation,
} from "./auth-redirects";

const URL_CANONIQUE = "https://preview.example.invalid";

describe("redirections Supabase Auth", () => {
  it("utilise toujours l’URL canonique pour une récupération", () => {
    const originesDeRequete = [
      URL_CANONIQUE,
      "https://deployment-temporaire.example.invalid",
      "https://origin-different.example.invalid",
    ];

    originesDeRequete.forEach(() => {
      expect(urlCallbackReinitialisation({ urlPublique: URL_CANONIQUE })).toBe(
        `${URL_CANONIQUE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
      );
    });
  });

  it("utilise l’URL canonique pour l’inscription", () => {
    expect(construireUrlCallbackAuth("/onboarding?code=ENTREPRISE", { urlPublique: URL_CANONIQUE })).toBe(
      `${URL_CANONIQUE}/auth/callback?next=%2Fonboarding%3Fcode%3DENTREPRISE`,
    );
  });

  it("utilise la même URL canonique pour une récupération administrateur", () => {
    expect(urlCallbackReinitialisation({ urlPublique: URL_CANONIQUE })).toBe(
      `${URL_CANONIQUE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    );
  });

  it("remplace une destination externe ou ambiguë par une route interne sûre", () => {
    expect(construireUrlCallbackAuth("https://evil.example", { urlPublique: URL_CANONIQUE })).toBe(
      `${URL_CANONIQUE}/auth/callback?next=%2Fdashboard`,
    );
    expect(construireUrlCallbackAuth("//evil.example", { urlPublique: URL_CANONIQUE })).toBe(
      `${URL_CANONIQUE}/auth/callback?next=%2Fdashboard`,
    );
  });

  it("refuse de construire une URL lorsque la configuration canonique manque ou est invalide", () => {
    expect(urlCallbackReinitialisation({ urlPublique: null })).toBeNull();
    expect(urlCallbackReinitialisation(creerConfigurationMarquePublique({
      NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
    }))).toBeNull();
  });
});

describe("baseUrlPubliqueAuth — repli Vercel stable hors Production", () => {
  const CLES = ["VERCEL_ENV", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
  let sauvegarde: Record<string, string | undefined>;

  beforeEach(() => {
    sauvegarde = Object.fromEntries(CLES.map((cle) => [cle, process.env[cle]]));
    CLES.forEach((cle) => delete process.env[cle]);
  });
  afterEach(() => {
    CLES.forEach((cle) => {
      if (sauvegarde[cle] === undefined) delete process.env[cle];
      else process.env[cle] = sauvegarde[cle];
    });
  });

  it("Preview sans NEXT_PUBLIC_APP_URL : dérive VERCEL_BRANCH_URL (stable, suit la branche)", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "elsatia-preview-git-feat-x-julien-gregurec1.vercel.app";
    process.env.VERCEL_URL = "elsatia-preview-8ccv5r29k-julien-gregurec1.vercel.app";

    expect(baseUrlPubliqueAuth({ urlPublique: null })).toBe(
      "https://elsatia-preview-git-feat-x-julien-gregurec1.vercel.app",
    );
    expect(construireUrlCallbackAuth("/nouveau-mot-de-passe", { urlPublique: null })).toBe(
      "https://elsatia-preview-git-feat-x-julien-gregurec1.vercel.app/auth/callback?next=%2Fnouveau-mot-de-passe",
    );
  });

  it("Preview : à défaut de VERCEL_BRANCH_URL, utilise VERCEL_PROJECT_PRODUCTION_URL", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "elsatia-preview.vercel.app";

    expect(baseUrlPubliqueAuth({ urlPublique: null })).toBe("https://elsatia-preview.vercel.app");
  });

  it("n'utilise jamais VERCEL_URL (URL de déploiement éphémère)", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "elsatia-preview-8ccv5r29k-julien-gregurec1.vercel.app";

    expect(baseUrlPubliqueAuth({ urlPublique: null })).toBeNull();
  });

  it("Production reste isolée : aucune URL Vercel dérivée, seul NEXT_PUBLIC_APP_URL compte", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_BRANCH_URL = "app-elsatia-git-main-julien-gregurec1.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "app.elsatia.fr";

    expect(baseUrlPubliqueAuth({ urlPublique: null })).toBeNull();
    expect(baseUrlPubliqueAuth({ urlPublique: "https://app.elsatia.fr" })).toBe("https://app.elsatia.fr");
  });

  it("NEXT_PUBLIC_APP_URL explicite l'emporte toujours sur les variables Vercel", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "elsatia-preview-git-feat-x-julien-gregurec1.vercel.app";

    expect(baseUrlPubliqueAuth({ urlPublique: "https://preview.elsatia.fr" })).toBe("https://preview.elsatia.fr");
  });
});
