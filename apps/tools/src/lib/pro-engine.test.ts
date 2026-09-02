import { describe, expect, it } from "vitest";
import { proTools } from "./catalog";
import { buildProGeometry, executeProTool, proToolDefaults, proToolFields, type ProToolId } from "./pro-engine";

describe("moteur catalogue Tools Pro", () => {
  it("fournit champs, exemples et géométrie à chaque outil Pro", () => {
    for (const tool of proTools) {
      const id = tool.id as ProToolId;
      expect(proToolFields[id].length).toBeGreaterThan(0);
      for (const field of proToolFields[id]) expect(proToolDefaults[id][field.key]).toBeDefined();
      const execution = executeProTool(tool, proToolDefaults[id]);
      expect(execution.results.some((line) => line.primary)).toBe(true);
      expect(execution.geometry.dimensions.length).toBeGreaterThan(0);
      expect(execution.geometry.steps.length).toBeGreaterThan(0);
      expect(JSON.stringify(execution)).not.toMatch(/NaN|Infinity/);
    }
  });

  it("distingue explicitement quantités exactes et estimations", () => {
    const ellipse = proTools.find((tool) => tool.id === "ellipse")!;
    const execution = executeProTool(ellipse, proToolDefaults.ellipse);
    expect(execution.geometry.quantities.some((item) => item.quality === "exact")).toBe(true);
    expect(execution.geometry.quantities.some((item) => item.quality === "estimate")).toBe(true);
    expect(execution.results.some((item) => item.label.startsWith("Estimation"))).toBe(true);
  });

  it("convertit cm et m vers le repère canonique en millimètres", () => {
    const inMillimetres = buildProGeometry("couronne", { ...proToolDefaults.couronne, unit: "mm", outerDiameter: "2400", bandWidth: "250" });
    const inCentimetres = buildProGeometry("couronne", { ...proToolDefaults.couronne, unit: "cm", outerDiameter: "240", bandWidth: "25" });
    const inMetres = buildProGeometry("couronne", { ...proToolDefaults.couronne, unit: "m", outerDiameter: "2.4", bandWidth: ".25" });
    expect(inCentimetres.circles).toEqual(inMillimetres.circles);
    expect(inMetres.circles).toEqual(inMillimetres.circles);
  });
});
