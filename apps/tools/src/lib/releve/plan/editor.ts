/**
 * Relevé Lot 5 — opérations d'édition du plan, PURES (document → document).
 *
 * Chaque opération renvoie un NOUVEAU document (partage structurel : les murs non touchés sont
 * les mêmes objets) ou le même objet si rien ne change — l'historique (`lib/tracing/history`)
 * et l'enregistrement par différence (`diffPlan`) s'appuient sur cette propriété.
 *
 * Murs connectés : deux extrémités confondues (à 0,5 mm) forment un JOINT. Déplacer un sommet,
 * un mur, changer une longueur ou un angle déplace le joint entier : les murs voisins suivent.
 *
 * Ouvertures : leur position (décalage depuis `a`) est conservée ; si le mur raccourcit, elles
 * sont ramenées dans le mur (jamais d'ouverture qui déborde : le serveur la refuserait).
 */
import type { MurType, OuvertureSens, OuvertureType, PlanContour, PlanDocument, PlanMur, PlanOuverture } from "@elsatia/releve-domain";
import { constrainToAngleStep } from "@/lib/geometry/engine/guides";
import { distance, pointAtPolar, polarAngle, projectOntoLine, vectorBetween } from "@/lib/geometry/engine/measure";
import type { Point2D } from "@/lib/geometry/engine/types";
import { contourFromRoom, detectRooms, offsetAlongWall, refreshContours, roomAt, samePoint, wallAngleDegrees, wallLength } from "./geometry";

export type WallDefaults = { epaisseurMm: number; hauteurMm: number | null; typeMur: MurType };
export const DEFAULT_WALL: WallDefaults = { epaisseurMm: 200, hauteurMm: 2500, typeMur: "cloison" };

/** Longueur minimale d'un mur saisi (mm) : en dessous, un double-tap involontaire. */
export const MIN_WALL_MM = 10;

const round = (value: number) => Math.round(value * 10) / 10;
const roundPoint = (point: Point2D): Point2D => ({ x: round(point.x), y: round(point.y) });

function withMurs(document: PlanDocument, murs: readonly PlanMur[]): PlanDocument {
  return fitOpenings({ ...document, murs });
}

/** Ramène chaque ouverture dans son mur ; retire celles dont le mur a disparu. */
export function fitOpenings(document: PlanDocument): PlanDocument {
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  let changed = false;
  const ouvertures: PlanOuverture[] = [];
  for (const ouverture of document.ouvertures) {
    const mur = murs.get(ouverture.murId);
    if (!mur) { changed = true; continue; }
    const longueur = Math.floor(wallLength(mur));
    const largeurMm = Math.min(ouverture.largeurMm, longueur);
    const decalageMm = Math.max(0, Math.min(ouverture.decalageMm, longueur - largeurMm));
    if (largeurMm !== ouverture.largeurMm || decalageMm !== ouverture.decalageMm) {
      changed = true;
      ouvertures.push({ ...ouverture, largeurMm, decalageMm });
    } else ouvertures.push(ouverture);
  }
  return changed ? { ...document, ouvertures } : document;
}

// ── Création ─────────────────────────────────────────────────────────────────

export function addWall(document: PlanDocument, a: Point2D, b: Point2D, defaults: WallDefaults, id: string): PlanDocument {
  if (distance(a, b) < MIN_WALL_MM) return document;
  const mur: PlanMur = { id, pieceId: null, a: roundPoint(a), b: roundPoint(b), ...defaults };
  return { ...document, murs: [...document.murs, mur] };
}

/** Extrémité d'un mur de longueur saisie, dans la direction origine → curseur. */
export function pointAtLength(origin: Point2D, toward: Point2D, lengthMm: number): Point2D {
  const angle = distance(origin, toward) > 0 ? polarAngle(origin, toward) : 0;
  return pointAtPolar(origin, lengthMm, angle);
}

// ── Sommets et murs ──────────────────────────────────────────────────────────

