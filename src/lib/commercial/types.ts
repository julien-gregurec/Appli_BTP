import type { CodeForfaitVendable, FamilleLigne, ModeleComptes, PeriodiciteAbonnement, TypeCompte } from "@/lib/commercial/catalogue";

/**
 * Contrats du moteur commercial Gestion Pro.
 * Toutes les valeurs monétaires sont des ENTIERS DE CENTIMES HT.
 * Aucune valeur flottante ne circule : l'arrondi est fait une seule fois, au
 * moment de la conversion d'un pourcentage (cf. `moteur.ts`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration souscrite
// ─────────────────────────────────────────────────────────────────────────────

export type ComptesSupplementaires = Partial<Record<TypeCompte, number>>;

export type ConfigurationAbonnement = {
  forfait: CodeForfaitVendable;
  periodicite: PeriodiciteAbonnement;
  /**
   * Modèle A (`capacite_personnes`, défaut) : nombre TOTAL de personnes actives
   * voulues. Les personnes au-delà de `comptesInclus` sont facturées au
   * `parCompteSup` du forfait.
   */
  personnesActives?: number;
  /** Modèle B (`par_type_de_compte`) : comptes supplémentaires par rôle. */
  comptesSupplementaires?: ComptesSupplementaires;
  modeleComptes?: ModeleComptes;
  /** Clés commerciales de modules activés en plus du forfait. */
  modules?: readonly string[];
  /** Blocs de stockage supplémentaires (50 Go chacun). */
  blocsStockage?: number;
  optionIA?: "aucune" | "credits" | "intensive";
  /** Taux de TVA en pourcentage. 20 par défaut ; 0 = autoliquidation. */
  tauxTvaPourcent?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Remises
// ─────────────────────────────────────────────────────────────────────────────

export const TYPES_REMISE_COMMERCIALE = ["pourcentage", "montant", "prix_negocie"] as const;
export type TypeRemiseCommerciale = (typeof TYPES_REMISE_COMMERCIALE)[number];

export const CIBLES_REMISE = [
  "abonnement",
  "forfait",
  "comptes",
  "modules",
  "stockage",
  "ia",
  "mise_en_service",
  "prestation",
] as const;
export type CibleRemise = (typeof CIBLES_REMISE)[number];

export type PerimetreRemise = {
  cible: CibleRemise;
  /**
   * Restreint la cible `modules` à ces clés commerciales. Vide/absent = tous
   * les modules optionnels. Sur `prestation`, la clé de la prestation.
   */
  cles?: readonly string[];
};

export const MODES_DUREE_REMISE = [
  "une_echeance",
  "nb_echeances",
  "dates",
  "jusqu_a_revocation",
  "permanente",
] as const;
export type ModeDureeRemise = (typeof MODES_DUREE_REMISE)[number];

/**
 * `jusqu_a_revocation` et `permanente` produisent le même calcul (aucune fin
 * programmée) mais sont deux ENGAGEMENTS différents et doivent rester deux choix
 * explicites : « jusqu'à révocation » est un geste révocable à tout moment,
 * « permanente » est un engagement contractuel sans terme. Le moteur ne les
 * confond jamais et l'interface exige une confirmation renforcée pour la seconde.
 */
export type DureeRemise =
  | { mode: "une_echeance"; debut: string }
  | { mode: "nb_echeances"; debut: string; nombre: number }
  | { mode: "dates"; debut: string; fin: string }
  | { mode: "jusqu_a_revocation"; debut: string }
  | { mode: "permanente"; debut: string };

export const ETATS_REMISE = ["programmee", "active", "expiree", "revoquee", "remplacee", "annulee"] as const;
export type EtatRemise = (typeof ETATS_REMISE)[number];

export type Remise = {
  id: string;
  type: TypeRemiseCommerciale;
  /**
   * `pourcentage` : 0 < valeur <= 100.
   * `montant` : réduction fixe en centimes HT par échéance.
   * `prix_negocie` : prix FINAL en centimes HT du périmètre, par échéance
   *   mensuelle de référence (converti selon la périodicité par le moteur).
   */
  valeur: number;
  perimetre: PerimetreRemise;
  duree: DureeRemise;
  /** État déclaré. L'état EFFECTIF à une date est calculé par `resoudreEtatRemise`. */
  etat: EtatRemise;
  motif: string;
  /** Autorise explicitement le cumul avec une autre remise de périmètre recouvrant. */
  cumulAutorise?: boolean;
  /** Priorité d'application en cas de cumul autorisé (croissant = appliqué d'abord). */
  priorite?: number;
  auteurId?: string | null;
  creeLe?: string;
  revoqueeLe?: string | null;
  revoqueePar?: string | null;
  remplaceeParId?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Résultat du calcul
// ─────────────────────────────────────────────────────────────────────────────

export type LigneAbonnement = {
  cle: string;
  libelle: string;
  famille: FamilleLigne;
  /** Clé commerciale du module, pour les lignes de famille `modules`. */
  moduleCle?: string;
  quantite: number;
  prixUnitaireMensuelCentimes: number;
  /** Montant HT de la ligne pour la période facturée (mois ou année). */
  montantPeriodeCentimes: number;
  multiplicateurAnnuel: number;
  statutPrix: string;
};

export type AvantageApplique = {
  ordre: number;
  remiseId: string;
  type: TypeRemiseCommerciale;
  cible: CibleRemise;
  libelle: string;
  /** Base sur laquelle la remise a été calculée, après les avantages précédents. */
  baseCentimes: number;
  reductionCentimes: number;
  /** Explication littérale de l'opération, affichée à l'administrateur. */
  explication: string;
};

export type ConflitRemise = {
  remiseId: string;
  autreRemiseId: string;
  raison: "cumul_interdit" | "prix_negocie_exclusif" | "perimetre_recouvrant";
  message: string;
};

export type CalculAbonnement = {
  configuration: ConfigurationAbonnement;
  periodicite: PeriodiciteAbonnement;
  lignes: readonly LigneAbonnement[];
  /** Total HT au tarif public, avant tout avantage. */
  sousTotalHtCentimes: number;
  avantages: readonly AvantageApplique[];
  totalRemisesCentimes: number;
  totalHtCentimes: number;
  tauxTvaPourcent: number;
  tvaCentimes: number;
  totalTtcCentimes: number;
  /** Équivalent mensuel du total HT (pour comparer mensuel et annuel). */
  equivalentMensuelHtCentimes: number;
  conflits: readonly ConflitRemise[];
  /** Remises retenues effectivement actives à la date de calcul. */
  remisesAppliquees: readonly string[];
  /** Remises écartées (état non actif, hors période, conflit). */
  remisesEcartees: readonly { id: string; raison: string }[];
  /** Anomalies non bloquantes à afficher (module non vendable, prix à définir…). */
  avertissements: readonly string[];
};

export type EcheanceProjetee = {
  /** 1 = prochaine échéance. */
  index: number;
  debut: string;
  totalHtCentimes: number;
  totalTtcCentimes: number;
  avantages: readonly AvantageApplique[];
  /** Vrai si au moins une remise s'éteint après cette échéance. */
  derniereEcheanceRemisee: boolean;
};
