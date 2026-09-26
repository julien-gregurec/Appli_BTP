/**
 * Navigation Relevé & Métré. Routes STATIQUES (compatibles export natif Capacitor) :
 * l'identifiant du relevé et la sélection courante voyagent en paramètres de requête,
 * jamais en segment dynamique — comme `/atelier/tracer?projectId=`.
 */
import { isUuid } from "@elsatia/releve-domain";

export const RELEVES_PATH = "/releves";
export const RELEVE_STRUCTURE_PATH = "/releves/structure";

export type StructureSelection = { releveId: string; batimentId: string | null; etageId: string | null };

export function structureHref(selection: { releveId: string; batimentId?: string | null; etageId?: string | null }): string {
  const params = new URLSearchParams({ id: selection.releveId });
  if (selection.batimentId) params.set("batiment", selection.batimentId);
  if (selection.batimentId && selection.etageId) params.set("etage", selection.etageId);
  return `${RELEVE_STRUCTURE_PATH}?${params.toString()}`;
}

/** Lit la sélection depuis une query string ; tout identifiant non UUID est ignoré. */
export function readStructureSelection(search: string): StructureSelection | null {
  const params = new URLSearchParams(search);
  const releveId = params.get("id");
  if (!isUuid(releveId)) return null;
  const batimentId = params.get("batiment");
  const etageId = params.get("etage");
  const validBatiment = isUuid(batimentId) ? batimentId : null;
  return { releveId, batimentId: validBatiment, etageId: validBatiment && isUuid(etageId) ? etageId : null };
}
