// ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-V1
//
// Un document commercial émis porte l'adresse e-mail du destinataire figée à
// l'émission (ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-V1). Cette adresse peut
// être devenue obsolète : le contact du client a changé, et le renvoi n'atteint
// plus personne — voire atteint un ancien salarié du client.
//
// Règle retenue, arbitrée par Julien :
//
//   1. l'identité historique du document reste immuable ;
//   2. le PDF utilise toujours le snapshot historique ;
//   3. l'adresse figée reste visible ;
//   4. un envoi part PAR DÉFAUT vers l'adresse figée ;
//   5. un utilisateur autorisé peut choisir EXPLICITEMENT une autre adresse ;
//   6. l'interface signale que cette adresse diffère du document d'origine ;
//   7. la surcharge ne modifie JAMAIS le snapshot ;
//   8. la surcharge est journalisée.
//
// Ce qui est explicitement interdit et n'existe nulle part dans ce module :
// remplacer silencieusement l'adresse figée par l'adresse actuelle de la fiche
// client. L'adresse courante du client n'est même pas un paramètre ici — la
// seule alternative possible à l'adresse figée est une adresse SAISIE par un
// humain autorisé, qui en porte la responsabilité et laisse une trace.
//
// Module pur : aucune dépendance à Supabase, à React ni au réseau, pour que la
// règle soit testable sans environnement.

import { isPlausibleEmail } from "@elsatia/client-contracts";

/** Adresse de substitution saisie explicitement par un utilisateur autorisé. */
export type SurchargeDestinataire = {
  email?: string | null;
  motif?: string | null;
};

export type ResolutionDestinataire =
  | {
      ok: true;
      /** Adresse réellement utilisée pour l'envoi. */
      email: string;
      /** Vrai uniquement si l'adresse diffère réellement de celle du document. */
      surchargee: boolean;
      /** Adresse figée sur le document, conservée pour la journalisation. */
      adresseFigee: string | null;
      motif: string | null;
    }
  | { ok: false; erreur: string };

// SUBSTITUTION EFFECTUÉE (ELSATIA-ECOSYSTEM-INTEGRATION-TRAIN-V2). Le garde-fou de format
// local, écrit à titre temporaire parce que `@elsatia/client-contracts` n'était pas encore
// au train, est remplacé par le validateur partagé `isPlausibleEmail`. Il n'existe donc
// plus qu'une seule définition de « adresse plausible » dans l'écosystème.
//
// La borne de longueur est CONSERVÉE et n'est pas un doublon du validateur : 320 caractères
// est la limite d'adresse de la RFC 5321 (64 pour la partie locale, 255 pour le domaine).
// C'est une contrainte de transport, pas de forme — `isPlausibleEmail` ne la porte pas, et
// ne doit pas la porter. Le rejet définitif reste de toute façon prononcé par Brevo.
const LONGUEUR_MAX_ADRESSE = 320;

export function adresseRemisePlausible(valeur: string | null | undefined): boolean {
  const nettoyee = (valeur ?? "").trim();
  return nettoyee.length > 0 && nettoyee.length <= LONGUEUR_MAX_ADRESSE && isPlausibleEmail(nettoyee);
}

