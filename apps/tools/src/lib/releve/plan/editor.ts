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
 * Ouvertures (Lot 6) : une ouverture APPARTIENT à son mur. Elle le suit quand il est déplacé ou
 * pivoté (position relative à A), reste en place dans le monde quand on allonge / raccourcit le
 * mur par son extrémité A (distance à B conservée), et glisse dans le mur s'il raccourcit trop.
 * Jamais de réduction silencieuse de largeur ni de chevauchement : si les ouvertures ne tiennent
 * plus dans le mur, la modification est REFUSÉE (le document est rendu inchangé).
 *
 * Jonctions en T (Lot 6) : l'extrémité d'un mur posée sur l'axe d'un mur qu'on modifie reste
 * posée sur cet axe (elle glisse le long de sa propre direction).
 */
import type { MurType, PlanContour, PlanDocument, PlanMur, PlanOuverture } from "@elsatia/releve-domain";
import { constrainToAngleStep } from "@/lib/geometry/engine/guides";
import { cross, distance, dot, pointAtPolar, polarAngle, projectOntoLine, vectorBetween } from "@/lib/geometry/engine/measure";
import type { Point2D } from "@/lib/geometry/engine/types";
import { contourFromRoom, detectRooms, JOINT_EPSILON_MM, offsetAlongWall, refreshContours, roomAt, samePoint, wallAngleDegrees, wallLength } from "./geometry";
import { OPENING_KIND_PRESETS, placeOpening, type OpeningDraft } from "./openings";
import { computeWallNetwork, type WallNetwork } from "./wall-geometry";
import { followWalls, relinkAfterMerge, relinkAfterSplit } from "./equipments";

export type WallDefaults = { epaisseurMm: number; hauteurMm: number | null; typeMur: MurType };
export const DEFAULT_WALL: WallDefaults = { epaisseurMm: 200, hauteurMm: 2500, typeMur: "cloison" };

/** Longueur minimale d'un mur saisi (mm) : en dessous, un double-tap involontaire. */
export const MIN_WALL_MM = 10;

// `+ 0` : jamais de zéro négatif dans les coordonnées enregistrées.
const round = (value: number) => Math.round(value * 10) / 10 + 0;
const roundPoint = (point: Point2D): Point2D => ({ x: round(point.x), y: round(point.y) });

/**
 * Nouveaux murs → ouvertures rattachées. Pour chaque mur modifié : une ouverture garde sa
 * distance à B si seule l'extrémité A a bougé (elle reste en place dans le monde), sa distance à
 * A sinon ; puis les ouvertures du mur sont ramenées dedans sans changer de largeur ni se
 * chevaucher. Impossible (le mur est devenu trop court) → document d'origine (refus).
 */
function withMurs(document: PlanDocument, murs: readonly PlanMur[]): PlanDocument {
  const before = new Map(document.murs.map((mur) => [mur.id, mur]));
  const changed = new Set<string>();
  const shift = new Map<string, number>();
  for (const mur of murs) {
    const old = before.get(mur.id);
    if (!old || old === mur) continue;
    changed.add(mur.id);
    const aMoved = old.a.x !== mur.a.x || old.a.y !== mur.a.y;
    const bMoved = old.b.x !== mur.b.x || old.b.y !== mur.b.y;
    if (aMoved && !bMoved) shift.set(mur.id, wallLength(mur) - wallLength(old));
  }
  const ouvertures = shift.size === 0 ? document.ouvertures : document.ouvertures.map((o) => {
    const delta = shift.get(o.murId);
    return delta ? { ...o, decalageMm: round(o.decalageMm + delta) } : o;
  });
  const packed = packOpenings({ ...document, murs, ouvertures }, changed);
  // Lot 7 : les objets liés à un mur le suivent.
  return packed ? followWalls(packed) : document;
}

