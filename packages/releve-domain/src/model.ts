/**
 * Modèle minimal Relevé & Métré (lot 2 — fondation).
 *
 * Deux familles d'entités, deux stratégies de persistance (voir ADR §3 du rapport
 * `docs/product/ELSATIA_TOOLS_RELEVE_METRE_ARCHITECTURE_FOUNDATION_V1.md`) :
 *
 * 1. **Structure** — `Releve (projet) → Chantier → Batiment → Etage → Zone → Piece`. Tables relationnelles
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
  BatimentId, ChantierId, ElementId, EtageId, MediaId, PieceId, ReleveId, TenantId, UserId, VersionId, ZoneId,
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

/** Niveaux de la hiérarchie, de la racine à la feuille (tous créables sans scan). */
export const RELEVE_HIERARCHY_LEVELS = ["projet", "chantier", "batiment", "etage", "zone", "piece"] as const;
export type ReleveHierarchyLevel = (typeof RELEVE_HIERARCHY_LEVELS)[number];

/**
 * « Site principal » du projet : libellé local toujours présent, référence faible facultative
 * vers `chantiers` Gestion Pro (GP reste autoritaire, jamais Tools). Il sert d'en-tête de liste
 * et amorce le premier {@link Chantier} du projet ; la hiérarchie elle-même passe par les
 * chantiers (`tools_releves_chantiers`), un projet pouvant en couvrir plusieurs.
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

/** Lot 3 : avancement d'un chantier de relevé. */
export const CHANTIER_STATUTS = ["a_planifier", "en_cours", "termine", "archive"] as const;
export type ChantierStatut = (typeof CHANTIER_STATUTS)[number];

/** Chantier d'un projet relevé : un site physique, lié ou non à un chantier Gestion Pro. */
export type Chantier = EntityMeta & {
  readonly id: ChantierId;
  readonly releveId: ReleveId;
  readonly nom: string;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  /** `chantiers.id` Gestion Pro, si rattaché (même entreprise exigée par le serveur). */
  readonly gpChantierId: string | null;
  readonly ordre: number;
  readonly notes: string | null;
  /** Lot 3 (facultatifs côté lecture : absents d'un cache antérieur). */
  readonly clientNom?: string | null;
  /** `clients.id` Gestion Pro : rattachement préparé, jamais autoritaire côté Tools. */
  readonly clientGpId?: string | null;
  readonly reference?: string | null;
  readonly description?: string | null;
  /** Date du relevé sur ce chantier (AAAA-MM-JJ). */
  readonly dateReleve?: string | null;
  readonly statut?: ChantierStatut;
};

export type Batiment = EntityMeta & {
  readonly id: BatimentId;
  readonly releveId: ReleveId;
  readonly chantierId: ChantierId;
  readonly nom: string;
  readonly ordre: number;
  readonly notes: string | null;
};

/** État de l'étage : relevé de l'existant ou variante projet (plan rénové, lot 14). */
export const ETAGE_ETATS = ["existant", "projet"] as const;
export type EtageEtat = (typeof ETAGE_ETATS)[number];

export const ETAGE_NIVEAU_MIN = -10;
export const ETAGE_NIVEAU_MAX = 200;

/**
 * Lot 3 : nature du niveau, indépendante de son numéro. « Combles », « Entresol » ou
 * « Sous-sol 2 » se saisissent librement (nom) sans être forcés à un entier.
 */
export const ETAGE_CATEGORIES = ["sous_sol", "rdc", "entresol", "etage", "combles", "toiture", "exterieur", "autre"] as const;
export type EtageCategorie = (typeof ETAGE_CATEGORIES)[number];

