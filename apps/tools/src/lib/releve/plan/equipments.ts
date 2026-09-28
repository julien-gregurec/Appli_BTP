/**
 * Relevé Lot 7 — objets du plan (mobilier, sanitaire, cuisine, équipements techniques) :
 * opérations PURES (document → document), comme `editor.ts` et `openings.ts`.
 *
 * - Chaque opération renvoie un NOUVEAU document, ou le même objet si rien ne change : l'historique
 *   (annuler / rétablir) et l'enregistrement par différence reposent sur cette propriété.
 * - Un objet VERROUILLÉ ne bouge pas, ne change pas, ne se supprime pas (seul le déverrouillage passe) :
 *   les opérations l'ignorent et le signalent (`skipped`).
 * - Liaison au mur (radiateur, meuble haut, prise…) : `murId` + `face` + `decalageMm` (axe de l'objet
 *   le long du mur depuis A). L'objet SUIT son mur (déplacé, pivoté, allongé, raccourci, scindé,
 *   fusionné) : `followWalls`. Un mur supprimé libère l'objet (il reste en place).
 * - Pièce : un objet `pieceAuto` prend la pièce dont le contour contient son centre (`autoPieces`) ;
 *   une pièce choisie à la main (`pieceAuto` faux) n'est plus recalculée.
 */
import {
  catalogueEntry, EQUIPEMENT_LIMITS, newPlanEquipement, normalizeRotation,
  type EquipementCategorie, type EquipementFace, type PlanContour, type PlanDocument, type PlanEquipement, type PlanMur,
} from "@elsatia/releve-domain";
import { pointInPolygon } from "@/lib/geometry/engine/planar-faces";
import type { BoundingBox2D, Point2D } from "@/lib/geometry/engine/types";
import { offsetAlongWall, pointAlongWall, wallLength } from "./geometry";

const round = (value: number) => Math.round(value * 10) / 10 + 0;
const roundPoint = (point: Point2D): Point2D => ({ x: round(point.x), y: round(point.y) });

/** Plus petite dimension saisissable (mm) : en dessous, un geste involontaire. */
export const MIN_EQUIPMENT_MM = 20;

// ── Géométrie de l'objet ─────────────────────────────────────────────────────

/** Point local (largeur X, profondeur Y, centre = origine) → monde. */
export function localToWorld(objet: Pick<PlanEquipement, "position" | "rotationRad">, local: Point2D): Point2D {
  const c = Math.cos(objet.rotationRad); const s = Math.sin(objet.rotationRad);
  return { x: objet.position.x + local.x * c - local.y * s, y: objet.position.y + local.x * s + local.y * c };
}

