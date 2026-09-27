import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentImprimable, type EntrepriseEntete } from "@/components/DocumentImprimable";
import { identiteBonCommande, mentionIdentiteBonCommande, type CommandeIdentiteSource } from "./commande-document";

const FICHE_FOURNISSEUR_ENVOI = { nom: "Négoce Matériaux Rhin", adresse: "5 quai des Bateliers", code_postal: "67000", ville: "Strasbourg", siret: "98765432100017" };
const FICHE_FOURNISSEUR_MODIFIEE = { nom: "Nouveau Nom SAS", adresse: "99 rue Nouvelle", code_postal: "68000", ville: "Autreville", siret: "99999999900099" };
const ENTREPRISE_ENVOI: EntrepriseEntete = { nom: "Entreprise Isolation A", siret: "11111111100011", adresse: "1 rue A", code_postal: "67100", ville: "Strasbourg" };
const ENTREPRISE_MODIFIEE: EntrepriseEntete = { nom: "Entreprise Renommée", siret: "22222222200022", adresse: "2 rue B", code_postal: "75001", ville: "Paris" };

// Instantané tel que la base le fige (construire_fournisseur_snapshot_commande,
// construire_entreprise_snapshot) à la sortie du brouillon.
const commandeEnvoyee: CommandeIdentiteSource = {
  statut: "recue",
  fournisseur_snapshot: { version: 1, fournisseur_id: "f1", ...FICHE_FOURNISSEUR_ENVOI },
  entreprise_snapshot: { ...ENTREPRISE_ENVOI, logo_url: null, texte_pied_page: null },
  identite_provenance: "envoi",
  identite_figee_le: "2026-09-20T08:00:00Z",
};

function rendreBon(commande: CommandeIdentiteSource, ficheFournisseur = FICHE_FOURNISSEUR_MODIFIEE, ficheEntreprise = ENTREPRISE_MODIFIEE) {
  const identite = identiteBonCommande({ commande, ficheFournisseur, ficheEntreprise, nomEntrepriseParDefaut: "ctx" });
  // Même composant et mêmes props que /imprimer/commandes/[id] (page imprimée en PDF par Chromium).
  return renderToStaticMarkup(createElement(DocumentImprimable, {
    typeDoc: "Bon de commande",
    numero: "CMD-2026-003",
    dateEmission: "2026-09-20",
    dateSecondaire: null,
    entreprise: identite.emetteur,
    client: identite.destinataire,
    lignes: [{ designation: "Parpaing 20cm", description: null, quantite: 10, unite: "u", prix_unitaire_ht: 1.35, remise_ligne: 0, taux_tva: 20 }],
    montantHt: 13.5,
    montantTva: 2.7,
    montantTtc: 16.2,
    estFacture: false,
    signatures: [],
  }));
}

describe("bon de commande — identité imprimée figée à l'envoi (RD-2)", () => {
  it("une commande envoyée/reçue imprime l'identité figée, pas les fiches modifiées depuis", () => {
    const html = rendreBon(commandeEnvoyee);
    for (const attendu of ["Négoce Matériaux Rhin", "5 quai des Bateliers", "67000 Strasbourg", "SIRET 98765432100017", "Entreprise Isolation A", "SIRET 11111111100011"]) {
      expect(html).toContain(attendu);
    }
    for (const absent of ["Nouveau Nom SAS", "99 rue Nouvelle", "99999999900099", "Entreprise Renommée", "22222222200022"]) {
      expect(html).not.toContain(absent);
    }
  });

  it("immutabilité : le document historique est identique quelles que soient les fiches courantes", () => {
    const avant = rendreBon(commandeEnvoyee, FICHE_FOURNISSEUR_ENVOI, ENTREPRISE_ENVOI);
    const apres = rendreBon(commandeEnvoyee, FICHE_FOURNISSEUR_MODIFIEE, ENTREPRISE_MODIFIEE);
    expect(apres).toBe(avant);
  });

  it("un brouillon lit les fiches à jour (rien n'est encore figé)", () => {
    const html = rendreBon({ statut: "brouillon", fournisseur_snapshot: null, entreprise_snapshot: null });
    expect(html).toContain("Nouveau Nom SAS");
    expect(html).toContain("Entreprise Renommée");
  });

  it("un brouillon ignore un instantané présent dans la réponse (la base l'efface de toute façon)", () => {
    const identite = identiteBonCommande({
      commande: { ...commandeEnvoyee, statut: "brouillon" },
      ficheFournisseur: FICHE_FOURNISSEUR_MODIFIEE,
      ficheEntreprise: ENTREPRISE_MODIFIEE,
      nomEntrepriseParDefaut: "ctx",
    });
    expect(identite.origine).toBe("fiches");
    expect(identite.destinataire.nom_affiche).toBe("Nouveau Nom SAS");
  });

  it("n'imprime que les champs figés : ni contact, ni e-mail, ni téléphone du fournisseur", () => {
    const identite = identiteBonCommande({ commande: commandeEnvoyee, ficheFournisseur: null, ficheEntreprise: null, nomEntrepriseParDefaut: "ctx" });
    expect(Object.keys(identite.destinataire).sort()).toEqual(["adresse_facturation", "code_postal", "nom_affiche", "siret", "ville"]);
  });

  it("commande antérieure au gel : identité reconstituée, signalée comme telle", () => {
    const identite = identiteBonCommande({
      commande: { ...commandeEnvoyee, identite_provenance: "reconstituee" },
      ficheFournisseur: FICHE_FOURNISSEUR_MODIFIEE,
      ficheEntreprise: ENTREPRISE_MODIFIEE,
      nomEntrepriseParDefaut: "ctx",
    });
    expect(identite.origine).toBe("figee_reconstituee");
    expect(identite.destinataire.nom_affiche).toBe("Négoce Matériaux Rhin");
    expect(mentionIdentiteBonCommande(identite)).toContain("peuvent différer du bon réellement envoyé");
  });

  it("mentions : figée à l'envoi avec sa date, brouillon annoncé", () => {
    expect(mentionIdentiteBonCommande(identiteBonCommande({ commande: commandeEnvoyee, ficheFournisseur: null, ficheEntreprise: null, nomEntrepriseParDefaut: "ctx" })))
      .toContain("figées à l'envoi le 20/09/2026");
    expect(mentionIdentiteBonCommande(identiteBonCommande({ commande: { statut: "brouillon" }, ficheFournisseur: null, ficheEntreprise: null, nomEntrepriseParDefaut: "ctx" })))
      .toContain("Brouillon");
  });

  it("instantané fournisseur vide (fiche absente au rattrapage) : jamais de repli sur la fiche courante", () => {
    const identite = identiteBonCommande({
      commande: { ...commandeEnvoyee, identite_provenance: "reconstituee", fournisseur_snapshot: { version: 1, nom: null } },
      ficheFournisseur: FICHE_FOURNISSEUR_MODIFIEE,
      ficheEntreprise: ENTREPRISE_MODIFIEE,
      nomEntrepriseParDefaut: "ctx",
    });
    expect(identite.destinataire.nom_affiche).toBe("—");
  });
});
