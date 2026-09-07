/**
 * Socle commun aux adaptateurs de moteur (§3 du brief prototype).
 *
 * **Le port n'est pas défini ici.** `ReconstructionEngineAdapter` appartient à
 * `@elsatia/drone-core` (`ports/reconstruction-engine.ts`) : le noyau porte le
 * contrat, ce paquet porte les implémentations. Redéfinir un second port
 * homonyme aurait créé deux architectures pour une seule application.
 *
 * Ce module n'ajoute que ce dont une *implémentation* a besoin et que le noyau
 * n'a pas à connaître : journalisation, horloge injectable, erreurs moteur
 * porteuses de contexte, validation d'une soumission avant de consommer du GPU.
 */

import type {
  EngineSubmission,
  ReconstructionArtifacts,
  ReconstructionErrorCategory,
  ReconstructionParameters,
  ReconstructionQualityMetrics,
  ReconstructionStatus,
} from "@elsatia/drone-core";

export type Horloge = () => Date;

export const horlogeSysteme: Horloge = () => new Date();

export type NiveauLog = "info" | "avertissement" | "erreur";

export type LigneLog = {
  /** Horodatage ISO-8601 UTC. */
  le: string;
  niveau: NiveauLog;
  message: string;
};

export function journaliser(horloge: Horloge, niveau: NiveauLog, message: string): LigneLog {
  return { le: horloge().toISOString(), niveau, message };
}

/** Aucun artefact produit. Valeur de départ, et valeur d'un échec sans sortie partielle. */
export const ARTEFACTS_VIDES: ReconstructionArtifacts = {
  point_cloud: null,
  mesh: null,
  texture: null,
  orthophoto: null,
  digital_surface_model: null,
  lightweight_glb: null,
};

/**
 * Aucune métrique connue. `null` partout est la bonne valeur tant que le moteur
 * n'a rien mesuré : le noyau interdit de dériver un niveau de qualité de
 * métriques absentes.
 */
export const METRIQUES_VIDES: ReconstructionQualityMetrics = {
  reprojection_error_px: null,
  ground_sampling_distance_mm_px: null,
  control_point_error_m: null,
  source_accuracy: null,
  calibrated_cameras_count: null,
  input_images_count: null,
  retained_images_ratio: null,
};

/**
 * Erreur d'adaptateur. Elle transporte tout ce que §21 du brief exige de
 * conserver : catégorie, message brut du moteur, logs, artefacts partiels.
 */
export class ErreurMoteur extends Error {
  readonly category: ReconstructionErrorCategory;
  readonly retryable: boolean;
  readonly engineMessage: string | null;
  readonly logs: LigneLog[];
  readonly partialArtifacts: ReconstructionArtifacts;

  constructor(
    category: ReconstructionErrorCategory,
    message: string,
    options: {
      retryable?: boolean;
      engineMessage?: string | null;
      logs?: LigneLog[];
      partialArtifacts?: ReconstructionArtifacts;
    } = {},
  ) {
    super(message);
    this.name = "ErreurMoteur";
    this.category = category;
    this.retryable = options.retryable ?? false;
    this.engineMessage = options.engineMessage ?? null;
    this.logs = options.logs ?? [];
    this.partialArtifacts = options.partialArtifacts ?? ARTEFACTS_VIDES;
  }
}

/** Nombre d'images sous lequel aucune reconstruction n'a de sens. */
export const IMAGES_MINIMUM = 3;

/**
 * Garde-fou commun à tous les adaptateurs. Il s'exécute **avant** le premier
 * appel réseau : une soumission invalide ne doit jamais atteindre le moteur, et
 * encore moins consommer du GPU.
 */
export function validerSoumission(submission: EngineSubmission): void {
  if (submission.input_urls.length < IMAGES_MINIMUM) {
    throw new ErreurMoteur(
      "input_insufficient",
      `Une reconstruction exige au moins ${IMAGES_MINIMUM} images, ${submission.input_urls.length} fournie(s)`,
    );
  }
  if (new Set(submission.input_urls).size !== submission.input_urls.length) {
    throw new ErreurMoteur("input_insufficient", "URL d'entrée dupliquée dans le jeu soumis");
  }
  for (const url of submission.input_urls) {
    let analysee: URL;
    try {
      analysee = new URL(url);
    } catch {
      throw new ErreurMoteur("input_insufficient", `URL d'entrée illisible : ${url}`);
    }
    // Les entrées sont des URL signées produites par le stockage ELSATIA (§22
    // du brief : rien qui vienne d'un nom de fichier client).
    if (analysee.protocol !== "https:" && analysee.protocol !== "http:") {
      throw new ErreurMoteur(
        "input_insufficient",
        `Protocole d'entrée refusé : ${analysee.protocol}`,
      );
    }
  }
}

