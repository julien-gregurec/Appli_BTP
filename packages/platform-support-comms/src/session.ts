import {
  estActionInterdite,
  evaluerPerimetre,
  definitionPerimetre,
  type DemandeAction,
  type PerimetreAssistance,
} from "./perimetres";
import {
  definitionMotif,
  motifPublic,
  type CategorieMotifAssistance,
} from "./motifs";

/**
 * Contrat transverse d'une session d'assistance.
 *
 * Point non négociable : une session d'assistance N'EST PAS une connexion avec le
 * compte du client. `acteurId` reste l'identité réelle de l'administrateur plateforme
 * du début à la fin ; aucun champ ne permet de « devenir » un utilisateur client.
 * `utilisateurAssisteId` est purement descriptif — la personne AVEC qui l'on travaille,
 * jamais l'identité SOUS laquelle on agit.
 */
export type SessionAssistance = {
  id: string;
  /** Identité Auth réelle de l'administrateur plateforme. Jamais celle du client. */
  acteurId: string;
  acteurEmail: string;
  acteurNom: string | null;
  entrepriseId: string;
  entrepriseNom: string;
  /** Applications explicitement sélectionnées. Jamais vide. */
  applications: readonly string[];
  /** Toutes les applications de l'entreprise (incident global, confirmation renforcée). */
  incidentGlobal: boolean;
  perimetre: PerimetreAssistance;
  motifCategorie: CategorieMotifAssistance;
  motifDetailInterne: string | null;
  ticket: string | null;
  ouverteAt: string;
  expireAt: string;
  derniereActiviteAt: string;
  termineeAt: string | null;
  termineeMotif: string | null;
  revoqueeAt: string | null;
  revoqueePar: string | null;
};

/** Politique d'inactivité, en minutes. Une session oubliée se ferme d'elle-même. */
export const INACTIVITE_MAXIMALE_MINUTES = 15;

export type RaisonRefusSession =
  | "aucune_session"
  | "justification_absente"
  | "fenetre_invalide"
  | "session_terminee"
  | "session_revoquee"
  | "session_expiree"
  | "session_inactive"
  | "entreprise_hors_perimetre"
  | "application_hors_perimetre"
  | "action_interdite"
  | "hors_ligne_interdit";

export type DecisionAssistance =
  | { autorise: true; session: SessionAssistance }
  | { autorise: false; raison: RaisonRefusSession | "perimetre"; message: string };

export type DemandeAssistance = {
  entrepriseId: string;
  applicationCode: string;
  action: DemandeAction & { code?: string };
  maintenant: Date;
  /** Une session d'assistance ne fonctionne jamais hors-ligne. */
  enLigne: boolean;
  inactiviteMaximaleMinutes?: number;
};

function minutesEcoulees(depuis: string, maintenant: Date): number {
  return (maintenant.getTime() - new Date(depuis).getTime()) / 60000;
}

/**
 * La justification est obligatoire : catégorie connue, et détail présent quand la
 * catégorie l'exige. Ce contrôle est rejoué ici, à chaque action, et pas seulement à
 * l'ouverture — une session dont le motif aurait été vidé ne doit plus rien autoriser.
 */
function justificationValide(session: SessionAssistance): boolean {
  const definition = definitionMotif(session.motifCategorie);
  if (!definition) return false;
  if (!definition.detailRequis) return true;
  return (session.motifDetailInterne ?? "").trim().length >= 10;
}

/** Une durée est valide si la fenêtre existe, est datée, et finit après son début. */
function fenetreValide(session: SessionAssistance): boolean {
  const debut = new Date(session.ouverteAt).getTime();
  const fin = new Date(session.expireAt).getTime();
  if (Number.isNaN(debut) || Number.isNaN(fin)) return false;
  return fin > debut;
}

/**
 * Décision unique, partagée par toutes les applications. Chaque application appelle
 * cette fonction avec SON code : une session ouverte sur Gestion Pro ne peut donc pas
 * ouvrir Colors ou Réserves, même si l'entreprise y est abonnée.
 *
 * L'ordre des contrôles est délibéré : l'état de la session d'abord (une session morte
 * ne doit jamais être analysée plus loin), puis le tenant, puis l'application, puis
 * les interdits absolus, puis le périmètre.
 */
