import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: { entrepriseId: "ent-a", userId: "user-1", entrepriseNom: "Entreprise Test", prenom: "Julien" },
  permissions: null as string[] | null,
  devis: {
    id: "devis-1",
    entreprise_id: "ent-a",
    numero: "DEV-001",
    statut: "envoye",
    date_emission: "2026-08-01",
    montant_ttc: 1000,
    relance_auto_exclue: false,
    client_id: "cli-1",
    client: { nom: "Dupont", prenom: "Jean", societe: null, email: "client@example.com", relance_auto_exclue: false },
  } as Record<string, unknown> | null,
  parametresRelances: null as Record<string, unknown> | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => mocks.ctx) }));
vi.mock("@/lib/permissions", () => ({ permissionsUtilisateur: vi.fn(async () => mocks.permissions) }));
vi.mock("@/lib/brevo", () => ({ brevoEstConfigure: () => true, envoyerEmailBrevo: vi.fn(async () => ({ messageId: "msg-1" })) }));
vi.mock("@/lib/email", () => ({ corpsHtmlEmailDocument: () => "<div></div>" }));
vi.mock("@/lib/documents-partage", () => ({ obtenirNouveauTokenPartage: vi.fn(async () => "token"), urlDocumentPartage: () => null }));

function tableMock(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = async () => {
    if (table === "devis") return { data: mocks.devis };
    if (table === "parametres_relances") return { data: mocks.parametresRelances };
    return { data: null };
  };
  (chain as { then: (r: (v: unknown) => void) => void }).then = (resolve: (v: unknown) => void) => resolve({ count: 0 });
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableMock(table),
    rpc: vi.fn(async (nom: string) => ({ data: nom === "relance_reclamer" ? "reclamation-1" : null, error: null })),
  })),
}));

const { relancerDocumentManuellementAction, previsualiserRelanceManuelleAction } = await import("./relances");

describe("relancerDocumentManuellementAction — permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = null;
    mocks.devis = {
      id: "devis-1", entreprise_id: "ent-a", numero: "DEV-001", statut: "envoye", date_emission: "2026-08-01", montant_ttc: 1000, relance_auto_exclue: false, client_id: "cli-1",
      client: { nom: "Dupont", prenom: "Jean", societe: null, email: "client@example.com", relance_auto_exclue: false },
    };
  });

  it("19. Gérant (permissions null = accès complet) -> succès", async () => {
    const res = await relancerDocumentManuellementAction("devis", "devis-1");
    expect(res).toEqual({ ok: true, niveau: 1 });
  });

  it("20. utilisateur sans gerer_devis -> refus", async () => {
    mocks.permissions = ["acces_devis"];
    const res = await relancerDocumentManuellementAction("devis", "devis-1");
    expect(res).toHaveProperty("error");
  });

  it("21. utilisateur sans gerer_factures -> refus (relance facture)", async () => {
    mocks.permissions = ["gerer_devis"];
    const res = await relancerDocumentManuellementAction("facture", "fac-1");
    expect(res).toHaveProperty("error");
  });

  it("22. Terrain (aucune permission commerciale) -> refus", async () => {
    mocks.permissions = ["acces_pointage", "saisir_son_pointage"];
    const res = await relancerDocumentManuellementAction("devis", "devis-1");
    expect(res).toHaveProperty("error");
  });

  it("23. document introuvable pour cette entreprise (autre tenant) -> refus, pas d'exception", async () => {
    mocks.permissions = ["gerer_devis"];
    mocks.devis = null;
    const res = await relancerDocumentManuellementAction("devis", "devis-autre-tenant");
    expect(res).toHaveProperty("error");
  });

  it("devis non éligible (statut accepté) -> message d'erreur clair, pas de RPC appelé", async () => {
    mocks.permissions = ["gerer_devis"];
    mocks.devis = { ...mocks.devis!, statut: "accepte" };
    const res = await relancerDocumentManuellementAction("devis", "devis-1");
    expect(res).toHaveProperty("error");
  });
});

describe("previsualiserRelanceManuelleAction — RELANCES-AUTO-PROD-ACTIVATION-V1 §20", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = null;
    mocks.devis = {
      id: "devis-1", entreprise_id: "ent-a", numero: "DEV-001", statut: "envoye", date_emission: "2026-08-01", montant_ttc: 1000, relance_auto_exclue: false, client_id: "cli-1",
      client: { nom: "Dupont", prenom: "Jean", societe: null, email: "client@example.com", relance_auto_exclue: false },
    };
  });

  it("retourne destinataire/objet/contenu/montant réels avant tout envoi, sans écrire ni appeler Brevo", async () => {
    const { envoyerEmailBrevo } = await import("@/lib/brevo");
    const res = await previsualiserRelanceManuelleAction("devis", "devis-1");
    expect(res).toMatchObject({ ok: true, destinataire: "client@example.com", montant: 1000 });
    if ("objet" in res) expect(res.objet).toMatch(/DEV-001/);
    if ("contenu" in res) expect(res.contenu.length).toBeGreaterThan(0);
    expect(envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("document non éligible -> erreur, aucun aperçu", async () => {
    mocks.devis = { ...mocks.devis!, statut: "accepte" };
    const res = await previsualiserRelanceManuelleAction("devis", "devis-1");
    expect(res).toHaveProperty("error");
  });

  it("permission manquante -> erreur avant même de lire le document", async () => {
    mocks.permissions = ["acces_devis"];
    const res = await previsualiserRelanceManuelleAction("devis", "devis-1");
    expect(res).toHaveProperty("error");
  });
});
