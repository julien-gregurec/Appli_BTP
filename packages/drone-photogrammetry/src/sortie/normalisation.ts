/**
 * Normalisation des sorties moteur (§10, §11 du brief prototype).
 *
 * Chaque moteur nomme ses fichiers à sa façon. Le noyau, lui, ne connaît que
 * six emplacements — `point_cloud`, `mesh`, `texture`, `orthophoto`,
 * `digital_surface_model`, `lightweight_glb` — et chacun est une **référence de
 * stockage**, jamais une URL (`@elsatia/drone-core`, `storage-ref.ts`).
 *
 * Ce module fait cette traduction, et rien d'autre. C'est elle qui rend la
 * substitution ODM → Metashape indolore (§17).
 *
 * Règle de prudence : le format est confirmé par les octets d'en-tête quand ils
 * sont disponibles ; l'extension seule ne fait jamais autorité.
 */

import type {
  ReconstructionArtifacts,
  ReconstructionQualityMetrics,
  StorageObjectRef,
} from "@elsatia/drone-core";

import { ARTEFACTS_VIDES, type ParametresPrototype } from "../moteur/base";

export const FORMATS_ARTEFACT = [
  "laz",
  "las",
  "ply",
  "obj",
  "glb",
  "geotiff",
  "png",
  "jpeg",
  "json",
  "pdf",
  "zip",
  "inconnu",
] as const;
export type FormatArtefact = (typeof FORMATS_ARTEFACT)[number];

/** Emplacement d'artefact du noyau. */
export type ChampArtefact = keyof ReconstructionArtifacts;

export const CHAMPS_ARTEFACT: readonly ChampArtefact[] = [
  "point_cloud",
  "mesh",
  "texture",
  "orthophoto",
  "digital_surface_model",
  "lightweight_glb",
];

export type AssetMoteur = {
  /** Chemin relatif tel que le moteur le nomme, ex. `odm_orthophoto/odm_orthophoto.tif`. */
  nom: string;
  /** URL de récupération côté moteur. Elle ne quitte jamais l'adaptateur. */
  url: string;
  octets: number | null;
  /** Premiers octets, quand ils sont connus : confirment le format. */
  entete?: Uint8Array | null;
};

const EXTENSIONS: Array<[RegExp, FormatArtefact]> = [
  [/\.laz$/i, "laz"],
  [/\.las$/i, "las"],
  [/\.ply$/i, "ply"],
  [/\.obj$/i, "obj"],
  [/\.glb$/i, "glb"],
  [/\.(tif|tiff)$/i, "geotiff"],
  [/\.png$/i, "png"],
  [/\.(jpg|jpeg)$/i, "jpeg"],
  [/\.json$/i, "json"],
  [/\.pdf$/i, "pdf"],
  [/\.zip$/i, "zip"],
];

function texteEntete(octets: Uint8Array, longueur: number): string {
  let texte = "";
  for (let index = 0; index < Math.min(longueur, octets.length); index += 1) {
    texte += String.fromCharCode(octets[index]);
  }
  return texte;
}

/** Format déduit des octets. `null` quand la signature n'est pas reconnue. */
export function detecterFormatParEntete(octets: Uint8Array): FormatArtefact | null {
  if (octets.length < 4) return null;
  const quatre = texteEntete(octets, 4);
  if (quatre === "glTF") return "glb";
  if (quatre === "LASF") return "laz"; // LAS et LAZ partagent la signature ; l'extension tranche
  if (texteEntete(octets, 3) === "ply") return "ply";
  const tiffPetitBoutiste =
    octets[0] === 0x49 && octets[1] === 0x49 && octets[2] === 0x2a && octets[3] === 0x00;
  const tiffGrosBoutiste =
    octets[0] === 0x4d && octets[1] === 0x4d && octets[2] === 0x00 && octets[3] === 0x2a;
  if (tiffPetitBoutiste || tiffGrosBoutiste) return "geotiff";
  if (octets[0] === 0x89 && quatre.slice(1) === "PNG") return "png";
  if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return "jpeg";
  if (quatre === "%PDF") return "pdf";
  if (quatre.slice(0, 2) === "PK") return "zip";
  return null;
}

export function detecterFormat(nom: string, entete?: Uint8Array | null): FormatArtefact {
  const parExtension = EXTENSIONS.find(([motif]) => motif.test(nom))?.[1] ?? null;
  const parEntete = entete != null ? detecterFormatParEntete(entete) : null;
  if (parEntete === null) return parExtension ?? "inconnu";
  // `LASF` ne distingue pas LAS de LAZ : on garde le verdict de l'extension.
  if (parEntete === "laz" && parExtension === "las") return "las";
  return parEntete;
}

