import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  ctx: { entrepriseId: "ent-a", userId: "user-a", prenom: "Test", entrepriseNom: "Entreprise Test" },
  devis: null as Record<string, unknown> | null,
  chantierExistant: null as Record<string, unknown> | null,
  client: null as Record<string, unknown> | null,
  chantierLie: null as Record<string, unknown> | null,
  rpc: vi.fn(async (): Promise<{ data: string | null; error: { message: string } | null }> => ({ data: "chantier-nouveau", error: null })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => mocks.ctx) }));

function tableMock(table: string) {
  const requete: Record<string, unknown> = {};
  for (const methode of ["select", "eq"]) requete[methode] = () => requete;
  requete.maybeSingle = async () => {
    if (table === "devis") return { data: mocks.devis };
    if (table === "chantiers") {
      // Le prefill interroge chantiers deux fois avec des filtres différents (chantier
      // existant pour ce devis_source_id, puis éventuellement le chantier déjà lié au
      // devis via devis.chantier_id) — on ne peut pas distinguer les deux appels ici sans
      // complexifier le mock, donc on retourne le même jeu selon le test.
      return { data: mocks.chantierExistant ?? mocks.chantierLie };
    }
    if (table === "clients") return { data: mocks.client };
    return { data: null };
  };
  return requete;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableMock(table),
    rpc: mocks.rpc,
  })),
}));

const { previsualiserChantierDepuisDevis, creerChantierDepuisDevisAction } = await import("./chantiers");

describe("previsualiserChantierDepuisDevis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.devis = { id: "devis-1", numero: "DEV-001", statut: "accepte", montant_ht: 1500, notes_client: "Rénovation cuisine", client_id: "client-1", chantier_id: null };
    mocks.client = { id: "client-1", nom: "Dupont", prenom: "Jean", societe: null, adresse_chantier_defaut: "12 rue du Test", code_postal: "75001", ville: "Paris" };
    mocks.chantierExistant = null;
    mocks.chantierLie = null;
  });

  it("1. devis introuvable -> non éligible", async () => {
    mocks.devis = null;
    const res = await previsualiserChantierDepuisDevis("devis-x");
    expect(res.eligible).toBe(false);
    if (!res.eligible) expect(res.motif).toMatch(/introuvable/i);
  });

  it("2. devis brouillon -> non éligible", async () => {
    mocks.devis = { ...mocks.devis, statut: "brouillon" };
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(false);
    if (!res.eligible) expect(res.motif).toMatch(/accepté/i);
  });

  it("3. devis refusé -> non éligible", async () => {
    mocks.devis = { ...mocks.devis, statut: "refuse" };
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(false);
  });

  it("4. devis expiré -> non éligible", async () => {
    mocks.devis = { ...mocks.devis, statut: "expire" };
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(false);
  });

  it("5. client introuvable -> non éligible (même si le devis est accepté)", async () => {
    mocks.client = null;
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(false);
    if (!res.eligible) expect(res.motif).toMatch(/client/i);
  });

  it("6. devis accepté + client trouvé -> éligible, préremplissage correct", async () => {
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(true);
    if (res.eligible) {
      expect(res.clientNom).toBe("Jean Dupont");
      expect(res.nomSuggere).toBe("Jean Dupont — DEV-001");
      expect(res.descriptionSuggeree).toBe("Rénovation cuisine");
      expect(res.montantHt).toBe(1500);
    }
  });

  it("7. adresse : utilise l'adresse chantier par défaut du client quand aucun chantier n'est déjà lié au devis", async () => {
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(true);
    if (res.eligible) {
      expect(res.adresseSuggeree).toBe("12 rue du Test");
      expect(res.codePostalSuggere).toBe("75001");
      expect(res.villeSuggeree).toBe("Paris");
    }
  });

  it("8. adresse : vide si ni chantier lié ni adresse client par défaut", async () => {
    mocks.client = { ...mocks.client, adresse_chantier_defaut: null };
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(true);
    if (res.eligible) expect(res.adresseSuggeree).toBe("");
  });

  it("9. nom société utilisé en priorité sur prénom/nom quand disponible", async () => {
    mocks.client = { ...mocks.client, societe: "ACME BTP" };
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(true);
    if (res.eligible) expect(res.clientNom).toBe("ACME BTP");
  });

  it("10. relation devis : signale un chantier déjà créé pour ce devis (idempotence côté préremplissage)", async () => {
    mocks.chantierExistant = { id: "chantier-deja-la" };
    const res = await previsualiserChantierDepuisDevis("devis-1");
    expect(res.eligible).toBe(true);
    if (res.eligible) expect(res.chantierExistantId).toBe("chantier-deja-la");
  });
});

describe("creerChantierDepuisDevisAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "chantier-nouveau", error: null });
  });

  function formulaire(champs: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) fd.set(k, v);
    return fd;
  }

  it("11. nom manquant -> redirige vers la page de préparation avec une erreur, sans appeler le RPC", async () => {
    await expect(creerChantierDepuisDevisAction("devis-1", formulaire({}))).rejects.toThrow(/REDIRECT:\/devis\/devis-1\/creer-chantier\?error=/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("12. succès -> redirige vers le nouveau chantier avec un message de succès", async () => {
    await expect(creerChantierDepuisDevisAction("devis-1", formulaire({ nom: "Chantier Dupont" }))).rejects.toThrow(/REDIRECT:\/chantiers\/chantier-nouveau\?success=/);
    expect(mocks.rpc).toHaveBeenCalledWith("creer_chantier_depuis_devis", expect.objectContaining({ p_devis_id: "devis-1", p_nom: "Chantier Dupont" }));
  });

  it("13. idempotence : le RPC refuse un doublon (chantier_existant:<id>) -> redirige vers le chantier existant, pas d'erreur générique", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "chantier_existant:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } });
    await expect(creerChantierDepuisDevisAction("devis-1", formulaire({ nom: "X" }))).rejects.toThrow(/REDIRECT:\/chantiers\/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\?success=/);
  });

  it("14. permission refusée par le RPC -> message clair sur la fiche devis", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Accès refusé" } });
    await expect(creerChantierDepuisDevisAction("devis-1", formulaire({ nom: "X" }))).rejects.toThrow(/REDIRECT:\/devis\/devis-1\?error=/);
  });

  it("15. devis non éligible refusé par le RPC -> message clair sur la fiche devis", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Le devis doit être accepté avant de créer un chantier" } });
    await expect(creerChantierDepuisDevisAction("devis-1", formulaire({ nom: "X" }))).rejects.toThrow(/REDIRECT:\/devis\/devis-1\?error=/);
  });
});
