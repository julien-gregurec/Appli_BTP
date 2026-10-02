import { describe, expect, it, vi } from "vitest";
import {
  POLITIQUES_ECHEC_CONNEXION,
  enregistrerEchecConnexion,
  estEchecIdentifiants,
  journaliserConnexion,
  normaliserEmailConnexion,
  verifierBudgetConnexion,
} from "./login-rate-limit";
import { creerRateLimitMemoire } from "./__test-support__/rate-limit-memoire";

const secret = "cle-test-rate-limit";
const entree = (email: string, ip: string) => ({ email, ip, secret });

describe("anti-bruteforce de connexion — budgets d'échecs", () => {
  it("n'utilise jamais l'IP seule : trois dimensions compte+IP, compte, IP", () => {
    expect(new Set(POLITIQUES_ECHEC_CONNEXION.map((p) => p.dimension))).toEqual(new Set(["compte-ip", "compte", "ip"]));
    for (const p of POLITIQUES_ECHEC_CONNEXION) expect(p.cle.length).toBeLessThanOrEqual(80);
  });

  it("une lecture ne consomme aucun budget (succès gratuit)", async () => {
    const memoire = creerRateLimitMemoire();
    for (let i = 0; i < 1_000; i++) {
      expect(await verifierBudgetConnexion(memoire.client, entree("a@agence.fr", "203.0.113.7"))).toEqual({ autorise: true });
    }
    expect(memoire.compteurs.size).toBe(0);
  });

  it("bloque un compte après 5 échecs depuis une IP, sans bloquer le titulaire depuis une autre IP", async () => {
    const memoire = creerRateLimitMemoire();
    for (let i = 0; i < 5; i++) await enregistrerEchecConnexion(memoire.client, entree("cible@agence.fr", "198.51.100.1"));
    const bloque = await verifierBudgetConnexion(memoire.client, entree("cible@agence.fr", "198.51.100.1"));
    expect(bloque).toMatchObject({ autorise: false, raison: "bloque", politique: { cle: "auth:login:echec:compte-ip" } });
    expect(await verifierBudgetConnexion(memoire.client, entree("cible@agence.fr", "203.0.113.9"))).toEqual({ autorise: true });
    // Un collègue derrière la même IP n'est pas concerné.
    expect(await verifierBudgetConnexion(memoire.client, entree("collegue@agence.fr", "198.51.100.1"))).toEqual({ autorise: true });
  });

  it("normalise l'email : la casse et les espaces ne contournent pas le compteur", async () => {
    const memoire = creerRateLimitMemoire();
    const variantes = ["Cible@Agence.fr", " cible@agence.fr", "CIBLE@AGENCE.FR ", "cible@agence.FR", "cIble@agence.fr"];
    for (const email of variantes) await enregistrerEchecConnexion(memoire.client, entree(email, "198.51.100.1"));
    expect(normaliserEmailConnexion(" A@B.FR ")).toBe("a@b.fr");
    expect((await verifierBudgetConnexion(memoire.client, entree("cible@agence.fr", "198.51.100.1"))).autorise).toBe(false);
  });

  it("trace la première tentative bloquée dans le journal d'abus, une seule fois par fenêtre", async () => {
    const memoire = creerRateLimitMemoire();
    for (let i = 0; i < 5; i++) await enregistrerEchecConnexion(memoire.client, entree("cible@agence.fr", "198.51.100.1"));
    for (let i = 0; i < 10; i++) await verifierBudgetConnexion(memoire.client, entree("cible@agence.fr", "198.51.100.1"));
    expect(memoire.journal.filter((l) => l.cle === "auth:login:echec:compte-ip")).toHaveLength(1);
  });

  it("refuse (fail closed) si le limiteur est en panne", async () => {
    const memoire = creerRateLimitMemoire();
    memoire.tomberEnPanne();
    expect(await verifierBudgetConnexion(memoire.client, entree("a@agence.fr", "203.0.113.7"))).toEqual({ autorise: false, raison: "indisponible" });
    expect(await enregistrerEchecConnexion(memoire.client, entree("a@agence.fr", "203.0.113.7"))).toEqual({ enregistre: false });
  });

  it("ne compte comme échec que les identifiants refusés", () => {
    expect(estEchecIdentifiants({ message: "Invalid login credentials" })).toBe(true);
    expect(estEchecIdentifiants({ code: "invalid_credentials", message: "x" })).toBe(true);
    expect(estEchecIdentifiants({ message: "Email not confirmed" })).toBe(false);
    expect(estEchecIdentifiants({ message: "Request rate limit reached" })).toBe(false);
    expect(estEchecIdentifiants({ message: "fetch failed" })).toBe(false);
    expect(estEchecIdentifiants(null)).toBe(false);
  });

  it("journalise sans email, mot de passe, jeton ni IP en clair", async () => {
    const espion = vi.spyOn(console, "warn").mockImplementation(() => {});
    await journaliserConnexion("auth.login.bloque", entree("prenom.nom@agence.fr", "198.51.100.1"), { politique: "auth:login:echec:compte", reessayerApres: 60 });
    const ligne = String(espion.mock.calls[0]?.[0]);
    espion.mockRestore();
    expect(ligne).not.toContain("prenom");
    expect(ligne).not.toContain("agence.fr");
    expect(ligne).not.toContain("198.51.100.1");
    expect(ligne).not.toContain(secret);
    expect(JSON.parse(ligne)).toMatchObject({ evenement: "auth.login.bloque", politique: "auth:login:echec:compte", reessayerApres: 60 });
    expect(JSON.parse(ligne).compte).toMatch(/^[0-9a-f]{12}$/);
  });
});
