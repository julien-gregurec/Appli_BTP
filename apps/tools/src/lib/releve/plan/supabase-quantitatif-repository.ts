/**
 * Adaptateur Supabase du port `ReleveQuantitatifRepository` (Lot 9).
 *
 * Lecture : RPC `tools_releve_plan_quantitatif` / `tools_releve_quantitatif_synthese` (quantités
 * calculées par le SERVEUR à partir du métré, ou figées avec le plan) et `tools_releve_bibliotheque`.
 * Écriture : UNIQUEMENT les RPC de la migration 1301 (ouvrages, import, ajustements audités,
 * bibliothèque) — aucune écriture directe, aucune quantité calculée envoyée par le client.
 */
import {
  ReleveConflictError, planQuantitatifFromJson,
  type BibliothequeOuvrage, type EtatProjet, type MetreSyntheseEtat, type OuvrageDonnees, type PlanQuantitatif, type QuantitatifSource, type ReleveQuantitatifRepository,
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

export class SupabaseQuantitatifRepository implements ReleveQuantitatifRepository {
  constructor(private readonly client: ReleveSupabaseClient) {}

  async planQuantitatif(planId: string): Promise<PlanQuantitatif> {
    const { data, error } = await this.client.rpc("tools_releve_plan_quantitatif", { p_plan_id: planId });
    if (error) fail("Chargement du quantitatif", error);
    return planQuantitatifFromJson(data);
  }

  async synthese(releveId: string, etat: MetreSyntheseEtat): Promise<QuantitatifSource[]> {
    const { data, error } = await this.client.rpc("tools_releve_quantitatif_synthese", { p_releve_id: releveId, p_etat: etat });
    if (error) fail("Chargement des quantitatifs", error);
    return ((data ?? []) as { etageId: string; planId: string; numero: number; etat: QuantitatifSource["etat"]; figeLe: string | null; quantitatif: unknown }[])
      .map((row) => ({ etageId: row.etageId, planId: row.planId, numero: Number(row.numero), etat: row.etat, figeLe: row.figeLe, quantitatif: planQuantitatifFromJson(row.quantitatif) }));
  }

  async saveOuvrage(planId: string, id: string, donnees: OuvrageDonnees, bibliothequeId: string | null = null): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: planId, p_id: id, p_donnees: donnees, p_bibliotheque_id: bibliothequeId });
    if (error) fail("Enregistrement de l'ouvrage", error);
  }

  async importOuvrages(planId: string, ouvrages: readonly { id: string; donnees: OuvrageDonnees; bibliothequeId?: string | null }[]): Promise<number> {
    const { data, error } = await this.client.rpc("tools_releve_ouvrages_importer", {
      p_plan_id: planId, p_ouvrages: ouvrages.map((o) => ({ id: o.id, donnees: o.donnees, bibliothequeId: o.bibliothequeId ?? null })),
    });
    if (error) fail("Import des ouvrages", error);
    return Number(data);
  }

  async deleteOuvrage(planId: string, id: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_ouvrage_supprimer", { p_plan_id: planId, p_id: id });
    if (error) fail("Suppression de l'ouvrage", error);
  }

  async ajuster(planId: string, cible: { ouvrageId: string; pieceId: string | null; etatProjet: EtatProjet }, valeurRetenue: number, raison: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_quantitatif_ajuster", {
      p_plan_id: planId, p_ouvrage_id: cible.ouvrageId, p_piece_id: cible.pieceId, p_etat: cible.etatProjet, p_valeur_retenue: valeurRetenue, p_raison: raison,
    });
    if (error) fail("Ajustement", error);
  }

  async retirerAjustement(id: string, raison: string | null): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_quantitatif_ajustement_retirer", { p_id: id, p_raison: raison });
    if (error) fail("Retrait de l'ajustement", error);
  }

  async bibliotheque(releveId: string): Promise<BibliothequeOuvrage[]> {
    const { data, error } = await this.client.rpc("tools_releve_bibliotheque", { p_releve_id: releveId });
    if (error) fail("Chargement de la bibliothèque", error);
    return ((data ?? []) as { id: string; donnees: BibliothequeOuvrage["donnees"]; revision: number | string; updatedAt?: string }[])
      .map((row) => ({ id: row.id, donnees: row.donnees, revision: Number(row.revision), updatedAt: row.updatedAt }));
  }

  async saveBibliotheque(releveId: string, id: string, donnees: Omit<OuvrageDonnees, "pieceIds">): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_bibliotheque_enregistrer", { p_releve_id: releveId, p_id: id, p_donnees: donnees });
    if (error) fail("Enregistrement dans la bibliothèque", error);
  }

  async deleteBibliotheque(releveId: string, id: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_bibliotheque_supprimer", { p_releve_id: releveId, p_id: id });
    if (error) fail("Suppression de la bibliothèque", error);
  }
}
