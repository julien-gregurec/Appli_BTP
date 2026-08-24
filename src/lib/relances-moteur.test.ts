import { describe, expect, it, vi } from "vitest";
import { evaluerEligibiliteDevis, evaluerEligibiliteFacture, executerRelance } from "./relances-moteur";
import { PARAMETRES_RELANCES_DEFAUT, type ParametresRelances } from "./relances";

vi.mock("@/lib/brevo", () => ({
  brevoEstConfigure: () => true,
  envoyerEmailBrevo: vi.fn(async () => ({ messageId: "msg-1" })),
}));
vi.mock("@/lib/email", () => ({ corpsHtmlEmailDocument: () => "<div></div>" }));
vi.mock("@/lib/documents-partage", () => ({
  obtenirNouveauTokenPartage: vi.fn(async () => "token-abc"),
  urlDocumentPartage: () => "https://app.example/document/token-abc",
}));

const CONFIG: ParametresRelances = { entrepriseId: "ent-a", ...PARAMETRES_RELANCES_DEFAUT, devisAutoActif: true, facturesAutoActif: true };

type MockOpts = {
  devis?: Record<string, unknown> | null;
  facture?: Record<string, unknown> | null;
  relancesEnvoyeesCount?: number;
  derniereRelanceDate?: string | null;
  rpcReclamerRetourne?: string | null;
};

function fabriquerSupabaseMock(opts: MockOpts) {
  const relancesEnvoyeesCount = opts.relancesEnvoyeesCount ?? 0;
  const derniereRelanceDate = opts.derniereRelanceDate ?? null;

  function chainRelancesDocuments() {
    const chain: Record<string, unknown> = {};
    for (const m of ["eq", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: derniereRelanceDate ? { date_envoi: derniereRelanceDate } : null });
    // Rendre le builder "thenable" pour le cas count (awaited directement, sans maybeSingle()).
    (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve: (v: unknown) => void) => resolve({ count: relancesEnvoyeesCount });
    return chain;
  }

  return {
    from(table: string) {
      if (table === "devis") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: opts.devis ?? null });
        return chain;
      }
      if (table === "factures") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: opts.facture ?? null });
        return chain;
      }
      if (table === "relances_documents") {
        return {
          select: () => chainRelancesDocuments(),
        };
      }
      throw new Error(`table non mockée: ${table}`);
    },
    rpc: vi.fn(async (nom: string) => {
      if (nom === "relance_reclamer") return { data: opts.rpcReclamerRetourne === undefined ? "reclamation-1" : opts.rpcReclamerRetourne, error: null };
      if (nom === "relance_finaliser") return { data: null, error: null };
      return { data: null, error: null };
    }),
  } as unknown as Parameters<typeof evaluerEligibiliteDevis>[0];
}

const CLIENT_OK = { nom: "Dupont", prenom: "Jean", societe: null, email: "client@example.com", relance_auto_exclue: false };

const DEVIS_ENVOYE = { id: "devis-1", entreprise_id: "ent-a", numero: "DEV-001", statut: "envoye", date_emission: "2026-08-01", montant_ttc: 1000, relance_auto_exclue: false, client_id: "cli-1", client: CLIENT_OK };

describe("evaluerEligibiliteDevis", () => {
  it("1. devis envoyé, tout ok -> éligible", async () => {
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(true);
  });

  it("2. devis accepté -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, statut: "accepte" } });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false });
    expect(res.eligible).toBe(false);
  });

  it("3. devis refusé -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, statut: "refuse" } });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false });
    expect(res.eligible).toBe(false);
  });

  it("4. devis expiré -> non éligible (décision documentée : jamais relancer un devis expiré)", async () => {
    const supabase = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, statut: "expire" } });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false });
    expect(res.eligible).toBe(false);
  });

  it("8. email absent -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, client: { ...CLIENT_OK, email: null } } });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(false);
    if (!res.eligible) expect(res.motif).toMatch(/e-mail/i);
  });

  it("9. auto désactivée mais appel manuel -> reste éligible (le flag ne gate que l'automatique)", async () => {
    const configAutoOff: ParametresRelances = { ...CONFIG, devisAutoActif: false };
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", configAutoOff, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(true);
  });

  it("10. document exclu (relance_auto_exclue) -> non éligible en auto, éligible en manuel", async () => {
    const supabase1 = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, relance_auto_exclue: true } });
    const resAuto = await evaluerEligibiliteDevis(supabase1, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: new Date("2026-08-10") });
    expect(resAuto.eligible).toBe(false);

    const supabase2 = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, relance_auto_exclue: true } });
    const resManuel = await evaluerEligibiliteDevis(supabase2, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(resManuel.eligible).toBe(true);
  });

  it("client exclu (relance_auto_exclue) -> non éligible en auto seulement", async () => {
    const supabase = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, client: { ...CLIENT_OK, relance_auto_exclue: true } } });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(false);
  });

  it("délai avant première relance pas écoulé -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-03") }); // 2 jours après émission, défaut 7j
    expect(res.eligible).toBe(false);
  });

  it("nombre maximum de relances déjà atteint -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE, relancesEnvoyeesCount: CONFIG.devisNombreMaxRelances });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-09-01") });
    expect(res.eligible).toBe(false);
  });

  it("délai ENTRE relances (pas la première) respecté depuis la dernière relance envoyée", async () => {
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE, relancesEnvoyeesCount: 1, derniereRelanceDate: "2026-08-20T00:00:00Z" });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-22") }); // 2j après dernière relance, défaut 7j
    expect(res.eligible).toBe(false);
  });
});

