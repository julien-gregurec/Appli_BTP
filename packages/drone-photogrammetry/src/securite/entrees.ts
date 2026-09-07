/**
 * Sécurité des entrées média (§22 du brief prototype).
 *
 * Trois règles, non négociables :
 *  1. le type réel est décidé par les octets, jamais par l'extension ni par le
 *     `Content-Type` annoncé ;
 *  2. aucun chemin de stockage ne dérive d'un nom de fichier client — les
 *     références sont *générées* à partir d'identifiants typés du noyau ;
 *  3. aucun nom de fichier client n'atteint jamais un shell : les moteurs sont
 *     pilotés en HTTP (NodeODM) ou par API (Metashape), jamais par une ligne de
 *     commande construite à partir d'une entrée utilisateur.
 *
 * La forme des chemins vient du noyau (`buildStoragePath`) : l'`entreprise_id`
 * reste le premier segment, contrainte des policies `storage.objects`.
 */

import {
  buildStoragePath,
  estUuid,
  type DroneProjectId,
  type EntrepriseId,
  type MediaAssetId,
  type ReconstructionJobId,
  type StorageObjectRef,
} from "@elsatia/drone-core";

export const TYPES_MEDIA_ACCEPTES = ["image/jpeg", "image/png", "image/tiff"] as const;
export type TypeMediaAccepte = (typeof TYPES_MEDIA_ACCEPTES)[number];

export const EXTENSION_PAR_TYPE: Record<TypeMediaAccepte, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tif",
};

export const CODES_ERREUR_SECURITE = [
  "media_vide",
  "mime_non_supporte",
  "mime_incoherent",
  "identifiant_invalide",
  "nom_dangereux",
  "chemin_invalide",
] as const;
export type CodeErreurSecurite = (typeof CODES_ERREUR_SECURITE)[number];

export class ErreurSecuriteMedia extends Error {
  readonly code: CodeErreurSecurite;

  constructor(code: CodeErreurSecurite, message: string) {
    super(message);
    this.name = "ErreurSecuriteMedia";
    this.code = code;
  }
}

function commencePar(octets: Uint8Array, signature: number[], decalage = 0): boolean {
  if (octets.length < decalage + signature.length) return false;
  return signature.every((valeur, index) => octets[decalage + index] === valeur);
}

/** Détection par nombre magique. Retourne `null` si le format n'est pas reconnu. */
export function detecterTypeMedia(octets: Uint8Array): TypeMediaAccepte | null {
  if (commencePar(octets, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // TIFF petit-boutiste (II*) et gros-boutiste (MM*) — couvre aussi le DNG.
  if (commencePar(octets, [0x49, 0x49, 0x2a, 0x00])) return "image/tiff";
  if (commencePar(octets, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  return null;
}

/**
 * Nettoie un nom de fichier client **pour affichage uniquement**. Le résultat
 * ne doit jamais servir à construire un chemin : voir `construireRefMedia`.
 */
export function assainirNomAffichage(nom: string): string {
  const sansChemin = nom.split(/[\\/]/).pop() ?? "";
  const nettoye = sansChemin
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return nettoye.length > 0 ? nettoye : "media";
}

function exigerIdentifiants(identifiants: Record<string, string>): void {
  for (const [nom, valeur] of Object.entries(identifiants)) {
    if (!estUuid(valeur)) {
      throw new ErreurSecuriteMedia(
        "identifiant_invalide",
        `Identifiant ${nom} invalide : ${valeur}`,
      );
    }
  }
}

export type DemandeRefMedia = {
  entrepriseId: EntrepriseId;
  projetId: DroneProjectId;
  mediaId: MediaAssetId;
  type: TypeMediaAccepte;
};

/**
 * Référence de stockage **générée**. Aucune donnée client n'y entre : des
 * identifiants validés et une extension déduite du type réel, rien d'autre.
 */
export function construireRefMedia(demande: DemandeRefMedia): StorageObjectRef {
  exigerIdentifiants({
    entrepriseId: demande.entrepriseId,
    projetId: demande.projetId,
    mediaId: demande.mediaId,
  });
  return {
    bucket: "drone-medias",
    path: buildStoragePath({
      entreprise_id: demande.entrepriseId,
      project_id: demande.projetId,
      filename: `${demande.mediaId}.${EXTENSION_PAR_TYPE[demande.type]}`,
    }),
  };
}

/** Référence d'artefact de sortie, même discipline que l'entrée. */
export function construireRefArtefact(
  entrepriseId: EntrepriseId,
  projetId: DroneProjectId,
  jobId: ReconstructionJobId,
  nomArtefact: string,
): StorageObjectRef {
  exigerIdentifiants({ entrepriseId, projetId, jobId });
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(nomArtefact) || nomArtefact.includes("..")) {
    throw new ErreurSecuriteMedia("chemin_invalide", `Nom d'artefact refusé : ${nomArtefact}`);
  }
  return {
    bucket: "drone-resultats",
    path: buildStoragePath({
      entreprise_id: entrepriseId,
      project_id: projetId,
      filename: `${jobId}/${nomArtefact}`,
    }),
  };
}

export type MediaValide = {
  type: TypeMediaAccepte;
  nomAffichage: string;
  octets: number;
};

export type DemandeValidationMedia = {
  contenu: Uint8Array;
  mimeDeclare: string | null;
  nomFichier: string;
};

/**
 * Valide un média importé. Le `mimeDeclare` du client n'est *jamais* la source
 * de vérité : il n'est comparé au type réel que pour détecter une incohérence.
 */
export function validerMediaImporte(demande: DemandeValidationMedia): MediaValide {
  if (demande.contenu.length === 0) {
    throw new ErreurSecuriteMedia("media_vide", "Contenu vide");
  }
  if (/\u0000/.test(demande.nomFichier)) {
    throw new ErreurSecuriteMedia("nom_dangereux", "Nom de fichier contenant un octet nul");
  }
  const type = detecterTypeMedia(demande.contenu);
  if (type === null) {
    throw new ErreurSecuriteMedia(
      "mime_non_supporte",
      "Format non reconnu : seuls JPEG, PNG et TIFF sont acceptés",
    );
  }
  if (demande.mimeDeclare !== null && demande.mimeDeclare !== type) {
    throw new ErreurSecuriteMedia(
      "mime_incoherent",
      `Type déclaré ${demande.mimeDeclare} incohérent avec le contenu réel ${type}`,
    );
  }
  return {
    type,
    nomAffichage: assainirNomAffichage(demande.nomFichier),
    octets: demande.contenu.length,
  };
}
