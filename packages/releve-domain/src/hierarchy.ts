/**
 * Hiérarchie `projet relevé → chantier → bâtiment → étage → zone → pièce`, sans dépendance
 * à un scan.
 *
 * Fonctions pures sur une {@link ReleveStructure} : construction de l'arbre affiché,
 * contrôles d'intégrité (miroir des clés étrangères composites SQL), calcul des
 * descendants pour la suppression douce en cascade, prochain ordre libre.
 */

import type { Batiment, Chantier, Etage, EtageCategorie, Piece, Releve, ReleveStructure, Zone } from "./model";

export type ZoneNode = { readonly zone: Zone; readonly pieces: readonly Piece[] };
export type EtageNode = { readonly etage: Etage; readonly zones: readonly ZoneNode[]; readonly piecesSansZone: readonly Piece[] };
export type BatimentNode = { readonly batiment: Batiment; readonly etages: readonly EtageNode[] };
export type ChantierNode = { readonly chantier: Chantier; readonly batiments: readonly BatimentNode[] };
export type ReleveTree = {
  readonly releve: Releve;
  /** Site principal du projet (en-tête, lien GP du projet). */
  readonly sitePrincipal: Releve["chantier"];
  readonly chantiers: readonly ChantierNode[];
};

const alive = <T extends { deletedAt: string | null }>(items: readonly T[]) => items.filter((item) => !item.deletedAt);
const byOrdre = <T extends { ordre: number; nom: string }>(a: T, b: T) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr");

/** Arbre de navigation : éléments supprimés exclus, tri stable (ordre puis nom ; étages par niveau). */
export function buildReleveTree(structure: ReleveStructure): ReleveTree {
  const etages = alive(structure.etages);
  const zones = alive(structure.zones);
  const pieces = alive(structure.pieces);
  const batiments = alive(structure.batiments).sort(byOrdre);
  const batimentNode = (batiment: Batiment): BatimentNode => ({
      batiment,
      etages: etages
        .filter((etage) => etage.batimentId === batiment.id)
        .sort(compareEtages)
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
  });
  return {
    releve: structure.releve,
    sitePrincipal: structure.releve.chantier,
    chantiers: alive(structure.chantiers).sort(byOrdre).map((chantier) => ({
      chantier,
      batiments: batiments.filter((batiment) => batiment.chantierId === chantier.id).map(batimentNode),
    })),
  };
}

export type StructureIssueCode =
  | "tenant_mismatch" | "releve_mismatch" | "orphan" | "cross_etage" | "duplicate_id" | "duplicate_niveau";
export type StructureIssue = { readonly code: StructureIssueCode; readonly entity: "chantier" | "batiment" | "etage" | "zone" | "piece"; readonly id: string; readonly message: string };

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
  const all: Array<{ entity: StructureIssue["entity"]; item: Chantier | Batiment | Etage | Zone | Piece }> = [
    ...structure.chantiers.map((item) => ({ entity: "chantier" as const, item })),
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
  const chantiers = new Map(structure.chantiers.map((item) => [item.id as string, item]));
  for (const batiment of structure.batiments) if (!chantiers.has(batiment.chantierId)) issues.push({ code: "orphan", entity: "batiment", id: batiment.id, message: "Chantier parent introuvable." });
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
    if (etage.etat !== "existant" || etage.niveau === null) continue;
    const key = `${etage.batimentId}:${etage.niveau}`;
    if (niveaux.has(key)) issues.push({ code: "duplicate_niveau", entity: "etage", id: etage.id, message: `Niveau ${etage.niveau} déjà relevé dans ce bâtiment.` });
    else niveaux.set(key, etage.id);
  }
  return issues;
}

export type StructureNodeRef =
  | { readonly kind: "chantier"; readonly id: string }
  | { readonly kind: "batiment"; readonly id: string }
  | { readonly kind: "etage"; readonly id: string }
  | { readonly kind: "zone"; readonly id: string }
  | { readonly kind: "piece"; readonly id: string };

/**
 * Descendants à supprimer (ou restaurer) avec un nœud. Une zone supprimée n'emporte PAS
 * ses pièces : elles redeviennent des pièces sans zone de l'étage (même règle que le
 * `on delete set null` SQL), car la zone est un regroupement, pas un contenant physique.
 */
