/**
 * Rattachement des photos, repères et annotations sur photo (Lot 4).
 *
 * Une photo n'est jamais « posée » dans le vide : un `PhotoAnchor` (élément `photo_anchor`)
 * la rattache à UNE cible du relevé. Les colonnes SQL `etage_id` / `piece_id` de l'élément
 * sont déduites de la cible, pour que la cascade de suppression douce d'un étage ou d'une
 * pièce emporte ses photos, et que les listes par étage / pièce soient indexées.
 *
 * Les annotations dessinées (texte, flèche, cercle) sont des éléments `annotation` ancrés sur
 * le `PhotoAnchor`, en coordonnées normalisées : l'image d'origine n'est **jamais modifiée**
 * (la preuve reste intacte, l'annotation est une couche superposée, retirable et journalisée).
 */

import type { ElementId, EtageId, PieceId } from "./ids";
import type { Ancre, AnnotationDonnees, EntityRef, PhotoAnchorDonnees, PhotoRepere, ReleveElement, ReleveStructure } from "./model";
import { RELEVE_LIMITS, type PHOTO_ANNOTATION_COULEURS } from "./validation";

export const PHOTO_TARGET_KINDS = ["releve", "batiment", "etage", "zone", "piece", "mur", "equipement", "plan"] as const;
export type PhotoTargetKind = (typeof PHOTO_TARGET_KINDS)[number];
export const PHOTO_TARGET_LABELS: Record<PhotoTargetKind, string> = {
  releve: "Relevé", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce", mur: "Mur", equipement: "Équipement", plan: "Point du plan",
};

export type PhotoTarget =
  | { readonly kind: "releve" }
  | { readonly kind: "batiment" | "etage" | "zone" | "piece" | "mur" | "equipement"; readonly id: string }
  | { readonly kind: "plan"; readonly etageId: string; readonly x: number; readonly y: number };

export type PhotoPlacement = { readonly ancre: Ancre; readonly etageId: EtageId | null; readonly pieceId: PieceId | null };

