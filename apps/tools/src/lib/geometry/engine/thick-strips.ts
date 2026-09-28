import { cross, distance, dot } from "./measure";
import type { Point2D, Vector2D } from "./types";

/**
 * Bandes épaisses raccordées — brique générique d'Engine B (Lot 6 Relevé).
 *
 * Aucun vocabulaire métier : une BANDE est un axe (start → end) et une demi-largeur. Le moteur
 * répond à « quel contour polygonal a chaque bande, une fois raccordée proprement à ses
 * voisines ? » et « où deux bandes se rejoignent-elles ? ».
 *
 * Raccords (sans chevauchement, sans trou, sans surépaisseur) :
 * - **nœud** : extrémités confondues (à `tolerance` près). Les arêtes issues du nœud sont triées
 *   par angle ; entre deux arêtes consécutives, le coin est l'intersection de la face gauche de
 *   l'une et de la face droite de la suivante (onglet). Deux arêtes : angle (L) ou prolongement ;
 *   trois ou plus : éventail autour du nœud (T ou X formés d'extrémités, étoile) ;
 * - **about** (T) : une extrémité posée sur l'INTÉRIEUR d'une autre bande. La bande traversante
 *   n'est pas coupée ; la bande qui aboute s'arrête exactement sur sa face (deux demi-arêtes
 *   virtuelles de la traversante participent au tri des angles) ;
 * - **croisement** (X) : deux intérieurs qui se croisent. Aucun contour n'est modifié (l'union des
 *   deux bandes est déjà propre) ; le croisement est signalé (jonction, zone interdite).
 * - **extrémité libre** : bout droit, exactement à l'extrémité de l'axe (pas de débord).
 *
 * Onglet trop aigu (coin à plus de `miterLimit` demi-largeurs du nœud, ou au-delà de l'autre bout
 * d'une bande courte) : biseau — les deux faces s'arrêtent au droit du nœud et le nœud entre dans
 * le contour (pas de pointe, pas de trou).
 *
 * Tous les contours sont en sens trigonométrique (Y haut). Le rendu « trait puis remplissage »
 * (contours tracés, puis tous les remplissages par-dessus) fait disparaître les coutures entre
 * bandes voisines : seules les faces extérieures restent tracées.
 *
 * Coût : O(n) pour les nœuds (grille de hachage), O(n·k) pour les abouts et croisements (grille
 * des emprises, k = bandes voisines d'une cellule). 500 bandes : quelques millisecondes.
 */

export type Strip = { readonly start: Point2D; readonly end: Point2D; readonly halfWidth: number };

export type StripEndJoin = "libre" | "onglet" | "biseau" | "prolongement" | "eventail" | "about";

export type StripEnd = {
  /** Coin sur la face DROITE de la bande (sens start → end). */
  readonly right: Point2D;
  /** Coin sur la face GAUCHE de la bande. */
  readonly left: Point2D;
  /**
   * Points intermédiaires du bout, dans l'ordre du contour (du coin gauche au coin droit au
   * départ, du coin droit au coin gauche à l'arrivée) : pointe de biseau, nœud d'un éventail.
   */
  readonly cap: readonly Point2D[];
  readonly join: StripEndJoin;
};

export type StripOutline = {
  /** Contour fermé, sens trigonométrique. */
  readonly polygon: Point2D[];
  readonly start: StripEnd;
  readonly end: StripEnd;
  /**
   * Portion d'axe dont les deux faces sont libres de tout raccord d'extrémité : [clearFrom, clearTo]
   * en distance depuis `start`. Hors de cet intervalle, la bande est engagée dans une jonction.
   */
  readonly clearFrom: number;
  readonly clearTo: number;
  /** Intervalles d'axe occupés par une autre bande (about en T, croisement en X), triés. */
  readonly obstructions: readonly StripObstruction[];
  /**
   * Bandes qui CROISENT celle-ci et dont l'emprise lui est retirée (croisement en X : la bande
   * d'index le plus bas reste pleine, l'autre est coupée par ses faces — aucun chevauchement).
   */
  readonly cutBy: readonly number[];
};

