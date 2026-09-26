/**
 * Périmètres d'une session d'assistance : le moindre privilège, exprimé une seule fois.
 *
 * Trois notions distinctes, volontairement séparées :
 *   1. le PÉRIMÈTRE (`lecture_seule` → `assistance_etendue`) borne les familles
 *      d'actions autorisées ;
 *   2. les DOMAINES SENSIBLES ajoutent une contrainte transverse : certains domaines
 *      ne sont lisibles qu'à partir d'un certain périmètre, et écrivables jamais ou
 *      seulement sous confirmation renforcée ;
 *   3. les ACTIONS ABSOLUMENT INTERDITES ne dépendent d'aucun périmètre : aucune
 *      session d'assistance, même « étendue », ne les autorise.
 */

export type PerimetreAssistance =
  | "lecture_seule"
  | "diagnostic"
  | "configuration"
  | "correction_limitee"
  | "assistance_etendue";

/** Familles d'actions, indépendantes de l'application. */
export type FamilleAction =
  | "lire"
  | "diagnostiquer"
  | "configurer"
  | "corriger"
  | "exporter"
  | "supprimer"
  | "administrer_roles"
  | "modifier_abonnement";

export type DefinitionPerimetre = {
  cle: PerimetreAssistance;
  libelle: string;
  description: string;
  familles: readonly FamilleAction[];
  /** Durée maximale, en minutes, qu'une session de ce périmètre peut demander. */
  dureeMaximaleMinutes: number;
  /** Une confirmation renforcée (seconde saisie explicite) est exigée à l'ouverture. */
  confirmationRenforcee: boolean;
};

export const PERIMETRES_ASSISTANCE: readonly DefinitionPerimetre[] = [
  {
    cle: "lecture_seule",
    libelle: "Lecture seule",
    description: "Consulter l’espace pour comprendre. Aucune écriture possible.",
    familles: ["lire"],
    dureeMaximaleMinutes: 240,
    confirmationRenforcee: false,
  },
  {
    cle: "diagnostic",
    libelle: "Diagnostic",
    description:
      "Lecture, plus les vérifications techniques (état de synchronisation, journaux applicatifs). Aucune donnée métier modifiée.",
    familles: ["lire", "diagnostiquer"],
    dureeMaximaleMinutes: 240,
    confirmationRenforcee: false,
  },
  {
    cle: "configuration",
    libelle: "Configuration",
    description: "Corriger un paramétrage (postes, droits d’un poste, options). Pas de donnée métier.",
    familles: ["lire", "diagnostiquer", "configurer"],
    dureeMaximaleMinutes: 120,
    confirmationRenforcee: false,
  },
  {
    cle: "correction_limitee",
    libelle: "Correction limitée",
    description: "Corriger une donnée métier précise à la demande du client. Ni suppression, ni export de masse.",
    familles: ["lire", "diagnostiquer", "configurer", "corriger"],
    dureeMaximaleMinutes: 60,
    confirmationRenforcee: false,
  },
  {
    cle: "assistance_etendue",
    libelle: "Assistance étendue (exceptionnelle)",
    description:
      "Réservée à un incident majeur : ajoute export et suppression assistée. Confirmation renforcée obligatoire, durée courte.",
    familles: ["lire", "diagnostiquer", "configurer", "corriger", "exporter", "supprimer"],
    dureeMaximaleMinutes: 60,
    confirmationRenforcee: true,
  },
];

export function definitionPerimetre(cle: string): DefinitionPerimetre | null {
  return PERIMETRES_ASSISTANCE.find((p) => p.cle === cle) ?? null;
}

/**
 * `administrer_roles` et `modifier_abonnement` n'appartiennent à AUCUN périmètre
 * d'assistance : ces actions relèvent de l'administration plateforme sur son propre
 * écran (avec AAL2 et journal dédié), jamais d'une session ouverte « dans » l'espace
 * du client. Les lister ici documente l'exclusion au lieu de la laisser implicite.
 */
export const FAMILLES_HORS_ASSISTANCE: readonly FamilleAction[] = [
  "administrer_roles",
  "modifier_abonnement",
];

// ── Domaines sensibles ────────────────────────────────────────────────────────

export type DomaineSensible =
  | "factures"
  | "paiements"
  | "donnees_salaries"
  | "notes_frais"
  | "documents"
  | "photos"
  | "donnees_personnelles"
  | "exports"
  | "suppression"
  | "abonnement"
  | "remises"
  | "roles"
  | "securite";

