import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((cible: string) => {
    throw new Error(`REDIRECT:${cible}`);
  }),
  journaliser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/journal-securite", () => ({ journaliserEchecTechnique: mocks.journaliser }));

import { confirmerRecuperationAction } from "@/app/actions";
import { jetonRecuperationSur, TYPE_RECUPERATION } from "@/lib/jeton-recuperation";
import { DESTINATION_NOUVEAU_MOT_DE_PASSE } from "@/lib/auth-redirects-colors";
import { CODE_LIEN_INVALIDE } from "@/lib/messages-auth";

const JETON = "b3f1c2d4e5a6b7c8d90123456789abcdef0123456789abcdef";

async function cible(execution: Promise<unknown>) {
  try {
    await execution;
  } catch (erreur) {
    return String((erreur as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("aucune redirection émise");
}

function formulaire(champs: Record<string, string>) {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function client(erreurVerification: { message: string } | null = null) {
  const verifyOtp = vi.fn().mockResolvedValue({ error: erreurVerification });
  return { verifyOtp, supabase: { auth: { verifyOtp } } };
}

describe("jetonRecuperationSur", () => {
  it("accepte un jeton de récupération bien formé", () => {
    expect(jetonRecuperationSur(JETON, "recovery")).toBe(JETON);
  });

  it("refuse tout type autre que la récupération", () => {
    // Colors n’ouvre aucun parcours de confirmation d’inscription : un lien
    // d’un autre type relayé ici ne doit rien déclencher.
    for (const type of ["email", "signup", "magiclink", "invite", "email_change", "", null]) {
      expect(jetonRecuperationSur(JETON, type)).toBeNull();
    }
  });

  it("refuse un jeton absent, trop court ou porteur de caractères hors alphabet URL", () => {
    for (const jeton of [undefined, null, "", "court", `${JETON}<script>`, `${JETON} espace`, `${JETON}"`]) {
      expect(jetonRecuperationSur(jeton, TYPE_RECUPERATION)).toBeNull();
    }
  });
});

describe("confirmerRecuperationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ouvre la session sur Colors et mène au nouveau mot de passe", async () => {
    const { verifyOtp, supabase } = client();
    mocks.createClient.mockResolvedValue(supabase);

    const destination = await cible(
      confirmerRecuperationAction(formulaire({ token_hash: JETON, type: "recovery" })),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: JETON });
    expect(destination).toBe(DESTINATION_NOUVEAU_MOT_DE_PASSE);
  });

  it("ne sollicite jamais Supabase sur un lien mal formé", async () => {
    mocks.createClient.mockResolvedValue(client().supabase);

    const liensCasses: Record<string, string>[] = [
      { token_hash: JETON, type: "email" },
      { token_hash: "court", type: "recovery" },
      { type: "recovery" },
    ];
    for (const champs of liensCasses) {
      expect(await cible(confirmerRecuperationAction(formulaire(champs)))).toBe(
        `/mot-de-passe-oublie?error=${CODE_LIEN_INVALIDE}`,
      );
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("renvoie le même message pour un jeton invalide et pour un jeton expiré", async () => {
    for (const message of ["Token has expired or is invalid", "otp_expired"]) {
      vi.clearAllMocks();
      mocks.createClient.mockResolvedValue(client({ message }).supabase);
      expect(
        await cible(confirmerRecuperationAction(formulaire({ token_hash: JETON, type: "recovery" }))),
      ).toBe(`/mot-de-passe-oublie?error=${CODE_LIEN_INVALIDE}`);
      expect(mocks.journaliser).toHaveBeenCalledTimes(1);
    }
  });

  it("n’accepte aucune destination venue du formulaire", async () => {
    // La suite du parcours est une constante : même un champ `next` hostile
    // glissé dans la requête ne peut pas détourner la redirection.
    mocks.createClient.mockResolvedValue(client().supabase);
    const destination = await cible(
      confirmerRecuperationAction(
        formulaire({
          token_hash: JETON,
          type: "recovery",
          next: "https://evil.example.com",
          redirectTo: "//evil.example.com",
        }),
      ),
    );
    expect(destination).toBe(DESTINATION_NOUVEAU_MOT_DE_PASSE);
    expect(destination).not.toMatch(/evil\.example\.com/);
  });
});
