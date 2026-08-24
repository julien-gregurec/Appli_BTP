import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configs: [] as Array<{ entrepriseId: string; devisAutoActif: boolean; facturesAutoActif: boolean }>,
  candidatsDevis: [] as unknown[],
  candidatsFactures: [] as unknown[],
}));

vi.mock("@/lib/relances-config", () => ({
  chargerEntreprisesAvecRelancesAutoActives: vi.fn(async () => mocks.configs),
}));
vi.mock("@/lib/relances-moteur", () => ({
  listerCandidatsAutoDevis: vi.fn(async () => ({ candidats: mocks.candidatsDevis, ineligibles: [] })),
  listerCandidatsAutoFactures: vi.fn(async () => ({ candidats: mocks.candidatsFactures, ineligibles: [] })),
  executerRelance: vi.fn(async (_s, _e, _c, candidat) => ({ statut: "envoyee", candidat })),
}));

const { traiterRelancesAutomatiques } = await import("./relances-cron");
const moteur = await import("@/lib/relances-moteur");

const supabaseFake = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nom: "Test" } }) }) }) }) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configs = [];
  mocks.candidatsDevis = [];
  mocks.candidatsFactures = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("traiterRelancesAutomatiques — sous-flag et scheduler", () => {
  it("24. sous-flag désactivé -> aucune entreprise chargée, aucun candidat traité", async () => {
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "false");
    mocks.configs = [{ entrepriseId: "ent-a", devisAutoActif: true, facturesAutoActif: true }];
    const res = await traiterRelancesAutomatiques(supabaseFake);
    expect(res.actif).toBe(false);
    expect(res.entreprisesTraitees).toBe(0);
  });

  it("27. sous-flag actif mais aucune entreprise avec auto activée -> lot vide, sans erreur", async () => {
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    mocks.configs = [];
    const res = await traiterRelancesAutomatiques(supabaseFake);
    expect(res.actif).toBe(true);
    expect(res.entreprisesTraitees).toBe(0);
    expect(res.envoyees).toBe(0);
  });

  it("26. batch : plusieurs candidats devis+factures pour une même entreprise sont tous traités", async () => {
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    mocks.configs = [{ entrepriseId: "ent-a", devisAutoActif: true, facturesAutoActif: true }];
    mocks.candidatsDevis = [{ typeDocument: "devis", documentId: "d1" }, { typeDocument: "devis", documentId: "d2" }];
    mocks.candidatsFactures = [{ typeDocument: "facture", documentId: "f1" }];
    const res = await traiterRelancesAutomatiques(supabaseFake);
    expect(res.envoyees).toBe(3);
    expect(moteur.executerRelance).toHaveBeenCalledTimes(3);
  });

  it("un volet désactivé (factures_auto_actif=false) n'appelle pas listerCandidatsAutoFactures pour cette entreprise", async () => {
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    mocks.configs = [{ entrepriseId: "ent-a", devisAutoActif: true, facturesAutoActif: false }];
    mocks.candidatsDevis = [{ typeDocument: "devis", documentId: "d1" }];
    await traiterRelancesAutomatiques(supabaseFake);
    expect(moteur.listerCandidatsAutoFactures).not.toHaveBeenCalled();
    expect(moteur.listerCandidatsAutoDevis).toHaveBeenCalled();
  });
});