export type StripObstruction = { readonly from: number; readonly to: number; readonly by: number; readonly kind: "T" | "X" };

export type StripJunctionKind = "L" | "T" | "X" | "prolongement" | "multiple";
export type StripJunction = {
  readonly point: Point2D;
  readonly kind: StripJunctionKind;
  /** Bandes concernées (index d'entrée). */
  readonly strips: readonly number[];
};

export type StripNetwork = {
  readonly outlines: StripOutline[];
  readonly junctions: StripJunction[];
};

export type StripOptions = {
  /** Distance de fusion des extrémités et de détection des abouts (unités du modèle). */
  readonly tolerance?: number;
  /** Longueur maximale d'un onglet, en demi-largeurs. */
  readonly miterLimit?: number;
};

// ── Outils vectoriels ────────────────────────────────────────────────────────

const unit = (from: Point2D, to: Point2D): Vector2D => {
  const length = distance(from, to);
  return length === 0 ? { x: 1, y: 0 } : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};
const leftNormal = (d: Vector2D): Vector2D => ({ x: -d.y, y: d.x });
const add = (p: Point2D, v: Vector2D, k: number): Point2D => ({ x: p.x + v.x * k, y: p.y + v.y * k });

/** Intersection des droites p1 + t·d1 et p2 + s·d2 ; null si parallèles. */
function lineIntersection(p1: Point2D, d1: Vector2D, p2: Point2D, d2: Vector2D): { point: Point2D; t: number; s: number } | null {
  const denominator = cross(d1, d2);
  if (Math.abs(denominator) < 1e-9) return null;
  const w = { x: p2.x - p1.x, y: p2.y - p1.y };
  const t = cross(w, d2) / denominator;
  const s = cross(w, d1) / denominator;
  return { point: add(p1, d1, t), t, s };
}

// ── Index spatial (grille) ───────────────────────────────────────────────────

class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size: number) {}
  private key(i: number, j: number) { return `${i}:${j}`; }
  insertBox(box: { minX: number; minY: number; maxX: number; maxY: number }, value: T) {
    const i0 = Math.floor(box.minX / this.size); const i1 = Math.floor(box.maxX / this.size);
    const j0 = Math.floor(box.minY / this.size); const j1 = Math.floor(box.maxY / this.size);
    // Emprise démesurée : une seule cellule « globale » évite d'en créer des millions.
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4096) { this.push("*", value); return; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.push(this.key(i, j), value);
  }
  private push(key: string, value: T) {
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(value); else this.cells.set(key, [value]);
  }
  queryPoint(p: Point2D): T[] {
    return [...(this.cells.get(this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size))) ?? []), ...(this.cells.get("*") ?? [])];
  }
  queryBox(box: { minX: number; minY: number; maxX: number; maxY: number }): Set<T> {
    const found = new Set<T>(this.cells.get("*") ?? []);
    const i0 = Math.floor(box.minX / this.size); const i1 = Math.floor(box.maxX / this.size);
    const j0 = Math.floor(box.minY / this.size); const j1 = Math.floor(box.maxY / this.size);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4096) { for (const bucket of this.cells.values()) for (const v of bucket) found.add(v); return found; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const v of this.cells.get(this.key(i, j)) ?? []) found.add(v);
    return found;
  }
}

// ── Nœuds ────────────────────────────────────────────────────────────────────

type EndRef = { strip: number; which: "start" | "end" };
type Node = { point: Point2D; ends: EndRef[]; through: number[] };

type Edge = {
  /** Direction unitaire, en partant du nœud. */
  dir: Vector2D;
  half: number;
  /** Longueur disponible le long de l'arête (bride l'onglet d'une bande courte). */
  reach: number;
  end: EndRef | null;
  angle: number;
  left?: Point2D;
  right?: Point2D;
  /** Pointe de biseau côté gauche (appartient à cette arête). */
  bevelTip?: Point2D;
  bevel?: boolean;
};

