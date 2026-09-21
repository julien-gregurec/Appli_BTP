/**
 * §22 — Nomenclature projet.
 *
 * Agrège des longueurs (converties en mètres linéaires), des surfaces (m²) et des comptages
 * (unités). La qualité (`exact` / `estimate`) est conservée depuis la source : une longueur
 * développée ou une surface d'ellipse reste une estimation (cf. tracing-engine.md).
 */

import type { Quantity } from "../geometry/shape-model";

export type MaterialUnit = "ml" | "m²" | "u";
export type MaterialQuality = "exact" | "estimate";

export type MaterialLine = {
  id: string;
  label: string;
  quantity: number;
  unit: MaterialUnit;
  quality: MaterialQuality;
  note?: string;
};

export type NomenclatureInput = {
  lengthsMm?: readonly { id?: string; label: string; value: number; quality?: MaterialQuality; note?: string }[];
  surfacesM2?: readonly { id?: string; label: string; value: number; quality?: MaterialQuality; note?: string }[];
  counts?: readonly { id?: string; label: string; value: number; note?: string }[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildNomenclature(input: NomenclatureInput): MaterialLine[] {
  const lines: MaterialLine[] = [];

  for (const entry of input.lengthsMm ?? []) {
    if (!Number.isFinite(entry.value) || entry.value < 0) throw new Error(`Longueur invalide pour « ${entry.label} ».`);
    lines.push({
      id: entry.id ?? slug(entry.label),
      label: entry.label,
      quantity: round2(entry.value / 1000),
      unit: "ml",
      quality: entry.quality ?? "exact",
      note: entry.note,
    });
  }
  for (const entry of input.surfacesM2 ?? []) {
    if (!Number.isFinite(entry.value) || entry.value < 0) throw new Error(`Surface invalide pour « ${entry.label} ».`);
    lines.push({
      id: entry.id ?? slug(entry.label),
      label: entry.label,
      quantity: round2(entry.value),
      unit: "m²",
      quality: entry.quality ?? "estimate",
      note: entry.note,
    });
  }
  for (const entry of input.counts ?? []) {
    if (!Number.isInteger(entry.value) || entry.value < 0) throw new Error(`Comptage invalide pour « ${entry.label} ».`);
    lines.push({
      id: entry.id ?? slug(entry.label),
      label: entry.label,
      quantity: entry.value,
      unit: "u",
      quality: "exact",
      note: entry.note,
    });
  }
  return lines;
}

/** Adaptateur depuis les quantités publiées par une `ShapeGeometry` du moteur (§34). */
export function nomenclatureFromQuantities(quantities: readonly Quantity[]): MaterialLine[] {
  const input: NomenclatureInput = {
    lengthsMm: quantities
      .filter((quantity) => quantity.unit === "mm")
      .map((quantity) => ({ id: quantity.id, label: quantity.label, value: quantity.value, quality: quantity.quality })),
    surfacesM2: quantities
      .filter((quantity) => quantity.unit === "m²")
      .map((quantity) => ({ id: quantity.id, label: quantity.label, value: quantity.value, quality: quantity.quality }))
      .concat(
        quantities
          .filter((quantity) => quantity.unit === "mm²")
          .map((quantity) => ({ id: quantity.id, label: quantity.label, value: quantity.value / 1_000_000, quality: quantity.quality })),
      ),
  };
  return buildNomenclature(input);
}

function slug(value: string): string {
  // NFD + filtre a-z0-9 : les marques combinantes tombent d'elles-mêmes, pas de classe unicode.
  const cleaned = value
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "ligne";
}