export type ReglesDomaine = {
  domaine: DomaineSensible;
  libelle: string;
  /** Périmètre minimal permettant de LIRE ce domaine. */
  lectureDes: PerimetreAssistance;
  /** Périmètre minimal permettant d'ÉCRIRE, ou `null` si l'écriture est toujours refusée. */
  ecritureDes: PerimetreAssistance | null;
  /** Une confirmation renforcée par action est exigée, même dans le périmètre requis. */
  confirmationRenforcee: boolean;
};

const ORDRE_PERIMETRES: readonly PerimetreAssistance[] = [
  "lecture_seule",
  "diagnostic",
  "configuration",
  "correction_limitee",
  "assistance_etendue",
];

function rang(perimetre: PerimetreAssistance): number {
  return ORDRE_PERIMETRES.indexOf(perimetre);
}

export const DOMAINES_SENSIBLES: readonly ReglesDomaine[] = [
  // Une facture émise est un document comptable : jamais modifiable en assistance.
  { domaine: "factures", libelle: "Factures", lectureDes: "diagnostic", ecritureDes: null, confirmationRenforcee: true },
  { domaine: "paiements", libelle: "Paiements et coordonnées bancaires", lectureDes: "assistance_etendue", ecritureDes: null, confirmationRenforcee: true },
  { domaine: "donnees_salaries", libelle: "Données salariés et paie", lectureDes: "correction_limitee", ecritureDes: null, confirmationRenforcee: true },
  { domaine: "notes_frais", libelle: "Notes de frais", lectureDes: "diagnostic", ecritureDes: "correction_limitee", confirmationRenforcee: true },
  { domaine: "documents", libelle: "Documents", lectureDes: "diagnostic", ecritureDes: "correction_limitee", confirmationRenforcee: true },
  { domaine: "photos", libelle: "Photos et médias terrain", lectureDes: "diagnostic", ecritureDes: "correction_limitee", confirmationRenforcee: true },
  { domaine: "donnees_personnelles", libelle: "Données personnelles", lectureDes: "correction_limitee", ecritureDes: "assistance_etendue", confirmationRenforcee: true },
  { domaine: "exports", libelle: "Exports de masse", lectureDes: "assistance_etendue", ecritureDes: "assistance_etendue", confirmationRenforcee: true },
  { domaine: "suppression", libelle: "Suppression de données", lectureDes: "correction_limitee", ecritureDes: "assistance_etendue", confirmationRenforcee: true },
  // Les trois domaines suivants ne s'exercent QUE depuis l'administration plateforme.
  { domaine: "abonnement", libelle: "Abonnement", lectureDes: "lecture_seule", ecritureDes: null, confirmationRenforcee: true },
  { domaine: "remises", libelle: "Remises commerciales", lectureDes: "diagnostic", ecritureDes: null, confirmationRenforcee: true },
  { domaine: "roles", libelle: "Rôles et habilitations", lectureDes: "diagnostic", ecritureDes: null, confirmationRenforcee: true },
  { domaine: "securite", libelle: "Sécurité (MFA, sessions, clés)", lectureDes: "assistance_etendue", ecritureDes: null, confirmationRenforcee: true },
];

export function reglesDomaine(domaine: string): ReglesDomaine | null {
  return DOMAINES_SENSIBLES.find((d) => d.domaine === domaine) ?? null;
}

// ── Interdits absolus ─────────────────────────────────────────────────────────

/**
 * Aucune session d'assistance, quel que soit son périmètre, ne peut faire cela.
 * La liste est fermée et testée : l'ajouter à un périmètre ne suffirait pas.
 */
export type ActionInterdite =
  | "afficher_secret"
  | "recuperer_mot_de_passe"
  | "desactiver_audit"
  | "supprimer_historique_assistance"
  | "modifier_facture_emise"
  | "contourner_rls"
  | "acceder_autre_entreprise";

export const ACTIONS_INTERDITES: readonly ActionInterdite[] = [
  "afficher_secret",
  "recuperer_mot_de_passe",
  "desactiver_audit",
  "supprimer_historique_assistance",
  "modifier_facture_emise",
  "contourner_rls",
  "acceder_autre_entreprise",
];

export function estActionInterdite(action: string): action is ActionInterdite {
  return (ACTIONS_INTERDITES as readonly string[]).includes(action);
}

// ── Décision ──────────────────────────────────────────────────────────────────

export type DemandeAction = {
  famille: FamilleAction;
  /** Domaine sensible touché, s'il y en a un. */
  domaine?: DomaineSensible | null;
  /** L'appelant a-t-il déjà fourni la confirmation renforcée pour cette action ? */
  confirmationRenforceeFournie?: boolean;
};