/** Déplace le joint situé en `from` (toutes les extrémités confondues) vers `to`. */
export function moveVertex(document: PlanDocument, from: Point2D, to: Point2D): PlanDocument {
  const target = roundPoint(to);
  let changed = false;
  let degenerate = false;
  const murs = document.murs.map((mur) => {
    const moveA = samePoint(mur.a, from);
    const moveB = samePoint(mur.b, from);
    if (!moveA && !moveB) return mur;
    const next = { ...mur, a: moveA ? target : mur.a, b: moveB ? target : mur.b };
    if (distance(next.a, next.b) < MIN_WALL_MM) degenerate = true;
    changed = true;
    return next;
  });
  // Jamais de mur de longueur nulle, et jamais un joint à moitié déplacé : tout ou rien.
  return changed && !degenerate ? withMurs(document, murs) : document;
}

/** Translation d'un mur ; ses joints suivent (les murs voisins s'allongent ou raccourcissent). */
export function moveWall(document: PlanDocument, murId: string, delta: Point2D): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur || (delta.x === 0 && delta.y === 0)) return document;
  const a = mur.a; const b = mur.b;
  const shifted = moveVertex(document, a, { x: a.x + delta.x, y: a.y + delta.y });
  return moveVertex(shifted, b, { x: b.x + delta.x, y: b.y + delta.y });
}

/** Nouvelle longueur : `a` reste fixe, `b` glisse sur la direction du mur (son joint suit). */
export function setWallLength(document: PlanDocument, murId: string, lengthMm: number): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur || !(lengthMm >= MIN_WALL_MM)) return document;
  return moveVertex(document, mur.b, pointAtPolar(mur.a, lengthMm, polarAngle(mur.a, mur.b)));
}

/** Nouvel angle (degrés, repère Y haut) : `a` reste fixe, la longueur est conservée. */
export function setWallAngle(document: PlanDocument, murId: string, degrees: number): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur || !Number.isFinite(degrees)) return document;
  return moveVertex(document, mur.b, pointAtPolar(mur.a, wallLength(mur), (degrees * Math.PI) / 180));
}

export type WallPatch = Partial<Pick<PlanMur, "epaisseurMm" | "hauteurMm" | "typeMur" | "pieceId">>;

export function updateWall(document: PlanDocument, murId: string, patch: WallPatch): PlanDocument {
  let changed = false;
  const murs = document.murs.map((mur) => {
    if (mur.id !== murId) return mur;
    const next = { ...mur, ...patch };
    changed = JSON.stringify(next) !== JSON.stringify(mur);
    return next;
  });
  return changed ? { ...document, murs } : document;
}

/** Supprime des murs, leurs ouvertures, et les retire des contours qui les citaient. */
export function deleteWalls(document: PlanDocument, murIds: readonly string[]): PlanDocument {
  const ids = new Set(murIds);
  if (!document.murs.some((mur) => ids.has(mur.id))) return document;
  return {
    ...document,
    murs: document.murs.filter((mur) => !ids.has(mur.id)),
    ouvertures: document.ouvertures.filter((ouverture) => !ids.has(ouverture.murId)),
    contours: document.contours.map((contour) => contour.murIds.some((id) => ids.has(id)) ? { ...contour, murIds: contour.murIds.filter((id) => !ids.has(id)) } : contour),
  };
}

// ── Corrections terrain ──────────────────────────────────────────────────────

/**
 * Redresser : un mur « presque » horizontal / vertical (à 15° près) le devient exactement ;
 * sinon il est ramené à l'angle usuel (multiple de 15°) le plus proche. `a` reste fixe.
 */
export function straightenWall(document: PlanDocument, murId: string): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur) return document;
  const orthogonal = constrainToAngleStep(mur.a, mur.b, 90, 15);
  const guide = orthogonal ?? constrainToAngleStep(mur.a, mur.b, 15, 7.5);
  if (!guide || guide.deviation < 1e-9) return document;
  return setWallAngle(document, murId, guide.degrees);
}

/**
 * Aligner : les murs sélectionnés deviennent colinéaires au PREMIER (référence). Chaque
 * extrémité est projetée sur la droite de référence ; les joints suivent.
 */
