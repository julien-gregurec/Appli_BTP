// Identité imprimée sur un bon de commande fournisseur.
//
// Même règle que devis et factures (src/lib/client-snapshot.ts) : une commande sortie du
// brouillon imprime l'identité figée par la base à ce moment-là (fournisseur destinataire,
// entreprise émettrice — migration 20260927000507), jamais les fiches courantes. Seul un
// brouillon lit les fiches à jour.

import type { ClientEntete, EntrepriseEntete } from "@/components/DocumentImprimable";

export type FournisseurSnapshotCommande = {
  version?: number;
  fournisseur_id?: string | null;
  nom?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  siret?: string | null;
};

export type FicheFournisseurImprimee = {
  nom?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  siret?: string | null;
} | null | undefined;

// `figee` : identité figée à la sortie du brouillon. `figee_reconstituee` : commande
// antérieure au gel, identité reprise des fiches lors de la migration. `fiches` : brouillon.
export type OrigineIdentiteCommande = "figee" | "figee_reconstituee" | "fiches";

export type CommandeIdentiteSource = {
  statut: string;
  fournisseur_snapshot?: unknown;
  entreprise_snapshot?: unknown;
  identite_provenance?: string | null;
  identite_figee_le?: string | null;
};

export type IdentiteBonCommande = {
  destinataire: ClientEntete;
  emetteur: EntrepriseEntete;
  origine: OrigineIdentiteCommande;
  figeeLe: string | null;
};

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function destinataireDepuis(source: FournisseurSnapshotCommande | FicheFournisseurImprimee): ClientEntete {
  return {
    nom_affiche: source?.nom?.trim() || "—",
    adresse_facturation: source?.adresse ?? null,
    code_postal: source?.code_postal ?? null,
    ville: source?.ville ?? null,
    siret: source?.siret ?? null,
  };
}

/**
 * Identité à imprimer pour un bon de commande. Dès que la commande a quitté le brouillon,
 * les instantanés priment : les fiches fournisseur et entreprise ne sont plus une source
 * valable pour ce document. La base garantit leur présence hors brouillon (contrainte
 * commandes_fournisseurs_identite_figee_check) ; le repli sur les fiches ne sert qu'à une
 * base antérieure à 20260927000507.
 */
export function identiteBonCommande(params: {
  commande: CommandeIdentiteSource;
  ficheFournisseur: FicheFournisseurImprimee;
  ficheEntreprise: EntrepriseEntete | null | undefined;
  nomEntrepriseParDefaut: string;
}): IdentiteBonCommande {
  const { commande, ficheFournisseur, ficheEntreprise, nomEntrepriseParDefaut } = params;
  if (commande.statut !== "brouillon" && estObjet(commande.fournisseur_snapshot) && estObjet(commande.entreprise_snapshot)) {
    return {
      destinataire: destinataireDepuis(commande.fournisseur_snapshot as FournisseurSnapshotCommande),
      emetteur: { ...(commande.entreprise_snapshot as EntrepriseEntete), nom: String(commande.entreprise_snapshot.nom ?? "") },
      origine: commande.identite_provenance === "reconstituee" ? "figee_reconstituee" : "figee",
      figeeLe: commande.identite_figee_le ?? null,
    };
  }
  return {
    destinataire: destinataireDepuis(ficheFournisseur),
    emetteur: ficheEntreprise ?? { nom: nomEntrepriseParDefaut },
    origine: "fiches",
    figeeLe: null,
  };
}

/** Phrase affichée dans l'application pour dire quelle identité le bon imprime. */
export function mentionIdentiteBonCommande(identite: IdentiteBonCommande): string {
  switch (identite.origine) {
    case "figee": {
      const date = identite.figeeLe ? new Date(identite.figeeLe).toLocaleDateString("fr-FR") : null;
      return `Identités du fournisseur et de l'entreprise figées à l'envoi${date ? ` le ${date}` : ""} : modifier leurs fiches ne change plus ce bon de commande.`;
    }
    case "figee_reconstituee":
      return "Identités reprises des fiches lors du gel des commandes antérieures : elles peuvent différer du bon réellement envoyé à l'époque, et ne changent plus.";
    case "fiches":
      return "Brouillon : le bon affiche les fiches fournisseur et entreprise à jour ; elles seront figées à l'envoi.";
  }
}
