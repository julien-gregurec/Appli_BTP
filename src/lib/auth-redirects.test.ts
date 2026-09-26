import { describe, expect, it } from "vitest";
import { creerConfigurationMarquePublique } from "./brand";
import {
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