export type DecisionPerimetre =
  | { autorise: true }
  | { autorise: false; raison: RaisonRefusPerimetre; message: string };

export type RaisonRefusPerimetre =
  | "perimetre_inconnu"
  | "famille_hors_assistance"
  | "famille_hors_perimetre"
  | "domaine_inconnu"
  | "domaine_lecture_refusee"
  | "domaine_ecriture_refusee"
  | "confirmation_renforcee_requise";

const FAMILLES_ECRITURE: readonly FamilleAction[] = ["configurer", "corriger", "supprimer"];

/**
 * Décide si une action est dans le périmètre. Cette fonction ne connaît ni la session,
 * ni l'application : elle ne répond qu'à « ce périmètre permet-il cette action ? ».
 * `evaluerSessionAssistance` l'appelle après avoir vérifié la session elle-même.
 */
export function evaluerPerimetre(
  perimetre: PerimetreAssistance,
  demande: DemandeAction,
): DecisionPerimetre {
  const definition = definitionPerimetre(perimetre);
  if (!definition) {
    return { autorise: false, raison: "perimetre_inconnu", message: "Périmètre d’assistance inconnu" };
  }
  if (FAMILLES_HORS_ASSISTANCE.includes(demande.famille)) {
    return {
      autorise: false,
      raison: "famille_hors_assistance",
      message: "Cette action relève de l’administration plateforme, pas d’une session d’assistance",
    };
  }
  if (!definition.familles.includes(demande.famille)) {
    return {
      autorise: false,
      raison: "famille_hors_perimetre",
      message: `Le périmètre « ${definition.libelle} » n’autorise pas cette action`,
    };
  }

  const domaine = demande.domaine ?? null;
  if (domaine === null) return { autorise: true };

  const regles = reglesDomaine(domaine);
  if (!regles) {
    return { autorise: false, raison: "domaine_inconnu", message: "Domaine sensible inconnu" };
  }

  const ecriture = FAMILLES_ECRITURE.includes(demande.famille) || demande.famille === "exporter";
  if (!ecriture) {
    if (rang(perimetre) < rang(regles.lectureDes)) {
      return {
        autorise: false,
        raison: "domaine_lecture_refusee",
        message: `La consultation « ${regles.libelle} » exige au minimum le périmètre « ${definitionPerimetre(regles.lectureDes)?.libelle}»`,
      };
    }
  } else {
    if (regles.ecritureDes === null) {
      return {
        autorise: false,
        raison: "domaine_ecriture_refusee",
        message: `« ${regles.libelle} » ne se modifie jamais pendant une session d’assistance`,
      };
    }
    if (rang(perimetre) < rang(regles.ecritureDes)) {
      return {
        autorise: false,
        raison: "domaine_ecriture_refusee",
        message: `La modification « ${regles.libelle} » exige au minimum le périmètre « ${definitionPerimetre(regles.ecritureDes)?.libelle}»`,
      };
    }
  }

  if (regles.confirmationRenforcee && demande.confirmationRenforceeFournie !== true) {
    return {
      autorise: false,
      raison: "confirmation_renforcee_requise",
      message: `« ${regles.libelle} » exige une confirmation renforcée`,
    };
  }
  return { autorise: true };
}

/** Durées proposées à l'opérateur, en minutes. La durée libre reste bornée par le périmètre. */
export const DUREES_ASSISTANCE_MINUTES: readonly number[] = [15, 30, 60];

export const DUREE_ASSISTANCE_MINIMALE_MINUTES = 5;

export type ResultatDuree =
  | { valide: true; minutes: number }
  | { valide: false; erreur: string };

export function validerDureeAssistance(
  perimetre: PerimetreAssistance,
  minutes: number,
): ResultatDuree {
  const definition = definitionPerimetre(perimetre);
  if (!definition) return { valide: false, erreur: "Périmètre d’assistance inconnu" };
  if (!Number.isInteger(minutes)) return { valide: false, erreur: "Durée invalide" };
  if (minutes < DUREE_ASSISTANCE_MINIMALE_MINUTES) {
    return { valide: false, erreur: `Durée minimale : ${DUREE_ASSISTANCE_MINIMALE_MINUTES} minutes` };
  }
  if (minutes > definition.dureeMaximaleMinutes) {
    return {
      valide: false,
      erreur: `Le périmètre « ${definition.libelle} » est limité à ${definition.dureeMaximaleMinutes} minutes`,
    };
  }
  return { valide: true, minutes };
}
