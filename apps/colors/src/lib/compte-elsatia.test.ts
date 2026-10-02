import { afterEach, describe, expect, it, vi } from "vitest";
import { URL_COMPTE_PAR_DEFAUT, urlCompteElsatia } from "@/lib/compte-elsatia";

vi.mock("server-only", () => ({}));

/* A-08 (satellites Preview readiness V2) : le lien Colors → Gestion Pro suit l'environnement. */
describe("portail de compte ELSATIA (Colors → Gestion Pro)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("LOCAL : repli localhost, ou l'URL locale déclarée", () => {
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "local");
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "");
    expect(urlCompteElsatia()).toBe(URL_COMPTE_PAR_DEFAUT);
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "http://localhost:3000/abonnement");
    expect(urlCompteElsatia()).toBe("http://localhost:3000/abonnement");
  });

  it("PREVIEW : l'URL Preview de Gestion Pro, jamais la Production ni localhost", () => {
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "https://gp-git-main.vercel.app/abonnement");
    expect(urlCompteElsatia()).toBe("https://gp-git-main.vercel.app/abonnement");
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "https://app.elsatia.fr/abonnement");
    expect(urlCompteElsatia()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "");
    expect(urlCompteElsatia()).toBeNull();
  });

  it("PRODUCTION : hôte canonique uniquement", () => {
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "https://app.elsatia.fr/abonnement");
    expect(urlCompteElsatia()).toBe("https://app.elsatia.fr/abonnement");
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "https://gp-git-main.vercel.app/abonnement");
    expect(urlCompteElsatia()).toBeNull();
  });

  it("environnement inconnu : aucun lien", () => {
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "recette");
    vi.stubEnv("NEXT_PUBLIC_ELSATIA_ACCOUNT_URL", "https://app.elsatia.fr/abonnement");
    expect(urlCompteElsatia()).toBeNull();
  });
});
