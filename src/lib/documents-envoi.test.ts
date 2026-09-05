import { describe, expect, it, vi, beforeEach } from "vitest";

const chargerDevisMock = vi.fn();
const chargerFactureMock = vi.fn();
const brevoEstConfigureMock = vi.fn();
const envoyerEmailBrevoMock = vi.fn();
const genererPdfMock = vi.fn();
const obtenirTokenMock = vi.fn();

vi.mock("@/lib/documents-commerciaux", () => ({
  chargerDonneesDevisImprimable: (...args: unknown[]) => chargerDevisMock(...args),
  chargerDonneesFactureImprimable: (...args: unknown[]) => chargerFactureMock(...args),
}));
vi.mock("@/lib/brevo", () => ({
  brevoEstConfigure: (...args: unknown[]) => brevoEstConfigureMock(...args),
  envoyerEmailBrevo: (...args: unknown[]) => envoyerEmailBrevoMock(...args),
}));
vi.mock("@/lib/pdf/generer", () => ({
  genererPdfDepuisUrl: (...args: unknown[]) => genererPdfMock(...args),
  nomFichierPdf: (estFacture: boolean, numero: string) => `${estFacture ? "facture" : "devis"}-${numero}.pdf`,
}));
vi.mock("@/lib/documents-partage", () => ({
  obtenirNouveauTokenPartage: (...args: unknown[]) => obtenirTokenMock(...args),
  urlDocumentPartage: (token: string) => `https://app.elsatia.fr/document/${token}`,
  urlImpressionPartage: (token: string) => `https://app.elsatia.fr/imprimer/partage/${token}`,
}));

import { envoyerDocumentCommercialParEmail } from "@/lib/documents-envoi";

const donneesDevis = {
  typeDoc: "Devis",
  numero: "DEV-2026-0001",
  dateEmission: "2026-08-01",
  dateSecondaire: null,
  entreprise: { nom: "ELSATIA" },
  client: { nom_affiche: "Client Test" },
  lignes: [],
  montantHt: 100,
  montantTva: 20,
  montantTtc: 120,
  notesClient: null,
  estFacture: false,
  estAvoir: false,
  signatures: [],
  photos: [],
  statut: "brouillon",
  clientEmail: "client@example.invalid",
  emailEnvoyeLe: null,
  entrepriseNom: "ELSATIA",
};

const donneesFacture = {
  ...donneesDevis,
  typeDoc: "Facture",
  numero: "FAC-2026-0001",
  estFacture: true,
  estAvoir: false,
};

const donneesAvoir = {
  ...donneesFacture,
  typeDoc: "Facture — Avoir",
  numero: "AV-2026-0001",
  estAvoir: true,
};

const paramsBase = {
  entrepriseId: "ent-1",
  entrepriseNom: "ELSATIA",
  prenomEmetteur: "Julien",
  userId: "user-1",
  typeDocument: "devis" as const,
  documentId: "devis-1",
};

function supabaseMock() {
  const update = vi.fn().mockReturnThis();
  const eq1 = vi.fn().mockReturnThis();
  const eq2 = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({ update: update.mockReturnValue({ eq: eq1.mockReturnValue({ eq: eq2 }) }) }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  chargerDevisMock.mockResolvedValue(donneesDevis);
  brevoEstConfigureMock.mockReturnValue(true);
  genererPdfMock.mockResolvedValue(Buffer.from("pdf"));
  obtenirTokenMock.mockResolvedValue("token-abc");
  envoyerEmailBrevoMock.mockResolvedValue({ messageId: "msg-1" });
});

