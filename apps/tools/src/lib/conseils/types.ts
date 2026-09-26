/**
 * Conseils & Techniques — modèle de données data-driven.
 *
 * Bibliothèque de méthodes professionnelles de chantier. Le contenu est versionné
 * localement dans le code (aucun CMS, aucune table Supabase, cf. docs/conseils-techniques.md).
 *
 * Ce lot pose la fondation. Il est conçu pour accueillir plus tard TraceViewer /
 * TraceSteps via le contrat `relatedTraceIds: string[]`, sans dépendre d'aucune API
 * du moteur « Tracés & Géométrie » en cours de développement.
 */

/** Catégories de méthodes. Architecture volontairement extensible : ajouter un id ici
 *  puis une entrée dans `CONSEIL_CATEGORIES` (src/lib/conseils/categories.ts). */
export const CONSEIL_CATEGORY_IDS = [
  "cloisons",
  "plafonds",
  "platrerie",
  "menuiserie",
  "vitrage",
  "implantation",
  "tracage",
  "geometrie-chantier",
  "acoustique",
  "mesures",
  "calculs",
  "finitions",
  "astuces-pose",
  "securite",
  "fixation",
  "etancheite",
  "diagnostic",
  "entretien",
] as const;
export type ConseilCategoryId = (typeof CONSEIL_CATEGORY_IDS)[number];

/** Métiers utilisés pour le filtrage. Liste courte et extensible. */
export const CONSEIL_TRADE_IDS = [
  "tous",
  "platrier",
  "plaquiste",
  "menuisier",
  "agenceur",
  "peintre",
  "carreleur",
  "metallier",
  "vitrier",
  "chef-de-chantier",
] as const;
export type ConseilTradeId = (typeof CONSEIL_TRADE_IDS)[number];

/** Trois niveaux de difficulté, suffisants pour la V1 (pas de surarchitecture). */
export const CONSEIL_DIFFICULTIES = ["facile", "intermediaire", "avance"] as const;
export type ConseilDifficulty = (typeof CONSEIL_DIFFICULTIES)[number];

/** Cycle de vie d'une fiche dans le registre versionné. */
export const CONSEIL_STATUSES = ["draft", "published", "archived"] as const;
export type ConseilStatus = (typeof CONSEIL_STATUSES)[number];

/** Types de médias prévus. Aucune vidéo tierce : `source.origin` doit rester interne. */
export const CONSEIL_MEDIA_TYPES = ["image", "diagram", "animation", "video"] as const;
export type ConseilMediaType = (typeof CONSEIL_MEDIA_TYPES)[number];

/** Provenance d'un média. `elsatia-original` = produit par ELSATIA pour ce module. */
export const CONSEIL_MEDIA_ORIGINS = ["elsatia-original", "internal"] as const;
export type ConseilMediaOrigin = (typeof CONSEIL_MEDIA_ORIGINS)[number];

export type ConseilMediaSource = {
  /** Libellé interne (ex. « Schéma ELSATIA »). */
  label: string;
  origin: ConseilMediaOrigin;
  /** Licence / mention interne facultative. Jamais de contenu tiers. */
  license?: string;
};

export type ConseilMedia = {
  type: ConseilMediaType;
  /** URL absolue ou chemin relatif servi par l'app. Les textes fonctionnent sans ce média. */
  src: string;
  /** Texte alternatif obligatoire (accessibilité + repli hors ligne). */
  alt: string;
  caption?: string;
  source?: ConseilMediaSource;
};

/** Une étape de méthode. Numérotée à l'affichage ; garder `text` court et impératif. */
export type ConseilStep = {
  title: string;
  text: string;
  /** Repère de contrôle / astuce liée à cette étape précise. */
  hint?: string;
};

/**
 * Fiche « Conseils & Techniques ».
 *
 * `relatedToolIds` référence des outils du catalogue Tools de façon lâche (string) —
 * aucune résolution stricte requise ici.
 * `relatedTraceIds` est un simple contrat de chaîne : plus tard une fiche pourra
 * proposer [ VOIR LE SCHÉMA ] / [ PAS À PAS ] / [ MODE CHANTIER ]. Ne pas résoudre
 * de modèle de tracé dans ce lot.
 */
export type ConseilFiche = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  category: ConseilCategoryId;
  subcategory?: string;
  trades: readonly ConseilTradeId[];
  tags: readonly string[];
  difficulty: ConseilDifficulty;
  /** Durée indicative d'exécution, en minutes (>= 1). Affichée telle quelle, sans engagement. */
  estimatedMinutes: number;
  /** Outillage nécessaire (matériel réutilisable). Au moins un outil. */
  tools: readonly string[];
  /** Fournitures consommées par l'opération. Peut être vide (méthode purement gestuelle). */
  materials: readonly string[];
  preparation: readonly string[];
  steps: readonly ConseilStep[];
  tips: readonly string[];
  commonErrors: readonly string[];
  finalCheck: readonly string[];
  warnings: readonly string[];
  relatedToolIds: readonly string[];
  relatedTraceIds: readonly string[];
  media: readonly ConseilMedia[];
  /** Version de contenu de la fiche (>= 1). Incrémentée à chaque révision éditoriale. */
  version: number;
  status: ConseilStatus;
  /** Dates ISO 8601. */
  createdAt: string;
  updatedAt: string;
};

/** Filtres de la preview interne (cf. §7 : catégorie / métier / difficulté). */
export type ConseilFilter = {
  category?: ConseilCategoryId | null;
  trade?: ConseilTradeId | null;
  difficulty?: ConseilDifficulty | null;
};
