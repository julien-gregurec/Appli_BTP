/**
 * Règles terrain du Lot 3 — fonctions pures, sans dépendance, partagées par le web, le
 * WebView Capacitor et un futur client hors ligne :
 *
 * - fil d'Ariane (« Projet › Bâtiment A › R+1 › Zone Est › Bureau 12 ») ;
 * - fratries, réordonnancement (monter / descendre) ;
 * - impact d'une suppression (confirmation explicite), corbeille des nœuds ;
 * - plan de duplication (miroir de `tools_releve_dupliquer_noeud`) : sous-structure seule,
 *   jamais d'élément ni de média ;
 * - recherche insensible à la casse et aux accents (miroir de `tools_releve_normaliser`) ;
 * - filtres de la liste des relevés (actifs, archivés, récents, corbeille).
 */

import type { EtageId, PieceId, ZoneId } from "./ids";
import { descendantsOf, niveauLabel, type StructureNodeRef } from "./hierarchy";
import type { Batiment, Chantier, Etage, EtageTypeNiveau, Piece, Releve, ReleveStructure, Zone } from "./model";
import type { StructureKind } from "./repository";
import { typeNiveauParDefaut } from "./validation";

const alive = <T extends { deletedAt: string | null }>(items: readonly T[]) => items.filter((item) => !item.deletedAt);
const byOrdre = <T extends { ordre: number; nom: string }>(a: T, b: T) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr");

// ── Libellés ──────────────────────────────────────────────────────────────────

export const ETAGE_TYPE_NIVEAU_LABELS: Record<EtageTypeNiveau, string> = {
  sous_sol: "Sous-sol", rdc: "Rez-de-chaussée", etage: "Étage", entresol: "Entresol", mezzanine: "Mezzanine",
  combles: "Combles", toiture: "Toiture / terrasse", autre: "Autre",
};

/** Nature effective d'un étage (déduite du niveau pour les étages antérieurs au Lot 3). */
export function etageTypeNiveau(etage: Pick<Etage, "niveau" | "typeNiveau">): EtageTypeNiveau {
  return etage.typeNiveau ?? typeNiveauParDefaut(etage.niveau);
}

/** Libellé court du niveau : « Sous-sol », « RDC », « R+1 », « Combles »… */
export function etageNiveauLabel(etage: Pick<Etage, "niveau" | "typeNiveau">): string {
  const type = etageTypeNiveau(etage);
  if (type === "rdc" || type === "etage") return niveauLabel(etage.niveau);
  if (type === "sous_sol") return etage.niveau === -1 ? "Sous-sol" : `Sous-sol ${niveauLabel(etage.niveau)}`;
  return ETAGE_TYPE_NIVEAU_LABELS[type];
}

/** Suggestions de saisie rapide d'un étage : niveau suivant, combles, sous-sol. */
export function suggestEtages(etages: readonly Pick<Etage, "niveau" | "deletedAt">[]): Array<{ nom: string; niveau: number; typeNiveau: EtageTypeNiveau }> {
  const niveaux = alive(etages).map((etage) => etage.niveau);
  const max = niveaux.length ? Math.max(...niveaux) : -1;
  const min = niveaux.length ? Math.min(...niveaux) : 1;
  const suivant = max + 1;
  const suggestions = [
    { nom: niveauLabel(suivant), niveau: suivant, typeNiveau: typeNiveauParDefaut(suivant) },
    { nom: "Combles", niveau: suivant, typeNiveau: "combles" as const },
    { nom: "Sous-sol", niveau: Math.min(min - 1, -1), typeNiveau: "sous_sol" as const },
  ];
  return suggestions.filter((item) => item.niveau >= -10 && item.niveau <= 200);
}

// ── Fil d'Ariane ──────────────────────────────────────────────────────────────

export type BreadcrumbLevel = "projet" | StructureKind;
export type BreadcrumbItem = { readonly level: BreadcrumbLevel; readonly id: string; readonly label: string };

/**
 * Chemin complet d'un nœud, du projet au nœud lui-même. Une pièce sans zone saute le niveau
 * zone ; un nœud introuvable renvoie le seul projet.
 */
