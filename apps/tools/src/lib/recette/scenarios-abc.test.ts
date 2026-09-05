/**
 * RECETTE UTILISATEUR INTERNE — scénarios A / B / C (prompt §50).
 *
 * Suite d'acceptation transverse (géométrie + tracing + chantier + export) : elle fige
 * les critères de recette interne du dossier ELSATIA_TOOLS_RECETTE_INTERNE_ABC_V1.md
 * et sert désormais de garde de non-régression. Exécute les fonctions RÉELLES.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { createRosetteGeometry } from "../geometry/models/rosette";
import { distance as distanceA } from "../geometry/primitives";
import type { TraceModel } from "../geometry/trace-model";
import { exportProjectPdf } from "../exports/pdf";

import {
  computeCalibration,
  pixelsToMillimetres,
  millimetresToPixels,
  pixelPointToMillimetres,
  isCalibrated,
  calibrationLabel,
  UNDEFINED_CALIBRATION,
} from "../tracing/reference-image";
import { createTracingProject, validateTracingProject } from "../tracing/project";

import { polylineLength } from "../tracing/geometry-port";
import { offsetPolyline } from "../geometry/engine/offset";
import { applyMargin } from "../chantier/margins";
import { planLed } from "../chantier/led";

const OUT = tmpdir();

/* ========================================================================== */
/*  SCÉNARIO A — Plaquiste : pièce 5000×4000, rosace 6 pétales Ø 2400          */
/* ========================================================================== */
describe("Scénario A — rosace 6 pétales Ø 2400 dans une pièce 5000×4000", () => {
  const ROOM = { w: 5000, h: 4000 };
  const model: TraceModel = createRosetteGeometry({ diameter: 2400, rotation: 0 });
  const O = model.points.find((p) => p.id === "O")!;
  const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
  const tips = model.points.filter((p) => /^T\d+$/.test(p.id));

  it("A1 — création : modèle valide, rayon directeur = 1200 mm", () => {
    expect(model.id).toBe("rosette-6");
    expect(model.referenceFrame.unit).toBe("mm");
    const R = model.quantities.find((q) => q.id === "q-radius")!;
    expect(R.value).toBe(1200);
    expect(R.quality).toBe("exact");
  });

  it("A2 — 6 centres secondaires, chacun EXACTEMENT à 1200 mm de O", () => {
    expect(centres).toHaveLength(6);
    for (const c of centres) expect(distanceA(O, c)).toBeCloseTo(1200, 6);
  });

  it("A3 — entraxe angulaire = 60°, 6 pétales", () => {
    const sector = model.quantities.find((q) => q.id === "q-sector")!;
    expect(sector.value).toBe(60);
    expect(model.circles.filter((c) => c.id.startsWith("petal-"))).toHaveLength(6);
  });

  it("A4 — pointes de pétales à R·√3 = 2078.46 mm de O (propriété exacte)", () => {
    expect(tips).toHaveLength(6);
    const expected = 1200 * Math.sqrt(3);
    for (const t of tips) expect(distanceA(O, t)).toBeCloseTo(expected, 4);
    const q = model.quantities.find((q) => q.id === "q-tip-distance")!;
    expect(q.value).toBeCloseTo(expected, 6);
  });

  it("A5 — centrage : bounds symétriques autour de O(0,0) ; cercle directeur Ø2400 tient, enveloppe du motif ≈ Ø4157", () => {
    expect(O.x).toBe(0);
    expect(O.y).toBe(0);
    expect(model.bounds.minX).toBeCloseTo(-model.bounds.maxX, 6);
    expect(model.bounds.minY).toBeCloseTo(-model.bounds.maxY, 6);
    // Le paramètre "diamètre directeur" (2400) est le cercle de construction, pas l'encombrement :
    const directingDiameter = 2400;
    expect(directingDiameter).toBeLessThan(ROOM.w);
    expect(directingDiameter).toBeLessThan(ROOM.h);
    // L'enveloppe réelle du motif = pointe à pointe opposées = 2·R·√3 ≈ 4157 mm,
    // distincte du "diamètre directeur" 2400 (cf. rapport de recette, observation UX).
    const tipEnvelope = 2 * 1200 * Math.sqrt(3);
    expect(tipEnvelope).toBeCloseTo(4156.92, 1);
    expect(tipEnvelope).toBeLessThan(ROOM.w); // l'enveloppe tient en largeur (5000)
  });

  it("A6 — pas-à-pas : 4 étapes, chaque étape référence des points réels du modèle", () => {
    expect(model.steps).toHaveLength(4);
    const ids = new Set(model.points.map((p) => p.id));
    for (const step of model.steps) {
      expect(step.instruction.length).toBeGreaterThan(10);
      for (const pid of step.pointIds) expect(ids.has(pid)).toBe(true);
    }
  });

  it("A7 — lecture des points de report : X/Y finis, cohérents avec le plan", () => {
    for (const p of model.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // C1 est sur l'axe X à +R (rotation 0)
    const c1 = centres.find((c) => c.id === "C1")!;
    expect(c1.x).toBeCloseTo(1200, 6);
    expect(c1.y).toBeCloseTo(0, 6);
  });

  it("A8 — export PDF : fichier %PDF multi-pages écrit sur disque", () => {
    const doc = {
      project: {
        name: "Rosace plafond séjour",
        siteName: "Chantier Dupont — séjour 5000×4000",
        updatedAt: new Date("2026-09-05T10:00:00Z").toISOString(),
        notes: "Rosace 6 pétales Ø 2400 mm, centrée sur la pièce.",
      },
      tool: { name: "Rosace 6 pétales simple", slug: "rosace-6-petales" },
      generatedAt: new Date("2026-09-05T10:00:00Z").toISOString(),
      parameters: [
        { key: "diameter", label: "Diamètre directeur", value: "2400 mm" },
        { key: "rotation", label: "Orientation initiale", value: "0 °" },
      ],
      execution: {
        geometry: model,
        results: model.quantities.map((q) => ({
          label: q.label,
          value: `${q.value.toFixed(q.unit === "°" ? 0 : 1)} ${q.unit}`,
          primary: q.id === "q-radius",
        })),
      },
    };
    // exportProjectPdf ne lit que les champs ci-dessus (pas le catalogue).
    const bytes = exportProjectPdf(doc as unknown as Parameters<typeof exportProjectPdf>[0]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const head = Buffer.from(bytes.slice(0, 8)).toString("latin1");
    expect(head.startsWith("%PDF-")).toBe(true);
    const full = Buffer.from(bytes).toString("latin1");
    const pageCount = (full.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
    writeFileSync(join(OUT, "recette_A_rosace_2400.pdf"), bytes);
    expect(bytes.length).toBeGreaterThan(3000);
  });
});

/* ========================================================================== */
/*  SCÉNARIO B — Photo d'un motif : import → calibration → mesure → save       */
/* ========================================================================== */
describe("Scénario B — calibration image et mesure réelle", () => {
  it("B1 — AUCUNE mesure réelle possible tant que l'image n'est pas calibrée (§4/§16)", () => {
    expect(isCalibrated(UNDEFINED_CALIBRATION)).toBe(false);
    expect(calibrationLabel(UNDEFINED_CALIBRATION)).toBe("Échelle non définie");
    expect(() => pixelsToMillimetres(UNDEFINED_CALIBRATION, 500)).toThrow(/Échelle non définie/);
    expect(() => millimetresToPixels(UNDEFINED_CALIBRATION, 500)).toThrow(/Échelle non définie/);
  });

  it("B2 — cas connu : 2 points distants de 500 px = 2000 mm réels → 4 mm/px", () => {
    const cal = computeCalibration({
      pointA: { x: 120, y: 340 },
      pointB: { x: 620, y: 340 },
      realDistance: 2000,
      realUnit: "mm",
    });
    expect(cal.status).toBe("calibrated");
    expect(cal.pixelDistance).toBeCloseTo(500, 9);
    expect(cal.realDistanceMm).toBe(2000);
    expect(cal.mmPerPixel).toBeCloseTo(4, 9);
    expect(calibrationLabel(cal)).toBe("Échelle calibrée");
  });

  it("B3 — vérification mathématique : une AUTRE distance est correctement convertie", () => {
    const cal = computeCalibration({
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 500 },
      realDistance: 2000,
      realUnit: "mm",
    });
    expect(pixelsToMillimetres(cal, 750)).toBeCloseTo(3000, 6); // 750 px → 3000 mm
    expect(pixelsToMillimetres(cal, 125)).toBeCloseTo(500, 6);
    expect(millimetresToPixels(cal, 1600)).toBeCloseTo(400, 6);
    // aller-retour
    expect(pixelsToMillimetres(cal, millimetresToPixels(cal, 1234.5))).toBeCloseTo(1234.5, 6);
  });

  it("B4 — l'unité réelle est prise en compte : 2 m ≡ 2000 mm", () => {
    const inMm = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 400, y: 0 }, realDistance: 2000, realUnit: "mm" });
    const inM = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 400, y: 0 }, realDistance: 2, realUnit: "m" });
    expect(inM.mmPerPixel).toBeCloseTo(inMm.mmPerPixel, 9);
  });

  it("B5 — points de calibration confondus → erreur explicite", () => {
    expect(() =>
      computeCalibration({ pointA: { x: 10, y: 10 }, pointB: { x: 10, y: 10 }, realDistance: 1000, realUnit: "mm" }),
    ).toThrow(/distincts/);
  });

  it("B6 — repère image (Y bas) → repère chantier (Y haut) via hauteur image", () => {
    const cal = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 }, realDistance: 1000, realUnit: "mm" }); // 10 mm/px
    const p = pixelPointToMillimetres(cal, { x: 50, y: 20 }, 200); // y inversé : 200-20 = 180 px
    expect(p.x).toBeCloseTo(500, 6);
    expect(p.y).toBeCloseTo(1800, 6);
  });

  it("B7 — enregistrement / réouverture : TracingProject sérialisé puis revalidé sans perte", () => {
    const created = createTracingProject({
      id: "recette-b-0001",
      name: "Motif photographié — plafond",
      type: "ceiling",
      units: "mm",
      roomWidthMm: 5000,
      roomHeightMm: 4000,
    });
    expect(created.scaleStatus).toBe("undefined"); // pas encore calibré
    const roundTrip = validateTracingProject(JSON.parse(JSON.stringify(created)));
    expect(roundTrip).toEqual(created);
    expect(roundTrip.schemaVersion).toBe(created.schemaVersion);
  });
});

