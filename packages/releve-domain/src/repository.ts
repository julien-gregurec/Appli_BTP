/**
 * Port de persistance Relevé & Métré, et implémentation mémoire de référence.
 *
 * Le domaine ne connaît ni Supabase ni IndexedDB : chaque plateforme fournit un adaptateur
 * (`apps/tools/src/lib/releve/supabase-repository.ts` pour le web et le WebView Capacitor,
 * un futur adaptateur hors ligne, un futur module de capture natif). L'implémentation
 * mémoire reproduit les règles serveur (métadonnées, révision, cascade de suppression douce)
 * et sert de spécification exécutable aux adaptateurs.
 */

import { newUuid, type BatimentId, type ChantierId, type EtageId, type PieceId, type ReleveId, type TenantId, type UserId, type VersionId, type ZoneId } from "./ids";
import { descendantsOf } from "./hierarchy";
import {
  RELEVE_SCHEMA_VERSION, type Batiment, type Chantier, type EntityMeta, type Etage, type Piece, type Releve, type ReleveStructure,
  type Version, type VersionType, type Zone,
} from "./model";
import type { NodePatchByKind, NormalizedChantierDraft, NormalizedEtageDraft, NormalizedPieceDraft, NormalizedReleveDraft } from "./validation";
import { planVersion } from "./versioning";
import { planDuplication, searchStructure, siblingsOf, type ActivityEntry, type DuplicableKind, type SearchHit } from "./terrain";

export type StructureKind = "chantier" | "batiment" | "etage" | "zone" | "piece";

export type NewReleve = NormalizedReleveDraft & { id: ReleveId; entrepriseId: TenantId };
export type NewChantier = NormalizedChantierDraft & { id: ChantierId; releveId: ReleveId };
export type NewBatiment = { id: BatimentId; releveId: ReleveId; chantierId: ChantierId; nom: string; ordre: number; notes: string | null };
export type NewEtage = NormalizedEtageDraft & { id: EtageId; releveId: ReleveId; batimentId: BatimentId };
export type NewZone = { id: ZoneId; releveId: ReleveId; etageId: EtageId; nom: string; type: Zone["type"]; ordre: number };
export type NewPiece = Omit<NormalizedPieceDraft, "zoneId"> & { id: PieceId; releveId: ReleveId; etageId: EtageId; zoneId: ZoneId | null };

export type RelevePatch = Partial<Omit<NormalizedReleveDraft, never>>;
/** Modification d'un nœud : champs validés par `validateNodePatch` (+ `ordre`, réservé au dépôt). */
export type StructurePatch<K extends StructureKind = StructureKind> = NodePatchByKind[K] & { ordre?: number };
export type StructureNodeByKind = { chantier: Chantier; batiment: Batiment; etage: Etage; zone: Zone; piece: Piece };
export type NewVersion = { libelle: string | null; type: VersionType; baseId: string | null };

export class ReleveConflictError extends Error {
  constructor(public readonly currentRevision: number) { super("Le relevé a été modifié ailleurs : rechargez avant d'enregistrer."); this.name = "ReleveConflictError"; }
}
export class ReleveNotFoundError extends Error {
  constructor(what: string) { super(`${what} introuvable ou non accessible.`); this.name = "ReleveNotFoundError"; }
}

