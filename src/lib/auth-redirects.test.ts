import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { construireUrlCallbackAuth, urlCallbackReinitialisation } from "./auth-redirects";

const URL_CANONIQUE = "https://app.exemple-liria.invalid";

describe("construireUrlCallbackAuth", () => {
  it("construit le lien à partir de l'URL canonique fournie, jamais d'un en-tête client", () => {
    const url = construireUrlCallbackAuth("/onboarding?code=ABC", URL_CANONIQUE);
    expect(url).toBe(`${URL_CANONIQUE}/auth/callback?next=%2Fonboarding%3Fcode%3DABC`);
  });

  it("retourne null si aucune URL canonique n'est configurée, plutôt que de retomber sur des en-têtes client", () => {
    expect(construireUrlCallbackAuth("/onboarding", undefined)).toBeNull();
    expect(construireUrlCallbackAuth("/onboarding", "")).toBeNull();
  });

  it("neutralise une destination externe glissée dans le paramètre next", () => {
    const url = construireUrlCallbackAuth("https://attaquant.invalid/vol", URL_CANONIQUE);
    expect(url).toBe(`${URL_CANONIQUE}/auth/callback?next=%2Fdashboard`);
  });

  it("neutralise une destination protocol-relative (//)", () => {
    const url = construireUrlCallbackAuth("//attaquant.invalid/vol", URL_CANONIQUE);
    expect(url).toBe(`${URL_CANONIQUE}/auth/callback?next=%2Fdashboard`);
  });
});

describe("urlCallbackReinitialisation", () => {
  it("pointe toujours vers /nouveau-mot-de-passe sur le domaine canonique", () => {
    expect(urlCallbackReinitialisation(URL_CANONIQUE)).toBe(
      `${URL_CANONIQUE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    );
  });

  it("retourne null sans URL canonique configurée", () => {
    expect(urlCallbackReinitialisation(undefined)).toBeNull();
  });
});

describe("valeur par défaut : process.env.NEXT_PUBLIC_APP_URL", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = URL_CANONIQUE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("est utilisée quand aucune URL n'est passée explicitement", () => {
    expect(urlCallbackReinitialisation()).toBe(`${URL_CANONIQUE}/auth/callback?next=%2Fnouveau-mot-de-passe`);
  });
});
