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
import type { Ancre, AnnotationDonnees, MediaFile, PhotoAnchorDonnees, PhotoRepere, Releve, ReleveElement, ReleveStructure } from "./model";
import { canPerform, type ReleveAction, type ReleveActorContext } from "./permissions";
import {
  buildPhotoAnnotation, isAnnotationOfAnchor, photoAnchorsOf, resolvePhotoPlacement,
  type PhotoAnnotationDraft, type PhotoTarget,
} from "./photo";
import { ReleveNotFoundError, type ReleveRepository } from "./repository";
import { RelevePermissionError } from "./service";
import { buildStoragePath, checkMediaUpload, parseStoragePath, RELEVE_SIGNED_URL_TTL_SECONDS, signedUrlRequest } from "./storage";
import type { QueueHooks } from "./upload-queue";
import { unwrapValidation, validateElementDraft, ReleveValidationError } from "./validation";

export type PhotoMedia = MediaFile & { readonly metadata: Partial<PhotoMetadata> };

export type NewMediaRow = {
  id: MediaId; releveId: ReleveId; entrepriseId: TenantId; categorie: "photos"; storagePath: string;
  mimeType: string; tailleOctets: number; nomFichier: string | null; metadata: PhotoMetadata;
};
export type NewElementRow = {
  id: ElementId; releveId: ReleveId; type: "photo_anchor" | "annotation"; etageId: string | null; pieceId: string | null;
  donnees: Record<string, unknown>;
};

/** Nature d'un échec distant : seule `network` justifie une nouvelle tentative automatique. */
export type MediaFailureKind = "network" | "forbidden" | "invalid" | "not_found" | "other";
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
  insertMedia(row: NewMediaRow): Promise<WriteOutcome>;
  insertElement(row: NewElementRow): Promise<WriteOutcome>;
  updateElementDonnees(id: ElementId, donnees: Record<string, unknown>, expectedRevision: number): Promise<ReleveElement>;
  setElementDeleted(id: ElementId, deleted: boolean): Promise<void>;
  /** Retrait atomique (serveur) : média + ses ancres + leurs annotations. Retourne le chemin du fichier. */
  deletePhoto(mediaId: MediaId): Promise<{ storagePath: string }>;
  /** Remplacement atomique (serveur) : les ancres pointent sur le nouveau média, l'ancien est retiré. */
  replacePhoto(oldMediaId: MediaId, newMediaId: MediaId): Promise<{ storagePath: string }>;
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

  async insertMedia(row: NewMediaRow): Promise<WriteOutcome> {
    this.guard();
    if (this.medias.has(row.id)) return "exists";
    if (!this.objects.has(row.storagePath)) throw new MediaRemoteError("Fichier non déposé.", "invalid");
    this.medias.set(row.id, { ...this.meta(row.entrepriseId), id: row.id, releveId: row.releveId, categorie: row.categorie, storagePath: row.storagePath, mimeType: row.mimeType, tailleOctets: row.tailleOctets, nomFichier: row.nomFichier, metadata: row.metadata });
    return "created";
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
    return { storagePath: media.storagePath };
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
    previous.deletedAt = at; previous.revision += 1;
    return { storagePath: previous.storagePath };
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
  readonly photos: readonly PhotoEntry[];
  /** Murs et équipements actifs (cibles de rattachement). */
  readonly targets: readonly ReleveElement[];
  readonly elements: readonly ReleveElement[];
};

