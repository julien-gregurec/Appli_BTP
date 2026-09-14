import { describe, expect, it, vi, beforeEach } from "vitest";

const chargerDevisMock = vi.fn();
const chargerFactureMock = vi.fn();
const brevoEstConfigureMock = vi.fn();
const envoyerEmailBrevoMock = vi.fn();
const genererPdfMock = vi.fn();
const genererPdfHtmlMock = vi.fn();
const obtenirTokenMock = vi.fn();

vi.mock("@/lib/documents-commerciaux", () => ({
  chargerDonneesDevisImprimable: (...args: unknown[]) => chargerDevisMock(...args),
  chargerDonneesFactureImprimable: (...args: unknown[]) => chargerFactureMock(...args),
}));
vi.mock("@/lib/brevo", () => ({
  brevoEstConfigure: (...args: unknown[]) => brevoEstConfigureMock(...args),
  envoyerEmailBrevo: (...args: unknown[]) => envoyerEmailBrevoMock(...args),
  echapperHtml: (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
}));
vi.mock("@/lib/pdf/generer", () => ({
  genererPdfDepuisUrl: (...args: unknown[]) => genererPdfMock(...args),
  genererPdfDepuisHtml: (...args: unknown[]) => genererPdfHtmlMock(...args),
  nomFichierPdf: (estFacture: boolean, numero: string) => `${estFacture ? "facture" : "devis"}-${numero}.pdf`,
}));
vi.mock("@/lib/documents-partage", () => ({
  obtenirNouveauTokenPartage: (...args: unknown[]) => obtenirTokenMock(...args),
  urlDocumentPartage: (token: string) => `https://app.elsatia.fr/document/${token}`,
  urlImpressionPartage: (token: string) => `https://app.elsatia.fr/imprimer/partage/${token}`,
}));

import { envoyerDocumentCommercialParEmail, htmlCgv } from "@/lib/documents-envoi";

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

// Mock traçant : enregistre chaque table touchée et chaque ligne insérée, pour
// prouver ce qui est écrit — et surtout ce qui ne l'est PAS (public.clients,
// devis.client_snapshot).
type EcritureTracee = { table: string; operation: "insert" | "update"; charge: unknown };

function supabaseTracant() {
  const ecritures: EcritureTracee[] = [];
  const client = {
    from: (table: string) => ({
      insert: (charge: unknown) => {
        ecritures.push({ table, operation: "insert", charge });
        return Promise.resolve({ error: null });
      },
      update: (charge: unknown) => {
        ecritures.push({ table, operation: "update", charge });
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
  return { client, ecritures };
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

  // Message reformulé par ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-V1 : depuis le
  // lot Snapshot, l'adresse utilisée est celle FIGÉE SUR LE DOCUMENT, pas celle
  // de la fiche client — « ce client n'a pas d'adresse » était devenu inexact.
  // Le scénario, le refus et l'absence d'envoi sont inchangés.
  it("échoue si le document ne porte aucune adresse de destinataire", async () => {
    chargerDevisMock.mockResolvedValue({ ...donneesDevis, clientEmail: null });
    const resultat = await envoyerDocumentCommercialParEmail(supabaseMock(), paramsBase);
    expect(resultat).toEqual({ error: "Ce document ne porte aucune adresse e-mail de destinataire." });
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

// ---------------------------------------------------------------------------
// ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-V1
// ---------------------------------------------------------------------------

describe("surcharge de l'adresse de renvoi", () => {
  const FIGEE = "client@example.invalid";
  const AUTRE = "nouveau-contact@example.invalid";

  it("1. envoie à l'adresse figée quand aucune surcharge n'est demandée", async () => {
    const { client, ecritures } = supabaseTracant();
    const resultat = await envoyerDocumentCommercialParEmail(client, paramsBase);
    expect(resultat).toEqual({ ok: true });
    expect(envoyerEmailBrevoMock.mock.calls[0][0].to).toBe(FIGEE);
    // Aucun écart : aucune entrée de journal.
    expect(ecritures.filter((e) => e.table === "journal_activite")).toHaveLength(0);
  });

  it("2. + 5. envoie à l'adresse surchargée et journalise l'écart", async () => {
    const { client, ecritures } = supabaseTracant();
    const resultat = await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE, motif: "Le contact a changé" },
      peutSurchargerDestinataire: true,
    });
    expect(resultat).toEqual({ ok: true });
    expect(envoyerEmailBrevoMock.mock.calls[0][0].to).toBe(AUTRE);

    const journal = ecritures.filter((e) => e.table === "journal_activite");
    expect(journal).toHaveLength(1);
    expect(journal[0].charge).toMatchObject({
      entreprise_id: "ent-1",
      utilisateur_id: "user-1",
      action: "envoi_document_adresse_surchargee",
      ressource: "devis",
      ressource_id: "devis-1",
      metadata: {
        adresse_figee: FIGEE,
        adresse_utilisee: AUTRE,
        motif: "Le contact a changé",
        type_envoi: "envoi_initial",
        resultat: "succes",
      },
    });
  });

  it("4. refuse la surcharge d'un utilisateur non autorisé, sans rien envoyer", async () => {
    const { client, ecritures } = supabaseTracant();
    const resultat = await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE },
      peutSurchargerDestinataire: false,
    });
    expect(resultat).toMatchObject({ error: expect.stringContaining("ne permet pas") });
    expect(envoyerEmailBrevoMock).not.toHaveBeenCalled();
    expect(ecritures).toHaveLength(0);
  });

  it("6. le PDF joint reste celui du document, généré depuis la page du snapshot", async () => {
    const { client } = supabaseTracant();
    await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE },
      peutSurchargerDestinataire: true,
    });
    // Le PDF est produit à partir de l'URL d'impression partagée, sans aucun
    // paramètre lié à l'adresse : la surcharge ne peut pas l'influencer.
    expect(genererPdfMock).toHaveBeenCalledWith("https://app.elsatia.fr/imprimer/partage/token-abc");
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.piecesJointes).toHaveLength(1);
    expect(appel.piecesJointes[0].nom).toBe("devis-DEV-2026-0001.pdf");
    // Le corps s'adresse toujours au destinataire figé du document.
    expect(appel.texte).toContain("DEV-2026-0001");
  });

  it("7. + 8. n'écrit ni le snapshot du document, ni la fiche client", async () => {
    const { client, ecritures } = supabaseTracant();
    await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE },
      peutSurchargerDestinataire: true,
    });
    expect(ecritures.some((e) => e.table === "clients")).toBe(false);
    const tables = new Set(ecritures.map((e) => e.table));
    expect([...tables].sort()).toEqual(["devis", "journal_activite"]);
    // La seule écriture sur le document est la traçabilité d'envoi : jamais
    // client_snapshot, jamais client_id.
    const surDocument = ecritures.filter((e) => e.table === "devis");
    for (const ecriture of surDocument) {
      expect(Object.keys(ecriture.charge as object).sort()).toEqual(["email_envoye_a", "email_envoye_le"]);
    }
  });

  it("9. journalise un envoi refusé par le fournisseur, avec sa cause", async () => {
    envoyerEmailBrevoMock.mockRejectedValue(new Error("Brevo 401"));
    const { client, ecritures } = supabaseTracant();
    const resultat = await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE },
      peutSurchargerDestinataire: true,
    });
    expect(resultat).toEqual({ error: "Brevo 401" });
    const journal = ecritures.filter((e) => e.table === "journal_activite");
    expect(journal).toHaveLength(1);
    expect(journal[0].charge).toMatchObject({ metadata: { resultat: "echec", erreur: "Brevo 401" } });
  });

  it("10. une nouvelle tentative après échec ajoute une seconde entrée de journal", async () => {
    envoyerEmailBrevoMock.mockRejectedValueOnce(new Error("Brevo 401"));
    const { client, ecritures } = supabaseTracant();
    const surcharge = { surchargeDestinataire: { email: AUTRE }, peutSurchargerDestinataire: true };

    await envoyerDocumentCommercialParEmail(client, { ...paramsBase, ...surcharge });
    chargerDevisMock.mockResolvedValue({ ...donneesDevis, emailEnvoyeLe: "2026-09-07T10:00:00.000Z" });
    const seconde = await envoyerDocumentCommercialParEmail(client, { ...paramsBase, ...surcharge });

    expect(seconde).toEqual({ ok: true });
    const journal = ecritures.filter((e) => e.table === "journal_activite");
    expect(journal).toHaveLength(2);
    expect(journal[0].charge).toMatchObject({ metadata: { resultat: "echec", type_envoi: "envoi_initial" } });
    expect(journal[1].charge).toMatchObject({ metadata: { resultat: "succes", type_envoi: "renvoi" } });
  });

  it("un journal indisponible ne fait pas échouer un envoi réussi", async () => {
    const client = {
      from: (table: string) => ({
        insert: () => {
          if (table === "journal_activite") throw new Error("journal indisponible");
          return Promise.resolve({ error: null });
        },
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const resultat = await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE },
      peutSurchargerDestinataire: true,
    });
    expect(resultat).toEqual({ ok: true });
  });

  it("enregistre l'adresse réellement utilisée dans la traçabilité d'envoi du document", async () => {
    const { client, ecritures } = supabaseTracant();
    await envoyerDocumentCommercialParEmail(client, {
      ...paramsBase,
      surchargeDestinataire: { email: AUTRE },
      peutSurchargerDestinataire: true,
    });
    const surDocument = ecritures.find((e) => e.table === "devis");
    expect(surDocument?.charge).toMatchObject({ email_envoye_a: AUTRE });
  });
});

