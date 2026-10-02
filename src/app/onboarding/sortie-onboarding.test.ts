import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ELSATIA POST-V9 HARDENING V1 — Lot C : onboarding bloquant (utilisateur authentifié
// sans entreprise exploitable). Le rapport V9 final §6 constatait l'absence de toute
// sortie (« Se déconnecter », « Retour à l'accueil ») sur src/app/onboarding/*.
// Témoin ROUGE sur V9 (6392131a) ; VERT après correctif.

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: mocks.signOut }, rpc: mocks.rpc })),
}));

const { logoutAction } = await import("@/app/actions/auth");
const { destinationDeconnexion } = await import("@/lib/auth/sortie");
const { SortieOnboarding } = await import("@/components/SortieOnboarding");

const formulaire = (destination?: string) => {
  const formData = new FormData();
  if (destination !== undefined) formData.set("destination", destination);
  return formData;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
});

describe("Lot C — sortie de l'onboarding bloquant", () => {
  it("la page /onboarding expose la sortie", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("<SortieOnboarding />");
  });

  it("deux boutons natifs, sans lien vers une route authentifiée ni donnée d'organisation", () => {
    const html = renderToStaticMarkup(createElement(SortieOnboarding));
    expect(html).toContain('aria-label="Quitter la configuration du compte"');
    expect(html.match(/<button type="submit"/g)).toHaveLength(2);
    expect(html).toContain("Retour à l’accueil");
    expect(html).toContain("Se déconnecter");
    expect(html).toContain('name="destination" value="accueil"');
    expect(html).toContain('name="destination" value="connexion"');
    expect(html).not.toMatch(/href=/);
    expect(html).toMatch(/focus-visible:ring-2/);
    expect(html).toMatch(/min-h-11/); // cible tactile ≥ 44 px
  });

  it("« Se déconnecter » ferme réellement la session puis mène à /login", async () => {
    await expect(logoutAction(formulaire("connexion"))).rejects.toThrow(/^REDIRECT:\/login$/);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("« Retour à l'accueil » ferme la session AVANT l'accueil (pas de boucle /dashboard → /onboarding)", async () => {
    await expect(logoutAction(formulaire("accueil"))).rejects.toThrow(/^REDIRECT:\/$/);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("destination en liste blanche : toute autre valeur mène à /login", () => {
    for (const valeur of ["https://evil.example", "//evil.example", "/dashboard", "/plateforme", "", "ACCUEIL"]) {
      expect(destinationDeconnexion(formulaire(valeur))).toBe("/login");
    }
    expect(destinationDeconnexion(undefined)).toBe("/login");
    expect(destinationDeconnexion(formulaire())).toBe("/login");
  });

  it("appel historique sans formulaire inchangé (/login)", async () => {
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("compte dépôt : jamais déconnecté sans mot de passe, même depuis la sortie", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(logoutAction(formulaire("accueil"))).rejects.toThrow("REDIRECT:/stock/borne?deconnexion=1");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
