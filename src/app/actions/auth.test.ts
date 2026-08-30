import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  urlCanonique: "https://preview.example.invalid",
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  headers: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  estPlateformeAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/brand", () => ({ BRAND: { urlPublique: mocks.urlCanonique } }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      verifyOtp: mocks.verifyOtp,
      mfa: { getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel },
    },
  })),
}));

import { confirmerCompteAction, demanderReinitialisationAction, loginAction, modifierMotDePasseAction, signupAction } from "./auth";

describe("actions Auth et URL canonique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-test" }, session: null }, error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-test" } } });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("ignore l’origine de la requête lors d’une récupération", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");

    await expect(demanderReinitialisationAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("recette@example.invalid", {
      redirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    });
  });

  it("utilise l’URL canonique pour la confirmation d’inscription", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("password", "mot-de-passe-test");
    formData.set("nom", "Recette");
    formData.set("prenom", "Elsatia");
    formData.set("code_entreprise", "entreprise");

    await expect(signupAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        emailRedirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fonboarding%3Fcode%3DENTREPRISE`,
      }),
    }));
  });

  it("conserve l’offre choisie sur /tarifs jusqu’au lien de confirmation", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("password", "mot-de-passe-test");
    formData.set("nom", "Recette");
    formData.set("prenom", "Elsatia");
    formData.set("offre", "mini");

    await expect(signupAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        data: expect.objectContaining({ offre: "mini" }),
        emailRedirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fonboarding%3Foffre%3Dmini`,
      }),
    }));
  });

  it("ignore une offre inconnue plutôt que de la transmettre telle quelle", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("password", "mot-de-passe-test");
    formData.set("nom", "Recette");
    formData.set("prenom", "Elsatia");
    formData.set("offre", "offre-inexistante");

    await expect(signupAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        data: expect.objectContaining({ offre: null }),
        emailRedirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fonboarding`,
      }),
    }));
  });
});

describe("loginAction — routage post-connexion selon le statut admin plateforme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    // Par défaut : compte sans facteur MFA vérifié → session aal1 sans élévation possible.
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
  });

  const formulaire = (email: string, password: string) => {
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    return formData;
  };

  it("redirige un admin plateforme directement vers /plateforme, jamais vers l'onboarding entreprise", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    await expect(loginAction(formulaire("julien@elsatia.fr", "motdepasse"))).rejects.toThrow(
      "REDIRECT:/plateforme",
    );
    expect(mocks.estPlateformeAdmin).toHaveBeenCalled();
  });

  it("redirige un utilisateur normal vers /dashboard (comportement inchangé)", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    await expect(loginAction(formulaire("employe@example.invalid", "motdepasse"))).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
  });

  it("exige le second facteur quand la session est aal1 mais peut passer à aal2", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    await expect(loginAction(formulaire("employe@example.invalid", "motdepasse"))).rejects.toThrow(
      "REDIRECT:/login/mfa?next=%2Fdashboard",
    );
  });

  it("préserve la destination admin lors de la redirection vers le second facteur", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    await expect(loginAction(formulaire("julien@elsatia.fr", "motdepasse"))).rejects.toThrow(
      "REDIRECT:/login/mfa?next=%2Fplateforme",
    );
  });

  it("ne vérifie jamais le statut admin plateforme si les identifiants sont invalides", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    await expect(loginAction(formulaire("julien@elsatia.fr", "mauvais-mot-de-passe"))).rejects.toThrow(
      "REDIRECT:/login?error=",
    );
    expect(mocks.estPlateformeAdmin).not.toHaveBeenCalled();
  });
});

describe("modifierMotDePasseAction — changement de mot de passe (utilisateur connecté ou lien de récupération)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-test" } } });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  const formulaire = (mdp: string, confirmation: string) => {
    const formData = new FormData();
    formData.set("password", mdp);
    formData.set("password_confirmation", confirmation);
    return formData;
  };

  it("refuse un mot de passe de moins de 8 caractères sans appeler updateUser", async () => {
    await expect(modifierMotDePasseAction(formulaire("court12", "court12"))).rejects.toThrow(
      "REDIRECT:/nouveau-mot-de-passe?error=Le%20mot%20de%20passe%20doit%20contenir%20au%20moins%208%20caract%C3%A8res.",
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuse une confirmation différente sans appeler updateUser", async () => {
    await expect(modifierMotDePasseAction(formulaire("motdepasse1", "motdepasse2"))).rejects.toThrow(
      "REDIRECT:/nouveau-mot-de-passe?error=Les%20deux%20mots%20de%20passe%20ne%20correspondent%20pas.",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("redirige vers la demande de lien si aucune session authentifiée n’est présente", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(modifierMotDePasseAction(formulaire("motdepasse1", "motdepasse1"))).rejects.toThrow(
      "REDIRECT:/mot-de-passe-oublie?error=",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("met à jour le mot de passe, déconnecte puis redirige vers la connexion en cas de succès", async () => {
    await expect(modifierMotDePasseAction(formulaire("motdepasse1", "motdepasse1"))).rejects.toThrow(
      "REDIRECT:/login?message=",
    );
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "motdepasse1" });
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("ne fait jamais fuiter le mot de passe saisi dans l’URL de redirection en cas d’erreur Supabase", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { message: "Erreur générique du fournisseur" } });
    const motDePasseSecret = "motdepasse-secret-1";
    let destination = "";
    try {
      await modifierMotDePasseAction(formulaire(motDePasseSecret, motDePasseSecret));
    } catch (erreur) {
      destination = (erreur as Error).message;
    }
    expect(destination).toContain("REDIRECT:/nouveau-mot-de-passe?error=");
    expect(destination).not.toContain(motDePasseSecret);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

describe("confirmerCompteAction — vérification uniquement sur clic explicite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({ error: null });
  });

  const formulaire = (tokenHash: string, type: string, next?: string) => {
    const formData = new FormData();
    formData.set("token_hash", tokenHash);
    formData.set("type", type);
    if (next) formData.set("next", next);
    return formData;
  };

  it("refuse sans appeler verifyOtp si token_hash ou type est absent", async () => {
    await expect(confirmerCompteAction(formulaire("", "signup"))).rejects.toThrow(
      "REDIRECT:/login?error=",
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("vérifie le token puis redirige vers /onboarding pour une confirmation d’inscription", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "signup"))).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "token-test" });
  });

  it("redirige vers /nouveau-mot-de-passe pour une récupération", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "recovery"))).rejects.toThrow(
      "REDIRECT:/nouveau-mot-de-passe",
    );
  });

  it("respecte un next interne fourni", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "signup", "/onboarding?code=ABC"))).rejects.toThrow(
      "REDIRECT:/onboarding?code=ABC",
    );
  });

  it("ignore un next externe et retombe sur le repli sûr", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "signup", "https://evil.example"))).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
  });

  it("redirige vers /login avec un message \"lien invalide\" si verifyOtp échoue (token déjà consommé)", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "Token already used" } });
    await expect(confirmerCompteAction(formulaire("token-test", "signup"))).rejects.toThrow(
      "REDIRECT:/login?error=Lien%20de%20confirmation%20invalide%20ou%20expir%C3%A9.",
    );
  });

  it("distingue un lien réellement expiré (message spécifique, pas le message générique)", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "Token has expired" } });
    await expect(confirmerCompteAction(formulaire("token-test", "signup"))).rejects.toThrow(
      "REDIRECT:/login?error=Le%20lien%20a%20expir%C3%A9.%20Demandez-en%20un%20nouveau.",
    );
  });

  it("ne renvoie jamais le message technique générique pour un jeton invalide (toujours un message \"lien\")", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "invalid token: signature is invalid" } });
    let destination = "";
    try {
      await confirmerCompteAction(formulaire("token-test", "signup"));
    } catch (erreur) {
      destination = (erreur as Error).message;
    }
    expect(destination).not.toContain("Une%20erreur%20est%20survenue");
    expect(destination).toContain("REDIRECT:/login?error=");
  });

  it("renvoie vers /mot-de-passe-oublie (pas /login) si une récupération échoue, pour permettre de redemander un lien", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "Token has expired" } });
    await expect(confirmerCompteAction(formulaire("token-test", "recovery"))).rejects.toThrow(
      "REDIRECT:/mot-de-passe-oublie?error=",
    );
  });

  it("renvoie vers /mot-de-passe-oublie si le lien de récupération est malformé (token_hash absent)", async () => {
    await expect(confirmerCompteAction(formulaire("", "recovery"))).rejects.toThrow(
      "REDIRECT:/mot-de-passe-oublie?error=",
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
