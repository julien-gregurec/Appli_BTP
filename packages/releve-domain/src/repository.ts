/**
 * Port de persistance Relevé & Métré, et implémentation mémoire de référence.
 *
 * Le domaine ne connaît ni Supabase ni IndexedDB : chaque plateforme fournit un adaptateur
 * (`apps/tools/src/lib/releve/supabase-repository.ts` pour le web et le WebView Capacitor,
 * un futur adaptateur hors ligne, un futur module de capture natif). L'implémentation
 * mémoire reproduit les règles serveur (métadonnées, révision, cascade de suppression douce)
 * et sert de spécification exécutable aux adaptateurs.
 */

import { newUuid, type BatimentId, type EtageId, type PieceId, type ReleveId, type TenantId, type UserId, type VersionId, type ZoneId } from "./ids";
import { descendantsOf } from "./hierarchy";
import {
  RELEVE_SCHEMA_VERSION, type Batiment, type EntityMeta, type Etage, type Piece, type Releve, type ReleveStructure,
  type Version, type Zone,
} from "./model";
import type { NormalizedReleveDraft } from "./validation";

export type StructureKind = "batiment" | "etage" | "zone" | "piece";

export type NewReleve = NormalizedReleveDraft & { id: ReleveId; entrepriseId: TenantId };
export type NewBatiment = { id: BatimentId; releveId: ReleveId; nom: string; ordre: number; notes: string | null };
export type NewEtage = { id: EtageId; releveId: ReleveId; batimentId: BatimentId; nom: string; niveau: number; altitudeMm: number | null; hauteurSousPlafondMm: number | null; etat: Etage["etat"]; ordre: number };
export type NewZone = { id: ZoneId; releveId: ReleveId; etageId: EtageId; nom: string; type: Zone["type"]; ordre: number };
export type NewPiece = { id: PieceId; releveId: ReleveId; etageId: EtageId; zoneId: ZoneId | null; nom: string; usage: Piece["usage"]; hauteurSousPlafondMm: number | null; ordre: number };

export type RelevePatch = Partial<Omit<NormalizedReleveDraft, never>>;
export type StructurePatch = { nom?: string; ordre?: number };

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
  createBatiment(input: NewBatiment): Promise<Batiment>;
  createEtage(input: NewEtage): Promise<Etage>;
  createZone(input: NewZone): Promise<Zone>;
  createPiece(input: NewPiece): Promise<Piece>;
  updateStructureNode(kind: StructureKind, id: string, patch: StructurePatch): Promise<void>;
  /** Suppression douce ; bâtiment et étage emportent leurs descendants (et les restaurent). */
  setStructureNodeDeleted(kind: StructureKind, id: string, deleted: boolean): Promise<void>;
  createVersion(releveId: ReleveId, libelle: string | null): Promise<Version>;
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
  private readonly batiments = new Map<string, Mutable<Batiment>>();
  private readonly etages = new Map<string, Mutable<Etage>>();
  private readonly zones = new Map<string, Mutable<Zone>>();
  private readonly pieces = new Map<string, Mutable<Piece>>();
  private readonly versions = new Map<string, Version>();
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

  private requireReleve(releveId: string, allowDeleted = false): Mutable<Releve> {
    const releve = this.releves.get(releveId);
    if (!releve || (!allowDeleted && releve.deletedAt)) throw new ReleveNotFoundError("Relevé");
    return releve;
  }

  private table(kind: StructureKind): Map<string, Row> {
    return ({ batiment: this.batiments, etage: this.etages, zone: this.zones, piece: this.pieces } as Record<StructureKind, Map<string, Row>>)[kind];
  }

  async listReleves(tenantId: TenantId) {
    return [...this.releves.values()].filter((releve) => releve.entrepriseId === tenantId).map((releve) => ({ ...releve }));
  }

  async getStructure(releveId: ReleveId): Promise<ReleveStructure | null> {
    const releve = this.releves.get(releveId);
    if (!releve) return null;
    const of = <T extends { releveId: string }>(map: Map<string, T>) => [...map.values()].filter((row) => row.releveId === releveId).map((row) => ({ ...row }));
    return { releve: { ...releve }, batiments: of(this.batiments), etages: of(this.etages), zones: of(this.zones), pieces: of(this.pieces) };
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
    return { ...releve };
  }

  private checkParent(map: Map<string, Row>, id: string, releveId: string, label: string) {
    const parent = map.get(id);
    if (!parent || parent.releveId !== releveId || parent.deletedAt) throw new ReleveNotFoundError(label);
  }

  async createBatiment(input: NewBatiment): Promise<Batiment> {
    const releve = this.requireReleve(input.releveId);
    const row: Mutable<Batiment> = { ...this.meta(releve.entrepriseId), ...input };
    this.batiments.set(row.id, row); return { ...row };
  }

  async createEtage(input: NewEtage): Promise<Etage> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.batiments, input.batimentId, input.releveId, "Bâtiment");
    const row: Mutable<Etage> = { ...this.meta(releve.entrepriseId), ...input };
    this.etages.set(row.id, row); return { ...row };
  }

  async createZone(input: NewZone): Promise<Zone> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.etages, input.etageId, input.releveId, "Étage");
    const row: Mutable<Zone> = { ...this.meta(releve.entrepriseId), ...input };
    this.zones.set(row.id, row); return { ...row };
  }

  async createPiece(input: NewPiece): Promise<Piece> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.etages, input.etageId, input.releveId, "Étage");
    if (input.zoneId) {
      const zone = this.zones.get(input.zoneId);
      if (!zone || zone.releveId !== input.releveId || zone.etageId !== input.etageId || zone.deletedAt) throw new ReleveNotFoundError("Zone de cet étage");
    }
    const row: Mutable<Piece> = { ...this.meta(releve.entrepriseId), ...input };
    this.pieces.set(row.id, row); return { ...row };
  }

  async updateStructureNode(kind: StructureKind, id: string, patch: StructurePatch) {
    const row = this.table(kind).get(id) as (Row & { nom: string; ordre: number }) | undefined;
    if (!row || row.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    this.requireReleve(row.releveId!);
    if (patch.nom !== undefined) row.nom = patch.nom;
    if (patch.ordre !== undefined) row.ordre = patch.ordre;
    this.touch(row);
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
    apply(row);
    const descendants = descendantsOf(structure, { kind, id });
    // Même règle que le trigger SQL : la restauration ne ranime que les descendants
    // supprimés par CETTE cascade (même horodatage), jamais une suppression antérieure.
    const eligible = (target: Row | undefined): target is Row => Boolean(target) && (deleted ? !target!.deletedAt : target!.deletedAt === previous);
    for (const etageId of descendants.etages) { const target = this.etages.get(etageId); if (eligible(target)) apply(target); }
    for (const zoneId of descendants.zones) { const target = this.zones.get(zoneId); if (eligible(target)) apply(target); }
    for (const pieceId of descendants.pieces) { const target = this.pieces.get(pieceId); if (eligible(target)) apply(target); }
  }

  async createVersion(releveId: ReleveId, libelle: string | null): Promise<Version> {
    const releve = this.requireReleve(releveId);
    const numero = [...this.versions.values()].filter((version) => version.releveId === releveId).length + 1;
    const structure = await this.getStructure(releveId);
    const version: Version = {
      id: this.uuid() as VersionId, entrepriseId: releve.entrepriseId, releveId, numero, libelle, revisionSource: releve.revision,
      empreinte: fingerprint(JSON.stringify(structure)), createdAt: this.now(), createdBy: this.options.actorId,
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