function stripLength(strip: Strip) { return distance(strip.start, strip.end); }

/**
 * Contours raccordés d'un réseau de bandes, jonctions et zones engagées. Les bandes de longueur
 * nulle reçoivent un contour vide (l'appelant les refuse en amont).
 */
export function buildStripNetwork(strips: readonly Strip[], options: StripOptions = {}): StripNetwork {
  const tolerance = options.tolerance ?? 0.5;
  const miterLimit = options.miterLimit ?? 4;
  const n = strips.length;
  const lengths = strips.map(stripLength);
  const dirs = strips.map((strip) => unit(strip.start, strip.end));

  // 1. Nœuds : extrémités confondues (grille de pas `tolerance`, voisinage 3×3).
  const nodes: Node[] = [];
  const nodeGrid = new Map<string, number[]>();
  const cellOf = (p: Point2D) => [Math.floor(p.x / tolerance), Math.floor(p.y / tolerance)] as const;
  const endNode: [number, number][] = strips.map(() => [-1, -1]);
  for (let index = 0; index < n; index++) {
    if (lengths[index] === 0) continue;
    for (const which of ["start", "end"] as const) {
      const p = strips[index][which];
      const [ci, cj] = cellOf(p);
      let found = -1;
      for (let di = -1; di <= 1 && found < 0; di++) for (let dj = -1; dj <= 1 && found < 0; dj++) {
        for (const candidate of nodeGrid.get(`${ci + di}:${cj + dj}`) ?? []) if (distance(nodes[candidate].point, p) <= tolerance) { found = candidate; break; }
      }
      if (found < 0) {
        found = nodes.length;
        nodes.push({ point: p, ends: [], through: [] });
        const key = `${ci}:${cj}`;
        const bucket = nodeGrid.get(key);
        if (bucket) bucket.push(found); else nodeGrid.set(key, [found]);
      }
      nodes[found].ends.push({ strip: index, which });
      endNode[index][which === "start" ? 0 : 1] = found;
    }
  }

  // 2. Index des emprises (abouts et croisements).
  const maxLength = lengths.reduce((max, length) => Math.max(max, length), 0);
  const grid = new Grid<number>(Math.max(1000, Math.min(maxLength, 5000)));
  const boxes = strips.map((strip) => ({
    minX: Math.min(strip.start.x, strip.end.x) - tolerance, maxX: Math.max(strip.start.x, strip.end.x) + tolerance,
    minY: Math.min(strip.start.y, strip.end.y) - tolerance, maxY: Math.max(strip.start.y, strip.end.y) + tolerance,
  }));
  for (let index = 0; index < n; index++) if (lengths[index] > 0) grid.insertBox(boxes[index], index);

  const paramOn = (index: number, p: Point2D) => dot({ x: p.x - strips[index].start.x, y: p.y - strips[index].start.y }, dirs[index]);
  const offAxis = (index: number, p: Point2D) => Math.abs(cross(dirs[index], { x: p.x - strips[index].start.x, y: p.y - strips[index].start.y }));

  // Abouts : un nœud posé sur l'intérieur d'une bande (hors de ses extrémités).
  for (const node of nodes) {
    const members = new Set(node.ends.map((end) => end.strip));
    for (const index of grid.queryPoint(node.point)) {
      if (members.has(index)) continue;
      const t = paramOn(index, node.point);
      if (t > tolerance && t < lengths[index] - tolerance && offAxis(index, node.point) <= tolerance) node.through.push(index);
    }
  }

  // 3. Coins à chaque nœud.
  const ends: { start?: StripEnd; end?: StripEnd }[] = strips.map(() => ({}));
  const junctions: StripJunction[] = [];
  for (const node of nodes) {
    const edges: Edge[] = [];
    for (const end of node.ends) {
      const dir = end.which === "start" ? dirs[end.strip] : { x: -dirs[end.strip].x, y: -dirs[end.strip].y };
      edges.push({ dir, half: strips[end.strip].halfWidth, reach: lengths[end.strip], end, angle: Math.atan2(dir.y, dir.x) });
    }
    for (const index of node.through) {
      const t = paramOn(index, node.point);
      const d = dirs[index];
      edges.push({ dir: d, half: strips[index].halfWidth, reach: lengths[index] - t, end: null, angle: Math.atan2(d.y, d.x) });
      edges.push({ dir: { x: -d.x, y: -d.y }, half: strips[index].halfWidth, reach: t, end: null, angle: Math.atan2(-d.y, -d.x) });
    }
    const virtual = node.through.length > 0;
    const p = node.point;
    if (edges.length === 1) {
      const edge = edges[0];
      edge.left = add(p, leftNormal(edge.dir), edge.half);
      edge.right = add(p, leftNormal(edge.dir), -edge.half);
    } else {
      edges.sort((x, y) => x.angle - y.angle);
      for (let i = 0; i < edges.length; i++) {
        const current = edges[i];
        const next = edges[(i + 1) % edges.length];
        const leftStart = add(p, leftNormal(current.dir), current.half);
        const rightStart = add(p, leftNormal(next.dir), -next.half);
        const hit = lineIntersection(leftStart, current.dir, rightStart, next.dir);
        const limit = miterLimit * Math.max(current.half, next.half);
        // Coin intérieur (en avant du nœud) : toujours l'onglet, tant qu'il reste sur les deux
        // bandes — le biseauter ferait chevaucher deux bandes presque parallèles. Coin extérieur
        // (en arrière) : onglet borné par `miterLimit`, sinon biseau.
        const usable = hit && (hit.t >= 0 && hit.s >= 0
          ? hit.t <= current.reach && hit.s <= next.reach
          : distance(hit.point, p) <= limit);
        if (usable) {
          current.left = hit.point; next.right = hit.point;
        } else {
          current.left = leftStart; next.right = rightStart;
          // Onglet trop long (ou bandes superposées) : biseau — le triangle nœud / deux coins
          // appartient à l'arête courante, le nœud entre dans les deux contours.
          if (hit || dot(current.dir, next.dir) > 0) { current.bevel = true; next.bevel = true; current.bevelTip = rightStart; }
        }
      }
    }
    const real = edges.filter((edge) => edge.end);
    for (const edge of real) {
      const end = edge.end!;
      let join: StripEndJoin;
      if (edges.length === 1) join = "libre";
      else if (virtual) join = "about";
      else if (edge.bevel) join = "biseau";
      else if (edges.length === 2) join = Math.abs(cross(edges[0].dir, edges[1].dir)) < 1e-6 ? "prolongement" : "onglet";
      else join = "eventail";
      const withNode = edges.length >= 2 && (!virtual || edge.bevel === true) && join !== "prolongement";
      // Bout, dans le repère de l'arête : gauche → [pointe de biseau] → [nœud] → droite. C'est
      // aussi l'ordre du contour de la bande à ses deux bouts (voir `polygon`).
      const cap = [...(edge.bevelTip ? [edge.bevelTip] : []), ...(withNode ? [p] : [])];
      const stripEnd: StripEnd = end.which === "start"
        ? { left: edge.left!, right: edge.right!, cap, join }
        : { left: edge.right!, right: edge.left!, cap, join };
      ends[end.strip][end.which] = stripEnd;
    }
    // Jonctions.
    const stripsHere = [...new Set([...node.ends.map((end) => end.strip), ...node.through])];
    if (stripsHere.length >= 2) {
      let kind: StripJunctionKind;
      if (virtual) {
        const sides = new Set(real.map((edge) => Math.sign(cross(dirs[node.through[0]], edge.dir))));
        kind = node.through.length === 1 && sides.size === 2 ? "X" : node.through.length === 1 ? "T" : "multiple";
      } else if (edges.length === 2) {
        kind = Math.abs(cross(edges[0].dir, edges[1].dir)) < 1e-6 ? "prolongement" : "L";
      } else {
        const collinearPairs = edges.flatMap((x, i) => edges.slice(i + 1).filter((y) => dot(x.dir, y.dir) < -0.9999).map(() => 1)).length;
        kind = edges.length === 3 && collinearPairs >= 1 ? "T" : edges.length === 4 && collinearPairs >= 2 ? "X" : "multiple";
      }
      junctions.push({ point: p, kind, strips: stripsHere });
    }
  }

  // 4. Contours, zones engagées.
  const obstructions: StripObstruction[][] = strips.map(() => []);
  const cutBy: number[][] = strips.map(() => []);
  const outlines: StripOutline[] = strips.map((strip, index) => {
    if (lengths[index] === 0) return { polygon: [], start: emptyEnd(strip.start), end: emptyEnd(strip.end), clearFrom: 0, clearTo: 0, obstructions: [], cutBy: [] };
    const start = ends[index].start!;
    const end = ends[index].end!;
    const polygon: Point2D[] = [start.right, end.right, ...end.cap, end.left, start.left, ...start.cap];
    const startPoints = [start.left, start.right, ...start.cap];
    const endPoints = [end.left, end.right, ...end.cap];
    const clearFrom = start.join === "libre" ? 0 : Math.max(0, ...startPoints.map((q) => paramOn(index, q)));
    const clearTo = end.join === "libre" ? lengths[index] : Math.min(lengths[index], ...endPoints.map((q) => paramOn(index, q)));
    return { polygon: dedupe(polygon), start, end, clearFrom, clearTo, obstructions: obstructions[index], cutBy: cutBy[index] };
  });

  // Abouts : emprise de la bande qui aboute, projetée sur l'axe de la traversante.
  for (const node of nodes) {
    for (const through of node.through) {
      for (const endRef of node.ends) {
        const stripEnd = ends[endRef.strip][endRef.which]!;
        const params = [stripEnd.left, stripEnd.right, node.point].map((q) => paramOn(through, q));
        // Largeur de l'about le long de la traversante : la bande qui aboute, coupée par l'axe.
        const sinus = Math.abs(cross(dirs[through], dirs[endRef.strip])) || 1;
        const half = strips[endRef.strip].halfWidth / sinus;
        const t = paramOn(through, node.point);
        params.push(t - half, t + half);
        obstructions[through].push({ from: Math.min(...params), to: Math.max(...params), by: endRef.strip, kind: "T" });
      }
    }
  }
  // Croisements : intérieurs qui se coupent (hors nœuds et abouts déjà traités).
  for (let i = 0; i < n; i++) {
    if (lengths[i] === 0) continue;
    for (const j of grid.queryBox(boxes[i])) {
      if (j <= i || lengths[j] === 0) continue;
      const hit = lineIntersection(strips[i].start, dirs[i], strips[j].start, dirs[j]);
      if (!hit) continue;
      if (hit.t <= tolerance || hit.t >= lengths[i] - tolerance || hit.s <= tolerance || hit.s >= lengths[j] - tolerance) continue;
      const sinus = Math.abs(cross(dirs[i], dirs[j]));
      obstructions[i].push({ from: hit.t - strips[j].halfWidth / sinus, to: hit.t + strips[j].halfWidth / sinus, by: j, kind: "X" });
      obstructions[j].push({ from: hit.s - strips[i].halfWidth / sinus, to: hit.s + strips[i].halfWidth / sinus, by: i, kind: "X" });
      cutBy[j].push(i);
      junctions.push({ point: hit.point, kind: "X", strips: [i, j] });
    }
  }
  for (const list of obstructions) list.sort((x, y) => x.from - y.from);
  return { outlines, junctions };
}