export function descendantsOf(structure: ReleveStructure, ref: StructureNodeRef): { batiments: string[]; etages: string[]; zones: string[]; pieces: string[] } {
  if (ref.kind === "piece" || ref.kind === "zone") return { batiments: [], etages: [], zones: [], pieces: [] };
  const batimentIds = ref.kind === "chantier"
    ? structure.batiments.filter((batiment) => batiment.chantierId === ref.id).map((batiment) => batiment.id as string)
    : ref.kind === "batiment" ? [ref.id] : [];
  const batimentSet = new Set(batimentIds);
  const etageIds = ref.kind === "etage" ? [ref.id] : structure.etages.filter((etage) => batimentSet.has(etage.batimentId)).map((etage) => etage.id as string);
  const set = new Set(etageIds);
  return {
    batiments: ref.kind === "chantier" ? batimentIds : [],
    etages: ref.kind === "etage" ? [] : etageIds,
    zones: structure.zones.filter((zone) => set.has(zone.etageId)).map((zone) => zone.id),
    pieces: structure.pieces.filter((piece) => set.has(piece.etageId)).map((piece) => piece.id),
  };
}

export function nextOrdre(siblings: readonly { ordre: number; deletedAt: string | null }[]): number {
  return alive(siblings).reduce((max, item) => Math.max(max, item.ordre + 1), 0);
}

export type StructureStats = { chantiers: number; batiments: number; etages: number; zones: number; pieces: number };
export function structureStats(structure: ReleveStructure): StructureStats {
  return {
    chantiers: alive(structure.chantiers).length,
    batiments: alive(structure.batiments).length,
    etages: alive(structure.etages).length,
    zones: alive(structure.zones).length,
    pieces: alive(structure.pieces).length,
  };
}

/** Libellé d'étage lisible : « RDC », « R+2 », « R-1 », « R+1,5 » ; « — » sans niveau. */
export function niveauLabel(niveau: number | null): string {
  if (niveau === null || niveau === undefined) return "—";
  const text = Number.isInteger(niveau) ? String(Math.abs(niveau)) : String(Math.abs(niveau)).replace(".", ",");
  if (niveau === 0) return "RDC";
  return niveau > 0 ? `R+${text}` : `R-${text}`;
}

// ── Lot 3 : niveaux libres ────────────────────────────────────────────────────

/** Rang d'affichage des catégories (du bas vers le haut du bâtiment). */
const CATEGORIE_RANG: Record<EtageCategorie, number> = { sous_sol: 0, rdc: 1, entresol: 2, etage: 3, combles: 4, toiture: 5, exterieur: 6, autre: 7 };
export const ETAGE_CATEGORIE_LABELS: Record<EtageCategorie, string> = {
  sous_sol: "Sous-sol", rdc: "Rez-de-chaussée", entresol: "Entresol", etage: "Étage", combles: "Combles", toiture: "Toiture-terrasse", exterieur: "Extérieur", autre: "Autre",
};

/** Catégorie d'un étage ; déduite du niveau pour une ligne antérieure au Lot 3. */
export function etageCategorie(etage: Pick<Etage, "niveau" | "categorieNiveau">): EtageCategorie {
  if (etage.categorieNiveau) return etage.categorieNiveau;
  if (etage.niveau === null) return "autre";
  return etage.niveau < 0 ? "sous_sol" : etage.niveau === 0 ? "rdc" : "etage";
}

/**
 * Tri des étages d'un bâtiment : niveau quand il est connu, sinon catégorie (des combles
 * sans numéro restent au-dessus des étages), puis ordre manuel et nom.
 */
export function compareEtages(a: Etage, b: Etage): number {
  const rang = (etage: Etage) => etage.niveau ?? (CATEGORIE_RANG[etageCategorie(etage)] >= CATEGORIE_RANG.combles ? 1000 + CATEGORIE_RANG[etageCategorie(etage)] : -1000 + CATEGORIE_RANG[etageCategorie(etage)]);
  return rang(a) - rang(b) || a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr");
}

/** Sous-titre d'étage : « R+1 · Étage », « Combles ». */
export function etageLabel(etage: Pick<Etage, "niveau" | "categorieNiveau">): string {
  const categorie = etageCategorie(etage);
  if (etage.niveau === null) return ETAGE_CATEGORIE_LABELS[categorie];
  return categorie === "etage" || categorie === "rdc" ? niveauLabel(etage.niveau) : `${ETAGE_CATEGORIE_LABELS[categorie]} · ${niveauLabel(etage.niveau)}`;
}

/** Niveau et catégorie proposés pour un nouvel étage (au-dessus du plus haut étage numéroté). */
export function suggestNextEtage(etages: readonly Etage[]): { niveau: number; categorieNiveau: EtageCategorie; nom: string } {
  const numerotes = alive(etages).map((etage) => etage.niveau).filter((niveau): niveau is number => niveau !== null);
  const niveau = numerotes.length ? Math.floor(Math.max(...numerotes)) + 1 : 0;
  return { niveau, categorieNiveau: niveau === 0 ? "rdc" : "etage", nom: niveauLabel(niveau) };
}

// ── Lot 3 : suppression contrôlée, corbeille, ordre ───────────────────────────

export type DeletionImpact = { etages: number; zones: number; pieces: number; batiments: number; piecesDetachees: number };

