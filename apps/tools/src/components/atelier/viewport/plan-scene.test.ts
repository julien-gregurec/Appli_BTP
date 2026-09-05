import { describe, expect, it } from "vitest";
import { countSceneEntities, describeSceneEntity, entityKindLabel, entityLabel, listSceneEntities } from "./plan-scene";
import { DENSE_SCENE, MEDIUM_SCENE, SIMPLE_SCENE } from "./preview-fixture";

describe("listSceneEntities", () => {
  it("inventorie contour, axes et points de la scène simple", () => {
    const ids = listSceneEntities(SIMPLE_SCENE).map((entity) => entity.id);
    expect(ids).toContain("contour");
    expect(ids).toContain("axe-h");
    expect(ids).toContain("O");
  });

  it("n'émet aucun identifiant en double", () => {
    for (const scene of [SIMPLE_SCENE, MEDIUM_SCENE, DENSE_SCENE]) {
      const ids = listSceneEntities(scene).map((entity) => entity.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("est stable d'un appel à l'autre", () => {
    expect(listSceneEntities(MEDIUM_SCENE)).toEqual(listSceneEntities(MEDIUM_SCENE));
  });

  it("tolère une scène vide", () => {
    expect(listSceneEntities({ id: "vide", name: "vide", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } })).toEqual([]);
  });

  it("compte plusieurs dizaines d'entités sur la scène de charge (§14)", () => {
    expect(countSceneEntities(DENSE_SCENE)).toBeGreaterThan(50);
  });
});

describe("describeSceneEntity", () => {
  it("décrit un contour fermé", () => {
    const details = describeSceneEntity(SIMPLE_SCENE, "contour");
    expect(details?.kind).toBe("polygon");
    expect(details?.rows.find((row) => row.label === "Sommets")?.value).toBe("5");
    expect(details?.rows.find((row) => row.label === "Périmètre")?.value).toContain("mm");
  });

  it("calcule la longueur d'un segment", () => {
    const details = describeSceneEntity(SIMPLE_SCENE, "axe-h");
    expect(details?.kind).toBe("segment");
    expect(details?.rows.find((row) => row.label === "Longueur")?.value).toContain("3");
  });

  it("donne rayon et diamètre d'un cercle", () => {
    const details = describeSceneEntity(MEDIUM_SCENE, "spot-1");
    expect(details?.rows.find((row) => row.label === "Rayon")?.value).toContain("45");
    expect(details?.rows.find((row) => row.label === "Diamètre")?.value).toContain("90");
  });

  it("donne rayon et développé d'un arc", () => {
    const details = describeSceneEntity(MEDIUM_SCENE, "retombee");
    expect(details?.kind).toBe("arc");
    expect(details?.rows.map((row) => row.label)).toContain("Développé");
  });

  it("décrit une ellipse et une polyligne", () => {
    expect(describeSceneEntity(MEDIUM_SCENE, "ovale-central")?.kind).toBe("ellipse");
    expect(describeSceneEntity(MEDIUM_SCENE, "gorge-led")?.kind).toBe("polyline");
  });

  it("décrit un point et son rôle", () => {
    const details = describeSceneEntity(SIMPLE_SCENE, "O");
    expect(details?.kind).toBe("point");
    expect(details?.rows.find((row) => row.label === "Rôle")?.value).toBe("center");
  });

  it("renvoie null pour une sélection vide ou inconnue", () => {
    expect(describeSceneEntity(SIMPLE_SCENE, null)).toBeNull();
    expect(describeSceneEntity(SIMPLE_SCENE, "inconnu")).toBeNull();
  });

  it("expose une fiche pour chaque entité listée", () => {
    for (const entity of listSceneEntities(MEDIUM_SCENE)) {
      expect(describeSceneEntity(MEDIUM_SCENE, entity.id)).not.toBeNull();
    }
  });
});

describe("entityLabel", () => {
  it("préfixe par la nature quand l'identifiant ne la porte pas", () => {
    expect(entityLabel("segment", "axe-h")).toBe("Segment axe-h");
    expect(entityLabel("circle", "spot-1")).toBe("Cercle spot-1");
  });

  it("ne redouble pas la nature déjà présente dans l'identifiant", () => {
    expect(entityLabel("polygon", "contour")).toBe("Contour");
    expect(entityLabel("polygon", "contour-piece")).toBe("Contour-piece");
    expect(entityLabel("arc", "arc-retombee")).toBe("Arc-retombee");
  });

  it("est utilisé par l'inventaire et par la fiche de propriétés", () => {
    expect(listSceneEntities(SIMPLE_SCENE).find((entity) => entity.id === "contour")?.label).toBe("Contour");
    expect(describeSceneEntity(SIMPLE_SCENE, "contour")?.label).toBe("Contour");
  });
});

describe("entityKindLabel", () => {
  it("traduit les natures d'entité", () => {
    expect(entityKindLabel("polygon")).toBe("Contour");
    expect(entityKindLabel("arc")).toBe("Arc");
  });
});
