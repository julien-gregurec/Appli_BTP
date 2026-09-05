import { describe, expect, it } from "vitest";
import { TRACE_MODEL_CATALOG, traceModelDefaults } from "../geometry/models/catalog";
import { buildEditableHandles } from "./handle-map";
import { measureAt, paramsForHandleTarget, quantiseParam, wrapDegrees, type EditableHandle } from "./editable-handle";
import { normaliseModelParameters } from "./model-resolver";

function handle(slug: keyof typeof TRACE_MODEL_CATALOG, entityId: string, overrides: Record<string, number> = {}) {
  const descriptor = TRACE_MODEL_CATALOG[slug];
  const params = { ...traceModelDefaults(descriptor), ...overrides };
  const handles = buildEditableHandles(descriptor, params, descriptor.build(params));
  return handles.find((item) => item.entityId === entityId)!;
}

describe("mesures", () => {
  it("mesure rayon, angle et axes depuis l'ancre", () => {
    const anchor = { x: 100, y: 50 };
    expect(measureAt("radius", { x: 130, y: 90 }, anchor)).toBeCloseTo(50);
    expect(measureAt("angle", { x: 200, y: 50 }, anchor)).toBeCloseTo(0);
    expect(measureAt("angle", { x: 100, y: 150 }, anchor)).toBeCloseTo(90);
    expect(measureAt("axisX", { x: 130, y: 90 }, anchor)).toBeCloseTo(30);
    expect(measureAt("axisY", { x: 130, y: 90 }, anchor)).toBeCloseTo(40);
  });

  it("replie un écart angulaire dans un demi-tour", () => {
    expect(wrapDegrees(10)).toBeCloseTo(10);
    expect(wrapDegrees(350)).toBeCloseTo(-10);
    expect(wrapDegrees(-350)).toBeCloseTo(10);
    // Franchir 180° par la droite ne doit pas se lire comme un tour complet en arrière.
    expect(wrapDegrees(181)).toBeCloseTo(-179);
  });
});

describe("quantification", () => {
  it("aligne sur le pas DEPUIS LE MINIMUM, comme le fait le résolveur", () => {
    // innerRatio : min 0.05, pas 0.01 — 0.05 + k × 0.01 est valide, 0.004 ne l'est pas.
    expect(quantiseParam(0.4037, { min: 0.05, max: 0.95, step: 0.01 })).toBeCloseTo(0.4, 10);
    expect(quantiseParam(0.4062, { min: 0.05, max: 0.95, step: 0.01 })).toBeCloseTo(0.41, 10);
  });

  it("borne sans jamais sortir du pas", () => {
    expect(quantiseParam(-40, { min: 3, max: 12, step: 1 })).toBe(3);
    expect(quantiseParam(999, { min: 3, max: 12, step: 1 })).toBe(12);
    expect(quantiseParam(3.7, { min: 0.25, max: 12, step: 0.25 })).toBe(3.75);
  });

  it("borne les paramètres sans pas", () => {
    expect(quantiseParam(5, { min: 10, max: 20000 })).toBe(10);
    expect(quantiseParam(99999, { min: 10, max: 20000 })).toBe(20000);
    expect(quantiseParam(1234.56, { min: 10, max: 20000 })).toBe(1234.6);
  });

  /**
   * Le contrôle qui protège réellement l'édition : toute valeur produite par la
   * quantification doit être acceptée par `normaliseModelParameters`. Une valeur alignée sur
   * une autre base ferait échouer la résolution alors qu'elle est dans les bornes.
   */
  it("produit des valeurs que le résolveur accepte, pour tous les paramètres du registre", () => {
    for (const descriptor of Object.values(TRACE_MODEL_CATALOG)) {
      for (const parameter of descriptor.parameters) {
        for (const raw of [-1e6, 0, 0.333, 1.7, 42.42, 1e6]) {
          const value = quantiseParam(raw, parameter);
          const { issues } = normaliseModelParameters(descriptor, { [parameter.id]: value });
          expect(issues, `${descriptor.slug}/${parameter.id} = ${value}`).toEqual([]);
        }
      }
    }
  });
});

describe("inversion d'un glissement", () => {
  it("traduit un déplacement radial en diamètre", () => {
    const P1 = handle("circle-division", "P1");
    // Rayon 1000 → 1200 doit donner un diamètre de 2400.
    const next = paramsForHandleTarget(P1, { x: 1200, y: 0 });
    expect(next?.diameter).toBeCloseTo(2400);
    expect(next?.startAngle).toBeCloseTo(0);
  });

  it("traduit un déplacement angulaire en angle de départ", () => {
    const P1 = handle("circle-division", "P1");
    const next = paramsForHandleTarget(P1, { x: 0, y: 1000 });
    expect(next?.startAngle).toBeCloseTo(90);
    expect(next?.diameter).toBeCloseTo(2000);
  });

  it("ne touche qu'à l'axe déclaré : la pointe du cœur ne change pas la largeur", () => {
    const cusp = handle("heart", "cusp");
    const next = paramsForHandleTarget(cusp, { x: 400, y: -1600 });
    expect(next?.height).toBeCloseTo(1900);
    expect(next?.width).toBe(1200);
  });

  it("refuse une poignée en lecture seule", () => {
    const centre = handle("circle-division", "O");
    expect(centre.editable).toBe(false);
    expect(paramsForHandleTarget(centre, { x: 500, y: 500 })).toBeNull();
  });

  it("retourne null quand la valeur quantifiée ne bouge pas", () => {
    const P1 = handle("circle-division", "P1");
    expect(paramsForHandleTarget(P1, P1.position)).toBeNull();
    // Un dixième de degré ne franchit pas le pas de 1° de `startAngle`, et 0,02 mm de rayon
    // disparaît à l'arrondi au dixième de millimètre.
    expect(paramsForHandleTarget(P1, { x: 1000.02, y: 0.3 })).toBeNull();
  });

  it("borne au maximum du paramètre plutôt que de produire un modèle invalide", () => {
    const P1 = handle("circle-division", "P1");
    const next = paramsForHandleTarget(P1, { x: 500000, y: 0 });
    expect(next?.diameter).toBe(20000);
  });

  it("un creux de turbine ne pilote que le décalage angulaire", () => {
    const V1 = handle("turbine", "V1");
    expect(V1.constraint).toBe("angular");
    const radius = Math.hypot(V1.position.x, V1.position.y);
    // Même en tirant loin du centre, seul l'angle compte : le rayon intérieur est un rapport figé.
    const next = paramsForHandleTarget(V1, { x: radius * 3, y: radius * 3 })!;
    expect(next.diameter).toBe(V1.baseParams.diameter);
    expect(next.twist).not.toBe(V1.baseParams.twist);
  });

  it("une poignée plane pilote deux paramètres sur deux axes", () => {
    const corner: EditableHandle = handle("double-s", "S2-P0");
    expect(corner.constraint).toBe("plane");
    const next = paramsForHandleTarget(corner, { x: corner.position.x + 80, y: corner.position.y + 100 })!;
    expect(next.width).toBeCloseTo(corner.baseParams.width + 100, 1);
    expect(next.height).toBeCloseTo(corner.baseParams.height + 100, 1);
  });
});
