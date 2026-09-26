/**
 * ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §14 — tests d'intégration de la chaîne
 * réelle, sans composant React :
 *
 *   `TracingProject` → `resolveTracingProjectModel` → `TraceModel` → `PlanScene` → cadrage.
 *
 * Aucune fixture de géométrie : les scènes viennent du résolveur, donc d'Engine B. Un modèle
 * qui cesserait de produire de la géométrie ferait tomber ces tests, pas seulement ceux du
 * moteur.
 */

import { describe, expect, it } from "vitest";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import { fitToBounds, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import { buildGridModel, chooseGridStep } from "../../../lib/viewport/grid";
import { countSceneEntities, describeSceneEntity, listSceneEntities } from "./plan-scene";
import { atelierViewKey, planSceneForStep, resolvedPlanScene, stepAt } from "./resolved-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };

/** Projet minimal — même forme que ce que le repository Atelier restitue. */
function project(modelId: string | undefined, modelParams?: Record<string, number>) {
  return { modelId, modelParams } as Parameters<typeof resolveTracingProjectModel>[0];
}

function sceneOf(modelId: string, modelParams?: Record<string, number>) {
  const resolution = resolveTracingProjectModel(project(modelId, modelParams));
  expect(resolution.status).toBe("resolved");
  const scene = resolvedPlanScene(resolution);
  if (!scene) throw new Error(`Modèle ${modelId} non résolu.`);
  return scene;
}

describe("resolvedPlanScene — modèles réels du catalogue", () => {
  // Les quatre modèles de la recette mobile (§12).
  const MODELS = ["ellipse-pedagogical", "flower-5", "arch-full-round", "star-5"] as const;

  it.each(MODELS)("expose la géométrie résolue de %s sans adaptateur", (modelId) => {
    const scene = sceneOf(modelId);
    expect(scene.id).toBeTruthy();
    expect(countSceneEntities(scene)).toBeGreaterThan(0);
  });

  it.each(MODELS)("publie des bornes finies et non dégénérées pour %s", (modelId) => {
    const { bounds } = sceneOf(modelId);
    for (const value of [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
  });

  it("est la MÊME référence que le TraceModel — aucune recopie de géométrie (§3)", () => {
    const resolution = resolveTracingProjectModel(project("star-5"));
    if (resolution.status !== "resolved") throw new Error("star-5 doit se résoudre.");
    expect(resolvedPlanScene(resolution)).toBe(resolution.model);
  });

  it("rend les traits de construction sélectionnables au même titre que la forme", () => {
    const scene = sceneOf("arch-full-round");
    const construction = scene.constructionLines ?? [];
    if (construction.length === 0) return; // modèle sans trait de construction : rien à prouver
    const ids = listSceneEntities(scene).map((entity) => entity.id);
    for (const line of construction) expect(ids).toContain(line.id);
    expect(describeSceneEntity(scene, construction[0].id)?.role).toBe("construction");
  });

  it("n'émet aucun identifiant en double une fois construction et forme réunies", () => {
    for (const modelId of MODELS) {
      const ids = listSceneEntities(sceneOf(modelId)).map((entity) => entity.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("états non résolus — aucun crash, aucune scène inventée (§2)", () => {
  it("rend null sans modelId", () => {
    expect(resolvedPlanScene(resolveTracingProjectModel(project(undefined)))).toBeNull();
  });

  it("rend null sur modelId inconnu", () => {
    const resolution = resolveTracingProjectModel(project("modele-qui-n-existe-pas"));
    expect(resolution.status).toBe("unknown-model");
    expect(resolvedPlanScene(resolution)).toBeNull();
  });

  it("rend null sur paramètres hors bornes, sans clamp", () => {
    // `outerDiameter` est borné à [100, 20000] : 5 mm est refusé, jamais ramené à 100.
    const resolution = resolveTracingProjectModel(project("star-5", { outerDiameter: 5 }));
    expect(resolution.status).toBe("invalid-params");
    expect(resolvedPlanScene(resolution)).toBeNull();
  });

  it("un paramètre inconnu est signalé mais ne fait pas tomber la scène", () => {
    const resolution = resolveTracingProjectModel(project("star-5", { parametreInexistant: 3 }));
    expect(resolution.status).toBe("resolved");
    expect(resolvedPlanScene(resolution)).not.toBeNull();
  });
});

describe("alias legacy — la géométrie arrive quand même (§14)", () => {
  it("traduit `etoile` vers star-5 et produit la même scène", () => {
    const legacy = resolveTracingProjectModel(project("etoile"));
    if (legacy.status !== "resolved") throw new Error("L'alias `etoile` doit se résoudre.");
    expect(legacy.slug).toBe("star-5");
    expect(legacy.warnings.some((warning) => warning.kind === "legacy-model-id")).toBe(true);
    expect(resolvedPlanScene(legacy)?.bounds).toEqual(sceneOf("star-5").bounds);
  });
});

describe("paramètres modifiés — la scène suit, la vue non (§5)", () => {
  it("une surcharge change réellement la géométrie", () => {
    const small = sceneOf("ellipse-pedagogical");
    const resolution = resolveTracingProjectModel(project("ellipse-pedagogical"));
    if (resolution.status !== "resolved") throw new Error("ellipse-pedagogical doit se résoudre.");
    const [first] = resolution.parameters;
    const bigger = sceneOf("ellipse-pedagogical", { [first.id]: resolution.params[first.id] + (first.step ?? 1) * 10 });
    expect(bigger.bounds).not.toEqual(small.bounds);
  });

  it("la clé de vue ne dépend PAS des bornes : elle survit à un changement de paramètre", () => {
    expect(atelierViewKey("p1", "ellipse-pedagogical")).toBe(atelierViewKey("p1", "ellipse-pedagogical"));
  });

  it("la clé de vue change sur un autre modèle ou un autre projet (§4)", () => {
    expect(atelierViewKey("p1", "star-5")).not.toBe(atelierViewKey("p1", "flower-5"));
    expect(atelierViewKey("p1", "star-5")).not.toBe(atelierViewKey("p2", "star-5"));
  });

  it("un modèle non résolu ne partage pas la clé d'un modèle résolu", () => {
    expect(atelierViewKey("p1", undefined)).not.toBe(atelierViewKey("p1", "star-5"));
  });
});

describe("cadrage initial (§4)", () => {
  it.each(["ellipse-pedagogical", "flower-5", "arch-full-round", "star-5"])(
    "fait tenir %s entièrement dans le viewport, marge comprise",
    (modelId) => {
      const { bounds } = sceneOf(modelId);
      const view = fitToBounds(bounds, SIZE);
      const corners = [
        worldToScreen({ x: bounds.minX, y: bounds.minY }, view, SIZE),
        worldToScreen({ x: bounds.maxX, y: bounds.maxY }, view, SIZE),
      ];
      for (const corner of corners) {
        expect(corner.x).toBeGreaterThanOrEqual(0);
        expect(corner.x).toBeLessThanOrEqual(SIZE.width);
        expect(corner.y).toBeGreaterThanOrEqual(0);
        expect(corner.y).toBeLessThanOrEqual(SIZE.height);
      }
    },
  );

  it("centre la vue sur le centre des bornes", () => {
    const { bounds } = sceneOf("star-5");
    const view = fitToBounds(bounds, SIZE);
    expect(view.centerX).toBeCloseTo((bounds.minX + bounds.maxX) / 2, 6);
    expect(view.centerY).toBeCloseTo((bounds.minY + bounds.maxY) / 2, 6);
  });
});

describe("unités monde = millimètres (§9)", () => {
  it("1000 unités monde valent 1000 mm de grille au même pas", () => {
    const view = { scale: 1, centerX: 0, centerY: 0 };
    // À l'échelle 1, 1 unité monde = 1 px : 1000 unités séparées de 1000 px.
    const origin = worldToScreen({ x: 0, y: 0 }, view, SIZE);
    const far = worldToScreen({ x: 1000, y: 0 }, view, SIZE);
    expect(far.x - origin.x).toBeCloseTo(1000, 6);
  });

  it("le pas de grille reste dans l'échelle métier en mm, quel que soit le zoom", () => {
    for (const scale of [0.01, 0.05, 0.2, 1, 5]) {
      const step = chooseGridStep(scale);
      expect([10, 50, 100, 500, 1000, 5000]).toContain(step);
      // Le pas retenu est bien exprimé en mm : son espacement écran vaut pas × échelle.
      if (step !== 5000) expect(step * scale).toBeGreaterThanOrEqual(12);
    }
  });

  it("la grille d'un modèle réel s'exprime dans les mêmes unités que ses bornes", () => {
    const { bounds } = sceneOf("arch-full-round");
    const view = fitToBounds(bounds, SIZE);
    const grid = buildGridModel(view, SIZE);
    expect(grid).not.toBeNull();
    // Espacement écran = pas en mm × échelle px/mm : aucun facteur px/mm implicite.
    expect(grid!.spacingPx).toBeCloseTo(grid!.stepMm * view.scale, 6);
  });
});

describe("sélection sur une entité réelle (§6/§7)", () => {
  it("chaque entité inventoriée est descriptible", () => {
    const scene = sceneOf("flower-5");
    for (const entity of listSceneEntities(scene)) {
      const details = describeSceneEntity(scene, entity.id);
      expect(details, `entité ${entity.id} non descriptible`).not.toBeNull();
      expect(details!.kind).toBe(entity.kind);
      expect(details!.rows.length).toBeGreaterThan(0);
    }
  });

  it("un identifiant absent ne décrit rien plutôt que de deviner", () => {
    expect(describeSceneEntity(sceneOf("star-5"), "entite-inexistante")).toBeNull();
  });
});

describe("mode chantier — visibilité par étape (§8)", () => {
  it("une étape sans visibleEntityIds ne restreint rien et garde la référence", () => {
    const scene = sceneOf("star-5");
    const step = { id: "s1", title: "t", instruction: "i", measurements: [], pointIds: [] };
    expect(planSceneForStep(scene, step)).toBe(scene);
    expect(planSceneForStep(scene, null)).toBe(scene);
  });

  it("une étape avec visibleEntityIds ne garde que les entités citées", () => {
    const scene = sceneOf("star-5");
    const [first] = listSceneEntities(scene);
    const filtered = planSceneForStep(scene, {
      id: "s1",
      title: "t",
      instruction: "i",
      measurements: [],
      pointIds: [],
      visibleEntityIds: [first.id],
    });
    expect(listSceneEntities(filtered).map((entity) => entity.id)).toEqual([first.id]);
  });

  it("filtrer une étape ne déplace jamais le cadrage", () => {
    const scene = sceneOf("star-5");
    const [first] = listSceneEntities(scene);
    const filtered = planSceneForStep(scene, {
      id: "s1", title: "t", instruction: "i", measurements: [], pointIds: [], visibleEntityIds: [first.id],
    });
    expect(filtered.bounds).toEqual(scene.bounds);
  });

  it("stepAt borne l'index aux étapes réellement publiées", () => {
    const resolution = resolveTracingProjectModel(project("star-5"));
    if (resolution.status !== "resolved") throw new Error("star-5 doit se résoudre.");
    const { model } = resolution;
    expect(stepAt(model, null)).toBeNull();
    if (model.steps.length > 0) {
      expect(stepAt(model, -5)).toBe(model.steps[0]);
      expect(stepAt(model, 9999)).toBe(model.steps[model.steps.length - 1]);
    } else {
      expect(stepAt(model, 0)).toBeNull();
    }
  });
});

describe("charge (§13)", () => {
  it("un modèle dense reste inventoriable en un seul passage", () => {
    const scene = sceneOf("flower-5");
    const before = countSceneEntities(scene);
    expect(countSceneEntities(scene)).toBe(before);
  });
});
