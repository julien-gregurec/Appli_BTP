import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerDonneesDocumentPartage } from "@/lib/documents-commerciaux";
import { hacherTokenPartage } from "@/lib/documents-partage";

function clientRpc(reponse: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(reponse);
  const from = vi.fn();
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

const LIGNE = {
  designation: "Pose carrelage",
  description: null,
  quantite: 2,
  unite: "m2",
  prix_unitaire_ht: 30,
  remise_ligne: 0,
  taux_tva: 20,
};

describe("chargerDonneesDocumentPartage", () => {
  it("lit le devis par la seule fonction dédiée au jeton, sans aucune lecture de table", async () => {
    const { supabase, rpc, from } = clientRpc({
      data: {
        type_document: "devis",
        document: {
          id: "dev-1",
          numero: "DEV-001",
          statut: "brouillon",
          date_emission: "2026-09-11",
          date_validite: "2026-10-11",
          montant_ht: 60,
          montant_tva: 12,
          montant_ttc: 72,
          notes_client: "Merci",
          client_snapshot: null,
          client_snapshot_at: null,
        },
        client: {
          nom: "Dupont",
          prenom: "Jean",
          societe: null,
          adresse_facturation: "1 rue du Client",
          code_postal: "67000",
          ville: "Strasbourg",
          siret: null,
        },
        lignes: [LIGNE],
        entreprise: { nom: "Entreprise A", siret: "12345678900011" },
        signatures: [],
        photos: [{ id: "photo-1", nom_original: "chantier.jpg", legende: null }],
      },
      error: null,
    });

    const donnees = await chargerDonneesDocumentPartage(supabase, "jeton-en-clair");

    expect(rpc).toHaveBeenCalledWith("document_commercial_public_par_token", { p_token: "jeton-en-clair" });
    expect(from).not.toHaveBeenCalled();
    expect(donnees).toMatchObject({
      typeDoc: "Devis",
      numero: "DEV-001",
      estFacture: false,
      estAvoir: false,
      dateSecondaire: { label: "Valable jusqu'au", valeur: "2026-10-11" },
      entreprise: { nom: "Entreprise A", siret: "12345678900011" },
      entrepriseNom: "Entreprise A",
      lignes: [LIGNE],
      photos: [{ id: "photo-1", nom: "chantier.jpg", legende: null }],
      clientOrigine: "fiche_client",
      notesClient: "Merci",
    });
    expect(donnees?.client).toMatchObject({ adresse_facturation: "1 rue du Client", ville: "Strasbourg" });
    expect(donnees?.client.nom_affiche).toContain("Dupont");
  });

  it("facture émise : en-tête et destinataire figés, nom courant de l'entreprise", async () => {
    const { supabase } = clientRpc({
      data: {
        type_document: "facture",
        document: {
          id: "fac-1",
          numero: "FAC-001",
          statut: "envoyee",
          type: "simple",
          date_emission: "2026-09-01",
          date_echeance: "2026-10-01",
          montant_ht: 100,
          montant_tva: 20,
          montant_ttc: 120,
          notes_client: null,
          entreprise_snapshot: { nom: "Ancien Nom SARL" },
          client_snapshot: { nom_affiche: "Client Figé", ville: "Colmar" },
          client_snapshot_at: "2026-09-01T10:00:00+00:00",
        },
        client: null,
        lignes: [LIGNE],
        entreprise: { nom: "Nouveau Nom SAS" },
        signatures: [],
        photos: [],
      },
      error: null,
    });

    const donnees = await chargerDonneesDocumentPartage(supabase, "jeton-facture");

    expect(donnees).toMatchObject({
      typeDoc: "Facture",
      numero: "FAC-001",
      estFacture: true,
      estAvoir: false,
      dateSecondaire: { label: "Échéance le", valeur: "2026-10-01" },
      entreprise: { nom: "Ancien Nom SARL" },
      entrepriseNom: "Nouveau Nom SAS",
      client: { nom_affiche: "Client Figé", ville: "Colmar" },
      clientOrigine: "figee",
      clientSnapshotAt: "2026-09-01T10:00:00+00:00",
      photos: [],
    });
    // La fonction ne renvoie jamais l'e-mail du destinataire : rien à envoyer d'ici.
    expect(donnees?.clientEmail).toBeNull();
  });

  it("jeton vide : aucun appel à la base", async () => {
    const { supabase, rpc } = clientRpc({ data: null, error: null });
    expect(await chargerDonneesDocumentPartage(supabase, "")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("jeton inconnu, révoqué ou expiré (la fonction renvoie NULL) : null, donc 404", async () => {
    const { supabase } = clientRpc({ data: null, error: null });
    expect(await chargerDonneesDocumentPartage(supabase, "jeton-inconnu")).toBeNull();
  });

  it("panne de lecture : erreur levée, jamais déguisée en lien introuvable", async () => {
    const { supabase } = clientRpc({ data: null, error: { message: "permission denied for table devis" } });
    await expect(chargerDonneesDocumentPartage(supabase, "jeton")).rejects.toThrow(
      "Lecture du document partagé impossible : permission denied for table devis",
    );
  });

  it("l'empreinte applicative est le SHA-256 hexadécimal que la base recalcule", () => {
    expect(hacherTokenPartage("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("pages publiques de partage", () => {
  it.each(["src/app/document/[token]/page.tsx", "src/app/imprimer/partage/[token]/page.tsx"])(
    "%s ne lit le document que par son jeton, jamais par une lecture de table",
    (fichier) => {
      const source = readFileSync(path.join(process.cwd(), fichier), "utf8");
      expect(source).toContain("chargerDonneesDocumentPartage(createAdminClient(), token)");
      expect(source).not.toMatch(/chargerDonneesDevisImprimable|chargerDonneesFactureImprimable|\.from\(|\.rpc\(/);
    },
  );
});
