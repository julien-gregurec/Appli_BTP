export class CalculationError extends Error {}

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CalculationError(`${label} doit être supérieur à zéro.`);
  }
}

export function rectangleDiagonal(length: number, width: number) {
  positive(length, "La longueur");
  positive(width, "La largeur");
  return Math.hypot(length, width);
}

export function rightTriangle(input: { a?: number; b?: number; c?: number }) {
  const entries = [input.a, input.b, input.c];
  if (entries.filter((value) => value !== undefined).length !== 2) {
    throw new CalculationError("Renseignez exactement deux côtés.");
  }
  entries.forEach((value) => value !== undefined && positive(value, "Chaque côté"));

  if (input.c === undefined) return { ...input, c: Math.hypot(input.a!, input.b!) };
  const knownLeg = input.a ?? input.b!;
  if (input.c <= knownLeg) {
    throw new CalculationError("L’hypoténuse doit être le plus grand côté.");
  }
  const missing = Math.sqrt(input.c ** 2 - knownLeg ** 2);
  return input.a === undefined ? { a: missing, b: input.b, c: input.c } : { a: input.a, b: missing, c: input.c };
}

export function slopeFromPercent(run: number, percent: number) {
  positive(run, "La longueur");
  if (!Number.isFinite(percent)) throw new CalculationError("La pente est invalide.");
  return { rise: run * percent / 100, degrees: Math.atan(percent / 100) * 180 / Math.PI };
}

export type SlopeInput =
  | { mode: "percent-from-run"; run: number; percent: number }
  | { mode: "percent-from-rise"; run: number; rise: number }
  | { mode: "run-from-rise"; rise: number; percent: number }
  | { mode: "degrees-from-run"; run: number; degrees: number };

export function solveSlope(input: SlopeInput) {
  let run: number;
  let rise: number;
  let percent: number;
  if (input.mode === "percent-from-run") {
    positive(input.run, "La longueur horizontale");
    if (!Number.isFinite(input.percent)) throw new CalculationError("La pente est invalide.");
    run = input.run; percent = input.percent; rise = run * percent / 100;
  } else if (input.mode === "percent-from-rise") {
    positive(input.run, "La longueur horizontale");
    if (!Number.isFinite(input.rise) || input.rise < 0) throw new CalculationError("Le dénivelé est invalide.");
    run = input.run; rise = input.rise; percent = rise / run * 100;
  } else if (input.mode === "run-from-rise") {
    positive(input.rise, "Le dénivelé");
    positive(input.percent, "La pente");
    rise = input.rise; percent = input.percent; run = rise / (percent / 100);
  } else {
    positive(input.run, "La longueur horizontale");
    if (!Number.isFinite(input.degrees) || Math.abs(input.degrees) >= 90) throw new CalculationError("L’angle doit être compris entre -90° et 90°.");
    run = input.run; percent = Math.tan(input.degrees * Math.PI / 180) * 100; rise = run * percent / 100;
  }
  const degrees = Math.atan(percent / 100) * 180 / Math.PI;
  return { run, rise, percent, degrees, slopeLength: Math.hypot(run, rise) };
}

export function rectangleArea(length: number, width: number) {
  positive(length, "La longueur");
  positive(width, "La largeur");
  return length * width;
}

export function circle(input: { radius?: number; diameter?: number }) {
  const radius = input.radius ?? (input.diameter === undefined ? undefined : input.diameter / 2);
  if (radius === undefined || (input.radius !== undefined && input.diameter !== undefined)) {
    throw new CalculationError("Renseignez le rayon ou le diamètre.");
  }
  positive(radius, "Le rayon");
  return createCircleGeometry(radius);
}

