/**
 * Navigation Relevé & Métré. Routes STATIQUES (compatibles export natif Capacitor) :
 * l'identifiant du relevé et la sélection courante voyagent en paramètres de requête,
 * jamais en segment dynamique — comme `/atelier/tracer?projectId=`.
 *
 * | Écran | Route |
 * |---|---|
 * | Mes relevés | `/releves` |
 * | Nouveau relevé | `/releves/nouveau` |
 * | Fiche relevé (chantiers, versions) | `/releves/fiche?id=` |
 * | Structure (bâtiments, étages, pièces) | `/releves/structure?id=&chantier=&batiment=&etage=` |
 * | Fiche pièce (Lot 3) | `/releves/piece?id=&piece=` |
 */
import { isUuid, type SearchHit } from "@elsatia/releve-domain";

export const RELEVES_PATH = "/releves";
export const RELEVE_NEW_PATH = "/releves/nouveau";
export const RELEVE_FICHE_PATH = "/releves/fiche";
export const RELEVE_STRUCTURE_PATH = "/releves/structure";
export const RELEVE_PIECE_PATH = "/releves/piece";

export type StructureSelection = { releveId: string; chantierId: string | null; batimentId: string | null; etageId: string | null };

export function ficheHref(releveId: string): string {
  return `${RELEVE_FICHE_PATH}?${new URLSearchParams({ id: releveId }).toString()}`;
}

/** Chaque niveau n'est encodé que si son parent l'est : la sélection reste un chemin cohérent. */
export function structureHref(selection: { releveId: string; chantierId?: string | null; batimentId?: string | null; etageId?: string | null }): string {
  const params = new URLSearchParams({ id: selection.releveId });
  if (selection.chantierId) {
    params.set("chantier", selection.chantierId);
    if (selection.batimentId) {
      params.set("batiment", selection.batimentId);
      if (selection.etageId) params.set("etage", selection.etageId);
    }
  }
  return `${RELEVE_STRUCTURE_PATH}?${params.toString()}`;
}

export function readReleveId(search: string): string | null {
  const id = new URLSearchParams(search).get("id");
  return isUuid(id) ? id : null;
}

/** Lit la sélection depuis une query string ; tout identifiant non UUID est ignoré (et ses enfants). */
export function readStructureSelection(search: string): StructureSelection | null {
  const params = new URLSearchParams(search);
  const releveId = params.get("id");
  if (!isUuid(releveId)) return null;
  const pick = (key: string, parentOk: boolean) => { const value = params.get(key); return parentOk && isUuid(value) ? value : null; };
  const chantierId = pick("chantier", true);
  const batimentId = pick("batiment", chantierId !== null);
  const etageId = pick("etage", batimentId !== null);
  return { releveId, chantierId, batimentId, etageId };
}

export function pieceHref(releveId: string, pieceId: string): string {
  return `${RELEVE_PIECE_PATH}?${new URLSearchParams({ id: releveId, piece: pieceId }).toString()}`;
}

export function readPieceSelection(search: string): { releveId: string; pieceId: string } | null {
  const params = new URLSearchParams(search);
  const releveId = params.get("id"); const pieceId = params.get("piece");
  return isUuid(releveId) && isUuid(pieceId) ? { releveId, pieceId } : null;
}

/** Lien d'un résultat de recherche : fiche pour un projet, fiche pièce, sinon structure au bon niveau. */
export function searchHitHref(hit: SearchHit): string {
  if (hit.entite === "releve") return ficheHref(hit.releveId);
  if (hit.entite === "piece" && hit.pieceId) return pieceHref(hit.releveId, hit.pieceId);
  return structureHref({ releveId: hit.releveId, chantierId: hit.chantierId, batimentId: hit.batimentId, etageId: hit.etageId });
}

/**
 * Colonne affichée sur smartphone (navigation en profondeur) : la plus profonde explicitement
 * choisie dans l'URL. Sur tablette et bureau, les trois colonnes restent visibles.
 */
export type StructureFocus = "batiments" | "etages" | "pieces";
export function structureFocus(selection: Pick<StructureSelection, "batimentId" | "etageId">): StructureFocus {
  if (selection.etageId) return "pieces";
  return selection.batimentId ? "etages" : "batiments";
}