export function breadcrumbFor(structure: ReleveStructure, ref: StructureNodeRef | null): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ level: "projet", id: structure.releve.id, label: structure.releve.nom }];
  if (!ref) return items;
  const find = <T extends { id: string }>(list: readonly T[], id: string | null | undefined) => (id ? list.find((item) => item.id === id) : undefined);
  let piece: Piece | undefined; let zone: Zone | undefined; let etage: Etage | undefined; let batiment: Batiment | undefined; let chantier: Chantier | undefined;
  if (ref.kind === "piece") { piece = find(structure.pieces, ref.id); zone = find(structure.zones, piece?.zoneId); etage = find(structure.etages, piece?.etageId); }
  if (ref.kind === "zone") { zone = find(structure.zones, ref.id); etage = find(structure.etages, zone?.etageId); }
  if (ref.kind === "etage") etage = find(structure.etages, ref.id);
  if (ref.kind === "batiment") batiment = find(structure.batiments, ref.id);
  if (ref.kind === "chantier") chantier = find(structure.chantiers, ref.id);
  batiment ??= find(structure.batiments, etage?.batimentId);
  chantier ??= find(structure.chantiers, batiment?.chantierId);
  if (chantier) items.push({ level: "chantier", id: chantier.id, label: chantier.nom });
  if (batiment) items.push({ level: "batiment", id: batiment.id, label: batiment.nom });
  if (etage) items.push({ level: "etage", id: etage.id, label: etage.nom });
  if (zone && !zone.deletedAt) items.push({ level: "zone", id: zone.id, label: zone.nom });
  if (piece) items.push({ level: "piece", id: piece.id, label: piece.nom });
  return items;
}

export function breadcrumbText(items: readonly BreadcrumbItem[]): string {
  return items.map((item) => item.label).join(" › ");
}

// ── Fratries et ordre ─────────────────────────────────────────────────────────

type OrderedNode = { id: string; ordre: number; nom: string; deletedAt: string | null };

/** Parent d'ordonnancement : chantier → relevé, bâtiment → chantier, étage → bâtiment, zone et pièce → étage. */
export function parentKeyOf(structure: ReleveStructure, kind: StructureKind, id: string): string | null {
  const node = nodesOf(structure, kind).find((item) => item.id === id) as unknown as Record<string, string> | undefined;
  if (!node) return null;
  return node[{ chantier: "releveId", batiment: "chantierId", etage: "batimentId", zone: "etageId", piece: "etageId" }[kind]] ?? null;
}

export function nodesOf(structure: ReleveStructure, kind: StructureKind): readonly OrderedNode[] {
  return ({ chantier: structure.chantiers, batiment: structure.batiments, etage: structure.etages, zone: structure.zones, piece: structure.pieces } as Record<StructureKind, readonly OrderedNode[]>)[kind];
}

/**
 * Frères actifs d'un nœud dans l'ordre affiché. Les étages sont triés par niveau (le niveau
 * EST leur ordre physique) ; les autres niveaux par `ordre`, puis par nom.
 */
export function siblingsOf(structure: ReleveStructure, kind: StructureKind, id: string): OrderedNode[] {
  const parent = parentKeyOf(structure, kind, id);
  const key = { chantier: "releveId", batiment: "chantierId", etage: "batimentId", zone: "etageId", piece: "etageId" }[kind];
  const siblings = alive(nodesOf(structure, kind)).filter((item) => (item as unknown as Record<string, string>)[key] === parent);
  if (kind === "etage") return [...(siblings as unknown as Etage[])].sort((a, b) => a.niveau - b.niveau || byOrdre(a, b));
  return [...siblings].sort(byOrdre);
}