export function distribute(input: { total: number; count: number; elementWidth: number; startGap?: number; endGap?: number }) {
  const { total, count, elementWidth, startGap = 0, endGap = 0 } = input;
  positive(total, "La longueur totale");
  positive(count, "Le nombre d’éléments");
  positive(elementWidth, "La largeur d’un élément");
  if (!Number.isInteger(count)) throw new CalculationError("Le nombre d’éléments doit être entier.");
  if (startGap < 0 || endGap < 0) throw new CalculationError("Les jeux ne peuvent pas être négatifs.");
  const free = total - startGap - endGap - count * elementWidth;
  if (free < 0) throw new CalculationError("Les éléments ne tiennent pas dans la longueur disponible.");
  const gap = count === 1 ? 0 : free / (count - 1);
  return {
    gap,
    pitch: elementWidth + gap,
    positions: Array.from({ length: count }, (_, index) => startGap + index * (elementWidth + gap)),
    unused: count === 1 ? free : 0,
  };
}

export function distributeAdvanced(input: { total: number; count: number; elementWidth?: number; separatorWidth?: number; startGap?: number; endGap?: number }) {
  const { total, count, separatorWidth = 0, startGap = 0, endGap = 0 } = input;
  positive(total, "La longueur totale");
  positive(count, "Le nombre d’éléments");
  if (!Number.isInteger(count)) throw new CalculationError("Le nombre d’éléments doit être entier.");
  if ([separatorWidth, startGap, endGap].some((value) => !Number.isFinite(value) || value < 0)) throw new CalculationError("Les jeux et séparateurs ne peuvent pas être négatifs.");
  const fixedWithoutElements = startGap + endGap + Math.max(0, count - 1) * separatorWidth;
  let elementWidth: number;
  let gap: number;
  if (input.elementWidth === undefined) {
    elementWidth = (total - fixedWithoutElements) / count;
    positive(elementWidth, "La largeur calculée");
    gap = separatorWidth;
  } else {
    positive(input.elementWidth, "La largeur d’un élément");
    elementWidth = input.elementWidth;
    const extra = total - fixedWithoutElements - count * elementWidth;
    if (extra < 0) throw new CalculationError("Les éléments ne tiennent pas dans la longueur disponible.");
    gap = separatorWidth + (count > 1 ? extra / (count - 1) : 0);
  }
  const pitch = elementWidth + gap;
  const positions = Array.from({ length: count }, (_, index) => startGap + index * pitch);
  const controlTotal = startGap + endGap + count * elementWidth + Math.max(0, count - 1) * gap;
  return { elementWidth, gap, pitch, positions, controlTotal };
}

export function rightAngle345(referenceA: number) {
  positive(referenceA, "La longueur de référence");
  return { a: referenceA, b: referenceA * 4 / 3, c: referenceA * 5 / 3 };
}

export function arcFromChordRise(chord: number, rise: number) {
  positive(chord, "La corde");
  positive(rise, "La flèche");
  return createSegmentalArchGeometry(chord, rise);
}

export type SpacingInput = { total: number; maxSpacing: number; startRetreat?: number; endRetreat?: number; includeStart?: boolean; includeEnd?: boolean };
export function distributeByMaximumSpacing(input: SpacingInput) {
  const { total, maxSpacing, startRetreat = 0, endRetreat = 0, includeStart = true, includeEnd = true } = input;
  positive(total, "La longueur totale");
  positive(maxSpacing, "L’entraxe maximum");
  if (startRetreat < 0 || endRetreat < 0) throw new CalculationError("Les retraits ne peuvent pas être négatifs.");
  const available = total - startRetreat - endRetreat;
  positive(available, "La longueur disponible");
  const intervals = Math.max(1, Math.ceil(available / maxSpacing));
  const actualSpacing = available / intervals;
  const allPositions = Array.from({ length: intervals + 1 }, (_, index) => startRetreat + index * actualSpacing);
  const positions = allPositions.filter((_, index) => (includeStart || index > 0) && (includeEnd || index < intervals));
  return { intervals, elementCount: positions.length, actualSpacing, positions, available };
}