export interface ReleveRepository {
  listReleves(tenantId: TenantId): Promise<Releve[]>;
  getStructure(releveId: ReleveId): Promise<ReleveStructure | null>;
  createReleve(input: NewReleve): Promise<Releve>;
  /** `expectedRevision` : contrôle optimiste ; conflit → {@link ReleveConflictError}. */
  updateReleve(releveId: ReleveId, patch: RelevePatch, expectedRevision: number): Promise<Releve>;
  setReleveDeleted(releveId: ReleveId, deleted: boolean): Promise<Releve>;
  createChantier(input: NewChantier): Promise<Chantier>;
  createBatiment(input: NewBatiment): Promise<Batiment>;
  createEtage(input: NewEtage): Promise<Etage>;
  createZone(input: NewZone): Promise<Zone>;
  createPiece(input: NewPiece): Promise<Piece>;
  /**
   * Modification d'un nœud. Avec `expectedRevision` : contrôle optimiste — si la ligne a été
   * modifiée ailleurs (autre onglet, autre appareil), {@link ReleveConflictError} et rien
   * n'est écrit. Renvoie la ligne à jour (nouvelle révision).
   */
  updateStructureNode<K extends StructureKind>(kind: K, id: string, patch: StructurePatch<K>, expectedRevision?: number): Promise<StructureNodeByKind[K]>;
  /** Duplication de sous-structure (jamais d'élément ni de média). Renvoie l'identifiant de la copie. */
  duplicateNode(kind: DuplicableKind, id: string, newId: string, nom?: string | null): Promise<string>;
  /** Réordonne une fratrie complète, atomiquement. Renvoie le nombre de lignes modifiées. */
  reorderNodes(kind: StructureKind, orderedIds: readonly string[]): Promise<number>;
  /** Recherche simple sur les relevés visibles de l'entreprise. */
  search(tenantId: TenantId, query: string): Promise<SearchHit[]>;
  /** Journal d'activité d'un relevé, plus récent d'abord. */
  listActivity(releveId: ReleveId, limit: number): Promise<ActivityEntry[]>;
  /** Suppression douce ; chantier, bâtiment et étage emportent leurs descendants (et les restaurent). */
  setStructureNodeDeleted(kind: StructureKind, id: string, deleted: boolean): Promise<void>;
  /** Version typée ; le serveur applique les mêmes règles que {@link planVersion}. */
  createVersion(releveId: ReleveId, input: NewVersion): Promise<Version>;
  listVersions(releveId: ReleveId): Promise<Version[]>;
}

// ── Implémentation mémoire ────────────────────────────────────────────────────

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Row = Mutable<EntityMeta> & { id: string; releveId?: string };

export type MemoryRepositoryOptions = { actorId: UserId; now?: () => string; uuid?: () => string };

/**
 * Dépôt mémoire mono-acteur. Il n'applique PAS les permissions (c'est le rôle du service et,
 * en production, de la RLS) mais il applique tout le reste : métadonnées serveur, révisions,
 * cohérence parent/enfant, cascade de suppression douce, numérotation des versions.
 */
export class InMemoryReleveRepository implements ReleveRepository {
  private readonly releves = new Map<string, Mutable<Releve>>();
  private readonly chantiers = new Map<string, Mutable<Chantier>>();
  private readonly batiments = new Map<string, Mutable<Batiment>>();
  private readonly etages = new Map<string, Mutable<Etage>>();
  private readonly zones = new Map<string, Mutable<Zone>>();
  private readonly pieces = new Map<string, Mutable<Piece>>();
  private readonly versions = new Map<string, Version>();
  private readonly journal: ActivityEntry[] = [];
  private readonly now: () => string;
  private readonly uuid: () => string;

  constructor(private readonly options: MemoryRepositoryOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.uuid = options.uuid ?? (() => newUuid());
  }

  private meta(entrepriseId: TenantId): Mutable<EntityMeta> {
    const at = this.now();
    return { entrepriseId, createdAt: at, updatedAt: at, createdBy: this.options.actorId, updatedBy: this.options.actorId, revision: 1, deletedAt: null };
  }

  private touch(row: Row) { row.updatedAt = this.now(); row.updatedBy = this.options.actorId; row.revision += 1; }

  private log(entite: ActivityEntry["entite"], entiteId: string, action: ActivityEntry["action"], champs: string[] = [], details: Record<string, unknown> | null = null, releveId?: string) {
    this.journalReleve.set(this.journal.length + 1, releveId ?? entiteId);
    this.journal.push({ id: this.journal.length + 1, entite, entiteId, action, champs, auteurId: this.options.actorId, createdAt: this.now(), details });
  }
  private readonly journalReleve = new Map<number, string>();

  private requireReleve(releveId: string, allowDeleted = false): Mutable<Releve> {
    const releve = this.releves.get(releveId);
    if (!releve || (!allowDeleted && releve.deletedAt)) throw new ReleveNotFoundError("Relevé");
    return releve;
  }

  private table(kind: StructureKind): Map<string, Row> {
    return ({ chantier: this.chantiers, batiment: this.batiments, etage: this.etages, zone: this.zones, piece: this.pieces } as Record<StructureKind, Map<string, Row>>)[kind];
  }

  async listReleves(tenantId: TenantId) {
    return [...this.releves.values()].filter((releve) => releve.entrepriseId === tenantId).map((releve) => ({ ...releve }));
  }

