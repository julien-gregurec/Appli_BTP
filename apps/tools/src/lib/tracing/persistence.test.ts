import { describe, expect, it } from "vitest";
import { createAssetRef } from "./asset-store";
import { computeCalibration, verifyCalibration, withCalibrationCheck } from "./reference-image";
import {
  createTracingProject,
  newReferenceImage,
  referencedAssetRefs,
  serializeTracingProject,
  touchTracingProject,
  TracingProjectError,
  validateTracingProject,
  type TracingProject,
} from "./project";
import { migrateTracingProject } from "./migration";

/**
 * Relecture d'un document sérialisé. On passe par `migrateTracingProject` — la frontière
 * tolérante du canon — et non par une seconde règle de lecture propre au lot image.
 */
function reread(content: string): TracingProject {
  return migrateTracingProject(JSON.parse(content));
}
import { confirmContour, contourToGeometricShape, createRawContour } from "./vectorization";

const ASSET_REF = createAssetRef();

function projectWithReference(): TracingProject {
  const base = createTracingProject({ id: "projet-tracage-01", name: "Rosace salon", type: "ceiling" }, new Date("2026-09-06T09:00:00.000Z"));
  const calibration = withCalibrationCheck(
    computeCalibration({
      pointA: { x: 100, y: 100 },
      pointB: { x: 942, y: 100 },
      realDistance: 1200,
      realUnit: "mm",
      at: new Date("2026-09-06T09:05:00.000Z"),
    }),
    verifyCalibration(
      computeCalibration({ pointA: { x: 100, y: 100 }, pointB: { x: 942, y: 100 }, realDistance: 1200, realUnit: "mm" }),
      { pointA: { x: 0, y: 0 }, pointB: { x: 560, y: 0 }, expectedDistance: 800, expectedUnit: "mm", at: new Date("2026-09-06T09:06:00.000Z") },
    ),
  );
  const image = { ...newReferenceImage("img-1", "Photo chantier", "camera", "jpeg", 2400, 1800), calibration, assetRef: ASSET_REF };
  const contour = confirmContour(
    createRawContour({
      id: "contour-1",
      points: [{ x: 100, y: 100 }, { x: 900, y: 120 }, { x: 880, y: 700 }],
      space: "image-pixels",
      closed: true,
      source: "manual",
    }),
  );
  const shape = contourToGeometricShape(contour, { calibration, imageHeightPx: 1800 });
  return touchTracingProject({ ...base, referenceImages: [image], contours: [contour], shapes: [shape] }, new Date("2026-09-06T09:10:00.000Z"));
}

describe("persistance du projet de traçage (§39, §50)", () => {
  it("survit à un aller-retour sérialisation / relecture", () => {
    const project = projectWithReference();
    const reloaded = reread(serializeTracingProject(project));
    expect(reloaded.id).toBe(project.id);
    expect(reloaded.scaleStatus).toBe("defined");
    expect(reloaded.referenceImages).toHaveLength(1);
    expect(reloaded.contours[0].status).toBe("confirmed");
    expect(reloaded.shapes[0].origin).toBe("calibrated");
    expect(reloaded.shapes[0].vertices).toEqual(project.shapes[0].vertices);
  });

  it("conserve la calibration et sa cote de contrôle au millimètre près", () => {
    const project = projectWithReference();
    const reloaded = reread(serializeTracingProject(project));
    const calibration = reloaded.referenceImages[0].calibration;
    expect(calibration.status).toBe("calibrated");
    if (calibration.status !== "calibrated") return;
    expect(calibration.mmPerPixel).toBeCloseTo(1200 / 842, 12);
    expect(calibration.pointB).toEqual({ x: 942, y: 100 });
    expect(calibration.calibratedAt).toBe("2026-09-06T09:05:00.000Z");
    expect(calibration.check?.expectedMm).toBe(800);
    expect(calibration.check?.quality).toBeDefined();
  });

  it("n'écrit jamais les octets de l'image, seulement sa référence (§40)", () => {
    const serialized = serializeTracingProject(projectWithReference());
    expect(serialized).toContain(ASSET_REF);
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("base64");
    expect(referencedAssetRefs([projectWithReference()])).toEqual([ASSET_REF]);
  });

  it("relit un projet antérieur au suivi de traçabilité en conservant l'échelle", () => {
    const legacy = {
      ...projectWithReference(),
      referenceImages: [
        {
          id: "img-legacy",
          name: "Ancienne photo",
          source: "gallery",
          format: "png",
          widthPx: 1000,
          heightPx: 800,
          adjust: { rotationDeg: 0, mirrorX: false, mirrorY: false },
          layer: { opacity: 0.5, visible: true, locked: true, grayscale: false, contrast: 1 },
          calibration: { status: "calibrated", mmPerPixel: 2.5, pixelDistance: 800, realDistanceMm: 2000 },
        },
      ],
      contours: [],
      shapes: [],
    };
    const migrated = validateTracingProject(legacy);
    const calibration = migrated.referenceImages[0].calibration;
    expect(calibration.status).toBe("calibrated");
    if (calibration.status !== "calibrated") return;
    expect(calibration.mmPerPixel).toBe(2.5);
    expect(calibration.pointB).toEqual({ x: 800, y: 0 });
    expect(calibration.realUnit).toBe("mm");
    expect(calibration.origin).toBe("calibrated");
  });

  it("ne laisse jamais un contour détecté ressusciter en « confirmé » (§17)", () => {
    const forged = {
      ...projectWithReference(),
      contours: [
        {
          id: "contour-auto",
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
          space: "image-pixels",
          closed: true,
          source: "detected",
          status: "confirmed",
        },
      ],
      shapes: [],
    };
    expect(validateTracingProject(forged).contours[0].status).toBe("proposition");
  });

  it("rejette une calibration corrompue plutôt que de l'accepter", () => {
    const corrupted = {
      ...projectWithReference(),
      referenceImages: [
        {
          ...projectWithReference().referenceImages[0],
          calibration: { status: "calibrated", mmPerPixel: 0, pixelDistance: -3, realDistanceMm: 0 },
        },
      ],
      shapes: [],
    };
    expect(() => validateTracingProject(corrupted)).toThrow(TracingProjectError);
  });

  it("rejette une référence d'image forgée et un JSON illisible", () => {
    const badRef = {
      ...projectWithReference(),
      referenceImages: [{ ...projectWithReference().referenceImages[0], assetRef: "../../etc/passwd" }],
      shapes: [],
    };
    expect(() => validateTracingProject(badRef)).toThrow(TracingProjectError);
    expect(() => migrateTracingProject({ schemaVersion: 99 })).toThrow(TracingProjectError);
  });

  it("suit l'état d'échelle du projet d'après les calibrations réelles", () => {
    const base = createTracingProject({ id: "projet-tracage-02", name: "Niche", type: "niche" });
    expect(touchTracingProject(base).scaleStatus).toBe("undefined");
    expect(touchTracingProject(projectWithReference()).scaleStatus).toBe("defined");
  });
});
