/**
 * Contrat de stockage Relevé & Métré.
 *
 * Un bucket **privé** unique, `tools-releves`, sans URL publique. Chemin canonique :
 *
 *   {entrepriseId}/{releveId}/{categorie}/{mediaId}.{extension}
 *
 * - `entrepriseId` en tête : l'isolation tenant se lit dans le chemin et la policy Storage
 *   vérifie que le couple (entreprise, relevé) existe réellement en base.
 * - `releveId` : la propriété et la visibilité du relevé décident de l'accès (lecture = `view`,
 *   écriture = `edit`, exports = `export`, suppression = `delete`).
 * - `categorie` ∈ photos | annotations | documents | exports.
 * - `mediaId` : UUID généré côté client (reprise d'upload idempotente hors ligne).
 *
 * La même règle est appliquée par `tools_releve_storage_autorise()` côté SQL.
 */

import { isUuid, type MediaId, type ReleveId, type TenantId } from "./ids";
import { MEDIA_CATEGORIES, type MediaCategorie } from "./model";

export const RELEVE_STORAGE_BUCKET = "tools-releves";

export type MediaCategoryPolicy = {
  readonly mimeTypes: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  /** Action exigée pour déposer un fichier dans cette catégorie. */
  readonly writeAction: "edit" | "export";
  readonly description: string;
};

const MB = 1024 * 1024;

export const MEDIA_CATEGORY_POLICIES: Record<MediaCategorie, MediaCategoryPolicy> = {
  photos: {
    mimeTypes: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
    maxBytes: 15 * MB,
    writeAction: "edit",
    description: "Photos de terrain ancrées sur un étage, une pièce ou un élément.",
  },
  annotations: {
    mimeTypes: { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "image/png": "png" },
    maxBytes: 10 * MB,
    writeAction: "edit",
    description: "Notes vocales et croquis d'annotation.",
  },
  documents: {
    mimeTypes: { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" },
    maxBytes: 25 * MB,
    writeAction: "edit",
    description: "Documents joints : plans existants, diagnostics, notices.",
  },
  exports: {
    mimeTypes: { "application/pdf": "pdf", "image/vnd.dxf": "dxf", "image/svg+xml": "svg", "text/csv": "csv" },
    maxBytes: 50 * MB,
    writeAction: "export",
    description: "Exports générés : dossier PDF, DXF, SVG, CSV de métré.",
  },
};

/** Union de toutes les catégories : liste `allowed_mime_types` du bucket. */
export const RELEVE_STORAGE_MIME_TYPES = [...new Set(MEDIA_CATEGORIES.flatMap((categorie) => Object.keys(MEDIA_CATEGORY_POLICIES[categorie].mimeTypes)))];
export const RELEVE_STORAGE_MAX_BYTES = Math.max(...MEDIA_CATEGORIES.map((categorie) => MEDIA_CATEGORY_POLICIES[categorie].maxBytes));

export class ReleveStoragePathError extends Error {
  constructor(message: string) { super(message); this.name = "ReleveStoragePathError"; }
}

export type ReleveStoragePath = {
  readonly entrepriseId: TenantId;
  readonly releveId: ReleveId;
  readonly categorie: MediaCategorie;
  readonly mediaId: MediaId;
  readonly extension: string;
};

export function extensionForMime(categorie: MediaCategorie, mimeType: string): string {
  const extension = MEDIA_CATEGORY_POLICIES[categorie].mimeTypes[mimeType];
  if (!extension) throw new ReleveStoragePathError(`Type ${mimeType} refusé pour la catégorie ${categorie}.`);
  return extension;
}

export function buildStoragePath(input: { entrepriseId: TenantId; releveId: ReleveId; categorie: MediaCategorie; mediaId: MediaId; mimeType: string }): string {
  for (const [label, value] of [["entreprise", input.entrepriseId], ["relevé", input.releveId], ["média", input.mediaId]] as const) {
    if (!isUuid(value)) throw new ReleveStoragePathError(`Identifiant ${label} invalide.`);
  }
  if (!(MEDIA_CATEGORIES as readonly string[]).includes(input.categorie)) throw new ReleveStoragePathError("Catégorie inconnue.");
  return `${input.entrepriseId}/${input.releveId}/${input.categorie}/${input.mediaId}.${extensionForMime(input.categorie, input.mimeType)}`;
}

const PATH_PATTERN = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([a-z]+)\/([0-9a-f-]{36})\.([a-z0-9]{2,5})$/;

/** Décompose un chemin ; `null` pour toute forme non canonique (traversée, casse, suffixe…). */
export function parseStoragePath(path: string): ReleveStoragePath | null {
  const match = PATH_PATTERN.exec(path);
  if (!match) return null;
  const [, entrepriseId, releveId, categorie, mediaId, extension] = match;
  if (![entrepriseId, releveId, mediaId].every(isUuid)) return null;
  if (!(MEDIA_CATEGORIES as readonly string[]).includes(categorie)) return null;
  const policy = MEDIA_CATEGORY_POLICIES[categorie as MediaCategorie];
  if (!Object.values(policy.mimeTypes).includes(extension)) return null;
  return { entrepriseId: entrepriseId as TenantId, releveId: releveId as ReleveId, categorie: categorie as MediaCategorie, mediaId: mediaId as MediaId, extension };
}

/** Vérifie qu'un fichier respecte type et taille de sa catégorie avant tout envoi. */
export function checkMediaUpload(categorie: MediaCategorie, mimeType: string, bytes: number): { ok: true } | { ok: false; message: string } {
  const policy = MEDIA_CATEGORY_POLICIES[categorie];
  if (!policy.mimeTypes[mimeType]) return { ok: false, message: `Format ${mimeType || "inconnu"} non accepté pour ${categorie}.` };
  if (!Number.isInteger(bytes) || bytes <= 0) return { ok: false, message: "Fichier vide." };
  if (bytes > policy.maxBytes) return { ok: false, message: `Fichier trop volumineux (${Math.round(policy.maxBytes / MB)} Mo maximum).` };
  return { ok: true };
}