/**
 * Ramène les ouvertures des murs `murIds` (tous si absent) dans leur mur, dans leur ordre, sans
 * réduire leur largeur ni les faire se chevaucher. Retire celles dont le mur a disparu.
 * `null` : impossible (somme des largeurs > longueur du mur).
 */
export function packOpenings(document: PlanDocument, murIds?: ReadonlySet<string>): PlanDocument | null {
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const byMur = new Map<string, PlanOuverture[]>();
  let changed = false;
  for (const ouverture of document.ouvertures) {
    if (!murs.has(ouverture.murId)) { changed = true; continue; }
    byMur.set(ouverture.murId, [...(byMur.get(ouverture.murId) ?? []), ouverture]);
  }
  const replaced = new Map<string, PlanOuverture>();
  for (const [murId, list] of byMur) {
    if (murIds && !murIds.has(murId)) continue;
    const longueur = wallLength(murs.get(murId)!);
    const sorted = [...list].sort((x, y) => x.decalageMm - y.decalageMm);
    const starts = sorted.map((o) => o.decalageMm);
    let cursor = 0;
    for (let i = 0; i < sorted.length; i++) { starts[i] = Math.max(starts[i], cursor); cursor = starts[i] + sorted[i].largeurMm; }
    let limit = longueur;
    for (let i = sorted.length - 1; i >= 0; i--) { starts[i] = Math.min(starts[i], limit - sorted[i].largeurMm); limit = starts[i]; }
    if (sorted.length && starts[0] < -1e-6) return null;
    sorted.forEach((o, i) => {
      const decalageMm = Math.max(0, Math.floor(starts[i] * 10) / 10);
      if (decalageMm !== o.decalageMm) replaced.set(o.id, { ...o, decalageMm });
    });
  }
  if (!changed && replaced.size === 0) return document;
  return { ...document, ouvertures: document.ouvertures.filter((o) => murs.has(o.murId)).map((o) => replaced.get(o.id) ?? o) };
}