export type PreparedPhoto = {
  readonly mediaId: MediaId;
  readonly anchorId: ElementId;
  readonly storagePath: string;
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
    const { medias, elements } = await this.media.loadMediaContext(releveId);
    const photos = medias
      .filter((media) => media.categorie === "photos" && !media.deletedAt)
      .map((media) => {
        const anchors = photoAnchorsOf(elements, media.id).sort((a, b) => (a.donnees.ordre ?? 0) - (b.donnees.ordre ?? 0));
        const annotations = elements.filter((element) => anchors.some((anchor) => isAnnotationOfAnchor(element, anchor.id))) as ReleveElement<"annotation">[];
        return { media, anchors, annotations };
      })
      .sort((a, b) => (b.media.metadata.priseLe ?? b.media.createdAt).localeCompare(a.media.metadata.priseLe ?? a.media.createdAt));
    return { structure, photos, targets: elements.filter((element) => element.type === "mur" || element.type === "equipement"), elements };
  }

  /**
   * Prépare le dépôt d'une photo (sans réseau) : contrôle de droits, de type, de taille, de
   * métadonnées et de cible, chemin canonique, lignes à écrire. Le résultat est ce que la file
   * hors ligne conserve jusqu'à la synchronisation.
   */
  preparePhoto(input: {
    structure: ReleveStructure; elements: readonly ReleveElement[]; target: PhotoTarget; mimeType: string; bytes: number;
    metadata: PhotoMetadata; nomFichier?: string | null; legende?: string | null; ordre?: number;
  }): PreparedPhoto {
    const { releve } = input.structure;
    this.require("edit", releve);
    const size = checkMediaUpload("photos", input.mimeType, input.bytes);
    if (!size.ok) throw new ReleveValidationError([{ path: "fichier", code: "out_of_range", message: size.message }]);
    const issues = validatePhotoMetadata(input.metadata);
    if (issues.length) throw new ReleveValidationError(issues.map((issue) => ({ path: `metadata.${issue.key}`, code: "invalid_format", message: issue.message })));
    const placement = resolvePhotoPlacement(input.target, input.structure, input.elements);
    const mediaId = asMediaId(this.uuid()); const anchorId = asElementId(this.uuid());
    const storagePath = buildStoragePath({ entrepriseId: releve.entrepriseId, releveId: releve.id, categorie: "photos", mediaId, mimeType: input.mimeType });
    const donnees: PhotoAnchorDonnees = { mediaId, ancre: placement.ancre, directionRad: null, legende: input.legende?.trim() || null, ordre: input.ordre ?? 0, reperes: [] };
    const anchorDraft = unwrapValidation(validateElementDraft({ type: "photo_anchor", etageId: placement.etageId, pieceId: placement.pieceId, donnees }));
    return {
      mediaId, anchorId, storagePath,
      media: { id: mediaId, releveId: releve.id, entrepriseId: releve.entrepriseId, categorie: "photos", storagePath, mimeType: input.mimeType, tailleOctets: input.bytes, nomFichier: input.nomFichier?.slice(0, 260) ?? null, metadata: input.metadata },
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
   * Retire une photo : média, ancres et annotations (une transaction serveur), puis supprime
   * le fichier si l'acteur en a le droit. Sinon le fichier reste jusqu'à la purge par un
   * responsable (`purgeRetiredFiles`) ou la purge RGPD de l'entreprise.
   */
  async deletePhoto(releve: Releve, media: PhotoMedia): Promise<{ fileRemoved: boolean }> {
    this.require("edit", releve);
    const { storagePath } = await this.media.deletePhoto(media.id);
    if (!this.canRemoveFile(releve, media)) return { fileRemoved: false };
    const removed = await this.media.removeObjects([storagePath]);
    return { fileRemoved: removed.includes(storagePath) };
  }

  /** Remplace une photo déjà déposée par une autre (déjà déposée, voir `preparePhoto` + file). */
  async replacePhoto(releve: Releve, previous: PhotoMedia, nextMediaId: MediaId): Promise<{ fileRemoved: boolean }> {
    this.require("edit", releve);
    const { storagePath } = await this.media.replacePhoto(previous.id, nextMediaId);
    if (!this.canRemoveFile(releve, previous)) return { fileRemoved: false };
    const removed = await this.media.removeObjects([storagePath]);
    return { fileRemoved: removed.includes(storagePath) };
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
    const paths = medias.filter((media) => media.deletedAt && parseStoragePath(media.storagePath)?.releveId === structure.releve.id).map((media) => media.storagePath);
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

  async removeAnnotation(releve: Releve, annotation: ReleveElement<"annotation">): Promise<void> {
    this.require("edit", releve);
    await this.media.setElementDeleted(annotation.id, true);
  }
}

/** Ancre d'un PhotoAnchor (utilitaire d'affichage). */
export function anchorOf(element: ReleveElement<"photo_anchor">): Ancre { return element.donnees.ancre; }
