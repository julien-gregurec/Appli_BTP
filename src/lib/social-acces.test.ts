import { beforeEach, describe, expect, it, vi } from "vitest";

// Garde ELSATIA Social sur le modèle canonique : identité par UID, AAL2 lue
// dans le JWT vérifié (via la RPC social_session_courante), rôle social.
const etat = vi.hoisted(() => ({
  user: null as null | { id: string },
  session: null as unknown,
  erreurRpc: null as null | { message: string },
  rpcs: [] as string[],
  prototype: false,
}));

vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => etat.prototype }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: etat.user } }) },
    rpc: async (nom: string) => {
      etat.rpcs.push(nom);
      return { data: etat.session, error: etat.erreurRpc };
    },
  }),
}));

const UID = "11111111-1111-4111-8111-111111111111";

async function charger() {
  vi.resetModules();
  return import("@/lib/social/acces");
}

describe("contexteDepuisSession", () => {
  it("refuse une ligne absente ou un rôle inconnu", async () => {
    const { contexteDepuisSession } = await charger();
    expect(contexteDepuisSession(null)).toBeNull();
    expect(contexteDepuisSession({ utilisateur_id: UID, email: "a@b.fr", role: "total", aal2: true })).toBeNull();
  });
  it("conserve l'UID comme identité et l'email en minuscules pour l'audit", async () => {
    const { contexteDepuisSession } = await charger();
    expect(contexteDepuisSession({ utilisateur_id: UID, email: "Julien@Elsatia.FR", role: "validateur", aal2: false })).toEqual({ utilisateurId: UID, email: "julien@elsatia.fr", role: "validateur", aal2: false });
  });
});

describe("exigerSocial", () => {
  beforeEach(() => {
    etat.user = { id: UID };
    etat.session = [{ utilisateur_id: UID, email: "admin@elsatia.test", role: "administrateur", aal2: true }];
    etat.erreurRpc = null;
    etat.rpcs = [];
    etat.prototype = false;
  });

  it("autorise un administrateur actif en AAL2 via social_session_courante", async () => {
    const { exigerSocial } = await charger();
    await expect(exigerSocial("gerer_comptes")).resolves.toMatchObject({ utilisateurId: UID, role: "administrateur" });
    expect(etat.rpcs).toEqual(["social_session_courante"]);
  });

  it("refuse toute action sans AAL2, même pour un administrateur", async () => {
    etat.session = [{ utilisateur_id: UID, email: "admin@elsatia.test", role: "administrateur", aal2: false }];
    const { exigerSocial, MESSAGE_AAL2_REQUIS } = await charger();
    await expect(exigerSocial("publier")).rejects.toThrow(MESSAGE_AAL2_REQUIS);
    await expect(exigerSocial("consulter")).rejects.toThrow(MESSAGE_AAL2_REQUIS);
  });

  it("refuse un utilisateur qui n'est pas administrateur plateforme actif", async () => {
    etat.session = [];
    const { exigerSocial } = await charger();
    await expect(exigerSocial("consulter")).rejects.toThrow("Accès ELSATIA Social refusé");
  });

  it("refuse si l'UID de la session et celui de la base divergent", async () => {
    etat.session = [{ utilisateur_id: "22222222-2222-4222-8222-222222222222", email: "x@y.fr", role: "administrateur", aal2: true }];
    const { exigerSocial } = await charger();
    await expect(exigerSocial("consulter")).rejects.toThrow("Accès ELSATIA Social refusé");
  });

  it("applique la matrice de rôles (un éditeur ne valide pas)", async () => {
    etat.session = [{ utilisateur_id: UID, email: "e@elsatia.test", role: "editeur", aal2: true }];
    const { exigerSocial } = await charger();
    await expect(exigerSocial("rediger")).resolves.toMatchObject({ role: "editeur" });
    await expect(exigerSocial("valider")).rejects.toThrow("ne permet pas");
    await expect(exigerSocial("gerer_equipe")).rejects.toThrow("ne permet pas");
  });

  it("le mode prototype sans connexion n'a jamais accès", async () => {
    etat.prototype = true;
    const { exigerSocial } = await charger();
    await expect(exigerSocial("consulter")).rejects.toThrow("Accès ELSATIA Social refusé");
    expect(etat.rpcs).toEqual([]);
  });

  it("une erreur de la RPC ferme l'accès", async () => {
    etat.erreurRpc = { message: "boom" };
    const { exigerSocial } = await charger();
    await expect(exigerSocial("consulter")).rejects.toThrow("Accès ELSATIA Social refusé");
  });
});