const FACTURE_ECHUE = { id: "fac-1", entreprise_id: "ent-a", numero: "FAC-001", statut: "envoyee", date_echeance: "2026-08-01", montant_ttc: 500, montant_paye: 0, relance_auto_exclue: false, client_id: "cli-1", client: CLIENT_OK };

describe("evaluerEligibiliteFacture", () => {
  it("5. facture échue, reste dû -> éligible", async () => {
    const supabase = fabriquerSupabaseMock({ facture: FACTURE_ECHUE });
    const res = await evaluerEligibiliteFacture(supabase, "ent-a", "fac-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(true);
  });

  it("6. facture réglée (payee) -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ facture: { ...FACTURE_ECHUE, statut: "payee", montant_paye: 500 } });
    const res = await evaluerEligibiliteFacture(supabase, "ent-a", "fac-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(false);
  });

  it("7. facture partiellement réglée, reste > 0 -> éligible", async () => {
    const supabase = fabriquerSupabaseMock({ facture: { ...FACTURE_ECHUE, statut: "payee_partiel", montant_paye: 200 } });
    const res = await evaluerEligibiliteFacture(supabase, "ent-a", "fac-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(true);
    if (res.eligible) expect(res.candidat.montant).toBe(300);
  });

  it("facture soldée par un règlement exact -> non éligible même si statut pas encore recalculé", async () => {
    const supabase = fabriquerSupabaseMock({ facture: { ...FACTURE_ECHUE, statut: "envoyee", montant_paye: 500 } });
    const res = await evaluerEligibiliteFacture(supabase, "ent-a", "fac-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(false);
  });

  it("échéance pas encore dépassée -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ facture: { ...FACTURE_ECHUE, date_echeance: "2026-08-20" } });
    const res = await evaluerEligibiliteFacture(supabase, "ent-a", "fac-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(false);
  });

  it("facture annulée -> non éligible", async () => {
    const supabase = fabriquerSupabaseMock({ facture: { ...FACTURE_ECHUE, statut: "annulee" } });
    const res = await evaluerEligibiliteFacture(supabase, "ent-a", "fac-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    expect(res.eligible).toBe(false);
  });
});

describe("executerRelance — idempotence et courses", () => {
  it("11/22. double cron : le second appel ne réclame rien (RPC retourne null) -> aucun envoi, deja_en_cours", async () => {
    const { envoyerEmailBrevo } = await import("@/lib/brevo");
    vi.mocked(envoyerEmailBrevo).mockClear();
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE, rpcReclamerRetourne: null });
    const eligibilite = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: new Date("2026-08-10") });
    if (!eligibilite.eligible) throw new Error("setup invalide");
    const resultat = await executerRelance(supabase, "ent-a", CONFIG, eligibilite.candidat, { automatique: true, declenchePar: null, entrepriseNom: "Test", prenomEmetteur: null, aujourdhui: new Date("2026-08-10") });
    expect(resultat.statut).toBe("deja_en_cours");
    expect(envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("15. relance déjà envoyée (niveau déjà à envoyee) -> non éligible au niveau suivant tant que le max n'est pas dépassé mais le NIVEAU EN COURS ne se répète jamais (vérifié par le comptage niveauSuivant)", async () => {
    // niveauSuivant = count(envoyee)+1 : si 1 déjà envoyée, le prochain candidat est niveau 2, jamais 1 à nouveau.
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE, relancesEnvoyeesCount: 1, derniereRelanceDate: "2026-08-01T00:00:00Z" });
    const res = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-20") });
    expect(res.eligible).toBe(true);
    if (res.eligible) expect(res.candidat.niveau).toBe(2);
  });

  it("16. Gérant (permissions null = accès complet) : relance manuelle réussit", async () => {
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const eligibilite = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    if (!eligibilite.eligible) throw new Error("setup invalide");
    const resultat = await executerRelance(supabase, "ent-a", CONFIG, eligibilite.candidat, { automatique: false, declenchePar: "user-1", entrepriseNom: "Test", prenomEmetteur: "Julien", aujourdhui: new Date("2026-08-10") });
    expect(resultat.statut).toBe("envoyee");
  });

  it("13/25. devis accepté après réclamation (revalidation juste avant envoi) -> ignorée, aucun envoi Brevo", async () => {
    const { envoyerEmailBrevo } = await import("@/lib/brevo");
    vi.mocked(envoyerEmailBrevo).mockClear();
    // Le premier chargement (evaluerEligibilite initial) verrait "envoye", mais executerRelance
    // revalide en interne avec le MÊME mock : on simule le changement en rendant le mock "accepte"
    // dès le départ pour representer l'état réel au moment de la revalidation post-réclamation.
    const supabaseInitial = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const eligibilite = await evaluerEligibiliteDevis(supabaseInitial, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: new Date("2026-08-10") });
    if (!eligibilite.eligible) throw new Error("setup invalide");

    const supabaseApresChangement = fabriquerSupabaseMock({ devis: { ...DEVIS_ENVOYE, statut: "accepte" } });
    const resultat = await executerRelance(supabaseApresChangement, "ent-a", CONFIG, eligibilite.candidat, { automatique: true, declenchePar: null, entrepriseNom: "Test", prenomEmetteur: null, aujourdhui: new Date("2026-08-10") });
    expect(resultat.statut).toBe("ignoree");
    expect(envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("14/24. facture payée après réclamation (revalidation juste avant envoi) -> ignorée, aucun envoi Brevo", async () => {
    const { envoyerEmailBrevo } = await import("@/lib/brevo");
    vi.mocked(envoyerEmailBrevo).mockClear();
    const supabaseInitial = fabriquerSupabaseMock({ facture: FACTURE_ECHUE });
    const eligibilite = await evaluerEligibiliteFacture(supabaseInitial, "ent-a", "fac-1", CONFIG, { pourAuto: true, aujourdhui: new Date("2026-08-10") });
    if (!eligibilite.eligible) throw new Error("setup invalide");

    const supabaseApresPaiement = fabriquerSupabaseMock({ facture: { ...FACTURE_ECHUE, statut: "payee", montant_paye: 500 } });
    const resultat = await executerRelance(supabaseApresPaiement, "ent-a", CONFIG, eligibilite.candidat, { automatique: true, declenchePar: null, entrepriseNom: "Test", prenomEmetteur: null, aujourdhui: new Date("2026-08-10") });
    expect(resultat.statut).toBe("ignoree");
    expect(envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("18. politique désactivée avant send (pause) -> ignorée en auto", async () => {
    const { envoyerEmailBrevo } = await import("@/lib/brevo");
    vi.mocked(envoyerEmailBrevo).mockClear();
    const supabaseInitial = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const eligibilite = await evaluerEligibiliteDevis(supabaseInitial, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: new Date("2026-08-10") });
    if (!eligibilite.eligible) throw new Error("setup invalide");

    const configPause: ParametresRelances = { ...CONFIG, pauseJusquAu: "2026-12-31" };
    const supabaseApres = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const resultat = await executerRelance(supabaseApres, "ent-a", configPause, eligibilite.candidat, { automatique: true, declenchePar: null, entrepriseNom: "Test", prenomEmetteur: null, aujourdhui: new Date("2026-08-10") });
    expect(resultat.statut).toBe("ignoree");
    expect(envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("envoi réussi -> RPC finaliser appelé avec statut envoyee et provider_message_id", async () => {
    const supabase = fabriquerSupabaseMock({ devis: DEVIS_ENVOYE });
    const eligibilite = await evaluerEligibiliteDevis(supabase, "ent-a", "devis-1", CONFIG, { pourAuto: false, aujourdhui: new Date("2026-08-10") });
    if (!eligibilite.eligible) throw new Error("setup invalide");
    await executerRelance(supabase, "ent-a", CONFIG, eligibilite.candidat, { automatique: false, declenchePar: "user-1", entrepriseNom: "Test", prenomEmetteur: null, aujourdhui: new Date("2026-08-10") });
    expect(supabase.rpc).toHaveBeenCalledWith("relance_finaliser", expect.objectContaining({ p_statut: "envoyee", p_provider_message_id: "msg-1" }));
  });
});
