import { signedPolygonArea } from "./area";
import { segmentSegmentIntersection } from "./intersections";
import { distance } from "./measure";
import type { Point2D, Polygon2D, Segment2D } from "./types";

/**
 * Faces fermées d'un réseau de segments (graphe planaire) — brique générique d'Engine B.
 *
 * Aucun vocabulaire métier : le moteur ne sait pas qu'un segment est un mur ni qu'une face est
 * une pièce. Il répond à « quelles régions bornées ce réseau de traits enferme-t-il ? ».
 *
 * Méthode :
 * 1. chaque segment est coupé à ses intersections avec les autres (croisements et jonctions en T) ;
 * 2. les sommets distants de moins de `tolerance` sont fusionnés (relevé terrain : un coin
 *    « presque » fermé à 0,5 mm près est un coin fermé) ;
 * 3. les arêtes pendantes (sommet de degré 1) sont retirées itérativement : elles ne bordent
 *    aucune région ;
 * 4. parcours des demi-arêtes : au sommet d'arrivée, on repart par l'arête sortante qui suit la
 *    demi-arête retour dans le sens HORAIRE. Chaque cycle obtenu borde une face à sa gauche ;
 *    les faces bornées sont celles d'aire signée positive (sens trigonométrique), la face
 *    extérieure de chaque composante étant négative.
 *
 * Coût : O(n²) pour les intersections (préfiltre par boîtes), O(E log E) ensuite. Suffisant pour
 * quelques centaines de segments ; l'appelant évite de l'invoquer à chaque mouvement de pointeur.
 */

export type FaceDetectionOptions = {
  /** Distance de fusion des sommets (unités du modèle). */
  tolerance?: number;
  /** Aire minimale d'une face retenue (unités²) : écarte les faces dégénérées. */
  minArea?: number;
};

export type EnclosedFace = {
  polygon: Polygon2D;
  area: number;
  /** Index des segments d'entrée qui bordent la face. */
  segmentIndices: number[];
  /** Pour chaque arête `points[i] → points[i + 1]`, index du segment d'entrée qui la porte. */
  edgeSources: number[];
};

type Edge = { a: number; b: number; source: number };

function key(p: Point2D, tolerance: number): string {
  return `${Math.round(p.x / tolerance)}:${Math.round(p.y / tolerance)}`;
}

