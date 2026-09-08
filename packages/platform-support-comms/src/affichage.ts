import type { TypeCommunication } from "./consentement";

/** Affichage à la connexion, acquittement et fréquence (§12). */

export type ModeAffichage =
  | "banniere"
  | "carte_tableau_de_bord"
  | "modale"
  | "bloquant"
  | "centre_notifications";

export type FrequenceAffichage =
  | "une_seule_fois"
  | "rappel_periodique"
  | "jusqu_a_acquittement"
  | "permanent";

/**
 * Seuls ces types peuvent bloquer l'accès. La liste est fermée et testée : une
 * communication commerciale ne devient jamais bloquante, quelle que soit sa priorité.
 */
export const TYPES_BLOQUANTS_AUTORISES: readonly TypeCommunication[] = [
  "securite",
  "conditions",
  "interruption_planifiee",
  "action_requise",
];

export function modeAffichageAutorise(type: TypeCommunication, mode: ModeAffichage): boolean {
  if (mode !== "bloquant") return true;
  return TYPES_BLOQUANTS_AUTORISES.includes(type);
}

export type EtatLecture = "non_vu" | "vu" | "ignore" | "acquitte" | "clique";

export type LectureCommunication = {
  communicationId: string;
  utilisateurId: string;
  etat: EtatLecture;
  vuAt: string | null;
  acquitteAt: string | null;
  cliqueAt: string | null;
  /** Nombre d'affichages déjà servis (utile pour `rappel_periodique`). */
  affichages: number;
  dernierAffichageAt: string | null;
  sessionId: string | null;
  appareil: string | null;
};

export const INTERVALLE_RAPPEL_HEURES = 24;

export type DecisionAffichage =
  | { afficher: true; mode: ModeAffichage }
  | { afficher: false; raison: RaisonNonAffichage };

export type RaisonNonAffichage =
  | "hors_fenetre"
  | "deja_vu"
  | "deja_acquitte"
  | "rappel_trop_recent"
  | "consentement_refuse";

/**
 * Décide si une communication doit s'afficher MAINTENANT pour CE lecteur.
 *
 * Le point du §12 « ne pas afficher la même publicité à chaque navigation » est traité
 * ici et nulle part ailleurs : `une_seule_fois` s'arrête au premier affichage,
 * `rappel_periodique` respecte un intervalle, `jusqu_a_acquittement` insiste tant que
 * l'utilisateur n'a pas confirmé — et seul un type autorisé peut être bloquant.
 */
export function evaluerAffichage(entree: {
  type: TypeCommunication;
  mode: ModeAffichage;
  frequence: FrequenceAffichage;
  debutAt: string;
  finAt: string | null;
  lecture: LectureCommunication | null;
  consentementAccorde: boolean;
  maintenant: Date;
  intervalleRappelHeures?: number;
}): DecisionAffichage {
  const t = entree.maintenant.getTime();
  if (t < new Date(entree.debutAt).getTime()) return { afficher: false, raison: "hors_fenetre" };
  if (entree.finAt !== null && t >= new Date(entree.finAt).getTime()) {
    return { afficher: false, raison: "hors_fenetre" };
  }
  if (!entree.consentementAccorde) return { afficher: false, raison: "consentement_refuse" };

  const mode = modeAffichageAutorise(entree.type, entree.mode) ? entree.mode : "banniere";
  const lecture = entree.lecture;
  if (lecture === null) return { afficher: true, mode };

  if (lecture.acquitteAt !== null) return { afficher: false, raison: "deja_acquitte" };

  switch (entree.frequence) {
    case "une_seule_fois":
      return lecture.affichages > 0
        ? { afficher: false, raison: "deja_vu" }
        : { afficher: true, mode };
    case "jusqu_a_acquittement":
      // `ignore` ne vaut pas acquittement : le message reste dû tant qu'il n'est pas confirmé.
      return { afficher: true, mode };
    case "rappel_periodique": {
      if (lecture.dernierAffichageAt === null) return { afficher: true, mode };
      const intervalle = (entree.intervalleRappelHeures ?? INTERVALLE_RAPPEL_HEURES) * 3600000;
      const ecoule = t - new Date(lecture.dernierAffichageAt).getTime();
      return ecoule >= intervalle
        ? { afficher: true, mode }
        : { afficher: false, raison: "rappel_trop_recent" };
    }
    case "permanent":
      return { afficher: true, mode };
  }
}

/** Transitions d'état de lecture. Un acquittement ne se défait pas. */
export function appliquerEvenementLecture(
  lecture: LectureCommunication,
  evenement: "affichage" | "ignore" | "acquittement" | "clic",
  maintenant: Date,
): LectureCommunication {
  const iso = maintenant.toISOString();
  switch (evenement) {
    case "affichage":
      return {
        ...lecture,
        etat: lecture.etat === "non_vu" ? "vu" : lecture.etat,
        vuAt: lecture.vuAt ?? iso,
        affichages: lecture.affichages + 1,
        dernierAffichageAt: iso,
      };
    case "ignore":
      return lecture.acquitteAt !== null ? lecture : { ...lecture, etat: "ignore" };
    case "acquittement":
      return lecture.acquitteAt !== null
        ? lecture
        : { ...lecture, etat: "acquitte", acquitteAt: iso, vuAt: lecture.vuAt ?? iso };
    case "clic":
      return { ...lecture, etat: "clique", cliqueAt: lecture.cliqueAt ?? iso, vuAt: lecture.vuAt ?? iso };
  }
}
