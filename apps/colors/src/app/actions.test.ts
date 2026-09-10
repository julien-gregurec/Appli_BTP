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
}: {
  authError?: { message: string } | null;
  autorise?: boolean;
  contexte?: { entreprise_id: string | null } | null;
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
      destination: "/login?error=identifiants",
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
      destination: "/login?error=acces-colors",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
  });

  it.each([
    ["chemin relatif au protocole", "//evil.example.com"],
    ["barre oblique inverse littérale", "/\\evil.example.com"],
    ["barre oblique inverse encodée", "/%5Cevil.example.com"],
    ["tabulation encodée", "/%09/evil.example.com"],
    ["schéma absolu", "https://evil.example.com"],
    ["schéma javascript", "javascript:alert(1)"],
    ["valeur malformée", "/%"],
    ["valeur vide", ""],
  ])("neutralise une destination externe (%s)", async (_cas, suivant) => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase);

    await expect(connexionAction(formulaire("personne@example.test", "secret", suivant)))
      .rejects.toMatchObject({ destination: "/dashboard" });
  });
});

describe("une panne n'est jamais presentee comme une absence de droit", () => {
  it("une erreur du contexte canonique annonce le service, pas l'habilitation", async () => {
    // Constate en recette : sous charge, un delai depasse sur cette RPC faisait
    // annoncer « votre compte ne dispose pas d'un acces actif a Colors » a une
    // personne parfaitement habilitee. Le message envoie alors vers le mauvais
    // interlocuteur — on demande une habilitation au lieu d'attendre le service.
    const supabase = client({ autorise: true });
    supabase.rpc = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }),
    });
    mocks.createClient.mockResolvedValue(supabase);
    await expect(connexionAction(formulaire())).rejects.toMatchObject({
      destination: "/login?error=service-indisponible",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
  });

  it("un contexte VIDE reste une absence d'acces : la base a repondu", async () => {
    const supabase = client({ autorise: true });
    supabase.rpc = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mocks.createClient.mockResolvedValue(supabase);
    await expect(connexionAction(formulaire())).rejects.toMatchObject({
      destination: "/login?error=acces-colors",
    });
  });
});
