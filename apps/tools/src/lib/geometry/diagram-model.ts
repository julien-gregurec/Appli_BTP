import type { ToolId } from "../catalog";
import { distributeByMaximumSpacing, roundForDisplay, rightAngle345, solveSlope } from "../calculations";
import { createCircleGeometry, createSegmentalArchGeometry, type SegmentalArchGeometry } from "./models";

type TextAnnotation = { x: number; y: number; text: string; fontSize?: number; transform?: string };
export type DiagramModel =
  | { kind: "circle"; viewBox: string; cx: number; cy: number; radius: number; annotations: TextAnnotation[] }
  | { kind: "arch"; viewBox: string; geometry: SegmentalArchGeometry; margin: number; springY: number; bottomY: number; centreY: number; annotations: TextAnnotation[] }
  | { kind: "distribution"; viewBox: string; count: number; totalLabel: string; annotations: TextAnnotation[] }
  | { kind: "slope"; viewBox: string; runLabel: string; percentLabel: string; annotations: TextAnnotation[] }
  | { kind: "triangle"; viewBox: string; aLabel: string; bLabel: string; cLabel: string; annotations: TextAnnotation[] }
  | { kind: "rectangle"; viewBox: string; accentDiagonal: boolean; lengthLabel: string; widthLabel: string; unit: "m" | "mm"; annotations: TextAnnotation[] };

export function buildDiagramModel(id: ToolId, values: Record<string, string>): DiagramModel {
  if (id === "cercle") {
    const geometry = createCircleGeometry(Math.max(1, Number(values.diameter) / 2 || 1));
    return { kind: "circle", viewBox: "0 0 520 280", cx: 260, cy: 140, radius: 100, annotations: [{ x: 305, y: 130, text: `R ${roundForDisplay(geometry.radius)} mm` }, { x: 250, y: 157, text: "O" }] };
  }
  if (id === "arche" || id === "arc-corde-fleche") {
    const geometry = createSegmentalArchGeometry(Math.max(1, Number(id === "arche" ? values.width : values.chord) || 1), Math.max(1, Number(values.rise) || 1));
    const margin = Math.max(geometry.width * .12, 100);
    const springY = geometry.rise + margin;
    const centreY = springY + geometry.centreBelowSpring;
    const bottomY = Math.max(springY + geometry.width * .35, centreY + margin * .55);
    const fontSize = Math.max(geometry.width * .028, 26);
    return { kind: "arch", viewBox: `0 0 ${geometry.width + margin * 2} ${bottomY + margin * .5}`, geometry, margin, springY, bottomY, centreY, annotations: [
      { x: geometry.width / 2 + margin + geometry.width * .025, y: centreY + geometry.width * .015, text: "O", fontSize },
      { x: geometry.width / 2 + margin - geometry.width * .09, y: bottomY + margin * .42, text: `${roundForDisplay(geometry.width)} mm`, fontSize },
      { x: geometry.width / 2 + margin + geometry.width * .03, y: springY - geometry.rise * .48, text: `Flèche ${roundForDisplay(geometry.rise)} mm`, fontSize },
    ] };
  }
  if (id === "angle-droit-345") {
    const ratio = rightAngle345(Math.max(1, Number(values.referenceA) || 1));
    return { kind: "triangle", viewBox: "0 0 520 280", aLabel: `${roundForDisplay(ratio.a)} mm`, bLabel: `${roundForDisplay(ratio.b)} mm`, cLabel: `${roundForDisplay(ratio.c)} mm`, annotations: [] };
  }
  if (id === "repartition" || id === "repartition-vitrages") return { kind: "distribution", viewBox: "0 0 520 280", count: Math.max(1, Math.min(10, Number(id === "repartition" ? values.count : values.paneCount) || 1)), totalLabel: `${values.total} mm`, annotations: [] };
  if (id === "entraxes" || id === "fixations") {
    const layout = distributeByMaximumSpacing({ total: Number(values.total), maxSpacing: Number(values.maxSpacing), startRetreat: Number(values.startRetreat), endRetreat: Number(values.endRetreat), includeStart: id === "fixations" ? values.includeStart === "yes" : true, includeEnd: id === "fixations" ? values.includeEnd === "yes" : true });
    return { kind: "distribution", viewBox: "0 0 520 280", count: Math.max(1, Math.min(10, layout.elementCount)), totalLabel: `${values.total} mm · entraxe ${roundForDisplay(layout.actualSpacing, 1)} mm`, annotations: [] };
  }
  if (id === "pente") {
    const mode = values.mode;
    const result = mode === "percent-from-rise" ? solveSlope({ mode, run: Number(values.run), rise: Number(values.rise) }) : mode === "run-from-rise" ? solveSlope({ mode, rise: Number(values.rise), percent: Number(values.percent) }) : mode === "degrees-from-run" ? solveSlope({ mode, run: Number(values.run), degrees: Number(values.degrees) }) : solveSlope({ mode: "percent-from-run", run: Number(values.run), percent: Number(values.percent) });
    return { kind: "slope", viewBox: "0 0 520 280", runLabel: `${roundForDisplay(result.run)} mm horizontal`, percentLabel: `${roundForDisplay(result.percent, 2)} % · ${roundForDisplay(result.rise)} mm`, annotations: [] };
  }
  const unit = id === "surface-rectangle" ? "m" : "mm";
  return { kind: "rectangle", viewBox: "0 0 520 280", accentDiagonal: id === "diagonale-rectangle" || id === "pythagore", lengthLabel: values.length || values.a, widthLabel: values.width || values.b, unit, annotations: [] };
}
