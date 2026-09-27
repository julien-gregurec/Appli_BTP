/**
 * Médias Relevé & Métré (Lot 4) : port de persistance, implémentation mémoire et cas d'usage.
 *
 * Le port couvre les deux moitiés d'une photo : l'objet du bucket privé et les lignes
 * (`tools_releves_medias`, éléments `photo_anchor` / `annotation`). Chaque écriture est
 * **idempotente** (identifiants générés côté client, « déjà présent » = succès) : la file hors
 * ligne peut rejouer une étape interrompue sans créer de doublon.
 */

import { asElementId, asMediaId, newUuid, type ElementId, type MediaId, type ReleveId, type TenantId, type UserId } from "./ids";
import { validatePhotoMetadata, type PhotoMetadata } from "./media";
import type { Ancre, AnnotationDonnees, MediaFile, PhotoAnchorDonnees, PhotoRepere, Releve, ReleveElement, ReleveStructure, Version, VersionType } from "./model";
import { canPerform, type ReleveAction, type ReleveActorContext } from "./permissions";
import {
  annotationDraftOf, buildPhotoAnnotation, isAnnotationOfAnchor, photoAnchorsOf, resolvePhotoPlacement,
  type PhotoAnnotationDraft, type PhotoTarget,
} from "./photo";
import { ReleveNotFoundError, type ReleveRepository } from "./repository";
import { RelevePermissionError } from "./service";
import { buildStoragePath, checkMediaUpload, parseStoragePath, RELEVE_SIGNED_URL_TTL_SECONDS, signedUrlRequest } from "./storage";
import type { QueueHooks } from "./upload-queue";
import { unwrapValidation, validateElementDraft, ReleveValidationError } from "./validation";

export type PhotoMedia = MediaFile & {
  readonly metadata: Partial<PhotoMetadata>;
  /** Commentaire libre de la photo (≠ annotation graphique). */
  readonly commentaire: string | null;
  /** État du bâtiment documenté par la photo (existant = `initial`, corrigé, projeté, tel que construit). */
  readonly etatDocumente: VersionType;
  /** Dernière version figée au dépôt (imposée par le serveur) : la photo appartient à l'état qui la suit. */
  readonly versionReferenceId: string | null;
  /** Miniature JPEG de galerie (même dossier `photos`), absente sur les photos antérieures. */
  readonly miniatureStoragePath: string | null;
};

export const PHOTO_COMMENT_MAX = 2000;

export type NewMediaRow = {
  id: MediaId; releveId: ReleveId; entrepriseId: TenantId; categorie: "photos"; storagePath: string;
  mimeType: string; tailleOctets: number; nomFichier: string | null; metadata: PhotoMetadata;
  miniatureStoragePath: string | null; commentaire: string | null; etatDocumente: VersionType;
};

export type MediaPatch = { commentaire?: string | null; etatDocumente?: VersionType };

/** Résultat serveur d'un retrait / remplacement : chemins à supprimer et verrou de version. */
export type RetiredFiles = { storagePath: string; miniaturePath: string | null; fige: boolean };
export type NewElementRow = {
  id: ElementId; releveId: ReleveId; type: "photo_anchor" | "annotation"; etageId: string | null; pieceId: string | null;
  donnees: Record<string, unknown>;
};

/** Nature d'un échec distant : seule `network` justifie une nouvelle tentative automatique. */
export type MediaFailureKind = "network" | "forbidden" | "invalid" | "not_found" | "duplicate" | "other";
export class MediaRemoteError extends Error {
  constructor(message: string, public readonly kind: MediaFailureKind, public readonly code?: string) { super(message); this.name = "MediaRemoteError"; }
}

export type WriteOutcome = "created" | "exists";