/** Un statut dont on ne sort plus. Reprise du noyau, pour ne pas dupliquer la règle. */
export function estTerminal(statut: ReconstructionStatus): boolean {
  return statut === "completed" || statut === "failed" || statut === "cancelled";
}

/**
 * Paramètres de reconstruction du prototype, exprimés en JSON pour rester
 * conformes à `ReconstructionParameters` (opaque côté noyau, mais sérialisé de
 * façon stable pour l'idempotence).
 */
export type ParametresPrototype = {
  mesh_quality: "low" | "medium" | "high";
  /** Résolution d'orthophoto visée, en cm/px. `null` = laissée au moteur. */
  gsd_target_cm: number | null;
  produce_point_cloud: boolean;
  produce_mesh: boolean;
  produce_orthophoto: boolean;
  produce_dsm: boolean;
  /** Code EPSG de sortie. */
  crs: string;
};

export const PARAMETRES_PROTOTYPE_DEFAUT: ParametresPrototype = {
  mesh_quality: "medium",
  gsd_target_cm: null,
  produce_point_cloud: true,
  produce_mesh: true,
  produce_orthophoto: true,
  produce_dsm: true,
  crs: "EPSG:4326",
};

export const PARAMETRES_SUPPORTES: readonly string[] = Object.keys(PARAMETRES_PROTOTYPE_DEFAUT);

/**
 * Lit les paramètres opaques du noyau en paramètres typés. Toute clé inconnue
 * est **refusée** plutôt qu'ignorée : un paramètre silencieusement perdu
 * produirait une reconstruction différente de celle demandée, sous la même clé
 * d'idempotence.
 */
export function lireParametres(parametres: ReconstructionParameters): ParametresPrototype {
  const inconnues = Object.keys(parametres).filter((cle) => !PARAMETRES_SUPPORTES.includes(cle));
  if (inconnues.length > 0) {
    throw new ErreurMoteur(
      "input_insufficient",
      `Paramètre(s) non reconnu(s) : ${inconnues.join(", ")}`,
    );
  }

  const lu = { ...PARAMETRES_PROTOTYPE_DEFAUT };
  const qualite = parametres.mesh_quality;
  if (qualite !== undefined) {
    if (qualite !== "low" && qualite !== "medium" && qualite !== "high") {
      throw new ErreurMoteur("input_insufficient", `mesh_quality invalide : ${String(qualite)}`);
    }
    lu.mesh_quality = qualite;
  }
  const gsd = parametres.gsd_target_cm;
  if (gsd !== undefined && gsd !== null) {
    if (typeof gsd !== "number" || !Number.isFinite(gsd) || gsd <= 0) {
      throw new ErreurMoteur("input_insufficient", `gsd_target_cm invalide : ${String(gsd)}`);
    }
    lu.gsd_target_cm = gsd;
  }
  for (const cle of ["produce_point_cloud", "produce_mesh", "produce_orthophoto", "produce_dsm"] as const) {
    const valeur = parametres[cle];
    if (valeur !== undefined) {
      if (typeof valeur !== "boolean") {
        throw new ErreurMoteur("input_insufficient", `${cle} invalide : ${String(valeur)}`);
      }
      lu[cle] = valeur;
    }
  }
  const crs = parametres.crs;
  if (crs !== undefined) {
    if (typeof crs !== "string" || !/^EPSG:\d{4,6}$/.test(crs)) {
      throw new ErreurMoteur("input_insufficient", `crs invalide : ${String(crs)}`);
    }
    lu.crs = crs;
  }
  return lu;
}

/** Conversion inverse, pour construire une soumission depuis du code typé. */
export function ecrireParametres(parametres: ParametresPrototype): ReconstructionParameters {
  return { ...parametres };
}
