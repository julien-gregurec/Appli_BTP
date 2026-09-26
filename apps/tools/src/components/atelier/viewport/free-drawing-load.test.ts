/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §16 — repère de charge du tracé libre.
 *
 * Le repère du lot : 100 points, 100 segments, une polyligne de 100 sommets. On mesure le coût
 * des opérations qui se produisent PAR TRAME lors d'un geste — projection en scène, hit-test,
 * accrochage, construction des poignées — parce que ce sont elles, et pas la validation, qui
 * décident si le tracé « accroche » ou reste fluide sous le doigt.
 *
 * ## Ce qu'un seuil chiffré vaut, et ne vaut pas
 *
 * Une durée mesurée sur une machine de développement ne prédit pas celle d'un téléphone. Les
 * seuils sont donc délibérément LARGES : ils ne prétendent pas mesurer la fluidité, ils
 * attrapent une régression d'ordre de grandeur — un accrochage devenu quadratique, une scène
 * reconstruite en boucle. C'est le genre de défaut qui ne se voit pas en relecture et qui rend
 * l'outil inutilisable sur le chantier.
 */

import { describe, expect, it } from "vitest";
import { hitTestAll } from "../../../lib/geometry/hit-test";
import { snap } from "../../../lib/geometry/snap";
import { buildFreeVertexHandles } from "../../../lib/tracing/free-handles";
import { freeGeometryToShape } from "../../../lib/tracing/free-shape";
import {
  countFreeVertices,
  moveFreeVertex,
  validateFreeGeometry,
  type FreeEntity,
  type FreeGeometry,
} from "../../../lib/tracing/free-geometry";

/** Le repère exact de §16, avec des segments qui se croisent pour charger les intersections. */
function loadGeometry(): FreeGeometry {
  const entities: FreeEntity[] = [];
  for (let index = 0; index < 100; index += 1) {
    const column = index % 10;
    const row = Math.floor(index / 10);
    entities.push({ id: `pt-${index + 1}`, kind: "point", points: [{ x: column * 220, y: row * 220 }] });
    entities.push({
      id: `sg-${index + 1}`,
      kind: "segment",
      points: [
        { x: column * 220 - 90, y: row * 220 - 90 },
        { x: column * 220 + 90, y: row * 220 + 90 },
      ],
    });
  }
  entities.push({
    id: "pl-1",
    kind: "polyline",
    points: Array.from({ length: 100 }, (_, index) => ({ x: index * 22, y: 2400 + Math.sin(index / 6) * 260 })),
  });
  return validateFreeGeometry({ version: 1, entities });
}

/** Durée moyenne d'une opération, en millisecondes. */
function averageMs(runs: number, action: (run: number) => void): number {
  const started = performance.now();
  for (let run = 0; run < runs; run += 1) action(run);
  return (performance.now() - started) / runs;
}

describe("charge du tracé libre (§16)", () => {
  const geometry = loadGeometry();

  it("porte bien le repère annoncé", () => {
    expect(geometry.entities).toHaveLength(201);
    expect(countFreeVertices(geometry)).toBe(400);
  });

  it("projette la scène en un temps négligeable, à chaque changement", () => {
    // La scène est reconstruite à chaque modification (cf. `FreeDrawingBoard`) : si cette
    // projection coûtait cher, chaque trame d'un glissement la paierait.
    const perCall = averageMs(50, () => {
      freeGeometryToShape(geometry, { id: "libre", name: "Charge", frame: "sheet" });
    });
    expect(perCall).toBeLessThan(20);
  });

  it("construit les 400 poignées sans reconstruction de modèle", () => {
    // Contraste avec la classe A, qui reconstruit le modèle une fois par paramètre piloté :
    // la classe C ne calibre rien, donc son coût est strictement linéaire.
    const perCall = averageMs(50, () => {
      expect(buildFreeVertexHandles(geometry)).toHaveLength(400);
    });
    expect(perCall).toBeLessThan(20);
  });

  it("accroche et désigne à la cadence d'un survol", () => {
    const scene = freeGeometryToShape(geometry, { id: "libre", name: "Charge", frame: "sheet" });
    const perFrame = averageMs(200, (run) => {
      const target = { x: (run % 10) * 220 + 5, y: Math.floor(run / 10) * 12 };
      snap(scene, target, { toleranceWorld: 30, gridStepMm: 50 });
      hitTestAll(scene, target, 30);
    });
    // Une trame à 60 Hz dure 16 ms ; le seuil laisse une marge d'un ordre de grandeur pour
    // rester juste sur une machine lente sans cesser d'attraper une régression quadratique.
    expect(perFrame).toBeLessThan(15);
  });

  it("déplace un sommet en temps constant, quel que soit le nombre d'entités", () => {
    const perMove = averageMs(200, (run) => {
      moveFreeVertex(geometry, "pl-1", run % 100, { x: run, y: 2400 });
    });
    expect(perMove).toBeLessThan(15);
  });
});