export interface ReleveMediaRepository {
  /** Photos (actives et, si demandé, retirées) + éléments actifs du relevé. */
  loadMediaContext(releveId: ReleveId, options?: { includeDeletedPhotos?: boolean }): Promise<{ medias: PhotoMedia[]; elements: ReleveElement[] }>;
  uploadObject(path: string, bytes: Blob | Uint8Array, mimeType: string): Promise<WriteOutcome>;
  removeObjects(paths: readonly string[]): Promise<string[]>;
  signedUrl(path: string, expiresIn: number): Promise<string>;
  /** Signature groupée (une requête pour une page de galerie) ; chemins refusés absents du résultat. */
  signedUrls(paths: readonly string[], expiresIn: number): Promise<Record<string, string>>;
  insertMedia(row: NewMediaRow): Promise<WriteOutcome>;
  /** Commentaire / état documenté, avec contrôle de révision (jamais d'écrasement silencieux). */
  updateMedia(id: MediaId, patch: MediaPatch, expectedRevision: number): Promise<PhotoMedia>;
  insertElement(row: NewElementRow): Promise<WriteOutcome>;
  updateElementDonnees(id: ElementId, donnees: Record<string, unknown>, expectedRevision: number): Promise<ReleveElement>;
  setElementDeleted(id: ElementId, deleted: boolean): Promise<void>;
  /** Retrait atomique (serveur) : média + ses ancres + leurs annotations. */
  deletePhoto(mediaId: MediaId): Promise<RetiredFiles>;
  /** Remplacement atomique (serveur) : les ancres pointent sur le nouveau média, l'ancien est retiré. */
  replacePhoto(oldMediaId: MediaId, newMediaId: MediaId): Promise<RetiredFiles>;
}

// ── Implémentation mémoire ────────────────────────────────────────────────────

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Dépôt mémoire : reproduit l'idempotence, la suppression douce et les RPC atomiques du
 * serveur. `online = false` simule une coupure réseau (toutes les écritures échouent en `network`).
 */
export class InMemoryReleveMediaRepository implements ReleveMediaRepository {
  readonly objects = new Map<string, { bytes: number; mimeType: string; owner: UserId }>();
  readonly medias = new Map<string, Mutable<PhotoMedia>>();
  readonly elements = new Map<string, Mutable<ReleveElement>>();
  /** Médias référencés par une version figée (miroir de `tools_releve_media_fige`). */
  readonly frozen = new Set<string>();
  online = true;
  constructor(public actorId: UserId, private readonly tenantId: TenantId, private readonly now: () => string = () => new Date().toISOString()) {}

  private guard() { if (!this.online) throw new MediaRemoteError("Réseau indisponible.", "network"); }
  private meta(entrepriseId: TenantId) {
    const at = this.now();
    return { entrepriseId, createdAt: at, updatedAt: at, createdBy: this.actorId, updatedBy: this.actorId, revision: 1, deletedAt: null };
  }

  async loadMediaContext(releveId: ReleveId, options: { includeDeletedPhotos?: boolean } = {}) {
    this.guard();
    return {
      medias: [...this.medias.values()].filter((media) => media.releveId === releveId && (options.includeDeletedPhotos || !media.deletedAt)).map((media) => ({ ...media })),
      elements: [...this.elements.values()].filter((element) => element.releveId === releveId && !element.deletedAt).map((element) => ({ ...element })),
    };
  }

  async uploadObject(path: string, bytes: Blob | Uint8Array, mimeType: string): Promise<WriteOutcome> {
    this.guard();
    if (this.objects.has(path)) return "exists";
    const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
    this.objects.set(path, { bytes: size, mimeType, owner: this.actorId });
    return "created";
  }

  async removeObjects(paths: readonly string[]) {
    this.guard();
    return paths.filter((path) => this.objects.delete(path));
  }

  async signedUrl(path: string, expiresIn: number) {
    this.guard();
    if (!this.objects.has(path)) throw new MediaRemoteError("Fichier introuvable.", "not_found");
    return `memory://${path}?expires=${expiresIn}`;
  }

  async signedUrls(paths: readonly string[], expiresIn: number) {
    this.guard();
    return Object.fromEntries(paths.filter((path) => this.objects.has(path)).map((path) => [path, `memory://${path}?expires=${expiresIn}`]));
  }

  async insertMedia(row: NewMediaRow): Promise<WriteOutcome> {
    this.guard();
    if (this.medias.has(row.id)) return "exists";
    if (!this.objects.has(row.storagePath)) throw new MediaRemoteError("Fichier non déposé.", "invalid");
    const doublon = [...this.medias.values()].some((media) => media.releveId === row.releveId && !media.deletedAt && media.metadata.empreinteSha256 === row.metadata.empreinteSha256);
    if (doublon) throw new MediaRemoteError("Cette photo est déjà dans le relevé.", "duplicate");
    this.medias.set(row.id, {
      ...this.meta(row.entrepriseId), id: row.id, releveId: row.releveId, categorie: row.categorie, storagePath: row.storagePath, mimeType: row.mimeType,
      tailleOctets: row.tailleOctets, nomFichier: row.nomFichier, metadata: row.metadata, commentaire: row.commentaire, etatDocumente: row.etatDocumente,
      versionReferenceId: null, miniatureStoragePath: row.miniatureStoragePath,
    });
    return "created";
  }

