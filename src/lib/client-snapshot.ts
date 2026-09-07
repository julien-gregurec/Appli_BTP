// ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-V1
//
// Lecture de l'identité du destinataire d'un document commercial.
//
// Règle unique, valable pour toute consultation, tout PDF, tout duplicata, tout
// renvoi, toute relance et tout export : un document ÉMIS affiche l'identité
// figée dans `client_snapshot` (capturée en base à l'émission, voir
// 20260908000272_client_document_snapshot_v1.sql), jamais la fiche client
// courante. Un BROUILLON, qui n'a pas encore de snapshot, affiche la fiche
// client à jour — et l'interface l'annonce explicitement.

import { nomClient } from "@/lib/chantier-statuts";
import type { ClientEntete } from "@/components/DocumentImprimable";

export type ClientSnapshot = {
  version?: number;
  client_id?: string | null;
  provenance?: string | null;
  identite_incertaine?: boolean | null;
  nom_affiche?: string | null;
  reference_interne?: string | null;
  nom?: string | null;
  prenom?: string | null;
  societe?: string | null;
  raison_sociale?: string | null;
  nom_commercial?: string | null;
  forme_juridique?: string | null;
  siret?: string | null;
  numero_tva?: string | null;
  adresse_facturation?: string | null;
  adresse_complement?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
  telephone?: string | null;
  email?: string | null;
  contact?: { nom?: string | null; fonction?: string | null; telephone?: string | null; email?: string | null } | null;
  herite_de?: { facture_id?: string | null; numero?: string | null } | null;
};

export type ClientFicheMinimale = {
  nom?: string | null;
  prenom?: string | null;
  societe?: string | null;
  email?: string | null;
  adresse_facturation?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  siret?: string | null;
} | null | undefined;

// D'où vient l'identité affichée. `figee` = document émis, identité gelée.
// `figee_reconstituee` = document historique rattrapé par le backfill : la
// valeur vient de la fiche client d'aujourd'hui, pas d'une observation faite à
// l'émission. `fiche_client` = brouillon, lecture directe et à jour.
export type OrigineIdentiteClient = "figee" | "figee_reconstituee" | "fiche_client";

export type IdentiteClientDocument = {
  entete: ClientEntete;
  email: string | null;
  origine: OrigineIdentiteClient;
  capturee_le: string | null;
  heriteDeFactureNumero: string | null;
};

function estSnapshot(valeur: unknown): valeur is ClientSnapshot {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Identité à imprimer / envoyer / exporter pour un document commercial.
 *
 * `snapshot` prime toujours sur `fiche` : dès qu'un document a été émis, la
 * fiche client n'est plus une source valable pour ce document.
 */
export function identiteClientDocument(params: {
  snapshot: unknown;
  fiche: ClientFicheMinimale;
  captureeLe?: string | null;
}): IdentiteClientDocument {
  const { snapshot, fiche } = params;

  if (estSnapshot(snapshot)) {
    const nomAffiche =
      snapshot.nom_affiche?.trim() ||
      nomClient({ societe: snapshot.societe, nom: snapshot.nom, prenom: snapshot.prenom });
    return {
      entete: {
        nom_affiche: nomAffiche || "—",
        adresse_facturation: snapshot.adresse_facturation ?? null,
        code_postal: snapshot.code_postal ?? null,
        ville: snapshot.ville ?? null,
        siret: snapshot.siret ?? null,
      },
      // L'e-mail destinataire fait partie de l'identité figée : un renvoi ou un
      // duplicata d'un document déjà émis repart vers l'adresse à laquelle il a
      // été adressé, pas vers une adresse saisie depuis.
      email: snapshot.contact?.email ?? snapshot.email ?? null,
      origine: snapshot.identite_incertaine === true ? "figee_reconstituee" : "figee",
      capturee_le: params.captureeLe ?? null,
      heriteDeFactureNumero: snapshot.herite_de?.numero ?? null,
    };
  }

  return {
    entete: {
      nom_affiche: fiche ? nomClient(fiche) : "—",
      adresse_facturation: fiche?.adresse_facturation ?? null,
      code_postal: fiche?.code_postal ?? null,
      ville: fiche?.ville ?? null,
      siret: fiche?.siret ?? null,
    },
    email: fiche?.email ?? null,
    origine: "fiche_client",
    capturee_le: null,
    heriteDeFactureNumero: null,
  };
}

/** Nom du destinataire tel qu'il figure sur le document (listes, exports). */
export function nomClientDocument(snapshot: unknown, fiche: ClientFicheMinimale): string {
  return identiteClientDocument({ snapshot, fiche }).entete.nom_affiche;
}

/** Phrase affichée à l'utilisateur pour qu'il sache quelle source est utilisée. */
export function mentionOrigineIdentite(identite: IdentiteClientDocument): string {
  switch (identite.origine) {
    case "figee": {
      const date = identite.capturee_le ? new Date(identite.capturee_le).toLocaleDateString("fr-FR") : null;
      const herite = identite.heriteDeFactureNumero
        ? ` (reprise de la facture ${identite.heriteDeFactureNumero})`
        : "";
      return date
        ? `Identité du client figée à l'émission le ${date}${herite}. Modifier la fiche client ne changera plus ce document.`
        : `Identité du client figée à l'émission${herite}. Modifier la fiche client ne changera plus ce document.`;
    }
    case "figee_reconstituee":
      return "Identité reconstituée depuis la fiche client lors de la reprise des documents antérieurs : elle peut différer de celle réellement imprimée à l'époque.";
    case "fiche_client":
      return "Brouillon : l'identité affichée est lue en direct sur la fiche client et sera figée à l'émission.";
  }
}

export const CLIENT_SNAPSHOT_COLONNE = "client_snapshot,client_snapshot_at";
