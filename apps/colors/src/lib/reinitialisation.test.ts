import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((cible: string) => {
    throw new Error(`REDIRECT:${cible}`);
  }),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { demanderReinitialisationAction, modifierMotDePasseAction } from "@/app/actions";
import { urlCallbackReinitialisation } from "@/lib/auth-redirects-colors";
import {
  CODE_DEMANDE_ENVOYEE,
  CODE_EMAIL_REQUIS,
  CODE_LIEN_INVALIDE,
  CODE_MOT_DE_PASSE_MODIFIE,
  CODE_MOT_DE_PASSE_REFUSE,
  CODE_MOT_DE_PASSE_TROP_COURT,
  CODE_MOTS_DE_PASSE_DIFFERENTS,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
  messageConfirmationConnexion,
  messageErreurConnexion,
} from "@/lib/messages-auth";

const ORIGINE = "https://colors.elsatia.fr";
const VALIDE = "MotDePasse-2026!";

/** Exécute l'action et renvoie la cible de redirection émise. */
async function cible(execution: Promise<unknown>) {
  try {
    await execution;
  } catch (erreur) {
    return String((erreur as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("aucune redirection émise");
}

function formulaire(champs: Record<string, string>) {
  const données = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) données.set(cle, valeur);
  return données;
}

function client({
  user = null as unknown,
  erreurReset = null as { message: string } | null,
  erreurUpdate = null as { message: string } | null,
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: erreurReset }),
      updateUser: vi.fn().mockResolvedValue({ error: erreurUpdate }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe("URL de callback de réinitialisation", () => {
  it("reste sur l’origine publique de Colors et réutilise le validateur central", () => {
    expect(urlCallbackReinitialisation(ORIGINE)).toBe(
      `${ORIGINE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    );
  });

  it("refuse toute origine absente ou non exploitable plutôt que d’envoyer un lien", () => {
    for (const origine of [undefined, "", "pas-une-url", "javascript:alert(1)", "ftp://colors.elsatia.fr"]) {
      expect(urlCallbackReinitialisation(origine)).toBeNull();
    }
  });

  it("ignore un chemin ou une requête ajoutés à l’origine configurée", () => {
    expect(urlCallbackReinitialisation(`${ORIGINE}/chemin?x=1`)).toBe(
      `${ORIGINE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    );
  });
});

describe("demande de réinitialisation — anti-énumération", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_COLORS_URL = ORIGINE;
  });

  it("répond la même confirmation neutre pour une adresse connue et une adresse inconnue", async () => {
    mocks.createClient.mockResolvedValue(client());
    const connue = await cible(demanderReinitialisationAction(formulaire({ email: "connu@example.invalid" })));
    const inconnue = await cible(demanderReinitialisationAction(formulaire({ email: "jamais-vu@example.invalid" })));
    expect(connue).toBe(inconnue);
    expect(connue).toBe(`/mot-de-passe-oublie?message=${CODE_DEMANDE_ENVOYEE}`);
  });

  it("répond la même confirmation neutre quand Supabase refuse la demande", async () => {
    mocks.createClient.mockResolvedValue(
      client({ erreurReset: { message: "User not found: no rows in auth.users" } }),
    );
    const sortie = await cible(demanderReinitialisationAction(formulaire({ email: "inconnu@example.invalid" })));
    expect(sortie).toBe(`/mot-de-passe-oublie?message=${CODE_DEMANDE_ENVOYEE}`);
    expect(sortie).not.toMatch(/auth\.users|not found/i);
  });

  it("n’expose aucun message technique dans la redirection", async () => {
    mocks.createClient.mockResolvedValue(
      client({ erreurReset: { message: 'relation "auth.users" does not exist' } }),
    );
    const sortie = await cible(demanderReinitialisationAction(formulaire({ email: "a@example.invalid" })));
    expect(messageConfirmationConnexion(new URL(sortie, ORIGINE).searchParams.get("message"))).toBeTruthy();
    expect(sortie).not.toContain("relation");
  });

  it("demande une adresse quand le champ est vide, sans solliciter Supabase", async () => {
    const faux = client();
    mocks.createClient.mockResolvedValue(faux);
    const sortie = await cible(demanderReinitialisationAction(formulaire({ email: "   " })));
    expect(sortie).toBe(`/mot-de-passe-oublie?error=${CODE_EMAIL_REQUIS}`);
    expect(faux.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("transmet à Supabase une destination interne uniquement", async () => {
    const faux = client();
    mocks.createClient.mockResolvedValue(faux);
    await cible(demanderReinitialisationAction(formulaire({ email: "a@example.invalid" })));
    const [, options] = faux.auth.resetPasswordForEmail.mock.calls[0];
    expect(new URL(options.redirectTo).origin).toBe(ORIGINE);
    expect(new URL(options.redirectTo).searchParams.get("next")).toBe("/nouveau-mot-de-passe");
  });
});

describe("nouveau mot de passe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_COLORS_URL = ORIGINE;
  });

  it("refuse une modification sans session issue du lien", async () => {
    const faux = client({ user: null });
    mocks.createClient.mockResolvedValue(faux);
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: VALIDE, password_confirmation: VALIDE })),
    );
    expect(sortie).toBe(`/mot-de-passe-oublie?error=${CODE_LIEN_INVALIDE}`);
    expect(faux.auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe trop court", async () => {
    mocks.createClient.mockResolvedValue(client({ user: { id: "u1" } }));
    const court = "a".repeat(LONGUEUR_MINIMALE_MOT_DE_PASSE - 1);
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: court, password_confirmation: court })),
    );
    expect(sortie).toBe(`/nouveau-mot-de-passe?error=${CODE_MOT_DE_PASSE_TROP_COURT}`);
  });

  it("refuse deux saisies différentes", async () => {
    mocks.createClient.mockResolvedValue(client({ user: { id: "u1" } }));
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: VALIDE, password_confirmation: `${VALIDE}x` })),
    );
    expect(sortie).toBe(`/nouveau-mot-de-passe?error=${CODE_MOTS_DE_PASSE_DIFFERENTS}`);
  });

  it("traduit un refus Supabase en code, sans détail technique", async () => {
    mocks.createClient.mockResolvedValue(
      client({ user: { id: "u1" }, erreurUpdate: { message: "Password should be at least 6 characters (auth.users)" } }),
    );
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: VALIDE, password_confirmation: VALIDE })),
    );
    expect(sortie).toBe(`/nouveau-mot-de-passe?error=${CODE_MOT_DE_PASSE_REFUSE}`);
    expect(sortie).not.toMatch(/auth\.users|characters/);
  });

  it("referme la session et renvoie à la connexion après succès", async () => {
    const faux = client({ user: { id: "u1" } });
    mocks.createClient.mockResolvedValue(faux);
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: VALIDE, password_confirmation: VALIDE })),
    );
    expect(faux.auth.updateUser).toHaveBeenCalledWith({ password: VALIDE });
    expect(faux.auth.signOut).toHaveBeenCalled();
    expect(sortie).toBe(`/login?message=${CODE_MOT_DE_PASSE_MODIFIE}`);
  });

  it("n’émet que des codes rendus par le catalogue fermé", async () => {
    mocks.createClient.mockResolvedValue(client({ user: { id: "u1" } }));
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: "court", password_confirmation: "court" })),
    );
    const code = new URL(sortie, ORIGINE).searchParams.get("error");
    expect(messageErreurConnexion(code)).toBeTruthy();
  });

  it("ne recopie jamais le mot de passe dans la redirection", async () => {
    mocks.createClient.mockResolvedValue(client({ user: { id: "u1" } }));
    const sortie = await cible(
      modifierMotDePasseAction(formulaire({ password: VALIDE, password_confirmation: "autre-chose" })),
    );
    expect(sortie).not.toContain(VALIDE);
    expect(sortie).not.toContain("autre-chose");
  });
});