  async updateMedia(id: MediaId, patch: MediaPatch, expectedRevision: number) {
    this.guard();
    const media = this.medias.get(id);
    if (!media || media.deletedAt) throw new MediaRemoteError("Photo introuvable.", "not_found");
    if (media.revision !== expectedRevision) throw new MediaRemoteError("Modifiée ailleurs : rechargez.", "invalid", "conflict");
    if (patch.commentaire !== undefined) media.commentaire = patch.commentaire;
    if (patch.etatDocumente !== undefined) media.etatDocumente = patch.etatDocumente;
    media.revision += 1; media.updatedAt = this.now();
    return { ...media };
  }

  async insertElement(row: NewElementRow): Promise<WriteOutcome> {
    this.guard();
    if (this.elements.has(row.id)) return "exists";
    this.elements.set(row.id, {
      ...this.meta(this.tenantId), id: row.id, releveId: row.releveId, type: row.type, etageId: row.etageId as never, pieceId: row.pieceId as never,
      parentElementId: null, schemaVersion: 1, donnees: row.donnees as never,
    });
    return "created";
  }

  async updateElementDonnees(id: ElementId, donnees: Record<string, unknown>, expectedRevision: number) {
    this.guard();
    const element = this.elements.get(id);
    if (!element || element.deletedAt) throw new MediaRemoteError("Élément introuvable.", "not_found");
    if (element.revision !== expectedRevision) throw new MediaRemoteError("Modifié ailleurs : rechargez.", "invalid", "conflict");
    element.donnees = donnees as never; element.revision += 1; element.updatedAt = this.now();
    return { ...element };
  }

  async setElementDeleted(id: ElementId, deleted: boolean) {
    this.guard();
    const element = this.elements.get(id);
    if (!element) throw new MediaRemoteError("Élément introuvable.", "not_found");
    element.deletedAt = deleted ? this.now() : null; element.revision += 1;
  }

  private retired(media: PhotoMedia): RetiredFiles {
    return { storagePath: media.storagePath, miniaturePath: media.miniatureStoragePath, fige: this.frozen.has(media.id) };
  }

  private retireAnchorsOf(mediaId: string, at: string) {
    for (const anchor of photoAnchorsOf([...this.elements.values()], mediaId)) {
      (this.elements.get(anchor.id) as Mutable<ReleveElement>).deletedAt = at;
      for (const element of this.elements.values()) if (!element.deletedAt && isAnnotationOfAnchor(element, anchor.id)) (element as Mutable<ReleveElement>).deletedAt = at;
    }
  }

  async deletePhoto(mediaId: MediaId) {
    this.guard();
    const media = this.medias.get(mediaId);
    if (!media || media.deletedAt) throw new MediaRemoteError("Photo introuvable.", "not_found");
    const at = this.now();
    media.deletedAt = at; media.revision += 1;
    this.retireAnchorsOf(mediaId, at);
    return this.retired(media);
  }

  async replacePhoto(oldMediaId: MediaId, newMediaId: MediaId) {
    this.guard();
    const previous = this.medias.get(oldMediaId); const next = this.medias.get(newMediaId);
    if (!previous || previous.deletedAt || !next || next.deletedAt || previous.releveId !== next.releveId) throw new MediaRemoteError("Photos introuvables.", "not_found");
    const at = this.now();
    for (const anchor of photoAnchorsOf([...this.elements.values()], oldMediaId)) {
      const row = this.elements.get(anchor.id) as Mutable<ReleveElement<"photo_anchor">>;
      // Les annotations dessinées sur l'ancienne image n'ont plus de sens sur la nouvelle.
      for (const element of this.elements.values()) if (!element.deletedAt && isAnnotationOfAnchor(element, anchor.id)) (element as Mutable<ReleveElement>).deletedAt = at;
      row.donnees = { ...row.donnees, mediaId: newMediaId, reperes: [] }; row.revision += 1;
    }
    if (!next.commentaire && previous.commentaire) next.commentaire = previous.commentaire;
    previous.deletedAt = at; previous.revision += 1;
    return this.retired(previous);
  }
}

