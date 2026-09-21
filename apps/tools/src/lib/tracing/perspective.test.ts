import { describe, expect, it } from "vitest";
import {
  applyHomography,
  assessPerspective,
  computeHomography,
  invertHomography,
  isConvexQuad,
  rectifyQuadToRectangle,
  type PerspectiveQuad,
} from "./perspective";
import { pixelsToMillimetres } from "./reference-image";

/** Quadrilatère typique d'un mur photographié de biais. */
const TILTED: PerspectiveQuad = {
  a: { x: 120, y: 90 },
  b: { x: 880, y: 150 },
  c: { x: 900, y: 640 },
  d: { x: 100, y: 560 },
};

const SQUARE: PerspectiveQuad = {
  a: { x: 0, y: 0 },
  b: { x: 400, y: 0 },
  c: { x: 400, y: 400 },
  d: { x: 0, y: 400 },
};

describe("homographie (§11)", () => {
  it("envoie exactement les quatre coins sur leur cible", () => {
    const destination = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
      { x: 0, y: 500 },
    ] as const;
    const homography = computeHomography([TILTED.a, TILTED.b, TILTED.c, TILTED.d], destination);
    const corners = [TILTED.a, TILTED.b, TILTED.c, TILTED.d];
    corners.forEach((corner, index) => {
      const mapped = applyHomography(homography, corner);
      expect(mapped.x).toBeCloseTo(destination[index].x, 6);
      expect(mapped.y).toBeCloseTo(destination[index].y, 6);
    });
  });

  it("s'inverse : redresser puis reprojeter retombe sur le point d'origine", () => {
    const homography = computeHomography(
      [TILTED.a, TILTED.b, TILTED.c, TILTED.d],
      [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 600 },
        { x: 0, y: 600 },
      ],
    );
    const inverse = invertHomography(homography);
    const point = { x: 512, y: 377 };
    const back = applyHomography(inverse, applyHomography(homography, point));
    expect(back.x).toBeCloseTo(point.x, 6);
    expect(back.y).toBeCloseTo(point.y, 6);
  });

  it("refuse quatre points alignés ou un quadrilatère croisé", () => {
    const crossed: PerspectiveQuad = { a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, c: { x: 100, y: 0 }, d: { x: 0, y: 100 } };
    expect(isConvexQuad(crossed)).toBe(false);
    expect(isConvexQuad(SQUARE)).toBe(true);
    expect(() =>
      computeHomography(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ],
      ),
    ).toThrow();
  });
});

describe("redressement d'un plan rectangulaire (§11)", () => {
  it("produit une échelle uniforme et une calibration exploitable", () => {
    const result = rectifyQuadToRectangle({ quad: TILTED, realWidth: 2400, realHeight: 1800, realUnit: "mm" });
    expect(result.widthPx / result.heightPx).toBeCloseTo(2400 / 1800, 3);
    // Le côté redressé mesure bien la largeur réelle annoncée.
    expect(pixelsToMillimetres(result.calibration, result.widthPx)).toBeCloseTo(2400, 6);
    // Et la hauteur suit sans réglage supplémentaire : l'échelle est devenue uniforme.
    expect(pixelsToMillimetres(result.calibration, result.heightPx)).toBeCloseTo(1800, 3);
  });

  it("mesure une diagonale correctement après redressement", () => {
    const result = rectifyQuadToRectangle({ quad: TILTED, realWidth: 2000, realHeight: 2000, realUnit: "mm" });
    const corner = applyHomography(result.homography, TILTED.c);
    const diagonalPx = Math.hypot(corner.x, corner.y);
    expect(pixelsToMillimetres(result.calibration, diagonalPx)).toBeCloseTo(Math.hypot(2000, 2000), 2);
  });

  it("exige largeur ET hauteur réelles plutôt que d'inventer un rapport d'aspect", () => {
    expect(() => rectifyQuadToRectangle({ quad: TILTED, realWidth: 2400, realHeight: 0, realUnit: "mm" })).toThrow(/largeur ET une hauteur/);
  });

  it("refuse un quadrilatère non convexe", () => {
    const crossed: PerspectiveQuad = { a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, c: { x: 100, y: 0 }, d: { x: 0, y: 100 } };
    expect(() => rectifyQuadToRectangle({ quad: crossed, realWidth: 100, realHeight: 100, realUnit: "mm" })).toThrow(/convexe/);
  });
});

describe("détection d'inclinaison (§12, §37)", () => {
  it("ne signale rien sur un plan vu de face", () => {
    const assessment = assessPerspective(SQUARE);
    expect(assessment.severity).toBe("aucune");
    expect(assessment.warning).toBe("");
    expect(assessment.oppositeSideRatioPercent).toBeCloseTo(0, 9);
  });

  it("avertit sur une photo nettement inclinée, avec un écart mesuré", () => {
    const assessment = assessPerspective(TILTED);
    expect(assessment.severity).not.toBe("aucune");
    expect(assessment.warning).toContain("imprécises");
    expect(assessment.maxCornerDeviationDeg).toBeGreaterThan(0);
  });

  it("mesure l'écart entre côtés opposés d'un trapèze franc", () => {
    const trapeze: PerspectiveQuad = { a: { x: 100, y: 0 }, b: { x: 300, y: 0 }, c: { x: 400, y: 300 }, d: { x: 0, y: 300 } };
    const assessment = assessPerspective(trapeze);
    expect(assessment.oppositeSideRatioPercent).toBeCloseTo(50, 6);
    expect(assessment.severity).toBe("forte");
  });
});
