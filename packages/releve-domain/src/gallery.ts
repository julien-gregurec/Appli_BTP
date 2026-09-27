/**
 * Galerie photo (Lot 4) : portée hiérarchique, filtres simples, pagination.
 *
 * La galerie suit la hiérarchie réelle du Lot 3 (relevé → chantier → bâtiment → étage →
 * zone → pièce) : une photo apparaît dans la galerie d'un nœud dès qu'un de ses rattachements
 * actifs est situé dans ce nœud ou sous lui (la photo d'un mur de la pièce P apparaît dans P,
 * dans la zone de P, dans son étage, son bâtiment, son chantier et le relevé).
 *
 * Tout est calculé en mémoire, sans réseau : la galerie d'une pièce, d'un étage ou d'un relevé
 * de plusieurs centaines de photos se filtre instantanément ; seules les vignettes visibles
 * sont ensuite chargées (voir `paginate`).
 */

import type { Ancre, ReleveElement, ReleveStructure, VersionType } from "./model";
import type { PhotoSource } from "./media";

export const GALLERY_SCOPE_KINDS = ["releve", "chantier", "batiment", "etage", "zone", "piece"] as const;
export type GalleryScopeKind = (typeof GALLERY_SCOPE_KINDS)[number];
export type GalleryScope = { readonly kind: "releve" } | { readonly kind: Exclude<GalleryScopeKind, "releve">; readonly id: string };

/** Position d'un rattachement dans la hiérarchie (identifiants des ancêtres, `null` au-dessus). */
export type Lineage = {
  readonly chantierId: string | null;
  readonly batimentId: string | null;
  readonly etageId: string | null;
  readonly zoneId: string | null;
  readonly pieceId: string | null;
};

const EMPTY: Lineage = { chantierId: null, batimentId: null, etageId: null, zoneId: null, pieceId: null };

type Index = {
  batiments: Map<string, { chantierId: string | null }>;
  etages: Map<string, { batimentId: string }>;
  zones: Map<string, { etageId: string }>;
  pieces: Map<string, { etageId: string; zoneId: string | null }>;
  elements: Map<string, { etageId: string | null; pieceId: string | null }>;
};

/** Index de la structure, à construire une fois par chargement (O(n)). */
export function indexStructure(structure: ReleveStructure, elements: readonly ReleveElement[] = []): Index {
  return {
    batiments: new Map(structure.batiments.map((row) => [row.id, { chantierId: row.chantierId ?? null }])),
    etages: new Map(structure.etages.map((row) => [row.id, { batimentId: row.batimentId }])),
    zones: new Map(structure.zones.map((row) => [row.id, { etageId: row.etageId }])),
    pieces: new Map(structure.pieces.map((row) => [row.id, { etageId: row.etageId, zoneId: row.zoneId ?? null }])),
    elements: new Map(elements.map((row) => [row.id, { etageId: row.etageId, pieceId: row.pieceId }])),
  };
}

function fromBatiment(index: Index, batimentId: string | null): Lineage {
  if (!batimentId) return EMPTY;
  return { ...EMPTY, batimentId, chantierId: index.batiments.get(batimentId)?.chantierId ?? null };
}
function fromEtage(index: Index, etageId: string | null): Lineage {
  if (!etageId) return EMPTY;
  return { ...fromBatiment(index, index.etages.get(etageId)?.batimentId ?? null), etageId };
}
function fromPiece(index: Index, pieceId: string): Lineage {
  const piece = index.pieces.get(pieceId);
  return { ...fromEtage(index, piece?.etageId ?? null), zoneId: piece?.zoneId ?? null, pieceId };
}

/** Lignée d'une ancre de PhotoAnchor. */
export function lineageOf(ancre: Ancre, index: Index): Lineage {
  if (ancre.kind === "plan" || ancre.kind === "point") return fromEtage(index, ancre.etageId);
  const { kind, id } = ancre.ref;
  switch (kind) {
    case "releve": return EMPTY;
    case "chantier": return { ...EMPTY, chantierId: id };
    case "batiment": return fromBatiment(index, id);
    case "etage": return fromEtage(index, id);
    case "zone": return { ...fromEtage(index, index.zones.get(id)?.etageId ?? null), zoneId: id };
    case "piece": return fromPiece(index, id);
    case "element": {
      const element = index.elements.get(id);
      if (!element) return EMPTY;
      return element.pieceId ? fromPiece(index, element.pieceId) : fromEtage(index, element.etageId);
    }
  }
}

