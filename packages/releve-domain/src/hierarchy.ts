/**
 * Hiérarchie `chantier → bâtiment → étage → zone → pièce`, sans dépendance à un scan.
 *
 * Fonctions pures sur une {@link ReleveStructure} : construction de l'arbre affiché,
 * contrôles d'intégrité (miroir des clés étrangères composites SQL), calcul des
 * descendants pour la suppression douce en cascade, prochain ordre libre.
 */

import type { Batiment, Etage, Piece, Releve, ReleveStructure, Zone } from "./model";

export type ZoneNode = { readonly zone: Zone; readonly pieces: readonly Piece[] };
export type EtageNode = { readonly etage: Etage; readonly zones: readonly ZoneNode[]; readonly piecesSansZone: readonly Piece[] };
export type BatimentNode = { readonly batiment: Batiment; readonly etages: readonly EtageNode[] };
export type ReleveTree = {
  /** Le chantier est porté par le relevé (libellé local + lien GP facultatif). */
  readonly chantier: Releve["chantier"];
  readonly releve: Releve;
  readonly batiments: readonly BatimentNode[];
};

const alive = <T extends { deletedAt: string | null }>(items: readonly T[]) => items.filter((item) => !item.deletedAt);
const byOrdre = <T extends { ordre: number; nom: string }>(a: T, b: T) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr");

/** Arbre de navigation : éléments supprimés exclus, tri stable (ordre puis nom ; étages par niveau). */
export function buildReleveTree(structure: ReleveStructure): ReleveTree {
  const etages = alive(structure.etages);
  const zones = alive(structure.zones);
  const pieces = alive(structure.pieces);
  return {
    chantier: structure.releve.chantier,
    releve: structure.releve,
    batiments: alive(structure.batiments).sort(byOrdre).map((batiment) => ({
      batiment,
      etages: etages
        .filter((etage) => etage.batimentId === batiment.id)
        .sort((a, b) => a.niveau - b.niveau || byOrdre(a, b))
        .map((etage) => {
          const etageZones = zones.filter((zone) => zone.etageId === etage.id).sort(byOrdre);
          const zoneIds = new Set(etageZones.map((zone) => zone.id as string));
          const etagePieces = pieces.filter((piece) => piece.etageId === etage.id).sort(byOrdre);
          return {
            etage,
            zones: etageZones.map((zone) => ({ zone, pieces: etagePieces.filter((piece) => piece.zoneId === zone.id) })),
            piecesSansZone: etagePieces.filter((piece) => !piece.zoneId || !zoneIds.has(piece.zoneId)),
          };
        }),
    })),
  };
}

export type StructureIssueCode =
  | "tenant_mismatch" | "releve_mismatch" | "orphan" | "cross_etage" | "duplicate_id" | "duplicate_niveau";
export type StructureIssue = { readonly code: StructureIssueCode; readonly entity: "batiment" | "etage" | "zone" | "piece"; readonly id: string; readonly message: string };

/**
 * Contrôle d'intégrité. Les cas `tenant_mismatch`, `releve_mismatch`, `orphan` et
 * `cross_etage` sont impossibles en base (clés étrangères composites) : les voir ici signale
 * un cache local corrompu ou une fusion hors ligne erronée. `duplicate_niveau` est un
 * avertissement métier (deux étages « existant » au même niveau d'un même bâtiment).
 */
