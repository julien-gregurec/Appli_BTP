import { describe, expect, it } from "vitest";
import { buildModelResolutionViewModel } from "./model-resolution-view-model";
import { resolveTracingProjectModel, type TracingModelResolution } from "../../../lib/tracing/model-resolver";

const resolutionFor = (modelId?: string, modelParams?: Record<string, number>): TracingModelResolution =>
  resolveTracingProjectModel({ modelId, modelParams });

describe("état du modèle affiché avant export (§10)", () => {
  it("annonce la géométrie disponible et récapitule les paramètres réellement utilisés", () => {
    const view = buildModelResolutionViewModel(resolutionFor("circle-division", { diameter: 3000 }));
    expect(view.tone).toBe("ok");
    expect(view.title).toBe("Cercle divisé");
    expect(view.geometryAvailable).toBe(true);
    const diameter = view.parameterSummary.find((parameter) => parameter.id === "diameter")!;
    expect(diameter.value).toBe(3000);
    expect(diameter.unit).toBe("mm");
    expect(diameter.overridden).toBe(true);
    // Un paramètre laissé au défaut est affiché sans être présenté comme un réglage du tracé.
    expect(view.parameterSummary.find((parameter) => parameter.id === "divisions")!.overridden).toBe(false);
  });

  it("signale un ancien slug sans bloquer l'export", () => {
    const view = buildModelResolutionViewModel(resolutionFor("rosace"));
    expect(view.tone).toBe("warning");
    expect(view.geometryAvailable).toBe(true);
    expect(view.details.join(" ")).toMatch(/ancien nom/i);
  });

  it("donne un état lisible pour chaque échec, sans jamais rester muet", () => {
    const unknown = buildModelResolutionViewModel(resolutionFor("modele-fantome"));
    expect(unknown.tone).toBe("error");
    expect(unknown.geometryAvailable).toBe(false);
    expect(unknown.message.length).toBeGreaterThan(0);

    const invalid = buildModelResolutionViewModel(resolutionFor("circle-division", { divisions: 99 }));
    expect(invalid.tone).toBe("error");
    expect(invalid.title).toMatch(/paramètres invalides/i);
    expect(invalid.details).toHaveLength(1);

    const none = buildModelResolutionViewModel(resolutionFor(undefined));
    expect(none.tone).toBe("neutral");
    expect(none.message.length).toBeGreaterThan(0);
    expect(none.geometryAvailable).toBe(false);
  });

  it("produit toujours un titre et un message, quel que soit l'état", () => {
    const resolutions = [
      resolutionFor("star-5"),
      resolutionFor(undefined),
      resolutionFor("inconnu"),
      resolutionFor("star-5", { innerRatio: 9 }),
    ];
    for (const resolution of resolutions) {
      const view = buildModelResolutionViewModel(resolution);
      expect(view.title.trim().length, resolution.status).toBeGreaterThan(0);
      expect(view.message.trim().length, resolution.status).toBeGreaterThan(0);
    }
  });
});