export function inScope(lineage: Lineage, scope: GalleryScope): boolean {
  switch (scope.kind) {
    case "releve": return true;
    case "chantier": return lineage.chantierId === scope.id;
    case "batiment": return lineage.batimentId === scope.id;
    case "etage": return lineage.etageId === scope.id;
    case "zone": return lineage.zoneId === scope.id;
    case "piece": return lineage.pieceId === scope.id;
  }
}

export type GalleryFilters = {
  /** État documenté (existant / corrigé / projeté / tel que construit) ; `null` = tous. */
  readonly etat?: VersionType | null;
  readonly source?: PhotoSource | null;
  /** Seulement les photos annotées. */
  readonly annotees?: boolean;
  /** Seulement les photos commentées. */
  readonly commentees?: boolean;
  /** Prises (ou déposées) depuis moins de N jours. */
  readonly recentesJours?: number | null;
};

/** Forme minimale d'une entrée de galerie (voir `PhotoEntry` du service média). */
export type GalleryItem = {
  readonly media: {
    readonly createdAt: string;
    readonly commentaire?: string | null;
    readonly etatDocumente?: VersionType;
    readonly metadata: { readonly priseLe?: string | null; readonly source?: PhotoSource };
  };
  readonly anchors: readonly { readonly donnees: { readonly ancre: Ancre; readonly ordre?: number } }[];
  readonly annotations: readonly unknown[];
};

export function photoDate(item: GalleryItem): string {
  return item.media.metadata.priseLe ?? item.media.createdAt;
}

/**
 * Photos d'une portée, filtrées, triées par date de prise de vue décroissante (puis ordre).
 * `now` est injecté pour des tests déterministes.
 */
export function selectGallery<T extends GalleryItem>(
  items: readonly T[], structure: ReleveStructure, elements: readonly ReleveElement[], scope: GalleryScope,
  filters: GalleryFilters = {}, now: Date = new Date(),
): T[] {
  const index = indexStructure(structure, elements);
  const since = filters.recentesJours ? now.getTime() - filters.recentesJours * 86_400_000 : null;
  return items
    .filter((item) => scope.kind === "releve" || item.anchors.some((anchor) => inScope(lineageOf(anchor.donnees.ancre, index), scope)))
    .filter((item) => !filters.etat || (item.media.etatDocumente ?? "initial") === filters.etat)
    .filter((item) => !filters.source || item.media.metadata.source === filters.source)
    .filter((item) => !filters.annotees || item.annotations.length > 0)
    .filter((item) => !filters.commentees || Boolean(item.media.commentaire))
    .filter((item) => since === null || Date.parse(photoDate(item)) >= since)
    .sort((a, b) => photoDate(b).localeCompare(photoDate(a)) || (a.anchors[0]?.donnees.ordre ?? 0) - (b.anchors[0]?.donnees.ordre ?? 0));
}

/** Nombre de photos par nœud (badges de navigation), en un seul passage. */
export function countByNode(items: readonly GalleryItem[], structure: ReleveStructure, elements: readonly ReleveElement[]): Map<string, number> {
  const index = indexStructure(structure, elements);
  const counts = new Map<string, number>();
  for (const item of items) {
    const seen = new Set<string>();
    for (const anchor of item.anchors) {
      const lineage = lineageOf(anchor.donnees.ancre, index);
      for (const id of [lineage.chantierId, lineage.batimentId, lineage.etageId, lineage.zoneId, lineage.pieceId]) if (id) seen.add(id);
    }
    for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Page de galerie : seules ces vignettes sont signées et chargées (mémoire bornée). */
export const GALLERY_PAGE_SIZE = 48;
export function paginate<T>(items: readonly T[], pages: number, pageSize = GALLERY_PAGE_SIZE): { visible: T[]; remaining: number } {
  const visible = items.slice(0, Math.max(1, pages) * pageSize);
  return { visible, remaining: items.length - visible.length };
}

/** Libellé de la portée pour l'en-tête de galerie. */
export function scopeLabel(scope: GalleryScope, structure: ReleveStructure): string {
  if (scope.kind === "releve") return structure.releve.nom;
  const rows: Record<Exclude<GalleryScopeKind, "releve">, readonly { id: string; nom: string }[]> = {
    chantier: structure.chantiers, batiment: structure.batiments, etage: structure.etages, zone: structure.zones, piece: structure.pieces,
  };
  return rows[scope.kind].find((row) => row.id === scope.id)?.nom ?? "(retiré)";
}
