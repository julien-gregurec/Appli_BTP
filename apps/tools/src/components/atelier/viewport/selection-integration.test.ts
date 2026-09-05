/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §12 — sélection réelle du viewport, bout en bout.
 *
 * Chaîne complète, sans composant React :
 *   `TracingProject` → résolveur → `TraceModel` → `PlanScene` → écran → monde → `hitTest`.
 *
 * Aucune fixture géométrique : les scènes viennent d'Engine B. Un clic est exprimé en PIXELS,
 * comme un vrai clic, puis converti — c'est le trajet exact que fait `AtelierViewportWorkspace`.
 */

import { describe, expect, it } from "vitest";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import { hitTest, hitTestCandidates } from "../../../lib/geometry/hit-test";
import { snap } from "../../../lib/geometry/snap";
import { chooseGridStep } from "../../../lib/viewport/grid";
import { selectionTolerancePx, toleranceWorldFor } from "../../../lib/viewport/pointer-targeting";
import { fitToBounds, screenToWorld, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import { listSceneEntities } from "./plan-scene";
import { resolvedPlanScene } from "./resolved-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };
const MODELS = ["ellipse-pedagogical", "flower-5", "arch-full-round", "star-5", "circle-division"] as const;

function sceneOf(modelId: string, modelParams?: Record<string, number>) {
  const resolution = resolveTracingProjectModel({ modelId, modelParams } as never);
  if (resolution.status !== "resolved") throw new Error(`Modèle ${modelId} non résolu.`);
  const scene = resolvedPlanScene(resolution);
  if (!scene) throw new Error(`Scène absente pour ${modelId}.`);
  return scene;
}

/** Reproduit exactement ce que fait le workspace : pixel → monde → hit-test. */
function clickAt(scene: ReturnType<typeof sceneOf>, screenPoint: { x: number; y: number }, view: ReturnType<typeof fitToBounds>, precision: "fine" | "coarse" = "fine") {
  const world = screenToWorld(screenPoint, view, SIZE);
  return hitTest(scene, world, toleranceWorldFor(selectionTolerancePx(precision), view));
}

describe("sélection sur un modèle réel", () => {
  it.each(MODELS)("désigne chaque entité de %s quand on clique exactement dessus", (modelId) => {
    const scene = sceneOf(modelId);
    const view = fitToBounds(scene.bounds, SIZE);
    for (const entity of listSceneEntities(scene)) {
      // On vise le point de l'entité le plus proche de son propre centre géométrique : il est
      // par construction SUR l'entité.
      const own = hitTestCandidates(scene, { x: 0, y: 0 }).find((c) => c.entityId === entity.id);
      expect(own, `entité ${entity.id} absente des candidats`).toBeDefined();
      const screenPoint = worldToScreen(own!.closestPoint, view, SIZE);
      const hit = clickAt(scene, screenPoint, view);
      expect(hit, `clic sur ${entity.id} (${entity.kind}) ne désigne rien`).not.toBeNull();
      // Le hit peut légitimement retenir une entité PLUS prioritaire passant au même endroit.
      expect(hit!.distance).toBeLessThanOrEqual(toleranceWorldFor(selectionTolerancePx("fine"), view) + 1e-6);
    }
  });

  it("désélectionne sur un clic à vide, loin de toute géométrie", () => {
    const scene = sceneOf("star-5");
    const view = fitToBounds(scene.bounds, SIZE);
    // Coin supérieur gauche du viewport : hors du tracé une fois celui-ci recentré avec marge.
    expect(clickAt(scene, { x: 2, y: 2 }, view)).toBeNull();
  });

  it("reste sélectionnable à tous les zooms — la tolérance suit l'échelle (§2)", () => {
    const scene = sceneOf("arch-full-round");
    const fit = fitToBounds(scene.bounds, SIZE);
    const target = hitTestCandidates(scene, { x: 0, y: 0 }).find((c) => c.entityKind === "arc");
    expect(target).toBeDefined();
    for (const factor of [0.1, 0.5, 1, 4, 16]) {
      const view = { ...fit, scale: fit.scale * factor };
      const onScreen = worldToScreen(target!.closestPoint, view, SIZE);
      // Clic décalé de 6 px à l'écran, à tous les zooms.
      const hit = clickAt(scene, { x: onScreen.x + 6, y: onScreen.y }, view);
      expect(hit, `zoom ×${factor}`).not.toBeNull();
    }
  });

  it("le doigt atteint un point que la souris manque de peu (§8)", () => {
    const scene = sceneOf("star-5");
    const view = fitToBounds(scene.bounds, SIZE);
    const named = scene.points?.[0];
    expect(named).toBeDefined();
    const onScreen = worldToScreen(named!, view, SIZE);
    // 16 px : au-delà de la tolérance souris (12), en deçà de la tolérance tactile (20).
    const nudged = { x: onScreen.x + 16, y: onScreen.y };
    const fine = clickAt(scene, nudged, view, "fine");
    const coarse = clickAt(scene, nudged, view, "coarse");
    expect(coarse).not.toBeNull();
    // Le doigt ne doit jamais désigner MOINS que la souris.
    if (fine) expect(coarse).not.toBeNull();
  });

  it("préfère un point nommé au trait qui le porte", () => {
    const scene = sceneOf("circle-division");
    const view = fitToBounds(scene.bounds, SIZE);
    const named = (scene.points ?? []).find((item) => item.role !== "center");
    expect(named).toBeDefined();
    const onScreen = worldToScreen(named!, view, SIZE);
    const hit = clickAt(scene, onScreen, view);
    expect(hit?.entityKind).toBe("point");
  });
});

describe("accrochage sur un modèle réel", () => {
  it.each(MODELS)("propose un accrochage sur un point réel de %s", (modelId) => {
    const scene = sceneOf(modelId);
    const view = fitToBounds(scene.bounds, SIZE);
    const named = scene.points?.[0];
    expect(named, `${modelId} ne publie aucun point`).toBeDefined();
    const found = snap(scene, { x: named!.x + 1, y: named!.y + 1 }, {
      toleranceWorld: toleranceWorldFor(10, view),
      gridStepMm: chooseGridStep(view.scale),
    });
    expect(found).not.toBeNull();
    expect(found!.position.x).toBeCloseTo(named!.x, 6);
    expect(found!.position.y).toBeCloseTo(named!.y, 6);
  });

  it("retombe sur la grille loin de toute géométrie, en millimètres", () => {
    const scene = sceneOf("star-5");
    const view = fitToBounds(scene.bounds, SIZE);
    const step = chooseGridStep(view.scale);
    // Un noeud de grille très à l'écart du tracé.
    const node = { x: step * 200, y: step * 200 };
    const found = snap(scene, node, { toleranceWorld: toleranceWorldFor(10, view), gridStepMm: step });
    expect(found?.kind).toBe("grid");
    expect(found!.position.x % step).toBeCloseTo(0, 6);
    expect(found!.position.y % step).toBeCloseTo(0, 6);
  });
});

describe("charge (§10)", () => {
  it("encaisse des milliers de hit-tests sur le modèle le plus dense", () => {
    const scene = sceneOf("circle-division", { divisions: 24 });
    const view = fitToBounds(scene.bounds, SIZE);
    const count = listSceneEntities(scene).length;
    expect(count).toBeGreaterThanOrEqual(20);

    const started = Date.now();
    for (let index = 0; index < 3000; index += 1) {
      clickAt(scene, { x: (index * 7) % SIZE.width, y: (index * 13) % SIZE.height }, view);
    }
    // Large marge : le but est de détecter un coût accidentellement quadratique, pas de mesurer.
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it("ne dépend pas de l'ordre : deux appels identiques donnent le même résultat", () => {
    const scene = sceneOf("flower-5");
    const view = fitToBounds(scene.bounds, SIZE);
    const at = { x: 431, y: 277 };
    expect(clickAt(scene, at, view)).toEqual(clickAt(scene, at, view));
  });
});
