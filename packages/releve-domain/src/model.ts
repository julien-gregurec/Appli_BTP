/**
 * Modèle minimal Relevé & Métré (lot 2 — fondation).
 *
 * Deux familles d'entités, deux stratégies de persistance (voir ADR §3 du rapport
 * `docs/product/ELSATIA_TOOLS_RELEVE_METRE_ARCHITECTURE_FOUNDATION_V1.md`) :
 *
 * 1. **Structure** — `Releve → Batiment → Etage → Zone → Piece`. Tables relationnelles
 *    dédiées : le serveur doit pouvoir lister, filtrer, autoriser et lier à Gestion Pro.
 * 2. **Éléments métier** — `Mur, Ouverture, Equipement, Mesure, PhotoAnchor, Annotation,
 *    Materiau, Quantite`. Une table générique typée (`tools_releves_elements`) avec un
 *    discriminant `type` et une charge `donnees` validée ici : la géométrie évoluera aux lots
 *    5 à 12 et ne doit pas figer vingt colonnes SQL avant d'exister.
 *
 * `Version` est un instantané immuable ; `MediaFile` décrit un fichier du stockage privé.
 *
 * Conventions : longueurs en **millimètres** (entiers ou décimaux), angles en **radians**,
 * repère monde X droite / Y haut (identique à Engine B), horodatages ISO-8601 UTC.
 */

import type {
  BatimentId, ElementId, EtageId, MediaId, PieceId, ReleveId, TenantId, UserId, VersionId, ZoneId,
} from "./ids";

export type IsoDateTime = string;

/** Point 2D en millimètres, repère étage (compatible `Point2D` Engine B). */
export type Point2D = { readonly x: number; readonly y: number };

/** Borne des coordonnées, alignée sur Engine B (±1 km). */
export const RELEVE_COORDINATE_LIMIT_MM = 1_000_000;

// ── Métadonnées communes ──────────────────────────────────────────────────────

/**
 * Colonnes portées par chaque ligne persistée : locataire, propriété, horodatages,
 * révision optimiste et suppression douce. Le serveur est autoritaire sur toutes ces
 * valeurs (triggers) ; le client ne fait que les relire.
 */
export type EntityMeta = {
  readonly entrepriseId: TenantId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly createdBy: UserId | null;
  readonly updatedBy: UserId | null;
  /** Incrémentée par le serveur à chaque écriture : base du contrôle de concurrence. */
  readonly revision: number;
  /** Suppression douce : la ligne reste restaurable et auditée. */
  readonly deletedAt: IsoDateTime | null;
};

// ── Relevé (racine d'agrégat) ─────────────────────────────────────────────────

/** Nouveau type de projet Tools, distinct des projets calculateur et Atelier. */
export const TOOLS_PROJECT_KINDS = ["calculateur", "atelier", "releve"] as const;
export type ToolsProjectKind = (typeof TOOLS_PROJECT_KINDS)[number];
export const RELEVE_PROJECT_KIND: ToolsProjectKind = "releve";

export const RELEVE_STATUTS = ["brouillon", "en_cours", "termine", "archive"] as const;
export type ReleveStatut = (typeof RELEVE_STATUTS)[number];

/**
 * `prive` : visible du propriétaire et des administrateurs Relevé de l'entreprise.
 * `entreprise` : partagé avec les utilisateurs Relevé de l'entreprise (action `share`).
 */
export const RELEVE_VISIBILITES = ["prive", "entreprise"] as const;
export type ReleveVisibilite = (typeof RELEVE_VISIBILITES)[number];

/**
 * Racine de la hiérarchie `chantier → bâtiment → étage → zone → pièce`. Le chantier est
 * porté par le relevé : un libellé local toujours présent, et une référence faible
 * facultative vers `chantiers` Gestion Pro (GP reste autoritaire, jamais Tools).
 */
export type ReleveChantier = {
  readonly nom: string;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  /** `chantiers.id` Gestion Pro, si le relevé est rattaché. */
  readonly gpChantierId: string | null;
};

