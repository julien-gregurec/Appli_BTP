import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: { entrepriseId: "entreprise-1", userId: "user-1", entrepriseNom: "Test", prenom: "Test" },
  permissions: ["acces_ia", "gerer_planning"] as string[] | null,
  employesActifs: [{ id: "karim" }],
  chantier: { id: "chantier-1" },
  affectationsRecentes: [] as Array<{ employe_id: string }>,
  inserts: [] as Array<Record<string, unknown>[]>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => mocks.ctx) }));
vi.mock("@/lib/permissions", () => ({
  permissionsUtilisateur: vi.fn(async () => mocks.permissions),
  aAccesIA: (p: string[] | null) => p === null || p.includes("acces_ia"),
}));
vi.mock("@/lib/preview-features", () => ({ iaEstActive: () => true, MESSAGE_IA_INDISPONIBLE: "IA indisponible" }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      const requete: Record<string, unknown> = {};
      for (const methode of ["select", "eq", "in", "gte", "is", "update"]) requete[methode] = () => requete;
      requete.maybeSingle = async () => {
        if (table === "chantiers") return { data: mocks.chantier };
        return { data: null };
      };
      requete.insert = (lignes: Record<string, unknown>[]) => {
        mocks.inserts.push(lignes);
        return { error: null };
      };
      requete.then = (resolution: (v: unknown) => unknown) => {
        if (table === "employes") return Promise.resolve({ data: mocks.employesActifs }).then(resolution);
        if (table === "affectations") return Promise.resolve({ data: mocks.affectationsRecentes }).then(resolution);
        return Promise.resolve({ data: null, error: null }).then(resolution);
      };
      return requete;
    },
  })),
}));

const { creerAffectationDepuisPropositionAction } = await import("./assistant");

const propositionBase = {
  affectationId: null,
  employeIds: ["karim"],
  typeActivite: "chantier",
  chantierId: "chantier-1",
  lieuActivite: null,
  date: "2026-09-01",
  heures: 7,
  tache: null,
};

describe("creerAffectationDepuisPropositionAction", () => {
  beforeEach(() => {
    mocks.permissions = ["acces_ia", "gerer_planning"];
    mocks.employesActifs = [{ id: "karim" }];
    mocks.affectationsRecentes = [];
    mocks.inserts = [];
    mocks.chantier = { id: "chantier-1" };
  });

  it("refuse si le poste n'a pas gerer_planning", async () => {
    mocks.permissions = ["acces_ia"];
    const resultat = await creerAffectationDepuisPropositionAction(propositionBase);
    expect(resultat).toHaveProperty("error");
    expect(mocks.inserts).toHaveLength(0);
  });

  it("crée l'affectation quand tout est valide", async () => {
    const resultat = await creerAffectationDepuisPropositionAction(propositionBase);
    expect(resultat).toEqual({ ok: true });
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toEqual([expect.objectContaining({ entreprise_id: "entreprise-1", employe_id: "karim", date: "2026-09-01", heures: 7 })]);
  });

  it("idempotence double-clic : ne recrée pas une affectation identique déjà posée dans les 10 dernières secondes", async () => {
    mocks.affectationsRecentes = [{ employe_id: "karim" }];
    const resultat = await creerAffectationDepuisPropositionAction(propositionBase);
    expect(resultat).toEqual({ ok: true });
    expect(mocks.inserts).toHaveLength(0);
  });

  it("insère seulement les employés non déjà créés récemment (cas partiel)", async () => {
    mocks.employesActifs = [{ id: "karim" }, { id: "mehdi" }];
    mocks.affectationsRecentes = [{ employe_id: "karim" }];
    const resultat = await creerAffectationDepuisPropositionAction({ ...propositionBase, employeIds: ["karim", "mehdi"] });
    expect(resultat).toEqual({ ok: true });
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toEqual([expect.objectContaining({ employe_id: "mehdi" })]);
  });

  it("refuse un type d'activité invalide", async () => {
    const resultat = await creerAffectationDepuisPropositionAction({ ...propositionBase, typeActivite: "autre_chose" });
    expect(resultat).toHaveProperty("error");
  });

  it("refuse des heures nulles ou négatives", async () => {
    const resultat = await creerAffectationDepuisPropositionAction({ ...propositionBase, heures: 0 });
    expect(resultat).toHaveProperty("error");
  });

  it("refuse si l'employé a été désactivé entre la proposition et la confirmation (état rechargé au moment d'écrire, jamais un instantané IA)", async () => {
    mocks.employesActifs = []; // plus aucun employé actif ne correspond (désactivé depuis)
    const resultat = await creerAffectationDepuisPropositionAction(propositionBase);
    expect(resultat).toHaveProperty("error");
    expect(mocks.inserts).toHaveLength(0);
  });

  it("refuse si le chantier a été supprimé entre la proposition et la confirmation", async () => {
    mocks.chantier = null as unknown as { id: string };
    const resultat = await creerAffectationDepuisPropositionAction(propositionBase);
    expect(resultat).toHaveProperty("error");
    expect(mocks.inserts).toHaveLength(0);
  });
});
