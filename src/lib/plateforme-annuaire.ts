/**
 * Annuaire plateforme des entreprises clientes — modèle de domaine.
 *
 * Ce module ne fait AUCUNE entrée/sortie : il décrit le vocabulaire de
 * l'annuaire (colonnes, onglets, filtres, tri), analyse et re-sérialise la
 * requête portée par l'URL, et compose la vue « coût » d'une entreprise.
 * L'accès aux données vit dans `plateforme-annuaire-serveur.ts`, l'affichage
 * dans `/plateforme/entreprises`. Cette séparation rend le cœur testable sans
 * base et garantit qu'une même requête produit la même URL partageable.
 *
 * Règle cardinale de ce lot : aucun montant n'est inventé. Quand une donnée
 * manque, la fonction renvoie `null` et inscrit la raison dans `indisponible`
 * pour que l'écran affiche « Non disponible » au lieu d'une estimation
 * trompeuse (exigence §9 et §19 du cahier des charges).
 */

import {
  OFFRES_TARIFAIRES,
  calculerTarifAbonnement,
  estCodeOffreTarifaire,
  offreTarifaireParCle,
  type PeriodiciteAbonnement,
} from "@/lib/tarification";

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation de recherche
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalisation commune au client, au serveur et à la proposition SQL :
 * minuscules, diacritiques retirés, ponctuation de séparation ramenée à un
 * espace, espaces compactés. « Éts. Dupré » et « ets dupre » se rejoignent.
 *
 * Le SIRET est un cas particulier volontaire : les espaces internes d'un
 * numéro saisi « 123 456 789 00012 » sont retirés par `normaliserSiret`, pas
 * ici, afin de ne pas coller entre eux des mots d'une raison sociale.
 */
