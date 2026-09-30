import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

async function destination(next: string, hote = "reserves.elsatia.fr") {
  vi.stubEnv("ELSATIA_APPLICATION_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NEXT_PUBLIC_RESERVES_URL", "https://reserves.elsatia.fr");
  const reponse = await GET(new Request(`https://${hote}/auth/callback?code=c&next=${encodeURIComponent(next)}`));
  return new URL(reponse.headers.get("location")!);
}

describe("callback Réserves — redirection ouverte", () => {
  it.each(["//evil.example", "/\\evil.example", "/%5Cevil.example", "https://evil.example", "/%2F%2Fevil.example"])(
    "%j reste sur Réserves",
    async (next) => {
      const cible = await destination(next);
      expect(cible.origin).toBe("https://reserves.elsatia.fr");
      expect(cible.pathname).toBe("/dashboard");
    },
  );

  // Train V8 : témoins d'exploit REDTEAM-V2 (F2) rejoués sur la route FUSIONNÉE (double validation
  // cheminInterneStrict + cheminInterneSur, origine configurée). Aucun ne doit quitter Réserves ni
  // atteindre un chemin autre que le repli.
  it.each(["/%09/evil.com", "/%0A/evil.com", "/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/a/..//evil.com",
    "/%252f%252fevil.com", "javascript:alert(1)", "https://user:pass@evil.com", "", "relatif"])(
    "REDTEAM-V2 %j : repli /dashboard sur l'origine Réserves",
    async (next) => {
      const cible = await destination(next);
      expect(cible.origin).toBe("https://reserves.elsatia.fr");
      expect(cible.pathname).toBe("/dashboard");
    },
  );

  it("conserve une destination interne légitime", async () => {
    const cible = await destination("/reserves/123?onglet=photos");
    expect(cible.href).toBe("https://reserves.elsatia.fr/reserves/123?onglet=photos");
  });

  it("host spoofing : l'hôte de la requête ne décide pas de l'origine de retour", async () => {
    const cible = await destination("/dashboard", "evil.example");
    expect(cible.origin).toBe("https://reserves.elsatia.fr");
  });
});
