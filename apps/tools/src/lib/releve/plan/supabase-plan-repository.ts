/**
 * Adaptateur Supabase du port `RelevePlanRepository` (Lot 5).
 *
 * Lecture : PostgREST sous RLS (`tools_releves_plans` et `tools_releves_elements`, lecture seule
 * pour les plans). Écriture : UNIQUEMENT les RPC de la migration 901 (création, enregistrement
 * par lot avec révision attendue, gel) — la table des plans n'accorde aucun droit d'écriture
 * direct aux utilisateurs.
 */
import {
  ReleveConflictError, murFromElement, ouvertureFromElement,
  type LoadedPlan, type Plan, type PlanContour, type PlanEtat, type PlanOperations, type PlanSaveResult, type ReleveElement, type RelevePlanRepository,
} from "@elsatia/releve-domain";
import { ReleveRemoteError, type ReleveSupabaseClient } from "../supabase-repository";

export type PlanRow = {
  id: string; entreprise_id: string; releve_id: string; etage_id: string; etat_documente: PlanEtat; numero: number;
  plan_base_id: string | null; libelle: string | null; cadre: Plan["cadre"]; reglages: Plan["reglages"] | null;
  contours: PlanContour[] | null; revision: number | string; fige_le: string | null; fige_par: string | null;
  version_id: string | null; empreinte: string | null; created_at: string; updated_at: string; deleted_at: string | null;
};

type ElementRow = { id: string; type: "mur" | "ouverture"; piece_id: string | null; parent_element_id: string | null; donnees: Record<string, unknown> };

export function planFromRow(row: PlanRow): Plan {
  return {
    id: row.id, entrepriseId: row.entreprise_id as Plan["entrepriseId"], releveId: row.releve_id as Plan["releveId"], etageId: row.etage_id as Plan["etageId"],
    etatDocumente: row.etat_documente, numero: Number(row.numero), planBaseId: row.plan_base_id, libelle: row.libelle,
    cadre: row.cadre, reglages: row.reglages ?? {}, contours: (row.contours ?? []).map((contour) => ({ ...contour, murIds: contour.murIds ?? [], graine: contour.graine ?? null })),
    revision: Number(row.revision), figeLe: row.fige_le, figePar: row.fige_par as Plan["figePar"], versionId: row.version_id as Plan["versionId"],
    empreinte: row.empreinte, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
  };
}

type RemoteError = { code?: string; message?: string; details?: string | null };

/** Erreur serveur → erreur du domaine : conflit (PT409 = HTTP 409, révision courante en détail), refus, validation. */
function fail(action: string, error: RemoteError): never {
  if (error.code === "PT409") throw new ReleveConflictError(Number(error.details ?? 0) || 0);
  if (error.code === "42501") throw new ReleveRemoteError(`${action} : ${error.message ?? "action non autorisée pour votre compte."}`, error.code);
  if (error.code === "22023" || error.code === "23505" || error.code === "23514") throw new ReleveRemoteError(`${action} : ${error.message ?? "valeur refusée par le serveur."}`, error.code);
  throw new ReleveRemoteError(`${action} impossible. Vérifiez votre connexion.`, error.code);
}

export class SupabasePlanRepository implements RelevePlanRepository {
  constructor(private readonly client: ReleveSupabaseClient) {}

  async listPlans(etageId: string): Promise<Plan[]> {
    const { data, error } = await this.client.from("tools_releves_plans").select("*").eq("etage_id", etageId).order("numero");
    if (error) fail("Chargement des plans", error);
    return ((data ?? []) as PlanRow[]).map(planFromRow);
  }

  async loadPlan(planId: string): Promise<LoadedPlan> {
    const [plan, elements] = await Promise.all([
      this.client.from("tools_releves_plans").select("*").eq("id", planId).maybeSingle(),
      this.client.from("tools_releves_elements").select("id,type,piece_id,parent_element_id,donnees").eq("plan_id", planId).is("deleted_at", null),
    ]);
    if (plan.error) fail("Chargement du plan", plan.error);
    if (elements.error) fail("Chargement du plan", elements.error);
    if (!plan.data) throw new ReleveRemoteError("Plan introuvable ou non accessible.", "P0002");
    const loaded = planFromRow(plan.data as PlanRow);
    const rows = (elements.data ?? []) as ElementRow[];
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return {
      plan: loaded,
      document: {
        murs: rows.filter((row) => row.type === "mur").sort(byId)
          .map((row) => murFromElement({ id: row.id, pieceId: row.piece_id, donnees: row.donnees } as unknown as ReleveElement<"mur">)),
        ouvertures: rows.filter((row) => row.type === "ouverture").sort(byId)
          .map((row) => ouvertureFromElement({ id: row.id, parentElementId: row.parent_element_id, donnees: row.donnees } as unknown as ReleveElement<"ouverture">)),
        contours: loaded.contours, cadre: loaded.cadre, reglages: loaded.reglages,
      },
    };
  }

  async createPlan(etageId: string, etat: PlanEtat, baseId: string | null = null, libelle: string | null = null): Promise<Plan> {
    const { data, error } = await this.client.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: etat, p_plan_base_id: baseId, p_libelle: libelle });
    if (error) fail("Création du plan", error);
    return planFromRow(data as PlanRow);
  }

  async savePlan(planId: string, expectedRevision: number, operations: PlanOperations): Promise<PlanSaveResult> {
    const { data, error } = await this.client.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: expectedRevision, p_modifications: operations });
    if (error) fail("Enregistrement du plan", error);
    const result = data as { revision: number | string; contours: PlanContour[] };
    return { revision: Number(result.revision), contours: result.contours ?? [] };
  }

  async freezePlan(planId: string, expectedRevision: number, libelle: string | null = null): Promise<Plan> {
    const { data, error } = await this.client.rpc("tools_releve_plan_figer", { p_plan_id: planId, p_revision: expectedRevision, p_libelle: libelle });
    if (error) fail("Gel du plan", error);
    return planFromRow(data as PlanRow);
  }
}
