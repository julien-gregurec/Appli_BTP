/**
 * Contexte d'acteur Relevé & Métré, résolu par le serveur (`tools_releve_contexte`).
 * Le client n'en déduit jamais un droit : il s'en sert pour ne pas proposer une action
 * que la RLS refusera.
 */
import { asTenantId, asUserId, RELEVE_ROLES, type ReleveActorContext, type ReleveRole } from "@elsatia/releve-domain";
import type { ReleveSupabaseClient } from "./supabase-repository";

type ContexteRow = { entreprise_id: string; tenant_has_tools: boolean; has_releve_capability: boolean; role: string | null; gp_gerer_ouvrages: boolean };

export function actorContextFromRow(userId: string, row: ContexteRow): ReleveActorContext {
  const role = (RELEVE_ROLES as readonly string[]).includes(row.role ?? "") ? (row.role as ReleveRole) : null;
  return {
    userId: asUserId(userId), tenantId: asTenantId(row.entreprise_id), tenantHasTools: row.tenant_has_tools === true,
    hasReleveCapability: row.has_releve_capability === true, role, gpGererOuvrages: row.gp_gerer_ouvrages === true,
  };
}

export async function loadReleveActorContext(client: ReleveSupabaseClient, userId: string, tenantId: string): Promise<ReleveActorContext> {
  const { data, error } = await client.rpc("tools_releve_contexte", { p_entreprise_id: tenantId });
  if (error || !data) throw new Error("Droits Relevé & Métré non vérifiables.");
  return actorContextFromRow(userId, data as ContexteRow);
}
