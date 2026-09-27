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
import { compareEtages, descendantsOf } from "./hierarchy";
import {
  RELEVE_SCHEMA_VERSION, type Batiment, type Chantier, type EntityMeta, type Etage, type Piece, type Releve, type ReleveStructure,
  type Version, type VersionType, type Zone,
} from "./model";
import type { NodeKind, NormalizedChantierDraft, NormalizedPieceDraft, NormalizedReleveDraft } from "./validation";
import { planVersion } from "./versioning";

export type StructureKind = "chantier" | "batiment" | "etage" | "zone" | "piece";

export type NewReleve = NormalizedReleveDraft & { id: ReleveId; entrepriseId: TenantId };
export type NewChantier = NormalizedChantierDraft & { id: ChantierId; releveId: ReleveId };
export type NewBatiment = { id: BatimentId; releveId: ReleveId; chantierId: ChantierId; nom: string; ordre: number; notes: string | null };
export type NewEtage = { id: EtageId; releveId: ReleveId; batimentId: BatimentId; nom: string; niveau: number | null; categorieNiveau: NonNullable<Etage["categorieNiveau"]>; altitudeMm: number | null; hauteurSousPlafondMm: number | null; etat: Etage["etat"]; ordre: number };
export type NewZone = { id: ZoneId; releveId: ReleveId; etageId: EtageId; nom: string; type: Zone["type"]; ordre: number; commentaire?: string | null };
export type NewPiece = Omit<NormalizedPieceDraft, "zoneId"> & { id: PieceId; releveId: ReleveId; etageId: EtageId; zoneId: ZoneId | null };

/** Lot 3 : recherche simple (miroir de `tools_releve_rechercher`). */
export const SEARCH_FILTERS = ["actif", "archive", "recent", "tous"] as const;
export type SearchFilter = (typeof SEARCH_FILTERS)[number];
export type SearchResult = {
  readonly type: "releve" | "chantier" | "batiment" | "piece"; readonly id: string; readonly releveId: ReleveId;
  readonly libelle: string; readonly contexte: string; readonly releveNom: string; readonly releveStatut: Releve["statut"]; readonly updatedAt: string;
};

/** Lot 3 : journal d'audit (lecture). */
export const JOURNAL_ACTIONS = [
  "creation", "modification", "suppression", "restauration", "partage", "transfert", "version",
  "renommage", "deplacement", "reordre", "duplication",
] as const;
export type JournalAction = (typeof JOURNAL_ACTIONS)[number];
export type JournalEntry = {
  readonly id: string; readonly entite: "releve" | "chantier" | "batiment" | "etage" | "zone" | "piece" | "element" | "media" | "version";
  readonly entiteId: string; readonly action: JournalAction; readonly champs: readonly string[]; readonly auteurId: string | null; readonly createdAt: string;
};
export type DuplicableKind = "batiment" | "etage" | "piece";