// ── Cas d'usage ───────────────────────────────────────────────────────────────

export type PhotoEntry = {
  readonly media: PhotoMedia;
  readonly anchors: readonly ReleveElement<"photo_anchor">[];
  readonly annotations: readonly ReleveElement<"annotation">[];
};

export type PhotoLibrary = {
  readonly structure: ReleveStructure;
  /** Versions figées du relevé (libellé de la version de référence d'une photo). */
  readonly versions: readonly Version[];
  readonly photos: readonly PhotoEntry[];
  /** Murs et équipements actifs (cibles de rattachement). */
  readonly targets: readonly ReleveElement[];
  readonly elements: readonly ReleveElement[];
};

export type PreparedPhoto = {
  readonly mediaId: MediaId;
  readonly anchorId: ElementId;
  readonly storagePath: string;
  readonly miniaturePath: string | null;
  readonly media: NewMediaRow;
  readonly anchor: NewElementRow;
};

export class ReleveMediaService {
  constructor(
    private readonly media: ReleveMediaRepository,
    private readonly releves: ReleveRepository,
    private readonly actor: ReleveActorContext,
    private readonly uuid: () => string = () => newUuid(),
  ) {}

  private async subject(releveId: ReleveId, action: ReleveAction): Promise<ReleveStructure> {
    const structure = await this.releves.getStructure(releveId);
    if (!structure || structure.releve.entrepriseId !== this.actor.tenantId) throw new ReleveNotFoundError("Relevé");
    this.require(action, structure.releve);
    return structure;
  }

  private require(action: ReleveAction, releve: Releve) {
    const decision = canPerform(this.actor, action, releve);
    if (!decision.allowed) throw new RelevePermissionError(action, decision.reason);
  }

  can(action: ReleveAction, releve: Releve): boolean { return canPerform(this.actor, action, releve).allowed; }

  /**
   * Suppression PHYSIQUE du fichier (miroir de la policy Storage 605) : qui peut supprimer le
   * relevé, ou l'auteur du dépôt tant qu'il peut encore modifier le relevé.
   */
  canRemoveFile(releve: Releve, media: Pick<MediaFile, "createdBy">): boolean {
    return this.can("delete", releve) || (media.createdBy === this.actor.userId && this.can("edit", releve));
  }

  async library(releveId: ReleveId): Promise<PhotoLibrary> {
    const structure = await this.subject(releveId, "view");
    const [{ medias, elements }, versions] = await Promise.all([
      this.media.loadMediaContext(releveId),
      this.releves.listVersions(releveId).catch(() => [] as Version[]),
    ]);
    const photos = medias
      .filter((media) => media.categorie === "photos" && !media.deletedAt)
      .map((media) => {
        // Rattachements actifs seulement : une photo dont toutes les cibles sont à la corbeille
        // (pièce, zone, bâtiment…) n'apparaît plus, elle revient à leur restauration.
        const anchors = photoAnchorsOf(elements, media.id).sort((a, b) => (a.donnees.ordre ?? 0) - (b.donnees.ordre ?? 0));
        const annotations = elements.filter((element) => anchors.some((anchor) => isAnnotationOfAnchor(element, anchor.id))) as ReleveElement<"annotation">[];
        return { media, anchors, annotations };
      })
      .sort((a, b) => (b.media.metadata.priseLe ?? b.media.createdAt).localeCompare(a.media.metadata.priseLe ?? a.media.createdAt));
    return { structure, versions, photos: photos.filter((photo) => photo.anchors.length > 0), targets: elements.filter((element) => element.type === "mur" || element.type === "equipement"), elements };
  }

