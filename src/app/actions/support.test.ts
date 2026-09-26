import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AppelRpc = { fonction: string; parametres?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
  contexte: { entrepriseId: "a0000000-0000-4000-8000-000000000001" } as { entrepriseId: string | null },
  appels: [] as AppelRpc[],
  reponsesRpc: new Map<string, { data?: unknown; error?: { message: string } | null }>(),
  notifierReponseSupport: vi.fn(async () => ({ envoye: true as const })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: async () => mocks.contexte }));
vi.mock("@/lib/erreurs-utilisateur", () => ({
  messageErreurUtilisateur: (_origine: string, _erreur: unknown, repli: string) => repli,
}));
vi.mock("@/lib/support-notifications", () => ({ notifierReponseSupport: mocks.notifierReponseSupport }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fonction: string, parametres?: Record<string, unknown>) => {
      mocks.appels.push({ fonction, parametres });
      return mocks.reponsesRpc.get(fonction) ?? { data: null, error: null };
    },
  }),
}));

const { envoyerMessageSupportAction, repondreSupportPlateformeAction } = await import("./support");

const ENTREPRISE = "a0000000-0000-4000-8000-000000000001";
const DESTINATAIRE = [{
  email: "demandeur@exemple.test",
  prenom: "Camille",
  nom: "Durand",
  entreprise_nom: "SARL Test",
  demande: "Export comptable incomplet",
}];

function formulaire(contenu: string) {
  const données = new FormData();
  données.set("contenu", contenu);
  return données;
}

async function destinationApres(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (erreur) {
    return String((erreur as Error).message).replace(/^REDIRECT:/, "");
  }
  throw new Error("Une action serveur doit toujours se terminer par une redirection");
}

describe("repondreSupportPlateformeAction — notification du demandeur", () => {
  beforeEach(() => {
    mocks.reponsesRpc.set("plateforme_support_destinataire_reponse", { data: DESTINATAIRE, error: null });
    mocks.notifierReponseSupport.mockResolvedValue({ envoye: true });
  });
  afterEach(() => {
    mocks.appels.length = 0;
    mocks.reponsesRpc.clear();
    vi.clearAllMocks();
  });

  it("notifie le demandeur exactement une fois quand la réponse est enregistrée", async () => {
    const destination = await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("  C'est corrigé.  ")));
    expect(destination).toBe(`/plateforme/support?entreprise=${ENTREPRISE}&envoye=1`);
    expect(mocks.appels.map((a) => a.fonction)).toEqual([
      "plateforme_support_repondre",
      "plateforme_support_destinataire_reponse",
    ]);
    expect(mocks.notifierReponseSupport).toHaveBeenCalledTimes(1);
    expect(mocks.notifierReponseSupport).toHaveBeenCalledWith({
      destinataire: "demandeur@exemple.test",
      prenom: "Camille",
      nom: "Durand",
      entrepriseId: ENTREPRISE,
      entrepriseNom: "SARL Test",
      demande: "Export comptable incomplet",
      reponse: "C'est corrigé.",
    });
  });

  it("cible la seule entreprise du fil, jamais une autre", async () => {
    await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("Réponse")));
    for (const appel of mocks.appels) expect(appel.parametres?.p_entreprise_id).toBe(ENTREPRISE);
  });

  it("un envoi = une insertion = au plus un e-mail, même sur deux soumissions", async () => {
    await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("Réponse")));
    await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("Réponse")));
    const insertions = mocks.appels.filter((a) => a.fonction === "plateforme_support_repondre").length;
    expect(mocks.notifierReponseSupport).toHaveBeenCalledTimes(insertions);
  });

  it("n'envoie rien si la réponse n'a pas été enregistrée (droits refusés, session support expirée)", async () => {
    mocks.reponsesRpc.set("plateforme_support_repondre", { error: { message: "Session support explicite requise" } });
    const destination = await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("Réponse")));
    expect(destination).toContain("error=");
    expect(mocks.notifierReponseSupport).not.toHaveBeenCalled();
    expect(mocks.appels.map((a) => a.fonction)).not.toContain("plateforme_support_destinataire_reponse");
  });

  it("n'envoie rien sans contenu, donc sans réponse enregistrée", async () => {
    const destination = await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("   ")));
    expect(destination).toBe("/plateforme/support");
    expect(mocks.appels).toHaveLength(0);
    expect(mocks.notifierReponseSupport).not.toHaveBeenCalled();
  });

  it("garde la réponse validée quand le destinataire est introuvable ou illisible", async () => {
    for (const reponse of [
      { data: [], error: null },
      { data: [{ email: null, prenom: null, nom: null, entreprise_nom: null, demande: null }], error: null },
      { data: null, error: { message: "Session support explicite requise" } },
    ]) {
      mocks.reponsesRpc.set("plateforme_support_destinataire_reponse", reponse);
      const destination = await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("Réponse")));
      expect(destination).toBe(`/plateforme/support?entreprise=${ENTREPRISE}&envoye=1`);
    }
    expect(mocks.notifierReponseSupport).not.toHaveBeenCalled();
  });

  it("garde la réponse validée quand la notification échoue (Brevo KO)", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.notifierReponseSupport.mockRejectedValue(new Error("Brevo a répondu 500"));
    const destination = await destinationApres(() => repondreSupportPlateformeAction(ENTREPRISE, formulaire("Réponse")));
    expect(destination).toBe(`/plateforme/support?entreprise=${ENTREPRISE}&envoye=1`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plateforme/support");
    expect(JSON.stringify(journal.mock.calls)).not.toContain("demandeur@exemple.test");
    journal.mockRestore();
  });
});

describe("envoyerMessageSupportAction — message du client", () => {
  afterEach(() => {
    mocks.appels.length = 0;
    mocks.reponsesRpc.clear();
    vi.clearAllMocks();
  });

  it("ne déclenche jamais l'e-mail « réponse du support »", async () => {
    const destination = await destinationApres(() => envoyerMessageSupportAction(formulaire("J'ai un souci")));
    expect(destination).toBe("/aide?envoye=1");
    expect(mocks.appels.map((a) => a.fonction)).toEqual(["support_envoyer_message_entreprise"]);
    expect(mocks.notifierReponseSupport).not.toHaveBeenCalled();
  });
});