/** Compatibilité Lot 5 : ouvertures ramenées dans leur mur (inchangé si impossible). */
export function fitOpenings(document: PlanDocument): PlanDocument {
  return packOpenings(document) ?? document;
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

export type VertexMove = { from: Point2D; to: Point2D };

/**
 * Déplace SIMULTANÉMENT plusieurs joints (toutes les extrémités confondues avec chaque `from`).
 * Les extrémités posées en T sur l'axe d'un mur modifié le suivent (elles glissent le long de
 * leur propre mur jusqu'au nouvel axe). Tout ou rien : jamais de mur de longueur nulle, jamais
 * d'ouverture qui ne tient plus.
 */
export function moveVertices(document: PlanDocument, moves: readonly VertexMove[]): PlanDocument {
  const targets = moves.map((move) => ({ from: move.from, to: roundPoint(move.to) }));
  const moveOf = (p: Point2D) => targets.find((move) => samePoint(p, move.from));
  let changed = false;
  let degenerate = false;
  const murs = document.murs.map((mur) => {
    const moveA = moveOf(mur.a);
    const moveB = moveOf(mur.b);
    if (!moveA && !moveB) return mur;
    const next = { ...mur, a: moveA ? moveA.to : mur.a, b: moveB ? moveB.to : mur.b };
    if (distance(next.a, next.b) < MIN_WALL_MM) degenerate = true;
    changed = true;
    return next;
  });
  if (!changed || degenerate) return document;
  // Jonctions en T : extrémités immobiles posées sur l'intérieur d'un mur qui a bougé.
  const followers: VertexMove[] = [];
  document.murs.forEach((old, index) => {
    const next = murs[index];
    if (next === old) return;
    const length = wallLength(old);
    const u = { x: (old.b.x - old.a.x) / length, y: (old.b.y - old.a.y) / length };
    for (const other of document.murs) {
      if (other.id === old.id) continue;
      for (const [end, far] of [[other.a, other.b], [other.b, other.a]] as const) {
        if (moveOf(end) || followers.some((f) => samePoint(f.from, end))) continue;
        const rel = { x: end.x - old.a.x, y: end.y - old.a.y };
        const t = dot(rel, u);
        if (t <= JOINT_EPSILON_MM || t >= length - JOINT_EPSILON_MM || Math.abs(cross(u, rel)) > JOINT_EPSILON_MM) continue;
        // Nouveau point : intersection de la droite du mur qui aboute avec le nouvel axe.
        const d = { x: end.x - far.x, y: end.y - far.y };
        const w = { x: next.b.x - next.a.x, y: next.b.y - next.a.y };
        const denominator = cross(d, w);
        let to: Point2D;
        if (Math.abs(denominator) > 1e-9) {
          const k = cross({ x: next.a.x - far.x, y: next.a.y - far.y }, w) / denominator;
          to = { x: far.x + d.x * k, y: far.y + d.y * k };
        } else {
          const ratio = t / length;
          to = { x: next.a.x + w.x * ratio, y: next.a.y + w.y * ratio };
        }
        followers.push({ from: end, to });
      }
    }
  });
  const withFollowers = followers.length === 0 ? murs : murs.map((mur) => {
    const fa = followers.find((f) => samePoint(mur.a, f.from));
    const fb = followers.find((f) => samePoint(mur.b, f.from));
    if (!fa && !fb) return mur;
    const next = { ...mur, a: fa ? roundPoint(fa.to) : mur.a, b: fb ? roundPoint(fb.to) : mur.b };
    if (distance(next.a, next.b) < MIN_WALL_MM) degenerate = true;
    return next;
  });
  return degenerate ? document : withMurs(document, withFollowers);
}

/** Déplace le joint situé en `from` (toutes les extrémités confondues) vers `to`. */
export function moveVertex(document: PlanDocument, from: Point2D, to: Point2D): PlanDocument {
  return moveVertices(document, [{ from, to }]);
}

/**
 * Translation d'un mur ; ses joints suivent (les murs voisins s'allongent ou raccourcissent), en
 * une seule opération (pas d'état intermédiaire où le mur serait écrasé). Ses ouvertures suivent.
 */
export function moveWall(document: PlanDocument, murId: string, delta: Point2D): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur || (delta.x === 0 && delta.y === 0)) return document;
  return moveVertices(document, [
    { from: mur.a, to: { x: mur.a.x + delta.x, y: mur.a.y + delta.y } },
    { from: mur.b, to: { x: mur.b.x + delta.x, y: mur.b.y + delta.y } },
  ]);
}

/** Rotation d'un mur autour de son milieu (degrés, sens trigonométrique) ; ouvertures et joints suivent. */
export function rotateWall(document: PlanDocument, murId: string, degrees: number): PlanDocument {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur || !Number.isFinite(degrees) || degrees === 0) return document;
  const c = { x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 };
  const r = (degrees * Math.PI) / 180;
  const turn = (p: Point2D) => ({ x: c.x + (p.x - c.x) * Math.cos(r) - (p.y - c.y) * Math.sin(r), y: c.y + (p.x - c.x) * Math.sin(r) + (p.y - c.y) * Math.cos(r) });
  return moveVertices(document, [{ from: mur.a, to: turn(mur.a) }, { from: mur.b, to: turn(mur.b) }]);
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
    // Lot 7 : un objet lié à un mur supprimé est libéré (il reste en place).
    equipements: (document.equipements ?? []).map((objet) => objet.murId && ids.has(objet.murId) ? { ...objet, murId: null, face: null, decalageMm: null } : objet),
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
  const next = fitOpenings({ ...document, murs: document.murs.filter((mur) => mur.id !== second.id).map((mur) => (mur.id === first.id ? merged : mur)), ouvertures, contours });
  // Lot 7 : objets liés aux deux murs reportés sur le mur fusionné, à leur position réelle.
  return { document: followWalls(relinkAfterMerge(document, next, second.id, merged)), error: null };
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
  return { document: followWalls(relinkAfterSplit(fitOpenings({ ...document, murs, ouvertures, contours }), murId, offsetMm, newId)), error: null };
}

