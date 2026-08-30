import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw Object.assign(new Error(destination), { destination });
  }),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { connexionAction } from "@/app/actions";

function formulaire(email = "personne@example.test", password = "secret", suivant = "/dashboard") {
  const donnees = new FormData();
  donnees.set("email", email);
  donnees.set("password", password);
  donnees.set("next", suivant);
  return donnees;
}

function client({
  authError = null,
  autorise = true,
  contexte = { entreprise_id: "entreprise-a" },
  niveauMfa = { currentLevel: "aal1", nextLevel: "aal1" },
}: {
  authError?: { message: string } | null;
  autorise?: boolean;
  contexte?: { entreprise_id: string | null } | null;
  niveauMfa?: { currentLevel: string; nextLevel: string };
} = {}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn((fonction: string) => {
    if (fonction === "contexte_application_courant") {
      return { maybeSingle: vi.fn().mockResolvedValue({ data: contexte, error: null }) };
    }
    if (fonction === "a_acces_application") {
      return Promise.resolve({ data: autorise, error: null });
    }
    throw new Error(`RPC inattendue : ${fonction}`);
  });
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: authError }),
      signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: niveauMfa, error: null }),
      },
    },
    rpc,
  };
}

describe("connexion Colors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("distingue des identifiants invalides d’un défaut d’habilitation", async () => {
    const supabase = client({ authError: { message: "invalid credentials" } });
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire())).rejects.toMatchObject({
      destination: "/login?error=Identifiants%20incorrects.",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("autorise uniquement la destination locale après la décision SQL positive", async () => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire("personne@example.test", "secret", "/inventaire")))
      .rejects.toMatchObject({ destination: "/inventaire" });
    expect(supabase.rpc).toHaveBeenCalledWith("a_acces_application", {
      p_entreprise_id: "entreprise-a",
      p_application_code: "colors",
    });
  });

  it("ferme une session valide sans Colors et affiche le message produit exact", async () => {
    const supabase = client({ autorise: false });
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire())).rejects.toMatchObject({
      destination: "/login?error=Votre%20compte%20ELSATIA%20ne%20dispose%20pas%20d%E2%80%99un%20acc%C3%A8s%20actif%20%C3%A0%20Colors.",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
  });

  it("neutralise une destination externe", async () => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire("personne@example.test", "secret", "//evil.example")))
      .rejects.toMatchObject({ destination: "/dashboard" });
  });

  it("exige le second facteur quand la session peut passer à aal2", async () => {
    const supabase = client({ niveauMfa: { currentLevel: "aal1", nextLevel: "aal2" } });
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire("personne@example.test", "secret", "/inventaire")))
      .rejects.toMatchObject({ destination: "/login/mfa?next=%2Finventaire" });
    // Aucune décision d'accès Colors avant l'élévation AAL2.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("ignore une destination externe lors de la redirection second facteur", async () => {
    const supabase = client({ niveauMfa: { currentLevel: "aal1", nextLevel: "aal2" } });
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire("personne@example.test", "secret", "//evil.example")))
      .rejects.toMatchObject({ destination: "/login/mfa?next=%2Fdashboard" });
  });
});