export function evaluerSessionAssistance(
  session: SessionAssistance | null,
  demande: DemandeAssistance,
): DecisionAssistance {
  if (!demande.enLigne) {
    return {
      autorise: false,
      raison: "hors_ligne_interdit",
      message: "Une session d’assistance ELSATIA ne fonctionne pas hors connexion",
    };
  }
  if (!session) {
    return { autorise: false, raison: "aucune_session", message: "Aucune session d’assistance ouverte" };
  }
  // Une session sans justification exploitable, ou dont la fenêtre est incohérente, est
  // une session que personne ne saurait défendre après coup. On la refuse avant même de
  // regarder si elle est encore vivante : mieux vaut une session inutilisable qu'un accès
  // dont l'audit ne dirait ni pourquoi ni jusqu'à quand.
  const justification = justificationValide(session);
  if (!justification) {
    return {
      autorise: false,
      raison: "justification_absente",
      message: "Session d’assistance sans motif exploitable",
    };
  }
  if (!fenetreValide(session)) {
    return {
      autorise: false,
      raison: "fenetre_invalide",
      message: "Fenêtre de session d’assistance incohérente",
    };
  }
  if (session.revoqueeAt !== null) {
    return { autorise: false, raison: "session_revoquee", message: "Session d’assistance révoquée" };
  }
  if (session.termineeAt !== null) {
    return { autorise: false, raison: "session_terminee", message: "Session d’assistance terminée" };
  }
  if (new Date(session.expireAt).getTime() <= demande.maintenant.getTime()) {
    return { autorise: false, raison: "session_expiree", message: "Session d’assistance expirée" };
  }
  const inactiviteMax = demande.inactiviteMaximaleMinutes ?? INACTIVITE_MAXIMALE_MINUTES;
  if (minutesEcoulees(session.derniereActiviteAt, demande.maintenant) >= inactiviteMax) {
    return {
      autorise: false,
      raison: "session_inactive",
      message: "Session d’assistance fermée pour inactivité",
    };
  }
  if (session.entrepriseId !== demande.entrepriseId) {
    return {
      autorise: false,
      raison: "entreprise_hors_perimetre",
      message: "Cette session d’assistance ne vise pas cette entreprise",
    };
  }
  if (!session.applications.includes(demande.applicationCode)) {
    return {
      autorise: false,
      raison: "application_hors_perimetre",
      message: "Cette application n’a pas été sélectionnée à l’ouverture de la session",
    };
  }
  if (demande.action.code && estActionInterdite(demande.action.code)) {
    return {
      autorise: false,
      raison: "action_interdite",
      message: "Action interdite pendant une session d’assistance",
    };
  }
  const perimetre = evaluerPerimetre(session.perimetre, demande.action);
  if (!perimetre.autorise) {
    return { autorise: false, raison: "perimetre", message: perimetre.message };
  }
  return { autorise: true, session };
}

// ── Bandeau permanent ─────────────────────────────────────────────────────────

export type BandeauAssistance = {
  titre: string;
  entrepriseNom: string;
  applicationNom: string;
  /** Motif PUBLIC : le bandeau est visible par le client comme par l'opérateur. */
  motif: string;
  debutIso: string;
  /** Fin de fenêtre, pour le décompte côté navigateur. */
  expireIso: string;
  /** Minutes restantes, jamais négatif. */
  minutesRestantes: number;
  tempsRestantLibelle: string;
  expiree: boolean;
  actionQuitter: string;
  acteurEmail: string;
};

