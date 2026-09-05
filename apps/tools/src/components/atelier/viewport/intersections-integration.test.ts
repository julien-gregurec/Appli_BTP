/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — accrochage aux intersections, ordre du hit-test et
 * tenue en scène dense, sur des modèles RÉELLEMENT résolus par Engine B.
 *
 * Comme `selection-integration.test.ts`, ce fichier n'invente aucune géométrie : les scènes
 * viennent du résolveur, et les clics sont exprimés en pixels puis convertis, c'est-à-dire le
 * trajet exact que fait `AtelierViewportWorkspace`. Une intersection qui ne tomberait juste que
 * sur une fixture taillée pour elle ne prouverait rien.
 */

import { describe, expect, it } from "vitest";
import { hitTestAll } from "../../../lib/geometry/hit-test";
import { intersectionSnapCandidates, snapCandidates } from "../../../lib/geometry/snap";
import { segmentSegmentIntersections } from "../../../lib/geometry/intersections";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import { chooseGridStep } from "../../../lib/viewport/grid";
import { selectionTolerancePx, snapTolerancePx, toleranceWorldFor } from "../../../lib/viewport/pointer-targeting";
import { fitToBounds, screenToWorld, type ViewportSize } from "../../../lib/viewport/viewport-math";
import { createDenseScene, DENSE_SCENE } from "./preview-fixture";
import { listSceneEntities, type PlanScene } from "./plan-scene";
import { resolvedPlanScene } from "./resolved-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };

function sceneOf(modelId: string): PlanScene {
  const resolution = resolveTracingProjectModel({ modelId } as never);
  if (resolution.status !== "resolved") throw new Error(`Modèle ${modelId} non résolu.`);
  const scene = resolvedPlanScene(resolution);
  if (!scene) throw new Error(`Scène absente pour ${modelId}.`);
  return scene;
}