export type RelevePatch = Partial<Omit<NormalizedReleveDraft, never>>;
export type StructurePatch = { nom?: string; ordre?: number };
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
  updateStructureNode(kind: StructureKind, id: string, patch: StructurePatch): Promise<void>;
  /** Suppression douce ; chantier, bâtiment et étage emportent leurs descendants (et les restaurent). */
  setStructureNodeDeleted(kind: StructureKind, id: string, deleted: boolean): Promise<void>;
  /** Version typée ; le serveur applique les mêmes règles que {@link planVersion}. */
  createVersion(releveId: ReleveId, input: NewVersion): Promise<Version>;
  listVersions(releveId: ReleveId): Promise<Version[]>;
  /**
   * Lot 3 — modification partielle d'un nœud avec contrôle optimiste : si la révision a changé
   * depuis la lecture (autre onglet, autre utilisateur), {@link ReleveConflictError}, rien n'est écrit.
   */
  updateNode(kind: NodeKind, id: string, patch: Record<string, unknown>, expectedRevision: number): Promise<number>;
  /** Lot 3 — `orderedIds` = tous les frères actifs dans l'ordre voulu (RPC `tools_releve_reordonner`). */
  reorder(kind: NodeKind, orderedIds: readonly string[]): Promise<void>;
  /** Lot 3 — copie de structure seule (RPC `tools_releve_dupliquer`) ; renvoie l'identifiant créé. */
  duplicate(kind: DuplicableKind, id: string, nom: string | null): Promise<string>;
  search(tenantId: TenantId, texte: string, filtre: SearchFilter): Promise<SearchResult[]>;
  listJournal(releveId: ReleveId, limit?: number): Promise<JournalEntry[]>;
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
  private readonly journal: Array<JournalEntry & { releveId: string }> = [];
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

  private log(releveId: string, entite: JournalEntry["entite"], entiteId: string, action: JournalAction, champs: string[] = []) {
    this.journal.push({ id: String(this.journal.length + 1), releveId, entite, entiteId, action, champs, auteurId: this.options.actorId, createdAt: this.now() });
  }

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
    this.log(releve.id, "releve", releve.id, "creation");
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

  async createChantier(input: NewChantier): Promise<Chantier> {
    const releve = this.requireReleve(input.releveId);
    const row: Mutable<Chantier> = { ...this.meta(releve.entrepriseId), ...input, id: input.id };
    this.chantiers.set(row.id, row); this.log(row.releveId, "chantier", row.id, "creation"); return { ...row };
  }

  async createBatiment(input: NewBatiment): Promise<Batiment> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.chantiers, input.chantierId, input.releveId, "Chantier");
    const row: Mutable<Batiment> = { ...this.meta(releve.entrepriseId), ...input };
    this.batiments.set(row.id, row); this.log(row.releveId, "batiment", row.id, "creation"); return { ...row };
  }

  async createEtage(input: NewEtage): Promise<Etage> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.batiments, input.batimentId, input.releveId, "Bâtiment");
    const row: Mutable<Etage> = { ...this.meta(releve.entrepriseId), ...input };
    this.etages.set(row.id, row); this.log(row.releveId, "etage", row.id, "creation"); return { ...row };
  }

  async createZone(input: NewZone): Promise<Zone> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.etages, input.etageId, input.releveId, "Étage");
    const row: Mutable<Zone> = { ...this.meta(releve.entrepriseId), ...input };
    this.zones.set(row.id, row); this.log(row.releveId, "zone", row.id, "creation"); return { ...row };
  }

  async createPiece(input: NewPiece): Promise<Piece> {
    const releve = this.requireReleve(input.releveId);
    this.checkParent(this.etages, input.etageId, input.releveId, "Étage");
    if (input.zoneId) {
      const zone = this.zones.get(input.zoneId);
      if (!zone || zone.releveId !== input.releveId || zone.etageId !== input.etageId || zone.deletedAt) throw new ReleveNotFoundError("Zone de cet étage");
    }
    const row: Mutable<Piece> = { ...this.meta(releve.entrepriseId), ...input };
    this.pieces.set(row.id, row); this.log(row.releveId, "piece", row.id, "creation"); return { ...row };
  }

  async updateStructureNode(kind: StructureKind, id: string, patch: StructurePatch) {
    const row = this.table(kind).get(id) as (Row & { nom: string; ordre: number }) | undefined;
    if (!row || row.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    this.requireReleve(row.releveId!);
    if (patch.nom !== undefined) row.nom = patch.nom;
    if (patch.ordre !== undefined) row.ordre = patch.ordre;
    this.touch(row);
    this.log(row.releveId!, kind, id, patch.ordre !== undefined && patch.nom === undefined ? "reordre" : patch.nom !== undefined && patch.ordre === undefined ? "renommage" : "modification");
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
    this.log(row.releveId!, kind, id, deleted ? "suppression" : "restauration");
    const descendants = descendantsOf(structure, { kind, id });
    // Même règle que le trigger SQL : la restauration ne ranime que les descendants
    // supprimés par CETTE cascade (même horodatage), jamais une suppression antérieure.
    const eligible = (target: Row | undefined): target is Row => Boolean(target) && (deleted ? !target!.deletedAt : target!.deletedAt === previous);
    for (const batimentId of descendants.batiments) { const target = this.batiments.get(batimentId); if (eligible(target)) apply(target); }
    for (const etageId of descendants.etages) { const target = this.etages.get(etageId); if (eligible(target)) apply(target); }
    for (const zoneId of descendants.zones) { const target = this.zones.get(zoneId); if (eligible(target)) apply(target); }
    for (const pieceId of descendants.pieces) { const target = this.pieces.get(pieceId); if (eligible(target)) apply(target); }
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

  // ── Lot 3 ─────────────────────────────────────────────────────────────────

  async updateNode(kind: NodeKind, id: string, patch: Record<string, unknown>, expectedRevision: number): Promise<number> {
    const row = this.table(kind).get(id) as (Row & Record<string, unknown>) | undefined;
    if (!row || row.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    this.requireReleve(row.releveId!);
    if (row.revision !== expectedRevision) throw new ReleveConflictError(row.revision);
    if (kind === "piece" && patch.zoneId !== undefined && patch.zoneId !== null) {
      const zone = this.zones.get(patch.zoneId as string);
      if (!zone || zone.deletedAt || zone.etageId !== row.etageId) throw new ReleveNotFoundError("Zone de cet étage");
    }
    const champs = Object.keys(patch).filter((key) => row[key] !== patch[key]);
    if (!champs.length) return row.revision;
    Object.assign(row, patch);
    this.touch(row);
    this.log(row.releveId!, kind, id, champs.includes("zoneId") ? "deplacement" : champs.length === 1 && champs[0] === "nom" ? "renommage" : "modification", champs);
    return row.revision;
  }

  async reorder(kind: NodeKind, orderedIds: readonly string[]): Promise<void> {
    const table = this.table(kind);
    const rows = orderedIds.map((id) => table.get(id) as (Row & Record<string, unknown>) | undefined);
    if (!orderedIds.length || new Set(orderedIds).size !== orderedIds.length || rows.some((row) => !row || row.deletedAt)) throw new Error("Liste vide, dupliquée ou avec des éléments supprimés.");
    const parentKey = ({ chantier: "releveId", batiment: "chantierId", etage: "batimentId", zone: "etageId", piece: "etageId" } as const)[kind];
    const first = rows[0]!;
    const same = (row: Row & Record<string, unknown>) => row[parentKey] === first[parentKey] && (kind !== "piece" || (row.zoneId ?? null) === (first.zoneId ?? null));
    if (!rows.every((row) => same(row!))) throw new Error("Éléments de parents différents.");
    const siblings = [...table.values()].filter((row) => !row.deletedAt && same(row as Row & Record<string, unknown>));
    if (siblings.length !== orderedIds.length) throw new Error("La liste doit contenir tous les éléments du même niveau.");
    rows.forEach((row, index) => {
      if ((row as unknown as { ordre: number }).ordre === index) return;
      (row as unknown as { ordre: number }).ordre = index; this.touch(row!); this.log(row!.releveId!, kind, row!.id, "reordre", ["ordre"]);
    });
  }

  async duplicate(kind: DuplicableKind, id: string, nom: string | null): Promise<string> {
    const label = (source: string) => (nom?.trim() || `${source} (copie)`).slice(0, 120);
    const nextOrdre = (rows: Iterable<{ ordre: number; deletedAt: string | null }>) => [...rows].filter((row) => !row.deletedAt).reduce((max, row) => Math.max(max, row.ordre + 1), 0);
    const copyEtage = (source: Etage, batimentId: BatimentId, override: Partial<Etage>) => {
      const etage: Mutable<Etage> = { ...this.meta(source.entrepriseId), ...source, ...override, id: this.uuid() as EtageId, batimentId };
      this.etages.set(etage.id, etage); this.log(etage.releveId, "etage", etage.id, "creation");
      const map = new Map<string, ZoneId>();
      for (const zone of [...this.zones.values()].filter((row) => row.etageId === source.id && !row.deletedAt)) {
        const copy: Mutable<Zone> = { ...this.meta(zone.entrepriseId), ...zone, id: this.uuid() as ZoneId, etageId: etage.id, commentaire: null };
        this.zones.set(copy.id, copy); map.set(zone.id, copy.id); this.log(copy.releveId, "zone", copy.id, "creation");
      }
      for (const piece of [...this.pieces.values()].filter((row) => row.etageId === source.id && !row.deletedAt)) {
        const copy: Mutable<Piece> = { ...this.meta(piece.entrepriseId), ...piece, id: this.uuid() as PieceId, etageId: etage.id, zoneId: piece.zoneId ? map.get(piece.zoneId) ?? null : null, commentaire: null, statut: "a_relever", surfaceDeclareeMm2: null };
        this.pieces.set(copy.id, copy); this.log(copy.releveId, "piece", copy.id, "creation");
      }
      return etage;
    };
    let created: { id: string; releveId: string };
    if (kind === "batiment") {
      const source = this.batiments.get(id);
      if (!source || source.deletedAt) throw new ReleveNotFoundError("Bâtiment");
      const batiment: Mutable<Batiment> = { ...this.meta(source.entrepriseId), ...source, id: this.uuid() as BatimentId, nom: label(source.nom), notes: null, ordre: nextOrdre([...this.batiments.values()].filter((row) => row.chantierId === source.chantierId)) };
      this.batiments.set(batiment.id, batiment); this.log(batiment.releveId, "batiment", batiment.id, "creation");
      for (const etage of [...this.etages.values()].filter((row) => row.batimentId === source.id && !row.deletedAt).sort(compareEtages)) copyEtage(etage, batiment.id, { altitudeMm: etage.altitudeMm });
      created = batiment;
    } else if (kind === "etage") {
      const source = this.etages.get(id);
      if (!source || source.deletedAt) throw new ReleveNotFoundError("Étage");
      const freres = [...this.etages.values()].filter((row) => row.batimentId === source.batimentId && !row.deletedAt);
      const numerotes = freres.map((row) => row.niveau).filter((value): value is number => value !== null);
      const niveau = (source.categorieNiveau ?? "etage") === "etage" && source.niveau !== null ? Math.min(200, Math.max(...numerotes) + 1) : source.niveau;
      created = copyEtage(source, source.batimentId, { nom: label(source.nom), niveau, altitudeMm: null, ordre: nextOrdre(freres) });
    } else {
      const source = this.pieces.get(id);
      if (!source || source.deletedAt) throw new ReleveNotFoundError("Pièce");
      const zone = source.zoneId ? this.zones.get(source.zoneId) : undefined;
      const piece: Mutable<Piece> = { ...this.meta(source.entrepriseId), ...source, id: this.uuid() as PieceId, nom: label(source.nom), zoneId: zone && !zone.deletedAt ? zone.id : null, commentaire: null, statut: "a_relever", surfaceDeclareeMm2: null, ordre: nextOrdre([...this.pieces.values()].filter((row) => row.etageId === source.etageId)) };
      this.pieces.set(piece.id, piece); this.log(piece.releveId, "piece", piece.id, "creation");
      created = piece;
    }
    this.log(created.releveId, kind, created.id, "duplication", [`source:${id}`]);
    return created.id;
  }

  async search(tenantId: TenantId, texte: string, filtre: SearchFilter): Promise<SearchResult[]> {
    const motif = texte.trim().toLowerCase();
    const recent = Date.parse(this.now()) - 30 * 86_400_000;
    const releves = [...this.releves.values()].filter((releve) => releve.entrepriseId === tenantId && !releve.deletedAt && (
      filtre === "archive" ? releve.statut === "archive" : filtre === "recent" ? Date.parse(releve.updatedAt) > recent : filtre === "tous" ? true : releve.statut !== "archive"));
    const results: SearchResult[] = [];
    const match = (...values: Array<string | null | undefined>) => values.filter(Boolean).join(" ").toLowerCase().includes(motif);
    for (const releve of releves) {
      const base = { releveId: releve.id, releveNom: releve.nom, releveStatut: releve.statut };
      if (match(releve.nom, releve.reference, releve.chantier.nom, releve.chantier.ville, releve.client.nom)) results.push({ ...base, type: "releve", id: releve.id, libelle: releve.nom, contexte: [releve.reference, releve.chantier.nom, releve.chantier.ville, releve.client.nom].filter(Boolean).join(" · "), updatedAt: releve.updatedAt });
      if (!motif) continue;
      for (const chantier of this.chantiers.values()) if (chantier.releveId === releve.id && !chantier.deletedAt && match(chantier.nom, chantier.reference, chantier.ville, chantier.clientNom, chantier.adresse)) results.push({ ...base, type: "chantier", id: chantier.id, libelle: chantier.nom, contexte: [chantier.reference, chantier.ville, chantier.clientNom].filter(Boolean).join(" · "), updatedAt: chantier.updatedAt });
      for (const batiment of this.batiments.values()) if (batiment.releveId === releve.id && !batiment.deletedAt && match(batiment.nom)) results.push({ ...base, type: "batiment", id: batiment.id, libelle: batiment.nom, contexte: releve.nom, updatedAt: batiment.updatedAt });
      for (const piece of this.pieces.values()) if (piece.releveId === releve.id && !piece.deletedAt && match(piece.nom)) results.push({ ...base, type: "piece", id: piece.id, libelle: piece.nom, contexte: [releve.nom, this.etages.get(piece.etageId)?.nom].filter(Boolean).join(" · "), updatedAt: piece.updatedAt });
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listJournal(releveId: ReleveId, limit = 100): Promise<JournalEntry[]> {
    return this.journal.filter((entry) => entry.releveId === releveId).reverse().slice(0, limit).map(({ releveId: _releveId, ...entry }) => entry);
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