export function checkStructureIntegrity(structure: ReleveStructure): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const { releve } = structure;
  const seen = new Set<string>();
  const all: Array<{ entity: StructureIssue["entity"]; item: Batiment | Etage | Zone | Piece }> = [
    ...structure.batiments.map((item) => ({ entity: "batiment" as const, item })),
    ...structure.etages.map((item) => ({ entity: "etage" as const, item })),
    ...structure.zones.map((item) => ({ entity: "zone" as const, item })),
    ...structure.pieces.map((item) => ({ entity: "piece" as const, item })),
  ];
  for (const { entity, item } of all) {
    if (seen.has(item.id)) issues.push({ code: "duplicate_id", entity, id: item.id, message: "Identifiant présent deux fois." });
    seen.add(item.id);
    if (item.entrepriseId !== releve.entrepriseId) issues.push({ code: "tenant_mismatch", entity, id: item.id, message: "Élément d'une autre entreprise." });
    if (item.releveId !== releve.id) issues.push({ code: "releve_mismatch", entity, id: item.id, message: "Élément d'un autre relevé." });
  }
  const batiments = new Map(structure.batiments.map((item) => [item.id as string, item]));
  const etages = new Map(structure.etages.map((item) => [item.id as string, item]));
  const zones = new Map(structure.zones.map((item) => [item.id as string, item]));
  for (const etage of structure.etages) if (!batiments.has(etage.batimentId)) issues.push({ code: "orphan", entity: "etage", id: etage.id, message: "Bâtiment parent introuvable." });
  for (const zone of structure.zones) if (!etages.has(zone.etageId)) issues.push({ code: "orphan", entity: "zone", id: zone.id, message: "Étage parent introuvable." });
  for (const piece of structure.pieces) {
    if (!etages.has(piece.etageId)) issues.push({ code: "orphan", entity: "piece", id: piece.id, message: "Étage parent introuvable." });
    if (piece.zoneId) {
      const zone = zones.get(piece.zoneId);
      if (!zone) issues.push({ code: "orphan", entity: "piece", id: piece.id, message: "Zone introuvable." });
      else if (zone.etageId !== piece.etageId) issues.push({ code: "cross_etage", entity: "piece", id: piece.id, message: "La zone appartient à un autre étage." });
    }
  }
  const niveaux = new Map<string, string>();
  for (const etage of alive(structure.etages)) {
    if (etage.etat !== "existant") continue;
    const key = `${etage.batimentId}:${etage.niveau}`;
    if (niveaux.has(key)) issues.push({ code: "duplicate_niveau", entity: "etage", id: etage.id, message: `Niveau ${etage.niveau} déjà relevé dans ce bâtiment.` });
    else niveaux.set(key, etage.id);
  }
  return issues;
}

export type StructureNodeRef =
  | { readonly kind: "batiment"; readonly id: string }
  | { readonly kind: "etage"; readonly id: string }
  | { readonly kind: "zone"; readonly id: string }
  | { readonly kind: "piece"; readonly id: string };

/**
 * Descendants à supprimer (ou restaurer) avec un nœud. Une zone supprimée n'emporte PAS
 * ses pièces : elles redeviennent des pièces sans zone de l'étage (même règle que le
 * `on delete set null` SQL), car la zone est un regroupement, pas un contenant physique.
 */
export function descendantsOf(structure: ReleveStructure, ref: StructureNodeRef): { etages: string[]; zones: string[]; pieces: string[] } {
  if (ref.kind === "piece" || ref.kind === "zone") return { etages: [], zones: [], pieces: [] };
  const etageIds = ref.kind === "etage" ? [ref.id] : structure.etages.filter((etage) => etage.batimentId === ref.id).map((etage) => etage.id as string);
  const set = new Set(etageIds);
  return {
    etages: ref.kind === "etage" ? [] : etageIds,
    zones: structure.zones.filter((zone) => set.has(zone.etageId)).map((zone) => zone.id),
    pieces: structure.pieces.filter((piece) => set.has(piece.etageId)).map((piece) => piece.id),
  };
}

export function nextOrdre(siblings: readonly { ordre: number; deletedAt: string | null }[]): number {
  return alive(siblings).reduce((max, item) => Math.max(max, item.ordre + 1), 0);
}

export type StructureStats = { batiments: number; etages: number; zones: number; pieces: number };
export function structureStats(structure: ReleveStructure): StructureStats {
  return {
    batiments: alive(structure.batiments).length,
    etages: alive(structure.etages).length,
    zones: alive(structure.zones).length,
    pieces: alive(structure.pieces).length,
  };
}

/** Libellé d'étage lisible : « RDC », « R+2 », « R-1 ». */
export function niveauLabel(niveau: number): string {
  if (niveau === 0) return "RDC";
  return niveau > 0 ? `R+${niveau}` : `R${niveau}`;
}