/**
 * Scinder un mur à chaque jonction en T / X qui l'interrompt (murs qui aboutent ou croisent) :
 * un mur par travée, ouvertures réparties. Refusé si une ouverture est à cheval (impossible si
 * les ouvertures respectent les jonctions).
 */
export function splitWallAtJunctions(document: PlanDocument, network: WallNetwork, murId: string, newId: () => string): SplitResult {
  const mur = document.murs.find((item) => item.id === murId);
  const solid = network.walls.get(murId);
  if (!mur || !solid) return { document, error: "Sélectionnez un mur." };
  const length = wallLength(mur);
  const cuts = [...new Set(solid.obstructions.map((item) => round((item.from + item.to) / 2)))]
    .filter((offset) => offset >= MIN_WALL_MM && offset <= length - MIN_WALL_MM).sort((x, y) => y - x);
  if (cuts.length === 0) return { document, error: "Aucune jonction en T ou en X sur ce mur." };
  let next = document;
  // De B vers A : les décalages depuis A restent valables pour la partie restante.
  for (const offset of cuts) {
    const result = splitWall(next, murId, offset, newId());
    if (result.error) return { document, error: result.error };
    next = result.document;
  }
  return { document: next, error: null };
}

export type CleanupReport = { fusionnes: number; raccordes: number; recoupes: number };
export type CleanupResult = { document: PlanDocument; report: CleanupReport };

/**
 * Nettoyage des jonctions (relevé terrain imprécis), à `toleranceMm` près :
 * 1. extrémités presque confondues → un seul joint (L, éventail) ;
 * 2. extrémité presque posée sur l'axe d'un autre mur → posée dessus (T) ;
 * 3. mur qui dépasse légèrement l'axe d'un mur qu'il croise près de son bout (au plus la
 *    demi-épaisseur de l'autre + la tolérance) → recoupé sur l'axe (T).
 * Chaque correction qui rendrait un mur nul ou ferait sortir une ouverture est ignorée.
 */
