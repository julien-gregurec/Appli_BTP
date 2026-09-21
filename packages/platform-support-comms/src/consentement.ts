/**
 * Consentement et préférences de communication (§13).
 *
 * Trois natures, et une seule règle de fond : ce qui relève du service ou du contrat
 * n'est pas refusable ; ce qui relève de la promotion l'est toujours.
 *
 * Le piège explicitement visé par le §13 — « ne pas utiliser une alerte de sécurité
 * pour contourner un refus de publicité » — est traité par `qualifierCommunication` :
 * la nature découle du TYPE déclaré, et une communication commerciale ne peut pas
 * emprunter le canal non refusable en changeant simplement son étiquette de priorité.
 */

export type TypeCommunication =
  | "information"
  | "nouveaute"
  | "maintenance"
  | "incident"
  | "securite"
  | "action_requise"
  | "conseil"
  | "commerciale"
  | "interruption_planifiee"
  | "conditions"
  | "autre";

export type NatureCommunication = "service" | "produit" | "commerciale";

const NATURES: Readonly<Record<TypeCommunication, NatureCommunication>> = {
  information: "service",
  maintenance: "service",
  incident: "service",
  securite: "service",
  action_requise: "service",
  interruption_planifiee: "service",
  conditions: "service",
  nouveaute: "produit",
  conseil: "produit",
  commerciale: "commerciale",
  autre: "produit",
};

export function natureCommunication(type: TypeCommunication): NatureCommunication {
  return NATURES[type];
}

/**
 * Types qu'un utilisateur ne peut jamais désactiver : sécurité, incident, maintenance
 * critique et information contractuelle obligatoire.
 */
export const TYPES_NON_REFUSABLES: readonly TypeCommunication[] = [
  "securite",
  "incident",
  "maintenance",
  "interruption_planifiee",
  "conditions",
  "action_requise",
];

export function estCommunicationRefusable(type: TypeCommunication): boolean {
  return !TYPES_NON_REFUSABLES.includes(type);
}

export type PreferencesCommunication = {
  /** Communications commerciales (promotion, offres). */
  accepteCommerciales: boolean;
  /** Information produit non essentielle (nouveautés, conseils). */
  accepteProduit: boolean;
};

export const PREFERENCES_PAR_DEFAUT: PreferencesCommunication = {
  // Opt-in explicite pour le commercial : l'absence de choix n'est pas un consentement.
  accepteCommerciales: false,
  accepteProduit: true,
};

export type DecisionConsentement =
  | { autorise: true }
  | { autorise: false; raison: "refus_commercial" | "refus_produit" };

export function evaluerConsentement(
  type: TypeCommunication,
  preferences: PreferencesCommunication,
): DecisionConsentement {
  const nature = natureCommunication(type);
  if (nature === "service") return { autorise: true };
  if (nature === "commerciale") {
    return preferences.accepteCommerciales ? { autorise: true } : { autorise: false, raison: "refus_commercial" };
  }
  return preferences.accepteProduit ? { autorise: true } : { autorise: false, raison: "refus_produit" };
}

/**
 * Garde-fou contre le détournement : une communication de nature commerciale ou
 * produit ne peut pas être publiée avec un type « service » simplement pour forcer
 * l'affichage. La plateforme déclare la nature, cette fonction vérifie la cohérence.
 */
export function coherenceTypeEtNature(
  type: TypeCommunication,
  natureDeclaree: NatureCommunication,
): boolean {
  return natureCommunication(type) === natureDeclaree;
}