  async getStructure(releveId: ReleveId): Promise<ReleveStructure | null> {
    const releve = this.releves.get(releveId);
    if (!releve) return null;
    const of = <T extends { releveId: string }>(map: Map<string, T>) => [...map.values()].filter((row) => row.releveId === releveId).map((row) => ({ ...row }));
    return { releve: { ...releve }, chantiers: of(this.chantiers), batiments: of(this.batiments), etages: of(this.etages), zones: of(this.zones), pieces: of(this.pieces) };
  }

  async createReleve(input: NewReleve): Promise<Releve> {
    if (this.releves.has(input.id)) throw new Error("Identifiant de relevé déjà utilisé.");
    const releve: Mutable<Releve> = {
      ...this.meta(input.entrepriseId), id: input.id, kind: "releve", schemaVersion: RELEVE_SCHEMA_VERSION,
      proprietaireId: this.options.actorId, nom: input.nom, reference: input.reference, statut: input.statut, visibilite: input.visibilite,
      chantier: { nom: input.chantierNom, adresse: input.chantierAdresse, codePostal: input.chantierCodePostal, ville: input.chantierVille, gpChantierId: input.chantierGpId },
      client: { nom: input.clientNom, gpClientId: input.clientGpId }, dateReleve: input.dateReleve, notes: input.notes,
    };
    this.releves.set(releve.id, releve);
    this.log("releve", releve.id, "creation");
    return { ...releve };
  }

  async updateReleve(releveId: ReleveId, patch: RelevePatch, expectedRevision: number): Promise<Releve> {
    const releve = this.requireReleve(releveId);
    if (releve.revision !== expectedRevision) throw new ReleveConflictError(releve.revision);
    const chantier = { ...releve.chantier }; const client = { ...releve.client };
    if (patch.chantierNom !== undefined) chantier.nom = patch.chantierNom;
    if (patch.chantierAdresse !== undefined) chantier.adresse = patch.chantierAdresse;
    if (patch.chantierCodePostal !== undefined) chantier.codePostal = patch.chantierCodePostal;
    if (patch.chantierVille !== undefined) chantier.ville = patch.chantierVille;
    if (patch.chantierGpId !== undefined) chantier.gpChantierId = patch.chantierGpId;
    if (patch.clientNom !== undefined) client.nom = patch.clientNom;
    if (patch.clientGpId !== undefined) client.gpClientId = patch.clientGpId;
    Object.assign(releve, {
      ...(patch.nom !== undefined && { nom: patch.nom }), ...(patch.reference !== undefined && { reference: patch.reference }),
      ...(patch.statut !== undefined && { statut: patch.statut }), ...(patch.visibilite !== undefined && { visibilite: patch.visibilite }),
      ...(patch.dateReleve !== undefined && { dateReleve: patch.dateReleve }), ...(patch.notes !== undefined && { notes: patch.notes }),
      chantier, client,
    });
    this.touch(releve);
    return { ...releve };
  }

  async setReleveDeleted(releveId: ReleveId, deleted: boolean): Promise<Releve> {
    const releve = this.requireReleve(releveId, true);
    if (Boolean(releve.deletedAt) === deleted) return { ...releve };
    releve.deletedAt = deleted ? this.now() : null;
    this.touch(releve);
    this.log("releve", releve.id, deleted ? "suppression" : "restauration", ["deleted_at"]);
    return { ...releve };
  }

  private checkParent(map: Map<string, Row>, id: string, releveId: string, label: string) {
    const parent = map.get(id);
    if (!parent || parent.releveId !== releveId || parent.deletedAt) throw new ReleveNotFoundError(label);
  }

  async createChantier(input: NewChantier): Promise<Chantier> {
    const releve = this.requireReleve(input.releveId);
    const row: Mutable<Chantier> = { ...this.meta(releve.entrepriseId), ...input, id: input.id };
    this.chantiers.set(row.id, row); this.log("chantier", row.id, "creation", [], null, row.releveId); return { ...row };
  }

