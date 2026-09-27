import { describe, expect, it } from "vitest";
import { actor, fixedClock, sequentialUuid, TENANT_A, USER_OWNER } from "./fixtures";
import { countByNode, paginate, scopeLabel, selectGallery, type GalleryScope } from "./gallery";
import { buildPhotoMetadata, type PhotoMetadata } from "./media";
import { InMemoryReleveMediaRepository, MediaRemoteError, normalizeCommentaire, ReleveMediaService, type PhotoEntry } from "./media-service";
import {
  annotationDraftOf, describeAnchor, PHOTO_ANNOTATION_FORMES, PHOTO_ANNOTATION_FORMES_PREVUES, PHOTO_ANNOTATION_REGISTRY,
  resolvePhotoPlacement, translateAnnotationDraft, type PhotoTarget,
} from "./photo";
import { InMemoryReleveRepository } from "./repository";
import { ReleveService } from "./service";
import {
  DuplicatePendingPhotoError, enqueuePhoto, MemoryUploadQueueStore, processUploadQueue, SYNCED_RETENTION_MS, UPLOAD_STATUS_CONTRACT, visiblePending,
} from "./upload-queue";
import { validateElementDraft } from "./validation";

const hash = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const metadata = (n: number, overrides: Partial<PhotoMetadata> = {}): PhotoMetadata => ({
  ...buildPhotoMetadata({
    source: "import", exif: null, fileLastModified: Date.parse("2026-09-20T09:00:00Z") + n * 60_000,
    original: { width: 4032, height: 3024, bytes: 4_000_000 }, stored: { width: 3072, height: 2304, quality: 0.85, maxLongEdgePx: 3072 }, sha256: hash(n),
  }),
  ...overrides,
});

