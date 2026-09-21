import { motifPublic } from "./motifs";
import type { SessionAssistance } from "./session";

/**
 * Notification de l'entreprise assistée (§7).
 *
 * Le client voit TOUJOURS qu'une session a eu lieu, mais ne voit jamais le motif
 * interne : `motifPublic` est une catégorie neutre, et le détail libre saisi par
 * l'opérateur n'est jamais recopié ici. C'est la seule façon de notifier sans
 * révéler qu'un contrôle de sécurité ou un signalement est en cours.
 */

export type CanalNotification = "application" | "email" | "centre_securite";

export type DestinataireAssistance = {
  utilisateurId: string;
  email: string | null;
  /** `proprietaire` = gérant/créateur, `administrateur` = droit `gerer_utilisateurs`. */
  qualite: "proprietaire" | "administrateur" | "responsable_configure";
};

export type NotificationAssistance = {
  type: "assistance_ouverte" | "assistance_terminee";
  titre: string;
  message: string;
  niveau: "information";
  destinataires: readonly DestinataireAssistance[];
  canaux: readonly CanalNotification[];
  sessionId: string;
  entrepriseId: string;
  applicationCodes: readonly string[];
};

function formaterDateHeure(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${heure}`;
}

function listerApplications(noms: readonly string[]): string {
  if (noms.length === 0) return "votre espace ELSATIA";
  if (noms.length === 1) return noms[0];
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

/**
 * Une notification d'ouverture est due à CHAQUE ouverture, sans exception et sans
 * possibilité de désactivation : c'est une information de sécurité contractuelle,
 * pas une communication de service (voir `consentement.ts`).
 */
export function notificationOuvertureAssistance(
  session: SessionAssistance,
  nomsApplications: readonly string[],
  destinataires: readonly DestinataireAssistance[],
  canaux: readonly CanalNotification[] = ["application", "centre_securite"],
): NotificationAssistance {
  return {
    type: "assistance_ouverte",
    titre: "Accès de l’assistance ELSATIA",
    message:
      `L’assistance ELSATIA a accédé à votre espace ${listerApplications(nomsApplications)} ` +
      `le ${formaterDateHeure(session.ouverteAt)} dans le cadre de : ${motifPublic(session.motifCategorie)}.`,
    niveau: "information",
    destinataires,
    canaux,
    sessionId: session.id,
    entrepriseId: session.entrepriseId,
    applicationCodes: session.applications,
  };
}

export function notificationFermetureAssistance(
  session: SessionAssistance,
  finIso: string,
  destinataires: readonly DestinataireAssistance[],
  canaux: readonly CanalNotification[] = ["application", "centre_securite"],
): NotificationAssistance {
  return {
    type: "assistance_terminee",
    titre: "Fin de la session d’assistance ELSATIA",
    message:
      `La session d’assistance ELSATIA ouverte le ${formaterDateHeure(session.ouverteAt)} ` +
      `s’est terminée le ${formaterDateHeure(finIso)}.`,
    niveau: "information",
    destinataires,
    canaux,
    sessionId: session.id,
    entrepriseId: session.entrepriseId,
    applicationCodes: session.applications,
  };
}

/**
 * Destinataires minimaux : le propriétaire et les administrateurs de l'entreprise,
 * plus les responsables explicitement configurés. La liste ne peut jamais être vide
 * en pratique — si elle l'est, l'appelant doit remonter l'anomalie plutôt que de
 * considérer la notification comme faite.
 */
export function destinatairesAssistance(entree: {
  proprietaires: readonly { utilisateurId: string; email: string | null }[];
  administrateurs: readonly { utilisateurId: string; email: string | null }[];
  responsablesConfigures?: readonly { utilisateurId: string; email: string | null }[];
}): DestinataireAssistance[] {
  const vus = new Set<string>();
  const sortie: DestinataireAssistance[] = [];
  const ajouter = (
    liste: readonly { utilisateurId: string; email: string | null }[],
    qualite: DestinataireAssistance["qualite"],
  ) => {
    for (const p of liste) {
      if (vus.has(p.utilisateurId)) continue;
      vus.add(p.utilisateurId);
      sortie.push({ utilisateurId: p.utilisateurId, email: p.email, qualite });
    }
  };
  ajouter(entree.proprietaires, "proprietaire");
  ajouter(entree.administrateurs, "administrateur");
  ajouter(entree.responsablesConfigures ?? [], "responsable_configure");
  return sortie;
}

// ── Historique consultable par le client ──────────────────────────────────────

/**
 * Ce que le client voit dans son centre de sécurité. En lecture seule : ni le client
 * ni la plateforme ne peuvent réécrire cet historique (contrainte portée par la base,
 * ce type ne fait que refléter les champs exposés).
 */
export type LigneHistoriqueClient = {
  sessionId: string;
  applications: readonly string[];
  debut: string;
  fin: string | null;
  statut: "en_cours" | "terminee" | "expiree" | "revoquee";
  categorieMotif: string;
  /** Identité ou service ELSATIA autorisé — jamais un identifiant technique brut. */
  intervenant: string;
  actionsSensibles: readonly { action: string; domaine: string | null; survenuAt: string }[];
};

export function statutHistorique(
  session: Pick<SessionAssistance, "termineeAt" | "revoqueeAt" | "expireAt">,
  maintenant: Date,
): LigneHistoriqueClient["statut"] {
  if (session.revoqueeAt !== null) return "revoquee";
  if (session.termineeAt !== null) return "terminee";
  if (new Date(session.expireAt).getTime() <= maintenant.getTime()) return "expiree";
  return "en_cours";
}

/**
 * L'intervenant présenté au client : le nom du collaborateur s'il est renseigné,
 * sinon le service. On ne publie jamais l'email interne ni l'UID.
 */
export function intervenantPublic(session: Pick<SessionAssistance, "acteurNom">): string {
  const nom = (session.acteurNom ?? "").trim();
  return nom === "" ? "Assistance ELSATIA" : `Assistance ELSATIA — ${nom}`;
}
