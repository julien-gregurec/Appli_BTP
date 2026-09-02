export type LengthUnit = "mm" | "cm" | "m" | "in";
export type AreaUnit = "mm²" | "cm²" | "m²";
export type VolumeUnit = "cm³" | "m³" | "L";

const lengthInMillimetres: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1_000,
  in: 25.4,
};

const areaInSquareMillimetres: Record<AreaUnit, number> = {
  "mm²": 1,
  "cm²": 100,
  "m²": 1_000_000,
};

const volumeInCubicCentimetres: Record<VolumeUnit, number> = {
  "cm³": 1,
  L: 1_000,
  "m³": 1_000_000,
};

export function convertLength(value: number, from: LengthUnit, to: LengthUnit) {
  return (value * lengthInMillimetres[from]) / lengthInMillimetres[to];
}

export function convertArea(value: number, from: AreaUnit, to: AreaUnit) {
  return (value * areaInSquareMillimetres[from]) / areaInSquareMillimetres[to];
}

export function convertVolume(value: number, from: VolumeUnit, to: VolumeUnit) {
  return (value * volumeInCubicCentimetres[from]) / volumeInCubicCentimetres[to];
}

export function percentToDegrees(percent: number) {
  return Math.atan(percent / 100) * (180 / Math.PI);
}

export function degreesToPercent(degrees: number) {
  return Math.tan(degrees * (Math.PI / 180)) * 100;
}
