/**
 * Adaptateur Supabase du port `ReleveEstimationRepository` (Lot 10).
 *
 * Lecture : RPC `tools_releve_estimation_synthese` / `tools_releve_plan_estimation` (quantités du Lot 9 ET montants
 * calculés par le SERVEUR, ou figés avec le plan), `tools_releve_estimation_plans`, `tools_releve_estimation_corrections`,
 * `tools_releve_bibliotheque_prix`, `tools_releve_estimation_parametres`. Écriture : UNIQUEMENT les RPC des migrations 1401
 * (prix, import, bibliothèque, corrections auditées) et 1402 (coefficients et hypothèses du relevé) — aucun montant
 * calculé envoyé par le client, aucune écriture directe.
 */
import {
  estimationParametresFromJson, estimationSourceFromJson, planEstimationFromJson, planQuantitatifFromJson,
  type BibliothequePrix, type EstimationCible, type EstimationCorrection, type EstimationParametres, type EstimationParametresDonnees, type EstimationSource,
  type MetreSyntheseEtat, type PlanEstimation, type PlanEtat,
  type PlanQuantitatif, type PrixDonnees, type ReleveEstimationRepository,
} from "@elsatia/releve-domain";
import { ReleveRemoteError, type ReleveSupabaseClient } from "../supabase-repository";

type RemoteError = { code?: string; message?: string; details?: string | null };

function fail(action: string, error: RemoteError): never {
  if (error.code === "42501" || error.code === "22023" || error.code === "23505" || error.code === "23514" || error.code === "PT409" || error.code === "PT503") {
    throw new ReleveRemoteError(`${action} : ${error.message ?? "action refusée par le serveur."}`, error.code);
  }
  throw new ReleveRemoteError(`${action} impossible. Vérifiez votre connexion.`, error.code);
}

type SyntheseRow = Parameters<typeof estimationSourceFromJson>[0];

export class SupabaseEstimationRepository implements ReleveEstimationRepository {
  constructor(private readonly client: ReleveSupabaseClient) {}

  async synthese(releveId: string, etat: MetreSyntheseEtat): Promise<EstimationSource[]> {
    const { data, error } = await this.client.rpc("tools_releve_estimation_synthese", { p_releve_id: releveId, p_etat: etat });
    if (error) fail("Chargement de l'estimation", error);
    return ((data ?? []) as SyntheseRow[]).map(estimationSourceFromJson);
  }

  async planEstimation(planId: string): Promise<{ quantitatif: PlanQuantitatif; estimation: PlanEstimation }> {
    const { data, error } = await this.client.rpc("tools_releve_plan_estimation", { p_plan_id: planId });
    if (error) fail("Chargement de l'estimation", error);
    const row = data as { quantitatif: unknown; estimation: unknown };
    return { quantitatif: planQuantitatifFromJson(row.quantitatif), estimation: planEstimationFromJson(row.estimation) };
  }

  async plansEtage(etageId: string) {
    const { data, error } = await this.client.rpc("tools_releve_estimation_plans", { p_etage_id: etageId });
    if (error) fail("Chargement des plans", error);
    return ((data ?? []) as { planId: string; numero: number | string; etat: PlanEtat; libelle: string | null; figeLe: string | null; planBaseId: string | null }[])
      .map((row) => ({ ...row, numero: Number(row.numero) }));
  }

