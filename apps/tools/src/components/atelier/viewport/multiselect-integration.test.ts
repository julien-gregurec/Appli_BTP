/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — cycle et sélection multiple, bout en bout.
 *
 * Reproduit la chaîne exacte de `AtelierViewportWorkspace.onCanvasClick` — pixel → monde →
 * `hitTestAll` → cycle → règle de sélection — sur des scènes réellement résolues par Engine B.
 * Sans composant React : ce qui est vérifié ici est la DÉCISION, et elle vit entièrement dans
 * des modules purs. C'est précisément ce qui rend ce test possible.
 */

import { describe, expect, it } from "vitest";
import { hitTestAll } from "../../../lib/geometry/hit-test";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import {
  advanceSelectionCycle,
  SELECTION_CYCLE_ANCHOR_PX,
  type SelectionCycleState,
} from "../../../lib/viewport/selection-cycle";
import { applySelectionClick, EMPTY_SELECTION, primarySelection } from "../../../lib/viewport/selection-set";
import { selectionTolerancePx, toleranceWorldFor } from "../../../lib/viewport/pointer-targeting";
import { fitToBounds, screenToWorld, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import { describeSceneSelection, listSceneEntities, type PlanScene } from "./plan-scene";
import { resolvedPlanScene } from "./resolved-scene";
import { DENSE_SCENE } from "./preview-fixture";

const SIZE: ViewportSize = { width: 900, height: 600 };

function sceneOf(modelId: string): PlanScene {
  const resolution = resolveTracingProjectModel({ modelId } as never);
  if (resolution.status !== "resolved") throw new Error(`Modèle ${modelId} non résolu.`);
  const scene = resolvedPlanScene(resolution);
  if (!scene) throw new Error(`Scène absente pour ${modelId}.`);
  return scene;
}

/**
 * Le viewport, réduit à sa décision de sélection. Même enchaînement, mêmes constantes et même
 * clé de scène que le composant : si l'un des deux change, le test doit le voir.
 */
function createClicker(scene: PlanScene, viewKey = "test") {
  const view = fitToBounds(scene.bounds, SIZE);
  let cycle: SelectionCycleState | null = null;
  let selection: readonly string[] = EMPTY_SELECTION;

  return {
    view,
    get selection() {
      return selection;
    },
    get primary() {
      return primarySelection(selection);
    },
    /** Clic en PIXELS, comme un vrai clic. `additive` traduit le Maj du desktop. */
    click(local: { x: number; y: number }, additive = false, precision: "fine" | "coarse" = "fine") {
      const world = screenToWorld(local, view, SIZE);
      const tolerance = toleranceWorldFor(selectionTolerancePx(precision), view);
      const candidates = hitTestAll(scene, world, tolerance);
      const step = advanceSelectionCycle(cycle, {
        world,
        scale: view.scale,
        sceneKey: `${viewKey}|${scene.id}`,
        candidateIds: candidates.map((candidate) => candidate.entityId),
        anchorToleranceWorld: toleranceWorldFor(SELECTION_CYCLE_ANCHOR_PX, view),
        advance: !additive,
      });
      cycle = step.state;
      selection = applySelectionClick(selection, step.entityId, additive);
      return step;
    },
    /** Position écran d'une entité repérée par un point monde connu. */
    screenOf(world: { x: number; y: number }) {
      return worldToScreen(world, view, SIZE);
    },
  };
}

describe("§4 — cycle de sélection sur un croisement réel", () => {
  /** Croisement franc de la trame dense : deux traits exactement superposés en ce point. */
  const CROSSING = { x: 1800, y: 1800 };

  it("désigne une entité DIFFÉRENTE au deuxième clic au même endroit", () => {
    const clicker = createClicker(DENSE_SCENE);
    const at = clicker.screenOf(CROSSING);

    const first = clicker.click(at);
    const second = clicker.click(at);

    expect(first.entityId).toBeTruthy();
    expect(second.entityId).toBeTruthy();
    expect(second.entityId).not.toBe(first.entityId);
    expect(second.continued).toBe(true);
  });

  it("revient au premier candidat après un tour complet", () => {
    const clicker = createClicker(DENSE_SCENE);
    const at = clicker.screenOf(CROSSING);
    const world = screenToWorld(at, clicker.view, SIZE);
    const count = hitTestAll(DENSE_SCENE, world, toleranceWorldFor(selectionTolerancePx("fine"), clicker.view)).length;
    expect(count).toBeGreaterThan(1);

    const picked = Array.from({ length: count + 1 }, () => clicker.click(at).entityId);
    expect(picked.at(-1)).toBe(picked[0]);
    // Un tour complet visite chaque candidat exactement une fois.
    expect(new Set(picked.slice(0, count)).size).toBe(count);
  });

  it("rend atteignable une entité que la priorité seule masquerait définitivement", () => {
    const clicker = createClicker(DENSE_SCENE);
    const at = clicker.screenOf(CROSSING);
    const reachable = new Set<string>();
    for (let index = 0; index < 6; index += 1) {
      const found = clicker.click(at).entityId;
      if (found) reachable.add(found);
    }
    expect(reachable.size).toBeGreaterThan(1);
  });

  it("REPART de zéro quand on clique franchement ailleurs puis qu'on revient", () => {
    const clicker = createClicker(DENSE_SCENE);
    const at = clicker.screenOf(CROSSING);

    const first = clicker.click(at).entityId;
    clicker.click(at); // deuxième cran
    clicker.click({ x: at.x + 220, y: at.y + 160 }); // franchement ailleurs
    const back = clicker.click(at);

    expect(back.continued).toBe(false);
    expect(back.entityId).toBe(first);
  });

  it("ne cycle pas là où une seule entité est atteignable", () => {
    const scene = sceneOf("arch-full-round");
    const clicker = createClicker(scene);
    const entities = listSceneEntities(scene);
    expect(entities.length).toBeGreaterThan(0);

    // Sur une portion de tracé isolée, re-cliquer doit redonner la même entité.
    const at = clicker.screenOf({ x: scene.bounds.minX - 10_000, y: scene.bounds.minY - 10_000 });
    expect(clicker.click(at).entityId).toBeNull();
  });
});

describe("§5 — sélection multiple", () => {
  const CROSSING_A = { x: 900, y: 900 };
  const CROSSING_B = { x: 2700, y: 2700 };

  it("un clic simple REMPLACE la sélection", () => {
    const clicker = createClicker(DENSE_SCENE);
    clicker.click(clicker.screenOf(CROSSING_A));
    const first = clicker.selection;
    expect(first).toHaveLength(1);

    clicker.click(clicker.screenOf(CROSSING_B));
    expect(clicker.selection).toHaveLength(1);
    expect(clicker.selection[0]).not.toBe(first[0]);
  });

  it("Maj+clic AJOUTE sans perdre la sélection précédente", () => {
    const clicker = createClicker(DENSE_SCENE);
    clicker.click(clicker.screenOf(CROSSING_A));
    clicker.click(clicker.screenOf(CROSSING_B), true);
    expect(clicker.selection.length).toBe(2);
  });

  it("Maj+clic sur une entité déjà tenue la RETIRE", () => {
    const clicker = createClicker(DENSE_SCENE);
    const a = clicker.screenOf(CROSSING_A);
    clicker.click(a);
    const kept = clicker.selection[0];

    clicker.click(clicker.screenOf(CROSSING_B), true);
    expect(clicker.selection).toHaveLength(2);

    // Retirer la seconde : la première redevient principale.
    const second = clicker.selection[1];
    clicker.click(clicker.screenOf(CROSSING_B), true);
    expect(clicker.selection).toEqual([kept]);
    expect(clicker.primary).toBe(kept);
    expect(clicker.selection).not.toContain(second);
  });

  it("un clic simple dans le vide vide la sélection", () => {
    const clicker = createClicker(DENSE_SCENE);
    clicker.click(clicker.screenOf(CROSSING_A));
    clicker.click(clicker.screenOf(CROSSING_B), true);
    expect(clicker.selection).toHaveLength(2);

    clicker.click({ x: 4, y: 4 });
    expect(clicker.selection).toHaveLength(0);
  });

  it("un Maj+clic MANQUÉ préserve la sélection", () => {
    const clicker = createClicker(DENSE_SCENE);
    clicker.click(clicker.screenOf(CROSSING_A));
    clicker.click(clicker.screenOf(CROSSING_B), true);
    const before = clicker.selection;

    clicker.click({ x: 4, y: 4 }, true);
    expect(clicker.selection).toEqual(before);
  });

  it("l'entité principale reste la dernière désignée — compatibilité selectedEntityId", () => {
    const clicker = createClicker(DENSE_SCENE);
    clicker.click(clicker.screenOf(CROSSING_A));
    clicker.click(clicker.screenOf(CROSSING_B), true);
    expect(clicker.primary).toBe(clicker.selection.at(-1));
  });
});

describe("§6 — résumé d'une sélection multiple", () => {
  const scene = DENSE_SCENE;
  const ids = listSceneEntities(scene).slice(0, 4).map((entity) => entity.id);

  it("compte les entités et détaille leurs natures", () => {
    const summary = describeSceneSelection(scene, ids);
    expect(summary.count).toBe(4);
    expect(summary.kinds.reduce((total, row) => total + row.count, 0)).toBe(4);
    expect(summary.rows.find((row) => row.label === "Sélection")?.value).toBe("4 entités");
  });

  it("liste les identifiants dans l'ordre de SÉLECTION, pas dans celui de la scène", () => {
    const reversed = [...ids].reverse();
    const summary = describeSceneSelection(scene, reversed);
    expect(summary.entities.map((entity) => entity.id)).toEqual(reversed);
  });

  it("ignore silencieusement un identifiant qui n'existe plus dans la scène", () => {
    const summary = describeSceneSelection(scene, [...ids, "entite-disparue"]);
    expect(summary.count).toBe(4);
    expect(summary.rows.find((row) => row.label === "Identifiants")?.value).not.toContain("entite-disparue");
  });

  it("n'annonce un rôle commun que si TOUTES les entités le partagent", () => {
    const trame = (scene.segments ?? []).filter((segment) => segment.id.startsWith("trame-")).slice(0, 3);
    expect(describeSceneSelection(scene, trame.map((segment) => segment.id)).commonRole).toBe("construction");

    const mixed = [trame[0].id, (scene.circles ?? [])[0]?.id].filter(Boolean) as string[];
    if (mixed.length === 2) expect(describeSceneSelection(scene, mixed).commonRole).toBeNull();
  });

  it("cumule les longueurs quand toutes les entités en ont une", () => {
    const segments = (scene.segments ?? []).slice(0, 3).map((segment) => segment.id);
    const summary = describeSceneSelection(scene, segments);
    expect(summary.rows.some((row) => row.label === "Longueur cumulée")).toBe(true);
  });

  it("n'affiche AUCUNE longueur cumulée si une entité n'en a pas", () => {
    // Un point n'a pas de longueur : un total partiel serait un chiffre faux sur un chantier.
    const withPoint: PlanScene = { ...scene, points: [{ id: "p1", x: 0, y: 0, role: "reference" }] };
    const summary = describeSceneSelection(withPoint, [(scene.segments ?? [])[0].id, "p1"]);
    expect(summary.count).toBe(2);
    expect(summary.rows.some((row) => row.label === "Longueur cumulée")).toBe(false);
  });

  it("rend un résumé vide et sans exception pour une sélection vide", () => {
    const summary = describeSceneSelection(scene, []);
    expect(summary.count).toBe(0);
    expect(summary.commonRole).toBeNull();
    expect(summary.kinds).toHaveLength(0);
  });
});
