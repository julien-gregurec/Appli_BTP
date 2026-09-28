/**
 * Relevé Lot 7 — symboles des objets du plan (conventions du dessin de bâtiment), en coordonnées
 * MONDE (mm, Y haut), prêts pour le rendu SVG mémorisé et pour l'export (SVG, DXF, PDF).
 *
 * Chaque symbole = contour de l'objet (rectangle orienté) + marques intérieures propres à son type :
 * cuvette de WC, vasque, siphon de douche, oreiller de lit, dossier de canapé, feux de plaque,
 * ailettes de radiateur, prise, interrupteur, etc. Primitives : segments (trait / tirets), cercles,
 * polygones fermés — toutes natives en SVG, PDF et DXF.
 */
import type { PlanEquipement } from "@elsatia/releve-domain";
import type { Point2D } from "@/lib/geometry/engine/types";
import { footprint, localToWorld } from "./equipments";

export type EquipmentSymbol = {
  outline: Point2D[];
  lines: { a: Point2D; b: Point2D; style?: "trait" | "tirets" }[];
  circles: { centre: Point2D; radius: number }[];
  polygons: Point2D[][];
};

type Local = { lines: [number, number, number, number, ("tirets")?][]; circles: [number, number, number][]; polygons: [number, number][][] };

/** Ellipse approchée (polygone) — cuvette, vasque. */
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 16): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
}
function rect(x0: number, y0: number, x1: number, y1: number): [number, number][] { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }

/** Marques intérieures, repère local : largeur X ∈ [−w, w], profondeur Y ∈ [−d, d], dos en −d. */
function marks(objet: string, w: number, d: number): Local {
  const out: Local = { lines: [], circles: [], polygons: [] };
  const m = Math.min(w, d);
  switch (objet) {
    case "wc": out.polygons.push(rect(-w, -d, w, -d + d * 0.3), ellipse(0, d * 0.2, w * 0.8, d * 0.65)); break;
    case "lavabo": case "lave_mains": case "urinoir": out.polygons.push(ellipse(0, d * 0.1, w * 0.75, d * 0.7)); out.circles.push([0, 0, m * 0.08]); break;
    case "evier": out.polygons.push(rect(-w * 0.9, -d * 0.8, w * 0.05, d * 0.8)); for (let i = 1; i <= 4; i++) out.lines.push([w * 0.2, -d * 0.7 + (i * d * 1.4) / 5, w * 0.9, -d * 0.7 + (i * d * 1.4) / 5]); out.circles.push([-w * 0.42, 0, m * 0.1]); break;
    case "douche": out.lines.push([-w, -d, w, d], [-w, d, w, -d]); out.circles.push([0, 0, m * 0.12]); break;
    case "baignoire": out.polygons.push(rect(-w * 0.9, -d * 0.75, w * 0.9, d * 0.75)); out.circles.push([-w * 0.75, 0, m * 0.08]); break;
    case "lit": out.polygons.push(rect(-w * 0.85, -d * 0.95, w * 0.85, -d * 0.7)); out.lines.push([-w, -d * 0.35, w, -d * 0.35]); break;
    case "canape": out.polygons.push(rect(-w, -d, w, -d * 0.45), rect(-w, -d * 0.45, -w * 0.85, d), rect(w * 0.85, -d * 0.45, w, d)); break;
    case "chaise": out.lines.push([-w, -d * 0.7, w, -d * 0.7]); break;
    case "armoire": case "placard": case "dressing": out.lines.push([-w, -d, w, d, "tirets"], [-w, d, w, -d, "tirets"], [-w, 0, w, 0]); break;
    case "etagere": for (let i = 1; i <= 3; i++) out.lines.push([-w, -d + (i * 2 * d) / 4, w, -d + (i * 2 * d) / 4]); break;
    case "meuble": case "meuble_bas": out.lines.push([-w, d * 0.8, w, d * 0.8]); break;
    case "meuble_haut": out.lines.push([-w, -d, w, d, "tirets"], [-w, d, w, -d, "tirets"]); break;
    case "plan_travail": out.lines.push([-w, d * 0.85, w, d * 0.85]); break;
    case "refrigerateur": out.lines.push([-w, -d, w, d]); out.polygons.push(rect(-w * 0.2, -d * 0.1, w * 0.2, d * 0.1)); break;
    case "four": out.polygons.push(rect(-w * 0.75, -d * 0.6, w * 0.75, d * 0.75)); break;
    case "plaque": for (const [x, y] of [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45]]) out.circles.push([x * w, y * d, m * 0.3]); break;
    case "radiateur": for (let i = 1; i < 10; i++) out.lines.push([-w + (i * 2 * w) / 10, -d, -w + (i * 2 * w) / 10, d]); break;
    case "climatiseur": out.lines.push([-w * 0.9, d * 0.3, w * 0.9, d * 0.3], [-w * 0.9, d * 0.6, w * 0.9, d * 0.6]); break;
    case "vmc": out.circles.push([0, 0, m * 0.8]); out.lines.push([-w * 0.6, 0, w * 0.6, 0], [0, -d * 0.6, 0, d * 0.6]); break;
    case "tableau_electrique": for (let i = -3; i <= 3; i++) out.lines.push([-w + ((i + 3) * 2 * w) / 7, -d, -w + ((i + 4) * 2 * w) / 7, d]); break;
    case "prise": out.circles.push([0, d * 0.2, m * 0.6]); out.lines.push([-w * 0.3, d * 0.2, -w * 0.3, d * 0.2 + m * 0.3], [w * 0.3, d * 0.2, w * 0.3, d * 0.2 + m * 0.3]); break;
    case "interrupteur": out.circles.push([0, d * 0.2, m * 0.6]); out.lines.push([0, d * 0.2, w * 0.9, d * 0.9]); break;
    case "chauffe_eau": case "extincteur": out.circles.push([0, 0, m * 0.8]); break;
    case "detecteur_fumee": out.circles.push([0, 0, m * 0.8], [0, 0, m * 0.2]); break;
    case "baes": out.lines.push([-w, -d, w, d], [-w, d, w, -d]); break;
    case "vanne": out.polygons.push([[-w, -d], [w, d], [w, -d], [-w, d]]); break;
    case "chaudiere": out.circles.push([0, 0, m * 0.6]); break;
    case "compteur": out.polygons.push(rect(-w * 0.6, -d * 0.2, w * 0.6, d * 0.5)); break;
    case "luminaire": out.circles.push([0, 0, m * 0.9]); out.lines.push([-w * 0.64, -d * 0.64, w * 0.64, d * 0.64], [-w * 0.64, d * 0.64, w * 0.64, -d * 0.64]); break;
    default: break;
  }
  return out;
}

export function equipmentSymbol(objet: PlanEquipement): EquipmentSymbol {
  const w = objet.largeurMm / 2; const d = objet.profondeurMm / 2;
  const local = marks(objet.objet, w, d);
  const world = (x: number, y: number) => localToWorld(objet, { x, y });
  return {
    outline: footprint(objet),
    lines: local.lines.map(([x1, y1, x2, y2, style]) => ({ a: world(x1, y1), b: world(x2, y2), style: style ?? "trait" })),
    circles: local.circles.map(([x, y, r]) => ({ centre: world(x, y), radius: r })),
    polygons: local.polygons.map((points) => points.map(([x, y]) => world(x, y))),
  };
}