/**
 * Ce qu'emporte la suppression d'un nœud (miroir de la cascade SQL) : affiché dans la
 * confirmation. Une zone n'emporte pas ses pièces, elle les détache (`piecesDetachees`).
 */
export function deletionImpact(structure: ReleveStructure, ref: StructureNodeRef): DeletionImpact {
  const d = descendantsOf(structure, ref);
  const living = (ids: string[], rows: readonly { id: string; deletedAt: string | null }[]) => ids.filter((id) => rows.some((row) => row.id === id && !row.deletedAt)).length;
  return {
    batiments: living(d.batiments, structure.batiments),
    etages: living(d.etages, structure.etages),
    zones: living(d.zones, structure.zones),
    pieces: living(d.pieces, structure.pieces),
    piecesDetachees: ref.kind === "zone" ? alive(structure.pieces).filter((piece) => piece.zoneId === ref.id).length : 0,
  };
}

export type TrashEntry = { readonly kind: "chantier" | "batiment" | "etage" | "zone" | "piece"; readonly id: string; readonly nom: string; readonly deletedAt: string; readonly contexte: string };

/**
 * Corbeille d'un relevé : nœuds supprimés dont le parent est encore actif (restaurer un
 * enfant d'un parent supprimé n'aurait pas de sens : on restaure le parent).
 */
export function trashOf(structure: ReleveStructure): TrashEntry[] {
  const aliveIds = new Set<string>([
    ...alive(structure.chantiers), ...alive(structure.batiments), ...alive(structure.etages), ...alive(structure.zones),
  ].map((row) => row.id as string));
  const name = (rows: readonly { id: string; nom: string }[], id: string) => rows.find((row) => row.id === id)?.nom ?? "";
  const entries: TrashEntry[] = [];
  for (const row of structure.chantiers) if (row.deletedAt) entries.push({ kind: "chantier", id: row.id, nom: row.nom, deletedAt: row.deletedAt, contexte: "Chantier" });
  for (const row of structure.batiments) if (row.deletedAt && aliveIds.has(row.chantierId)) entries.push({ kind: "batiment", id: row.id, nom: row.nom, deletedAt: row.deletedAt, contexte: name(structure.chantiers, row.chantierId) });
  for (const row of structure.etages) if (row.deletedAt && aliveIds.has(row.batimentId)) entries.push({ kind: "etage", id: row.id, nom: row.nom, deletedAt: row.deletedAt, contexte: name(structure.batiments, row.batimentId) });
  for (const row of structure.zones) if (row.deletedAt && aliveIds.has(row.etageId)) entries.push({ kind: "zone", id: row.id, nom: row.nom, deletedAt: row.deletedAt, contexte: name(structure.etages, row.etageId) });
  for (const row of structure.pieces) if (row.deletedAt && aliveIds.has(row.etageId)) entries.push({ kind: "piece", id: row.id, nom: row.nom, deletedAt: row.deletedAt, contexte: name(structure.etages, row.etageId) });
  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Frères actifs d'un nœud, dans l'ordre affiché (liste attendue par `tools_releve_reordonner`).
 * Pièces : même étage ET même zone (ou toutes deux sans zone).
 */
export function siblingsOf(structure: ReleveStructure, kind: "chantier" | "batiment" | "etage" | "zone" | "piece", id: string): string[] {
  const sorted = <T extends { id: string; ordre: number; nom: string; deletedAt: string | null }>(rows: readonly T[]) => alive(rows).sort(byOrdre).map((row) => row.id as string);
  switch (kind) {
    case "chantier": return sorted(structure.chantiers);
    case "batiment": { const self = structure.batiments.find((row) => row.id === id); return self ? sorted(structure.batiments.filter((row) => row.chantierId === self.chantierId)) : []; }
    case "etage": { const self = structure.etages.find((row) => row.id === id); return self ? alive(structure.etages.filter((row) => row.batimentId === self.batimentId)).sort(compareEtages).map((row) => row.id as string) : []; }
    case "zone": { const self = structure.zones.find((row) => row.id === id); return self ? sorted(structure.zones.filter((row) => row.etageId === self.etageId)) : []; }
    case "piece": {
      const self = structure.pieces.find((row) => row.id === id);
      if (!self) return [];
      const zoneAlive = (zoneId: string | null) => zoneId !== null && structure.zones.some((zone) => zone.id === zoneId && !zone.deletedAt);
      const groupe = (piece: Piece) => (zoneAlive(piece.zoneId) ? piece.zoneId : null);
      return sorted(structure.pieces.filter((row) => row.etageId === self.etageId && groupe(row) === groupe(self)));
    }
  }
}

/** Nouvel ordre après déplacement d'un cran ; `null` si le déplacement est impossible. */
export function moveInList(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const index = ids.indexOf(id); const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids]; [next[index], next[target]] = [next[target], next[index]];
  return next;
}