export function normaliserRecherche(valeur: string | null | undefined): string {
  if (!valeur) return "";
  return valeur
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // `.`, `-`, `+` et `@` restent utiles à l'intérieur d'un e-mail ou d'une
    // référence ; tout autre séparateur devient une espace.
    .replace(/[^\p{Letter}\p{Number}@.+-]+/gu, " ")
    // ... mais une ponctuation qui ne colle pas à un caractère suivant n'est que
    // de la ponctuation : « Éts. Dupré » doit rejoindre « ets dupre ».
    .replace(/[.+-]+(?![\p{Letter}\p{Number}])/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Un SIRET ne se compare qu'en chiffres : la saisie humaine est espacée. */
export function normaliserSiret(valeur: string | null | undefined): string {
  return (valeur ?? "").replace(/\D+/g, "");
}

/**
 * Une saisie est traitée comme un SIRET dès qu'elle ne contient que des
 * chiffres et séparateurs et compte au moins 3 chiffres — en deçà, « 12 » doit
 * rester une recherche textuelle ordinaire.
 */
export function rechercheRessembleAUnSiret(valeur: string): boolean {
  const chiffres = normaliserSiret(valeur);
  return chiffres.length >= 3 && /^[\d\s.\-]+$/.test(valeur.trim());
}

/**
 * Vrai si `terme` apparaît dans l'un des champs indexés de la ligne.
 * Recherche partielle, insensible à la casse et aux accents. Les champs
 * numériques (SIRET, téléphone) sont comparés en chiffres seuls.
 */
export function ligneCorrespondALaRecherche(
  champs: ChampsRecherchables,
  terme: string,
): boolean {
  const normalise = normaliserRecherche(terme);
  if (!normalise) return true;

  if (rechercheRessembleAUnSiret(terme)) {
    const chiffres = normaliserSiret(terme);
    if (normaliserSiret(champs.siret).includes(chiffres)) return true;
    if (normaliserSiret(champs.telephone).includes(chiffres)) return true;
    // On ne s'arrête pas là : « 2024 » peut aussi être un numéro de client.
  }

  return CHAMPS_RECHERCHE.some((cle) => normaliserRecherche(champs[cle]).includes(normalise));
}

export type ChampsRecherchables = {
  nom: string | null;
  raison_sociale: string | null;
  siret: string | null;
  email: string | null;
  telephone: string | null;
  proprietaire: string | null;
  ville: string | null;
  code_postal: string | null;
  reference_interne: string | null;
  code_adhesion: string | null;
};

/**
 * Champs interrogés par la recherche libre. La référence d'abonnement Stripe
 * en est volontairement absente : c'est un identifiant de système de paiement,
 * jamais un critère exposé à l'écran (§4, dernière puce).
 */
const CHAMPS_RECHERCHE = [
  "nom",
  "raison_sociale",
  "siret",
  "email",
  "telephone",
  "proprietaire",
  "ville",
  "code_postal",
  "reference_interne",
  "code_adhesion",
] as const satisfies readonly (keyof ChampsRecherchables)[];

export const CHAMPS_RECHERCHE_ANNUAIRE: readonly string[] = CHAMPS_RECHERCHE;

// ─────────────────────────────────────────────────────────────────────────────
// Colonnes
// ─────────────────────────────────────────────────────────────────────────────

export type CleColonneAnnuaire =
  | "nom"
  | "raison_sociale"
  | "siret"
  | "ville"
  | "reference"
  | "statut"
  | "date_inscription"
  | "proprietaire"
  | "email"
  | "forfait"
  | "periodicite"
  | "modules"
  | "applications"
  | "comptes_actifs"
  | "comptes_inclus"
  | "montant_public"
  | "remise"
  | "prix_souscrit"
  | "prochaine_echeance"
  | "statut_paiement"
  | "montant_impaye"
  | "derniere_activite";

export type DefinitionColonne = {
  cle: CleColonneAnnuaire;
  libelle: string;
  /** Groupe utilisé par le sélecteur de colonnes. */
  groupe: "Identité" | "Abonnement" | "Comptes" | "Facturation" | "Usage";
  /** Visible tant que l'opérateur n'a pas exprimé de préférence. */
  parDefaut: boolean;
  /** Alignement : les montants et compteurs se lisent alignés à droite. */
  numerique?: boolean;
  /** Colonne masquée sur les vues étroites même si elle est sélectionnée. */
  secondaire?: boolean;
};

/**
 * Catalogue des colonnes. Huit colonnes seulement sont visibles par défaut :
 * au-delà, un tableau de gestion cesse d'être lisible et l'opérateur perd le
 * bénéfice de la liste (§2, « ne pas afficher toutes les informations
 * simultanément »). Les autres restent à un clic dans le sélecteur.
 */
export const COLONNES_ANNUAIRE: readonly DefinitionColonne[] = [
  { cle: "nom", libelle: "Nom commercial", groupe: "Identité", parDefaut: true },
  { cle: "raison_sociale", libelle: "Raison sociale", groupe: "Identité", parDefaut: false },
  { cle: "siret", libelle: "SIRET", groupe: "Identité", parDefaut: false },
  { cle: "ville", libelle: "Ville", groupe: "Identité", parDefaut: false },
  { cle: "reference", libelle: "Référence client", groupe: "Identité", parDefaut: false },
  { cle: "proprietaire", libelle: "Contact principal", groupe: "Identité", parDefaut: false },
  { cle: "email", libelle: "E-mail principal", groupe: "Identité", parDefaut: false },
  { cle: "date_inscription", libelle: "Inscription", groupe: "Identité", parDefaut: false },
  { cle: "statut", libelle: "Statut", groupe: "Abonnement", parDefaut: true },
  { cle: "forfait", libelle: "Forfait", groupe: "Abonnement", parDefaut: true },
  { cle: "periodicite", libelle: "Périodicité", groupe: "Abonnement", parDefaut: false },
  { cle: "modules", libelle: "Modules", groupe: "Abonnement", parDefaut: false, numerique: true },
  { cle: "applications", libelle: "Applications", groupe: "Abonnement", parDefaut: false },
  { cle: "comptes_actifs", libelle: "Comptes actifs", groupe: "Comptes", parDefaut: true, numerique: true },
  { cle: "comptes_inclus", libelle: "Comptes inclus", groupe: "Comptes", parDefaut: false, numerique: true },
  { cle: "montant_public", libelle: "Abonnement HT (public)", groupe: "Facturation", parDefaut: false, numerique: true },
  { cle: "remise", libelle: "Remise", groupe: "Facturation", parDefaut: false },
  { cle: "prix_souscrit", libelle: "Prix souscrit HT", groupe: "Facturation", parDefaut: true, numerique: true },
  { cle: "prochaine_echeance", libelle: "Prochaine échéance", groupe: "Facturation", parDefaut: true },
  { cle: "statut_paiement", libelle: "Paiement", groupe: "Facturation", parDefaut: true },
  { cle: "montant_impaye", libelle: "Impayé HT", groupe: "Facturation", parDefaut: false, numerique: true },
  { cle: "derniere_activite", libelle: "Dernière activité", groupe: "Usage", parDefaut: true, secondaire: true },
];

const CLES_COLONNES = new Set<string>(COLONNES_ANNUAIRE.map((c) => c.cle));

export const COLONNES_PAR_DEFAUT: readonly CleColonneAnnuaire[] = COLONNES_ANNUAIRE.filter(
  (c) => c.parDefaut,
).map((c) => c.cle);

/**
 * `nom` est structurellement non masquable : c'est la colonne qui porte le
 * lien vers la fiche. Une préférence qui l'omettrait rendrait la liste
 * inutilisable, on la réintroduit donc en tête.
 */
export function normaliserColonnes(demandees: readonly string[]): CleColonneAnnuaire[] {
  const retenues = demandees.filter((c): c is CleColonneAnnuaire => CLES_COLONNES.has(c));
  const uniques = [...new Set(retenues)];
  const ordonnees = COLONNES_ANNUAIRE.filter((c) => uniques.includes(c.cle)).map((c) => c.cle);
  return ordonnees.includes("nom") ? ordonnees : ["nom", ...ordonnees];
}

/**
 * Vue enregistrée de l'annuaire.
 *
 * Une vue est simplement la chaîne de requête de l'URL — recherche, onglet,
 * filtres, tri, colonnes et densité y sont déjà encodés par
 * `serialiserRequeteAnnuaire`. La ranger dans un cookie évite d'inventer une
 * table de préférences (aucune migration dans ce lot) et garde la préférence
 * strictement locale au poste de l'opérateur : elle ne contient aucun
 * identifiant d'entreprise ni donnée client, seulement des critères
 * d'affichage.
 */
export const COOKIE_VUE_ANNUAIRE = "elsatia_annuaire_vue";

/** Un cookie de préférence d'affichage n'a aucune raison d'être long. */
export const TAILLE_MAX_VUE = 1_000;

export type DensiteAnnuaire = "compacte" | "confortable";
export const DENSITES: readonly DensiteAnnuaire[] = ["compacte", "confortable"];

// ─────────────────────────────────────────────────────────────────────────────
// Onglets de suivi
// ─────────────────────────────────────────────────────────────────────────────

export type CleOngletAnnuaire =
  | "toutes"
  | "actives"
  | "essais"
  | "a_renouveler"
  | "paiement_attente"
  | "retards"
  | "impayes"
  | "suspendues"
  | "resiliees"
  | "archivees";

/**
 * Couverture d'un onglet par le modèle de données réellement déployé :
 *  - `complete`  : l'état est porté par une colonne dédiée, sans interprétation ;
 *  - `partielle` : l'état est déduit d'une règle de bord (délai, date) qui
 *                  reste à confirmer contre les règles contractuelles ;
 *  - `absente`   : aucune donnée ne porte cet état ; l'onglet est affiché
 *                  désactivé plutôt que de mentir par un compteur à zéro.
 */
export type CouvertureOnglet = "complete" | "partielle" | "absente";

export type DefinitionOnglet = {
  cle: CleOngletAnnuaire;
  libelle: string;
  couverture: CouvertureOnglet;
  /** Ce que l'onglet montre, en une phrase, affiché sous la liste. */
  definition: string;
  /** Pour `partielle`/`absente` : ce qui manque et ce qu'il faudrait décider. */
  reserve?: string;
};

/**
 * Le cahier des charges distingue explicitement paiement en traitement,
 * paiement en attente, retard, échec, impayé confirmé, expiration, annulation
 * et suspension. Le modèle déployé ne porte pas huit états distincts : il
 * porte `abonnements_entreprises.statut` (essai/actif/impaye/suspendu/annule),
 * `entreprises.suspension_prevue_at`, `entreprises.derniere_facture_statut`
 * (état Stripe de la dernière facture) et `entreprises.abonnement_echeance`.
 * Chaque onglet dit donc lequel de ces signaux il lit, et ceux qui reposent
 * sur un délai portent leur réserve.
 */
export const ONGLETS_ANNUAIRE: readonly DefinitionOnglet[] = [
  {
    cle: "toutes",
    libelle: "Toutes",
    couverture: "complete",
    definition: "Toutes les entreprises visibles par le rôle plateforme en session.",
  },
  {
    cle: "actives",
    libelle: "Actives",
    couverture: "complete",
    definition: "Abonnement actif, sans impayé signalé ni suspension programmée.",
  },
  {
    cle: "essais",
    libelle: "Essais",
    couverture: "complete",
    definition: "Abonnement en période d'essai (statut « essai »).",
  },
  {
    cle: "a_renouveler",
    libelle: "À renouveler",
    couverture: "partielle",
    definition: "Échéance d'abonnement dans les 30 jours, ou fin d'essai dans les 30 jours.",
    reserve:
      "Le seuil de 30 jours est un défaut d'écran, pas une règle contractuelle : aucune table ne porte de préavis de renouvellement. À arbitrer avec les CGV avant usage commercial.",
  },
  {
    cle: "paiement_attente",
    libelle: "Paiement en attente",
    couverture: "partielle",
    definition:
      "Dernière facture émise mais non réglée (statut Stripe « open » ou « draft »), échéance non encore dépassée.",
    reserve:
      "Dépend de la disponibilité de Stripe. Si l'état de facturation n'est pas lisible, la ligne bascule en « Paiement inconnu » et n'est comptée dans aucun onglet de paiement.",
  },
  {
    cle: "retards",
    libelle: "Retards de paiement",
    couverture: "partielle",
    definition: "Échéance dépassée, facture non réglée, sans impayé encore confirmé.",
    reserve:
      "Le retard est déduit de `abonnement_echeance` comparée à la date du jour. Aucune règle de relance n'est stockée : les tranches d'ancienneté sont indicatives.",
  },
  {
    cle: "impayes",
    libelle: "Impayés",
    couverture: "partielle",
    definition:
      "Impayé signalé par la plateforme (suspension programmée), statut d'abonnement « impayé », ou facture Stripe irrécouvrable.",
    reserve:
      "« Impayé confirmé » et « échec de paiement » partagent aujourd'hui le même signal. La distinction demandée au §5 exige un champ dédié — voir la proposition SQL.",
  },
  {
    cle: "suspendues",
    libelle: "Suspendues",
    couverture: "complete",
    definition: "Accès suspendu (statut « suspendu »).",
  },
  {
    cle: "resiliees",
    libelle: "Résiliées",
    couverture: "complete",
    definition: "Abonnement annulé, ou annulation programmée à une date connue.",
  },
  {
    cle: "archivees",
    libelle: "Archivées",
    couverture: "absente",
    definition: "Entreprise conservée dans l'historique mais hors exploitation.",
    reserve:
      "Aucun champ d'archivage n'existe sur `entreprises`. L'onglet est affiché désactivé : un compteur à zéro laisserait croire qu'aucune entreprise n'est archivée, ce qui n'est pas vérifiable. Champ proposé : `entreprises.archivee_at`.",
  },
];

export const ONGLET_PAR_DEFAUT: CleOngletAnnuaire = "toutes";

const CLES_ONGLETS = new Set<string>(ONGLETS_ANNUAIRE.map((o) => o.cle));

export function ongletParCle(cle: string): DefinitionOnglet {
  return ONGLETS_ANNUAIRE.find((o) => o.cle === cle) ?? ONGLETS_ANNUAIRE[0];
}

/** Onglets réellement sélectionnables (ceux dont l'état existe en base). */
export const ONGLETS_DISPONIBLES = ONGLETS_ANNUAIRE.filter((o) => o.couverture !== "absente");

// ─────────────────────────────────────────────────────────────────────────────
// Tri
// ─────────────────────────────────────────────────────────────────────────────

export type CleTriAnnuaire =
  | "nom"
  | "date_inscription"
  | "forfait"
  | "montant"
  | "prochaine_echeance"
  | "montant_impaye"
  | "derniere_activite"
  | "comptes_actifs"
  | "fin_remise";

export type SensTri = "asc" | "desc";

export const TRIS_ANNUAIRE: readonly { cle: CleTriAnnuaire; libelle: string; sensParDefaut: SensTri }[] = [
  { cle: "date_inscription", libelle: "Inscription", sensParDefaut: "desc" },
  { cle: "nom", libelle: "Nom", sensParDefaut: "asc" },
  { cle: "forfait", libelle: "Forfait", sensParDefaut: "asc" },
  { cle: "montant", libelle: "Prix souscrit", sensParDefaut: "desc" },
  { cle: "prochaine_echeance", libelle: "Prochaine échéance", sensParDefaut: "asc" },
  { cle: "montant_impaye", libelle: "Impayé", sensParDefaut: "desc" },
  { cle: "derniere_activite", libelle: "Dernière activité", sensParDefaut: "desc" },
  { cle: "comptes_actifs", libelle: "Comptes actifs", sensParDefaut: "desc" },
  { cle: "fin_remise", libelle: "Fin de remise", sensParDefaut: "asc" },
];

const CLES_TRI = new Set<string>(TRIS_ANNUAIRE.map((t) => t.cle));
export const TRI_PAR_DEFAUT: CleTriAnnuaire = "date_inscription";

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export const TAILLES_PAGE = [25, 50, 100] as const;
export type TaillePage = (typeof TAILLES_PAGE)[number];
export const TAILLE_PAGE_PAR_DEFAUT: TaillePage = 25;

/**
 * Plafond dur appliqué à toute lecture, y compris en mode dégradé. Il borne la
 * requête même si un appelant demandait une taille absurde : aucune page de
 * l'annuaire ne rapatrie plus de 100 lignes (§8, « éviter les requêtes non
 * bornées »).
 */
export const PLAFOND_LIGNES_PAR_REQUETE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Tranches d'ancienneté d'impayé
// ─────────────────────────────────────────────────────────────────────────────

export type TrancheRetard = "moins_7" | "7_30" | "31_60" | "plus_60";

export const TRANCHES_RETARD: readonly { cle: TrancheRetard; libelle: string; min: number; max: number | null }[] = [
  { cle: "moins_7", libelle: "Moins de 7 jours", min: 0, max: 6 },
  { cle: "7_30", libelle: "7 à 30 jours", min: 7, max: 30 },
  { cle: "31_60", libelle: "31 à 60 jours", min: 31, max: 60 },
  { cle: "plus_60", libelle: "Plus de 60 jours", min: 61, max: null },
];

const CLES_TRANCHES = new Set<string>(TRANCHES_RETARD.map((t) => t.cle));

/** Nombre de jours entiers écoulés depuis `echeance`, négatif si à venir. */
export function joursDeRetard(echeance: string | null | undefined, maintenant: Date): number | null {
  if (!echeance) return null;
  const date = new Date(echeance);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((maintenant.getTime() - date.getTime()) / 86_400_000);
}

export function trancheDeRetard(jours: number | null): TrancheRetard | null {
  if (jours === null || jours < 0) return null;
  const tranche = TRANCHES_RETARD.find((t) => jours >= t.min && (t.max === null || jours <= t.max));
  return tranche?.cle ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtres
// ─────────────────────────────────────────────────────────────────────────────

export type FiltresAnnuaire = {
  forfait: string;
  module: string;
  application: string;
  periodicite: "" | PeriodiciteAbonnement;
  statutAbonnement: string;
  statutPaiement: string;
  inscritDu: string;
  inscritAu: string;
  echeanceDu: string;
  echeanceAu: string;
  /** "" = indifférent, "oui" = remise active, "non" = sans remise. */
  remise: "" | "oui" | "non";
  /** Remise dont la fin tombe dans les 60 jours. */
  remiseExpire: boolean;
  essai: boolean;
  ia: "" | "oui" | "non";
  pays: string;
  ville: string;
  pilote: boolean;
  incidentSupport: boolean;
  comptesMin: number | null;
  comptesMax: number | null;
  salariesMin: number | null;
  stockageMin: number | null;
  trancheRetard: TrancheRetard | "";
};

export const FILTRES_VIDES: FiltresAnnuaire = {
  forfait: "",
  module: "",
  application: "",
  periodicite: "",
  statutAbonnement: "",
  statutPaiement: "",
  inscritDu: "",
  inscritAu: "",
  echeanceDu: "",
  echeanceAu: "",
  remise: "",
  remiseExpire: false,
  essai: false,
  ia: "",
  pays: "",
  ville: "",
  pilote: false,
  incidentSupport: false,
  comptesMin: null,
  comptesMax: null,
  salariesMin: null,
  stockageMin: null,
  trancheRetard: "",
};

/** Filtres dont la donnée source n'existe pas encore dans le modèle déployé. */
export const FILTRES_NON_DISPONIBLES: readonly { cle: keyof FiltresAnnuaire; raison: string }[] = [
  { cle: "pays", raison: "`entreprises` ne porte pas de pays ; seule la ville et le code postal existent." },
  { cle: "pilote", raison: "Aucun marqueur « client pilote » n'existe en base. Champ proposé : `entreprises.client_pilote`." },
  { cle: "incidentSupport", raison: "Le support est journalisé (`acces_support_log`) mais aucun état « incident actif » n'est porté." },
  { cle: "stockageMin", raison: "Le stockage est relevé par période (`abonnement_stockage_releves`) et n'est pas agrégé par entreprise." },
];

const CLES_FILTRES_NON_DISPONIBLES = new Set<string>(FILTRES_NON_DISPONIBLES.map((f) => f.cle));

export function filtreEstDisponible(cle: keyof FiltresAnnuaire): boolean {
  return !CLES_FILTRES_NON_DISPONIBLES.has(cle);
}

/** Liste des filtres réellement posés, pour l'affichage « filtres actifs ». */
export function filtresActifs(filtres: FiltresAnnuaire): { cle: keyof FiltresAnnuaire; valeur: string }[] {
  const actifs: { cle: keyof FiltresAnnuaire; valeur: string }[] = [];
  for (const [cle, valeur] of Object.entries(filtres) as [keyof FiltresAnnuaire, unknown][]) {
    if (valeur === "" || valeur === null || valeur === false) continue;
    actifs.push({ cle, valeur: valeur === true ? "oui" : String(valeur) });
  }
  return actifs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Requête d'annuaire (analyse ↔ sérialisation)
// ─────────────────────────────────────────────────────────────────────────────

export type RequeteAnnuaire = {
  q: string;
  onglet: CleOngletAnnuaire;
  page: number;
  taille: TaillePage;
  tri: CleTriAnnuaire;
  sens: SensTri;
  densite: DensiteAnnuaire;
  colonnes: CleColonneAnnuaire[];
  filtres: FiltresAnnuaire;
};

type EntreeParams = Record<string, string | string[] | undefined>;

function premier(params: EntreeParams, cle: string): string {
  const valeur = params[cle];
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function entierBorne(brut: string, min: number, max: number | null): number | null {
  const valeur = Number.parseInt(brut, 10);
  if (!Number.isFinite(valeur)) return null;
  if (valeur < min) return min;
  if (max !== null && valeur > max) return max;
  return valeur;
}

/** Une date d'URL n'est retenue que si elle est au format `AAAA-MM-JJ` et réelle. */
function dateIso(brut: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return "";
  const date = new Date(`${brut}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : brut;
}

/**
 * Analyse les paramètres d'URL en une requête close et bornée. Toute valeur
 * inconnue est ramenée au défaut : l'URL est une entrée utilisateur, elle ne
 * doit jamais pouvoir élargir la lecture ni faire trier sur une colonne
 * arbitraire (protection contre l'injection d'ordre de tri).
 */
export function analyserRequeteAnnuaire(
  params: EntreeParams,
  colonnesPreferees: readonly string[] = COLONNES_PAR_DEFAUT,
): RequeteAnnuaire {
  const ongletBrut = premier(params, "onglet");
  const onglet: CleOngletAnnuaire =
    CLES_ONGLETS.has(ongletBrut) && ongletParCle(ongletBrut).couverture !== "absente"
      ? (ongletBrut as CleOngletAnnuaire)
      : ONGLET_PAR_DEFAUT;

  const triBrut = premier(params, "tri");
  const tri: CleTriAnnuaire = CLES_TRI.has(triBrut) ? (triBrut as CleTriAnnuaire) : TRI_PAR_DEFAUT;
  const sensBrut = premier(params, "sens");
  const sens: SensTri =
    sensBrut === "asc" || sensBrut === "desc"
      ? sensBrut
      : (TRIS_ANNUAIRE.find((t) => t.cle === tri)?.sensParDefaut ?? "desc");

  const tailleBrute = Number.parseInt(premier(params, "taille"), 10);
  const taille: TaillePage = (TAILLES_PAGE as readonly number[]).includes(tailleBrute)
    ? (tailleBrute as TaillePage)
    : TAILLE_PAGE_PAR_DEFAUT;

  const densiteBrute = premier(params, "densite");
  const densite: DensiteAnnuaire = densiteBrute === "confortable" ? "confortable" : "compacte";

  const colonnesUrl = premier(params, "colonnes");
  const colonnes = normaliserColonnes(
    colonnesUrl ? colonnesUrl.split(",") : [...colonnesPreferees],
  );

  const periodiciteBrute = premier(params, "periodicite");
  const remiseBrute = premier(params, "remise");
  const iaBrute = premier(params, "ia");
  const trancheBrute = premier(params, "retard");

  return {
    q: premier(params, "q").trim().slice(0, 120),
    onglet,
    page: entierBorne(premier(params, "page"), 1, 100_000) ?? 1,
    taille,
    tri,
    sens,
    densite,
    colonnes,
    filtres: {
      forfait: estCodeOffreTarifaire(premier(params, "forfait")) ? premier(params, "forfait") : "",
      module: premier(params, "module").slice(0, 60),
      application: premier(params, "application").slice(0, 60),
      periodicite: periodiciteBrute === "mensuel" || periodiciteBrute === "annuel" ? periodiciteBrute : "",
      statutAbonnement: premier(params, "statut").slice(0, 30),
      statutPaiement: premier(params, "paiement").slice(0, 30),
      inscritDu: dateIso(premier(params, "inscrit_du")),
      inscritAu: dateIso(premier(params, "inscrit_au")),
      echeanceDu: dateIso(premier(params, "echeance_du")),
      echeanceAu: dateIso(premier(params, "echeance_au")),
      remise: remiseBrute === "oui" || remiseBrute === "non" ? remiseBrute : "",
      remiseExpire: premier(params, "remise_expire") === "1",
      essai: premier(params, "essai") === "1",
      ia: iaBrute === "oui" || iaBrute === "non" ? iaBrute : "",
      pays: premier(params, "pays").slice(0, 40),
      ville: premier(params, "ville").slice(0, 60),
      pilote: premier(params, "pilote") === "1",
      incidentSupport: premier(params, "incident") === "1",
      comptesMin: entierBorne(premier(params, "comptes_min"), 0, 100_000),
      comptesMax: entierBorne(premier(params, "comptes_max"), 0, 100_000),
      salariesMin: entierBorne(premier(params, "salaries_min"), 0, 100_000),
      stockageMin: entierBorne(premier(params, "stockage_min"), 0, 1_000_000),
      trancheRetard: CLES_TRANCHES.has(trancheBrute) ? (trancheBrute as TrancheRetard) : "",
    },
  };
}

/**
 * Re-sérialise la requête en `URLSearchParams`. Seules les valeurs qui
 * s'écartent du défaut sont écrites : l'URL reste courte, lisible et
 * partageable entre administrateurs, et une même recherche produit toujours la
 * même adresse (§4, dernière exigence, et §6 « lien partageable »).
 */
export function serialiserRequeteAnnuaire(
  requete: RequeteAnnuaire,
  remplacements: Partial<RequeteAnnuaire> = {},
): URLSearchParams {
  const r: RequeteAnnuaire = {
    ...requete,
    ...remplacements,
    filtres: { ...requete.filtres, ...(remplacements.filtres ?? {}) },
  };
  const sp = new URLSearchParams();
  const ecrire = (cle: string, valeur: string | number | null | undefined) => {
    if (valeur === null || valeur === undefined || valeur === "" ) return;
    sp.set(cle, String(valeur));
  };

  ecrire("q", r.q);
  if (r.onglet !== ONGLET_PAR_DEFAUT) ecrire("onglet", r.onglet);
  if (r.page > 1) ecrire("page", r.page);
  if (r.taille !== TAILLE_PAGE_PAR_DEFAUT) ecrire("taille", r.taille);
  if (r.tri !== TRI_PAR_DEFAUT) ecrire("tri", r.tri);
  const sensDefaut = TRIS_ANNUAIRE.find((t) => t.cle === r.tri)?.sensParDefaut ?? "desc";
  if (r.sens !== sensDefaut) ecrire("sens", r.sens);
  if (r.densite !== "compacte") ecrire("densite", r.densite);

  const colonnesDefaut = [...COLONNES_PAR_DEFAUT].join(",");
  const colonnes = r.colonnes.join(",");
  if (colonnes !== colonnesDefaut) ecrire("colonnes", colonnes);

  const f = r.filtres;
  ecrire("forfait", f.forfait);
  ecrire("module", f.module);
  ecrire("application", f.application);
  ecrire("periodicite", f.periodicite);
  ecrire("statut", f.statutAbonnement);
  ecrire("paiement", f.statutPaiement);
  ecrire("inscrit_du", f.inscritDu);
  ecrire("inscrit_au", f.inscritAu);
  ecrire("echeance_du", f.echeanceDu);
  ecrire("echeance_au", f.echeanceAu);
  ecrire("remise", f.remise);
  if (f.remiseExpire) ecrire("remise_expire", "1");
  if (f.essai) ecrire("essai", "1");
  ecrire("ia", f.ia);
  ecrire("pays", f.pays);
  ecrire("ville", f.ville);
  if (f.pilote) ecrire("pilote", "1");
  if (f.incidentSupport) ecrire("incident", "1");
  ecrire("comptes_min", f.comptesMin);
  ecrire("comptes_max", f.comptesMax);
  ecrire("salaries_min", f.salariesMin);
  ecrire("stockage_min", f.stockageMin);
  ecrire("retard", f.trancheRetard);

  return sp;
}

/** Adresse complète d'une variante de la requête courante. */
export function lienAnnuaire(
  requete: RequeteAnnuaire,
  remplacements: Partial<RequeteAnnuaire> = {},
  base = "/plateforme/entreprises",
): string {
  const sp = serialiserRequeteAnnuaire(requete, remplacements);
  const chaine = sp.toString();
  return chaine ? `${base}?${chaine}` : base;
}

/**
 * Changer de recherche, d'onglet, de filtre ou de tri remet toujours à la
 * page 1 : rester en page 7 d'un résultat qui n'en compte plus que 2 est le
 * défaut classique de ces listes.
 */
export function lienAnnuaireDepuisPremierePage(
  requete: RequeteAnnuaire,
  remplacements: Partial<RequeteAnnuaire> = {},
  base = "/plateforme/entreprises",
): string {
  return lienAnnuaire(requete, { ...remplacements, page: 1 }, base);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ligne d'annuaire
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forme canonique d'une ligne d'annuaire, indépendante de la source (RPC
 * indexée ou lecture dégradée). Les champs facultatifs sont `null` quand la
 * donnée existe mais est vide, et `undefined` quand la source ne la porte pas
 * du tout — la distinction sert à choisir entre « — » et « Non disponible ».
 */
export type LigneAnnuaire = {
  id: string;
  nom: string;
  raison_sociale: string | null;
  siret: string | null;
  ville: string | null;
  code_postal: string | null;
  reference_interne: string | null;
  code_adhesion: string | null;
  proprietaire_nom: string | null;
  proprietaire_email: string | null;
  telephone: string | null;
  created_at: string;

  abonnement_statut: string;
  abonnement_offre: string | null;
  abonnement_periodicite: string | null;
  abonnement_echeance: string | null;
  abonnement_essai_fin: string | null;
  abonnement_annulation_prevue_at: string | null;

  /** Prix réellement souscrit HT, issu de `abonnements_entreprises`. */
  prix_contractuel_ht: number | null;
  remise_type: string | null;
  remise_valeur: number | null;
  remise_description: string | null;
  remise_duree_mois: number | null;
  remise_appliquee_at: string | null;

  suspension_prevue_at: string | null;
  derniere_facture_statut: string | null;
  derniere_facture_url: string | null;
  montant_impaye_ht: number | null;

  nb_comptes_actifs: number;
  nb_comptes_facturables: number;
  nb_salaries: number;
  modules_actifs: string[];
  applications_actives: string[];
  option_ia_statut: string | null;
  derniere_activite: string | null;

  /**
   * Faux lorsque l'état de facturation n'a pas pu être lu (Stripe indisponible,
   * table de factures inaccessible). Une ligne dans cet état n'est JAMAIS
   * comptée comme « à jour » : elle est marquée « Paiement inconnu ».
   */
  facturation_lisible: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Situation de paiement
// ─────────────────────────────────────────────────────────────────────────────

export type ClePaiement =
  | "a_jour"
  | "en_attente"
  | "retard"
  | "impaye"
  | "inconnu"
  | "sans_objet";

export type SituationPaiement = {
  cle: ClePaiement;
  libelle: string;
  /** Marqueur textuel doublant la couleur (§13 : ne pas dépendre de la couleur seule). */
  icone: string;
  jours: number | null;
  tranche: TrancheRetard | null;
  echeance: string | null;
  montant: number | null;
};

/** Statuts Stripe d'une facture qui signifient « réglée ». */
const FACTURES_REGLEES = new Set(["paid", "void"]);
/** Statuts Stripe d'une facture émise et non encore réglée. */
const FACTURES_EN_ATTENTE = new Set(["open", "draft"]);
/** Statuts Stripe d'une facture abandonnée au recouvrement. */
const FACTURES_IRRECOUVRABLES = new Set(["uncollectible"]);

/**
 * Détermine la situation de paiement d'une ligne.
 *
 * L'ordre des tests est délibéré : un impayé signalé par la plateforme prime
 * sur tout état Stripe, et l'illisibilité de la facturation prime sur la
 * conclusion « à jour ». Une panne ne doit jamais se lire comme une absence
 * d'impayé (§19).
 */
export function situationPaiement(ligne: LigneAnnuaire, maintenant: Date): SituationPaiement {
  const jours = joursDeRetard(ligne.abonnement_echeance, maintenant);
  const tranche = trancheDeRetard(jours);
  const commun = { jours, tranche, echeance: ligne.abonnement_echeance, montant: ligne.montant_impaye_ht };

  if (ligne.suspension_prevue_at || ligne.abonnement_statut === "impaye" ||
      FACTURES_IRRECOUVRABLES.has(ligne.derniere_facture_statut ?? "")) {
    return { cle: "impaye", libelle: "Impayé", icone: "✕", ...commun };
  }

  if (ligne.abonnement_statut === "annule") {
    return { cle: "sans_objet", libelle: "Sans objet", icone: "–", ...commun };
  }

  if (!ligne.facturation_lisible) {
    return { cle: "inconnu", libelle: "Paiement inconnu", icone: "?", ...commun };
  }

  const facture = ligne.derniere_facture_statut ?? "";
  if (FACTURES_EN_ATTENTE.has(facture)) {
    if (jours !== null && jours > 0) {
      return { cle: "retard", libelle: "En retard", icone: "!", ...commun };
    }
    return { cle: "en_attente", libelle: "En attente", icone: "…", ...commun };
  }

  if (FACTURES_REGLEES.has(facture)) {
    return { cle: "a_jour", libelle: "À jour", icone: "✓", ...commun };
  }

  // Aucune facture connue : en essai c'est normal, sinon l'état est inconnu.
  if (ligne.abonnement_statut === "essai") {
    return { cle: "sans_objet", libelle: "Essai en cours", icone: "–", ...commun };
  }
  return { cle: "inconnu", libelle: "Paiement inconnu", icone: "?", ...commun };
}

/** Fenêtre par défaut de l'onglet « À renouveler », en jours. */
export const FENETRE_RENOUVELLEMENT_JOURS = 30;
/** Fenêtre par défaut du filtre « remise arrivant à expiration », en jours. */
export const FENETRE_FIN_REMISE_JOURS = 60;

function dansLaFenetre(date: string | null, maintenant: Date, jours: number): boolean {
  if (!date) return false;
  const cible = new Date(date).getTime();
  if (Number.isNaN(cible)) return false;
  const delta = cible - maintenant.getTime();
  return delta >= 0 && delta <= jours * 86_400_000;
}

/**
 * Fin prévue d'une remise à durée limitée : date d'application + N mois.
 * Renvoie `null` pour une remise permanente ou sans date d'application — on ne
 * devine pas une échéance qui n'a pas été fixée.
 */
export function finPrevueRemise(ligne: LigneAnnuaire): string | null {
  if (!ligne.remise_appliquee_at || !ligne.remise_duree_mois) return null;
  const debut = new Date(ligne.remise_appliquee_at);
  if (Number.isNaN(debut.getTime())) return null;
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + ligne.remise_duree_mois);
  return fin.toISOString();
}

/** Appartenance d'une ligne à un onglet de suivi. */
export function ligneAppartientALOnglet(
  ligne: LigneAnnuaire,
  onglet: CleOngletAnnuaire,
  maintenant: Date,
): boolean {
  const paiement = situationPaiement(ligne, maintenant);
  switch (onglet) {
    case "toutes":
      return true;
    case "actives":
      return ligne.abonnement_statut === "actif" && paiement.cle !== "impaye";
    case "essais":
      return ligne.abonnement_statut === "essai";
    case "a_renouveler":
      return (
        dansLaFenetre(ligne.abonnement_echeance, maintenant, FENETRE_RENOUVELLEMENT_JOURS) ||
        dansLaFenetre(ligne.abonnement_essai_fin, maintenant, FENETRE_RENOUVELLEMENT_JOURS)
      );
    case "paiement_attente":
      return paiement.cle === "en_attente";
    case "retards":
      return paiement.cle === "retard";
    case "impayes":
      return paiement.cle === "impaye";
    case "suspendues":
      return ligne.abonnement_statut === "suspendu";
    case "resiliees":
      return ligne.abonnement_statut === "annule" || Boolean(ligne.abonnement_annulation_prevue_at);
    case "archivees":
      // État non porté par le modèle : aucun résultat, et l'onglet est désactivé.
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Application des filtres
// ─────────────────────────────────────────────────────────────────────────────

function dateDansIntervalle(valeur: string | null, du: string, au: string): boolean {
  if (!du && !au) return true;
  if (!valeur) return false;
  const jour = valeur.slice(0, 10);
  if (du && jour < du) return false;
  if (au && jour > au) return false;
  return true;
}

export function ligneCorrespondAuxFiltres(
  ligne: LigneAnnuaire,
  filtres: FiltresAnnuaire,
  maintenant: Date,
): boolean {
  if (filtres.forfait && (ligne.abonnement_offre ?? "") !== filtres.forfait) return false;
  if (filtres.module && !ligne.modules_actifs.includes(filtres.module)) return false;
  if (filtres.application && !ligne.applications_actives.includes(filtres.application)) return false;
  if (filtres.periodicite && (ligne.abonnement_periodicite ?? "") !== filtres.periodicite) return false;
  if (filtres.statutAbonnement && ligne.abonnement_statut !== filtres.statutAbonnement) return false;

  if (filtres.statutPaiement) {
    if (situationPaiement(ligne, maintenant).cle !== filtres.statutPaiement) return false;
  }

  if (!dateDansIntervalle(ligne.created_at, filtres.inscritDu, filtres.inscritAu)) return false;
  if (!dateDansIntervalle(ligne.abonnement_echeance, filtres.echeanceDu, filtres.echeanceAu)) return false;

  const aUneRemise = Boolean(ligne.remise_description || ligne.remise_type);
  if (filtres.remise === "oui" && !aUneRemise) return false;
  if (filtres.remise === "non" && aUneRemise) return false;
  if (filtres.remiseExpire && !dansLaFenetre(finPrevueRemise(ligne), maintenant, FENETRE_FIN_REMISE_JOURS)) {
    return false;
  }

  if (filtres.essai && ligne.abonnement_statut !== "essai") return false;

  if (filtres.ia === "oui" && (!ligne.option_ia_statut || ligne.option_ia_statut === "indisponible")) return false;
  if (filtres.ia === "non" && ligne.option_ia_statut && ligne.option_ia_statut !== "indisponible") return false;

  if (filtres.ville && normaliserRecherche(ligne.ville).indexOf(normaliserRecherche(filtres.ville)) === -1) {
    return false;
  }

  if (filtres.comptesMin !== null && ligne.nb_comptes_actifs < filtres.comptesMin) return false;
  if (filtres.comptesMax !== null && ligne.nb_comptes_actifs > filtres.comptesMax) return false;
  if (filtres.salariesMin !== null && ligne.nb_salaries < filtres.salariesMin) return false;

  if (filtres.trancheRetard) {
    const situation = situationPaiement(ligne, maintenant);
    if (situation.tranche !== filtres.trancheRetard) return false;
    if (situation.cle !== "retard" && situation.cle !== "impaye") return false;
  }

  // `pays`, `pilote`, `incidentSupport` et `stockageMin` sont sans donnée
  // source : ils sont désactivés à l'écran et volontairement neutres ici,
  // plutôt que de filtrer sur une valeur inventée.
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coût : sept notions distinctes, jamais un « coût » ambigu
// ─────────────────────────────────────────────────────────────────────────────

export type RemiseAffichee = {
  type: string;
  valeur: number;
  description: string | null;
  dureeMois: number | null;
  debut: string | null;
  finPrevue: string | null;
  permanente: boolean;
};

/**
 * Vue « coût » d'une entreprise. Chaque montant porte un nom sans ambiguïté et
 * vaut `null` quand il n'est pas calculable ; `indisponible` dit alors
 * pourquoi. Aucune de ces valeurs ne doit être affichée sous le mot « coût ».
 */
export type CoutEntreprise = {
  /** Tarif catalogue du forfait pour la périodicité souscrite, HT. */
  tarifPublicHT: number | null;
  /** Prix effectivement contractualisé, HT, pour la même période. */
  prixSouscritHT: number | null;
  remise: RemiseAffichee | null;
  /** Prix souscrit après application de la remise déclarée, HT. */
  totalRecurrentHT: number | null;
  periodicite: PeriodiciteAbonnement | null;
  /** Ramené au mois, pour additionner mensuels et annuels dans un même MRR. */
  revenuMensuelEquivalentHT: number | null;
  prochaineFactureHT: number | null;
  impayeHT: number | null;
  /** Raisons, lisibles, des montants absents. */
  indisponible: string[];
};

/**
 * Applique une remise déclarée à un montant, pour AFFICHAGE seulement.
 *
 * Le moteur de remise faisant autorité reste Stripe, piloté par les opérations
 * `plateforme_operations_remise` : cette fonction ne crée, ne planifie et
 * n'annule rien. Elle se borne à relire les champs déjà écrits par ce moteur
 * pour montrer à l'opérateur le prix qu'il vient d'accorder. Aucun second
 * moteur de calcul n'est introduit (§11, « Remises »).
 */
export function appliquerRemiseAffichage(
  montantHT: number,
  remise: RemiseAffichee | null,
): number {
  if (!remise) return montantHT;
  if (remise.type === "pourcentage") {
    const taux = Math.min(100, Math.max(0, remise.valeur));
    return Math.round(montantHT * (1 - taux / 100) * 100) / 100;
  }
  if (remise.type === "montant") {
    return Math.round(Math.max(0, montantHT - Math.max(0, remise.valeur)) * 100) / 100;
  }
  return montantHT;
}

export function remiseDeLaLigne(ligne: LigneAnnuaire): RemiseAffichee | null {
  if (!ligne.remise_type || ligne.remise_valeur === null || ligne.remise_valeur === undefined) {
    // Une description sans type exploitable existe sur d'anciennes remises :
    // on la montre, sans jamais l'appliquer à un montant.
    if (!ligne.remise_description) return null;
    return {
      type: "inconnue",
      valeur: 0,
      description: ligne.remise_description,
      dureeMois: ligne.remise_duree_mois,
      debut: ligne.remise_appliquee_at,
      finPrevue: finPrevueRemise(ligne),
      permanente: !ligne.remise_duree_mois,
    };
  }
  return {
    type: ligne.remise_type,
    valeur: Number(ligne.remise_valeur),
    description: ligne.remise_description,
    dureeMois: ligne.remise_duree_mois,
    debut: ligne.remise_appliquee_at,
    finPrevue: finPrevueRemise(ligne),
    permanente: !ligne.remise_duree_mois,
  };
}

/**
 * Compose la vue « coût » d'une ligne.
 *
 * Le tarif public vient du catalogue canonique (`calculerTarifAbonnement`), le
 * prix souscrit de `abonnements_entreprises.prix_contractuel_ht`. Les deux ne
 * sont jamais confondus, et le revenu récurrent n'est JAMAIS déduit du tarif
 * public : sans prix souscrit, le revenu vaut `null` (§9).
 */
export function composerCout(ligne: LigneAnnuaire): CoutEntreprise {
  const indisponible: string[] = [];
  const periodicite: PeriodiciteAbonnement | null =
    ligne.abonnement_periodicite === "annuel" || ligne.abonnement_periodicite === "mensuel"
      ? ligne.abonnement_periodicite
      : null;

  if (!periodicite) indisponible.push("périodicité d'abonnement inconnue");

  let tarifPublicHT: number | null = null;
  if (ligne.abonnement_offre && estCodeOffreTarifaire(ligne.abonnement_offre)) {
    const offre = offreTarifaireParCle(ligne.abonnement_offre);
    if (offre.devisObligatoire) {
      indisponible.push("forfait sur devis : aucun tarif catalogue");
    } else {
      tarifPublicHT =
        calculerTarifAbonnement({ offre, periodicite: periodicite ?? "mensuel" }).baseCentimes / 100;
    }
  } else {
    indisponible.push("forfait non renseigné : tarif catalogue introuvable");
  }

  const prixSouscritHT =
    ligne.prix_contractuel_ht === null || ligne.prix_contractuel_ht === undefined
      ? null
      : Number(ligne.prix_contractuel_ht);
  if (prixSouscritHT === null) {
    indisponible.push("aucun prix contractuel enregistré pour cette entreprise");
  }

  const remise = remiseDeLaLigne(ligne);
  if (remise && remise.type === "inconnue") {
    indisponible.push("remise sans type exploitable : elle n'est pas appliquée au total");
  }

  const totalRecurrentHT =
    prixSouscritHT === null
      ? null
      : appliquerRemiseAffichage(prixSouscritHT, remise && remise.type !== "inconnue" ? remise : null);

  let revenuMensuelEquivalentHT: number | null = null;
  if (totalRecurrentHT !== null && periodicite) {
    revenuMensuelEquivalentHT =
      periodicite === "annuel"
        ? Math.round((totalRecurrentHT / 12) * 100) / 100
        : totalRecurrentHT;
  }

  return {
    tarifPublicHT,
    prixSouscritHT,
    remise,
    totalRecurrentHT,
    periodicite,
    revenuMensuelEquivalentHT,
    // La prochaine facture n'est pas modélisée hors Stripe : on ne l'invente pas.
    prochaineFactureHT: null,
    impayeHT: ligne.montant_impaye_ht,
    indisponible,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tri
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clé de comparaison d'une ligne pour un tri donné. `null` se range toujours
 * en fin de liste, quel que soit le sens : une entreprise sans échéance ne
 * doit pas occuper la première place d'un tri « prochaine échéance ».
 */
function cleDeTri(ligne: LigneAnnuaire, tri: CleTriAnnuaire): string | number | null {
  switch (tri) {
    case "nom":
      return normaliserRecherche(ligne.nom);
    case "date_inscription":
      return ligne.created_at ?? null;
    case "forfait":
      return ligne.abonnement_offre
        ? OFFRES_TARIFAIRES.findIndex((o) => o.cle === ligne.abonnement_offre)
        : null;
    case "montant":
      return composerCout(ligne).revenuMensuelEquivalentHT;
    case "prochaine_echeance":
      return ligne.abonnement_echeance ?? null;
    case "montant_impaye":
      return ligne.montant_impaye_ht;
    case "derniere_activite":
      return ligne.derniere_activite ?? null;
    case "comptes_actifs":
      return ligne.nb_comptes_actifs;
    case "fin_remise":
      return finPrevueRemise(ligne);
  }
}

export function comparerLignes(tri: CleTriAnnuaire, sens: SensTri) {
  const facteur = sens === "asc" ? 1 : -1;
  return (a: LigneAnnuaire, b: LigneAnnuaire): number => {
    const ca = cleDeTri(a, tri);
    const cb = cleDeTri(b, tri);
    if (ca === null && cb === null) return normaliserRecherche(a.nom).localeCompare(normaliserRecherche(b.nom));
    if (ca === null) return 1;
    if (cb === null) return -1;
    if (typeof ca === "number" && typeof cb === "number") {
      if (ca === cb) return normaliserRecherche(a.nom).localeCompare(normaliserRecherche(b.nom));
      return (ca - cb) * facteur;
    }
    const comparaison = String(ca).localeCompare(String(cb), "fr");
    if (comparaison === 0) return normaliserRecherche(a.nom).localeCompare(normaliserRecherche(b.nom));
    return comparaison * facteur;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Résumé de tête de page
// ─────────────────────────────────────────────────────────────────────────────

export type IndicateurResume = {
  cle: string;
  libelle: string;
  /** `null` = non calculable : l'écran affiche « Non disponible ». */
  valeur: number | null;
  /** Onglet ou filtre appliqué au clic ; `null` si l'indicateur n'est pas cliquable. */
  onglet: CleOngletAnnuaire | null;
  /** Précision affichée sous la valeur (base de calcul, données manquantes). */
  note?: string;
};

/**
 * Indicateurs de tête de page, calculés sur l'ENSEMBLE du jeu filtré et non
 * sur la page affichée.
 *
 * Le revenu mensuel récurrent n'est pas une multiplication du tarif public :
 * il additionne les revenus mensuels équivalents réellement souscrits, remise
 * comprise. Si aucune entreprise ne porte de prix contractuel, il vaut `null`
 * et l'écran affiche « Non disponible » (§9).
 */
export function resumeAnnuaire(lignes: readonly LigneAnnuaire[], maintenant: Date): IndicateurResume[] {
  const compte = (onglet: CleOngletAnnuaire) =>
    lignes.filter((l) => ligneAppartientALOnglet(l, onglet, maintenant)).length;

  const couts = lignes.map(composerCout);
  const avecRevenu = couts.filter((c) => c.revenuMensuelEquivalentHT !== null);
  const mrr =
    avecRevenu.length === 0
      ? null
      : Math.round(avecRevenu.reduce((total, c) => total + (c.revenuMensuelEquivalentHT ?? 0), 0) * 100) / 100;
  const sansPrix = lignes.length - avecRevenu.length;

  const impayesConnus = lignes.filter((l) => l.montant_impaye_ht !== null);
  const montantImpaye =
    impayesConnus.length === 0
      ? null
      : Math.round(impayesConnus.reduce((total, l) => total + (l.montant_impaye_ht ?? 0), 0) * 100) / 100;

  return [
    { cle: "actives", libelle: "Entreprises actives", valeur: compte("actives"), onglet: "actives" },
    { cle: "essais", libelle: "Essais", valeur: compte("essais"), onglet: "essais" },
    { cle: "retards", libelle: "Paiements en retard", valeur: compte("retards"), onglet: "retards" },
    {
      cle: "impayes",
      libelle: "Impayés",
      valeur: compte("impayes"),
      onglet: "impayes",
      note: montantImpaye === null ? "montant non disponible" : `${montantImpaye.toLocaleString("fr-FR")} € HT`,
    },
    { cle: "suspendues", libelle: "Suspendues", valeur: compte("suspendues"), onglet: "suspendues" },
    {
      cle: "mrr",
      libelle: "Revenu mensuel récurrent HT",
      valeur: mrr,
      onglet: null,
      note:
        mrr === null
          ? "aucun prix contractuel enregistré"
          : sansPrix > 0
            ? `sur ${avecRevenu.length} entreprise(s) — ${sansPrix} sans prix contractuel`
            : `sur ${avecRevenu.length} entreprise(s)`,
    },
    {
      cle: "remises",
      libelle: "Remises actives",
      valeur: lignes.filter((l) => remiseDeLaLigne(l) !== null).length,
      onglet: null,
    },
    {
      cle: "renouvellements",
      libelle: "Renouvellements ≤ 30 j",
      valeur: compte("a_renouveler"),
      onglet: "a_renouveler",
    },
  ];
}