// ---------------------------------------------------------------------------
// GP V1, lot G — copies, modèle, pièces jointes, historique des envois
// ---------------------------------------------------------------------------

describe("options d'envoi (GP V1, lot G)", () => {
  function supabaseLotG(o: { cgv?: string | null; docs?: Array<{ id: string; nom: string; storage_path: string; taille_octets: number }> } = {}) {
    const rpc = vi.fn().mockResolvedValue({ data: "envoi-1", error: null });
    const download = vi.fn(async () => ({ data: { arrayBuffer: async () => new TextEncoder().encode("piece").buffer }, error: null }));
    const client = {
      rpc,
      storage: { from: () => ({ download }) },
      from: (table: string) => ({
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        insert: () => Promise.resolve({ error: null }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === "entreprises" ? { nom: "ELSATIA", cgv_texte: o.cgv ?? null } : null }),
            in: async () => ({ data: o.docs ?? [] }),
          }),
        }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    return { client, rpc, download };
  }

  it("transmet Cc et Cci validés, l'objet et le message du modèle, et consigne l'envoi", async () => {
    const { client, rpc } = supabaseLotG();
    const resultat = await envoyerDocumentCommercialParEmail(client, { ...paramsBase, options: { cc: ["Conducteur@Exemple.invalid", " conducteur@exemple.invalid "], cci: ["archives@exemple.invalid"], objet: "Votre devis DEV-2026-0001", corps: "Bonjour,\nci-joint." } });
    expect(resultat).toEqual({ ok: true });
    const appel = envoyerEmailBrevoMock.mock.calls[0][0];
    expect(appel.cc).toEqual(["conducteur@exemple.invalid"]);
    expect(appel.cci).toEqual(["archives@exemple.invalid"]);
    expect(appel.sujet).toBe("Votre devis DEV-2026-0001");
    expect(appel.texte).toBe("Bonjour,\nci-joint.");
    expect(rpc).toHaveBeenCalledWith("journaliser_envoi_document", expect.objectContaining({
      p_type_document: "devis", p_document_id: "devis-1", p_destinataire: "client@example.invalid", p_copies: ["conducteur@exemple.invalid"], p_copies_cachees: ["archives@exemple.invalid"], p_statut: "envoye",
      p_pieces: [{ nom: "devis-DEV-2026-0001.pdf", taille: 3, source: "document" }],
    }));
  });

  it("refuse une adresse en copie inexploitable sans rien envoyer", async () => {
    const { client } = supabaseLotG();
    const resultat = await envoyerDocumentCommercialParEmail(client, { ...paramsBase, options: { cc: ["pas-une-adresse"] } });
    expect(resultat).toEqual({ error: "Adresse en copie inexploitable : pas-une-adresse" });
    expect(envoyerEmailBrevoMock).not.toHaveBeenCalled();
  });

  it("joint les CGV (PDF produit depuis le texte de l'entreprise) et une pièce du chantier", async () => {
    const { client, download } = supabaseLotG({ cgv: "Article 1 — Objet.", docs: [{ id: "doc-1", nom: "plan.pdf", storage_path: "ent-1/plan.pdf", taille_octets: 5 }] });
    genererPdfHtmlMock.mockResolvedValue(Buffer.from("cgv-pdf"));
    const resultat = await envoyerDocumentCommercialParEmail(client, { ...paramsBase, options: { joindreCgv: true, piecesComplementaires: ["doc-1"] } });
    expect(resultat).toEqual({ ok: true });
    expect(genererPdfHtmlMock.mock.calls[0][0]).toContain("Conditions générales de vente");
    expect(genererPdfHtmlMock.mock.calls[0][0]).toContain("Article 1 — Objet.");
    expect(download).toHaveBeenCalledWith("ent-1/plan.pdf");
    const noms = envoyerEmailBrevoMock.mock.calls[0][0].piecesJointes.map((p: { nom: string }) => p.nom);
    expect(noms).toEqual(["devis-DEV-2026-0001.pdf", "conditions-generales-de-vente.pdf", "plan.pdf"]);
  });

  it("refuse de joindre des CGV absentes, ou une pièce qui n'appartient pas à l'entreprise", async () => {
    const { client } = supabaseLotG({ cgv: "" });
    expect(await envoyerDocumentCommercialParEmail(client, { ...paramsBase, options: { joindreCgv: true } })).toEqual({ error: "Aucune condition générale de vente n'est renseignée dans les paramètres." });
    expect(await envoyerDocumentCommercialParEmail(client, { ...paramsBase, options: { piecesComplementaires: ["doc-etranger"] } })).toEqual({ error: "Une pièce complémentaire est introuvable ou n'appartient pas à cette entreprise." });
    expect(envoyerEmailBrevoMock).not.toHaveBeenCalled();
  });

  it("consigne aussi un envoi refusé par le transport", async () => {
    const { client, rpc } = supabaseLotG();
    envoyerEmailBrevoMock.mockRejectedValue(new Error("Envoi email impossible (Brevo a répondu 500)"));
    const resultat = await envoyerDocumentCommercialParEmail(client, paramsBase);
    expect(resultat).toEqual({ error: "Envoi email impossible (Brevo a répondu 500)" });
    expect(rpc).toHaveBeenCalledWith("journaliser_envoi_document", expect.objectContaining({ p_statut: "echec", p_erreur: "Envoi email impossible (Brevo a répondu 500)" }));
  });

  it("htmlCgv échappe le texte venu de la base", () => {
    expect(htmlCgv({ nom: "A & B", cgv: "<script>x</script>\n\nArticle 2" })).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(htmlCgv({ nom: "A & B", cgv: "x" })).toContain("A &amp; B");
  });
});
