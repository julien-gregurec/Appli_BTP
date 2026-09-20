/**
 * Contrat commun d'une DÉCISION D'ACCÈS AVEC MOTIF (v1) — types et règles pures.
 *
 * Aujourd'hui `a_acces_application` renvoie un booléen : suspendu, désactivé, invité, sans rôle,
 * sans droit d'usage et expiré y sont indiscernables, et chaque application reconstitue
 * (ou devine) la raison de son côté. Ce module fixe le vocabulaire, l'ordre de priorité et la
 * traduction en écran / statut HTTP / portée de déconnexion, AVANT que la RPC
 * `decision_acces_application` n'existe. Il n'appelle rien et ne change aucun comportement.
 *
 * Spécification complète : docs/qualification/ELSATIA_APPLICATION_ACCESS_CONVERGENCE_V1.md §8.
 */

export const VERSION_CONTRAT_DECISION_ACCES = 1 as const;

/**
 * Décisions que la base peut rendre, dans l'ORDRE D'ÉVALUATION : la première qui s'applique gagne.
 *
 * L'ordre n'est pas cosmétique. Les états qui tiennent à la PERSONNE (session, appartenance)
 * passent avant ceux qui tiennent à l'ENTREPRISE (abonnement), pour ne jamais révéler l'état
 * commercial d'une entreprise à quelqu'un qui n'en est pas membre actif.
 */
export const DECISIONS_ACCES = [
  "non_authentifie",
  "erreur_configuration",
  "autorise", // bypass administrateur plateforme inclus (voir spécification §8.3)
  "sans_organisation",
  "invitation_en_attente",
  "validation_en_attente",
  "utilisateur_desactive",
  "entreprise_inactive",
  "abonnement_suspendu",
  "essai_expire",
  "application_non_incluse",
  "sans_habilitation",
  "sans_role",
] as const;
export type DecisionAcces = (typeof DECISIONS_ACCES)[number];

/**
 * Décisions produites CÔTÉ CLIENT, jamais par la base :
 *  - `indisponible` : la RPC n'a pas répondu (délai, réseau). Ce n'est JAMAIS un refus : on ne
 *    déconnecte pas, on ne dit pas « pas d'entreprise », on invite à réessayer ;
 *  - `refus_non_qualifie` : adaptateur transitoire d'un booléen `false` de l'ancienne RPC.
 */
export type DecisionAccesClient = DecisionAcces | "indisponible" | "refus_non_qualifie";

export type ActionSuggeree =
  | "aucune"
  | "se_connecter"
  | "creer_ou_rejoindre_entreprise" // GP uniquement
  | "ouvrir_compte_elsatia" // toutes les autres applications
  | "accepter_invitation"
  | "attendre_validation"
  | "contacter_administrateur"
  | "voir_abonnement"
  | "regulariser_abonnement" // réservée aux administrateurs de l'entreprise
  | "reessayer";

export type EcranAcces =
  | "application"
  | "login"
  | "sans_organisation"
  | "invitation"
  | "attente_validation"
  | "compte_desactive"
  | "entreprise_inactive"
  | "abonnement_suspendu"
  | "essai_expire"
  | "abonnement_requis"
  | "acces_refuse"
  | "erreur_technique";

/** Statuts HTTP d'une API : 401 non authentifié, 403 interdit, 423 droit acquis mais verrouillé, 5xx panne. */
export type StatutHttpAcces = 200 | 401 | 403 | 423 | 500 | 503;

export type RegleDecision = {
  statutHttp: StatutHttpAcces;
  ecran: EcranAcces;
  action: ActionSuggeree;
  /** Le nom de l'entreprise peut-il figurer dans l'écran ? Seulement si l'appelant en est membre (quel que soit le statut). */
  nomEntrepriseExposable: boolean;
  /** Peut-on relancer la même requête telle quelle ? */
  reessayable: boolean;
};

export const REGLES_DECISION: Record<DecisionAccesClient, RegleDecision> = {
  autorise: { statutHttp: 200, ecran: "application", action: "aucune", nomEntrepriseExposable: true, reessayable: false },
  non_authentifie: { statutHttp: 401, ecran: "login", action: "se_connecter", nomEntrepriseExposable: false, reessayable: false },
  sans_organisation: { statutHttp: 403, ecran: "sans_organisation", action: "ouvrir_compte_elsatia", nomEntrepriseExposable: false, reessayable: false },
  invitation_en_attente: { statutHttp: 403, ecran: "invitation", action: "accepter_invitation", nomEntrepriseExposable: true, reessayable: false },
  validation_en_attente: { statutHttp: 403, ecran: "attente_validation", action: "attendre_validation", nomEntrepriseExposable: true, reessayable: false },
  utilisateur_desactive: { statutHttp: 403, ecran: "compte_desactive", action: "contacter_administrateur", nomEntrepriseExposable: true, reessayable: false },
  entreprise_inactive: { statutHttp: 423, ecran: "entreprise_inactive", action: "contacter_administrateur", nomEntrepriseExposable: true, reessayable: false },
  abonnement_suspendu: { statutHttp: 423, ecran: "abonnement_suspendu", action: "regulariser_abonnement", nomEntrepriseExposable: true, reessayable: false },
  essai_expire: { statutHttp: 423, ecran: "essai_expire", action: "voir_abonnement", nomEntrepriseExposable: true, reessayable: false },
  application_non_incluse: { statutHttp: 403, ecran: "abonnement_requis", action: "voir_abonnement", nomEntrepriseExposable: true, reessayable: false },
  sans_habilitation: { statutHttp: 403, ecran: "acces_refuse", action: "contacter_administrateur", nomEntrepriseExposable: true, reessayable: false },
  sans_role: { statutHttp: 403, ecran: "acces_refuse", action: "contacter_administrateur", nomEntrepriseExposable: true, reessayable: false },
  erreur_configuration: { statutHttp: 500, ecran: "erreur_technique", action: "reessayer", nomEntrepriseExposable: false, reessayable: false },
  indisponible: { statutHttp: 503, ecran: "erreur_technique", action: "reessayer", nomEntrepriseExposable: false, reessayable: true },
  refus_non_qualifie: { statutHttp: 403, ecran: "acces_refuse", action: "contacter_administrateur", nomEntrepriseExposable: false, reessayable: false },
};

