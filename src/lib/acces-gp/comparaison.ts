/**
 * Comparaison PURE entre la décision actuelle de Gestion Pro et la décision contractuelle
 * `decision_acces_application('gestion_pro')`. Aucun accès réseau, aucune horloge, aucun état :
 * le hook du proxy ne fait qu'appeler ces fonctions (table d'états testée dans `comparaison.test.ts`).
 */
import type { DecisionAccesClient } from "@elsatia/application-access";
import type { ModeAccesGp } from "./mode";

export const APPLICATION_GESTION_PRO = "gestion_pro" as const;
const ROLE_ADMIN_PLATEFORME = "administrateur_plateforme_global";

export type TypeEcartGp =
  | "gp_autorise_decision_refuse" // le cas prouvé : poste OK, aucune habilitation → bloquerait à l'enforcement
  | "gp_refuse_decision_autorise"
  | "concordant_autorise"
  | "concordant_refuse"
  | "decision_indisponible";

/** `bloquant_si_enforcement` = les seuls écarts qui coupent un utilisateur aujourd'hui servi. */
export type GraviteEcartGp = "bloquant_si_enforcement" | "permissif" | "info";

export const GRAVITE_PAR_TYPE: Record<TypeEcartGp, GraviteEcartGp> = {
  gp_autorise_decision_refuse: "bloquant_si_enforcement",
  gp_refuse_decision_autorise: "permissif",
  concordant_autorise: "info",
  concordant_refuse: "info",
  decision_indisponible: "info",
};

/**
 * Ce que le proxy sait de SA propre décision au moment où il la prend. `moduleInclus` et
 * `abonnementStatut` ne sont connus que sur les chemins gardés par une permission (le proxy ne
 * les évalue pas ailleurs) : `undefined`/`null` = non évalué, jamais « refusé ».
 */
export type EtatDecisionGp = {
  /** Permission « porte d'entrée » du chemin (`MODULE_PERMISSION_PAR_CHEMIN`), null si le chemin n'est pas gardé. */
  droitRequis: string | null;
  /** `ctx.droit_acces` de `contexte_acces_proxy` (poste × permissions_poste). */
  droitAcces?: boolean | null;
  moduleInclus?: boolean | null;
  abonnementStatut?: string | null;
};

export type CauseGp =
  | "chemin_sans_garde" // aucun droit requis : tout membre connecté passe
  | "droit_poste_ok"
  | "droit_poste_refuse"
  | "module_non_inclus"
  | "abonnement_bloque";

export type DecisionGp = { autorise: boolean; cause: CauseGp };

/**
 * Reproduit l'ordre de la garde de `updateSession` (module non inclus → droit de poste) et ajoute
 * l'état d'abonnement, que GP refuse côté serveur (`entreprise.ts`) sans que le proxy le voie.
 */
export function decisionGpActuelle(etat: EtatDecisionGp): DecisionGp {
  if (etat.abonnementStatut === "suspendu" || etat.abonnementStatut === "annule") {
    return { autorise: false, cause: "abonnement_bloque" };
  }
  if (etat.droitRequis && etat.moduleInclus === false) return { autorise: false, cause: "module_non_inclus" };
  if (etat.droitRequis) {
    return etat.droitAcces === true
      ? { autorise: true, cause: "droit_poste_ok" }
      : { autorise: false, cause: "droit_poste_refuse" };
  }
  return { autorise: true, cause: "chemin_sans_garde" };
}

// ── Exemptions ─────────────────────────────────────────────────────────────────────────────
// Mêmes exemptions que le futur enforcement (annexe GP §3(a) et annexe D1 §3) : on n'observe pas
// ce qu'on n'enforcera pas, sinon le bruit masque l'écart réel.

/** Machine / sans utilisateur : jamais d'`auth.uid()`. Défense en profondeur (le proxy les écarte déjà). */
export const CHEMINS_MACHINE = [
  "/api/stripe/webhook",
  "/api/stripe/abonnement/webhook",
  "/api/stripe/boutique/webhook",
  "/api/webhooks/notifications-push",
  "/api/cron/abonnements",
  "/api/cron/notifications-push",
  "/api/paiements-bancaires/powens",
  "/api/paie/import",
  "/document", // portail client
  "/imprimer/partage",
  "/api/documents/partage",
] as const;

