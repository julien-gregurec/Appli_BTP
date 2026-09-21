/**
 * IMAGE-VECTORIZATION-CANONICAL-RECONCILIATION-V1 §24 — le parcours complet, du fichier photo
 * jusqu'à l'export, en passant par les rails du canon (tracé libre, dépôt IndexedDB, scène).
 *
 * Ce fichier ne re-teste pas les briques (calibration, ajustement, détection : elles ont leurs
 * propres suites). Il teste la JONCTION : que ce qui sort de la photo entre dans le projet
 * comme un tracé libre ordinaire, y survive à un rechargement, et ressorte en SVG et en DXF
 * sans que l'aval sache qu'une image a existé.
 */
import { describe, expect, it } from "vitest";
import {
  attachReferenceImage,
  calibrateReference,
  confirmVectorizationIntoProject,
  controlCalibration,
  importReferenceImage,
  traceContour,
} from "./api";
import { createTracingProject, derivedScaleStatus, type TracingProject } from "./project";
import { migrateTracingProject } from "./migration";
import { MemoryTracingProjectRepository } from "./repository";
import { touchTracingProject } from "./atelier";
import { freeGeometryToShape } from "./free-shape";
import { tracingProjectMode } from "./project";
import { createAssetRef, MemoryReferenceAssetStore, pruneOrphanAssets } from "./asset-store";
import { reviewTracingReliability, hasBlockingNotice } from "./reliability";
import { renderPlanSvg } from "../exports/svg";
import { shapeGeometryToDxf, renderDxf, validateDxfStructure } from "../exports/dxf";
import type { Point2D } from "./geometry-port";

const ASSET = createAssetRef();

/** Relevé d'une photo calibrée : 842 px pour 1200 mm, soit un carré réel de 1000 mm. */
function calibratedPhoto() {
  const { image } = importReferenceImage({
    id: "img-1",
    name: "Rosace salon",
    mimeOrName: "image/jpeg",
    source: "camera",
    sourceWidthPx: 4032,
    sourceHeightPx: 3024,
    sizeBytes: 3_400_000,
    assetRef: ASSET,
  });
  const calibrated = calibrateReference(image, {
    pointA: { x: 300, y: 1500 },
    pointB: { x: 1142, y: 1500 },
    realDistance: 1200,
    realUnit: "mm",
    at: new Date("2026-09-06T08:00:00.000Z"),
  });
  const mmPerPixel = calibrated.calibration.status === "calibrated" ? calibrated.calibration.mmPerPixel : 0;
  return { image: calibrated, mmPerPixel };
}

function squareInPixels(mmPerPixel: number, sideMm: number): Point2D[] {
  const side = sideMm / mmPerPixel;
  return [
    { x: 400, y: 400 },
    { x: 400 + side, y: 400 },
    { x: 400 + side, y: 400 + side },
    { x: 400, y: 400 + side },
  ];
}

function freeProject(): TracingProject {
  return createTracingProject({ id: "projet-photo-01", name: "Rosace salon", type: "ceiling" }, new Date("2026-09-06T07:00:00.000Z"));
}

describe("photo → tracé libre canonique (§11)", () => {
  it("verse un relevé confirmé dans le projet en tracé libre, et déduit l'échelle", () => {
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-1", points: squareInPixels(mmPerPixel, 1000), closed: true });
    const result = confirmVectorizationIntoProject({ project: freeProject(), contour, image, now: new Date("2026-09-06T09:00:00.000Z") });

    expect(tracingProjectMode(result.project)).toBe("free");
    expect(result.project.freeGeometry?.entities).toHaveLength(1);
    expect(result.entity.kind).toBe("polygon");
    expect(result.shape.origin).toBe("calibrated");
    expect(result.project.scaleStatus).toBe("defined");
    // Le carré tracé sur la photo mesure bien 1000 mm de côté dans le tracé libre.
    const xs = result.entity.points.map((vertex) => vertex.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1000, 6);
  });

  it("refuse d'ajouter un relevé photo à un tracé qui suit un modèle paramétrique", () => {
    const parametric = touchTracingProject(freeProject(), { modelId: "rosette" });
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-2", points: squareInPixels(mmPerPixel, 800), closed: true });
    expect(() => confirmVectorizationIntoProject({ project: parametric, contour, image })).toThrow(/modèle paramétrique/);
  });

  it("le contour brut reste conservé à côté du tracé libre, avec son statut confirmé", () => {
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-3", points: squareInPixels(mmPerPixel, 1000), closed: true });
    const result = confirmVectorizationIntoProject({ project: freeProject(), contour, image });
    expect(result.project.contours).toHaveLength(1);
    expect(result.project.contours[0].status).toBe("confirmed");
    expect(result.project.shapes).toHaveLength(1);
  });

  it("attacher une image ne confirme rien et ne crée aucun tracé", () => {
    const { image } = calibratedPhoto();
    const project = attachReferenceImage(freeProject(), image);
    expect(project.referenceImages).toHaveLength(1);
    expect(project.freeGeometry).toBeUndefined();
    expect(tracingProjectMode(project)).toBe("undecided");
    expect(derivedScaleStatus(project)).toBe("defined");
  });
});