/** Ce que la base peut rendre au CLIENT. Le détail (dates, identifiants de lignes, autres entreprises) reste dans le diagnostic. */
export type DecisionAccesApplication = {
  version: typeof VERSION_CONTRAT_DECISION_ACCES;
  decision: DecisionAccesClient;
  applicationCode: string;
  /** Rôle applicatif effectif de l'appelant, présent seulement pour `autorise`. */
  roleCode: string | null;
  /** Renseignés seulement si l'appelant possède une appartenance (tout statut) à cette entreprise. */
  entreprise: { id: string; nom: string } | null;
};

const CODES = new Set<string>(DECISIONS_ACCES);

export function estDecisionAcces(valeur: unknown): valeur is DecisionAcces {
  return typeof valeur === "string" && CODES.has(valeur);
}

export function decisionEstAutorisee(decision: DecisionAccesClient): boolean {
  return decision === "autorise";
}

export function regleDecision(decision: DecisionAccesClient): RegleDecision {
  return REGLES_DECISION[decision];
}

/**
 * Écran cible, en tenant compte de l'application : seule Gestion Pro propose de créer une
 * entreprise. Toutes les autres renvoient vers le compte ELSATIA (voir spécification §9).
 */
export function ecranPourDecision(
  decision: DecisionAccesClient,
  applicationCode: string,
): { ecran: EcranAcces; action: ActionSuggeree } {
  const regle = REGLES_DECISION[decision];
  if (decision === "sans_organisation" && applicationCode === "gestion_pro") {
    return { ecran: regle.ecran, action: "creer_ou_rejoindre_entreprise" };
  }
  return { ecran: regle.ecran, action: regle.action };
}

/**
 * Portée de la déconnexion à appliquer APRÈS un refus. Toujours locale : un refus d'accès à une
 * application ne révoque jamais les sessions des autres applications. `null` = ne pas déconnecter
 * (l'utilisateur est légitime : invitation à accepter, panne de service…).
 * Les déconnexions globales restent des gestes explicites (voir spécification §5).
 */
export function porteeDeconnexionPourDecision(decision: DecisionAccesClient): "local" | null {
  switch (decision) {
    case "autorise":
    case "non_authentifie": // rien à fermer : aucune session
    case "invitation_en_attente":
    case "validation_en_attente":
    case "indisponible":
    case "erreur_configuration":
      return null;
    default:
      return "local";
  }
}

/**
 * Lit la réponse de `decision_acces_application` en FAIL-CLOSED : toute forme inattendue
 * (objet absent, code inconnu, version ultérieure) devient `erreur_configuration`, jamais `autorise`.
 */
export function lireDecisionAcces(donnees: unknown, applicationCode: string): DecisionAccesApplication {
  const refus = (decision: DecisionAccesClient): DecisionAccesApplication => ({
    version: VERSION_CONTRAT_DECISION_ACCES,
    decision,
    applicationCode,
    roleCode: null,
    entreprise: null,
  });
  if (typeof donnees !== "object" || donnees === null) return refus("erreur_configuration");
  const brut = donnees as Record<string, unknown>;
  if (brut.version !== VERSION_CONTRAT_DECISION_ACCES) return refus("erreur_configuration");
  if (!estDecisionAcces(brut.decision)) return refus("erreur_configuration");
  const decision = brut.decision;
  const ent = brut.entreprise as { id?: unknown; nom?: unknown } | null | undefined;
  const entreprise =
    REGLES_DECISION[decision].nomEntrepriseExposable && ent && typeof ent.id === "string" && typeof ent.nom === "string"
      ? { id: ent.id, nom: ent.nom }
      : null;
  return {
    version: VERSION_CONTRAT_DECISION_ACCES,
    decision,
    applicationCode,
    roleCode: decision === "autorise" && typeof brut.role_code === "string" ? brut.role_code : null,
    entreprise,
  };
}

/** Adaptateur transitoire : un booléen de l'ancienne `a_acces_application` n'a pas de motif. */
export function decisionDepuisBooleen(autorise: boolean, applicationCode: string): DecisionAccesApplication {
  return {
    version: VERSION_CONTRAT_DECISION_ACCES,
    decision: autorise ? "autorise" : "refus_non_qualifie",
    applicationCode,
    roleCode: null,
    entreprise: null,
  };
}
