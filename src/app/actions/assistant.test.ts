import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: { entrepriseId: "entreprise-1", userId: "user-1", entrepriseNom: "Test", prenom: "Test" },
  permissions: ["acces_ia", "gerer_planning"] as string[] | null,
  employesActifs: [{ id: "karim" }],
  chantier: { id: "chantier-1" },
  affectationsRecentes: [] as Array<{ employe_id: string }>,
  inserts: [] as Array<Record<string, unknown>[]>,
  // Lignes que l'UPDATE (modification via l'assistant) doit "toucher" : simule le
  // WHERE ... AND revision = $revision de creerAffectationDepuisPropositionAction — vide
  // signifie qu'aucune ligne ne matche la révision attendue (conflit de concurrence ou ligne
  // disparue), exactement comme un vrai `WHERE revision = $x` sous PostgREST.
  updateMatches: [{ id: "affectation-1" }] as Array<{ id: string }>,
  updates: [] as Array<{ table: string; valeurs: Record<string, unknown>; filtres: Record<string, unknown> }>,
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
      const filtres: Record<string, unknown> = {};
      for (const methode of ["select", "in", "gte", "is"]) requete[methode] = () => requete;
      requete.eq = (colonne: string, valeur: unknown) => {
        filtres[colonne] = valeur;
        return requete;
      };
      requete.maybeSingle = async () => {
        if (table === "chantiers") return { data: mocks.chantier };
        return { data: null };
      };
      requete.insert = (lignes: Record<string, unknown>[]) => {
        mocks.inserts.push(lignes);
        return { error: null };
      };
      requete.update = (valeurs: Record<string, unknown>) => {
        // `filtres` est référencé (pas copié) : les .eq(...) chaînés APRÈS .update(...)
        // (id, entreprise_id, revision) le remplissent encore après ce point — la copie ne
        // doit être prise qu'une fois toute la chaîne exécutée (voir .select ci-dessous).
        mocks.updates.push({ table, valeurs, filtres });
        // .select("id") après .update(...).eq(...) : renvoie les lignes réellement "touchées"
        // par le filtre simulé (dont revision), comme le ferait PostgREST.
        requete.select = async () => ({ data: mocks.updateMatches, error: null });
        return requete;
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
  revision: null,
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
    mocks.updates = [];
    mocks.updateMatches = [{ id: "affectation-1" }];
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

  describe("modification d'une affectation existante (proposition de correction) — verrou optimiste", () => {
    const propositionModification = { ...propositionBase, affectationId: "affectation-1", revision: 3 };

    it("applique la modification quand la révision transmise correspond toujours à l'état courant", async () => {
      const resultat = await creerAffectationDepuisPropositionAction(propositionModification);
      expect(resultat).toEqual({ ok: true });
      expect(mocks.updates).toHaveLength(1);
      expect(mocks.updates[0].table).toBe("affectations");
      expect(mocks.updates[0].filtres).toEqual(expect.objectContaining({ id: "affectation-1", entreprise_id: "entreprise-1", revision: 3 }));
    });

    it("refuse sans écraser si l'affectation a été modifiée par quelqu'un d'autre depuis que l'assistant a construit la proposition (lost update)", async () => {
      // Simule PostgREST : le WHERE ... AND revision = 3 ne matche plus aucune ligne, la
      // révision réelle ayant avancé entre la proposition et la confirmation.
      mocks.updateMatches = [];
      const resultat = await creerAffectationDepuisPropositionAction(propositionModification);
      expect(resultat).toHaveProperty("error");
      expect((resultat as { error: string }).error).toMatch(/modifiée ou supprimée/);
      // L'UPDATE a bien été tenté (avec la bonne révision), mais PostgREST rapporte 0 ligne
      // touchée : aucune donnée n'a pu être silencieusement écrasée par cet appel.
      expect(mocks.updates).toHaveLength(1);
      expect(mocks.updates[0].filtres).toEqual(expect.objectContaining({ revision: 3 }));
    });

    it("ne vérifie jamais la révision sur le chemin de création (affectationId null)", async () => {
      const resultat = await creerAffectationDepuisPropositionAction(propositionBase);
      expect(resultat).toEqual({ ok: true });
      expect(mocks.updates).toHaveLength(0);
    });
  });
});