/** Nouvel ordre complet d'une fratrie après avoir déplacé `id` de `delta` rangs (borné). */
export function moveInOrder(ids: readonly string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = Math.max(0, Math.min(ids.length - 1, from + delta));
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

// ── Suppression maîtrisée ─────────────────────────────────────────────────────

export type DeletionImpact = { batiments: number; etages: number; zones: number; pieces: number; piecesDetachees: number };

/**
 * Ce que retire la suppression douce d'un nœud (affiché avant confirmation). Une zone ne
 * retire pas ses pièces : elles redeviennent « hors zone » (`piecesDetachees`).
 */
export function deletionImpact(structure: ReleveStructure, ref: StructureNodeRef): DeletionImpact {
  const descendants = descendantsOf(structure, ref);
  const count = (ids: readonly string[], list: readonly { id: string; deletedAt: string | null }[]) => ids.filter((id) => list.some((item) => item.id === id && !item.deletedAt)).length;
  return {
    batiments: count(descendants.batiments, structure.batiments),
    etages: count(descendants.etages, structure.etages),
    zones: count(descendants.zones, structure.zones),
    pieces: count(descendants.pieces, structure.pieces),
    piecesDetachees: ref.kind === "zone" ? alive(structure.pieces).filter((piece) => piece.zoneId === ref.id).length : 0,
  };
}

export function deletionImpactText(impact: DeletionImpact): string {
  const parts = [
    impact.batiments && `${impact.batiments} bâtiment(s)`, impact.etages && `${impact.etages} étage(s)`,
    impact.zones && `${impact.zones} zone(s)`, impact.pieces && `${impact.pieces} pièce(s)`,
  ].filter(Boolean);
  const detached = impact.piecesDetachees ? ` ${impact.piecesDetachees} pièce(s) resteront sur l'étage, hors zone.` : "";
  return (parts.length ? `Sont aussi retirés : ${parts.join(", ")}.` : "Aucun élément dépendant.") + detached;
}

export type DeletedNode = { kind: StructureKind; id: string; nom: string; deletedAt: string; restorable: boolean };

/**
 * Corbeille d'un relevé : nœuds supprimés « racines » (ceux dont le parent est actif), les
 * seuls restaurables directement — leurs descendants reviennent avec eux (même horodatage).
 */
export function deletedNodes(structure: ReleveStructure): DeletedNode[] {
  const isAlive = (list: readonly { id: string; deletedAt: string | null }[], id: string | null) => Boolean(id && list.some((item) => item.id === id && !item.deletedAt));
  const result: DeletedNode[] = [];
  const push = (kind: StructureKind, item: { id: string; nom: string; deletedAt: string | null }, parentAlive: boolean) => {
    if (item.deletedAt) result.push({ kind, id: item.id, nom: item.nom, deletedAt: item.deletedAt, restorable: parentAlive });
  };
  for (const item of structure.chantiers) push("chantier", item, true);
  for (const item of structure.batiments) if (isAlive(structure.chantiers, item.chantierId)) push("batiment", item, true);
  for (const item of structure.etages) if (isAlive(structure.batiments, item.batimentId)) push("etage", item, true);
  for (const item of structure.zones) if (isAlive(structure.etages, item.etageId)) push("zone", item, true);
  for (const item of structure.pieces) if (isAlive(structure.etages, item.etageId)) push("piece", item, true);
  return result.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

// ── Duplication ───────────────────────────────────────────────────────────────

export const DUPLICABLE_KINDS = ["batiment", "etage", "zone", "piece"] as const;
export type DuplicableKind = (typeof DUPLICABLE_KINDS)[number];

export type DuplicationPlan = {
  readonly rootId: string;
  readonly batiments: Batiment[];
  readonly etages: Etage[];
  readonly zones: Zone[];
  readonly pieces: Piece[];
  /** Toujours 0 : les éléments (murs, mesures, photos…) ne sont jamais dupliqués. */
  readonly elementsCopies: 0;
  readonly mediasCopies: 0;
};

/**
 * Plan de duplication, miroir exact de `tools_releve_dupliquer_noeud` : copie de la
 * sous-structure (les métadonnées seront réécrites par le dépôt), copie placée en fin de
 * fratrie, étage copié au niveau suivant, pièces copiées « à relever » sans commentaire.
 */
export function planDuplication(
  structure: ReleveStructure, kind: DuplicableKind, id: string, options: { newId: string; nom?: string | null; uuid: () => string },
): DuplicationPlan | null {
  const plan = { rootId: options.newId, batiments: [] as Batiment[], etages: [] as Etage[], zones: [] as Zone[], pieces: [] as Piece[], elementsCopies: 0 as const, mediasCopies: 0 as const };
  const nom = options.nom?.trim() || null;
  const copie = (value: string) => `${value.slice(0, 111)} (copie)`;
  const endOf = (list: readonly OrderedNode[], match: (item: OrderedNode) => boolean) => alive(list).filter(match).reduce((max, item) => Math.max(max, item.ordre + 1), 0);
  const freshPiece = (piece: Piece, patch: Partial<Piece>): Piece => ({ ...piece, id: options.uuid() as PieceId, commentaire: null, statut: "a_relever", surfaceCalculeeMm2: null, volumeCalculeMm3: null, deletedAt: null, ...patch });
  const copyEtageContent = (map: Map<string, string>) => {
    const zoneMap = new Map<string, string>();
    for (const zone of alive(structure.zones).filter((item) => map.has(item.etageId))) {
      const zoneId = options.uuid();
      zoneMap.set(zone.id, zoneId);
      plan.zones.push({ ...zone, id: zoneId as ZoneId, etageId: map.get(zone.etageId) as EtageId, deletedAt: null });
    }
    for (const piece of alive(structure.pieces).filter((item) => map.has(item.etageId))) {
      plan.pieces.push(freshPiece(piece, { etageId: map.get(piece.etageId) as EtageId, zoneId: piece.zoneId && zoneMap.has(piece.zoneId) ? zoneMap.get(piece.zoneId) as ZoneId : null }));
    }
  };

  if (kind === "batiment") {
    const source = alive(structure.batiments).find((item) => item.id === id);
    if (!source) return null;
    plan.batiments.push({ ...source, id: options.newId as Batiment["id"], nom: nom ?? copie(source.nom), ordre: endOf(structure.batiments, (item) => (item as unknown as Batiment).chantierId === source.chantierId), deletedAt: null });
    const map = new Map<string, string>();
    for (const etage of alive(structure.etages).filter((item) => item.batimentId === id).sort((a, b) => a.niveau - b.niveau || a.ordre - b.ordre)) {
      const etageId = options.uuid();
      map.set(etage.id, etageId);
      plan.etages.push({ ...etage, id: etageId as EtageId, batimentId: options.newId as Batiment["id"], deletedAt: null });
    }
    copyEtageContent(map);
    return plan;
  }
  if (kind === "etage") {
    const source = alive(structure.etages).find((item) => item.id === id);
    if (!source) return null;
    const freres = alive(structure.etages).filter((item) => item.batimentId === source.batimentId);
    const niveau = Math.max(...freres.map((item) => item.niveau)) + 1;
    if (niveau > 200) return null;
    const type = source.typeNiveau ?? typeNiveauParDefaut(source.niveau);
    plan.etages.push({
      ...source, id: options.newId as EtageId, nom: nom ?? (niveau > 0 ? `R+${niveau}` : copie(source.nom)), niveau, altitudeMm: null,
      ordre: endOf(structure.etages, (item) => (item as unknown as Etage).batimentId === source.batimentId),
      typeNiveau: niveau > 0 && (type === "rdc" || type === "sous_sol") ? "etage" : source.typeNiveau, deletedAt: null,
    });
    copyEtageContent(new Map([[source.id, options.newId]]));
    return plan;
  }
  if (kind === "zone") {
    const source = alive(structure.zones).find((item) => item.id === id);
    if (!source) return null;
    plan.zones.push({ ...source, id: options.newId as ZoneId, nom: nom ?? copie(source.nom), ordre: endOf(structure.zones, (item) => (item as unknown as Zone).etageId === source.etageId), deletedAt: null });
    let ordre = endOf(structure.pieces, (item) => (item as unknown as Piece).etageId === source.etageId);
    for (const piece of alive(structure.pieces).filter((item) => item.zoneId === id).sort(byOrdre)) {
      plan.pieces.push(freshPiece(piece, { zoneId: options.newId as ZoneId, ordre: ordre++ }));
    }
    return plan;
  }
  const source = alive(structure.pieces).find((item) => item.id === id);
  if (!source) return null;
  const zoneAlive = source.zoneId && alive(structure.zones).some((zone) => zone.id === source.zoneId);
  plan.pieces.push(freshPiece(source, {
    id: options.newId as PieceId, nom: nom ?? copie(source.nom), zoneId: zoneAlive ? source.zoneId : null,
    ordre: endOf(structure.pieces, (item) => (item as unknown as Piece).etageId === source.etageId),
  }));
  return plan;
}

// ── Recherche ─────────────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  à: "a", â: "a", ä: "a", á: "a", ã: "a", å: "a", ç: "c", é: "e", è: "e", ê: "e", ë: "e", í: "i", ì: "i", î: "i", ï: "i",
  ñ: "n", ó: "o", ò: "o", ô: "o", ö: "o", õ: "o", ú: "u", ù: "u", û: "u", ü: "u", ý: "y", ÿ: "y", œ: "o", æ: "a",
};

/** Miroir de `tools_releve_normaliser` : minuscules, accents usuels du français retirés. */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ]/g, (char) => ACCENTS[char] ?? char);
}

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
export const SEARCH_ENTITIES = ["releve", "chantier", "batiment", "etage", "zone", "piece"] as const;
export type SearchEntity = (typeof SEARCH_ENTITIES)[number];