  async savePrix(planId: string, ouvrageId: string, donnees: PrixDonnees): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: planId, p_ouvrage_id: ouvrageId, p_donnees: donnees });
    if (error) fail("Enregistrement du prix", error);
  }

  async importPrix(planId: string, prix: readonly { ouvrageId: string; donnees: PrixDonnees }[]): Promise<number> {
    const { data, error } = await this.client.rpc("tools_releve_estimation_prix_importer", { p_plan_id: planId, p_prix: prix.map((p) => ({ ouvrageId: p.ouvrageId, donnees: p.donnees })) });
    if (error) fail("Import des prix", error);
    return Number(data);
  }

  async deletePrix(planId: string, ouvrageId: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_estimation_prix_supprimer", { p_plan_id: planId, p_ouvrage_id: ouvrageId });
    if (error) fail("Retrait du prix", error);
  }

  async appliquerBibliotheque(planId: string, remplacer: boolean): Promise<number> {
    const { data, error } = await this.client.rpc("tools_releve_estimation_appliquer_bibliotheque", { p_plan_id: planId, p_remplacer: remplacer });
    if (error) fail("Application des prix de la bibliothèque", error);
    return Number(data);
  }

  async corriger(planId: string, cible: EstimationCible, valeurRetenue: number, raison: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_estimation_ajuster", {
      p_plan_id: planId, p_ouvrage_id: cible.ouvrageId, p_piece_id: cible.pieceId, p_etat: cible.etatProjet, p_nature: cible.nature,
      p_valeur_retenue: valeurRetenue, p_raison: raison,
    });
    if (error) fail("Correction", error);
  }

  async retirerCorrection(id: string, raison: string | null): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_estimation_ajustement_retirer", { p_id: id, p_raison: raison });
    if (error) fail("Retrait de la correction", error);
  }

  async corrections(planId: string): Promise<EstimationCorrection[]> {
    const { data, error } = await this.client.rpc("tools_releve_estimation_corrections", { p_plan_id: planId });
    if (error) fail("Chargement des corrections", error);
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return ((data ?? []) as EstimationCorrection[]).map((c) => ({
      ...c, valeurRetenue: Number(c.valeurRetenue), valeurCalculee: n(c.valeurCalculee),
      valeurSource: c.valeurSource ? { ...c.valeurSource, quantite: n(c.valeurSource.quantite), prixUnitaire: n(c.valeurSource.prixUnitaire),
        montantCalcule: n(c.valeurSource.montantCalcule), coefficient: n(c.valeurSource.coefficient) } : null,
    }));
  }

  async bibliothequePrix(releveId: string): Promise<BibliothequePrix[]> {
    const { data, error } = await this.client.rpc("tools_releve_bibliotheque_prix", { p_releve_id: releveId });
    if (error) fail("Chargement des prix de bibliothèque", error);
    return ((data ?? []) as { bibliothequeId: string; donnees: PrixDonnees; revision: number | string; updatedAt?: string }[])
      .map((row) => ({ bibliothequeId: row.bibliothequeId, donnees: row.donnees, revision: Number(row.revision), updatedAt: row.updatedAt }));
  }

  async saveBibliothequePrix(releveId: string, bibliothequeId: string, donnees: PrixDonnees): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_bibliotheque_prix_enregistrer", { p_releve_id: releveId, p_bibliotheque_id: bibliothequeId, p_donnees: donnees });
    if (error) fail("Prix de bibliothèque", error);
  }

  async deleteBibliothequePrix(releveId: string, bibliothequeId: string): Promise<void> {
    const { error } = await this.client.rpc("tools_releve_bibliotheque_prix_supprimer", { p_releve_id: releveId, p_bibliotheque_id: bibliothequeId });
    if (error) fail("Retrait du prix de bibliothèque", error);
  }

  async parametres(releveId: string): Promise<EstimationParametres> {
    const { data, error } = await this.client.rpc("tools_releve_estimation_parametres", { p_releve_id: releveId });
    if (error) fail("Chargement des coefficients", error);
    return estimationParametresFromJson(data);
  }

  async saveParametres(releveId: string, donnees: EstimationParametresDonnees, revision: number): Promise<EstimationParametres> {
    const { data, error } = await this.client.rpc("tools_releve_estimation_parametres_enregistrer", { p_releve_id: releveId, p_donnees: donnees, p_revision: revision });
    if (error) fail("Enregistrement des coefficients", error);
    return estimationParametresFromJson(data);
  }
}