export function findEnclosedFaces(segments: readonly Segment2D[], options: FaceDetectionOptions = {}): EnclosedFace[] {
  const tolerance = options.tolerance ?? 0.5;
  const minArea = options.minArea ?? tolerance * tolerance * 4;

  // 1. Paramètres de coupe de chaque segment (0 et 1 inclus).
  const cuts: number[][] = segments.map(() => [0, 1]);
  const boxes = segments.map((s) => ({
    minX: Math.min(s.start.x, s.end.x) - tolerance, maxX: Math.max(s.start.x, s.end.x) + tolerance,
    minY: Math.min(s.start.y, s.end.y) - tolerance, maxY: Math.max(s.start.y, s.end.y) + tolerance,
  }));
  const paramOf = (s: Segment2D, p: Point2D) => {
    const dx = s.end.x - s.start.x; const dy = s.end.y - s.start.y;
    const len2 = dx * dx + dy * dy;
    return len2 === 0 ? 0 : ((p.x - s.start.x) * dx + (p.y - s.start.y) * dy) / len2;
  };
  const projectsOnto = (s: Segment2D, p: Point2D) => {
    const t = paramOf(s, p);
    if (t <= 0 || t >= 1) return null;
    const q = { x: s.start.x + t * (s.end.x - s.start.x), y: s.start.y + t * (s.end.y - s.start.y) };
    return distance(p, q) <= tolerance ? t : null;
  };
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const bi = boxes[i]; const bj = boxes[j];
      if (bi.maxX < bj.minX || bj.maxX < bi.minX || bi.maxY < bj.minY || bj.maxY < bi.minY) continue;
      const result = segmentSegmentIntersection(segments[i], segments[j], 1e-9);
      if (result.kind === "one") {
        const p = result.points[0];
        cuts[i].push(paramOf(segments[i], p));
        cuts[j].push(paramOf(segments[j], p));
      }
      // Jonctions « presque » en T (extrémité à moins de `tolerance` du trait voisin).
      for (const [host, other, hostIndex] of [[segments[i], segments[j], i], [segments[j], segments[i], j]] as const) {
        for (const end of [other.start, other.end]) {
          const t = projectsOnto(host, end);
          if (t !== null) cuts[hostIndex].push(t);
        }
      }
    }
  }

  // 2. Sommets fusionnés et arêtes dédoublonnées.
  const vertices: Point2D[] = [];
  const index = new Map<string, number>();
  const vertexOf = (p: Point2D) => {
    const k = key(p, tolerance);
    let id = index.get(k);
    if (id === undefined) {
      // Voisinage : une fusion à cheval sur deux cellules d'arrondi reste une fusion.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const near = index.get(`${Math.round(p.x / tolerance) + dx}:${Math.round(p.y / tolerance) + dy}`);
        if (near !== undefined && distance(vertices[near], p) <= tolerance) { id = near; break; }
      }
      if (id === undefined) { id = vertices.length; vertices.push(p); }
      index.set(k, id);
    }
    return id;
  };
  const edges: Edge[] = [];
  const seen = new Set<string>();
  segments.forEach((s, source) => {
    const ts = [...new Set(cuts[source].map((t) => Math.min(1, Math.max(0, t))))].sort((x, y) => x - y);
    let previous = vertexOf(s.start);
    for (let k = 1; k < ts.length; k++) {
      const p = { x: s.start.x + ts[k] * (s.end.x - s.start.x), y: s.start.y + ts[k] * (s.end.y - s.start.y) };
      const current = k === ts.length - 1 ? vertexOf(s.end) : vertexOf(p);
      if (current !== previous) {
        const edgeKey = previous < current ? `${previous}-${current}` : `${current}-${previous}`;
        if (!seen.has(edgeKey)) { seen.add(edgeKey); edges.push({ a: previous, b: current, source }); }
      }
      previous = current;
    }
  });

  // 3. Retrait des arêtes pendantes.
  const alive = edges.map(() => true);
  const degree = new Array<number>(vertices.length).fill(0);
  for (const e of edges) { degree[e.a]++; degree[e.b]++; }
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach((e, i) => {
      if (alive[i] && (degree[e.a] < 2 || degree[e.b] < 2)) {
        alive[i] = false; degree[e.a]--; degree[e.b]--; changed = true;
      }
    });
  }

  // 4. Demi-arêtes triées par angle autour de chaque sommet.
  type Half = { from: number; to: number; source: number; angle: number };
  const outgoing = new Map<number, Half[]>();
  edges.forEach((e, i) => {
    if (!alive[i]) return;
    for (const [from, to] of [[e.a, e.b], [e.b, e.a]] as const) {
      const angle = Math.atan2(vertices[to].y - vertices[from].y, vertices[to].x - vertices[from].x);
      const list = outgoing.get(from) ?? [];
      list.push({ from, to, source: e.source, angle });
      outgoing.set(from, list);
    }
  });
  for (const list of outgoing.values()) list.sort((x, y) => x.angle - y.angle);

  const visited = new Set<string>();
  const faces: EnclosedFace[] = [];
  const halfKey = (h: Half) => `${h.from}>${h.to}`;
  for (const list of outgoing.values()) {
    for (const start of list) {
      if (visited.has(halfKey(start))) continue;
      const cycle: Half[] = [];
      let current: Half | undefined = start;
      let guard = 0;
      while (current && !visited.has(halfKey(current)) && guard++ < 100_000) {
        visited.add(halfKey(current));
        cycle.push(current);
        const around: Half[] = outgoing.get(current.to) ?? [];
        const back = Math.atan2(vertices[current.from].y - vertices[current.to].y, vertices[current.from].x - vertices[current.to].x);
        // Premier départ dans le sens horaire après la demi-arête retour : plus grand angle < back.
        let next: Half | undefined;
        for (let k = around.length - 1; k >= 0; k--) {
          if (around[k].angle < back - 1e-12) { next = around[k]; break; }
        }
        current = next ?? around[around.length - 1];
      }
      if (cycle.length < 3 || current !== start) continue;
      const points = cycle.map((h) => vertices[h.from]);
      const area = signedPolygonArea(points);
      if (area > minArea) faces.push({ polygon: { points }, area, segmentIndices: [...new Set(cycle.map((h) => h.source))], edgeSources: cycle.map((h) => h.source) });
    }
  }
  return faces.sort((x, y) => y.area - x.area);
}

/** Point strictement intérieur à un polygone simple (règle pair-impair). */
export function pointInPolygon(point: Point2D, polygon: Polygon2D): boolean {
  const pts = polygon.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]; const b = pts[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Centre de gravité (surfacique) d'un polygone simple ; moyenne des sommets s'il est dégénéré. */
export function polygonCentroid(polygon: Polygon2D): Point2D {
  const pts = polygon.points;
  const area = signedPolygonArea(pts);
  if (Math.abs(area) < 1e-9) {
    return pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 });
  }
  let cx = 0; let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f; cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * Point garanti À L'INTÉRIEUR d'un polygone simple (le centroïde d'un L peut tomber dehors) :
 * centroïde s'il est intérieur, sinon milieu du plus large intervalle intérieur de l'horizontale
 * passant par le centroïde.
 */
export function interiorPoint(polygon: Polygon2D): Point2D {
  const centroid = polygonCentroid(polygon);
  if (pointInPolygon(centroid, polygon)) return centroid;
  const pts = polygon.points;
  const y = centroid.y;
  const xs: number[] = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]; const b = pts[j];
    if ((a.y > y) !== (b.y > y)) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
  }
  xs.sort((p, q) => p - q);
  let best: Point2D = centroid; let width = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (xs[k + 1] - xs[k] > width) { width = xs[k + 1] - xs[k]; best = { x: (xs[k] + xs[k + 1]) / 2, y }; }
  }
  return best;
}