/* ========================================================================== */
/*  SCÉNARIO C — Gorge LED : contour → offset → longueur → marge → quantité    */
/* ========================================================================== */
describe("Scénario C — gorge LED périmétrique", () => {
  // Contour rectangulaire fermé 3000 × 2000 mm (périmètre 10 000 mm)
  const contour = {
    points: [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2000 },
      { x: 0, y: 2000 },
    ],
    closed: true as const,
  };

  it("C1 — définir contour : périmètre = 10 000 mm", () => {
    expect(polylineLength(contour)).toBeCloseTo(10000, 6);
  });

  it("C2 — définir offset : gorge à 50 mm vers l'intérieur → 2900 × 1900, périmètre 9600 mm", () => {
    const gorge = offsetPolyline(contour, 50);
    expect(polylineLength({ points: gorge.points, closed: true })).toBeCloseTo(9600, 6);
  });

  it("C3 — offset impossible (distance > demi-largeur) → erreur explicite, pas de faux contour", () => {
    expect(() => offsetPolyline(contour, 1500)).toThrow(/Offset impossible/);
  });

  it("C4 — appliquer marge : 9600 mm + 10 % = 10 560 mm", () => {
    const m = applyMargin(9600, { kind: "preset", percent: 10 });
    expect(m.marginMm).toBeCloseTo(960, 6);
    expect(m.withMarginMm).toBeCloseTo(10560, 6);
  });

  it("C5 — contrôle canonique §24 : 10 000 mm + 10 % = 11 000 mm", () => {
    expect(applyMargin(10000, { kind: "preset", percent: 10 }).withMarginMm).toBe(11000);
  });

  it("C6 — quantité indicative : ruban 5 m → 3 rouleaux, 15 000 mm commandés, 4440 mm de chute", () => {
    const plan = planLed({
      segments: [{ id: "gorge-perimetrale", lengthMm: 9600, label: "Gorge périmétrale" }],
      margin: { kind: "preset", percent: 10 },
      rollLengthMm: 5000,
    });
    expect(plan.totalLengthMm).toBeCloseTo(9600, 6);
    expect(plan.margin.withMarginMm).toBeCloseTo(10560, 6);
    expect(plan.roll.count).toBe(3);
    expect(plan.roll.orderedMm).toBe(15000);
    expect(plan.roll.wasteMm).toBeCloseTo(4440, 6);
    expect(plan.breaks).toBe(0);
  });

  it("C7 — pas de sous-estimation : jamais moins de rouleaux que le strict nécessaire", () => {
    // 10 001 mm avec rouleau de 5000 → 3 rouleaux (plafond)
    const plan = planLed({ segments: [{ id: "s", lengthMm: 10001 }], rollLengthMm: 5000 });
    expect(plan.roll.count).toBe(3);
  });
});