export type Etage = EntityMeta & {
  readonly id: EtageId;
  readonly releveId: ReleveId;
  readonly batimentId: BatimentId;
  readonly nom: string;
  /**
   * 0 = rez-de-chaussée, négatif = sous-sol. Lot 3 : FACULTATIF et décimal (pas de 0,5 ;
   * `null` pour des combles non numérotés). Réservé au tri et au futur calage altimétrique.
   */
  readonly niveau: number | null;
  /** Lot 3 (absent d'un cache antérieur : déduit du niveau). */
  readonly categorieNiveau?: EtageCategorie;
  readonly altitudeMm: number | null;
  readonly hauteurSousPlafondMm: number | null;
  readonly etat: EtageEtat;
  readonly ordre: number;
};

/** Lot 3 : aile, secteur, appartement, plateau, zone technique ajoutés (sans retrait). */
export const ZONE_TYPES = [
  "logement", "lot", "parties_communes", "local_technique", "exterieur", "autre",
  "aile", "secteur", "appartement", "plateau", "zone_technique",
] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export type Zone = EntityMeta & {
  readonly id: ZoneId;
  readonly releveId: ReleveId;
  readonly etageId: EtageId;
  readonly nom: string;
  readonly type: ZoneType;
  readonly ordre: number;
  readonly commentaire?: string | null;
};

/** Lot 3 : circulation, local technique, stockage ajoutés (sans retrait). */
export const PIECE_USAGES = [
  "sejour", "chambre", "cuisine", "salle_de_bain", "salle_d_eau", "wc", "entree", "degagement",
  "bureau", "cellier", "buanderie", "garage", "cave", "combles", "escalier", "exterieur", "autre",
  "circulation", "local_technique", "stockage",
] as const;
export type PieceUsage = (typeof PIECE_USAGES)[number];
/** Types proposés en premier sur le terrain (cahier Lot 3), les autres restent disponibles. */
export const PIECE_TYPES_PRINCIPAUX = [
  "bureau", "chambre", "sejour", "cuisine", "wc", "salle_de_bain", "circulation", "local_technique", "stockage", "exterieur", "autre",
] as const satisfies readonly PieceUsage[];

/** Lot 3 : avancement du relevé d'une pièce. */
export const PIECE_STATUTS = ["a_relever", "en_cours", "relevee", "verifiee"] as const;
export type PieceStatut = (typeof PIECE_STATUTS)[number];

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
  /** Lot 3 (facultatifs côté lecture). */
  readonly commentaire?: string | null;
  readonly statut?: PieceStatut;
  /** Surface déclarée sur le terrain (mm²), en attendant la surface calculée du lot 5. */
  readonly surfaceDeclareeMm2?: number | null;
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

/**
 * Ancrage spatial : un point sur un étage (mm), une entité, ou — Lot 4 — un point du **plan
 * futur** d'un étage en coordonnées normalisées (0–1, origine en haut à gauche) : le plan
 * n'existe pas encore (lot 5), la position relative est conservée et sera recalée dessus.
 */
export type Ancre =
  | { readonly kind: "point"; readonly etageId: EtageId; readonly point: Point2D }
  | { readonly kind: "entite"; readonly ref: EntityRef }
  | { readonly kind: "plan"; readonly etageId: EtageId; readonly x: number; readonly y: number };

export const MUR_TYPES = ["exterieur", "porteur", "cloison", "doublage"] as const;
export type MurType = (typeof MUR_TYPES)[number];
export type MurDonnees = {
  readonly a: Point2D;
  readonly b: Point2D;
  readonly epaisseurMm: number;
  readonly hauteurMm: number | null;
  readonly typeMur: MurType;
  /** Recovery V2 (facultatif) : pièces bordées par le mur, en plus de `pieceId` (mur mitoyen). */
  readonly piecesAdjacentesIds?: readonly PieceId[];
  /** Recovery V2 (facultatif) : matériau / revêtement du mur (élément `materiau`). */
  readonly materiauId?: ElementId | null;
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
  /** Recovery V2 (facultatif) : attributs métier libres (menuiserie, vitrage…), objet JSON. */
  readonly metadata?: Readonly<Record<string, unknown>>;
};
/** Catégories métier d'ouverture demandées par le contrat produit. */
export const OUVERTURE_FAMILLES = { porte: ["porte", "porte_fenetre"], fenetre: ["fenetre"], baie: ["baie"], ouverture_libre: ["tremie", "passage"] } as const satisfies Record<string, readonly OuvertureType[]>;

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