/** Parcours qui doivent rester ouverts à un membre sans habilitation (onboarding, sortie d'essai, RGPD, Tools). */
export const CHEMINS_EXEMPTES = [
  "/onboarding",
  "/en-attente",
  "/abonnement", // souscrire / régulariser : jamais derrière l'habilitation
  "/aide",
  "/parametres/donnees",
  "/api/rgpd/export",
  "/plateforme", // administration ELSATIA : entreprise_id nul, garde sautée
  "/api/tools/monetization", // routes Tools servies par l'app GP (Bearer/Apple/Google)
] as const;

const sousChemin = (chemin: string, base: string) => chemin === base || chemin.startsWith(base + "/");

export type MotifExemption =
  | "mode_off"
  | "chemin_public"
  | "chemin_machine"
  | "chemin_exempte"
  | "sans_entreprise"
  | "compte_depot"
  | "session_assistance"
  | "admin_plateforme";

export type ContexteExemption = {
  chemin: string;
  /** `isPublic` du proxy (PUBLIC_PATHS + accueil). */
  publique?: boolean;
  entrepriseId?: string | null;
  compteDepot?: boolean;
  accesSupport?: boolean;
};

/** Première exemption applicable, ou null si la requête est éligible à l'observation. */
export function motifExemption(ctx: ContexteExemption): MotifExemption | null {
  if (ctx.publique) return "chemin_public";
  if (CHEMINS_MACHINE.some((c) => sousChemin(ctx.chemin, c))) return "chemin_machine";
  if (CHEMINS_EXEMPTES.some((c) => sousChemin(ctx.chemin, c))) return "chemin_exempte";
  if (!ctx.entrepriseId) return "sans_entreprise";
  if (ctx.compteDepot) return "compte_depot";
  if (ctx.accesSupport) return "session_assistance";
  return null;
}

// ── Comparaison ────────────────────────────────────────────────────────────────────────────

/**
 * Décision observée : `null` = la RPC n'a pas répondu (délai, réseau, RPC absente) — jamais un refus.
 * Les codes `non_authentifie` et `erreur_configuration` alors que le proxy vient de valider la session
 * sont des pannes de décision, pas des refus : ils ne doivent pas gonfler `concordant_refuse`.
 */
export type DecisionObservee = { decision: DecisionAccesClient; roleCode?: string | null } | null;

export type EntreeComparaison = {
  mode: ModeAccesGp;
  exemption: ContexteExemption;
  gp: EtatDecisionGp;
  decision: DecisionObservee;
};

export type ResultatComparaison =
  | { observer: false; raison: MotifExemption }
  | {
      observer: true;
      type: TypeEcartGp;
      gravite: GraviteEcartGp;
      /** Code de la décision du contrat (ou `indisponible`). */
      motifDecision: string;
      gp: DecisionGp;
    };

export function comparerDecisionsGp(entree: EntreeComparaison): ResultatComparaison {
  if (entree.mode !== "observe") return { observer: false, raison: "mode_off" };
  const exemption = motifExemption(entree.exemption);
  if (exemption) return { observer: false, raison: exemption };

  const gp = decisionGpActuelle(entree.gp);
  const d = entree.decision;

  // Le bypass administrateur plateforme n'est pas un utilisateur GP : hors périmètre (annexe §3).
  if (d && d.decision === "autorise" && d.roleCode === ROLE_ADMIN_PLATEFORME) {
    return { observer: false, raison: "admin_plateforme" };
  }

  if (d === null || d.decision === "indisponible" || d.decision === "non_authentifie" || d.decision === "erreur_configuration") {
    return { observer: true, type: "decision_indisponible", gravite: "info", motifDecision: d ? d.decision : "indisponible", gp };
  }

  const decisionAutorise = d.decision === "autorise";
  let type: TypeEcartGp;
  if (gp.autorise && decisionAutorise) type = "concordant_autorise";
  else if (!gp.autorise && !decisionAutorise) type = "concordant_refuse";
  else if (gp.autorise) type = "gp_autorise_decision_refuse";
  else type = "gp_refuse_decision_autorise";

  return { observer: true, type, gravite: GRAVITE_PAR_TYPE[type], motifDecision: d.decision, gp };
}
