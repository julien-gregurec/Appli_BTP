import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { proxy } from "@/proxy";

const ORIGINE = "https://colors.elsatia.fr";

function requete(chemin: string) {
  return new NextRequest(new Request(`${ORIGINE}${chemin}`));
}

function reponse_csp(reponse: { headers: Headers }) {
  return reponse.headers.get("Content-Security-Policy") ?? "";
}

function directives(politique: string | null) {
  return new Map(
    (politique ?? "").split("; ").map((element) => {
      const [nom, ...jetons] = element.split(" ");
      return [nom, jetons];
    }),
  );
}

describe("proxy — CSP et nonce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cle-de-test";
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
  });

  it("émet la CSP sur une page", async () => {
    const reponse = await proxy(requete("/login"));
    const politique = reponse.headers.get("Content-Security-Policy");
    expect(politique).toContain("default-src 'self'");
    expect(politique).toContain("frame-ancestors 'none'");
  });

  it("émet la CSP sur une ressource publique sans ouvrir de session", async () => {
    const reponse = await proxy(requete("/icons/colors-icon.svg"));
    const politique = reponse.headers.get("Content-Security-Policy");
    expect(politique).toContain("object-src 'none'");
    expect(politique).toContain("frame-ancestors 'none'");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("n’applique jamais le nonce ni `strict-dynamic` au service worker", async () => {
    // L’en-tête CSP d’une réponse gouverne le contexte d’exécution de cette
    // réponse : `'strict-dynamic'` y neutralise `'self'` et empêche
    // `sw-colors.js` de démarrer. Régression constatée en local avant
    // correction, invisible en test unitaire d’en-têtes seuls.
    for (const chemin of ["/sw-colors.js", "/manifest.webmanifest", "/icons/colors-icon.svg"]) {
      const politique = reponse_csp(await proxy(requete(chemin)));
      expect(politique).not.toContain("strict-dynamic");
      expect(politique).not.toContain("nonce-");
      expect(politique).toContain("script-src 'self'");
    }
  });

  it("sert /robots.txt sans ouvrir de session", async () => {
    // Un robot n'a pas de session : lui en rafraîchir une coûterait un
    // aller-retour Supabase par passage de crawler.
    const reponse = await proxy(requete("/robots.txt"));
    expect(reponse_csp(reponse)).toContain("default-src 'self'");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("rafraîchit la session sur les routes applicatives", async () => {
    await proxy(requete("/dashboard"));
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("régénère un nonce à chaque requête", async () => {
    const nonce = async () => {
      const politique = await proxy(requete("/login")).then((r) =>
        r.headers.get("Content-Security-Policy"),
      );
      return directives(politique).get("script-src")?.find((j) => j.startsWith("'nonce-"));
    };
    const premier = await nonce();
    const second = await nonce();
    expect(premier).toMatch(/^'nonce-.{20,}'$/);
    expect(second).not.toBe(premier);
  });

  it("expose le même nonce à Next, sur la requête, pour qu’il l’applique à ses balises", async () => {
    // Sans cette recopie, le nonce de la réponse ne correspondrait à aucune
    // balise et le bootstrap de Next serait bloqué par sa propre politique.
    const reponse = await proxy(requete("/login"));
    const politiqueReponse = reponse.headers.get("Content-Security-Policy");
    const politiqueRequete = reponse.headers.get("x-middleware-request-content-security-policy");
    const nonceRequete = reponse.headers.get("x-middleware-request-x-nonce");
    expect(politiqueRequete).toBe(politiqueReponse);
    expect(politiqueReponse).toContain(`'nonce-${nonceRequete}'`);
  });

  it("construit le client avec la clé publishable, jamais avec l’ancien nom", async () => {
    // La convention `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` n’est pas cosmétique : les clés JWT
    // legacy sont désactivées côté projet Supabase, donc une valeur portée par
    // `NEXT_PUBLIC_SUPABASE_ANON_KEY` n’authentifierait plus rien. Ce test interdit qu’un repli
    // sur l’ancien nom soit réintroduit sans que rien ne le signale.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "valeur-legacy-qui-ne-doit-jamais-servir";
    try {
      await proxy(requete("/dashboard"));
      const [url, cle] = mocks.createServerClient.mock.calls[0];
      expect(url).toBe("https://exemple.supabase.co");
      expect(cle).toBe("sb_publishable_cle-de-test");
    } finally {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  it("échoue explicitement si la clé publique est absente, au lieu de démarrer sans", async () => {
    // Sans cette exception, `createServerClient` recevrait `undefined` et lèverait un
    // « supabaseUrl is required » du SDK, qui ne nomme pas la variable en cause.
    const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    try {
      await expect(proxy(requete("/dashboard"))).rejects.toThrowError(
        /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
      );
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = cle;
    }
  });

  it("ne laisse fuir aucune origine externe hors Supabase", async () => {
    const politique = await proxy(requete("/mot-de-passe-oublie")).then((r) =>
      r.headers.get("Content-Security-Policy"),
    );
    const origines = (politique ?? "")
      .split(/[; ]/)
      .filter((jeton) => jeton.startsWith("http"));
    expect([...new Set(origines)]).toEqual(["https://exemple.supabase.co"]);
  });
});