export type ReleveClient = {
  readonly nom: string | null;
  /** `clients.id` Gestion Pro, si connu. Copie d'affichage uniquement. */
  readonly gpClientId: string | null;
};

export const RELEVE_SCHEMA_VERSION = 1;

export type Releve = EntityMeta & {
  readonly id: ReleveId;
  readonly kind: "releve";
  readonly schemaVersion: number;
  readonly proprietaireId: UserId;
  readonly nom: string;
  readonly reference: string | null;
  readonly statut: ReleveStatut;
  readonly visibilite: ReleveVisibilite;
  readonly chantier: ReleveChantier;
  readonly client: ReleveClient;
  readonly dateReleve: string | null;
  readonly notes: string | null;
};

// ── Structure ─────────────────────────────────────────────────────────────────

export type Batiment = EntityMeta & {
  readonly id: BatimentId;
  readonly releveId: ReleveId;
  readonly nom: string;
  readonly ordre: number;
  readonly notes: string | null;
};

/** État de l'étage : relevé de l'existant ou variante projet (plan rénové, lot 14). */
export const ETAGE_ETATS = ["existant", "projet"] as const;
export type EtageEtat = (typeof ETAGE_ETATS)[number];

export const ETAGE_NIVEAU_MIN = -10;
export const ETAGE_NIVEAU_MAX = 200;

export type Etage = EntityMeta & {
  readonly id: EtageId;
  readonly releveId: ReleveId;
  readonly batimentId: BatimentId;
  readonly nom: string;
  /** 0 = rez-de-chaussée, négatif = sous-sol. */
  readonly niveau: number;
  readonly altitudeMm: number | null;
  readonly hauteurSousPlafondMm: number | null;
  readonly etat: EtageEtat;
  readonly ordre: number;
};