function emptyEnd(p: Point2D): StripEnd {
  return { left: p, right: p, cap: [], join: "libre" };
}

function dedupe(points: Point2D[]): Point2D[] {
  const out: Point2D[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || distance(last, point) > 1e-9) out.push(point);
  }
  if (out.length > 1 && distance(out[0], out[out.length - 1]) <= 1e-9) out.pop();
  return out;
}

// ── Découpe le long de l'axe ─────────────────────────────────────────────────

/** Coupe un polygone par le demi-plan `dot(p - origin, u) >= offset` (Sutherland–Hodgman). */
function clipHalfPlane(polygon: readonly Point2D[], origin: Point2D, u: Vector2D, offset: number, keepAbove: boolean): Point2D[] {
  const value = (p: Point2D) => (dot({ x: p.x - origin.x, y: p.y - origin.y }, u) - offset) * (keepAbove ? 1 : -1);
  const out: Point2D[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const vc = value(current); const vn = value(next);
    if (vc >= 0) out.push(current);
    if ((vc >= 0) !== (vn >= 0)) {
      const k = vc / (vc - vn);
      out.push({ x: current.x + (next.x - current.x) * k, y: current.y + (next.y - current.y) * k });
    }
  }
  return dedupe(out);
}

/**
 * Parties pleines d'une bande interrompue par des baies : `gaps` = intervalles d'axe [from, to]
 * (distance depuis `start`) à retirer. Chaque partie est le contour raccordé, coupé
 * perpendiculairement à l'axe au droit des baies (tableaux droits).
 */