  async createBatiment(input: NewBatiment): Promise<Batiment> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.chantiers, input.chantierId, input.releveId, "Chantier");
    const row: Mutable<Batiment> = { ...this.meta(releve.entrepriseId), ...input };
    this.batiments.set(row.id, row); this.log("batiment", row.id, "creation", [], null, row.releveId); return { ...row };
  }

  async createEtage(input: NewEtage): Promise<Etage> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.batiments, input.batimentId, input.releveId, "Bâtiment");
    const row: Mutable<Etage> = { ...this.meta(releve.entrepriseId), ...input };
    this.etages.set(row.id, row); this.log("etage", row.id, "creation", [], null, row.releveId); return { ...row };
  }

  async createZone(input: NewZone): Promise<Zone> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.etages, input.etageId, input.releveId, "Étage");
    const row: Mutable<Zone> = { ...this.meta(releve.entrepriseId), ...input };
    this.zones.set(row.id, row); this.log("zone", row.id, "creation", [], null, row.releveId); return { ...row };
  }

  async createPiece(input: NewPiece): Promise<Piece> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.etages, input.etageId, input.releveId, "Étage");
    if (input.zoneId) {
      const zone = this.zones.get(input.zoneId);
      if (!zone || zone.releveId !== input.releveId || zone.etageId !== input.etageId || zone.deletedAt) throw new ReleveNotFoundError("Zone de cet étage");
    }
    const row: Mutable<Piece> = { ...this.meta(releve.entrepriseId), ...input, surfaceCalculeeMm2: null, volumeCalculeMm3: null };
    this.pieces.set(row.id, row); this.log("piece", row.id, "creation", [], null, row.releveId); return { ...row };
  }

  async updateStructureNode<K extends StructureKind>(kind: K, id: string, patch: StructurePatch<K>, expectedRevision?: number): Promise<StructureNodeByKind[K]> {
    const row = this.table(kind).get(id) as (Row & Record<string, unknown>) | undefined;
    if (!row || row.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    this.requireReleve(row.releveId!);
    if (expectedRevision !== undefined && row.revision !== expectedRevision) throw new ReleveConflictError(row.revision);
    const changes = Object.entries(patch).filter(([key, value]) => value !== undefined && row[key] !== value);
    if (kind === "batiment" && "chantierId" in patch && patch.chantierId !== row.chantierId) this.checkParent(this.chantiers, String(patch.chantierId), row.releveId!, "Chantier");
    if (kind === "piece" && "zoneId" in patch && patch.zoneId) {
      const zone = this.zones.get(String(patch.zoneId));
      if (!zone || zone.etageId !== row.etageId || zone.deletedAt) throw new ReleveNotFoundError("Zone de cet étage");
    }
    if (!changes.length) return { ...row } as unknown as StructureNodeByKind[K];
    const champs = changes.map(([key]) => key);
    for (const [key, value] of changes) row[key] = value;
    this.touch(row);
    const parent = kind === "batiment" ? "chantierId" : kind === "piece" ? "zoneId" : null;
    const action = parent && champs.includes(parent) ? "deplacement" : champs.length === 1 && champs[0] === "nom" ? "renommage" : champs.length === 1 && champs[0] === "ordre" ? "reordonnancement" : "modification";
    this.log(kind, id, action, champs, null, row.releveId);
    return { ...row } as unknown as StructureNodeByKind[K];
  }

  async setStructureNodeDeleted(kind: StructureKind, id: string, deleted: boolean) {
    const row = this.table(kind).get(id);
    if (!row) throw new ReleveNotFoundError("Élément de structure");
    this.requireReleve(row.releveId!);
    if (Boolean(row.deletedAt) === deleted) return;
    const structure = (await this.getStructure(row.releveId as ReleveId))!;
    const previous = row.deletedAt;
    const at = deleted ? this.now() : null;
    const apply = (target: Row) => { target.deletedAt = at; this.touch(target); };
    if (!deleted) {
      // Même règle que la garde SQL : restauration sous un parent actif uniquement.
      const parentOf = { chantier: () => null, batiment: () => this.chantiers.get((row as unknown as Batiment).chantierId), etage: () => this.batiments.get((row as unknown as Etage).batimentId), zone: () => this.etages.get((row as unknown as Zone).etageId), piece: () => this.etages.get((row as unknown as Piece).etageId) }[kind]();
      if (parentOf?.deletedAt) throw new Error("Restaurez d'abord l'élément parent.");
    }
    apply(row);
    this.log(kind, id, deleted ? "suppression" : "restauration", ["deleted_at"], null, row.releveId);
    const descendants = descendantsOf(structure, { kind, id });
    // Même règle que le trigger SQL : la restauration ne ranime que les descendants
    // supprimés par CETTE cascade (même horodatage), jamais une suppression antérieure.
    const eligible = (target: Row | undefined): target is Row => Boolean(target) && (deleted ? !target!.deletedAt : target!.deletedAt === previous);
    for (const batimentId of descendants.batiments) { const target = this.batiments.get(batimentId); if (eligible(target)) apply(target); }
    for (const etageId of descendants.etages) { const target = this.etages.get(etageId); if (eligible(target)) apply(target); }
    for (const zoneId of descendants.zones) { const target = this.zones.get(zoneId); if (eligible(target)) apply(target); }
    for (const pieceId of descendants.pieces) { const target = this.pieces.get(pieceId); if (eligible(target)) apply(target); }
  }

  async duplicateNode(kind: DuplicableKind, id: string, newId: string, nom?: string | null): Promise<string> {
    const source = this.table(kind).get(id);
    if (!source || source.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    const structure = (await this.getStructure(source.releveId as ReleveId))!;
    if (structure.releve.deletedAt) throw new ReleveNotFoundError("Relevé");
    if (this.table(kind).has(newId)) throw new Error("Identifiant déjà utilisé.");
    const plan = planDuplication(structure, kind, id, { newId, nom, uuid: this.uuid });
    if (!plan) throw new ReleveNotFoundError("Élément de structure");
    const meta = () => this.meta(structure.releve.entrepriseId);
    for (const item of plan.batiments) this.batiments.set(item.id, { ...item, ...meta() });
    for (const item of plan.etages) this.etages.set(item.id, { ...item, ...meta() });
    for (const item of plan.zones) this.zones.set(item.id, { ...item, ...meta() });
    for (const item of plan.pieces) this.pieces.set(item.id, { ...item, ...meta() });
    const noeuds = plan.batiments.length + plan.etages.length + plan.zones.length + plan.pieces.length;
    this.log(kind, newId, "duplication", [], { source_id: id, noeuds, elements_copies: 0, medias_copies: 0 }, structure.releve.id);
    return newId;
  }

  async reorderNodes(kind: StructureKind, orderedIds: readonly string[]): Promise<number> {
    const first = this.table(kind).get(orderedIds[0] ?? "");
    if (!first || new Set(orderedIds).size !== orderedIds.length) throw new ReleveNotFoundError("Élément de structure");
    const structure = (await this.getStructure(first.releveId as ReleveId))!;
    const siblings = siblingsOf(structure, kind, first.id).map((item) => item.id);
    if (siblings.length !== orderedIds.length || !orderedIds.every((id) => siblings.includes(id))) {
      throw new ReleveConflictError(first.revision);
    }
    let changed = 0;
    orderedIds.forEach((id, index) => {
      const row = this.table(kind).get(id) as Row & { ordre: number };
      if (row.ordre === index) return;
      row.ordre = index; this.touch(row); changed += 1;
      this.log(kind, id, "reordonnancement", ["ordre"], { vers: index }, row.releveId);
    });
    return changed;
  }

  async search(tenantId: TenantId, query: string): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    for (const releve of this.releves.values()) {
      if (releve.entrepriseId !== tenantId) continue;
      hits.push(...searchStructure((await this.getStructure(releve.id))!, query));
    }
    return hits.slice(0, 30);
  }

  async listActivity(releveId: ReleveId, limit: number): Promise<ActivityEntry[]> {
    return this.journal.filter((entry) => this.journalReleve.get(entry.id) === releveId).reverse().slice(0, limit);
  }

  async createVersion(releveId: ReleveId, input: NewVersion): Promise<Version> {
    const releve = this.requireReleve(releveId);
    const planned = planVersion([...this.versions.values()].filter((version) => version.releveId === releveId), { type: input.type, baseId: input.baseId });
    if (!planned.ok) throw new Error(planned.message);
    const structure = await this.getStructure(releveId);
    const { numero, type, baseId } = planned.plan;
    const version: Version = {
      id: this.uuid() as VersionId, entrepriseId: releve.entrepriseId, releveId, numero, typeVersion: type, versionBaseId: baseId,
      libelle: input.libelle, revisionSource: releve.revision,
      empreinte: fingerprint(JSON.stringify({ type, baseId, structure })), createdAt: this.now(), createdBy: this.options.actorId,
    };
    this.versions.set(version.id, version);
    return version;
  }

  async listVersions(releveId: ReleveId) {
    return [...this.versions.values()].filter((version) => version.releveId === releveId).sort((a, b) => b.numero - a.numero);
  }
}

/** Empreinte non cryptographique (FNV-1a 32 bits, hexadécimal) pour le dépôt mémoire. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