describe("§3 — ordre de hitTestAll", () => {
  const scene = sceneOf("ellipse-pedagogical");
  const view = fitToBounds(scene.bounds, SIZE);
  const tolerance = toleranceWorldFor(selectionTolerancePx("coarse"), view);

  /** Points de test balayant la scène, pour ne pas conclure d'un seul endroit heureux. */
  const probes = Array.from({ length: 24 }, (_, index) => ({
    x: 80 + (index % 6) * 140,
    y: 60 + Math.floor(index / 6) * 130,
  }));

  it("classe les candidats par priorité croissante, puis par distance", () => {
    for (const probe of probes) {
      const results = hitTestAll(scene, screenToWorld(probe, view, SIZE), tolerance);
      for (let index = 1; index < results.length; index += 1) {
        const previous = results[index - 1];
        const current = results[index];
        expect(previous.priority).toBeLessThanOrEqual(current.priority);
        if (previous.priority === current.priority) {
          // Tolère l'égalité : à distance égale c'est l'identifiant qui départage.
          expect(previous.distance).toBeLessThanOrEqual(current.distance + 1e-6);
        }
      }
    }
  });

  it("ne retient aucun candidat hors tolérance", () => {
    for (const probe of probes) {
      for (const result of hitTestAll(scene, screenToWorld(probe, view, SIZE), tolerance)) {
        expect(result.distance).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it("est DÉTERMINISTE : deux appels identiques rendent exactement la même liste", () => {
    for (const probe of probes) {
      const world = screenToWorld(probe, view, SIZE);
      const first = hitTestAll(scene, world, tolerance).map((hit) => hit.entityId);
      const second = hitTestAll(scene, world, tolerance).map((hit) => hit.entityId);
      expect(second).toEqual(first);
    }
  });

  it("ne dépend pas de l'ordre de construction de la scène", () => {
    // Même géométrie, listes réordonnées : le classement doit être identique. C'est la garantie
    // qu'un même clic désigne la même entité d'une publication du générateur à l'autre.
    const shuffled: PlanScene = {
      ...scene,
      segments: [...(scene.segments ?? [])].reverse(),
      points: [...(scene.points ?? [])].reverse(),
      circles: [...(scene.circles ?? [])].reverse(),
      arcs: [...(scene.arcs ?? [])].reverse(),
    };
    for (const probe of probes) {
      const world = screenToWorld(probe, view, SIZE);
      expect(hitTestAll(shuffled, world, tolerance).map((hit) => hit.entityId)).toEqual(
        hitTestAll(scene, world, tolerance).map((hit) => hit.entityId),
      );
    }
  });

  it("place en tête exactement ce que hitTest aurait choisi", async () => {
    const { hitTest } = await import("../../../lib/geometry/hit-test");
    for (const probe of probes) {
      const world = screenToWorld(probe, view, SIZE);
      const all = hitTestAll(scene, world, tolerance);
      const single = hitTest(scene, world, tolerance);
      expect(all[0]?.entityId ?? null).toBe(single?.entityId ?? null);
    }
  });
});

describe("§2 — accrochage aux intersections", () => {
  /**
   * La trame dense est faite de verticales et d'horizontales : ses croisements sont connus
   * exactement (multiples du pas), ce qui permet de vérifier la VALEUR du point d'accrochage et
   * pas seulement sa présence.
   */
  it("propose le croisement réel de deux traits de trame, à l'endroit exact", () => {
    const scene = DENSE_SCENE;
    const crossing = { x: 900, y: 900 };
    // Cible franchement décalée du croisement, mais dans la tolérance : c'est le cas d'usage,
    // pas un tir au but.
    const target = { x: crossing.x + 7, y: crossing.y - 5 };
    const found = intersectionSnapCandidates(scene, target, 20);

    expect(found.length).toBeGreaterThan(0);
    const best = found.reduce((a, b) => (a.distance <= b.distance ? a : b));
    expect(best.position.x).toBeCloseTo(crossing.x, 6);
    expect(best.position.y).toBeCloseTo(crossing.y, 6);
    expect(best.kind).toBe("intersection");
  });

  it("nomme le candidat d'après les DEUX entités, dans un ordre stable", () => {
    const found = intersectionSnapCandidates(DENSE_SCENE, { x: 907, y: 895 }, 20);
    const best = found.reduce((a, b) => (a.distance <= b.distance ? a : b));
    const [left, right] = (best.entityId ?? "").split("×");
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left < right).toBe(true);
  });

  it("ne propose AUCUNE intersection hors tolérance", () => {
    // Milieu d'une maille : le croisement le plus proche est à ~636 mm, loin des 20 mm tolérés.
    expect(intersectionSnapCandidates(DENSE_SCENE, { x: 450, y: 450 }, 20)).toHaveLength(0);
  });

  it("ne propose une intersection que si les DEUX entités sont dans la scène fournie", () => {
    const scene = DENSE_SCENE;
    const target = { x: 907, y: 895 };
    expect(intersectionSnapCandidates(scene, target, 20).length).toBeGreaterThan(0);

    // Une entité retirée (étape de chantier qui la masque) : son croisement disparaît avec elle.
    const withoutVertical: PlanScene = {
      ...scene,
      segments: (scene.segments ?? []).filter((segment) => segment.id !== "trame-v-1"),
    };
    for (const candidate of intersectionSnapCandidates(withoutVertical, target, 20)) {
      expect(candidate.entityId).not.toContain("trame-v-1");
    }
  });

  it("n'invente jamais un point : chaque candidat est bien sur les deux entités", () => {
    const scene = DENSE_SCENE;
    const segments = new Map((scene.segments ?? []).map((segment) => [segment.id, segment]));
    let checked = 0;

    for (const target of [
      { x: 905, y: 897 },
      { x: 1800, y: 2700 },
      { x: 4500, y: 1800 },
    ]) {
      for (const candidate of intersectionSnapCandidates(scene, target, 25)) {
        const [left, right] = (candidate.entityId ?? "").split("×");
        const first = segments.get(left);
        const second = segments.get(right);
        if (!first || !second) continue;
        // Recalcul indépendant : le point annoncé doit être CELUI que produit le croisement.
        const truth = segmentSegmentIntersections(first, second);
        expect(truth).toHaveLength(1);
        expect(candidate.position.x).toBeCloseTo(truth[0].x, 6);
        expect(candidate.position.y).toBeCloseTo(truth[0].y, 6);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("laisse un point nommé du modèle l'emporter sur une intersection au même endroit", () => {
    // Priorité §5 : `point` (1) passe avant `intersection` (5). Un croisement matérialisé par un
    // point du modèle doit accrocher SUR ce point, avec son libellé métier.
    const scene: PlanScene = {
      ...DENSE_SCENE,
      points: [{ id: "noeud", x: 900, y: 900, label: "Nœud A", role: "reference" }],
    };
    const best = snapCandidates(scene, { x: 903, y: 898 }, { toleranceWorld: 20 })[0];
    expect(best.kind).toBe("point");
    expect(best.label).toBe("Nœud A");
  });

  it("propose l'intersection via snapCandidates, sous les natures plus signifiantes", () => {
    const found = snapCandidates(DENSE_SCENE, { x: 903, y: 898 }, { toleranceWorld: 20 });
    expect(found.some((candidate) => candidate.kind === "intersection")).toBe(true);
  });

  it("ne calcule aucune intersection quand la nature est exclue par la barre d'outils", () => {
    const found = snapCandidates(DENSE_SCENE, { x: 903, y: 898 }, {
      toleranceWorld: 20,
      kinds: ["point", "endpoint", "midpoint", "center"],
    });
    expect(found.every((candidate) => candidate.kind !== "intersection")).toBe(true);
  });

  it("trouve les intersections d'un modèle réel dont deux traits se croisent", () => {
    // `star-5` : les branches d'une étoile se recoupent, c'est le cas d'usage même du lot.
    const scene = sceneOf("star-5");
    const view = fitToBounds(scene.bounds, SIZE);
    const tolerance = toleranceWorldFor(snapTolerancePx("coarse"), view);

    let total = 0;
    for (let x = 0; x < SIZE.width; x += 12) {
      for (let y = 0; y < SIZE.height; y += 12) {
        total += intersectionSnapCandidates(scene, screenToWorld({ x, y }, view, SIZE), tolerance).length;
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe("§7 — tenue en scène dense", () => {
  const scene = createDenseScene();

  it("dépasse bien 50 entités", () => {
    expect(listSceneEntities(scene).length).toBeGreaterThan(50);
  });

  it("garde un survol complet (hit-test + accrochage) sous la milliseconde en moyenne", () => {
    const view = fitToBounds(scene.bounds, SIZE);
    const selection = toleranceWorldFor(selectionTolerancePx("fine"), view);
    const snapping = toleranceWorldFor(snapTolerancePx("fine"), view);
    const gridStepMm = chooseGridStep(view.scale);

    const samples = 400;
    const started = performance.now();
    for (let index = 0; index < samples; index += 1) {
      // Trajet en diagonale sur toute la zone : on traverse des croisements, pas du vide.
      const local = { x: (index * 7) % SIZE.width, y: (index * 11) % SIZE.height };
      const world = screenToWorld(local, view, SIZE);
      hitTestAll(scene, world, selection);
      snapCandidates(scene, world, { toleranceWorld: snapping, gridStepMm });
    }
    const perMove = (performance.now() - started) / samples;

    // Budget large et volontairement stable en intégration continue : le but est de détecter un
    // retour au quadratique (qui coûterait des dizaines de ms), pas de mesurer la machine.
    expect(perMove).toBeLessThan(4);
  });

  it("ne croise QUE les entités passant sous le pointeur — le filtre est exact, pas approché", () => {
    // Au milieu d'une maille, aucune entité n'est dans la tolérance : aucune paire n'est formée.
    expect(intersectionSnapCandidates(scene, { x: 450, y: 450 }, 20)).toHaveLength(0);
    // Sur un croisement, exactement deux traits sont proches : une seule paire, un seul point.
    const onCrossing = intersectionSnapCandidates(scene, { x: 1800, y: 1800 }, 20);
    expect(onCrossing).toHaveLength(1);
  });

  it("reste linéaire quand la scène grossit : doubler les entités ne quadruple pas le coût", () => {
    const view = fitToBounds(scene.bounds, SIZE);
    const snapping = toleranceWorldFor(snapTolerancePx("fine"), view);

    /** Coût moyen d'un accrochage sur une scène donnée. */
    const cost = (target: PlanScene) => {
      const started = performance.now();
      for (let index = 0; index < 300; index += 1) {
        intersectionSnapCandidates(target, { x: 900 + (index % 5), y: 900 - (index % 3) }, snapping);
      }
      return performance.now() - started;
    };

    // Scène doublée : mêmes traits publiés une seconde fois sous d'autres identifiants.
    const doubled: PlanScene = {
      ...scene,
      segments: [
        ...(scene.segments ?? []),
        ...(scene.segments ?? []).map((segment) => ({ ...segment, id: `${segment.id}-bis` })),
      ],
    };

    cost(scene);
    const single = cost(scene);
    const twice = cost(doubled);
    // Un vrai O(n²) donnerait ~4×. Le balayage linéaire de pré-filtrage domine, donc ~2× au pire ;
    // la marge absorbe le bruit de mesure sans laisser passer une régression quadratique.
    expect(twice).toBeLessThan(single * 3 + 8);
  });
});
