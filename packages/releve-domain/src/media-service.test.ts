import { describe, expect, it } from "vitest";
import { actor, fixedClock, sequentialUuid, TENANT_A, TENANT_B, USER_ADMIN, USER_OTHER, USER_OWNER } from "./fixtures";
import { asElementId, type ElementId, type ReleveId } from "./ids";
import { buildPhotoMetadata, type PhotoMetadata } from "./media";
import { InMemoryReleveMediaRepository, MediaRemoteError, ReleveMediaService, type PhotoEntry } from "./media-service";
import type { ReleveElement, ReleveStructure } from "./model";
import {
  addRepere, buildPhotoAnnotation, describeAnchor, moveRepere, removeRepere, resolvePhotoPlacement, sortReperes, targetOfAnchor, updateRepere,
  PhotoTargetError, type PhotoTarget,
} from "./photo";
import { InMemoryReleveRepository } from "./repository";
import { RelevePermissionError, ReleveService } from "./service";
import { discardPending, enqueuePhoto, MemoryUploadQueueStore, processUploadQueue, retryDelayMs, uploadQueueDatabaseName } from "./upload-queue";
import { validateElementDraft, ReleveValidationError } from "./validation";

const metadata = (overrides: Partial<PhotoMetadata> = {}): PhotoMetadata => ({
  ...buildPhotoMetadata({ source: "camera_appareil", exif: null, captureAt: "2026-09-27T09:00:00.000Z", original: { width: 4032, height: 3024, bytes: 4_000_000 }, stored: { width: 3072, height: 2304, quality: 0.85, maxLongEdgePx: 3072 }, sha256: "b".repeat(64) }),
  ...overrides,
});