export function formaterTempsRestant(minutes: number): string {
  const total = Math.max(0, Math.ceil(minutes));
  if (total === 0) return "expirée";
  if (total < 60) return `${total} min`;
  const heures = Math.floor(total / 60);
  const reste = total % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

export function construireBandeauAssistance(
  session: SessionAssistance,
  applicationNom: string,
  maintenant: Date,
): BandeauAssistance {
  const restant = (new Date(session.expireAt).getTime() - maintenant.getTime()) / 60000;
  return {
    titre: "Session d’assistance ELSATIA",
    entrepriseNom: session.entrepriseNom,
    applicationNom,
    motif: motifPublic(session.motifCategorie),
    debutIso: session.ouverteAt,
    expireIso: session.expireAt,
    minutesRestantes: Math.max(0, restant),
    tempsRestantLibelle: formaterTempsRestant(restant),
    expiree: restant <= 0,
    actionQuitter: "Quitter l’assistance",
    acteurEmail: session.acteurEmail,
  };
}

// ── Ouverture ─────────────────────────────────────────────────────────────────

export type DemandeOuverture = {
  entrepriseId: string;
  applications: readonly string[];
  applicationsAbonnees: readonly string[];
  incidentGlobal: boolean;
  perimetre: string;
  dureeMinutes: number;
  aal: string;
  confirmationRenforcee: boolean;
};

export type ResultatOuverture =
  | { valide: true; applications: string[]; perimetre: PerimetreAssistance; dureeMinutes: number }
  | { valide: false; erreur: string };

/**
 * Contrôles d'ouverture communs à toutes les applications. Les mêmes règles sont
 * réappliquées côté serveur par la RPC : ce module sert à afficher une erreur utile
 * avant l'aller-retour, jamais à remplacer le contrôle serveur.
 */
export function validerOuvertureAssistance(demande: DemandeOuverture): ResultatOuverture {
  if (demande.aal !== "aal2") {
    return { valide: false, erreur: "Authentification forte (MFA) requise pour ouvrir une session d’assistance" };
  }
  const definition = definitionPerimetre(demande.perimetre);
  if (!definition) return { valide: false, erreur: "Périmètre d’assistance inconnu" };

  const demandees = [...new Set(demande.applications)];
  if (demandees.length === 0) {
    return { valide: false, erreur: "Sélectionnez au moins une application" };
  }
  const horsAbonnement = demandees.filter((code) => !demande.applicationsAbonnees.includes(code));
  if (horsAbonnement.length > 0) {
    return {
      valide: false,
      erreur: `Cette entreprise n’est pas abonnée à : ${horsAbonnement.join(", ")}`,
    };
  }
  // « Toutes les applications » n'est pas un raccourci de confort : c'est un mode
  // d'incident global, qui exige la confirmation renforcée au même titre que le
  // périmètre exceptionnel.
  const toutes = demandees.length === demande.applicationsAbonnees.length && demande.applicationsAbonnees.length > 1;
  if (toutes && !demande.incidentGlobal) {
    return {
      valide: false,
      erreur: "Sélectionner toutes les applications relève d’un incident global : cochez-le explicitement",
    };
  }
  if ((demande.incidentGlobal || definition.confirmationRenforcee) && !demande.confirmationRenforcee) {
    return { valide: false, erreur: "Confirmation renforcée requise" };
  }
  if (!Number.isInteger(demande.dureeMinutes) || demande.dureeMinutes <= 0) {
    return { valide: false, erreur: "Durée invalide" };
  }
  if (demande.dureeMinutes > definition.dureeMaximaleMinutes) {
    return {
      valide: false,
      erreur: `Le périmètre « ${definition.libelle} » est limité à ${definition.dureeMaximaleMinutes} minutes`,
    };
  }
  return { valide: true, applications: demandees.sort(), perimetre: definition.cle, dureeMinutes: demande.dureeMinutes };
}

// ── Fermeture automatique ─────────────────────────────────────────────────────

export type EvenementFermeture =
  | "expiration"
  | "deconnexion"
  | "changement_de_compte"
  | "revocation"
  | "inactivite"
  | "retrait_role_plateforme"
  | "sortie_explicite";

/**
 * Une session fermée ne se rouvre jamais : la relecture d'un identifiant de session
 * expirée doit produire une nouvelle session, avec un nouveau motif et une nouvelle
 * confirmation MFA. Cette fonction existe pour que la règle soit testée, pas devinée.
 */
export function sessionReutilisable(session: SessionAssistance, maintenant: Date): boolean {
  return (
    session.termineeAt === null &&
    session.revoqueeAt === null &&
    new Date(session.expireAt).getTime() > maintenant.getTime()
  );
}
