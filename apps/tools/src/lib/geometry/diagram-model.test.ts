import { describe, expect, it } from "vitest";
import { buildDiagramModel } from "./diagram-model";

describe("cohérence géométrie vers SVG", () => {
  it("utilise le rayon et la flèche réels pour une arche", () => {
    const model = buildDiagramModel("arche", { width: "1600", rise: "400" });
    expect(model.kind).toBe("arch");
    if (model.kind !== "arch") return;
    expect(model.geometry.radius).toBe(1000);
    expect(model.geometry.centreBelowSpring).toBe(600);
    expect(model.annotations.some((annotation) => annotation.text === "Flèche 400 mm")).toBe(true);
  });

  it("dérive l’annotation du cercle de son modèle", () => {
    const model = buildDiagramModel("cercle", { diameter: "1600" });
    expect(model.annotations.some((annotation) => annotation.text.includes("800 mm"))).toBe(true);
  });

  it("projette les trois mesures exactes du triangle 3-4-5", () => {
    const model = buildDiagramModel("angle-droit-345", { referenceA: "1500" });
    expect(model.kind).toBe("triangle");
    if (model.kind !== "triangle") return;
    expect([model.aLabel, model.bLabel, model.cLabel]).toEqual(["1 500 mm", "2 000 mm", "2 500 mm"]);
  });

  it("projette l’entraxe réellement calculé dans le schéma", () => {
    const model = buildDiagramModel("entraxes", { total: "4270", maxSpacing: "600", startRetreat: "0", endRetreat: "0" });
    expect(model.kind).toBe("distribution");
    if (model.kind !== "distribution") return;
    expect(model.count).toBe(9);
    expect(model.totalLabel).toContain("533,8 mm");
  });

  it("projette la pente calculée depuis un dénivelé", () => {
    const model = buildDiagramModel("pente", { mode: "percent-from-rise", run: "4000", rise: "80", percent: "2", degrees: "1" });
    expect(model.kind).toBe("slope");
    if (model.kind !== "slope") return;
    expect(model.percentLabel).toContain("2 %");
    expect(model.percentLabel).toContain("80 mm");
  });

  it("utilise le nombre réel de vitrages dans le schéma", () => {
    const model = buildDiagramModel("repartition-vitrages", { total: "8430", paneCount: "7" });
    expect(model.kind).toBe("distribution");
    if (model.kind !== "distribution") return;
    expect(model.count).toBe(7);
  });
});
