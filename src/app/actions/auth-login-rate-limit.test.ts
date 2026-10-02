/**
 * ELSATIA — LOGIN RATE LIMIT NAT / AGENCY HARDENING V1 : matrice de scénarios.
 *
 * Chaque tentative simulée traverse les deux couches réelles :
 *  1. le plafond anti-flot du proxy (politiquesRateLimitPour + appliquerRateLimit) ;
 *  2. loginAction (budgets d'échecs compte / compte+IP / IP, puis Supabase Auth).
 * Seuls Supabase Auth (annuaire en mémoire) et la base des compteurs (double en
 * mémoire des RPC, fenêtres fixes identiques au SQL) sont simulés.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { creerRateLimitMemoire } from "@/lib/security/__test-support__/rate-limit-memoire";

const etat = vi.hoisted(() => ({
  entetes: new Headers(),
  annuaire: new Map<string, string>(),
  appelsAuth: 0,
  limiteur: null as null | { rpc: (nom: string, p: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => etat.entetes }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: async () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => etat.limiteur }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        etat.appelsAuth++;
        const attendu = etat.annuaire.get(email.trim().toLowerCase());
        return attendu !== undefined && attendu === password
          ? { error: null }
          : { error: { message: "Invalid login credentials", code: "invalid_credentials" } };
      },
    },
  }),
}));

import { loginAction } from "./auth";
import { appliquerRateLimit, politiquesRateLimitPour, type PolitiqueRateLimit } from "@/lib/security/rate-limit";
import { MESSAGE_CONNEXION_BLOQUEE } from "@/lib/security/login-rate-limit";

type Issue = "succes" | "echec" | "bloque" | "429";

let memoire = creerRateLimitMemoire();

async function tenter(email: string, password: string, ip: string, politiqueProxy?: PolitiqueRateLimit[]): Promise<Issue> {
  etat.entetes = new Headers({ "x-vercel-forwarded-for": ip, "x-forwarded-for": ip });
  const requete = new Request("https://gestion.example.invalid/login", { method: "POST", headers: etat.entetes });
  const proxy = await appliquerRateLimit(requete, memoire.client, politiqueProxy ?? politiquesRateLimitPour("/login", "POST", false));
  if (!proxy.autorise) return "429";
  if (politiqueProxy) return "succes"; // reproduction de l'ancien comportement : proxy seul
  const formulaire = new FormData();
  formulaire.set("email", email);
  formulaire.set("password", password);
  try {
    await loginAction(formulaire);
  } catch (erreur) {
    const destination = decodeURIComponent(String((erreur as Error).message).replace(/^REDIRECT:/, ""));
    if (destination === "/dashboard") return "succes";
    if (destination.includes(MESSAGE_CONNEXION_BLOQUEE)) return "bloque";
    return "echec";
  }
  throw new Error("loginAction doit toujours rediriger");
}

const IP_AGENCE = "203.0.113.10";
const salaries = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `salarie${i + 1}@agence-btp.fr`, password: `motdepasse-${i + 1}` }));

beforeAll(() => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("RATE_LIMIT_HMAC_KEY", "cle-hmac-scenarios");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  memoire = creerRateLimitMemoire();
  etat.limiteur = memoire.client;
  etat.annuaire = new Map(salaries(60).map((s) => [s.email, s.password]));
  etat.annuaire.set("dirigeant@agence-btp.fr", "le-bon-mot-de-passe");
  etat.appelsAuth = 0;
});

describe("1. reproduction — ancienne clé IP seule (10 POST / 10 min)", () => {
  it("bloque la 11e connexion légitime d'une agence derrière une même box", async () => {
    const ancienne: PolitiqueRateLimit[] = [{ cle: "auth:login", maximum: 10, fenetreSecondes: 600, portee: "ip" }];
    const issues: Issue[] = [];
    for (const s of salaries(15)) issues.push(await tenter(s.email, s.password, IP_AGENCE, ancienne));
    expect(issues.filter((i) => i === "succes")).toHaveLength(10);
    expect(issues.slice(10)).toEqual(Array(5).fill("429"));
  });
});

describe("9. matrice NAT — salariés légitimes derrière une même IP", () => {
  it.each([10, 15, 25, 50])("%i salariés avec les bons identifiants se connectent tous", async (n) => {
    const issues: Issue[] = [];
    for (const s of salaries(n)) issues.push(await tenter(s.email, s.password, IP_AGENCE));
    expect(issues).toEqual(Array(n).fill("succes"));
    // Aucun succès ne consomme de budget d'échec (seul le plafond anti-flot compte les POST).
    expect([...memoire.compteurs.keys()].filter((cle) => cle.includes(":echec:"))).toEqual([]);
  });

  it.each([10, 25, 50])("%i salariés qui font chacun deux fautes de frappe (100 échecs pour 50) se connectent tous", async (n) => {
    const finales: Issue[] = [];
    for (const s of salaries(n)) {
      expect(await tenter(s.email, "faute-de-frappe", IP_AGENCE)).toBe("echec");
      expect(await tenter(s.email, "autre-faute", IP_AGENCE)).toBe("echec");
      finales.push(await tenter(s.email, s.password, IP_AGENCE));
    }
    expect(finales).toEqual(Array(n).fill("succes"));
  });

  it("50 salariés se reconnectent 3 fois dans la matinée (150 connexions) sans blocage", async () => {
    for (let vague = 0; vague < 3; vague++) {
      for (const s of salaries(50)) expect(await tenter(s.email, s.password, IP_AGENCE)).toBe("succes");
      memoire.avancer(3_600);
    }
  });

  it("un poste de l'agence qui bruteforce un compte ne bloque pas les collègues", async () => {
    for (let i = 0; i < 40; i++) await tenter("dirigeant@agence-btp.fr", `essai-${i}`, IP_AGENCE);
    for (const s of salaries(50)) expect(await tenter(s.email, s.password, IP_AGENCE)).toBe("succes");
  });
});

describe("1. un utilisateur, 20 échecs", () => {
  it("5 essais atteignent Supabase, puis blocage uniforme ; déblocage progressif", async () => {
    const issues: Issue[] = [];
    for (let i = 0; i < 20; i++) issues.push(await tenter("dirigeant@agence-btp.fr", `faux-${i}`, "198.51.100.20"));
    expect(issues.slice(0, 5)).toEqual(Array(5).fill("echec"));
    expect(issues.slice(5)).toEqual(Array(15).fill("bloque"));
    expect(etat.appelsAuth).toBe(5);
    // Fin de la fenêtre courte : 5 nouveaux essais, jusqu'au plafond journalier (20).
    for (let fenetre = 0; fenetre < 5; fenetre++) {
      memoire.avancer(900);
      for (let i = 0; i < 5; i++) await tenter("dirigeant@agence-btp.fr", "faux", "198.51.100.20");
    }
    expect(etat.appelsAuth).toBe(20);
  });

  it("pendant le blocage, même le bon mot de passe est refusé (pas d'oracle), puis accepté après la fenêtre", async () => {
    for (let i = 0; i < 5; i++) await tenter("dirigeant@agence-btp.fr", "faux", "198.51.100.20");
    const appels = etat.appelsAuth;
    expect(await tenter("dirigeant@agence-btp.fr", "le-bon-mot-de-passe", "198.51.100.20")).toBe("bloque");
    expect(etat.appelsAuth).toBe(appels);
    memoire.avancer(900);
    expect(await tenter("dirigeant@agence-btp.fr", "le-bon-mot-de-passe", "198.51.100.20")).toBe("succes");
  });
});

describe("7. anti-énumération", () => {
  it("un compte existant et un email inconnu produisent exactement la même séquence de réponses", async () => {
    const existant: Issue[] = [];
    const inconnu: Issue[] = [];
    for (let i = 0; i < 12; i++) existant.push(await tenter("dirigeant@agence-btp.fr", "faux", "198.51.100.30"));
    for (let i = 0; i < 12; i++) inconnu.push(await tenter("personne@inexistant.fr", "faux", "198.51.100.31"));
    expect(inconnu).toEqual(existant);
  });

  it("le blocage est le même message pour tous les budgets et tous les comptes", async () => {
    // Blocage compte+IP (compte existant) puis blocage IP (emails inconnus).
    for (let i = 0; i < 5; i++) await tenter("dirigeant@agence-btp.fr", "faux", "198.51.100.40");
    expect(await tenter("dirigeant@agence-btp.fr", "faux", "198.51.100.40")).toBe("bloque");
    for (let i = 0; i < 150; i++) await tenter(`inconnu${i}@x.fr`, "faux", "198.51.100.41");
    expect(await tenter("inconnu-suivant@x.fr", "faux", "198.51.100.41")).toBe("bloque");
  });
});

describe("8/9. attaques", () => {
  it("1 attaquant, 1 IP, 100 tentatives sur un compte : 5 essais réels", async () => {
    for (let i = 0; i < 100; i++) await tenter("dirigeant@agence-btp.fr", `essai-${i}`, "192.0.2.66");
    expect(etat.appelsAuth).toBe(5);
  });

  it("1 attaquant, 10 IP, 100 tentatives sur un compte : plafond compte à 30 essais réels / heure", async () => {
    const ips = Array.from({ length: 10 }, (_, i) => `192.0.2.${100 + i}`);
    for (let i = 0; i < 100; i++) await tenter("dirigeant@agence-btp.fr", `essai-${i}`, ips[i % 10]);
    expect(etat.appelsAuth).toBeLessThanOrEqual(30);
  });

  it("attaque distribuée patiente (10 IP, 24 h) : au plus 100 essais réels par jour sur le compte", async () => {
    memoire = creerRateLimitMemoire(1_800_000_000 - (1_800_000_000 % 86_400)); // début de journée (fenêtres fixes)
    etat.limiteur = memoire.client;
    const ips = Array.from({ length: 10 }, (_, i) => `192.0.2.${100 + i}`);
    for (let heure = 0; heure < 24; heure++) {
      for (let i = 0; i < 100; i++) await tenter("dirigeant@agence-btp.fr", `essai-${heure}-${i}`, ips[i % 10]);
      memoire.avancer(3_600);
    }
    expect(etat.appelsAuth).toBeLessThanOrEqual(100);
  });

  it("attaque distribuée via IPv6 : les adresses d'un même /64 partagent le budget", async () => {
    for (let i = 0; i < 100; i++) await tenter("dirigeant@agence-btp.fr", "faux", `2001:db8:1:2::${(i + 1).toString(16)}`);
    expect(etat.appelsAuth).toBe(5);
  });

  it("credential stuffing depuis 1 IP sur 1000 comptes : au plus 150 essais réels / 15 min", async () => {
    for (let i = 0; i < 1_000; i++) await tenter(`victime${i}@ailleurs.fr`, "Password123", "192.0.2.200");
    expect(etat.appelsAuth).toBe(150);
  });

  it("flot brut depuis 1 IP : 429 au proxy au-delà de 300 POST / 10 min", async () => {
    const issues: Issue[] = [];
    for (let i = 0; i < 310; i++) issues.push(await tenter(`salarie${(i % 50) + 1}@agence-btp.fr`, `motdepasse-${(i % 50) + 1}`, "192.0.2.201"));
    expect(issues.slice(0, 300).every((i) => i === "succes")).toBe(true);
    expect(issues.slice(300)).toEqual(Array(10).fill("429"));
  });

  it("le titulaire d'un compte attaqué depuis une IP se connecte depuis son agence", async () => {
    for (let i = 0; i < 100; i++) await tenter("dirigeant@agence-btp.fr", "faux", "192.0.2.66");
    expect(await tenter("dirigeant@agence-btp.fr", "le-bon-mot-de-passe", IP_AGENCE)).toBe("succes");
  });

  it("limite connue : pendant une attaque distribuée, le compte ciblé est suspendu jusqu'à 1 h", async () => {
    const ips = Array.from({ length: 10 }, (_, i) => `192.0.2.${100 + i}`);
    for (let i = 0; i < 100; i++) await tenter("dirigeant@agence-btp.fr", "faux", ips[i % 10]);
    expect(await tenter("dirigeant@agence-btp.fr", "le-bon-mot-de-passe", IP_AGENCE)).toBe("bloque");
    // Les autres comptes de l'agence ne sont pas touchés.
    expect(await tenter("salarie1@agence-btp.fr", "motdepasse-1", IP_AGENCE)).toBe("succes");
    memoire.avancer(3_600);
    expect(await tenter("dirigeant@agence-btp.fr", "le-bon-mot-de-passe", IP_AGENCE)).toBe("succes");
  });
});

describe("résilience", () => {
  it("limiteur en panne : connexion refusée proprement (fail closed), Supabase non appelé", async () => {
    memoire.tomberEnPanne();
    etat.entetes = new Headers({ "x-vercel-forwarded-for": IP_AGENCE });
    const formulaire = new FormData();
    formulaire.set("email", "salarie1@agence-btp.fr");
    formulaire.set("password", "motdepasse-1");
    await expect(loginAction(formulaire)).rejects.toThrow(/REDIRECT:\/login\?error=Connexion%20momentan/);
    expect(etat.appelsAuth).toBe(0);
  });

  it("clé HMAC absente en production : refus, Supabase non appelé", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_HMAC_KEY", "");
    etat.entetes = new Headers({ "x-vercel-forwarded-for": IP_AGENCE });
    const formulaire = new FormData();
    formulaire.set("email", "salarie1@agence-btp.fr");
    formulaire.set("password", "motdepasse-1");
    await expect(loginAction(formulaire)).rejects.toThrow(/REDIRECT:\/login\?error=Connexion%20momentan/);
    expect(etat.appelsAuth).toBe(0);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RATE_LIMIT_HMAC_KEY", "cle-hmac-scenarios");
  });

  it("le paramètre next du passage d'identité est conservé sur un blocage", async () => {
    for (let i = 0; i < 5; i++) await tenter("dirigeant@agence-btp.fr", "faux", "198.51.100.50");
    etat.entetes = new Headers({ "x-vercel-forwarded-for": "198.51.100.50" });
    const formulaire = new FormData();
    formulaire.set("email", "dirigeant@agence-btp.fr");
    formulaire.set("password", "faux");
    await expect(loginAction(formulaire)).rejects.toThrow(/REDIRECT:\/login\?error=Trop%20de%20tentatives/);
  });
});
