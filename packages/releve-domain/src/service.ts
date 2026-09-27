/**
 * Cas d'usage Relevé & Métré, indépendants de l'interface.
 *
 * Chaque opération : 1) valide la saisie, 2) vérifie la permission avec la même matrice que
 * le serveur, 3) délègue au dépôt. Un composant React, un écran mobile ou un futur module de
 * capture natif appellent ce service ; aucun d'eux ne réimplémente une règle métier.
 * Le serveur reste l'autorité finale (RLS) : la vérification locale évite seulement de
 * proposer ou de tenter une action vouée au refus.
 */

import { asBatimentId, asChantierId, asEtageId, asPieceId, asReleveId, asZoneId, newUuid, type ReleveId, type TenantId } from "./ids";
import { nextOrdre } from "./hierarchy";
import type { Chantier, Releve, ReleveStructure, Version, VersionType } from "./model";
import { canPerform, tenantDecision, RELEVE_DENIAL_MESSAGES, type ReleveAction, type ReleveActorContext, type ReleveDenialReason } from "./permissions";
import { ReleveNotFoundError, type RelevePatch, type ReleveRepository, type StructureKind, type StructureNodeByKind } from "./repository";
import { DUPLICABLE_KINDS, isSearchable, moveInOrder, siblingsOf, type ActivityEntry, type DuplicableKind, type SearchHit } from "./terrain";
import {
  unwrapValidation, validateBatimentDraft, validateChantierDraft, validateEtageDraft, validateNodePatch, validatePieceDraft, validateReleveDraft, validateZoneDraft,
  RELEVE_LIMITS, ReleveValidationError, type NodePatchByKind,
  type BatimentDraft, type ChantierDraft, type EtageDraft, type PieceDraft, type ReleveDraft, type ZoneDraft,
} from "./validation";
import { planVersion } from "./versioning";

export class RelevePermissionError extends Error {
  constructor(public readonly action: ReleveAction, public readonly reason: ReleveDenialReason) {
    super(RELEVE_DENIAL_MESSAGES[reason]);
    this.name = "RelevePermissionError";
  }
}

export class ReleveService {
  constructor(
    private readonly repository: ReleveRepository,
    private readonly actor: ReleveActorContext,
    private readonly uuid: () => string = () => newUuid(),
  ) {}

  get tenantId(): TenantId { return this.actor.tenantId; }

  private require(action: ReleveAction, subject?: Releve) {
    const decision = canPerform(this.actor, action, subject);
    if (!decision.allowed) throw new RelevePermissionError(action, decision.reason);
  }

  private async load(releveId: ReleveId, action: ReleveAction): Promise<ReleveStructure> {
    const structure = await this.repository.getStructure(releveId);
    if (!structure || structure.releve.entrepriseId !== this.actor.tenantId) throw new ReleveNotFoundError("Relevé");
    this.require(action, structure.releve);
    return structure;
  }