export const ZONE_TYPES = ["logement", "lot", "parties_communes", "local_technique", "exterieur", "autre"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export type Zone = EntityMeta & {
  readonly id: ZoneId;
  readonly releveId: ReleveId;
  readonly etageId: EtageId;
  readonly nom: string;
  readonly type: ZoneType;
  readonly ordre: number;
};

export const PIECE_USAGES = [
  "sejour", "chambre", "cuisine", "salle_de_bain", "salle_d_eau", "wc", "entree", "degagement",
  "bureau", "cellier", "buanderie", "garage", "cave", "combles", "escalier", "exterieur", "autre",
] as const;
export type PieceUsage = (typeof PIECE_USAGES)[number];

export type Piece = EntityMeta & {
  readonly id: PieceId;
  readonly releveId: ReleveId;
  readonly etageId: EtageId;
  /** Facultatif : une pièce peut appartenir directement à l'étage. */
  readonly zoneId: ZoneId | null;
  readonly nom: string;
  readonly usage: PieceUsage;
  readonly hauteurSousPlafondMm: number | null;
  readonly ordre: number;
};

// ── Éléments métier ───────────────────────────────────────────────────────────

export const ELEMENT_TYPES = [
  "mur", "ouverture", "equipement", "mesure", "photo_anchor", "annotation", "materiau", "quantite",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/** Référence typée vers une entité du relevé (cible d'une mesure, d'une annotation…). */
export const ENTITY_REF_KINDS = ["releve", "batiment", "etage", "zone", "piece", "element"] as const;
export type EntityRefKind = (typeof ENTITY_REF_KINDS)[number];
export type EntityRef = { readonly kind: EntityRefKind; readonly id: string };

/** Ancrage spatial : un point sur un étage, ou une entité. */
export type Ancre =
  | { readonly kind: "point"; readonly etageId: EtageId; readonly point: Point2D }
  | { readonly kind: "entite"; readonly ref: EntityRef };

export const MUR_TYPES = ["exterieur", "porteur", "cloison", "doublage"] as const;
export type MurType = (typeof MUR_TYPES)[number];
export type MurDonnees = {
  readonly a: Point2D;
  readonly b: Point2D;
  readonly epaisseurMm: number;
  readonly hauteurMm: number | null;
  readonly typeMur: MurType;
};

export const OUVERTURE_TYPES = ["porte", "fenetre", "porte_fenetre", "baie", "tremie", "passage"] as const;
export type OuvertureType = (typeof OUVERTURE_TYPES)[number];
export const OUVERTURE_SENS = ["gauche", "droite", "coulissant", "aucun"] as const;
export type OuvertureSens = (typeof OUVERTURE_SENS)[number];
export type OuvertureDonnees = {
  /** Distance depuis l'extrémité `a` du mur hôte jusqu'au bord de l'ouverture. */
  readonly decalageMm: number;
  readonly largeurMm: number;
  readonly hauteurMm: number;
  readonly allegeMm: number | null;
  readonly typeOuverture: OuvertureType;
  readonly sens: OuvertureSens;
};

export const EQUIPEMENT_CATEGORIES = ["mobilier", "electricite", "plomberie", "cvc", "eclairage", "autre"] as const;
export type EquipementCategorie = (typeof EQUIPEMENT_CATEGORIES)[number];
export type EquipementDonnees = {
  readonly categorie: EquipementCategorie;
  readonly libelle: string;
  readonly position: Point2D;
  readonly rotationRad: number;
  readonly largeurMm: number | null;
  readonly profondeurMm: number | null;
  readonly hauteurMm: number | null;
};

export const MESURE_TYPES = ["longueur", "hauteur", "diagonale", "angle", "surface"] as const;
export type MesureType = (typeof MESURE_TYPES)[number];
export const MESURE_UNITES = ["mm", "rad", "mm2"] as const;
export type MesureUnite = (typeof MESURE_UNITES)[number];
/** Provenance d'une mesure. `ar` et `lidar` sont réservés : aucune capture n'existe au lot 2. */
export const MESURE_SOURCES = ["manuel", "laser", "photo", "ar", "lidar"] as const;
export type MesureSource = (typeof MESURE_SOURCES)[number];
export type MesureDonnees = {
  readonly cible: EntityRef;
  readonly typeMesure: MesureType;
  readonly valeur: number;
  readonly unite: MesureUnite;
  readonly source: MesureSource;
  readonly precisionMm: number | null;
  readonly priseLe: IsoDateTime;
};

export type PhotoAnchorDonnees = {
  readonly mediaId: MediaId;
  readonly ancre: Ancre;
  readonly directionRad: number | null;
  readonly legende: string | null;
};

export type AnnotationDonnees = {
  readonly ancre: Ancre;
  readonly texte: string;
  /** Note vocale (catégorie de stockage `annotations`), lot 11. */
  readonly mediaAudioId: MediaId | null;
};

export const MATERIAU_CATEGORIES = ["sol", "mur", "plafond", "plinthe", "menuiserie", "autre"] as const;
export type MateriauCategorie = (typeof MATERIAU_CATEGORIES)[number];
/** Unités de quantité : sous-ensemble des unités Gestion Pro (`lignes_metres.unite`). */
export const QUANTITE_UNITES = ["m2", "ml", "m3", "u"] as const;
export type QuantiteUnite = (typeof QUANTITE_UNITES)[number];
export type MateriauDonnees = {
  readonly libelle: string;
  readonly categorie: MateriauCategorie;
  readonly unite: QuantiteUnite;
  readonly pertePourcent: number;
  /** `prestations_catalogue.id` GP : suggestion uniquement, jamais un prix. */
  readonly gpPrestationRef: string | null;
};

export const QUANTITE_QUALITES = ["exacte", "estimee"] as const;
export type QuantiteQualite = (typeof QUANTITE_QUALITES)[number];
/**
 * Quantité **dérivée** : jamais saisie, toujours recalculée depuis la géométrie. Elle est
 * stockée comme cache pour l'export et la transmission GP, avec la formule qui la produit.
 */
export type QuantiteDonnees = {
  readonly cle: string;
  readonly libelle: string;
  readonly valeur: number;
  readonly unite: QuantiteUnite;
  readonly formule: string;
  readonly qualite: QuantiteQualite;
  readonly materiauId: ElementId | null;
};

export type ElementDonneesByType = {
  readonly mur: MurDonnees;
  readonly ouverture: OuvertureDonnees;
  readonly equipement: EquipementDonnees;
  readonly mesure: MesureDonnees;
  readonly photo_anchor: PhotoAnchorDonnees;
  readonly annotation: AnnotationDonnees;
  readonly materiau: MateriauDonnees;
  readonly quantite: QuantiteDonnees;
};

/**
 * Élément générique. `etageId` / `pieceId` / `parentElementId` sont des colonnes SQL
 * (indexables, contrôlées par clés étrangères) ; le reste vit dans `donnees`.
 */
export type ReleveElement<T extends ElementType = ElementType> = EntityMeta & {
  readonly id: ElementId;
  readonly releveId: ReleveId;
  readonly type: T;
  readonly etageId: EtageId | null;
  readonly pieceId: PieceId | null;
  /** Mur hôte d'une ouverture. */
  readonly parentElementId: ElementId | null;
  readonly schemaVersion: number;
  readonly donnees: ElementDonneesByType[T];
};

export type Mur = ReleveElement<"mur">;
export type Ouverture = ReleveElement<"ouverture">;
export type Equipement = ReleveElement<"equipement">;
export type Mesure = ReleveElement<"mesure">;
export type PhotoAnchor = ReleveElement<"photo_anchor">;
export type Annotation = ReleveElement<"annotation">;
export type Materiau = ReleveElement<"materiau">;
export type Quantite = ReleveElement<"quantite">;

/** Rattachement exigé par type (miroir des CHECK SQL de `tools_releves_elements`). */
export const ELEMENT_ATTACHMENT: Record<ElementType, { etage: "requis" | "facultatif"; parent: "requis" | "interdit" }> = {
  mur: { etage: "requis", parent: "interdit" },
  ouverture: { etage: "requis", parent: "requis" },
  equipement: { etage: "requis", parent: "interdit" },
  mesure: { etage: "facultatif", parent: "interdit" },
  photo_anchor: { etage: "facultatif", parent: "interdit" },
  annotation: { etage: "facultatif", parent: "interdit" },
  materiau: { etage: "facultatif", parent: "interdit" },
  quantite: { etage: "facultatif", parent: "interdit" },
};

// ── Versions & médias ─────────────────────────────────────────────────────────

/** Instantané immuable, distinct de la révision de synchronisation. */
export type Version = {
  readonly id: VersionId;
  readonly entrepriseId: TenantId;
  readonly releveId: ReleveId;
  readonly numero: number;
  readonly libelle: string | null;
  readonly revisionSource: number;
  /** SHA-256 hexadécimal du contenu canonique. */
  readonly empreinte: string;
  readonly createdAt: IsoDateTime;
  readonly createdBy: UserId | null;
};

export const MEDIA_CATEGORIES = ["photos", "annotations", "documents", "exports"] as const;
export type MediaCategorie = (typeof MEDIA_CATEGORIES)[number];

export type MediaFile = EntityMeta & {
  readonly id: MediaId;
  readonly releveId: ReleveId;
  readonly categorie: MediaCategorie;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly tailleOctets: number;
  readonly nomFichier: string | null;
};

// ── Agrégat de lecture ────────────────────────────────────────────────────────

/** Structure complète d'un relevé telle que chargée par un client. */
export type ReleveStructure = {
  readonly releve: Releve;
  readonly batiments: readonly Batiment[];
  readonly etages: readonly Etage[];
  readonly zones: readonly Zone[];
  readonly pieces: readonly Piece[];
};

export type ReleveAggregate = ReleveStructure & {
  readonly elements: readonly ReleveElement[];
  readonly medias: readonly MediaFile[];
};