  /**
   * Prépare le dépôt d'une photo (sans réseau) : contrôle de droits, de type, de taille, de
   * métadonnées et de cible, chemin canonique, lignes à écrire. Le résultat est ce que la file
   * hors ligne conserve jusqu'à la synchronisation.
   */
  preparePhoto(input: {
    structure: ReleveStructure; elements: readonly ReleveElement[]; target: PhotoTarget; mimeType: string; bytes: number;
    metadata: PhotoMetadata; nomFichier?: string | null; legende?: string | null; ordre?: number;
    /** Miniature de galerie (JPEG) déposée à côté de la photo. */
    thumbnail?: { bytes: number } | null; commentaire?: string | null; etatDocumente?: VersionType;
  }): PreparedPhoto {
    const { releve } = input.structure;
    this.require("edit", releve);
    const size = checkMediaUpload("photos", input.mimeType, input.bytes);
    if (!size.ok) throw new ReleveValidationError([{ path: "fichier", code: "out_of_range", message: size.message }]);
    const issues = validatePhotoMetadata(input.metadata);
    if (issues.length) throw new ReleveValidationError(issues.map((issue) => ({ path: `metadata.${issue.key}`, code: "invalid_format", message: issue.message })));
    const placement = resolvePhotoPlacement(input.target, input.structure, input.elements);
    const commentaire = normalizeCommentaire(input.commentaire);
    if (input.thumbnail && !checkMediaUpload("photos", "image/jpeg", input.thumbnail.bytes).ok) {
      throw new ReleveValidationError([{ path: "miniature", code: "out_of_range", message: "Miniature invalide." }]);
    }
    const mediaId = asMediaId(this.uuid()); const anchorId = asElementId(this.uuid());
    const storagePath = buildStoragePath({ entrepriseId: releve.entrepriseId, releveId: releve.id, categorie: "photos", mediaId, mimeType: input.mimeType });
    const miniaturePath = input.thumbnail
      ? buildStoragePath({ entrepriseId: releve.entrepriseId, releveId: releve.id, categorie: "photos", mediaId: asMediaId(this.uuid()), mimeType: "image/jpeg" })
      : null;
    const donnees: PhotoAnchorDonnees = { mediaId, ancre: placement.ancre, directionRad: null, legende: input.legende?.trim() || null, ordre: input.ordre ?? 0, reperes: [] };
    const anchorDraft = unwrapValidation(validateElementDraft({ type: "photo_anchor", etageId: placement.etageId, pieceId: placement.pieceId, donnees }));
    return {
      mediaId, anchorId, storagePath, miniaturePath,
      media: {
        id: mediaId, releveId: releve.id, entrepriseId: releve.entrepriseId, categorie: "photos", storagePath, mimeType: input.mimeType, tailleOctets: input.bytes,
        nomFichier: input.nomFichier?.slice(0, 260) ?? null, metadata: input.metadata, miniatureStoragePath: miniaturePath, commentaire,
        etatDocumente: input.etatDocumente ?? "initial",
      },
      anchor: { id: anchorId, releveId: releve.id, type: "photo_anchor", etageId: anchorDraft.etageId, pieceId: anchorDraft.pieceId, donnees: anchorDraft.donnees },
    };
  }

  /** URL de lecture courte (600 s), refusée pour un chemin d'un autre tenant ou relevé. */
  async photoUrl(releve: Releve, media: Pick<MediaFile, "storagePath">): Promise<string> {
    this.require("view", releve);
    const request = signedUrlRequest(media.storagePath, { entrepriseId: releve.entrepriseId, releveId: releve.id });
    return this.media.signedUrl(request.path, request.expiresIn ?? RELEVE_SIGNED_URL_TTL_SECONDS);
  }

  /**
   * URLs signées (600 s) des vignettes d'une page de galerie, en UNE requête : miniature si
   * elle existe, sinon la photo elle-même (photos antérieures au Lot 4). Clé : id du média.
   */
  async thumbnailUrls(releve: Releve, medias: readonly Pick<PhotoMedia, "id" | "storagePath" | "miniatureStoragePath">[]): Promise<Record<string, string>> {
    this.require("view", releve);
    const expected = { entrepriseId: releve.entrepriseId, releveId: releve.id };
    const byPath = new Map<string, string>();
    for (const media of medias) byPath.set(signedUrlRequest(media.miniatureStoragePath ?? media.storagePath, expected).path, media.id);
    if (!byPath.size) return {};
    const signed = await this.media.signedUrls([...byPath.keys()], RELEVE_SIGNED_URL_TTL_SECONDS);
    return Object.fromEntries(Object.entries(signed).map(([path, url]) => [byPath.get(path) as string, url]));
  }

  /**
   * Retire une photo : média, ancres et annotations (une transaction serveur), puis supprime
   * le fichier et sa miniature si l'acteur en a le droit ET qu'aucune version figée ne les
   * référence. Sinon les fichiers restent (version lisible, ou purge par un responsable /
   * purge RGPD de l'entreprise).
   */
  async deletePhoto(releve: Releve, media: PhotoMedia): Promise<FileRemoval> {
    this.require("edit", releve);
    return this.removeRetiredFiles(releve, media, await this.media.deletePhoto(media.id));
  }