/** Point monde → repère local de l'objet. */
export function worldToLocal(objet: Pick<PlanEquipement, "position" | "rotationRad">, world: Point2D): Point2D {
  const c = Math.cos(objet.rotationRad); const s = Math.sin(objet.rotationRad);
  const dx = world.x - objet.position.x; const dy = world.y - objet.position.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Emprise (rectangle orienté, sens trigonométrique). */
export function footprint(objet: Pick<PlanEquipement, "position" | "rotationRad" | "largeurMm" | "profondeurMm">): Point2D[] {
  const w = objet.largeurMm / 2; const d = objet.profondeurMm / 2;
  return [{ x: -w, y: -d }, { x: w, y: -d }, { x: w, y: d }, { x: -w, y: d }].map((p) => localToWorld(objet, p));
}

export function equipmentBox(objet: Pick<PlanEquipement, "position" | "rotationRad" | "largeurMm" | "profondeurMm">): BoundingBox2D {
  const points = footprint(objet);
  return {
    minX: Math.min(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)), maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** L'objet sous le point (à `tolerance` près), le plus petit d'abord (un tabouret sur une table reste désignable). */
export function hitTestEquipment(equipements: readonly PlanEquipement[], point: Point2D, tolerance: number, accept: (objet: PlanEquipement) => boolean = () => true): PlanEquipement | null {
  let best: { objet: PlanEquipement; area: number } | null = null;
  for (const objet of equipements) {
    if (!accept(objet)) continue;
    const reach = Math.max(objet.largeurMm, objet.profondeurMm) / 2 + tolerance;
    if (Math.abs(point.x - objet.position.x) > reach || Math.abs(point.y - objet.position.y) > reach) continue;
    const local = worldToLocal(objet, point);
    if (Math.abs(local.x) > objet.largeurMm / 2 + tolerance || Math.abs(local.y) > objet.profondeurMm / 2 + tolerance) continue;
    const area = objet.largeurMm * objet.profondeurMm;
    if (!best || area < best.area) best = { objet, area };
  }
  return best?.objet ?? null;
}

// ── Liaison au mur ───────────────────────────────────────────────────────────

/** Normale unitaire de la face `face` d'un mur (gauche = face de référence, à gauche de A → B). */
export function faceNormal(mur: Pick<PlanMur, "a" | "b">, face: EquipementFace): Point2D {
  const length = wallLength(mur) || 1;
  const left = { x: -(mur.b.y - mur.a.y) / length, y: (mur.b.x - mur.a.x) / length };
  return face === "gauche" ? left : { x: -left.x, y: -left.y };
}

/** Rotation qui tourne le DOS de l'objet (−Y local) vers le mur : +Y local = normale de la face. */
export function rotationFacing(normal: Point2D): number {
  return normalizeRotation(Math.atan2(normal.y, normal.x) - Math.PI / 2);
}

/** Position et rotation d'un objet posé contre la face d'un mur, son axe à `decalageMm` de A. */
export function placementOnWall(mur: PlanMur, face: EquipementFace, decalageMm: number, profondeurMm: number): { position: Point2D; rotationRad: number } {
  const n = faceNormal(mur, face);
  const foot = pointAlongWall(mur, decalageMm);
  const distance = mur.epaisseurMm / 2 + profondeurMm / 2;
  return { position: roundPoint({ x: foot.x + n.x * distance, y: foot.y + n.y * distance }), rotationRad: rotationFacing(n) };
}

/**
 * Objets liés : recalés sur leur mur (position, rotation) ; lien retiré si le mur a disparu. Le
 * décalage est borné à la longueur du mur (mur raccourci sous l'objet). Même document si rien ne change.
 */
export function followWalls(document: PlanDocument): PlanDocument {
  const equipements = document.equipements ?? [];
  if (!equipements.some((objet) => objet.murId)) return document;
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  let changed = false;
  const next = equipements.map((objet) => {
    if (!objet.murId) return objet;
    const mur = murs.get(objet.murId);
    if (!mur) { changed = true; return { ...objet, murId: null, face: null, decalageMm: null }; }
    const length = wallLength(mur);
    const decalageMm = round(Math.max(0, Math.min(objet.decalageMm ?? length / 2, length)));
    const placed = placementOnWall(mur, objet.face ?? "gauche", decalageMm, objet.profondeurMm);
    if (placed.position.x === objet.position.x && placed.position.y === objet.position.y && placed.rotationRad === objet.rotationRad
      && decalageMm === objet.decalageMm && objet.face !== null) return objet;
    changed = true;
    return { ...objet, position: placed.position, rotationRad: placed.rotationRad, decalageMm, face: objet.face ?? "gauche" };
  });
  return changed ? { ...document, equipements: next } : document;
}

/** Report des liaisons quand un mur est scindé à `offsetMm` : les objets au-delà passent sur la seconde partie. */
export function relinkAfterSplit(document: PlanDocument, murId: string, offsetMm: number, newId: string): PlanDocument {
  const equipements = document.equipements ?? [];
  if (!equipements.some((objet) => objet.murId === murId && (objet.decalageMm ?? 0) >= offsetMm)) return document;
  return { ...document, equipements: equipements.map((objet) => objet.murId === murId && (objet.decalageMm ?? 0) >= offsetMm
    ? { ...objet, murId: newId, decalageMm: round((objet.decalageMm ?? 0) - offsetMm) } : objet) };
}

/** Report des liaisons d'un mur absorbé par une fusion (`second` → `merged`), à leur position réelle. */
export function relinkAfterMerge(before: PlanDocument, after: PlanDocument, secondId: string, merged: PlanMur): PlanDocument {
  const equipements = after.equipements ?? [];
  const oldMurs = new Map(before.murs.map((mur) => [mur.id, mur]));
  if (!equipements.some((objet) => objet.murId === secondId || objet.murId === merged.id)) return after;
  return { ...after, equipements: equipements.map((objet) => {
    if (objet.murId !== secondId && objet.murId !== merged.id) return objet;
    const host = oldMurs.get(objet.murId!);
    if (!host) return objet;
    const at = pointAlongWall(host, objet.decalageMm ?? 0);
    return { ...objet, murId: merged.id, decalageMm: round(offsetAlongWall(merged, at)) };
  }) };
}

// ── Pièces ───────────────────────────────────────────────────────────────────

/** Pièce (Lot 3) dont le contour contient le point ; la plus petite si plusieurs se recouvrent. */
export function pieceAt(contours: readonly PlanContour[], point: Point2D): string | null {
  let best: { pieceId: string; area: number } | null = null;
  for (const contour of contours) {
    if (contour.points.length < 3 || !pointInPolygon(point, { points: contour.points })) continue;
    const area = Math.abs(contour.points.reduce((sum, p, i) => { const q = contour.points[(i + 1) % contour.points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
    if (!best || area < best.area) best = { pieceId: contour.pieceId, area };
  }
  return best?.pieceId ?? null;
}

/** Association automatique des objets `pieceAuto` à la pièce qui contient leur centre. */
export function autoPieces(document: PlanDocument): PlanDocument {
  const equipements = document.equipements ?? [];
  let changed = false;
  const next = equipements.map((objet) => {
    if (!objet.pieceAuto) return objet;
    const pieceId = pieceAt(document.contours, objet.position);
    if (pieceId === objet.pieceId) return objet;
    changed = true;
    return { ...objet, pieceId };
  });
  return changed ? { ...document, equipements: next } : document;
}

/** Suivi des murs puis pièces automatiques : appelé après chaque modification du plan. */
export function syncEquipements(document: PlanDocument): PlanDocument {
  return autoPieces(followWalls(document));
}

// ── Opérations ───────────────────────────────────────────────────────────────

export type EquipmentResult = { document: PlanDocument; error: string | null; skipped: number };
const ok = (document: PlanDocument, skipped = 0): EquipmentResult => ({ document, error: null, skipped });
const refuse = (document: PlanDocument, error: string): EquipmentResult => ({ document, error, skipped: 0 });
const LOCKED = "Objet verrouillé : déverrouillez-le d'abord.";

function replace(document: PlanDocument, ids: ReadonlySet<string>, change: (objet: PlanEquipement) => PlanEquipement | null): EquipmentResult {
  let skipped = 0; let changed = false;
  const equipements = (document.equipements ?? []).map((objet) => {
    if (!ids.has(objet.id)) return objet;
    const next = change(objet);
    if (next === null) { skipped++; return objet; }
    if (JSON.stringify(next) === JSON.stringify(objet)) return objet;
    changed = true;
    return next;
  });
  if (!changed) return skipped ? refuse(document, LOCKED) : ok(document);
  return ok(syncEquipements({ ...document, equipements }), skipped);
}

/** Ajoute un objet (pièce déduite de sa position). */
export function addEquipment(document: PlanDocument, objet: PlanEquipement): PlanDocument {
  return syncEquipements({ ...document, equipements: [...(document.equipements ?? []), { ...objet, position: roundPoint(objet.position) }] });
}

/** Crée un objet du catalogue au point donné (accroche déjà résolue par l'appelant). */
export function createEquipment(objet: string, id: string, placement: { position: Point2D; rotationRad?: number; link?: { murId: string; face: EquipementFace; decalageMm: number } | null }): PlanEquipement {
  return newPlanEquipement(objet, id, roundPoint(placement.position), {
    rotationRad: normalizeRotation(placement.rotationRad ?? 0),
    ...(placement.link ? { murId: placement.link.murId, face: placement.link.face, decalageMm: round(placement.link.decalageMm) } : {}),
  });
}

/** Déplacement (et nouvelle liaison au mur si l'accroche en fournit une ; sinon l'objet est libéré). */
export function moveEquipment(document: PlanDocument, id: string, position: Point2D, options: { rotationRad?: number; link?: { murId: string; face: EquipementFace; decalageMm: number } | null } = {}): EquipmentResult {
  return replace(document, new Set([id]), (objet) => objet.verrouille ? null : {
    ...objet, position: roundPoint(position), rotationRad: options.rotationRad !== undefined ? normalizeRotation(options.rotationRad) : objet.rotationRad,
    murId: options.link?.murId ?? null, face: options.link?.face ?? null, decalageMm: options.link ? round(options.link.decalageMm) : null,
  });
}

/** Translation d'un ensemble d'objets (sélection multiple) : les objets liés sont libérés. */
export function translateEquipments(document: PlanDocument, ids: readonly string[], delta: Point2D): EquipmentResult {
  if (delta.x === 0 && delta.y === 0) return ok(document);
  return replace(document, new Set(ids), (objet) => objet.verrouille ? null : {
    ...objet, position: roundPoint({ x: objet.position.x + delta.x, y: objet.position.y + delta.y }), murId: null, face: null, decalageMm: null,
  });
}

/** Rotation absolue (radians). Un objet lié au mur est libéré (sa rotation ne suit plus la face). */
export function rotateEquipment(document: PlanDocument, ids: readonly string[], rotationRad: number | ((objet: PlanEquipement) => number)): EquipmentResult {
  return replace(document, new Set(ids), (objet) => {
    if (objet.verrouille) return null;
    const next = normalizeRotation(typeof rotationRad === "function" ? rotationRad(objet) : rotationRad);
    return next === objet.rotationRad ? objet : { ...objet, rotationRad: next, murId: null, face: null, decalageMm: null };
  });
}

/** Rotation relative (pas de 90° au bouton, 15° par défaut au geste). */
export function turnEquipment(document: PlanDocument, ids: readonly string[], deltaRad: number): EquipmentResult {
  return rotateEquipment(document, ids, (objet) => objet.rotationRad + deltaRad);
}

/**
 * Redimensionnement. `anchor` : coin local OPPOSÉ qui reste fixe (poignée d'angle) ; absent = centre
 * fixe (saisie au panneau). Un objet lié garde son dos contre le mur (seul le centre glisse le long).
 */
export function resizeEquipment(document: PlanDocument, id: string, largeurMm: number, profondeurMm: number, anchor?: { x: -1 | 1; y: -1 | 1 }): EquipmentResult {
  if (!(largeurMm >= MIN_EQUIPMENT_MM && profondeurMm >= MIN_EQUIPMENT_MM) || largeurMm > EQUIPEMENT_LIMITS.dimensionMaxMm || profondeurMm > EQUIPEMENT_LIMITS.dimensionMaxMm) {
    return refuse(document, `Dimensions entre ${MIN_EQUIPMENT_MM / 10} cm et ${EQUIPEMENT_LIMITS.dimensionMaxMm / 1000} m.`);
  }
  return replace(document, new Set([id]), (objet) => {
    if (objet.verrouille) return null;
    const w = round(largeurMm); const d = round(profondeurMm);
    let position = objet.position;
    if (anchor) {
      const fixed = localToWorld(objet, { x: anchor.x * objet.largeurMm / 2, y: anchor.y * objet.profondeurMm / 2 });
      const probe = { ...objet, position: { x: 0, y: 0 } };
      const offset = localToWorld(probe, { x: -anchor.x * w / 2, y: -anchor.y * d / 2 });
      position = roundPoint({ x: fixed.x + offset.x, y: fixed.y + offset.y });
    }
    let decalageMm = objet.decalageMm;
    if (objet.murId && anchor) {
      const mur = document.murs.find((item) => item.id === objet.murId);
      if (mur) decalageMm = round(offsetAlongWall(mur, position));
    }
    return { ...objet, largeurMm: w, profondeurMm: d, position, decalageMm };
  });
}

export type EquipmentPatch = Partial<Pick<PlanEquipement, "libelle" | "commentaire" | "hauteurMm" | "niveauMm" | "categorie" | "etatProjet" | "visible" | "verrouille">>;

/** Attributs. Un objet verrouillé n'accepte que son déverrouillage (et le masquage n'y change rien). */
export function updateEquipment(document: PlanDocument, id: string, patch: EquipmentPatch): EquipmentResult {
  if (patch.libelle !== undefined && (!patch.libelle.trim() || patch.libelle.length > EQUIPEMENT_LIMITS.libelle)) return refuse(document, "Libellé de 1 à 200 caractères.");
  if (patch.commentaire && patch.commentaire.length > EQUIPEMENT_LIMITS.commentaire) return refuse(document, "Commentaire trop long (2 000 caractères au plus).");
  return replace(document, new Set([id]), (objet) => {
    const onlyUnlock = Object.keys(patch).length === 1 && patch.verrouille === false;
    if (objet.verrouille && !onlyUnlock) return null;
    return { ...objet, ...patch, commentaire: patch.commentaire === undefined ? objet.commentaire : (patch.commentaire?.trim() ? patch.commentaire : null) };
  });
}

/** Pièce choisie à la main (`null` : retour à l'association automatique). */
export function assignEquipmentPiece(document: PlanDocument, id: string, pieceId: string | null): EquipmentResult {
  return replace(document, new Set([id]), (objet) => {
    if (objet.verrouille) return null;
    return pieceId === null ? { ...objet, pieceAuto: true } : { ...objet, pieceId, pieceAuto: false };
  });
}

/** Changement de type (catalogue) : catégorie, libellé par défaut si inchangé, dimensions conservées. */
export function changeEquipmentKind(document: PlanDocument, id: string, objetCode: string): EquipmentResult {
  const entry = catalogueEntry(objetCode);
  return replace(document, new Set([id]), (objet) => {
    if (objet.verrouille) return null;
    const libelle = objet.libelle === catalogueEntry(objet.objet).libelle ? entry.libelle : objet.libelle;
    return { ...objet, objet: entry.objet, categorie: entry.categorie, libelle };
  });
}

/** Duplique (décalage visible), nouveaux identifiants ; les copies ne sont ni liées ni verrouillées. */
export function duplicateEquipments(document: PlanDocument, ids: readonly string[], newId: () => string, offset: Point2D = { x: 300, y: -300 }): { document: PlanDocument; ids: string[] } {
  const wanted = new Set(ids);
  const copies = (document.equipements ?? []).filter((objet) => wanted.has(objet.id)).map((objet): PlanEquipement => ({
    ...objet, id: newId(), position: roundPoint({ x: objet.position.x + offset.x, y: objet.position.y + offset.y }),
    murId: null, face: null, decalageMm: null, verrouille: false, origineId: null,
  }));
  if (copies.length === 0) return { document, ids: [] };
  return { document: syncEquipements({ ...document, equipements: [...(document.equipements ?? []), ...copies] }), ids: copies.map((objet) => objet.id) };
}

/** Supprime (suppression douce côté serveur, restaurable). Les objets verrouillés restent (comptés). */
export function deleteEquipments(document: PlanDocument, ids: readonly string[]): EquipmentResult & { removed: PlanEquipement[] } {
  const wanted = new Set(ids);
  const removed: PlanEquipement[] = []; let skipped = 0;
  const equipements = (document.equipements ?? []).filter((objet) => {
    if (!wanted.has(objet.id)) return true;
    if (objet.verrouille) { skipped++; return true; }
    removed.push(objet);
    return false;
  });
  if (removed.length === 0) return { ...(skipped ? refuse(document, LOCKED) : ok(document)), removed };
  return { document: { ...document, equipements }, error: null, skipped, removed };
}

/** Restaure des objets supprimés (corbeille) ; un objet lié à un mur disparu est libéré. */
export function restoreEquipments(document: PlanDocument, objets: readonly PlanEquipement[]): PlanDocument {
  const present = new Set((document.equipements ?? []).map((objet) => objet.id));
  const back = objets.filter((objet) => !present.has(objet.id));
  if (back.length === 0) return document;
  return syncEquipements({ ...document, equipements: [...(document.equipements ?? []), ...back] });
}

export function setEquipmentsVisible(document: PlanDocument, ids: readonly string[], visible: boolean): EquipmentResult {
  // Masquer / afficher : un objet verrouillé reste inchangé (le verrou protège aussi l'affichage).
  return replace(document, new Set(ids), (objet) => objet.verrouille ? null : { ...objet, visible });
}

export function setEquipmentsLocked(document: PlanDocument, ids: readonly string[], verrouille: boolean): EquipmentResult {
  return replace(document, new Set(ids), (objet) => ({ ...objet, verrouille }));
}

/** Identifiants des objets d'un groupe (catégorie). */
export function groupIds(document: PlanDocument, categorie: EquipementCategorie): string[] {
  return (document.equipements ?? []).filter((objet) => objet.categorie === categorie).map((objet) => objet.id);
}
