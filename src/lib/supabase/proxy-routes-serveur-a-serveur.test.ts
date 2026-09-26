import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Routes appelées SANS cookie de session Gestion Pro : webhooks Stripe (serveur à serveur) et API
 * de facturation Tools (appelée depuis l'origine Tools avec un jeton Bearer, preflight CORS
 * compris). Chacune authentifie elle-même l'appelant (signature Stripe, Bearer vérifié côté
 * serveur). Le proxy ne doit donc JAMAIS les rediriger vers /login : une redirection 307 est
 * silencieusement fatale (Stripe réessaie puis désactive l'endpoint ; le navigateur Tools échoue
 * au preflight CORS).
 *
 * Exécution réelle de `updateSession` : seuls le client Supabase (aucun utilisateur connecté) et
 * la limitation de débit (hors sujet ici) sont simulés.
 */

const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  politiquesRateLimitPour: () => [],
  appliquerRateLimit: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { updateSession } = await import("@/lib/supabase/proxy");

function requete(chemin: string, method = "POST") {
  return new NextRequest(new URL(chemin, "https://gp-preview.example.com"), { method });
}

function estRedirectionLogin(reponse: Response) {
  const location = reponse.headers.get("location") ?? "";
  return reponse.status >= 300 && reponse.status < 400 && location.includes("/login");
}

describe("proxy Gestion Pro — routes serveur à serveur sans session", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    getUser.mockClear();
  });

  it.each([
    ["/api/stripe/abonnement/webhook", "POST"],
    ["/api/stripe/webhook", "POST"],
    ["/api/stripe/boutique/webhook", "POST"],
    ["/api/tools/monetization/stripe/webhook", "POST"],
    ["/api/tools/monetization/catalog", "GET"],
    ["/api/tools/monetization/checkout", "POST"],
    ["/api/tools/monetization/checkout", "OPTIONS"],
    ["/api/tools/monetization/portal", "POST"],
    ["/api/tools/monetization/apple/verify", "POST"],
    ["/api/tools/monetization/google/verify", "POST"],
  ])("%s (%s) n'est pas redirigée vers /login et n'interroge pas l'Auth par cookie", async (chemin, method) => {
    const reponse = await updateSession(requete(chemin, method));
    expect(estRedirectionLogin(reponse)).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("témoin : une page applicative sans session reste redirigée vers /login", async () => {
    const reponse = await updateSession(requete("/dashboard", "GET"));
    expect(estRedirectionLogin(reponse)).toBe(true);
  });

  it("témoin : un préfixe voisin non listé n'hérite pas de l'exemption", async () => {
    const reponse = await updateSession(requete("/api/tools/monetizationX", "POST"));
    expect(estRedirectionLogin(reponse)).toBe(true);
  });
});