/** Résultat de recherche : de quoi construire le lien de navigation, sans autre donnée. */
export type SearchHit = {
  readonly releveId: string; readonly releveNom: string; readonly entite: SearchEntity; readonly entiteId: string; readonly libelle: string;
  readonly chantierId: string | null; readonly batimentId: string | null; readonly etageId: string | null; readonly zoneId: string | null;
  readonly pieceId: string | null; readonly updatedAt: string;
};

export function isSearchable(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= SEARCH_MIN_LENGTH && query.length <= SEARCH_MAX_LENGTH;
}

/** Recherche dans UNE structure chargée (même règles que la RPC `tools_releve_rechercher`). */
export function searchStructure(structure: ReleveStructure, query: string): SearchHit[] {
  if (!isSearchable(query)) return [];
  const needle = normalizeSearch(query.trim());
  const match = (...values: Array<string | null | undefined>) => normalizeSearch(values.filter(Boolean).join(" ")).includes(needle);
  const releve = structure.releve;
  const base = { releveId: releve.id, releveNom: releve.nom };
  const batiments = new Map(structure.batiments.map((item) => [item.id as string, item]));
  const etages = new Map(structure.etages.map((item) => [item.id as string, item]));
  const hits: SearchHit[] = [];
  const hit = (entite: SearchEntity, id: string, libelle: string, path: Partial<Pick<SearchHit, "chantierId" | "batimentId" | "etageId" | "zoneId" | "pieceId">>, updatedAt: string) =>
    hits.push({ ...base, entite, entiteId: id, libelle, chantierId: null, batimentId: null, etageId: null, zoneId: null, pieceId: null, ...path, updatedAt });
  if (releve.deletedAt) return [];
  if (match(releve.nom, releve.reference, releve.chantier.nom, releve.chantier.ville, releve.client.nom)) hit("releve", releve.id, releve.nom, {}, releve.updatedAt);
  for (const item of alive(structure.chantiers)) if (match(item.nom, item.reference, item.ville, item.clientNom)) hit("chantier", item.id, item.nom, { chantierId: item.id }, item.updatedAt);
  for (const item of alive(structure.batiments)) if (match(item.nom)) hit("batiment", item.id, item.nom, { chantierId: item.chantierId, batimentId: item.id }, item.updatedAt);
  for (const item of alive(structure.etages)) {
    if (!match(item.nom)) continue;
    hit("etage", item.id, item.nom, { chantierId: batiments.get(item.batimentId)?.chantierId ?? null, batimentId: item.batimentId, etageId: item.id }, item.updatedAt);
  }
  for (const item of alive(structure.zones)) {
    if (!match(item.nom)) continue;
    const etage = etages.get(item.etageId);
    hit("zone", item.id, item.nom, { chantierId: etage ? batiments.get(etage.batimentId)?.chantierId ?? null : null, batimentId: etage?.batimentId ?? null, etageId: item.etageId, zoneId: item.id }, item.updatedAt);
  }
  for (const item of alive(structure.pieces)) {
    if (!match(item.nom)) continue;
    const etage = etages.get(item.etageId);
    hit("piece", item.id, item.nom, { chantierId: etage ? batiments.get(etage.batimentId)?.chantierId ?? null : null, batimentId: etage?.batimentId ?? null, etageId: item.etageId, zoneId: item.zoneId, pieceId: item.id }, item.updatedAt);
  }
  const rank = (entite: SearchEntity) => SEARCH_ENTITIES.indexOf(entite);
  return hits.sort((a, b) => rank(a.entite) - rank(b.entite) || b.updatedAt.localeCompare(a.updatedAt));
}