async function setup() {
  const releves = new InMemoryReleveRepository({ actorId: USER_OWNER, now: fixedClock(), uuid: sequentialUuid("aaaa") });
  const structureService = new ReleveService(releves, actor(), sequentialUuid("0001"));
  const releve = await structureService.create({ nom: "Relevé T3", chantierNom: "Rue des Lilas" });
  const batiment = await structureService.addBatiment(releve.id, { nom: "Bâtiment A" });
  const rdc = await structureService.addEtage(releve.id, batiment.id, { nom: "RDC", niveau: 0 });
  const zone = await structureService.addZone(releve.id, rdc.id, { nom: "Logement 1" });
  const sejour = await structureService.addPiece(releve.id, rdc.id, { nom: "Séjour", usage: "sejour", zoneId: zone.id });
  const media = new InMemoryReleveMediaRepository(USER_OWNER, TENANT_A, fixedClock(Date.parse("2026-09-27T10:00:00Z")));
  const mur = asElementId("c0000000-0000-4000-8000-000000000001");
  const equipement = asElementId("c0000000-0000-4000-8000-000000000002");
  await media.insertElement({ id: mur, releveId: releve.id, type: "mur" as never, etageId: rdc.id, pieceId: sejour.id, donnees: { a: { x: 0, y: 0 }, b: { x: 4200, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } });
  await media.insertElement({ id: equipement, releveId: releve.id, type: "equipement" as never, etageId: rdc.id, pieceId: sejour.id, donnees: { categorie: "electricite", libelle: "Tableau électrique", position: { x: 100, y: 100 }, rotationRad: 0, largeurMm: null, profondeurMm: null, hauteurMm: null } });
  const owner = new ReleveMediaService(media, releves, actor(), sequentialUuid("0002"));
  const structure = await structureService.get(releve.id);
  return { releves, structureService, releve, batiment, rdc, zone, sejour, media, owner, structure, mur, equipement };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function shoot(ctx: Ctx, target: PhotoTarget, service = ctx.owner, replaceMediaId?: string) {
  const library = await service.library(ctx.releve.id);
  const prepared = service.preparePhoto({ structure: library.structure, elements: library.elements, target, mimeType: "image/jpeg", bytes: 1_200_000, metadata: metadata(replaceMediaId ? { remplaceMediaId: replaceMediaId } : {}), nomFichier: "IMG_0001.jpg" });
  const store = new MemoryUploadQueueStore();
  await enqueuePhoto(store, prepared, new Uint8Array(1_200_000), { label: "Photo", replaceMediaId });
  const run = await processUploadQueue(store, ctx.media, { hooks: service.queueHooks(library.structure.releve) });
  return { prepared, store, run };
}

const entryOf = async (ctx: Ctx, mediaId: string, service = ctx.owner): Promise<PhotoEntry> => (await service.library(ctx.releve.id)).photos.find((photo) => photo.media.id === mediaId)!;

describe("rattachement d'une photo : relevé, bâtiment, étage, zone, pièce, mur, équipement, point du plan", () => {
  it("chaque cible produit une ancre valide et les colonnes étage / pièce attendues", async () => {
    const ctx = await setup();
    const elements = (await ctx.media.loadMediaContext(ctx.releve.id)).elements;
    const cases: Array<[PhotoTarget, string, string | null, string | null]> = [
      [{ kind: "releve" }, "Relevé", null, null],
      [{ kind: "batiment", id: ctx.batiment.id }, "Bâtiment · Bâtiment A", null, null],
      [{ kind: "etage", id: ctx.rdc.id }, "Étage · RDC", ctx.rdc.id, null],
      [{ kind: "zone", id: ctx.zone.id }, "Zone · Logement 1", ctx.rdc.id, null],
      [{ kind: "piece", id: ctx.sejour.id }, "Pièce · Séjour", ctx.rdc.id, ctx.sejour.id],
      [{ kind: "mur", id: ctx.mur }, "Mur", ctx.rdc.id, ctx.sejour.id],
      [{ kind: "equipement", id: ctx.equipement }, "Équipement · Tableau électrique", ctx.rdc.id, ctx.sejour.id],
      [{ kind: "plan", etageId: ctx.rdc.id, x: 0.42, y: 1.7 }, "Point du plan · RDC (42 %, 100 %)", ctx.rdc.id, null],
    ];
    for (const [target, label, etageId, pieceId] of cases) {
      const placement = resolvePhotoPlacement(target, ctx.structure, elements);
      expect([describeAnchor(placement.ancre, ctx.structure, elements), placement.etageId, placement.pieceId]).toEqual([label, etageId, pieceId]);
      const draft = validateElementDraft({ type: "photo_anchor", etageId: placement.etageId, pieceId: placement.pieceId, donnees: { mediaId: "d0000000-0000-4000-8000-000000000001", ancre: placement.ancre, directionRad: null, legende: null } });
      expect(draft.ok).toBe(true);
      const back = targetOfAnchor(placement.ancre, elements);
      expect(back?.kind).toBe(target.kind);
    }
  });

  it("refuse une cible absente, supprimée ou de mauvaise nature", async () => {
    const ctx = await setup();
    const elements = (await ctx.media.loadMediaContext(ctx.releve.id)).elements;
    expect(() => resolvePhotoPlacement({ kind: "piece", id: "f0000000-0000-4000-8000-000000000009" }, ctx.structure, elements)).toThrow(PhotoTargetError);
    expect(() => resolvePhotoPlacement({ kind: "mur", id: ctx.equipement }, ctx.structure, elements)).toThrow(/n'est pas un mur/);
    await ctx.structureService.removeNode(ctx.releve.id, "piece", ctx.sejour.id);
    const after = await ctx.structureService.get(ctx.releve.id);
    expect(() => resolvePhotoPlacement({ kind: "piece", id: ctx.sejour.id }, after, elements)).toThrow(/introuvable/);
  });
});

describe("capture → file locale → synchronisation", () => {
  it("dépose fichier, ligne média (métadonnées) et PhotoAnchor ; la photo apparaît dans la bibliothèque", async () => {
    const ctx = await setup();
    const { prepared, run, store } = await shoot(ctx, { kind: "piece", id: ctx.sejour.id });
    expect(run.synced.map((item) => item.id)).toEqual([prepared.mediaId]);
    expect(await store.list()).toEqual([]);
    expect(prepared.storagePath).toBe(`${TENANT_A}/${ctx.releve.id}/photos/${prepared.mediaId}.jpg`);
    const entry = await entryOf(ctx, prepared.mediaId);
    expect(entry.media.metadata).toMatchObject({ source: "camera_appareil", priseLeSource: "capture", orientation: "paysage" });
    expect(entry.media.createdBy).toBe(USER_OWNER);
    expect(entry.anchors).toHaveLength(1);
    expect(entry.anchors[0]).toMatchObject({ etageId: ctx.rdc.id, pieceId: ctx.sejour.id });
  });

  it("hors ligne : reste « à synchroniser », reprogrammé avec délai croissant, puis envoyé au retour du réseau", async () => {
    const ctx = await setup();
    const library = await ctx.owner.library(ctx.releve.id);
    const prepared = ctx.owner.preparePhoto({ structure: library.structure, elements: library.elements, target: { kind: "releve" }, mimeType: "image/jpeg", bytes: 900_000, metadata: metadata() });
    const store = new MemoryUploadQueueStore();
    await enqueuePhoto(store, prepared, new Uint8Array(900_000), { label: "Façade", now: () => new Date("2026-09-27T10:00:00Z") });
    ctx.media.online = false;
    const clock = () => new Date("2026-09-27T10:00:00Z");
    const first = await processUploadQueue(store, ctx.media, { now: clock });
    expect(first.retrying).toHaveLength(1);
    const [pending] = await store.list();
    expect(pending).toMatchObject({ status: "en_attente", attempts: 1, nextAttemptAt: "2026-09-27T10:00:05.000Z" });
    expect(pending.lastError).toMatch(/Réseau/);
    // Pas encore dû : rien n'est tenté.
    ctx.media.online = true;
    expect((await processUploadQueue(store, ctx.media, { now: clock })).synced).toEqual([]);
    const later = await processUploadQueue(store, ctx.media, { now: () => new Date("2026-09-27T10:00:06Z") });
    expect(later.synced).toHaveLength(1);
    expect(retryDelayMs(1)).toBe(5_000); expect(retryDelayMs(3)).toBe(20_000); expect(retryDelayMs(30)).toBe(300_000);
  });

  it("reprise idempotente après une coupure entre le fichier et la ligne média (aucun doublon)", async () => {
    const ctx = await setup();
    const library = await ctx.owner.library(ctx.releve.id);
    const prepared = ctx.owner.preparePhoto({ structure: library.structure, elements: library.elements, target: { kind: "etage", id: ctx.rdc.id }, mimeType: "image/jpeg", bytes: 500_000, metadata: metadata() });
    const store = new MemoryUploadQueueStore();
    await enqueuePhoto(store, prepared, new Uint8Array(500_000), { label: "Palier" });
    const insertMedia = ctx.media.insertMedia.bind(ctx.media);
    let cut = true;
    ctx.media.insertMedia = async (row) => { if (cut) { cut = false; throw new MediaRemoteError("Connexion perdue.", "network"); } return insertMedia(row); };
    await processUploadQueue(store, ctx.media);
    expect((await store.list())[0].steps).toEqual({ fichier: true, media: false, ancre: false, remplacement: true });
    // Le fichier est déjà là : la reprise le signale « déjà présent » et poursuit.
    const again = await processUploadQueue(store, ctx.media, { force: true });
    expect(again.synced).toHaveLength(1);
    expect(ctx.media.objects.size).toBe(1);
    expect([...ctx.media.medias.values()]).toHaveLength(1);
    expect(await ctx.media.uploadObject(prepared.storagePath, new Uint8Array(1), "image/jpeg")).toBe("exists");
  });

  it("refus serveur : échec visible, jamais relancé automatiquement ; abandon explicite retire le fichier orphelin", async () => {
    const ctx = await setup();
    const library = await ctx.owner.library(ctx.releve.id);
    const prepared = ctx.owner.preparePhoto({ structure: library.structure, elements: library.elements, target: { kind: "releve" }, mimeType: "image/jpeg", bytes: 500_000, metadata: metadata() });
    const store = new MemoryUploadQueueStore();
    await enqueuePhoto(store, prepared, new Uint8Array(500_000), { label: "Refusée" });
    ctx.media.insertMedia = async () => { throw new MediaRemoteError("Action non autorisée.", "forbidden", "42501"); };
    const run = await processUploadQueue(store, ctx.media);
    expect(run.failed).toHaveLength(1);
    expect((await store.list())[0]).toMatchObject({ status: "echec", nextAttemptAt: null });
    expect((await processUploadQueue(store, ctx.media, { now: () => new Date("2030-01-01T00:00:00Z") })).failed).toHaveLength(0);
    await discardPending(store, prepared.mediaId, ctx.media);
    expect(await store.list()).toEqual([]);
    expect(ctx.media.objects.has(prepared.storagePath)).toBe(false);
    expect(uploadQueueDatabaseName(USER_OWNER, TENANT_A)).toBe(`elsatia-releve-file:${USER_OWNER}:${TENANT_A}`);
  });

  it("préparation refusée : type, taille, métadonnées interdites, rôle consultation", async () => {
    const ctx = await setup();
    const library = await ctx.owner.library(ctx.releve.id);
    const base = { structure: library.structure, elements: library.elements, target: { kind: "releve" } as PhotoTarget, metadata: metadata() };
    expect(() => ctx.owner.preparePhoto({ ...base, mimeType: "image/heic", bytes: 10 })).toThrow(ReleveValidationError);
    expect(() => ctx.owner.preparePhoto({ ...base, mimeType: "image/jpeg", bytes: 16 * 1024 * 1024 })).toThrow(/volumineux/);
    expect(() => ctx.owner.preparePhoto({ ...base, mimeType: "image/jpeg", bytes: 10, metadata: { ...metadata(), latitude: 1 } as never })).toThrow(/localisation/);
    const lecteur = new ReleveMediaService(ctx.media, ctx.releves, actor({ userId: USER_OTHER, role: "tools_releve_consultation" }));
    const shared = { ...library.structure, releve: { ...library.structure.releve, visibilite: "entreprise" as const } };
    expect(() => lecteur.preparePhoto({ ...base, structure: shared, mimeType: "image/jpeg", bytes: 10 })).toThrow(RelevePermissionError);
    const autreTenant = new ReleveMediaService(ctx.media, ctx.releves, actor({ tenantId: TENANT_B }));
    await expect(autreTenant.library(ctx.releve.id)).rejects.toThrow(/introuvable/);
  });
});

describe("lecture, suppression, remplacement", () => {
  it("URL signée courte pour le relevé attendu ; chemin d'un autre tenant refusé avant tout appel", async () => {
    const ctx = await setup();
    const { prepared } = await shoot(ctx, { kind: "releve" });
    const entry = await entryOf(ctx, prepared.mediaId);
    expect(await ctx.owner.photoUrl(ctx.structure.releve, entry.media)).toBe(`memory://${prepared.storagePath}?expires=600`);
    const forged = { storagePath: prepared.storagePath.replace(TENANT_A, TENANT_B) };
    await expect(ctx.owner.photoUrl(ctx.structure.releve, forged)).rejects.toThrow(/autre entreprise/);
  });

  it("propriétaire : retrait de la photo, de ses ancres et annotations, fichier supprimé", async () => {
    const ctx = await setup();
    const { prepared } = await shoot(ctx, { kind: "piece", id: ctx.sejour.id });
    let entry = await entryOf(ctx, prepared.mediaId);
    await ctx.owner.annotate(ctx.structure.releve, entry.anchors[0], { forme: "cercle", cx: 0.5, cy: 0.5, r: 0.1 });
    entry = await entryOf(ctx, prepared.mediaId);
    expect(entry.annotations).toHaveLength(1);
    expect(await ctx.owner.deletePhoto(ctx.structure.releve, entry.media)).toEqual({ fileRemoved: true });
    expect(await entryOf(ctx, prepared.mediaId)).toBeUndefined();
    expect(ctx.media.objects.size).toBe(0);
    expect([...ctx.media.elements.values()].filter((element) => element.type !== "mur" && element.type !== "equipement" && !element.deletedAt)).toEqual([]);
  });

  it("métreur sur un relevé partagé : retire la photo d'un autre, mais le fichier reste jusqu'à la purge d'un responsable", async () => {
    const ctx = await setup();
    const shared = await ctx.structureService.setVisibility(ctx.releve.id, "entreprise");
    const { prepared } = await shoot(ctx, { kind: "releve" });
    const collegue = new ReleveMediaService(ctx.media, ctx.releves, actor({ userId: USER_OTHER }));
    const entry = await entryOf(ctx, prepared.mediaId, collegue);
    expect(collegue.canRemoveFile(shared, entry.media)).toBe(false);
    expect(await collegue.deletePhoto(shared, entry.media)).toEqual({ fileRemoved: false });
    expect(ctx.media.objects.has(prepared.storagePath)).toBe(true);
    await expect(collegue.purgeRetiredFiles(ctx.releve.id)).rejects.toThrow(RelevePermissionError);
    const admin = new ReleveMediaService(ctx.media, ctx.releves, actor({ userId: USER_ADMIN, role: "tools_releve_admin" }));
    expect(await admin.purgeRetiredFiles(ctx.releve.id)).toEqual([prepared.storagePath]);
    expect(ctx.media.objects.size).toBe(0);
  });

  it("auteur du dépôt : peut supprimer son propre fichier sur un relevé partagé", async () => {
    const ctx = await setup();
    const shared = await ctx.structureService.setVisibility(ctx.releve.id, "entreprise");
    const collegue = new ReleveMediaService(ctx.media, ctx.releves, actor({ userId: USER_OTHER }), sequentialUuid("0003"));
    ctx.media.actorId = USER_OTHER;
    const { prepared } = await shoot(ctx, { kind: "releve" }, collegue);
    const entry = await entryOf(ctx, prepared.mediaId, collegue);
    expect(entry.media.createdBy).toBe(USER_OTHER);
    expect(await collegue.deletePhoto(shared, entry.media)).toEqual({ fileRemoved: true });
  });

  it("remplacement : les ancres suivent la nouvelle photo (repères et annotations de l'ancienne retirés), lignée conservée", async () => {
    const ctx = await setup();
    const first = await shoot(ctx, { kind: "equipement", id: ctx.equipement });
    let entry = await entryOf(ctx, first.prepared.mediaId);
    const anchor = await ctx.owner.saveReperes(ctx.structure.releve, entry.anchors[0], addRepere([], { x: 0.2, y: 0.3, label: "Disjoncteur" }, "e0000000-0000-4000-8000-000000000001"));
    await ctx.owner.annotate(ctx.structure.releve, anchor, { forme: "fleche", x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 });
    const second = await shoot(ctx, { kind: "equipement", id: ctx.equipement }, ctx.owner, first.prepared.mediaId);
    expect(second.run.synced).toHaveLength(1);
    expect(await entryOf(ctx, first.prepared.mediaId)).toBeUndefined();
    entry = await entryOf(ctx, second.prepared.mediaId);
    // La nouvelle photo hérite de l'ancre d'origine (repointée), sans en créer une seconde.
    expect(entry.anchors.map((item) => item.id)).toEqual([anchor.id]);
    expect(entry.anchors.find((item) => item.id === anchor.id)?.donnees.reperes).toEqual([]);
    expect(entry.annotations).toEqual([]);
    expect(entry.media.metadata.remplaceMediaId).toBe(first.prepared.mediaId);
    expect(ctx.media.objects.has(first.prepared.storagePath)).toBe(false);
  });
});

describe("repères (x/y normalisés, objet lié, libellé, ordre) et annotations sur photo", () => {
  it("ajout, déplacement, modification, suppression avec renumérotation continue", () => {
    const ids = ["e0000000-0000-4000-8000-000000000001", "e0000000-0000-4000-8000-000000000002", "e0000000-0000-4000-8000-000000000003"];
    let reperes = addRepere([], { x: -1, y: 0.5, label: " Angle NO " }, ids[0]);
    reperes = addRepere(reperes, { x: 0.5, y: 2, label: "Prise", cible: { kind: "piece", id: "f0000000-0000-4000-8000-000000000001" } }, ids[1]);
    reperes = addRepere(reperes, { x: 0.9, y: 0.9, label: "Fissure" }, ids[2]);
    expect(reperes.map((repere) => [repere.label, repere.x, repere.y, repere.ordre])).toEqual([["Angle NO", 0, 0.5, 0], ["Prise", 0.5, 1, 1], ["Fissure", 0.9, 0.9, 2]]);
    reperes = moveRepere(reperes, ids[2], -1);
    expect(sortReperes(reperes).map((repere) => repere.label)).toEqual(["Angle NO", "Fissure", "Prise"]);
    expect(moveRepere(reperes, ids[0], -1).map((repere) => repere.ordre)).toEqual([0, 1, 2]);
    reperes = updateRepere(reperes, ids[1], { label: "Prise 16 A", x: 0.55 });
    expect(reperes.find((repere) => repere.id === ids[1])).toMatchObject({ label: "Prise 16 A", x: 0.55, cible: { kind: "piece" } });
    reperes = removeRepere(reperes, ids[0]);
    expect(reperes.map((repere) => [repere.label, repere.ordre])).toEqual([["Fissure", 0], ["Prise 16 A", 1]]);
    expect(() => addRepere(reperes, { x: 0, y: 0, label: "  " }, ids[0])).toThrow(/libellé/);
    expect(validateElementDraft({ type: "photo_anchor", donnees: { mediaId: ids[0], ancre: { kind: "entite", ref: { kind: "releve", id: ids[0] } }, directionRad: null, legende: null, ordre: 0, reperes } }).ok).toBe(true);
  });

  it("validation : repères hors bornes, doublons, ancre plan hors [0, 1] refusés", () => {
    const id = "e0000000-0000-4000-8000-000000000001";
    const donnees = (patch: Record<string, unknown>) => ({ mediaId: id, ancre: { kind: "entite", ref: { kind: "releve", id } }, directionRad: null, legende: null, ...patch });
    const issues = (patch: Record<string, unknown>) => { const result = validateElementDraft({ type: "photo_anchor", donnees: donnees(patch) }); return result.ok ? [] : result.issues.map((issue) => issue.path); };
    expect(issues({ reperes: [{ id, x: 1.2, y: 0, label: "A", ordre: 0, cible: null }] })).toEqual(["donnees.reperes.0.x"]);
    expect(issues({ reperes: [{ id, x: 0, y: 0, label: "A", ordre: 0 }, { id, x: 0, y: 0, label: "B", ordre: 1 }] })).toEqual(["donnees.reperes.1.id"]);
    expect(issues({ ordre: -1 })).toEqual(["donnees.ordre"]);
    expect(issues({ ancre: { kind: "plan", etageId: id, x: 0.5, y: -0.1 } })).toEqual(["donnees.ancre.y"]);
    expect(issues({ ancre: { kind: "gps", lat: 1 } })).toEqual(["donnees.ancre.kind"]);
  });

  it("texte, flèche et cercle : géométrie normalisée sur la photo ; formes dégénérées refusées", async () => {
    const anchorId = asElementId("e0000000-0000-4000-8000-00000000000a") as ElementId;
    const texte = buildPhotoAnnotation(anchorId, { forme: "texte", x: 0.1, y: 0.2, texte: "Humidité" });
    const fleche = buildPhotoAnnotation(anchorId, { forme: "fleche", x1: 0.1, y1: 0.1, x2: 1.4, y2: 0.5, couleur: "jaune" });
    const cercle = buildPhotoAnnotation(anchorId, { forme: "cercle", cx: 0.5, cy: 0.5, r: 0.2, texte: "Fissure" });
    expect(fleche.geometrie).toEqual({ espace: "photo", x1: 0.1, y1: 0.1, x2: 1, y2: 0.5, couleur: "jaune" });
    for (const donnees of [texte, fleche, cercle]) expect(validateElementDraft({ type: "annotation", donnees }).ok).toBe(true);
    expect(() => buildPhotoAnnotation(anchorId, { forme: "texte", x: 0, y: 0, texte: " " })).toThrow(/texte/);
    expect(() => buildPhotoAnnotation(anchorId, { forme: "fleche", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.501 })).toThrow(/courte/);
    expect(() => buildPhotoAnnotation(anchorId, { forme: "cercle", cx: 0.5, cy: 0.5, r: 0 })).toThrow(/petit/);
    const invalide = validateElementDraft({ type: "annotation", donnees: { ...cercle, geometrie: { espace: "photo", cx: 2, cy: 0.5, r: 0.1, couleur: "vert" } } });
    expect(invalide.ok ? [] : invalide.issues.map((issue) => issue.path)).toEqual(["donnees.geometrie.cx", "donnees.geometrie.couleur"]);
    const zone = validateElementDraft({ type: "annotation", donnees: { ...cercle, forme: "zone", geometrie: { espace: "photo" } } });
    expect(zone.ok).toBe(false);
  });

  it("service : repères enregistrés avec contrôle de révision ; annotation retirée ; détacher le dernier rattachement refusé", async () => {
    const ctx = await setup();
    const { prepared } = await shoot(ctx, { kind: "mur", id: ctx.mur });
    let entry = await entryOf(ctx, prepared.mediaId);
    const stale = entry.anchors[0];
    const saved = await ctx.owner.saveReperes(ctx.structure.releve, stale, addRepere([], { x: 0.5, y: 0.5, label: "Axe" }, "e0000000-0000-4000-8000-000000000001"));
    expect(saved.revision).toBe(stale.revision + 1);
    await expect(ctx.owner.saveLegende(ctx.structure.releve, stale, "Mur nord")).rejects.toThrow(/Modifié ailleurs/);
    await ctx.owner.saveLegende(ctx.structure.releve, saved, "Mur nord", 3);
    const annotationId = await ctx.owner.annotate(ctx.structure.releve, saved, { forme: "texte", x: 0.3, y: 0.3, texte: "Salpêtre" });
    entry = await entryOf(ctx, prepared.mediaId);
    expect(entry.anchors[0].donnees).toMatchObject({ legende: "Mur nord", ordre: 3 });
    await ctx.owner.removeAnnotation(ctx.structure.releve, entry.annotations.find((item) => item.id === annotationId)!);
    const library = await ctx.owner.library(ctx.releve.id);
    await expect(ctx.owner.detach(ctx.structure.releve, entry.anchors[0], library.elements)).rejects.toThrow(/au moins un rattachement/);
    const second = await ctx.owner.attach(library.structure, library.elements, entry.media, { kind: "plan", etageId: ctx.rdc.id, x: 0.25, y: 0.75 });
    entry = await entryOf(ctx, prepared.mediaId);
    expect(entry.anchors.map((item) => item.id)).toContain(second);
    await ctx.owner.detach(ctx.structure.releve, entry.anchors[0], (await ctx.owner.library(ctx.releve.id)).elements);
    expect((await entryOf(ctx, prepared.mediaId)).annotations).toEqual([]);
  });
});

it("relevé inconnu → introuvable", async () => {
  const ctx = await setup();
  await expect(ctx.owner.library("f0000000-0000-4000-8000-00000000dead" as ReleveId)).rejects.toThrow(/introuvable/);
  const elements: ReleveElement[] = []; const structure: ReleveStructure = ctx.structure;
  expect(() => resolvePhotoPlacement({ kind: "plan", etageId: ctx.rdc.id, x: Number.NaN, y: 0 }, structure, elements)).toThrow(/Position/);
});