export class PhotoTargetError extends Error {
  constructor(message: string) { super(message); this.name = "PhotoTargetError"; }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Ancre + colonnes de rattachement pour une cible. Refuse une cible absente, supprimée ou
 * d'un autre relevé : l'erreur est levée avant tout envoi.
 */
export function resolvePhotoPlacement(target: PhotoTarget, structure: ReleveStructure, elements: readonly ReleveElement[]): PhotoPlacement {
  const alive = <T extends { id: string; deletedAt: string | null }>(rows: readonly T[], id: string, label: string): T => {
    const row = rows.find((candidate) => candidate.id === id && !candidate.deletedAt);
    if (!row) throw new PhotoTargetError(`${label} introuvable dans ce relevé.`);
    return row;
  };
  const ref = (kind: EntityRef["kind"], id: string): Ancre => ({ kind: "entite", ref: { kind, id } });
  switch (target.kind) {
    case "releve":
      return { ancre: ref("releve", structure.releve.id), etageId: null, pieceId: null };
    case "batiment":
      return { ancre: ref("batiment", alive(structure.batiments, target.id, "Bâtiment").id), etageId: null, pieceId: null };
    case "etage": {
      const etage = alive(structure.etages, target.id, "Étage");
      return { ancre: ref("etage", etage.id), etageId: etage.id, pieceId: null };
    }
    case "zone": {
      const zone = alive(structure.zones, target.id, "Zone");
      return { ancre: ref("zone", zone.id), etageId: zone.etageId, pieceId: null };
    }
    case "piece": {
      const piece = alive(structure.pieces, target.id, "Pièce");
      return { ancre: ref("piece", piece.id), etageId: piece.etageId, pieceId: piece.id };
    }
    case "mur":
    case "equipement": {
      const element = alive(elements, target.id, target.kind === "mur" ? "Mur" : "Équipement");
      if (element.type !== target.kind) throw new PhotoTargetError(`L'élément choisi n'est pas un ${target.kind === "mur" ? "mur" : "équipement"}.`);
      return { ancre: ref("element", element.id), etageId: element.etageId, pieceId: element.pieceId };
    }
    case "plan": {
      const etage = alive(structure.etages, target.etageId, "Étage");
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new PhotoTargetError("Position sur le plan invalide.");
      return { ancre: { kind: "plan", etageId: etage.id, x: clamp01(target.x), y: clamp01(target.y) }, etageId: etage.id, pieceId: null };
    }
  }
}

/** Libellé lisible d'une ancre (« Pièce · Séjour », « Point du plan · RDC (42 %, 18 %) »). */
export function describeAnchor(ancre: Ancre, structure: ReleveStructure, elements: readonly ReleveElement[]): string {
  const name = <T extends { id: string; nom: string }>(rows: readonly T[], id: string) => rows.find((row) => row.id === id)?.nom ?? "(retiré)";
  if (ancre.kind === "plan") return `${PHOTO_TARGET_LABELS.plan} · ${name(structure.etages, ancre.etageId)} (${Math.round(ancre.x * 100)} %, ${Math.round(ancre.y * 100)} %)`;
  if (ancre.kind === "point") return `Point · ${name(structure.etages, ancre.etageId)}`;
  const { kind, id } = ancre.ref;
  switch (kind) {
    case "releve": return PHOTO_TARGET_LABELS.releve;
    case "batiment": return `${PHOTO_TARGET_LABELS.batiment} · ${name(structure.batiments, id)}`;
    case "etage": return `${PHOTO_TARGET_LABELS.etage} · ${name(structure.etages, id)}`;
    case "zone": return `${PHOTO_TARGET_LABELS.zone} · ${name(structure.zones, id)}`;
    case "piece": return `${PHOTO_TARGET_LABELS.piece} · ${name(structure.pieces, id)}`;
    case "element": {
      const element = elements.find((row) => row.id === id);
      if (!element) return "Élément (retiré)";
      const libelle = element.type === "equipement" ? (element as ReleveElement<"equipement">).donnees.libelle : null;
      return element.type === "mur" ? "Mur" : element.type === "equipement" ? `${PHOTO_TARGET_LABELS.equipement} · ${libelle}` : "Élément";
    }
  }
}

/** Cible d'une ancre existante (pour pré-remplir un changement de rattachement). */
export function targetOfAnchor(ancre: Ancre, elements: readonly ReleveElement[]): PhotoTarget | null {
  if (ancre.kind === "plan") return { kind: "plan", etageId: ancre.etageId, x: ancre.x, y: ancre.y };
  if (ancre.kind === "point") return null;
  const { kind, id } = ancre.ref;
  if (kind === "releve") return { kind: "releve" };
  if (kind === "element") {
    const element = elements.find((row) => row.id === id);
    return element && (element.type === "mur" || element.type === "equipement") ? { kind: element.type, id } : null;
  }
  return { kind, id };
}

// ── Repères posés sur la photo ────────────────────────────────────────────────

export type RepereDraft = { x: number; y: number; label: string; cible?: EntityRef | null };

/** Ajoute un repère en dernière position ; coordonnées bornées à [0, 1]. */
export function addRepere(reperes: readonly PhotoRepere[], draft: RepereDraft, id: string): PhotoRepere[] {
  if (reperes.length >= RELEVE_LIMITS.reperesMax) throw new PhotoTargetError(`${RELEVE_LIMITS.reperesMax} repères maximum par photo.`);
  const label = draft.label.trim();
  if (!label) throw new PhotoTargetError("Le repère doit porter un libellé.");
  const ordre = reperes.reduce((max, repere) => Math.max(max, repere.ordre + 1), 0);
  return [...sortReperes(reperes), { id, x: clamp01(draft.x), y: clamp01(draft.y), label: label.slice(0, RELEVE_LIMITS.labelRepere), ordre, cible: draft.cible ?? null }];
}

export function sortReperes(reperes: readonly PhotoRepere[]): PhotoRepere[] {
  return [...reperes].sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
}

/** Renumérote 0..n-1 dans l'ordre courant (après suppression ou déplacement). */
function renumber(reperes: readonly PhotoRepere[]): PhotoRepere[] {
  return reperes.map((repere, index) => (repere.ordre === index ? repere : { ...repere, ordre: index }));
}

export function removeRepere(reperes: readonly PhotoRepere[], id: string): PhotoRepere[] {
  return renumber(sortReperes(reperes).filter((repere) => repere.id !== id));
}

export function moveRepere(reperes: readonly PhotoRepere[], id: string, delta: -1 | 1): PhotoRepere[] {
  const sorted = sortReperes(reperes);
  const index = sorted.findIndex((repere) => repere.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sorted.length) return renumber(sorted);
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  return renumber(sorted);
}

export function updateRepere(reperes: readonly PhotoRepere[], id: string, patch: Partial<Pick<PhotoRepere, "x" | "y" | "label" | "cible">>): PhotoRepere[] {
  return sortReperes(reperes).map((repere) => {
    if (repere.id !== id) return repere;
    const label = patch.label !== undefined ? patch.label.trim().slice(0, RELEVE_LIMITS.labelRepere) : repere.label;
    if (!label) throw new PhotoTargetError("Le repère doit porter un libellé.");
    return {
      ...repere, label,
      x: patch.x !== undefined ? clamp01(patch.x) : repere.x,
      y: patch.y !== undefined ? clamp01(patch.y) : repere.y,
      cible: patch.cible !== undefined ? patch.cible : repere.cible,
    };
  });
}

// ── Annotations dessinées sur la photo ────────────────────────────────────────

export const PHOTO_ANNOTATION_FORMES = ["texte", "fleche", "cercle"] as const;
export type PhotoAnnotationForme = (typeof PHOTO_ANNOTATION_FORMES)[number];
export type PhotoAnnotationCouleur = (typeof PHOTO_ANNOTATION_COULEURS)[number];

export type PhotoAnnotationGeometrie =
  | { readonly espace: "photo"; readonly x: number; readonly y: number; readonly couleur: PhotoAnnotationCouleur }
  | { readonly espace: "photo"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly couleur: PhotoAnnotationCouleur }
  | { readonly espace: "photo"; readonly cx: number; readonly cy: number; readonly r: number; readonly couleur: PhotoAnnotationCouleur };

export type PhotoAnnotationDraft =
  | { forme: "texte"; x: number; y: number; texte: string; couleur?: PhotoAnnotationCouleur }
  | { forme: "fleche"; x1: number; y1: number; x2: number; y2: number; texte?: string; couleur?: PhotoAnnotationCouleur }
  | { forme: "cercle"; cx: number; cy: number; r: number; texte?: string; couleur?: PhotoAnnotationCouleur };

/**
 * Charge d'un élément `annotation` dessiné sur une photo. `r` (cercle) est une fraction du
 * plus petit côté de l'image. Une flèche ou un cercle dégénérés sont refusés.
 */
export function buildPhotoAnnotation(anchorId: ElementId, draft: PhotoAnnotationDraft): AnnotationDonnees {
  const couleur = draft.couleur ?? "rouge";
  const ancre: Ancre = { kind: "entite", ref: { kind: "element", id: anchorId } };
  const texte = (draft.texte ?? "").trim().slice(0, RELEVE_LIMITS.texteAnnotation);
  if (draft.forme === "texte") {
    if (!texte) throw new PhotoTargetError("Saisissez le texte de l'annotation.");
    return { ancre, texte, forme: "texte", geometrie: { espace: "photo", x: clamp01(draft.x), y: clamp01(draft.y), couleur }, mediaAudioId: null };
  }
  if (draft.forme === "fleche") {
    const [x1, y1, x2, y2] = [draft.x1, draft.y1, draft.x2, draft.y2].map(clamp01);
    if (Math.hypot(x2 - x1, y2 - y1) < 0.01) throw new PhotoTargetError("Flèche trop courte : tracez-la d'un point à un autre.");
    return { ancre, texte, forme: "fleche", geometrie: { espace: "photo", x1, y1, x2, y2, couleur }, mediaAudioId: null };
  }
  const r = Math.min(1, Math.max(0, draft.r));
  if (r < 0.01) throw new PhotoTargetError("Cercle trop petit.");
  return { ancre, texte, forme: "cercle", geometrie: { espace: "photo", cx: clamp01(draft.cx), cy: clamp01(draft.cy), r, couleur }, mediaAudioId: null };
}

/** Vrai si l'annotation est dessinée sur la photo portée par ce `PhotoAnchor`. */
export function isAnnotationOfAnchor(element: ReleveElement, anchorId: string): element is ReleveElement<"annotation"> {
  if (element.type !== "annotation") return false;
  const { ancre, geometrie } = (element as ReleveElement<"annotation">).donnees;
  return ancre.kind === "entite" && ancre.ref.kind === "element" && ancre.ref.id === anchorId
    && typeof geometrie === "object" && geometrie !== null && (geometrie as { espace?: unknown }).espace === "photo";
}

export function photoAnchorsOf(elements: readonly ReleveElement[], mediaId: string): ReleveElement<"photo_anchor">[] {
  return elements.filter((element): element is ReleveElement<"photo_anchor"> =>
    element.type === "photo_anchor" && !element.deletedAt && (element.donnees as PhotoAnchorDonnees).mediaId === mediaId);
}
