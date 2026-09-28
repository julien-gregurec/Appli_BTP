/**
 * Dépôt de plans en mémoire : mêmes règles que les RPC de la migration 20260927000901
 * (création, enregistrement par lot avec révision attendue, gel immuable, dérivation). Sert aux
 * tests du domaine et de l'éditeur, sans base.
 */

import type { EtageId, ReleveId, TenantId, UserId, VersionId } from "./ids";
import {
  DEFAULT_PLAN_CADRE, freezeCreatesVersion, isPlanEditable, murFromElement, ouvertureFromElement, planCreationRule,
  validatePlanContour, validatePlanMur, validatePlanOuverture,
  type LoadedPlan, type Plan, type PlanContour, type PlanEtat, type PlanMur, type PlanOperations, type PlanOuverture, type PlanSaveResult,
  type RelevePlanRepository,
} from "./plan";
import { ReleveConflictError } from "./repository";
import { equipementAnomalie, equipementFromElement, EQUIPMENT_ISSUE_MESSAGES, type PlanEquipement } from "./equipement";
import type { DeletedPlanEquipement } from "./plan";
import type { VersionType } from "./model";

export class PlanRuleError extends Error {
  constructor(message: string, public readonly code: "forbidden" | "invalid" | "conflict_state") { super(message); this.name = "PlanRuleError"; }
}

type StoredMur = PlanMur & { deleted: boolean };
type StoredOuverture = PlanOuverture & { deleted: boolean };
type StoredEquipement = PlanEquipement & { deleted: boolean; deletedAt: string | null };
function storedToObjet(stored: StoredEquipement & { planId: string }): PlanEquipement {
  const objet: Partial<StoredEquipement & { planId: string }> = { ...stored };
  delete objet.deleted; delete objet.deletedAt; delete objet.planId;
  return objet as PlanEquipement;
}

/** Aire (mm²) d'un contour — seule arithmétique locale, pour que le double reste autonome. */
function shoelace(points: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i]; const b = points[(i + 1) % points.length]; sum += a.x * b.y - b.x * a.y; }
  return Math.round((Math.abs(sum) / 2) * 10) / 10;
}

export class InMemoryPlanRepository implements RelevePlanRepository {
  plans = new Map<string, Plan>();
  murs = new Map<string, StoredMur & { planId: string }>();
  ouvertures = new Map<string, StoredOuverture & { planId: string }>();
  equipements = new Map<string, StoredEquipement & { planId: string }>();
  versions: { id: string; typeVersion: VersionType }[] = [];
  /** Pièces actives par étage (contrôle des contours). */
  piecesParEtage = new Map<string, Set<string>>();
  private sequence = 0;

  constructor(
    private readonly context: { entrepriseId: string; releveId: string; actorId: string },
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly uuid: () => string = () => globalThis.crypto.randomUUID(),
  ) {}

  async listPlans(etageId: string): Promise<Plan[]> {
    return [...this.plans.values()].filter((plan) => plan.etageId === etageId).sort((a, b) => a.numero - b.numero);
  }

  async loadPlan(planId: string): Promise<LoadedPlan> {
    const plan = this.plans.get(planId);
    if (!plan) throw new PlanRuleError("Plan introuvable.", "forbidden");
    const strip = <T extends { deleted: boolean; planId: string }>(value: T): Omit<T, "deleted" | "planId"> => {
      const rest: Partial<T> = { ...value };
      delete rest.deleted; delete rest.planId;
      return rest as Omit<T, "deleted" | "planId">;
    };
    return {
      plan,
      document: {
        murs: [...this.murs.values()].filter((mur) => mur.planId === planId && !mur.deleted).map(strip).map((mur) => murFromElement({ id: mur.id as never, pieceId: mur.pieceId as never, donnees: { ...mur } as never })),
        ouvertures: [...this.ouvertures.values()].filter((o) => o.planId === planId && !o.deleted).map(strip).map((o) => ouvertureFromElement({ id: o.id as never, parentElementId: o.murId as never, donnees: { ...o } as never })),
        equipements: [...this.equipements.values()].filter((e) => e.planId === planId && !e.deleted).map(storedToObjet),
        contours: plan.contours, cadre: plan.cadre, reglages: plan.reglages,
      },
    };
  }

