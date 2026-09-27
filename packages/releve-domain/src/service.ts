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
import { moveInList, nextOrdre, siblingsOf } from "./hierarchy";
import type { ChantierId } from "./ids";
import type { Chantier, Releve, ReleveStructure, Version, VersionType } from "./model";
import { canPerform, tenantDecision, RELEVE_DENIAL_MESSAGES, type ReleveAction, type ReleveActorContext, type ReleveDenialReason } from "./permissions";
import {
  ReleveNotFoundError, type DuplicableKind, type JournalEntry, type NewChantier, type ReleveRepository, type SearchFilter, type SearchResult, type StructureKind,
} from "./repository";
import {
  unwrapValidation, validateNodePatch, validateBatimentDraft, validateChantierDraft, validateEtageDraft, validatePieceDraft, validateReleveDraft, validateZoneDraft,
  RELEVE_LIMITS, ReleveValidationError,
  type BatimentDraft, type ChantierDraft, type NodeKind, type EtageDraft, type PieceDraft, type ReleveDraft, type ZoneDraft,
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
    await this.repository.createChantier(chantierFromSite(releve, asChantierId(this.uuid())));
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
      chantierId = (await this.repository.createChantier(chantierFromSite(structure.releve, asChantierId(this.uuid())))).id;
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
  // ── Lot 3 : relevé métier terrain ────────────────────────────────────────────

  private node(structure: ReleveStructure, kind: NodeKind, id: string) {
    const rows = { chantier: structure.chantiers, batiment: structure.batiments, etage: structure.etages, zone: structure.zones, piece: structure.pieces }[kind] as ReadonlyArray<{ id: string; deletedAt: string | null; revision: number }>;
    const row = rows.find((item) => item.id === id && !item.deletedAt);
    if (!row) throw new ReleveNotFoundError("Élément de structure");
    return row;
  }

  /**
   * Modification partielle (autosave) d'un chantier, bâtiment, étage, zone ou pièce, avec
   * contrôle optimiste : `expectedRevision` est la révision lue ; si un autre onglet ou un
   * autre utilisateur a écrit entre-temps, `ReleveConflictError` et RIEN n'est écrasé.
   * Renvoie la nouvelle révision.
   */
  async updateNode(releveId: ReleveId, kind: NodeKind, id: string, patch: Record<string, unknown>, expectedRevision: number): Promise<number> {
    const structure = await this.load(releveId, "edit");
    this.node(structure, kind, id);
    const value = unwrapValidation(validateNodePatch(kind, patch));
    if (kind === "piece" && value.zoneId) {
      const piece = structure.pieces.find((item) => item.id === id)!;
      if (!structure.zones.some((zone) => zone.id === value.zoneId && zone.etageId === piece.etageId && !zone.deletedAt)) throw new ReleveNotFoundError("Zone de cet étage");
    }
    return this.repository.updateNode(kind, id, value, expectedRevision);
  }

  /** Monte / descend un nœud parmi ses frères (même parent ; pièces : même zone). */
  async move(releveId: ReleveId, kind: NodeKind, id: string, delta: -1 | 1): Promise<boolean> {
    const structure = await this.load(releveId, "edit");
    this.node(structure, kind, id);
    const next = moveInList(siblingsOf(structure, kind, id), id, delta);
    if (!next) return false;
    await this.repository.reorder(kind, next);
    return true;
  }

  /** Réordonne tous les frères d'un coup (glisser-déposer). */
  async reorder(releveId: ReleveId, kind: NodeKind, orderedIds: readonly string[]): Promise<void> {
    const structure = await this.load(releveId, "edit");
    const expected = siblingsOf(structure, kind, orderedIds[0] ?? "");
    if (orderedIds.length !== expected.length || !orderedIds.every((id) => expected.includes(id))) {
      throw new ReleveValidationError([{ path: "ordre", code: "invariant_violated", message: "La liste doit contenir tous les éléments du même niveau." }]);
    }
    await this.repository.reorder(kind, orderedIds);
  }

  /** Duplique la STRUCTURE d'un bâtiment, d'un étage ou d'une pièce (jamais photos ni mesures). */
  async duplicate(releveId: ReleveId, kind: DuplicableKind, id: string, nom: string | null = null): Promise<string> {
    const structure = await this.load(releveId, "edit");
    this.node(structure, kind, id);
    const value = nom?.trim() || null;
    if (value && value.length > RELEVE_LIMITS.structureNom) throw new ReleveValidationError([{ path: "nom", code: "out_of_range", message: `${RELEVE_LIMITS.structureNom} caractères maximum.` }]);
    return this.repository.duplicate(kind, id, value);
  }

  /** Recherche dans les relevés visibles : relevé, chantier, bâtiment, pièce ; filtres actif / archivé / récent. */
  async search(texte: string, filtre: SearchFilter = "actif"): Promise<SearchResult[]> {
    const decision = tenantDecision(this.actor, "view");
    if (!decision.allowed) throw new RelevePermissionError("view", decision.reason);
    return this.repository.search(this.actor.tenantId, texte.slice(0, 120), filtre);
  }

  async journal(releveId: ReleveId, limit = 100): Promise<JournalEntry[]> {
    await this.load(releveId, "view");
    return this.repository.listJournal(releveId, limit);
  }

  /** Fige la version INITIALE si elle n'existe pas encore (idempotent). */
  async ensureInitialVersion(releveId: ReleveId, libelle: string | null = "Relevé initial"): Promise<Version> {
    const versions = await this.listVersions(releveId);
    const initiale = versions.find((version) => version.typeVersion === "initial");
    return initiale ?? this.createVersion(releveId, libelle, { type: "initial" });
  }

}

/** Premier chantier d'un projet : recopie du site principal (client, référence, date compris). */
function chantierFromSite(releve: Releve, id: ChantierId): NewChantier {
  const site = releve.chantier;
  return {
    id, releveId: releve.id, nom: site.nom, adresse: site.adresse, codePostal: site.codePostal, ville: site.ville, gpChantierId: site.gpChantierId,
    ordre: 0, notes: null, clientNom: releve.client.nom, clientGpId: releve.client.gpClientId, reference: releve.reference, description: null,
    dateReleve: releve.dateReleve, statut: "en_cours",
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