export function distributeGlazing(input: { total: number; paneCount: number; mullionWidth: number; clearancePerSide: number; startFrame?: number; endFrame?: number }) {
  const { total, paneCount, mullionWidth, clearancePerSide, startFrame = 0, endFrame = 0 } = input;
  positive(total, "La longueur totale");
  positive(paneCount, "Le nombre de vitrages");
  if (!Number.isInteger(paneCount)) throw new CalculationError("Le nombre de vitrages doit être entier.");
  if ([mullionWidth, clearancePerSide, startFrame, endFrame].some((value) => !Number.isFinite(value) || value < 0)) throw new CalculationError("Les largeurs et jeux doivent être positifs.");
  const mullionTotal = Math.max(0, paneCount - 1) * mullionWidth + startFrame + endFrame;
  const clearanceTotal = paneCount * clearancePerSide * 2;
  const paneWidth = (total - mullionTotal - clearanceTotal) / paneCount;
  positive(paneWidth, "La largeur de vitrage disponible");
  const moduleWidth = paneWidth + clearancePerSide * 2;
  const positions = Array.from({ length: paneCount }, (_, index) => startFrame + index * (moduleWidth + mullionWidth) + clearancePerSide);
  const controlTotal = paneCount * paneWidth + clearanceTotal + mullionTotal;
  return { paneWidth, moduleWidth, mullionTotal, clearanceTotal, positions, controlTotal };
}

export function estimateGlassWeight(input: { widthMm: number; heightMm: number; thicknessesMm: number[] }) {
  positive(input.widthMm, "La largeur");
  positive(input.heightMm, "La hauteur");
  const thicknesses = input.thicknessesMm.filter((value) => Number.isFinite(value) && value > 0);
  if (thicknesses.length === 0) throw new CalculationError("Renseignez au moins une épaisseur de verre.");
  const totalThickness = thicknesses.reduce((sum, value) => sum + value, 0);
  const area = input.widthMm / 1000 * (input.heightMm / 1000);
  const massPerSquareMetre = totalThickness * 2.5;
  return { area, totalThickness, massPerSquareMetre, estimatedWeight: area * massPerSquareMetre };
}

function validWaste(wastePercent: number) {
  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 100) throw new CalculationError("La marge doit être comprise entre 0 et 100 %.");
}

export function estimatePanels(input: { area: number; panelWidth: number; panelHeight: number; wastePercent: number }) {
  positive(input.area, "La surface à couvrir");
  positive(input.panelWidth, "La largeur de plaque");
  positive(input.panelHeight, "La hauteur de plaque");
  validWaste(input.wastePercent);
  const panelArea = input.panelWidth * input.panelHeight;
  const areaWithWaste = input.area * (1 + input.wastePercent / 100);
  return { panelArea, areaWithWaste, theoreticalCount: areaWithWaste / panelArea, minimumCount: Math.ceil(areaWithWaste / panelArea) };
}

export function estimatePaint(input: { grossArea: number; openingsArea: number; yieldPerLitre: number; coats: number; marginPercent: number }) {
  positive(input.grossArea, "La surface brute");
  if (!Number.isFinite(input.openingsArea) || input.openingsArea < 0 || input.openingsArea >= input.grossArea) throw new CalculationError("La surface des ouvertures doit être inférieure à la surface brute.");
  positive(input.yieldPerLitre, "Le rendement");
  positive(input.coats, "Le nombre de couches");
  if (!Number.isInteger(input.coats)) throw new CalculationError("Le nombre de couches doit être entier.");
  validWaste(input.marginPercent);
  const netArea = input.grossArea - input.openingsArea;
  const cumulativeArea = netArea * input.coats;
  const litres = cumulativeArea / input.yieldPerLitre * (1 + input.marginPercent / 100);
  return { netArea, cumulativeArea, litres };
}

export function insulationResistance(thicknessMm: number, lambda: number) {
  positive(thicknessMm, "L’épaisseur");
  positive(lambda, "Le lambda");
  const thicknessMetres = thicknessMm / 1000;
  return { thicknessMetres, resistance: thicknessMetres / lambda };
}

export function segmentalArch(width: number, rise: number) {
  positive(width, "La largeur");
  positive(rise, "La hauteur de l’arrondi");
  return createSegmentalArchGeometry(width, rise);
}

export function roundForDisplay(value: number, decimals = 1) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals }).format(value);
}
import { createCircleGeometry, createSegmentalArchGeometry } from "./geometry/models";