export function alignWalls(document: PlanDocument, murIds: readonly string[]): PlanDocument {
  const reference = document.murs.find((mur) => mur.id === murIds[0]);
  if (!reference || murIds.length < 2) return document;
  const line = { point: reference.a, direction: vectorBetween(reference.a, reference.b) };
  let next = document;
  for (const id of murIds.slice(1)) {
    const mur = next.murs.find((item) => item.id === id);
    if (!mur) continue;
    const a = mur.a; const b = mur.b;
    next = moveVertex(next, a, projectOntoLine(a, line));
    next = moveVertex(next, b, projectOntoLine(b, line));
  }
  return next;
}

export type MergeResult = { document: PlanDocument; error: string | null };

/**
 * Fusionner deux murs colinéaires (à 1° près) qui partagent une extrémité : un seul mur de
 * l'extrémité libre de l'un à celle de l'autre, propriétés du premier. Les ouvertures sont
 * reportées sur le mur fusionné à leur position réelle.
 */
export function mergeWalls(document: PlanDocument, firstId: string, secondId: string): MergeResult {
  const first = document.murs.find((mur) => mur.id === firstId);
  const second = document.murs.find((mur) => mur.id === secondId);
  if (!first || !second || first.id === second.id) return { document, error: "Sélectionnez deux murs." };
  const shared = [first.a, first.b].find((p) => samePoint(p, second.a) || samePoint(p, second.b));
  if (!shared) return { document, error: "Les deux murs doivent se toucher par une extrémité." };
  const angle = Math.abs(((wallAngleDegrees(first) - wallAngleDegrees(second)) % 180 + 180) % 180);
  if (Math.min(angle, 180 - angle) > 1) return { document, error: "Les deux murs doivent être alignés." };
  const start = samePoint(first.a, shared) ? first.b : first.a;
  const end = samePoint(second.a, shared) ? second.b : second.a;
  const merged: PlanMur = { ...first, a: start, b: end };
  const reposition = (ouverture: PlanOuverture, host: PlanMur): PlanOuverture => {
    const p1 = pointAtPolar(host.a, ouverture.decalageMm, polarAngle(host.a, host.b));
    const p2 = pointAtPolar(host.a, ouverture.decalageMm + ouverture.largeurMm, polarAngle(host.a, host.b));
    const d = Math.min(offsetAlongWall(merged, p1), offsetAlongWall(merged, p2));
    return { ...ouverture, murId: merged.id, decalageMm: round(d) };
  };
  const ouvertures = document.ouvertures.map((ouverture) => ouverture.murId === first.id ? reposition(ouverture, first)
    : ouverture.murId === second.id ? reposition(ouverture, second) : ouverture);
  const contours = document.contours.map((contour) => contour.murIds.includes(second.id)
    ? { ...contour, murIds: [...new Set(contour.murIds.map((id) => (id === second.id ? first.id : id)))] } : contour);
  return {
    document: fitOpenings({ ...document, murs: document.murs.filter((mur) => mur.id !== second.id).map((mur) => (mur.id === first.id ? merged : mur)), ouvertures, contours }),
    error: null,
  };
}

export type SplitResult = { document: PlanDocument; error: string | null };

/** Scinder un mur à `offsetMm` de `a` : deux murs, ouvertures réparties ; refusé si une ouverture est à cheval. */
export function splitWall(document: PlanDocument, murId: string, offsetMm: number, newId: string): SplitResult {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur) return { document, error: "Sélectionnez un mur." };
  const longueur = wallLength(mur);
  if (!(offsetMm >= MIN_WALL_MM && offsetMm <= longueur - MIN_WALL_MM)) return { document, error: "Point de coupe trop près d'une extrémité." };
  const hosted = document.ouvertures.filter((ouverture) => ouverture.murId === murId);
  if (hosted.some((o) => o.decalageMm < offsetMm && o.decalageMm + o.largeurMm > offsetMm)) {
    return { document, error: "Une ouverture est à cheval sur le point de coupe." };
  }
  const cut = roundPoint(pointAtPolar(mur.a, offsetMm, polarAngle(mur.a, mur.b)));
  const firstPart: PlanMur = { ...mur, b: cut };
  const secondPart: PlanMur = { ...mur, id: newId, a: cut, origineId: null };
  const ouvertures = document.ouvertures.map((o) => o.murId === murId && o.decalageMm >= offsetMm
    ? { ...o, murId: newId, decalageMm: round(o.decalageMm - offsetMm) } : o);
  const contours = document.contours.map((contour) => contour.murIds.includes(murId) ? { ...contour, murIds: [...contour.murIds, newId] } : contour);
  const murs = document.murs.flatMap((item) => (item.id === murId ? [firstPart, secondPart] : [item]));
  return { document: fitOpenings({ ...document, murs, ouvertures, contours }), error: null };
}