  async createPlan(etageId: string, etat: PlanEtat, baseId: string | null = null, libelle: string | null = null): Promise<Plan> {
    const existing = await this.listPlans(etageId);
    const rule = planCreationRule(existing, etat, baseId);
    if (!rule.ok) throw new PlanRuleError(rule.message, "invalid");
    const base = rule.baseId ? this.plans.get(rule.baseId)! : null;
    const stamp = this.now();
    const plan: Plan = {
      id: this.uuid(), entrepriseId: this.context.entrepriseId as TenantId, releveId: this.context.releveId as ReleveId, etageId: etageId as EtageId,
      etatDocumente: etat, numero: rule.numero, planBaseId: rule.baseId, libelle, cadre: base?.cadre ?? DEFAULT_PLAN_CADRE,
      reglages: base?.reglages ?? {}, contours: [], revision: 1, figeLe: null, figePar: null, versionId: null, empreinte: null,
      createdAt: stamp, updatedAt: stamp, deletedAt: null,
    };
    this.plans.set(plan.id, plan);
    if (base) {
      const map = new Map<string, string>();
      for (const mur of [...this.murs.values()].filter((m) => m.planId === base.id && !m.deleted)) {
        const id = this.uuid(); map.set(mur.id, id);
        this.murs.set(id, { ...mur, id, planId: plan.id, origineId: mur.id });
      }
      for (const o of [...this.ouvertures.values()].filter((x) => x.planId === base.id && !x.deleted && map.has(x.murId))) {
        const id = this.uuid();
        this.ouvertures.set(id, { ...o, id, murId: map.get(o.murId)!, planId: plan.id, origineId: o.id });
      }
      for (const e of [...this.equipements.values()].filter((x) => x.planId === base.id && !x.deleted)) {
        const id = this.uuid();
        const murId = e.murId ? map.get(e.murId) ?? null : null;
        this.equipements.set(id, { ...e, id, planId: plan.id, origineId: e.id, murId, face: murId ? e.face : null, decalageMm: murId ? e.decalageMm : null });
      }
      const contours: PlanContour[] = base.contours.map((contour) => ({ ...contour, murIds: contour.murIds.filter((id) => map.has(id)).map((id) => map.get(id)!) }));
      this.plans.set(plan.id, { ...plan, contours, revision: 2 });
    }
    return this.plans.get(plan.id)!;
  }

