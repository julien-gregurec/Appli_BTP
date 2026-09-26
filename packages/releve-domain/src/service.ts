/**
 * Cas d'usage Relevé & Métré, indépendants de l'interface.
 *
 * Chaque opération : 1) valide la saisie, 2) vérifie la permission avec la même matrice que
 * le serveur, 3) délègue au dépôt. Un composant React, un écran mobile ou un futur module de
 * capture natif appellent ce service ; aucun d'eux ne réimplémente une règle métier.
 * Le serveur reste l'autorité finale (RLS) : la vérification locale évite seulement de
 * proposer ou de tenter une action vouée au refus.
 */

import { asBatimentId, asEtageId, asPieceId, asReleveId, asZoneId, newUuid, type ReleveId, type TenantId } from "./ids";
import { nextOrdre } from "./hierarchy";
import type { Releve, ReleveStructure, Version } from "./model";
import { canPerform, tenantDecision, RELEVE_DENIAL_MESSAGES, type ReleveAction, type ReleveActorContext, type ReleveDenialReason } from "./permissions";
import { ReleveNotFoundError, type ReleveRepository, type StructureKind } from "./repository";
import {
  unwrapValidation, validateBatimentDraft, validateEtageDraft, validatePieceDraft, validateReleveDraft, validateZoneDraft,
  RELEVE_LIMITS, ReleveValidationError,
  type BatimentDraft, type EtageDraft, type PieceDraft, type ReleveDraft, type ZoneDraft,
} from "./validation";

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

  async create(draft: ReleveDraft): Promise<Releve> {
    this.require("create");
    const value = unwrapValidation(validateReleveDraft(draft));
    return this.repository.createReleve({ ...value, id: asReleveId(this.uuid()), entrepriseId: this.actor.tenantId });
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

  async addBatiment(releveId: ReleveId, draft: BatimentDraft) {
    const structure = await this.load(releveId, "edit");
    const value = unwrapValidation(validateBatimentDraft({ ordre: nextOrdre(structure.batiments), ...draft }));
    return this.repository.createBatiment({ ...value, id: asBatimentId(this.uuid()), releveId });
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
    await this.load(releveId, "edit");
    const trimmed = nom.trim();
    if (!trimmed || trimmed.length > RELEVE_LIMITS.structureNom) throw new ReleveValidationError([{ path: "nom", code: trimmed ? "out_of_range" : "required", message: trimmed ? `${RELEVE_LIMITS.structureNom} caractères maximum.` : "Champ obligatoire." }]);
    await this.repository.updateStructureNode(kind, id, { nom: trimmed });
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

  async createVersion(releveId: ReleveId, libelle: string | null = null): Promise<Version> {
    await this.load(releveId, "edit");
    const value = libelle?.trim() || null;
    if (value && value.length > RELEVE_LIMITS.libelle) throw new ReleveValidationError([{ path: "libelle", code: "out_of_range", message: `${RELEVE_LIMITS.libelle} caractères maximum.` }]);
    return this.repository.createVersion(releveId, value);
  }

  async listVersions(releveId: ReleveId): Promise<Version[]> {
    await this.load(releveId, "view");
    return this.repository.listVersions(releveId);
  }
}

function draftOf(releve: Releve): ReleveDraft {
  return {
    nom: releve.nom, reference: releve.reference, statut: releve.statut, visibilite: releve.visibilite,
    chantierNom: releve.chantier.nom, chantierAdresse: releve.chantier.adresse, chantierCodePostal: releve.chantier.codePostal,
    chantierVille: releve.chantier.ville, chantierGpId: releve.chantier.gpChantierId, clientNom: releve.client.nom,
    clientGpId: releve.client.gpClientId, dateReleve: releve.dateReleve, notes: releve.notes,
  };
}
