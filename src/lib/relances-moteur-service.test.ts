import { describe, expect, it, vi } from "vitest";
import { evaluerEligibiliteDevis, executerRelance, listerCandidatsAutoFactures } from "./relances-moteur";
import { PARAMETRES_RELANCES_DEFAUT, type ParametresRelances } from "./relances";

// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 : le cron (client service_role) ne lit plus devis, factures,
// clients ni relances_documents depuis la migration 255. En « chemin de service », le moteur ne
// doit appeler QUE des RPC de service ; le chemin session est couvert par relances-moteur.test.ts.

const partage = vi.hoisted(() => ({
  session: vi.fn(async () => "token-session"),
  service: vi.fn(async () => "token-service"),
}));
vi.mock("@/lib/brevo", () => ({
  brevoEstConfigure: () => true,
  envoyerEmailBrevo: vi.fn(async () => ({ messageId: "msg-1" })),
}));
vi.mock("@/lib/email", () => ({ corpsHtmlEmailDocument: () => "<div></div>" }));
vi.mock("@/lib/documents-partage", () => ({
  obtenirNouveauTokenPartage: partage.session,
  obtenirNouveauTokenPartageService: partage.service,
  urlDocumentPartage: (token: string) => `https://app.example/document/${token}`,
}));

const CONFIG: ParametresRelances = { entrepriseId: "ent-a", ...PARAMETRES_RELANCES_DEFAUT, devisAutoActif: true, facturesAutoActif: true };
const MERCREDI = new Date("2026-09-09T10:00:00Z");
const ilYA = (jours: number) => new Date(MERCREDI.getTime() - jours * 24 * 3600 * 1000).toISOString();

const DEVIS = {
  id: "devis-1", entreprise_id: "ent-a", numero: "D-1", statut: "envoye", date_emission: ilYA(30).slice(0, 10),
  montant_ttc: 120, relance_auto_exclue: false, client_id: "cli-1", client_snapshot: null,
  client: { nom: "Client", prenom: null, societe: null, email: "client@invalid.local", relance_auto_exclue: false },
};

function adminFactice(reponses: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (nom: string) => reponses[nom] ?? { data: null, error: null });
  const from = vi.fn(() => { throw new Error("aucune lecture directe de table en chemin de service"); });
  return { client: { rpc, from } as never, rpc, from };
}

describe("moteur de relances — chemin de service (cron)", () => {
  it("évalue un devis par la RPC de service, historique compris", async () => {
    const { client, rpc, from } = adminFactice({
      relance_document_service: { data: { ...DEVIS, relances_envoyees: 1, derniere_relance_envoyee: ilYA(10) }, error: null },
    });
    const resultat = await evaluerEligibiliteDevis(client, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: MERCREDI, service: true });
    expect(resultat).toMatchObject({ eligible: true, candidat: { niveau: 2, clientEmail: "client@invalid.local" } });
    expect(rpc).toHaveBeenCalledWith("relance_document_service", { p_entreprise_id: "ent-a", p_type_document: "devis", p_document_id: "devis-1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("respecte le plafond de relances calculé depuis l'historique de service", async () => {
    const { client } = adminFactice({
      relance_document_service: { data: { ...DEVIS, relances_envoyees: CONFIG.devisNombreMaxRelances, derniere_relance_envoyee: ilYA(30) }, error: null },
    });
    const resultat = await evaluerEligibiliteDevis(client, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: MERCREDI, service: true });
    expect(resultat).toEqual({ eligible: false, motif: "Nombre maximum de relances déjà atteint" });
  });

  it("lève une erreur visible si la lecture de service échoue (plus de « rien à relancer » silencieux)", async () => {
    const { client } = adminFactice({ relance_document_service: { data: null, error: { code: "42501" } } });
    await expect(evaluerEligibiliteDevis(client, "ent-a", "devis-1", CONFIG, { pourAuto: true, aujourdhui: MERCREDI, service: true }))
      .rejects.toThrow("Lecture du document à relancer impossible");
  });

  it("liste les factures candidates par la RPC de service", async () => {
    const { client, rpc, from } = adminFactice({
      relances_auto_candidats_service: { data: [], error: null },
    });
    const resultat = await listerCandidatsAutoFactures(client, "ent-a", CONFIG, MERCREDI, { service: true });
    expect(resultat).toEqual({ candidats: [], ineligibles: [] });
    expect(rpc).toHaveBeenCalledWith("relances_auto_candidats_service", { p_entreprise_id: "ent-a", p_type_document: "facture", p_limite: 200 });
    expect(from).not.toHaveBeenCalled();
  });

  it("émet le lien de partage par la RPC de service, jamais par l'écriture directe", async () => {
    const { client, rpc, from } = adminFactice({
      relance_reclamer: { data: "reclamation-1", error: null },
      relance_document_service: { data: { ...DEVIS, relances_envoyees: 0, derniere_relance_envoyee: null }, error: null },
    });
    const candidat = {
      typeDocument: "devis" as const, documentId: "devis-1", entrepriseId: "ent-a", numero: "D-1", niveau: 1,
      clientNom: "Client", clientEmail: "client@invalid.local", montant: 120, dateReference: DEVIS.date_emission,
    };
    const resultat = await executerRelance(client, "ent-a", CONFIG, candidat, {
      automatique: true, declenchePar: null, entrepriseNom: "Entreprise A", prenomEmetteur: null, aujourdhui: MERCREDI, service: true,
    });
    expect(resultat.statut).toBe("envoyee");
    expect(partage.service).toHaveBeenCalledWith(client, { entrepriseId: "ent-a", typeDocument: "devis", documentId: "devis-1" });
    expect(partage.session).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("relance_finaliser", expect.objectContaining({ p_statut: "envoyee" }));
    expect(from).not.toHaveBeenCalled();
  });
});
