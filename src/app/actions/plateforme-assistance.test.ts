import { beforeEach, describe, expect, it, vi } from "vitest";

type AppelRpc = { fonction: string; parametres?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
  estPlateformeAdmin: vi.fn(async () => true),
  appels: [] as AppelRpc[],
  reponsesRpc: new Map<string, { data?: unknown; error?: { message: string } | null }>(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fonction: string, parametres?: Record<string, unknown>) => {
      mocks.appels.push({ fonction, parametres });
      return mocks.reponsesRpc.get(fonction) ?? { data: null, error: null };
    },
  }),
}));

const { ouvrirAssistanceAction, revoquerAssistanceAction } = await import("./plateforme-assistance");

const ENTREPRISE = "a0000000-0000-4000-8000-000000000001";

function formulaire(champs: Record<string, string | string[]>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (Array.isArray(valeur)) valeur.forEach((v) => donnees.append(cle, v));
    else donnees.set(cle, valeur);
  }
  return donnees;
}

async function destinationApres(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (erreur) {
    return String((erreur as Error).message).replace(/^REDIRECT:/, "");
  }
  throw new Error("Une action serveur doit toujours se terminer par une redirection");
}

const NOMINAL = {
  entrepriseId: ENTREPRISE,
  applications: ["gestion_pro"],
  abonnees: "gestion_pro,colors",
  motifCategorie: "demande_client",
  motifDetail: "",
  perimetre: "lecture_seule",
  dureeMinutes: "30",
  ticket: "",
};

describe("ouvrirAssistanceAction", () => {
  beforeEach(() => {
    mocks.appels.length = 0;
    mocks.reponsesRpc.clear();
    mocks.redirect.mockClear();
  });

  it("ouvre une session nominale et transmet exactement les paramètres validés", async () => {
    const destination = await destinationApres(() => ouvrirAssistanceAction(formulaire(NOMINAL)));
    expect(destination).toBe("/dashboard");
    const appel = mocks.appels.find((a) => a.fonction === "assistance_ouvrir");
    expect(appel?.parametres).toMatchObject({
      p_entreprise_id: ENTREPRISE,
      p_applications: ["gestion_pro"],
      p_motif_cle: "demande_client",
      p_perimetre: "lecture_seule",
      p_duree_minutes: 30,
      p_ticket: null,
      p_incident_global: false,
    });
  });

  it("refuse sans motif détaillé quand la catégorie l'exige", async () => {
    const destination = await destinationApres(() =>
      ouvrirAssistanceAction(formulaire({ ...NOMINAL, motifCategorie: "securite" })),
    );
    expect(destination).toContain("/plateforme/assistance?error=");
    expect(mocks.appels).toHaveLength(0);
  });

  it("refuse une application à laquelle l'entreprise n'est pas abonnée", async () => {
    const destination = await destinationApres(() =>
      ouvrirAssistanceAction(formulaire({ ...NOMINAL, applications: ["reserves"] })),
    );
    expect(decodeURIComponent(destination)).toContain("n’est pas abonnée");
    expect(mocks.appels).toHaveLength(0);
  });

  it("refuse « toutes les applications » sans incident global déclaré", async () => {
    const destination = await destinationApres(() =>
      ouvrirAssistanceAction(formulaire({ ...NOMINAL, applications: ["gestion_pro", "colors"] })),
    );
    expect(decodeURIComponent(destination)).toContain("incident global");
  });

  it("exige la confirmation renforcée pour un incident global", async () => {
    const destination = await destinationApres(() =>
      ouvrirAssistanceAction(
        formulaire({ ...NOMINAL, applications: ["gestion_pro", "colors"], incidentGlobal: "on" }),
      ),
    );
    expect(decodeURIComponent(destination)).toContain("Confirmation renforcée");
  });

  it("borne la durée par le périmètre demandé", async () => {
    const destination = await destinationApres(() =>
      ouvrirAssistanceAction(
        formulaire({ ...NOMINAL, perimetre: "correction_limitee", dureeMinutes: "240" }),
      ),
    );
    expect(decodeURIComponent(destination)).toContain("60 minutes");
    expect(mocks.appels).toHaveLength(0);
  });

  it("remonte l'erreur serveur sans la masquer", async () => {
    mocks.reponsesRpc.set("assistance_ouvrir", { error: { message: "Authentification forte requise" } });
    const destination = await destinationApres(() => ouvrirAssistanceAction(formulaire(NOMINAL)));
    expect(decodeURIComponent(destination)).toContain("Authentification forte requise");
  });

  it("renvoie un non-administrateur vers le tableau de bord sans appeler la RPC", async () => {
    mocks.estPlateformeAdmin.mockResolvedValueOnce(false);
    const destination = await destinationApres(() => ouvrirAssistanceAction(formulaire(NOMINAL)));
    expect(destination).toBe("/dashboard");
    expect(mocks.appels).toHaveLength(0);
  });
});

describe("revoquerAssistanceAction", () => {
  beforeEach(() => {
    mocks.appels.length = 0;
    mocks.reponsesRpc.clear();
  });

  it("exige un motif de révocation lisible", async () => {
    const destination = await destinationApres(() =>
      revoquerAssistanceAction("sess-1", formulaire({ motifRevocation: "abc" })),
    );
    expect(destination).toContain("error=");
    expect(mocks.appels).toHaveLength(0);
  });

  it("révoque avec son motif", async () => {
    await destinationApres(() =>
      revoquerAssistanceAction("sess-1", formulaire({ motifRevocation: "incident de sécurité" })),
    );
    expect(mocks.appels[0]).toMatchObject({
      fonction: "assistance_revoquer",
      parametres: { p_session_id: "sess-1", p_motif: "incident de sécurité" },
    });
  });
});