/** Recovery V2 : `largeur`, `distance` (distance libre) et `volume` ajoutés, sans retrait. */
export const MESURE_TYPES = ["longueur", "largeur", "hauteur", "diagonale", "distance", "angle", "surface", "volume"] as const;
export type MesureType = (typeof MESURE_TYPES)[number];
export const MESURE_UNITES = ["mm", "rad", "mm2", "mm3"] as const;
export type MesureUnite = (typeof MESURE_UNITES)[number];
/** Unité imposée par type de mesure (miroir du CHECK SQL). */
export function mesureUniteAttendue(type: MesureType): MesureUnite {
  return type === "angle" ? "rad" : type === "surface" ? "mm2" : type === "volume" ? "mm3" : "mm";
}
/**
 * Provenance d'une mesure. `calcule` : déduite de la géométrie. `ar` et `lidar` sont réservés :
 * aucune capture n'existe au lot 2.
 */
export const MESURE_SOURCES = ["manuel", "calcule", "laser", "photo", "ar", "lidar"] as const;
export type MesureSource = (typeof MESURE_SOURCES)[number];
export type MesureMode = "manuel" | "calcule" | "capture";
/** Classement manuel / calculé / capturé demandé par le contrat produit. */
export function mesureMode(source: MesureSource): MesureMode {
  return source === "manuel" ? "manuel" : source === "calcule" ? "calcule" : "capture";
}
export type MesureDonnees = {
  readonly cible: EntityRef;
  readonly typeMesure: MesureType;
  readonly valeur: number;
  readonly unite: MesureUnite;
  readonly source: MesureSource;
  readonly precisionMm: number | null;
  readonly priseLe: IsoDateTime;
};

/**
 * Lot 4 — repère posé SUR la photo : position normalisée (0–1 de la largeur / hauteur de
 * l'image redressée), objet du relevé qu'il désigne, libellé et ordre. C'est le point d'appui
 * du futur plan : « ce coin de la photo est le mur M, ce boîtier est l'équipement E ».
 */
export type PhotoRepere = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly ordre: number;
  readonly cible: EntityRef | null;
};

export type PhotoAnchorDonnees = {
  readonly mediaId: MediaId;
  readonly ancre: Ancre;
  readonly directionRad: number | null;
  readonly legende: string | null;
  /** Lot 4 (facultatif) : rang de la photo parmi celles du même objet. */
  readonly ordre?: number;
  /** Lot 4 (facultatif) : repères posés sur la photo. */
  readonly reperes?: readonly PhotoRepere[];
};

/** Recovery V2 : forme d'annotation (absente = `texte`, rétro-compatible). Aucun éditeur au lot 2. */
export const ANNOTATION_FORMES = ["texte", "fleche", "cercle", "zone", "cote", "symbole", "commentaire"] as const;
export type AnnotationForme = (typeof ANNOTATION_FORMES)[number];
/** Formes qui exigent un texte ; les autres le rendent facultatif (chaîne vide admise). */
export const ANNOTATION_FORMES_TEXTUELLES = ["texte", "commentaire"] as const satisfies readonly AnnotationForme[];
export type AnnotationDonnees = {
  readonly ancre: Ancre;
  readonly texte: string;
  readonly forme?: AnnotationForme;
  /** Géométrie de la forme (points en mm dans le repère de l'étage) : contrat ouvert, lot éditeur. */
  readonly geometrie?: Readonly<Record<string, unknown>> | null;
  /** Note vocale (catégorie de stockage `annotations`), lot 11. */
  readonly mediaAudioId: MediaId | null;
};