  /** Remplace une photo déjà déposée par une autre (déjà déposée, voir `preparePhoto` + file). */
  async replacePhoto(releve: Releve, previous: PhotoMedia, nextMediaId: MediaId): Promise<FileRemoval> {
    this.require("edit", releve);
    return this.removeRetiredFiles(releve, previous, await this.media.replacePhoto(previous.id, nextMediaId));
  }

  private async removeRetiredFiles(releve: Releve, media: PhotoMedia, retired: RetiredFiles): Promise<FileRemoval> {
    if (retired.fige) return { fileRemoved: false, kept: "version" };
    if (!this.canRemoveFile(releve, media)) return { fileRemoved: false, kept: "droits" };
    const paths = [retired.storagePath, ...(retired.miniaturePath ? [retired.miniaturePath] : [])];
    const removed = await this.media.removeObjects(paths);
    return { fileRemoved: removed.includes(retired.storagePath), kept: null };
  }

  /**
   * Photo identique déjà active dans le relevé : mêmes octets déposés (SHA-256) ou même fichier
   * d'origine (SHA-256 avant ré-encodage). On ne la dépose pas deux fois.
   */
  findDuplicate(library: Pick<PhotoLibrary, "photos">, empreinteSha256: string, empreinteOrigineSha256?: string | null): PhotoEntry | null {
    return library.photos.find((photo) => photo.media.metadata.empreinteSha256 === empreinteSha256
      || (Boolean(empreinteOrigineSha256) && photo.media.metadata.empreinteOrigineSha256 === empreinteOrigineSha256)) ?? null;
  }

  async saveCommentaire(releve: Releve, media: PhotoMedia, commentaire: string | null): Promise<PhotoMedia> {
    this.require("edit", releve);
    return this.media.updateMedia(media.id, { commentaire: normalizeCommentaire(commentaire) }, media.revision);
  }

  async saveEtat(releve: Releve, media: PhotoMedia, etatDocumente: VersionType): Promise<PhotoMedia> {
    this.require("edit", releve);
    return this.media.updateMedia(media.id, { etatDocumente }, media.revision);
  }

  /**
   * Crochets de la file hors ligne : le remplacement passe par le service (droits, suppression
   * du fichier remplacé). Idempotent : si l'ancienne photo n'est plus active, rien à faire.
   */
  queueHooks(releve: Releve): Pick<QueueHooks, "replace"> {
    return {
      replace: async (item) => {
        if (!item.replaceMediaId) return;
        const { medias } = await this.media.loadMediaContext(releve.id);
        const previous = medias.find((media) => media.id === item.replaceMediaId && !media.deletedAt);
        if (previous) await this.replacePhoto(releve, previous, item.media.id);
      },
    };
  }

  /** Supprime les fichiers des photos retirées encore présents dans le bucket (responsables). */
  async purgeRetiredFiles(releveId: ReleveId): Promise<string[]> {
    const structure = await this.subject(releveId, "delete");
    const { medias } = await this.media.loadMediaContext(releveId, { includeDeletedPhotos: true });
    // Les fichiers figés par une version sont refusés par la policy Storage : ils restent.
    const paths = medias
      .filter((media) => media.deletedAt && parseStoragePath(media.storagePath)?.releveId === structure.releve.id)
      .flatMap((media) => [media.storagePath, ...(media.miniatureStoragePath ? [media.miniatureStoragePath] : [])]);
    return paths.length ? this.media.removeObjects(paths) : [];
  }

  private async anchorUpdate(releve: Releve, anchor: ReleveElement<"photo_anchor">, patch: Partial<PhotoAnchorDonnees>): Promise<ReleveElement<"photo_anchor">> {
    this.require("edit", releve);
    const donnees = { ...anchor.donnees, ...patch };
    unwrapValidation(validateElementDraft({ type: "photo_anchor", etageId: anchor.etageId, pieceId: anchor.pieceId, donnees }));
    return await this.media.updateElementDonnees(anchor.id, donnees as Record<string, unknown>, anchor.revision) as ReleveElement<"photo_anchor">;
  }

  saveReperes(releve: Releve, anchor: ReleveElement<"photo_anchor">, reperes: readonly PhotoRepere[]) {
    return this.anchorUpdate(releve, anchor, { reperes: [...reperes] });
  }