function memeAdresse(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Décide l'adresse d'envoi.
 *
 * Sans surcharge explicite, l'adresse figée est utilisée telle quelle. Avec une
 * surcharge, l'utilisateur doit être autorisé et l'adresse exploitable.
 */
export function resoudreDestinataireEnvoi(params: {
  adresseFigee: string | null;
  surcharge?: SurchargeDestinataire | null;
  peutSurcharger: boolean;
}): ResolutionDestinataire {
  const adresseFigee = params.adresseFigee?.trim() || null;
  const saisie = params.surcharge?.email?.trim() || null;
  const motif = params.surcharge?.motif?.trim() || null;

  // Aucune adresse saisie : comportement par défaut, l'adresse du document.
  if (saisie === null) {
    if (adresseFigee === null) {
      return { ok: false, erreur: "Ce document ne porte aucune adresse e-mail de destinataire." };
    }
    return { ok: true, email: adresseFigee, surchargee: false, adresseFigee, motif: null };
  }

  if (!params.peutSurcharger) {
    return {
      ok: false,
      erreur: "Votre poste ne permet pas d'envoyer ce document à une autre adresse que celle du document.",
    };
  }

  if (!adresseRemisePlausible(saisie)) {
    return { ok: false, erreur: "Cette adresse e-mail n'est pas exploitable." };
  }

  // Ressaisir l'adresse du document à l'identique n'est pas une surcharge : ni
  // avertissement dans l'interface, ni entrée de journal. Le journal ne doit
  // contenir que des écarts réels, sans quoi il devient illisible.
  if (memeAdresse(saisie, adresseFigee)) {
    return { ok: true, email: adresseFigee!, surchargee: false, adresseFigee, motif: null };
  }

  return { ok: true, email: saisie, surchargee: true, adresseFigee, motif };
}

export type TypeEnvoiDocument = "envoi_initial" | "renvoi";
export type ResultatEnvoiDocument = "succes" | "echec";

/** `action` de `public.journal_activite` réservée à cet évènement. */
export const ACTION_JOURNAL_SURCHARGE = "envoi_document_adresse_surchargee";

export type EntreeJournalSurcharge = {
  entreprise_id: string;
  utilisateur_id: string | null;
  action: string;
  ressource: string;
  ressource_id: string;
  description: string;
  metadata: Record<string, unknown>;
};

/**
 * Construit l'entrée d'audit d'une surcharge d'adresse.
 *
 * Écrite dans `public.journal_activite`, table déjà en place : cloisonnée par
 * `entreprise_id` (RLS `est_membre_actif`), en ajout seul pour les utilisateurs
 * (`update` et `delete` révoqués), lisible sous permission `gerer_parametres`.
 * Aucune migration n'est donc nécessaire pour tracer cet évènement.
 *
 * L'entrée est produite APRÈS la tentative d'envoi et porte son issue : un envoi
 * refusé par le fournisseur laisse la même trace qu'un envoi réussi. Une
 * nouvelle tentative produit une entrée supplémentaire, jamais une mise à jour
 * de la précédente — le journal est un historique, pas un état.
 */
export function construireEntreeJournalSurcharge(params: {
  entrepriseId: string;
  utilisateurId: string | null;
  typeDocument: "devis" | "facture";
  documentId: string;
  numero: string | null;
  adresseFigee: string | null;
  adresseUtilisee: string;
  motif: string | null;
  typeEnvoi: TypeEnvoiDocument;
  resultat: ResultatEnvoiDocument;
  erreur?: string | null;
}): EntreeJournalSurcharge {
  const reference = params.numero ?? params.documentId;
  const libelle = params.typeDocument === "devis" ? "Devis" : "Facture";
  const verbe = params.typeEnvoi === "renvoi" ? "renvoyé" : "envoyé";
  const issue = params.resultat === "succes" ? "" : " (échec de l'envoi)";

  return {
    entreprise_id: params.entrepriseId,
    utilisateur_id: params.utilisateurId,
    action: ACTION_JOURNAL_SURCHARGE,
    ressource: params.typeDocument,
    ressource_id: params.documentId,
    description:
      `${libelle} ${reference} ${verbe} à ${params.adresseUtilisee} au lieu de ` +
      `${params.adresseFigee ?? "(aucune adresse au document)"}${issue}`,
    metadata: {
      document: { type: params.typeDocument, id: params.documentId, numero: params.numero },
      adresse_figee: params.adresseFigee,
      adresse_utilisee: params.adresseUtilisee,
      motif: params.motif,
      type_envoi: params.typeEnvoi,
      resultat: params.resultat,
      erreur: params.resultat === "echec" ? (params.erreur ?? null) : null,
      // Rappel porté par la donnée elle-même : cette surcharge n'a modifié ni le
      // snapshot du document, ni la fiche client.
      snapshot_modifie: false,
      fiche_client_modifiee: false,
    },
  };
}

/** Avertissement affiché dès que l'adresse saisie s'écarte de celle du document. */
export function mentionEcartAdresse(adresseFigee: string | null): string {
  return adresseFigee
    ? `Cette adresse diffère de celle du document (${adresseFigee}). Le document lui-même n'est pas modifié : le PDF et l'identité imprimée restent ceux de l'émission. L'écart sera journalisé.`
    : "Ce document ne portait aucune adresse de destinataire. L'adresse saisie sera utilisée pour cet envoi seulement, et l'écart sera journalisé.";
}