export const MATERIAU_CATEGORIES = ["sol", "mur", "plafond", "plinthe", "menuiserie", "autre"] as const;
export type MateriauCategorie = (typeof MATERIAU_CATEGORIES)[number];
/** Recovery V2 : nature du revêtement (facultative). Pas de catalogue : simple typage. */
export const REVETEMENT_TYPES = [
  "peinture", "carrelage", "faience", "parquet", "stratifie", "moquette", "pvc", "panneau_decoratif",
  "papier_peint", "enduit", "beton", "autre",
] as const;
export type RevetementType = (typeof REVETEMENT_TYPES)[number];
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
  readonly revetement?: RevetementType | null;
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
  /** Recovery V2 (facultatif) : objets mesurés (pièce, mur, ouverture…) dont la quantité dérive. */
  readonly sources?: readonly EntityRef[];
  /** Recovery V2 (facultatif) : ouvrage GP visé (`modeles_devis.id`, bibliothèque d'ouvrages), jamais un prix. */
  readonly gpOuvrageRef?: string | null;
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

/** Portes : ouvertures franchissables. */
export const PORTE_TYPES = ["porte", "porte_fenetre"] as const satisfies readonly OuvertureType[];
/** Fenêtres : ouvertures vitrées non franchissables (la porte-fenêtre est une porte). */
export const FENETRE_TYPES = ["fenetre", "baie"] as const satisfies readonly OuvertureType[];
export type Porte = Ouverture & { readonly donnees: OuvertureDonnees & { readonly typeOuverture: (typeof PORTE_TYPES)[number] } };
export type Fenetre = Ouverture & { readonly donnees: OuvertureDonnees & { readonly typeOuverture: (typeof FENETRE_TYPES)[number] } };
export function isPorte(element: ReleveElement): element is Porte {
  return element.type === "ouverture" && (PORTE_TYPES as readonly string[]).includes((element as Ouverture).donnees.typeOuverture);
}
export function isFenetre(element: ReleveElement): element is Fenetre {
  return element.type === "ouverture" && (FENETRE_TYPES as readonly string[]).includes((element as Ouverture).donnees.typeOuverture);
}

// Noms du cahier des charges (anglais) : alias stricts des entités françaises persistées.
export type Wall = Mur;
export type Opening = Ouverture;
export type Door = Porte;
export type Window = Fenetre;
export type Equipment = Equipement;
export type Measurement = Mesure;
export type Material = Materiau;
export type Quantity = Quantite;

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

/**
 * Nature d'une version (miroir du CHECK SQL `tools_releves_versions.type_version`) :
 * - `initial` : relevé de l'existant — unique, toujours la première version ;
 * - `corrige` : correction d'une version précédente ;
 * - `projete` : état projeté (plan rénové, étages `etat = 'projet'`) ;
 * - `as_built` : état réellement construit / réceptionné (DOE).
 */
export const VERSION_TYPES = ["initial", "corrige", "projete", "as_built"] as const;
export type VersionType = (typeof VERSION_TYPES)[number];
/** Vocabulaire du cahier des charges → valeur persistée. */
export const VERSION_TYPE_ALIASES = { initial: "initial", corrected: "corrige", projected: "projete", "as-built": "as_built" } as const satisfies Record<string, VersionType>;
export const VERSION_TYPE_LABELS: Record<VersionType, string> = {
  initial: "Initiale", corrige: "Corrigée", projete: "Projetée", as_built: "Tel que construit",
};

/** Instantané immuable, distinct de la révision de synchronisation. */
export type Version = {
  readonly id: VersionId;
  readonly entrepriseId: TenantId;
  readonly releveId: ReleveId;
  readonly numero: number;
  readonly typeVersion: VersionType;
  /** Version dont celle-ci dérive (null pour l'initiale). */
  readonly versionBaseId: VersionId | null;
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
  readonly chantiers: readonly Chantier[];
  readonly batiments: readonly Batiment[];
  readonly etages: readonly Etage[];
  readonly zones: readonly Zone[];
  readonly pieces: readonly Piece[];
};

export type ReleveAggregate = ReleveStructure & {
  readonly elements: readonly ReleveElement[];
  readonly medias: readonly MediaFile[];
};