  async savePlan(planId: string, expectedRevision: number, operations: PlanOperations): Promise<PlanSaveResult> {
    const plan = this.plans.get(planId);
    if (!plan) throw new PlanRuleError("Plan introuvable ou non modifiable.", "forbidden");
    if (!isPlanEditable(plan)) throw new PlanRuleError("Plan figé : créez un plan corrigé, projeté ou tel que construit.", "forbidden");
    if (plan.revision !== expectedRevision) throw new ReleveConflictError(plan.revision);
    // Validation complète AVANT écriture : le lot est atomique.
    const nextMurs = new Map(this.murs);
    for (const item of operations.murs) {
      const existing = nextMurs.get(item.id);
      if (existing && existing.planId !== planId) throw new PlanRuleError("Élément étranger au plan.", "forbidden");
      const mur = murFromElement({ id: item.id as never, pieceId: item.pieceId as never, donnees: item.donnees as never });
      if (validatePlanMur(mur).length) throw new PlanRuleError(`Mur invalide : ${item.id}`, "invalid");
      nextMurs.set(item.id, { ...mur, planId, deleted: false });
    }
    const nextOuvertures = new Map(this.ouvertures);
    for (const item of operations.ouvertures) {
      const existing = nextOuvertures.get(item.id);
      if (existing && existing.planId !== planId) throw new PlanRuleError("Élément étranger au plan.", "forbidden");
      const host = nextMurs.get(item.murId);
      if (!host || host.planId !== planId || host.deleted) throw new PlanRuleError("Mur hôte absent du plan.", "forbidden");
      const ouverture = ouvertureFromElement({ id: item.id as never, parentElementId: item.murId as never, donnees: item.donnees as never });
      if (validatePlanOuverture(ouverture, host).length) throw new PlanRuleError(`Ouverture invalide : ${item.id}`, "invalid");
      nextOuvertures.set(item.id, { ...ouverture, planId, deleted: false });
    }
    const nextEquipements = new Map(this.equipements);
    for (const item of operations.equipements ?? []) {
      const existing = nextEquipements.get(item.id);
      if (existing && existing.planId !== planId) throw new PlanRuleError("Élément étranger au plan.", "forbidden");
      const objet = equipementFromElement({ id: item.id as never, pieceId: item.pieceId as never, donnees: item.donnees as never });
      const code = equipementAnomalie(objet);
      if (code) throw new PlanRuleError(EQUIPMENT_ISSUE_MESSAGES[code], "invalid");
      if (existing && !existing.deleted && existing.verrouille && objet.verrouille) throw new PlanRuleError(EQUIPMENT_ISSUE_MESSAGES.verrouille, "invalid");
      nextEquipements.set(item.id, { ...objet, planId, deleted: false, deletedAt: null });
    }
    for (const id of operations.supprimes) {
      const objet = nextEquipements.get(id);
      if (objet && objet.planId === planId && !objet.deleted) {
        if (objet.verrouille) throw new PlanRuleError(EQUIPMENT_ISSUE_MESSAGES.verrouille, "invalid");
        nextEquipements.set(id, { ...objet, deleted: true, deletedAt: this.now() });
      }
    }
    for (const objet of nextEquipements.values()) {
      if (objet.planId !== planId || objet.deleted || !objet.murId) continue;
      if (!(operations.equipements ?? []).some((item) => item.id === objet.id) && !operations.supprimes.includes(objet.murId)) continue;
      const mur = nextMurs.get(objet.murId);
      if (!mur || mur.planId !== planId || mur.deleted || operations.supprimes.includes(objet.murId)) throw new PlanRuleError(EQUIPMENT_ISSUE_MESSAGES.mur_absent, "invalid");
    }
    for (const id of operations.supprimes) {
      const mur = nextMurs.get(id);
      if (mur && mur.planId === planId) {
        nextMurs.set(id, { ...mur, deleted: true });
        for (const [oid, o] of nextOuvertures) if (o.murId === id && !o.deleted) nextOuvertures.set(oid, { ...o, deleted: true });
      }
      const ouverture = nextOuvertures.get(id);
      if (ouverture && ouverture.planId === planId) nextOuvertures.set(id, { ...ouverture, deleted: true });
    }
    let contours = plan.contours;
    if (operations.contours) {
      const pieces = this.piecesParEtage.get(plan.etageId);
      for (const contour of operations.contours) {
        if (validatePlanContour(contour).length) throw new PlanRuleError("Contours de pièces invalides.", "invalid");
        if (pieces && !pieces.has(contour.pieceId)) throw new PlanRuleError("Contour rattaché à une pièce absente de l'étage.", "forbidden");
      }
      contours = operations.contours.map((contour) => ({ ...contour, surfaceMm2: shoelace(contour.points) }));
    }
    this.murs = nextMurs; this.ouvertures = nextOuvertures; this.equipements = nextEquipements;
    const next: Plan = {
      ...plan, contours, cadre: operations.cadre ?? plan.cadre, reglages: operations.reglages ?? plan.reglages,
      revision: plan.revision + 1, updatedAt: this.now(),
    };
    this.plans.set(planId, next);
    return { revision: next.revision, contours: next.contours };
  }

  async listDeletedEquipements(planId: string): Promise<DeletedPlanEquipement[]> {
    return [...this.equipements.values()].filter((e) => e.planId === planId && e.deleted)
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""))
      .map((stored) => ({ objet: storedToObjet(stored), deletedAt: stored.deletedAt ?? "" }));
  }

  async freezePlan(planId: string, expectedRevision: number, libelle: string | null = null): Promise<Plan> {
    const plan = this.plans.get(planId);
    if (!plan || plan.deletedAt) throw new PlanRuleError("Plan introuvable ou non modifiable.", "forbidden");
    if (plan.figeLe) throw new PlanRuleError("Plan déjà figé.", "forbidden");
    if (plan.revision !== expectedRevision) throw new ReleveConflictError(plan.revision);
    let versionId: VersionId | null = null;
    if (freezeCreatesVersion(plan.etatDocumente, this.versions)) {
      versionId = `v-${++this.sequence}` as VersionId;
      this.versions.push({ id: versionId, typeVersion: plan.etatDocumente });
    }
    const next: Plan = {
      ...plan, figeLe: this.now(), figePar: this.context.actorId as UserId, versionId, empreinte: "0".repeat(64),
      libelle: libelle ?? plan.libelle, revision: plan.revision + 1,
    };
    this.plans.set(planId, next);
    return next;
  }
}