// ── Ouvertures (fondation) ───────────────────────────────────────────────────

export type OpeningDraft = { typeOuverture: OuvertureType; largeurMm: number; hauteurMm: number; allegeMm: number | null; sens: OuvertureSens; decalageMm?: number };

export const OPENING_PRESETS: Record<"porte" | "fenetre" | "baie" | "ouverture_libre", OpeningDraft> = {
  porte: { typeOuverture: "porte", largeurMm: 830, hauteurMm: 2040, allegeMm: null, sens: "gauche" },
  fenetre: { typeOuverture: "fenetre", largeurMm: 1200, hauteurMm: 1350, allegeMm: 900, sens: "aucun" },
  baie: { typeOuverture: "baie", largeurMm: 2400, hauteurMm: 2150, allegeMm: 0, sens: "coulissant" },
  ouverture_libre: { typeOuverture: "passage", largeurMm: 900, hauteurMm: 2100, allegeMm: null, sens: "aucun" },
};

/** Ajoute une ouverture centrée (ou au décalage donné), ramenée dans le mur. */
export function addOpening(document: PlanDocument, murId: string, draft: OpeningDraft, id: string): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur) return document;
  const longueur = Math.floor(wallLength(mur));
  const largeurMm = Math.min(draft.largeurMm, longueur);
  const decalageMm = draft.decalageMm ?? Math.max(0, round((longueur - largeurMm) / 2));
  const ouverture: PlanOuverture = {
    id, murId, decalageMm, largeurMm, hauteurMm: draft.hauteurMm, allegeMm: draft.allegeMm, typeOuverture: draft.typeOuverture, sens: draft.sens,
  };
  return fitOpenings({ ...document, ouvertures: [...document.ouvertures, ouverture] });
}

export function updateOpening(document: PlanDocument, id: string, patch: Partial<Omit<PlanOuverture, "id" | "murId">>): PlanDocument {
  if (!document.ouvertures.some((o) => o.id === id)) return document;
  return fitOpenings({ ...document, ouvertures: document.ouvertures.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
}

export function deleteOpening(document: PlanDocument, id: string): PlanDocument {
  return document.ouvertures.some((o) => o.id === id) ? { ...document, ouvertures: document.ouvertures.filter((o) => o.id !== id) } : document;
}

// ── Pièces ───────────────────────────────────────────────────────────────────

export type AssignResult = { document: PlanDocument; error: string | null };

/**
 * Associe la pièce fermée qui contient `point` à la pièce métier `pieceId` (Lot 3). Une pièce
 * n'a qu'un contour : l'associer ailleurs remplace l'ancien. Une région déjà associée à une autre
 * pièce est réattribuée.
 */
export function assignRoom(document: PlanDocument, point: Point2D, pieceId: string): AssignResult {
  const room = roomAt(detectRooms(document.murs), point);
  if (!room) return { document, error: "Aucune pièce fermée à cet endroit : fermez les murs d'abord." };
  const contour: PlanContour = contourFromRoom(pieceId, room);
  const others = document.contours.filter((item) => item.pieceId !== pieceId && !(item.graine && roomAt([room], item.graine)));
  return { document: { ...document, contours: [...others, contour] }, error: null };
}

export function unassignRoom(document: PlanDocument, pieceId: string): PlanDocument {
  return document.contours.some((contour) => contour.pieceId === pieceId)
    ? { ...document, contours: document.contours.filter((contour) => contour.pieceId !== pieceId) } : document;
}

/** Recalage des contours après une modification de murs (voir `refreshContours`). */
export function withRefreshedContours(document: PlanDocument): { document: PlanDocument; ouverts: string[] } {
  if (document.contours.length === 0) return { document, ouverts: [] };
  const { contours, ouverts } = refreshContours(document);
  const changed = contours.some((contour, index) => contour !== document.contours[index]);
  return { document: changed ? { ...document, contours } : document, ouverts };
}
