import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw Object.assign(new Error(destination), { destination });
  }),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
// Dépendances des autres actions du fichier : sans objet pour la connexion.
vi.mock("@/lib/emails-reserves", () => ({ envoyerInvitation: vi.fn() }));
vi.mock("@/lib/invitation-relais", () => ({ deposerLienInvitation: vi.fn() }));
vi.mock("@/lib/depot-photo", () => ({ deposerObjet: vi.fn() }));

import { connexionAction, deconnexionAction } from "@/app/actions";

function formulaire(suivant = "/dashboard") {
  const donnees = new FormData();
  donnees.set("email", "personne@example.test");
  donnees.set("password", "secret");
  donnees.set("next", suivant);
  return donnees;
}

type Options = {
  authError?: { status?: number; message: string } | null;
  autorise?: boolean;
  contexte?: { entreprise_id: string | null } | null;
  erreurContexte?: { message: string } | null;
  erreurAcces?: { message: string } | null;
  invitations?: { intervenant_id: string }[];
};

function client({
  authError = null,
  autorise = true,
  contexte = { entreprise_id: "entreprise-a" },
  erreurContexte = null,
  erreurAcces = null,
  invitations = [],
}: Options = {}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn((fonction: string) => {
    if (fonction === "contexte_application_courant") {
      return { maybeSingle: vi.fn().mockResolvedValue({ data: contexte, error: erreurContexte }) };
    }
    if (fonction === "a_acces_application") {
      return Promise.resolve({ data: erreurAcces ? null : autorise, error: erreurAcces });
    }
    if (fonction === "reserves_invitations_en_attente") {
      return Promise.resolve({ data: invitations, error: null });
    }
    throw new Error(`RPC inattendue : ${fonction}`);
  });
  return {
    auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: authError }), signOut },
    rpc,
  };
}

async function destination(promesse: Promise<unknown>) {
  try {
    await promesse;
  } catch (erreur) {
    return (erreur as { destination?: string }).destination;
  }
  return undefined;
}

describe("connexion Réserves — décision et destination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("autorisé : va à la destination locale demandée, sans déconnexion", async () => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase);
    expect(await destination(connexionAction(formulaire("/reserve/123")))).toBe("/reserve/123");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["schéma absolu", "https://evil.example"],
    ["chemin relatif au protocole", "//evil.example"],
    ["barre oblique inverse littérale", "/\\evil.example"],
    ["barre oblique inverse encodée", "/%5Cevil.example"],
    ["valeur vide", ""],
  ])("autorisé mais next externe (%s) : repli sûr /dashboard", async (_cas, suivant) => {
    mocks.createClient.mockResolvedValue(client());
    expect(await destination(connexionAction(formulaire(suivant)))).toBe("/dashboard");
  });
});

describe("connexion Réserves — un refus d'accès ne ferme que la session Réserves", () => {
  beforeEach(() => vi.clearAllMocks());

  const cas: [string, Options, string][] = [
    ["contexte vide (sans organisation)", { contexte: null }, "/login?error=acces-reserves"],
    ["décision d'accès négative", { autorise: false }, "/login?error=acces-reserves"],
    ["erreur du contexte canonique", { erreurContexte: { message: "timeout" } }, "/login?error=service-indisponible"],
    ["erreur de la décision d'accès", { erreurAcces: { message: "timeout" } }, "/login?error=service-indisponible"],
  ];

  it.each(cas)("%s → portée locale", async (_nom, options, attendu) => {
    const supabase = client(options);
    mocks.createClient.mockResolvedValue(supabase);
    expect(await destination(connexionAction(formulaire()))).toBe(attendu);
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("invitation en attente : on ne déconnecte pas, on va rejoindre l'intervention", async () => {
    const supabase = client({ autorise: false, invitations: [{ intervenant_id: "int-1" }] });
    mocks.createClient.mockResolvedValue(supabase);
    expect(await destination(connexionAction(formulaire()))).toBe("/rejoindre/int-1");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("lien d'invitation : la destination /invitation/* n'exige aucun droit", async () => {
    const supabase = client({ autorise: false });
    mocks.createClient.mockResolvedValue(supabase);
    expect(await destination(connexionAction(formulaire("/invitation/jeton")))).toBe("/invitation/jeton");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});

describe("déconnexion Réserves : quand elle reste globale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("la déconnexion volontaire est sans option (défaut supabase-js = global)", async () => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase);
    await destination(deconnexionAction());
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
    expect(supabase.auth.signOut).toHaveBeenCalledWith();
  });
});