describe("persistance et rechargement hors ligne (§17, §24)", () => {
  it("survit à un aller-retour par le dépôt du canon : image, calibration et tracé", async () => {
    const repository = new MemoryTracingProjectRepository();
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-4", points: squareInPixels(mmPerPixel, 1000), closed: true });
    const { project } = confirmVectorizationIntoProject({ project: freeProject(), contour, image });
    await repository.create(project);

    const reloaded = await repository.get(project.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.freeGeometry?.entities).toHaveLength(1);
    expect(reloaded!.referenceImages[0].assetRef).toBe(ASSET);
    const calibration = reloaded!.referenceImages[0].calibration;
    expect(calibration.status).toBe("calibrated");
    if (calibration.status === "calibrated") expect(calibration.mmPerPixel).toBeCloseTo(1200 / 842, 12);
  });

  it("les octets de la photo vivent hors du document projet (§18, §40)", async () => {
    const store = new MemoryReferenceAssetStore();
    await store.put({ ref: ASSET, blob: new Blob([new Uint8Array(4096)], { type: "image/jpeg" }), format: "jpeg", widthPx: 2400, heightPx: 1800 });
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-5", points: squareInPixels(mmPerPixel, 1000), closed: true });
    const { project } = confirmVectorizationIntoProject({ project: freeProject(), contour, image });

    const serialized = JSON.stringify(project);
    expect(serialized).toContain(ASSET);
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("data:image");
    // L'image reste disponible hors ligne, et la purge ne l'emporte pas tant qu'elle est référencée.
    expect(await store.get(ASSET)).not.toBeNull();
    expect(await pruneOrphanAssets(store, [ASSET])).toEqual([]);
    expect((await store.get(ASSET))!.blob.size).toBe(4096);
  });

  it("un document relu par la frontière de migration garde le tracé libre issu de la photo", () => {
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-6", points: squareInPixels(mmPerPixel, 1000), closed: true });
    const { project } = confirmVectorizationIntoProject({ project: freeProject(), contour, image });
    const reread = migrateTracingProject(JSON.parse(JSON.stringify(project)));
    expect(reread.freeGeometry?.entities[0].points).toEqual(project.freeGeometry?.entities[0].points);
  });
});

describe("l'export part de la géométrie confirmée, jamais de l'image (§23)", () => {
  function exportedShape() {
    const { image, mmPerPixel } = calibratedPhoto();
    const contour = traceContour({ id: "ct-7", points: squareInPixels(mmPerPixel, 1000), closed: true });
    const { project } = confirmVectorizationIntoProject({ project: freeProject(), contour, image });
    return freeGeometryToShape(project.freeGeometry!, { id: project.id, name: project.name, quantities: true });
  }

  it("projette le relevé en géométrie de plan avec les bonnes cotes", () => {
    const shape = exportedShape();
    expect(shape.polygons).toHaveLength(1);
    expect(shape.bounds.maxX - shape.bounds.minX).toBeCloseTo(1000, 6);
    expect(shape.bounds.maxY - shape.bounds.minY).toBeCloseTo(1000, 6);
  });

  it("produit un SVG qui décrit la géométrie, pas la photo", () => {
    const svg = renderPlanSvg(exportedShape(), "Rosace salon");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("data:image");
  });

  it("produit un DXF structurellement valide", () => {
    const dxf = renderDxf(shapeGeometryToDxf(exportedShape()).entities);
    expect(validateDxfStructure(dxf).ok).toBe(true);
    expect(dxf).toContain("AC1009");
  });
});

describe("la fiabilité survit à la réconciliation (§10, §49)", () => {
  it("une photo non calibrée reste bloquante, même une fois l'image attachée au projet", () => {
    const { image } = importReferenceImage({
      id: "img-2",
      name: "Croquis",
      mimeOrName: "image/png",
      source: "sketch",
      sourceWidthPx: 1200,
      sourceHeightPx: 900,
    });
    const project = attachReferenceImage(freeProject(), image);
    expect(project.scaleStatus).toBe("undefined");
    const notices = reviewTracingReliability({ calibration: image.calibration });
    expect(hasBlockingNotice(notices)).toBe(true);
  });

  it("la cote de contrôle reste attachée au projet enregistré", async () => {
    const repository = new MemoryTracingProjectRepository();
    const { image, mmPerPixel } = calibratedPhoto();
    const controlled = controlCalibration(image, {
      pointA: { x: 0, y: 0 },
      pointB: { x: 802 / mmPerPixel, y: 0 },
      expectedDistance: 800,
      expectedUnit: "mm",
    });
    const saved = await repository.save(attachReferenceImage(freeProject(), controlled.image));
    const calibration = saved.referenceImages[0].calibration;
    expect(calibration.status).toBe("calibrated");
    if (calibration.status === "calibrated") {
      expect(calibration.check?.expectedMm).toBe(800);
      expect(calibration.check?.errorPercent).toBeCloseTo(0.25, 6);
    }
  });
});
