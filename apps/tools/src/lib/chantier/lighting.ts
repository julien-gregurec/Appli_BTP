/**
 * §26 — Éclairage.
 *
 * Positions des spots, lustres, suspensions et alimentations LED, avec coordonnées
 * exportables (repère chantier, millimètres).
 */

import type { Point2D } from "../tracing/geometry-port";

export type LightingKind = "spot" | "lustre" | "suspension" | "led-supply";
export const LIGHTING_KINDS: readonly LightingKind[] = ["spot", "lustre", "suspension", "led-supply"];

const LIGHTING_LABELS: Record<LightingKind, string> = {
  spot: "Spot",
  lustre: "Lustre",
  suspension: "Suspension",
  "led-supply": "Alimentation LED",
};

export function lightingKindLabel(kind: LightingKind): string {
  return LIGHTING_LABELS[kind];
}

export type LightingFixture = {
  id: string;
  kind: LightingKind;
  position: Point2D;
  label?: string;
  note?: string;
};

export function validateFixture(fixture: LightingFixture): LightingFixture {
  if (!LIGHTING_KINDS.includes(fixture.kind)) throw new Error(`Type d'éclairage inconnu : ${fixture.kind}.`);
  if (!Number.isFinite(fixture.position.x) || !Number.isFinite(fixture.position.y)) {
    throw new Error(`L'appareil ${fixture.id} a des coordonnées invalides.`);
  }
  return fixture;
}

export function summariseLighting(fixtures: readonly LightingFixture[]): Record<LightingKind, number> {
  const summary: Record<LightingKind, number> = { spot: 0, lustre: 0, suspension: 0, "led-supply": 0 };
  for (const fixture of fixtures) {
    validateFixture(fixture);
    summary[fixture.kind] += 1;
  }
  return summary;
}

export type LightingExportRow = { ref: string; kind: string; xMm: number; yMm: number; note: string };

export function lightingExportRows(fixtures: readonly LightingFixture[]): LightingExportRow[] {
  return fixtures.map((fixture, index) => {
    validateFixture(fixture);
    return {
      ref: fixture.label ?? `${fixture.kind}-${index + 1}`,
      kind: lightingKindLabel(fixture.kind),
      xMm: Math.round(fixture.position.x),
      yMm: Math.round(fixture.position.y),
      note: fixture.note ?? "",
    };
  });
}