export function stripSolidParts(
  polygon: readonly Point2D[], strip: Strip, gaps: readonly { readonly from: number; readonly to: number }[], cutters: readonly Strip[] = [],
): Point2D[][] {
  if (polygon.length < 3) return [];
  let parts = cutAlongAxis(polygon, strip, gaps);
  // Croisements : l'emprise de chaque bande coupante est retirée (ses deux faces coupent la pièce).
  for (const cutter of cutters) {
    const d = unit(cutter.start, cutter.end);
    const normal = leftNormal(d);
    parts = parts.flatMap((part) => [
      clipHalfPlane(part, cutter.start, normal, cutter.halfWidth, true),
      clipHalfPlane(part, cutter.start, normal, -cutter.halfWidth, false),
    ]).filter((part) => part.length >= 3 && Math.abs(signedArea(part)) > 1e-6);
  }
  return parts;
}

function signedArea(points: readonly Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]; const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

function cutAlongAxis(polygon: readonly Point2D[], strip: Strip, gaps: readonly { readonly from: number; readonly to: number }[]): Point2D[][] {
  if (gaps.length === 0) return [[...polygon]];
  const u = unit(strip.start, strip.end);
  const sorted = [...gaps].filter((gap) => gap.to > gap.from).sort((x, y) => x.from - y.from);
  const parts: Point2D[][] = [];
  let from = -Infinity;
  for (const gap of sorted) {
    if (gap.from > from) {
      let piece = polygon;
      if (Number.isFinite(from)) piece = clipHalfPlane(piece, strip.start, u, from, true);
      piece = clipHalfPlane(piece, strip.start, u, gap.from, false);
      if (piece.length >= 3) parts.push(piece as Point2D[]);
    }
    from = Math.max(from, gap.to);
  }
  const last = clipHalfPlane(polygon, strip.start, u, from, true);
  if (last.length >= 3) parts.push(last);
  return parts;
}

/** Faces gauche et droite de la bande raccordée (segments entre les coins d'extrémité). */
export function stripFaces(outline: StripOutline): { left: { start: Point2D; end: Point2D }; right: { start: Point2D; end: Point2D } } {
  return { left: { start: outline.start.left, end: outline.end.left }, right: { start: outline.start.right, end: outline.end.right } };
}