/** Hiérarchie Lot 3 complète : chantier → bâtiment → 2 étages → zone → 2 pièces (+ mur). */
async function setup() {
  const releves = new InMemoryReleveRepository({ actorId: USER_OWNER, now: fixedClock(), uuid: sequentialUuid("aaaa") });
  const structureService = new ReleveService(releves, actor(), sequentialUuid("0001"));
  const releve = await structureService.create({ nom: "Résidence", chantierNom: "Site" });
  const chantier = await structureService.addChantier(releve.id, { nom: "Chantier Nord" });
  const batiment = await structureService.addBatiment(releve.id, { nom: "Bâtiment A", chantierId: chantier.id });
  const rdc = await structureService.addEtage(releve.id, batiment.id, { nom: "RDC", niveau: 0 });
  const r1 = await structureService.addEtage(releve.id, batiment.id, { nom: "R+1", niveau: 1 });
  const zone = await structureService.addZone(releve.id, rdc.id, { nom: "Appartement 1" });
  const sejour = await structureService.addPiece(releve.id, rdc.id, { nom: "Séjour", usage: "sejour", zoneId: zone.id });
  const chambre = await structureService.addPiece(releve.id, r1.id, { nom: "Chambre", usage: "chambre" });
  const media = new InMemoryReleveMediaRepository(USER_OWNER, TENANT_A, fixedClock(Date.parse("2026-09-27T10:00:00Z")));
  const mur = "c0000000-0000-4000-8000-000000000001";
  await media.insertElement({ id: mur as never, releveId: releve.id, type: "mur" as never, etageId: rdc.id, pieceId: sejour.id, donnees: { a: { x: 0, y: 0 }, b: { x: 4200, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } });
  const service = new ReleveMediaService(media, releves, actor(), sequentialUuid("0002"));
  return { releves, structureService, releve, chantier, batiment, rdc, r1, zone, sejour, chambre, mur, media, service };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

let counter = 0;
async function shoot(ctx: Ctx, target: PhotoTarget, options: { n?: number; thumbnail?: boolean; store?: MemoryUploadQueueStore; commentaire?: string } = {}) {
  const n = options.n ?? (counter += 1);
  const library = await ctx.service.library(ctx.releve.id);
  const prepared = ctx.service.preparePhoto({
    structure: library.structure, elements: library.elements, target, mimeType: "image/jpeg", bytes: 800_000, metadata: metadata(n),
    thumbnail: options.thumbnail === false ? null : { bytes: 30_000 }, commentaire: options.commentaire, etatDocumente: "initial",
  });
  const store = options.store ?? new MemoryUploadQueueStore();
  await enqueuePhoto(store, prepared, new Uint8Array(800_000), { label: "Photo", miniature: options.thumbnail === false ? null : new Uint8Array(30_000) });
  const run = await processUploadQueue(store, ctx.media, { hooks: ctx.service.queueHooks(library.structure.releve) });
  return { prepared, store, run };
}
const entry = async (ctx: Ctx, id: string): Promise<PhotoEntry> => (await ctx.service.library(ctx.releve.id)).photos.find((photo) => photo.media.id === id)!;

describe("rattachement sur la hiérarchie du Lot 3", () => {
  it("chantier : ancre, libellé, aucune colonne étage / pièce ; valide pour le domaine", async () => {
    const ctx = await setup();
    const structure = await ctx.structureService.get(ctx.releve.id);
    const placement = resolvePhotoPlacement({ kind: "chantier", id: ctx.chantier.id }, structure, []);
    expect(placement).toEqual({ ancre: { kind: "entite", ref: { kind: "chantier", id: ctx.chantier.id } }, etageId: null, pieceId: null });
    expect(describeAnchor(placement.ancre, structure, [])).toBe("Chantier · Chantier Nord");
    expect(validateElementDraft({ type: "photo_anchor", donnees: { mediaId: ctx.mur, ancre: placement.ancre, directionRad: null, legende: null } }).ok).toBe(true);
  });

  it("la duplication d'une pièce (Lot 3) ne recopie aucune photo", async () => {
    const ctx = await setup();
    await shoot(ctx, { kind: "piece", id: ctx.sejour.id });
    const copie = await ctx.structureService.duplicateNode(ctx.releve.id, "piece", ctx.sejour.id);
    const library = await ctx.service.library(ctx.releve.id);
    expect(selectGallery(library.photos, library.structure, library.elements, { kind: "piece", id: copie })).toEqual([]);
    expect(selectGallery(library.photos, library.structure, library.elements, { kind: "piece", id: ctx.sejour.id })).toHaveLength(1);
  });

  it("une photo dont toutes les cibles sont à la corbeille disparaît de la bibliothèque, puis revient", async () => {
    const ctx = await setup();
    const { prepared } = await shoot(ctx, { kind: "piece", id: ctx.chambre.id });
    // Le serveur retire les rattachements en cascade : simulé ici sur l'ancre.
    const anchor = (await entry(ctx, prepared.mediaId)).anchors[0];
    await ctx.media.setElementDeleted(anchor.id, true);
    expect(await entry(ctx, prepared.mediaId)).toBeUndefined();
    await ctx.media.setElementDeleted(anchor.id, false);
    expect(await entry(ctx, prepared.mediaId)).toBeDefined();
  });
});

describe("galerie par pièce, zone, étage, bâtiment, chantier, relevé", () => {
  it("portée hiérarchique (descendants inclus), comptes par nœud, libellé", async () => {
    const ctx = await setup();
    await shoot(ctx, { kind: "piece", id: ctx.sejour.id });
    await shoot(ctx, { kind: "mur", id: ctx.mur });
    await shoot(ctx, { kind: "zone", id: ctx.zone.id });
    await shoot(ctx, { kind: "piece", id: ctx.chambre.id });
    await shoot(ctx, { kind: "plan", etageId: ctx.r1.id, x: 0.2, y: 0.4 });
    await shoot(ctx, { kind: "chantier", id: ctx.chantier.id });
    await shoot(ctx, { kind: "releve" });
    const { photos, structure, elements } = await ctx.service.library(ctx.releve.id);
    const count = (scope: GalleryScope) => selectGallery(photos, structure, elements, scope).length;
    expect([
      count({ kind: "piece", id: ctx.sejour.id }), count({ kind: "zone", id: ctx.zone.id }), count({ kind: "etage", id: ctx.rdc.id }),
      count({ kind: "etage", id: ctx.r1.id }), count({ kind: "batiment", id: ctx.batiment.id }), count({ kind: "chantier", id: ctx.chantier.id }),
      count({ kind: "releve" }),
    ]).toEqual([2, 3, 3, 2, 5, 6, 7]);
    const counts = countByNode(photos, structure, elements);
    expect([counts.get(ctx.sejour.id), counts.get(ctx.zone.id), counts.get(ctx.chantier.id)]).toEqual([2, 3, 6]);
    expect(scopeLabel({ kind: "zone", id: ctx.zone.id }, structure)).toBe("Appartement 1");
  });

  it("filtres simples : état documenté, commentées, annotées, récentes ; tri par date décroissante ; pagination", async () => {
    const ctx = await setup();
    const a = await shoot(ctx, { kind: "piece", id: ctx.sejour.id }, { n: 101, commentaire: "Fissure" });
    const b = await shoot(ctx, { kind: "piece", id: ctx.sejour.id }, { n: 102 });
    let library = await ctx.service.library(ctx.releve.id);
    const photoB = library.photos.find((photo) => photo.media.id === b.prepared.mediaId)!;
    await ctx.service.saveEtat(library.structure.releve, photoB.media, "as_built");
    await ctx.service.annotate(library.structure.releve, photoB.anchors[0], { forme: "cercle", cx: 0.5, cy: 0.5, r: 0.2 });
    library = await ctx.service.library(ctx.releve.id);
    const select = (filters: Parameters<typeof selectGallery>[4]) => selectGallery(library.photos, library.structure, library.elements, { kind: "releve" }, filters, new Date("2026-09-20T12:00:00Z")).map((photo) => photo.media.id);
    expect(select({})).toEqual([b.prepared.mediaId, a.prepared.mediaId]);
    expect(select({ etat: "as_built" })).toEqual([b.prepared.mediaId]);
    expect(select({ commentees: true })).toEqual([a.prepared.mediaId]);
    expect(select({ annotees: true })).toEqual([b.prepared.mediaId]);
    expect(select({ recentesJours: 1 })).toHaveLength(2);
    expect(selectGallery(library.photos, library.structure, library.elements, { kind: "releve" }, { recentesJours: 1 }, new Date("2026-10-20T00:00:00Z"))).toEqual([]);
    const many = Array.from({ length: 130 }, (_, i) => i);
    expect(paginate(many, 1)).toMatchObject({ remaining: 82 });
    expect(paginate(many, 3).visible).toHaveLength(130);
  });

  it("200 photos sur un relevé, 50 dans une pièce : sélection et comptes en quelques millisecondes (sans réseau)", async () => {
    const ctx = await setup();
    const library = await ctx.service.library(ctx.releve.id);
    const fake = (i: number): PhotoEntry => ({
      media: { id: `m${i}`, createdAt: "2026-09-27T10:00:00Z", commentaire: null, etatDocumente: "initial", metadata: { priseLe: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString() } } as never,
      anchors: [{ donnees: { ancre: { kind: "entite", ref: { kind: "piece", id: i < 50 ? ctx.sejour.id : ctx.chambre.id } } } } as never],
      annotations: [],
    });
    const photos = Array.from({ length: 200 }, (_, i) => fake(i));
    const started = performance.now();
    const piece = selectGallery(photos, library.structure, library.elements, { kind: "piece", id: ctx.sejour.id });
    const all = selectGallery(photos, library.structure, library.elements, { kind: "releve" });
    const counts = countByNode(photos, library.structure, library.elements);
    const elapsed = performance.now() - started;
    expect([piece.length, all.length, counts.get(ctx.batiment.id)]).toEqual([50, 200, 200]);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("commentaire, état documenté, version de référence", () => {
  it("commentaire distinct des annotations, borné, révision optimiste (aucun écrasement silencieux)", async () => {
    const ctx = await setup();
    const { prepared } = await shoot(ctx, { kind: "piece", id: ctx.sejour.id });
    const photo = await entry(ctx, prepared.mediaId);
    const saved = await ctx.service.saveCommentaire((await ctx.service.library(ctx.releve.id)).structure.releve, photo.media, "  Humidité en pied de mur  ");
    expect(saved.commentaire).toBe("Humidité en pied de mur");
    expect((await entry(ctx, prepared.mediaId)).annotations).toEqual([]);
    const releve = (await ctx.service.library(ctx.releve.id)).structure.releve;
    await expect(ctx.service.saveCommentaire(releve, photo.media, "Autre")).rejects.toThrow(/Modifiée ailleurs/);
    expect((await ctx.service.saveCommentaire(releve, saved, "   ")).commentaire).toBeNull();
    expect(() => normalizeCommentaire("x".repeat(2001))).toThrow(/2000/);
  });
});

describe("annotations : registre des formes, modification, suppression", () => {
  it("V1 = texte, flèche, cercle ; rectangle, zone, dimension, symbole préparés mais non disponibles", () => {
    expect(PHOTO_ANNOTATION_REGISTRY.filter((entry) => entry.disponible).map((entry) => entry.forme)).toEqual([...PHOTO_ANNOTATION_FORMES]);
    expect(PHOTO_ANNOTATION_FORMES_PREVUES).toEqual(["rectangle", "zone", "cote", "symbole"]);
  });

  it("modifier le texte, la couleur et la position ; conflit de révision détecté", async () => {
    const ctx = await setup();
    const { prepared } = await shoot(ctx, { kind: "piece", id: ctx.sejour.id });
    let photo = await entry(ctx, prepared.mediaId);
    const releve = (await ctx.service.library(ctx.releve.id)).structure.releve;
    await ctx.service.annotate(releve, photo.anchors[0], { forme: "texte", x: 0.2, y: 0.2, texte: "Fissure" });
    photo = await entry(ctx, prepared.mediaId);
    const [annotation] = photo.annotations;
    const moved = translateAnnotationDraft(annotationDraftOf(annotation)!, 0.1, 0.9);
    const updated = await ctx.service.updateAnnotation(releve, photo.anchors[0], annotation, { ...moved, texte: "Fissure traversante", couleur: "jaune" });
    expect(updated.donnees).toMatchObject({ texte: "Fissure traversante", forme: "texte", geometrie: { espace: "photo", y: 1, couleur: "jaune" } });
    expect((updated.donnees.geometrie as { x: number }).x).toBeCloseTo(0.3);
    await expect(ctx.service.updateAnnotation(releve, photo.anchors[0], annotation, { texte: "X" })).rejects.toThrow(/Modifié ailleurs/);
    await ctx.service.removeAnnotation(releve, updated);
    expect((await entry(ctx, prepared.mediaId)).annotations).toEqual([]);
  });
});

describe("doublons, miniatures, versions figées, file locale", () => {
  it("doublon : détecté dans la bibliothèque, dans la file, et refusé par le serveur", async () => {
    const ctx = await setup();
    const store = new MemoryUploadQueueStore();
    const first = await shoot(ctx, { kind: "releve" }, { n: 150, store });
    const library = await ctx.service.library(ctx.releve.id);
    expect(ctx.service.findDuplicate(library, hash(150))?.media.id).toBe(first.prepared.mediaId);
    const again = ctx.service.preparePhoto({ structure: library.structure, elements: library.elements, target: { kind: "releve" }, mimeType: "image/jpeg", bytes: 800_000, metadata: metadata(150) });
    await expect(enqueuePhoto(store, again, new Uint8Array(1), { label: "Doublon" })).rejects.toBeInstanceOf(DuplicatePendingPhotoError);
    await ctx.media.uploadObject(again.storagePath, new Uint8Array(1), "image/jpeg");
    await expect(ctx.media.insertMedia(again.media)).rejects.toMatchObject({ kind: "duplicate" });
  });

  it("miniature déposée avant la photo ; une seule signature groupée par page ; photos antérieures sans miniature", async () => {
    const ctx = await setup();
    const withThumb = await shoot(ctx, { kind: "releve" });
    const without = await shoot(ctx, { kind: "releve" }, { thumbnail: false });
    expect(ctx.media.objects.has(withThumb.prepared.miniaturePath!)).toBe(true);
    let calls = 0;
    const signedUrls = ctx.media.signedUrls.bind(ctx.media);
    ctx.media.signedUrls = async (paths, ttl) => { calls += 1; return signedUrls(paths, ttl); };
    const library = await ctx.service.library(ctx.releve.id);
    const urls = await ctx.service.thumbnailUrls(library.structure.releve, library.photos.map((photo) => photo.media));
    expect(calls).toBe(1);
    expect(urls[withThumb.prepared.mediaId]).toContain(withThumb.prepared.miniaturePath);
    expect(urls[without.prepared.mediaId]).toContain(without.prepared.storagePath);
  });

  it("photo figée par une version : retirée mais fichier et miniature conservés ; sinon supprimés tous les deux", async () => {
    const ctx = await setup();
    const frozen = await shoot(ctx, { kind: "releve" });
    const free = await shoot(ctx, { kind: "releve" });
    ctx.media.frozen.add(frozen.prepared.mediaId);
    const releve = (await ctx.service.library(ctx.releve.id)).structure.releve;
    expect(await ctx.service.deletePhoto(releve, (await entry(ctx, frozen.prepared.mediaId)).media)).toEqual({ fileRemoved: false, kept: "version" });
    expect(ctx.media.objects.has(frozen.prepared.storagePath) && ctx.media.objects.has(frozen.prepared.miniaturePath!)).toBe(true);
    expect(await ctx.service.deletePhoto(releve, (await entry(ctx, free.prepared.mediaId)).media)).toEqual({ fileRemoved: true, kept: null });
    expect(ctx.media.objects.has(free.prepared.storagePath) || ctx.media.objects.has(free.prepared.miniaturePath!)).toBe(false);
  });

  it("file : états PENDING_UPLOAD → UPLOADING → SYNCED, ERROR ; ordre de création ; nettoyage des synchronisées", async () => {
    expect(UPLOAD_STATUS_CONTRACT).toEqual({ PENDING_UPLOAD: "en_attente", UPLOADING: "en_cours", SYNCED: "synchronise", ERROR: "echec" });
    const ctx = await setup();
    const library = await ctx.service.library(ctx.releve.id);
    const store = new MemoryUploadQueueStore();
    const ids: string[] = [];
    for (const n of [201, 202, 203]) {
      const prepared = ctx.service.preparePhoto({ structure: library.structure, elements: library.elements, target: { kind: "releve" }, mimeType: "image/jpeg", bytes: 1000, metadata: metadata(n), thumbnail: { bytes: 100 } });
      await enqueuePhoto(store, prepared, new Uint8Array(1000), { label: `P${n}`, miniature: new Uint8Array(100), now: () => new Date(Date.UTC(2026, 8, 27, 10, 0, n - 200)) });
      ids.push(prepared.mediaId);
    }
    const seen: string[] = [];
    const statuses: string[] = [];
    ctx.media.online = false;
    await processUploadQueue(store, ctx.media, { hooks: { onChange: (item) => statuses.push(item.status) } });
    expect(new Set(statuses)).toEqual(new Set(["en_cours", "en_attente"]));
    ctx.media.online = true;
    const uploadObject = ctx.media.uploadObject.bind(ctx.media);
    ctx.media.uploadObject = async (path, bytes, mime) => { seen.push(path); return uploadObject(path, bytes, mime); };
    const run = await processUploadQueue(store, ctx.media, { force: true });
    expect(run.synced.map((item) => item.id)).toEqual(ids);
    // Miniature puis photo, élément par élément, dans l'ordre de prise.
    expect(seen.filter((path) => ids.some((id) => path.endsWith(`${id}.jpg`)))).toEqual(ids.map((id) => `${TENANT_A}/${ctx.releve.id}/photos/${id}.jpg`));
    expect(seen).toHaveLength(6);
    expect(visiblePending(await store.list(), ctx.releve.id)).toEqual([]);
    await processUploadQueue(store, ctx.media, { now: () => new Date(Date.now() + SYNCED_RETENTION_MS + 60_000) });
    expect(await store.list()).toEqual([]);
  });

  it("miniature locale effacée : échec visible (jamais d'envoi partiel silencieux)", async () => {
    const ctx = await setup();
    const library = await ctx.service.library(ctx.releve.id);
    const store = new MemoryUploadQueueStore();
    const prepared = ctx.service.preparePhoto({ structure: library.structure, elements: library.elements, target: { kind: "releve" }, mimeType: "image/jpeg", bytes: 1000, metadata: metadata(250), thumbnail: { bytes: 100 } });
    await enqueuePhoto(store, prepared, new Uint8Array(1000), { label: "P", miniature: new Uint8Array(100) });
    store.bytes = async (id, kind) => (kind === "miniature" ? null : new Uint8Array(1000));
    const run = await processUploadQueue(store, ctx.media);
    expect(run.failed[0]?.lastError).toMatch(/Miniature locale introuvable/);
    expect(run.failed[0]).toMatchObject({ status: "echec" });
    expect(new MediaRemoteError("x", "duplicate").kind).toBe("duplicate");
  });
});