describe("envoyerDocumentCommercialParEmail", () => {
  it("échoue si le document n'existe pas ou n'appartient pas à l'entreprise", async () => {
    chargerDevisMock.mockResolvedValue(null);
    const resultat = await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    expect(resultat).toEqual({ error: "Devis introuvable" });
    expect(envoyerEmailBrevoMock).not.toHaveBeenCalled();
  });

  it("échoue si le client n'a pas d'adresse e-mail", async () => {
    chargerDevisMock.mockResolvedValue({ ...donneesDevis, clientEmail: null });
    const resultat = await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    expect(resultat).toEqual({ error: "Ce client n'a pas d'adresse e-mail renseignée" });
    expect(envoyerEmailBrevoMock).not.toHaveBeenCalled();
  });

  it("échoue si Brevo n'est pas configuré", async () => {
    brevoEstConfigureMock.mockReturnValue(false);
    const resultat = await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    expect(resultat).toEqual({ error: "L'envoi automatique par e-mail n'est pas encore configuré" });
  });

  it("envoie quand même le lien de consultation si la génération du PDF échoue (sans pièce jointe)", async () => {
    genererPdfMock.mockRejectedValue(new Error("chromium indisponible"));
    const resultat = await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    expect(resultat).toEqual({ ok: true });
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.piecesJointes).toBeUndefined();
    expect(appel.html).toContain("https://app.elsatia.fr/document/token-abc");
  });

  it("échoue si l'envoi Brevo échoue, sans corrompre le document", async () => {
    envoyerEmailBrevoMock.mockRejectedValue(new Error("Envoi email impossible (Brevo a répondu 500)"));
    const supabase = supabaseMock();
    const resultat = await envoyerDocumentCommercialParEmail(supabase, paramsBase);
    expect(resultat).toEqual({ error: "Envoi email impossible (Brevo a répondu 500)" });
    // Aucune mise à jour de statut d'envoi n'a été tentée après l'échec.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("n'attache pas le PDF s'il dépasse la taille maximale, mais envoie quand même le lien", async () => {
    genererPdfMock.mockResolvedValue(Buffer.alloc(9 * 1024 * 1024));
    await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.piecesJointes).toBeUndefined();
    expect(appel.html).toContain("https://app.elsatia.fr/document/token-abc");
  });

  it("réussit et met à jour le statut d'envoi du document", async () => {
    const supabase = supabaseMock();
    const resultat = await envoyerDocumentCommercialParEmail(supabase, paramsBase);
    expect(resultat).toEqual({ ok: true });
    expect(supabase.from).toHaveBeenCalledWith("devis");
    expect(envoyerEmailBrevoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.invalid",
        piecesJointes: [{ nom: "devis-DEV-2026-0001.pdf", contenuBase64: Buffer.from("pdf").toString("base64") }],
      }),
    );
  });

  it("ajoute le complément (ex. lien de paiement) au message envoyé", async () => {
    await envoyerDocumentCommercialParEmail(supabaseMock(), { ...paramsBase, complementCorps: "Payez ici : https://paiement.test" });
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.texte).toContain("Payez ici : https://paiement.test");
  });

  it("ELSATIA-EMAILS-METIER-P1-CLOSURE-V1 : facture normale -> wording \"Facture\", jamais \"Avoir\"", async () => {
    chargerFactureMock.mockResolvedValue(donneesFacture);
    await envoyerDocumentCommercialParEmail(supabaseMock(), { ...paramsBase, typeDocument: "facture", documentId: "facture-1" });
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.sujet).toBe("Facture FAC-2026-0001 — ELSATIA");
    expect(appel.texte).toContain("la facture FAC-2026-0001");
    expect(appel.sujet).not.toContain("Avoir");
    expect(appel.texte).not.toContain("Avoir");
  });

  it("ELSATIA-EMAILS-METIER-P1-CLOSURE-V1 : facture.type = \"avoir\" -> wording \"Avoir\", jamais \"Facture\"", async () => {
    chargerFactureMock.mockResolvedValue(donneesAvoir);
    await envoyerDocumentCommercialParEmail(supabaseMock(), { ...paramsBase, typeDocument: "facture", documentId: "avoir-1" });
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.sujet).toBe("Avoir AV-2026-0001 — ELSATIA");
    expect(appel.texte).toContain("l'avoir AV-2026-0001");
    expect(appel.sujet).not.toContain("Facture");
    expect(appel.texte).not.toContain("la facture");
  });

  it("ELSATIA-EMAILS-METIER-P1-CLOSURE-V1 : le devis reste inchangé (wording \"Devis\")", async () => {
    await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.sujet).toBe("Devis DEV-2026-0001 — ELSATIA");
    expect(appel.texte).toContain("le devis DEV-2026-0001");
  });
});