// ── Filtres de la liste ───────────────────────────────────────────────────────

export const RELEVE_FILTERS = ["actifs", "archives", "recents", "corbeille"] as const;
export type ReleveFilter = (typeof RELEVE_FILTERS)[number];
export const RELEVE_FILTER_LABELS: Record<ReleveFilter, string> = { actifs: "Actifs", archives: "Archivés", recents: "Récents", corbeille: "Corbeille" };
/** Fenêtre « récents » : modifiés dans les 30 derniers jours. */
export const RELEVE_RECENT_DAYS = 30;

/**
 * - `actifs` : non supprimés, statut ≠ archivé ; `archives` : statut archivé (non supprimés) ;
 * - `recents` : non supprimés, modifiés depuis {@link RELEVE_RECENT_DAYS} jours ;
 * - `corbeille` : supprimés (restaurables).
 * Tri : plus récemment modifié d'abord.
 */
export function filterReleves(releves: readonly Releve[], filter: ReleveFilter, now: Date = new Date()): Releve[] {
  const limit = now.getTime() - RELEVE_RECENT_DAYS * 86_400_000;
  const keep = (releve: Releve) => {
    if (filter === "corbeille") return Boolean(releve.deletedAt);
    if (releve.deletedAt) return false;
    if (filter === "archives") return releve.statut === "archive";
    if (filter === "recents") return Date.parse(releve.updatedAt) >= limit;
    return releve.statut !== "archive";
  };
  return releves.filter(keep).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Filtre texte local de la liste (nom, référence, site, client). */
export function matchReleve(releve: Releve, query: string): boolean {
  const needle = normalizeSearch(query.trim());
  if (!needle) return true;
  return normalizeSearch([releve.nom, releve.reference, releve.chantier.nom, releve.chantier.ville, releve.client.nom].filter(Boolean).join(" ")).includes(needle);
}

// ── Activité ──────────────────────────────────────────────────────────────────

export const ACTIVITY_ACTIONS = [
  "creation", "modification", "suppression", "restauration", "partage", "transfert", "version",
  "renommage", "deplacement", "reordonnancement", "duplication",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export const ACTIVITY_ENTITIES = ["releve", "chantier", "batiment", "etage", "zone", "piece", "element", "media", "version"] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export type ActivityEntry = {
  readonly id: number; readonly entite: ActivityEntity; readonly entiteId: string; readonly action: ActivityAction;
  readonly champs: readonly string[]; readonly auteurId: string | null; readonly createdAt: string;
  readonly details: Readonly<Record<string, unknown>> | null;
};

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  creation: "Création", modification: "Modification", suppression: "Suppression", restauration: "Restauration", partage: "Partage",
  transfert: "Transfert", version: "Version figée", renommage: "Renommage", deplacement: "Déplacement", reordonnancement: "Nouvel ordre",
  duplication: "Duplication",
};
export const ACTIVITY_ENTITY_LABELS: Record<ActivityEntity, string> = {
  releve: "Relevé", chantier: "Chantier", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce", element: "Élément", media: "Média", version: "Version",
};

/** Nom lisible de l'entité d'une ligne de journal (nom actuel, supprimés compris). */
export function activityEntityName(structure: ReleveStructure, entry: Pick<ActivityEntry, "entite" | "entiteId">): string | null {
  if (entry.entite === "releve") return structure.releve.nom;
  const lists: Partial<Record<ActivityEntity, readonly { id: string; nom: string }[]>> = {
    chantier: structure.chantiers, batiment: structure.batiments, etage: structure.etages, zone: structure.zones, piece: structure.pieces,
  };
  return lists[entry.entite]?.find((item) => item.id === entry.entiteId)?.nom ?? null;
}

