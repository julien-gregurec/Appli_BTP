import { describe, expect, it } from "vitest";
import {
  clampStepIndex,
  firstStepIndex,
  isEntityHighlightedAtStep,
  isEntityVisibleAtStep,
  lastStepIndex,
  nextStepIndex,
  previousStepIndex,
  stepProgress,
} from "./trace-render";
import type { SiteStep } from "./shape-model";

describe("isEntityVisibleAtStep — FIRST-FUNCTIONAL-LOT-V1 §12", () => {
  it("sans étape active, toute entité est visible (comportement des outils existants inchangé)", () => {
    expect(isEntityVisibleAtStep("circle-main", null)).toBe(true);
    expect(isEntityVisibleAtStep("circle-main", undefined)).toBe(true);
  });

  it("une étape sans visibleEntityIds affiche tout (rétrocompatible avec les 10 outils Pro)", () => {
    const step: SiteStep = { id: "s1", title: "T", instruction: "I", measurements: [], pointIds: [] };
    expect(isEntityVisibleAtStep("circle-main", step)).toBe(true);
  });

  it("une étape avec visibleEntityIds ne montre que les ids listés", () => {
    const step: SiteStep = { id: "s1", title: "T", instruction: "I", measurements: [], pointIds: [], visibleEntityIds: ["axis-x", "circle-main"] };
    expect(isEntityVisibleAtStep("circle-main", step)).toBe(true);
    expect(isEntityVisibleAtStep("circle-secondary", step)).toBe(false);
  });
});

describe("isEntityHighlightedAtStep — FIRST-FUNCTIONAL-LOT-V1 §12", () => {
  it("faux par défaut, vrai seulement si listé", () => {
    const step: SiteStep = { id: "s1", title: "T", instruction: "I", measurements: [], pointIds: [], highlightEntityIds: ["arc-1"] };
    expect(isEntityHighlightedAtStep("arc-1", step)).toBe(true);
    expect(isEntityHighlightedAtStep("arc-2", step)).toBe(false);
    expect(isEntityHighlightedAtStep("arc-1", null)).toBe(false);
  });
});

describe("navigation d'étapes — FIRST-FUNCTIONAL-LOT-V1 §10/§19", () => {
  it("clampStepIndex borne entre 0 et total-1", () => {
    expect(clampStepIndex(-5, 4)).toBe(0);
    expect(clampStepIndex(2, 4)).toBe(2);
    expect(clampStepIndex(99, 4)).toBe(3);
    expect(clampStepIndex(1, 0)).toBe(0);
  });

  it("nextStepIndex/previousStepIndex ne dépassent jamais les bornes", () => {
    expect(nextStepIndex(3, 4)).toBe(3);
    expect(nextStepIndex(1, 4)).toBe(2);
    expect(previousStepIndex(0, 4)).toBe(0);
    expect(previousStepIndex(2, 4)).toBe(1);
  });

  it("firstStepIndex/lastStepIndex", () => {
    expect(firstStepIndex()).toBe(0);
    expect(lastStepIndex(6)).toBe(5);
    expect(lastStepIndex(0)).toBe(0);
  });

  it("stepProgress est une fraction croissante entre 0 exclu et 1", () => {
    expect(stepProgress(0, 4)).toBeCloseTo(0.25, 8);
    expect(stepProgress(3, 4)).toBeCloseTo(1, 8);
    expect(stepProgress(0, 0)).toBe(0);
  });
});