export function cleanupJunctions(document: PlanDocument, toleranceMm = 30): CleanupResult {
  const report: CleanupReport = { fusionnes: 0, raccordes: 0, recoupes: 0 };
  let next = document;
  // 1. Extrémités proches.
  const points = next.murs.flatMap((mur) => [mur.a, mur.b]);
  const clusters: Point2D[][] = [];
  for (const p of points) {
    const cluster = clusters.find((items) => items.some((q) => distance(p, q) <= toleranceMm));
    if (cluster) cluster.push(p); else clusters.push([p]);
  }
  for (const cluster of clusters) {
    const distinct = cluster.filter((p, i) => cluster.findIndex((q) => samePoint(p, q)) === i);
    if (distinct.length < 2) continue;
    // Le point le plus partagé sert de cible (un joint existant ne bouge pas).
    const target = distinct.map((p) => ({ p, n: cluster.filter((q) => samePoint(p, q)).length })).sort((x, y) => y.n - x.n)[0].p;
    const attempt = moveVertices(next, distinct.filter((p) => !samePoint(p, target)).map((from) => ({ from, to: target })));
    if (attempt !== next) { next = attempt; report.fusionnes += distinct.length - 1; }
  }
  // 2–3. Abouts approximatifs et dépassements.
  for (let pass = 0; pass < 2; pass++) {
    for (const mur of next.murs) {
      for (const which of ["a", "b"] as const) {
        const current = next.murs.find((item) => item.id === mur.id);
        if (!current) continue;
        const end = current[which]; const far = which === "a" ? current.b : current.a;
        if (next.murs.some((other) => other.id !== current.id && (samePoint(other.a, end) || samePoint(other.b, end)))) continue;
        let fix: { to: Point2D; kind: "raccordes" | "recoupes" } | null = null;
        for (const host of next.murs) {
          if (host.id === current.id) continue;
          const length = wallLength(host);
          const u = { x: (host.b.x - host.a.x) / length, y: (host.b.y - host.a.y) / length };
          const rel = { x: end.x - host.a.x, y: end.y - host.a.y };
          const t = dot(rel, u);
          const off = cross(u, rel);
          if (t <= toleranceMm || t >= length - toleranceMm) continue;
          const d = { x: end.x - far.x, y: end.y - far.y };
          const denominator = cross(d, { x: u.x, y: u.y });
          if (Math.abs(denominator) < 1e-9) continue;
          // Point de l'axe hôte sur la droite du mur (mur prolongé ou raccourci jusqu'à l'axe).
          const k = cross({ x: host.a.x - far.x, y: host.a.y - far.y }, u) / denominator;
          const to = { x: far.x + d.x * k, y: far.y + d.y * k };
          const gap = distance(end, to);
          if (Math.abs(off) <= JOINT_EPSILON_MM) continue;
          const overshoot = k < 1; // l'extrémité est au-delà de l'axe hôte
          const limit = overshoot ? toleranceMm + host.epaisseurMm / 2 : toleranceMm;
          if (gap <= limit && (!fix || gap < distance(end, fix.to))) fix = { to, kind: overshoot ? "recoupes" : "raccordes" };
        }
        if (!fix) continue;
        const attempt = moveVertex(next, end, fix.to);
        if (attempt !== next) { next = attempt; report[fix.kind]++; }
      }
    }
  }
  return { document: next, report };
}

// ── Ouvertures ───────────────────────────────────────────────────────────────

export type { OpeningDraft } from "./openings";

/** Préréglages du Lot 5 (API conservée) : menuiseries de la palette du Lot 6. */
export const OPENING_PRESETS: Record<"porte" | "fenetre" | "baie" | "ouverture_libre", OpeningDraft> = {
  porte: OPENING_KIND_PRESETS.porte,
  fenetre: OPENING_KIND_PRESETS.fenetre,
  baie: OPENING_KIND_PRESETS.baie,
  ouverture_libre: OPENING_KIND_PRESETS.ouverture_libre,
};

/**
 * Ajoute une ouverture centrée (ou au décalage donné) dans un emplacement libre du mur (Lot 6 :
 * hors jonctions, sans chevaucher les autres). Inchangé s'il n'y a pas la place — voir
 * `openings.ts::placeOpening` pour le motif du refus.
 */
export function addOpening(document: PlanDocument, murId: string, draft: OpeningDraft, id: string, network: WallNetwork = computeWallNetwork(document.murs)): PlanDocument {
  const centre = draft.decalageMm !== undefined ? draft.decalageMm + draft.largeurMm / 2 : null;
  return placeOpening(document, network, murId, centre, draft, id).document;
}

/**
 * Modification brute d'une ouverture (position ramenée dans le mur). Les contrôles de jonction et
 * de chevauchement sont faits par `openings.ts::patchChecked` (éditeur).
 */
export function updateOpening(document: PlanDocument, id: string, patch: Partial<Omit<PlanOuverture, "id" | "murId">>): PlanDocument {
  const current = document.ouvertures.find((o) => o.id === id);
  const mur = current ? document.murs.find((item) => item.id === current.murId) : undefined;
  if (!current || !mur) return document;
  const next = { ...current, ...patch };
  const longueur = wallLength(mur);
  if (next.largeurMm > longueur) return document;
  next.decalageMm = Math.max(0, Math.min(next.decalageMm, Math.floor((longueur - next.largeurMm) * 10) / 10));
  return { ...document, ouvertures: document.ouvertures.map((o) => (o.id === id ? next : o)) };
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
