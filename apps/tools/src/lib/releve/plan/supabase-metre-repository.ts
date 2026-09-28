/**
 * Adaptateur Supabase du port `ReleveMetreRepository` (Lot 8).
 *
 * Lecture : RPC `tools_releve_plan_metre` / `tools_releve_metre_synthese` (métré calculé par le
 * SERVEUR, ou figé avec le plan) et `tools_releve_plan_elements` (revêtements du plan). Écriture :
 * UNIQUEMENT les RPC de la migration 1201 (revêtements, ajustements audités, seuil des petites
 * ouvertures) — aucune écriture directe, aucune valeur calculée envoyée par le client.
 */
import {
  ReleveConflictError, planMetreFromJson, revetementDonnees, revetementFromElement,
  type MetreEtageSource, type MetreGrandeur, type MetreSyntheseEtat, type PlanMetre, type PlanRevetement, type ReleveMetreRepository,
} from "@elsatia/releve-domain";
import { ReleveRemoteError, type ReleveSupabaseClient } from "../supabase-repository";

type RemoteError = { code?: string; message?: string; details?: string | null };

function fail(action: string, error: RemoteError): never {
  if (error.code === "PT409") throw new ReleveConflictError(Number(error.details ?? 0) || 0);
  if (error.code === "42501" || error.code === "22023" || error.code === "23505" || error.code === "23514") {
    throw new ReleveRemoteError(`${action} : ${error.message ?? "action refusée par le serveur."}`, error.code);
  }
  throw new ReleveRemoteError(`${action} impossible. Vérifiez votre connexion.`, error.code);
}

export class SupabaseMetreRepository implements ReleveMetreRepository {
  constructor(private readonly client: ReleveSupabaseClient) {}

  async planMetre(planId: string): Promise<PlanMetre> {
    const { data, error } = await this.client.rpc("tools_releve_plan_metre", { p_plan_id: planId });
    if (error) fail("Chargement du métré", error);
    return planMetreFromJson(data);
  }

  async synthese(releveId: string, etat: MetreSyntheseEtat): Promise<MetreEtageSource[]> {
    const { data, error } = await this.client.rpc("tools_releve_metre_synthese", { p_releve_id: releveId, p_etat: etat });
    if (error) fail("Chargement du métré", error);
    return ((data ?? []) as { etageId: string; planId: string; numero: number; etat: MetreEtageSource["etat"]; figeLe: string | null; metre: unknown }[])
      .map((row) => ({ etageId: row.etageId, planId: row.planId, numero: Number(row.numero), etat: row.etat, figeLe: row.figeLe, metre: planMetreFromJson(row.metre) }));
  }

  async listRevetements(planId: string): Promise<PlanRevetement[]> {
    const { data, error } = await this.client.rpc("tools_releve_plan_elements", { p_plan_id: planId });
    if (error) fail("Chargement des revêtements", error);
    return ((data ?? []) as { id: string; type: string; piece_id: string | null; donnees: Record<string, unknown> }[])
      .filter((row) => row.type === "materiau")
      .map((row) => revetementFromElement({ id: row.id, pieceId: row.piece_id, donnees: row.donnees }));
  }

  async saveRevetement(planId: string, revetement: PlanRevetement): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_plan_revetement_enregistrer", {
      p_plan_id: planId, p_id: revetement.id, p_piece_id: revetement.pieceId, p_donnees: revetementDonnees(revetement),
    });
    if (error) fail("Enregistrement du revêtement", error);
  }

  async deleteRevetement(planId: string, id: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_plan_revetement_supprimer", { p_plan_id: planId, p_id: id });
    if (error) fail("Suppression du revêtement", error);
  }

  async ajuster(planId: string, cible: { pieceId: string | null; revetementId: string | null; grandeur: MetreGrandeur }, valeurRetenue: number, raison: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_metre_ajuster", {
      p_plan_id: planId, p_piece_id: cible.pieceId, p_revetement_id: cible.revetementId, p_grandeur: cible.grandeur, p_valeur_retenue: valeurRetenue, p_raison: raison,
    });
    if (error) fail("Ajustement", error);
  }

  async retirerAjustement(id: string, raison: string | null): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_metre_ajustement_retirer", { p_id: id, p_raison: raison });
    if (error) fail("Retrait de l'ajustement", error);
  }

  async reglerSeuil(planId: string, revision: number, seuilMm2: number | null): Promise<number> {
    const { data, error } = await this.client.rpc("tools_releve_plan_metre_regler", { p_plan_id: planId, p_revision: revision, p_seuil_mm2: seuilMm2 });
    if (error) fail("Réglage du métré", error);
    return Number((data as { revision: number | string }).revision);
  }
}
