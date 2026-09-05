import { describe, expect, it } from "vitest";
import { TRACE_MODEL_SLUGS } from "../geometry/models/catalog";
import { CONSEIL_TRACE_MODEL_IDS, isConseilTraceModelId } from "./trace-models";

describe("vocabulaire des tracés liés", () => {
  it("reste aligné, slug pour slug, sur le registre géométrique réel", () => {
    expect([...CONSEIL_TRACE_MODEL_IDS].sort()).toEqual([...TRACE_MODEL_SLUGS].sort());
  });

  it("compte les 13 modèles du registre", () => {
    expect(CONSEIL_TRACE_MODEL_IDS).toHaveLength(13);
  });

  it("refuse un slug inventé", () => {
    expect(isConseilTraceModelId("circle-division")).toBe(true);
    expect(isConseilTraceModelId("cercle-divise")).toBe(false);
    expect(isConseilTraceModelId("")).toBe(false);
  });
});