  /** Relevés visibles, supprimés exclus, plus récents d'abord. */
  async list(): Promise<Releve[]> {
    const decision = tenantDecision(this.actor, "view");
    if (!decision.allowed) throw new RelevePermissionError("view", decision.reason);
    const releves = await this.repository.listReleves(this.actor.tenantId);
    return releves
      .filter((releve) => !releve.deletedAt && canPerform(this.actor, "view", releve).allowed)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Corbeille : relevés supprimés que l'acteur peut restaurer. */
  async listDeleted(): Promise<Releve[]> {
    const releves = await this.repository.listReleves(this.actor.tenantId);
    return releves.filter((releve) => releve.deletedAt && canPerform(this.actor, "delete", releve).allowed);
  }

  /**
   * Nouveau projet relevé. Son premier chantier est créé dans la foulée depuis le site
   * principal saisi : la hiérarchie Projet → Chantier → Bâtiment est complète dès l'origine.
   */
  async create(draft: ReleveDraft): Promise<Releve> {
    this.require("create");
    const value = unwrapValidation(validateReleveDraft(draft));
    const releve = await this.repository.createReleve({ ...value, id: asReleveId(this.uuid()), entrepriseId: this.actor.tenantId });
    await this.repository.createChantier(chantierFromSite(asChantierId(this.uuid()), releve.id, releve));
    return releve;
  }

  async get(releveId: ReleveId): Promise<ReleveStructure> { return this.load(releveId, "view"); }

  async rename(releveId: ReleveId, nom: string): Promise<Releve> {
    const { releve } = await this.load(releveId, "edit");
    const value = unwrapValidation(validateReleveDraft({ ...draftOf(releve), nom }));
    return this.repository.updateReleve(releveId, { nom: value.nom }, releve.revision);
  }

  /** Partage : `prive` ↔ `entreprise`. Action `share` (propriétaire ou administrateur). */
  async setVisibility(releveId: ReleveId, visibilite: Releve["visibilite"]): Promise<Releve> {
    const { releve } = await this.load(releveId, "share");
    return this.repository.updateReleve(releveId, { visibilite }, releve.revision);
  }

  async remove(releveId: ReleveId): Promise<Releve> {
    await this.load(releveId, "delete");
    return this.repository.setReleveDeleted(releveId, true);
  }

  async restore(releveId: ReleveId): Promise<Releve> {
    await this.load(releveId, "delete");
    return this.repository.setReleveDeleted(releveId, false);
  }

  async addChantier(releveId: ReleveId, draft: ChantierDraft): Promise<Chantier> {
    const structure = await this.load(releveId, "edit");
    const value = unwrapValidation(validateChantierDraft({ ordre: nextOrdre(structure.chantiers), ...draft }));
    return this.repository.createChantier({ ...value, id: asChantierId(this.uuid()), releveId });
  }

  /**
   * Bâtiment d'un chantier. Sans `chantierId` : chantier actif unique du projet, créé depuis
   * le site principal s'il n'en existe aucun (même règle que le trigger SQL
   * `tools_releve_batiment_chantier_defaut`) ; plusieurs chantiers → le chantier est exigé.
   */
  async addBatiment(releveId: ReleveId, draft: BatimentDraft & { chantierId?: string | null }) {
    const structure = await this.load(releveId, "edit");
    const { chantierId: requested, ...rest } = draft;
    const actifs = structure.chantiers.filter((item) => !item.deletedAt);
    let chantierId: string;
    if (requested) {
      if (!actifs.some((item) => item.id === requested)) throw new ReleveNotFoundError("Chantier");
      chantierId = requested;
    } else if (actifs.length === 1) {
      chantierId = actifs[0].id;
    } else if (actifs.length === 0) {
      chantierId = (await this.repository.createChantier(chantierFromSite(asChantierId(this.uuid()), releveId, structure.releve))).id;
    } else {
      throw new ReleveValidationError([{ path: "chantierId", code: "required", message: "Plusieurs chantiers : précisez le chantier du bâtiment." }]);
    }
    const siblings = structure.batiments.filter((item) => item.chantierId === chantierId);
    const value = unwrapValidation(validateBatimentDraft({ ordre: nextOrdre(siblings), ...rest }));
    return this.repository.createBatiment({ ...value, id: asBatimentId(this.uuid()), releveId, chantierId: asChantierId(chantierId) });
  }

  async addEtage(releveId: ReleveId, batimentId: string, draft: EtageDraft) {
    const structure = await this.load(releveId, "edit");
    if (!structure.batiments.some((item) => item.id === batimentId && !item.deletedAt)) throw new ReleveNotFoundError("Bâtiment");
    const siblings = structure.etages.filter((item) => item.batimentId === batimentId);
    const value = unwrapValidation(validateEtageDraft({ ordre: nextOrdre(siblings), ...draft }));
    return this.repository.createEtage({ ...value, id: asEtageId(this.uuid()), releveId, batimentId: asBatimentId(batimentId) });
  }

  async addZone(releveId: ReleveId, etageId: string, draft: ZoneDraft) {
    const structure = await this.load(releveId, "edit");
    if (!structure.etages.some((item) => item.id === etageId && !item.deletedAt)) throw new ReleveNotFoundError("Étage");
    const value = unwrapValidation(validateZoneDraft({ ordre: nextOrdre(structure.zones.filter((item) => item.etageId === etageId)), ...draft }));
    return this.repository.createZone({ ...value, id: asZoneId(this.uuid()), releveId, etageId: asEtageId(etageId) });
  }

  async addPiece(releveId: ReleveId, etageId: string, draft: PieceDraft) {
    const structure = await this.load(releveId, "edit");
    if (!structure.etages.some((item) => item.id === etageId && !item.deletedAt)) throw new ReleveNotFoundError("Étage");
    const value = unwrapValidation(validatePieceDraft({ ordre: nextOrdre(structure.pieces.filter((item) => item.etageId === etageId)), ...draft }));
    if (value.zoneId && !structure.zones.some((zone) => zone.id === value.zoneId && zone.etageId === etageId && !zone.deletedAt)) throw new ReleveNotFoundError("Zone de cet étage");
    return this.repository.createPiece({ ...value, id: asPieceId(this.uuid()), releveId, etageId: asEtageId(etageId), zoneId: value.zoneId ? asZoneId(value.zoneId) : null });
  }

  async renameNode(releveId: ReleveId, kind: StructureKind, id: string, nom: string) {
    return this.updateNode(releveId, kind, id, { nom } as NodePatchByKind[typeof kind]);
  }

  /**
   * Modification (sauvegarde automatique) d'un nœud. `expectedRevision` : la révision lue par
   * l'écran ; si la ligne a changé ailleurs entre-temps, `ReleveConflictError` et rien n'est
   * écrasé. Déplacements permis : bâtiment vers un autre chantier du relevé, pièce vers une
   * autre zone du même étage (ou hors zone).
   */
  async updateNode<K extends StructureKind>(releveId: ReleveId, kind: K, id: string, patch: NodePatchByKind[K], expectedRevision?: number): Promise<StructureNodeByKind[K]> {
    const structure = await this.load(releveId, "edit");
    const value = unwrapValidation(validateNodePatch(kind, patch));
    const node = nodeIn(structure, kind, id);
    if (!node || node.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    const moved = value as { chantierId?: string; zoneId?: string | null };
    if (kind === "batiment" && moved.chantierId && !structure.chantiers.some((item) => item.id === moved.chantierId && !item.deletedAt)) throw new ReleveNotFoundError("Chantier");
    if (kind === "piece" && moved.zoneId && !structure.zones.some((item) => item.id === moved.zoneId && item.etageId === (node as { etageId?: string }).etageId && !item.deletedAt)) throw new ReleveNotFoundError("Zone de cet étage");
    return this.repository.updateStructureNode(kind, id, value, expectedRevision);
  }

  /** Modification (sauvegarde automatique) de l'en-tête du relevé, avec contrôle de révision. */
  async updateReleve(releveId: ReleveId, patch: RelevePatch, expectedRevision: number): Promise<Releve> {
    const { releve } = await this.load(releveId, "edit");
    if (patch.visibilite !== undefined && patch.visibilite !== releve.visibilite) this.require("share", releve);
    const value = unwrapValidation(validateReleveDraft({ ...draftOf(releve), ...patch }));
    const normalized: RelevePatch = {};
    for (const key of Object.keys(patch) as Array<keyof RelevePatch>) (normalized as Record<string, unknown>)[key] = value[key];
    return this.repository.updateReleve(releveId, normalized, expectedRevision);
  }

  /**
   * Duplique un bâtiment, un étage, une zone ou une pièce avec sa sous-structure. Jamais les
   * éléments métier ni les médias : aucune photo, mesure ou annotation n'est recopiée.
   */
  async duplicateNode(releveId: ReleveId, kind: DuplicableKind, id: string, nom: string | null = null): Promise<string> {
    const structure = await this.load(releveId, "edit");
    if (!(DUPLICABLE_KINDS as readonly string[]).includes(kind)) throw new ReleveValidationError([{ path: "kind", code: "invalid_enum", message: "Niveau non duplicable." }]);
    const node = nodeIn(structure, kind, id);
    if (!node || node.deletedAt) throw new ReleveNotFoundError("Élément de structure");
    const trimmed = nom?.trim() || null;
    if (trimmed && trimmed.length > RELEVE_LIMITS.structureNom) throw new ReleveValidationError([{ path: "nom", code: "out_of_range", message: `${RELEVE_LIMITS.structureNom} caractères maximum.` }]);
    return this.repository.duplicateNode(kind, id, this.uuid(), trimmed);
  }

  /** Nouvel ordre complet d'une fratrie (identifiants inchangés, références intactes). */
  async reorder(releveId: ReleveId, kind: StructureKind, orderedIds: readonly string[]): Promise<number> {
    await this.load(releveId, "edit");
    return this.repository.reorderNodes(kind, orderedIds);
  }

  /** Monter (`delta` < 0) ou descendre (`delta` > 0) un nœud parmi ses frères. */
  async move(releveId: ReleveId, kind: StructureKind, id: string, delta: number): Promise<number> {
    const structure = await this.load(releveId, "edit");
    const ids = siblingsOf(structure, kind, id).map((item) => item.id);
    const next = moveInOrder(ids, id, delta);
    if (next.every((value, index) => value === ids[index])) return 0;
    return this.repository.reorderNodes(kind, next);
  }

  /** Recherche simple (relevé, chantier, bâtiment, étage, zone, pièce) sous la RLS. */
  async search(query: string): Promise<SearchHit[]> {
    const decision = tenantDecision(this.actor, "view");
    if (!decision.allowed) throw new RelevePermissionError("view", decision.reason);
    if (!isSearchable(query)) return [];
    return this.repository.search(this.actor.tenantId, query.trim());
  }

  async listActivity(releveId: ReleveId, limit = 50): Promise<ActivityEntry[]> {
    await this.load(releveId, "view");
    return this.repository.listActivity(releveId, Math.max(1, Math.min(limit, 200)));
  }

  /** Retirer un nœud de structure est une modification du relevé (`edit`), pas sa suppression. */
  async removeNode(releveId: ReleveId, kind: StructureKind, id: string) {
    await this.load(releveId, "edit");
    await this.repository.setStructureNodeDeleted(kind, id, true);
  }

  async restoreNode(releveId: ReleveId, kind: StructureKind, id: string) {
    await this.load(releveId, "edit");
    await this.repository.setStructureNodeDeleted(kind, id, false);
  }

  /**
   * Fige une version typée (initiale, corrigée, projetée, tel que construit). Sans type :
   * `initial` pour la première, `corrige` ensuite. La base par défaut est la dernière version.
   */
  async createVersion(releveId: ReleveId, libelle: string | null = null, options: { type?: VersionType; baseId?: string | null } = {}): Promise<Version> {
    await this.load(releveId, "edit");
    const value = libelle?.trim() || null;
    if (value && value.length > RELEVE_LIMITS.libelle) throw new ReleveValidationError([{ path: "libelle", code: "out_of_range", message: `${RELEVE_LIMITS.libelle} caractères maximum.` }]);
    const planned = planVersion(await this.repository.listVersions(releveId), options);
    if (!planned.ok) throw new ReleveValidationError([{ path: "typeVersion", code: "invariant_violated", message: planned.message }]);
    return this.repository.createVersion(releveId, { libelle: value, type: planned.plan.type, baseId: planned.plan.baseId });
  }

  async listVersions(releveId: ReleveId): Promise<Version[]> {
    await this.load(releveId, "view");
    return this.repository.listVersions(releveId);
  }
}

function nodeIn(structure: ReleveStructure, kind: StructureKind, id: string): { id: string; deletedAt: string | null } | undefined {
  const lists = { chantier: structure.chantiers, batiment: structure.batiments, etage: structure.etages, zone: structure.zones, piece: structure.pieces };
  return (lists[kind] as readonly { id: string; deletedAt: string | null }[]).find((item) => item.id === id);
}

/** Premier chantier d'un projet, amorcé depuis le site principal et l'identité du relevé. */
function chantierFromSite(id: ReturnType<typeof asChantierId>, releveId: ReleveId, releve: Pick<Releve, "chantier" | "client" | "reference" | "dateReleve">) {
  const site = releve.chantier;
  return {
    id, releveId, nom: site.nom, adresse: site.adresse, codePostal: site.codePostal, ville: site.ville, gpChantierId: site.gpChantierId,
    ordre: 0, notes: null, clientNom: releve.client.nom, clientGpId: releve.client.gpClientId, reference: releve.reference,
    description: null, dateReleve: releve.dateReleve, statut: "en_cours" as const,
  };
}

function draftOf(releve: Releve): ReleveDraft {
  return {
    nom: releve.nom, reference: releve.reference, statut: releve.statut, visibilite: releve.visibilite,
    chantierNom: releve.chantier.nom, chantierAdresse: releve.chantier.adresse, chantierCodePostal: releve.chantier.codePostal,
    chantierVille: releve.chantier.ville, chantierGpId: releve.chantier.gpChantierId, clientNom: releve.client.nom,
    clientGpId: releve.client.gpClientId, dateReleve: releve.dateReleve, notes: releve.notes,
  };
}