/**
 * Emplacement du noyau correspondant à un fichier moteur. `null` = fichier de
 * travail interne, qui n'a pas à être exposé.
 *
 * Les motifs couvrent la nomenclature ODM ; un moteur au vocabulaire différent
 * ajoute ses motifs ici, et nulle part ailleurs.
 */
export function deduireChampArtefact(nom: string): ChampArtefact | null {
  const chemin = nom.toLowerCase();
  if (chemin.includes("orthophoto")) return "orthophoto";
  if (chemin.includes("dsm") || chemin.includes("dtm") || chemin.includes("odm_dem")) {
    return "digital_surface_model";
  }
  // §72 — modèle allégé destiné au web et au mobile, distinct du maillage complet.
  if (chemin.includes("lightweight") || chemin.includes("allege")) return "lightweight_glb";
  if (chemin.includes("textured_model") || chemin.endsWith(".obj") || chemin.endsWith(".glb")) {
    return "mesh";
  }
  if (chemin.endsWith(".laz") || chemin.endsWith(".las") || chemin.endsWith(".ply")) {
    return "point_cloud";
  }
  if (chemin.includes("texturing") || chemin.includes("texture")) return "texture";
  return null;
}

/** Assemble les emplacements renseignés en un `ReconstructionArtifacts` complet. */
export function composerArtefacts(
  entrees: ReadonlyArray<{ champ: ChampArtefact; ref: StorageObjectRef }>,
): ReconstructionArtifacts {
  const artefacts: Record<ChampArtefact, StorageObjectRef | null> = { ...ARTEFACTS_VIDES };
  for (const entree of entrees) {
    // Premier arrivé, premier servi : un moteur qui propose deux fichiers pour
    // le même emplacement n'écrase pas silencieusement le précédent.
    if (artefacts[entree.champ] === null) artefacts[entree.champ] = entree.ref;
  }
  return artefacts;
}

/**
 * Confronte les artefacts obtenus aux artefacts demandés. Retourne la liste des
 * manques — un résultat incomplet reste un résultat, mais il ne doit jamais
 * être présenté comme complet.
 */
export function verifierCompletude(
  artefacts: ReconstructionArtifacts,
  parametres: ParametresPrototype,
): ChampArtefact[] {
  const manques: ChampArtefact[] = [];
  if (parametres.produce_point_cloud && artefacts.point_cloud === null) manques.push("point_cloud");
  if (parametres.produce_mesh && artefacts.mesh === null) manques.push("mesh");
  if (parametres.produce_orthophoto && artefacts.orthophoto === null) manques.push("orthophoto");
  if (parametres.produce_dsm && artefacts.digital_surface_model === null) {
    manques.push("digital_surface_model");
  }
  return manques;
}

function nombreDansObjet(source: unknown, chemin: string[]): number | null {
  let courant: unknown = source;
  for (const cle of chemin) {
    if (typeof courant !== "object" || courant === null) return null;
    courant = (courant as Record<string, unknown>)[cle];
  }
  return typeof courant === "number" && Number.isFinite(courant) ? courant : null;
}

/**
 * Extraction défensive des métriques du `stats.json` d'ODM/OpenSfM. Toute
 * valeur absente ou d'un type inattendu devient `null` : une métrique inventée
 * contaminerait le niveau de qualité présenté à l'utilisateur, que le noyau
 * refuse précisément de dériver automatiquement.
 */
export function extraireMetriquesOdm(
  stats: unknown,
  imagesFournies: number | null,
): ReconstructionQualityMetrics {
  const calibrees = nombreDansObjet(stats, [
    "reconstruction_statistics",
    "reconstructed_shots_count",
  ]);
  const gsdCm = nombreDansObjet(stats, ["processing_statistics", "average_gsd"]);

  return {
    reprojection_error_px: nombreDansObjet(stats, [
      "reconstruction_statistics",
      "reprojection_error_normalized",
    ]),
    // ODM exprime le GSD en cm/px, le noyau en mm/px.
    ground_sampling_distance_mm_px: gsdCm === null ? null : gsdCm * 10,
    control_point_error_m: null,
    // Le mode de positionnement n'est pas déductible du seul `stats.json`.
    source_accuracy: null,
    calibrated_cameras_count: calibrees,
    input_images_count: imagesFournies,
    retained_images_ratio:
      calibrees === null || imagesFournies === null || imagesFournies === 0
        ? null
        : calibrees / imagesFournies,
  };
}
