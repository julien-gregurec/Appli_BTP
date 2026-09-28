/**
 * Relevé Lot 6 — PRÉPARATION de l'export DXF (non exposé dans l'écran : lot export).
 *
 * Écrivain DXF ASCII R12 (AC1009, lu par tous les logiciels de DAO) du modèle d'export
 * géométrique : mêmes calques que le SVG (MURS, OUVERTURES, PIECES, COTES, PHOTOS), unités mm
 * ($INSUNITS = 4), repère Y haut natif (aucune symétrie). Polygones → POLYLINE fermée, segments →
 * LINE (tirets : type de ligne DASHED), arcs → ARC (degrés, sens trigonométrique natif), textes →
 * TEXT. Aucune approximation : les coordonnées sont celles du plan.
 */
import type { PlanDocument, PlanExportEntity } from "@elsatia/releve-domain";
import { PLAN_EXPORT_LAYERS } from "@elsatia/releve-domain";
import { planGeometryEntities, type PlanGeometryExportOptions } from "./export-entities";

const deg = (radians: number) => ((((radians * 180) / Math.PI) % 360) + 360) % 360;
const num = (value: number) => String(Math.round(value * 1000) / 1000);
const pair = (code: number, value: string | number) => `${code}\n${typeof value === "number" ? num(value) : value}\n`;
/** DXF R12 : texte sur une ligne, sans caractère de contrôle. */
const clean = (text: string) => text.replace(/[\r\n\t]/g, " ");

function entity(e: PlanExportEntity): string {
  switch (e.kind) {
    case "line":
      return pair(0, "LINE") + pair(8, e.layer) + (e.style === "tirets" ? pair(6, "DASHED") : "")
        + pair(10, e.a.x) + pair(20, e.a.y) + pair(30, 0) + pair(11, e.b.x) + pair(21, e.b.y) + pair(31, 0);
    case "arc":
      return pair(0, "ARC") + pair(8, e.layer) + pair(10, e.centre.x) + pair(20, e.centre.y) + pair(30, 0) + pair(40, e.radius)
        + pair(50, deg(e.start)) + pair(51, deg(e.end));
    case "polygon":
      return pair(0, "POLYLINE") + pair(8, e.layer) + pair(66, 1) + pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(70, 1)
        + e.points.map((p) => pair(0, "VERTEX") + pair(8, e.layer) + pair(10, p.x) + pair(20, p.y) + pair(30, 0)).join("")
        + pair(0, "SEQEND") + pair(8, e.layer);
    case "text":
      return pair(0, "TEXT") + pair(8, e.layer) + pair(10, e.at.x) + pair(20, e.at.y) + pair(30, 0) + pair(40, 180) + pair(1, clean(e.text));
  }
}

export function planToDxf(document: PlanDocument, options: PlanGeometryExportOptions = {}): string {
  const header = pair(0, "SECTION") + pair(2, "HEADER") + pair(9, "$ACADVER") + pair(1, "AC1009") + pair(9, "$INSUNITS") + pair(70, 4) + pair(0, "ENDSEC");
  const ltypes = pair(0, "TABLE") + pair(2, "LTYPE") + pair(70, 2)
    + pair(0, "LTYPE") + pair(2, "CONTINUOUS") + pair(70, 0) + pair(3, "Continu") + pair(72, 65) + pair(73, 0) + pair(40, 0)
    + pair(0, "LTYPE") + pair(2, "DASHED") + pair(70, 0) + pair(3, "Tirets") + pair(72, 65) + pair(73, 2) + pair(40, 100) + pair(49, 60) + pair(49, -40)
    + pair(0, "ENDTAB");
  const layers = pair(0, "TABLE") + pair(2, "LAYER") + pair(70, PLAN_EXPORT_LAYERS.length)
    + PLAN_EXPORT_LAYERS.map((layer, index) => pair(0, "LAYER") + pair(2, layer) + pair(70, 0) + pair(62, index + 1) + pair(6, "CONTINUOUS")).join("")
    + pair(0, "ENDTAB");
  const tables = pair(0, "SECTION") + pair(2, "TABLES") + ltypes + layers + pair(0, "ENDSEC");
  const entities = pair(0, "SECTION") + pair(2, "ENTITIES") + planGeometryEntities(document, options).map(entity).join("") + pair(0, "ENDSEC");
  return header + tables + entities + pair(0, "EOF");
}