  saveLegende(releve: Releve, anchor: ReleveElement<"photo_anchor">, legende: string | null, ordre?: number) {
    return this.anchorUpdate(releve, anchor, { legende: legende?.trim() || null, ...(ordre !== undefined && { ordre }) });
  }

  /** Rattache une photo existante à une cible supplémentaire (une photo peut illustrer deux objets). */
  async attach(structure: ReleveStructure, elements: readonly ReleveElement[], media: PhotoMedia, target: PhotoTarget): Promise<ElementId> {
    this.require("edit", structure.releve);
    const placement = resolvePhotoPlacement(target, structure, elements);
    const donnees: PhotoAnchorDonnees = { mediaId: media.id, ancre: placement.ancre, directionRad: null, legende: null, ordre: photoAnchorsOf(elements, media.id).length, reperes: [] };
    const draft = unwrapValidation(validateElementDraft({ type: "photo_anchor", etageId: placement.etageId, pieceId: placement.pieceId, donnees }));
    const id = asElementId(this.uuid());
    await this.media.insertElement({ id, releveId: structure.releve.id, type: "photo_anchor", etageId: draft.etageId, pieceId: draft.pieceId, donnees: draft.donnees });
    return id;
  }

  async detach(releve: Releve, anchor: ReleveElement<"photo_anchor">, elements: readonly ReleveElement[]): Promise<void> {
    this.require("edit", releve);
    if (photoAnchorsOf(elements, anchor.donnees.mediaId).length <= 1) throw new ReleveValidationError([{ path: "ancre", code: "invariant_violated", message: "Une photo garde au moins un rattachement : retirez la photo à la place." }]);
    await this.media.setElementDeleted(anchor.id, true);
  }

  async annotate(releve: Releve, anchor: ReleveElement<"photo_anchor">, draft: PhotoAnnotationDraft): Promise<ElementId> {
    this.require("edit", releve);
    const donnees: AnnotationDonnees = buildPhotoAnnotation(anchor.id, draft);
    const valid = unwrapValidation(validateElementDraft({ type: "annotation", etageId: anchor.etageId, pieceId: anchor.pieceId, donnees }));
    const id = asElementId(this.uuid());
    await this.media.insertElement({ id, releveId: releve.id, type: "annotation", etageId: valid.etageId, pieceId: valid.pieceId, donnees: valid.donnees });
    return id;
  }

  /** Modifie une annotation (texte, couleur, position) avec contrôle de révision. */
  async updateAnnotation(releve: Releve, anchor: ReleveElement<"photo_anchor">, annotation: ReleveElement<"annotation">, patch: Partial<PhotoAnnotationDraft>): Promise<ReleveElement<"annotation">> {
    this.require("edit", releve);
    const current = annotationDraftOf(annotation);
    if (!current || !isAnnotationOfAnchor(annotation, anchor.id)) throw new ReleveValidationError([{ path: "annotation", code: "invariant_violated", message: "Annotation non modifiable." }]);
    const donnees = buildPhotoAnnotation(anchor.id, { ...current, ...patch, forme: current.forme } as PhotoAnnotationDraft);
    unwrapValidation(validateElementDraft({ type: "annotation", etageId: annotation.etageId, pieceId: annotation.pieceId, donnees }));
    return await this.media.updateElementDonnees(annotation.id, donnees as unknown as Record<string, unknown>, annotation.revision) as ReleveElement<"annotation">;
  }

  async removeAnnotation(releve: Releve, annotation: ReleveElement<"annotation">): Promise<void> {
    this.require("edit", releve);
    await this.media.setElementDeleted(annotation.id, true);
  }
}

/** Pourquoi un fichier retiré n'a pas été supprimé : figé par une version, ou droits insuffisants. */
export type FileRemoval = { fileRemoved: boolean; kept: "version" | "droits" | null };

export function normalizeCommentaire(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length > PHOTO_COMMENT_MAX) throw new ReleveValidationError([{ path: "commentaire", code: "out_of_range", message: `${PHOTO_COMMENT_MAX} caractères maximum.` }]);
  return text || null;
}

/** Ancre d'un PhotoAnchor (utilitaire d'affichage). */
export function anchorOf(element: ReleveElement<"photo_anchor">): Ancre { return element.donnees.ancre; }
