/**
 * Adaptateur Supabase du port `GpHandoffRepository` (Lot 11) : envoi RÉEL de l'estimation vers Gestion Pro.
 *
 * Une seule écriture : la RPC `gp_tools_importer_estimation` (migration 20260930001501), qui vérifie les droits Tools
 * ET Gestion Pro, recompare le contrat à l'estimation calculée par le serveur et garantit l'idempotence. Aucune table
 * Gestion Pro n'est écrite directement, aucun devis n'est demandé : Gestion Pro en décide.
 */
import {
  classerErreurEnvoiGp, GP_HANDOFF_RPC, gpEnvoisFromJson, gpImportResultatFromJson,
  type EstimationGpPayload, type GpEnvoi, type GpEnvoiErreur, type GpHandoffRepository, type GpImportResultat,
} from "@elsatia/releve-domain";
import type { ReleveSupabaseClient } from "../supabase-repository";

export class GpEnvoiError extends Error {
  constructor(public readonly erreur: GpEnvoiErreur) { super(erreur.message); this.name = "GpEnvoiError"; }
}

type RemoteError = { code?: string | null; message?: string | null; hint?: string | null };

export class SupabaseGpHandoffRepository implements GpHandoffRepository {
  constructor(private readonly client: ReleveSupabaseClient) {}

  async envoyer(releveId: string, etat: string, payload: EstimationGpPayload): Promise<GpImportResultat> {
    let reponse: { data: unknown; error: RemoteError | null };
    try {
      reponse = await this.client.rpc(GP_HANDOFF_RPC.importer, { p_releve_id: releveId, p_etat: etat, p_payload: payload }) as typeof reponse;
    } catch {
      // Requête interrompue (réseau coupé, Gestion Pro / API injoignable) : rien n'est garanti écrit, le renvoi est sûr.
      throw new GpEnvoiError(classerErreurEnvoiGp(null));
    }
    if (reponse.error) throw new GpEnvoiError(classerErreurEnvoiGp(reponse.error));
    return gpImportResultatFromJson(reponse.data);
  }

  async envois(releveId: string): Promise<GpEnvoi[]> {
    const { data, error } = await this.client.rpc(GP_HANDOFF_RPC.envois, { p_releve_id: releveId });
    if (error) throw new GpEnvoiError(classerErreurEnvoiGp(error as RemoteError));
    return gpEnvoisFromJson(data);
  }
}
