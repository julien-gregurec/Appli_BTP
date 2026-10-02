import { afterEach, describe, expect, it, vi } from "vitest";
import { adresseIpClient, normaliserIpRateLimit, politiquesRateLimitPour } from "./rate-limit";

describe("politiques de rate limiting", () => {
  it("protège fortement les actions publiques d'authentification", () => {
    // /login : plafond anti-flot IP uniquement ; l'anti-bruteforce compte les
    // échecs par compte / compte+IP / IP dans loginAction.
    expect(politiquesRateLimitPour("/login", "POST", false)).toMatchObject([
      { cle: "auth:login:ip-flot", maximum: 300, fenetreSecondes: 600, portee: "ip" },
    ]);
    expect(politiquesRateLimitPour("/login", "GET", false)).toEqual([]);
    expect(politiquesRateLimitPour("/signup", "POST", false)[0]?.maximum).toBe(5);
    expect(politiquesRateLimitPour("/mot-de-passe-oublie", "POST", false)[0]?.maximum).toBe(5);
  });

  it("limite le référentiel véhicule, l'assistant et les exports", () => {
    expect(politiquesRateLimitPour("/api/referentiels/vehicules", "GET", true)[0]?.maximum).toBe(10);
    expect(politiquesRateLimitPour("/api/assistant/chat", "POST", true)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ portee: "utilisateur", maximum: 20 }),
        expect.objectContaining({ portee: "entreprise", maximum: 100 }),
      ]),
    );
    expect(politiquesRateLimitPour("/api/exports/comptabilite", "GET", true)[0]).toMatchObject({
      portee: "utilisateur",
      maximum: 10,
    });
  });

  it("applique un plafond par défaut à toute API authentifiée", () => {
    expect(politiquesRateLimitPour("/api/identification/123/qr", "GET", true)[0]).toMatchObject({
      cle: "api:authenticated",
      maximum: 120,
      portee: "utilisateur",
    });
  });

  it("protège les intégrations publiques et téléchargements signés", () => {
    expect(politiquesRateLimitPour("/api/paie/import", "POST", false)[0]).toMatchObject({
      cle: "api:payroll-import",
      portee: "ip",
    });
    expect(politiquesRateLimitPour("/api/cron/notifications-push", "POST", false)[0]?.maximum).toBe(60);
    expect(politiquesRateLimitPour("/api/documents/123", "GET", true)[0]).toMatchObject({
      cle: "api:signed-downloads",
      maximum: 60,
    });
  });
});

describe("adresse IP du client pour le rate limiting", () => {
  afterEach(() => vi.unstubAllEnvs());

  const entetes = (valeurs: Record<string, string>) => new Headers(valeurs);

  it("sur Vercel, lit l'en-tête posé par la plateforme", () => {
    vi.stubEnv("VERCEL", "1");
    expect(adresseIpClient(entetes({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(adresseIpClient(entetes({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(adresseIpClient(entetes({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("hors Vercel, ignore les maillons X-Forwarded-For falsifiables par le client", () => {
    vi.stubEnv("VERCEL", "");
    // Le client envoie « X-Forwarded-For: 6.6.6.6 », notre proxy ajoute l'IP réelle à droite.
    expect(adresseIpClient(entetes({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(adresseIpClient(entetes({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.8");
  });

  it("ignore une valeur qui n'est pas une IP (injection, valeur aléatoire par requête)", () => {
    vi.stubEnv("VERCEL", "1");
    expect(adresseIpClient(entetes({ "x-vercel-forwarded-for": "pas-une-ip", "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(adresseIpClient(entetes({ "x-vercel-forwarded-for": "' or 1=1 --" }))).toBe("ip-indisponible");
    expect(adresseIpClient(entetes({}))).toBe("ip-indisponible");
  });

  it("regroupe une IPv6 par /64 et ramène une IPv4 mappée à l'IPv4", () => {
    expect(normaliserIpRateLimit("2001:db8:abcd:12:1:2:3:4")).toBe("2001:db8:abcd:12::/64");
    expect(normaliserIpRateLimit("2001:DB8:ABCD:0012:ffff::1")).toBe("2001:db8:abcd:12::/64");
    expect(normaliserIpRateLimit("2001:db8:abcd:12::99")).toBe(normaliserIpRateLimit("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd"));
    expect(normaliserIpRateLimit("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normaliserIpRateLimit("[2001:db8::1]:443")).toBe("2001:db8:0:0::/64");
    expect(normaliserIpRateLimit("::1")).toBe("0:0:0:0::/64");
    expect(normaliserIpRateLimit("2001:db8::1::2")).toBeNull();
    expect(normaliserIpRateLimit("999.1.1.1")).toBeNull();
    expect(normaliserIpRateLimit("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});
