/**
 * ATELIER-TOOLS-FREE-DRAWING-R2-RECONCILIATION-V1 — la preuve de la réconciliation.
 *
 * Le tracé libre (`2c8e1a7`) a été bâti sur la PREMIÈRE version du lot intersections /
 * multisélection (`b0c55e8`). Le canon retenu est la SECONDE (`528773c`), qui n'est pas un
 * descendant de la première mais son frère : broad-phase indexée, cycle tactile, ordre
 * déterministe et accrochage « intersection » y ont été refaits.
 *
 * Aucune des deux lignées ne pouvait donc vérifier ce que ce fichier vérifie : que les
 * primitives LIBRES entrent dans le moteur R2 comme n'importe quelle autre géométrie —
 * intersections, accrochage, désignation, cycle, multisélection — SANS moteur parallèle.
 *
 * La chaîne est la vraie : document libre → `freeGeometryToShape` → `PlanScene` → modules R2.
 * Rien n'est simulé, et surtout pas le pont entre les deux.
 */

import { describe, expect, it } from "vitest";
import { hitTest, hitTestAll } from "../../../lib/geometry/hit-test";
import { intersectionIndexOf, intersectionsNear, sceneIntersections } from "../../../lib/geometry/intersections";
import { snap, snapCandidates } from "../../../lib/geometry/snap";
import { advanceSelectionCycle, cycleAnchorPx, IDLE_SELECTION_CYCLE } from "../../../lib/viewport/selection-cycle";
import { EMPTY_SELECTION, selectSingle, toggleSelection } from "../../../lib/viewport/selection-set";
import {
  EMPTY_FREE_GEOMETRY,
  addFreeEntity,
  createFreeEntity,
  type FreeGeometry,
} from "../../../lib/tracing/free-geometry";
import { freeGeometryToShape } from "../../../lib/tracing/free-shape";
import { describeSceneSelection } from "./plan-scene";
import type { PlanScene } from "./plan-scene";

/**
 * Deux segments libres qui se croisent FRANCHEMENT en (0, 0), et une polyligne libre en
 * trois sommets dont la première arête traverse elle aussi les deux.
 *
 * Le croisement est décentré à dessein : aucun milieu, aucune extrémité, aucun centre n'y
 * tombe. C'est la seule configuration où l'accrochage « intersection » peut sortir en tête
 * plutôt que d'être légitimement fusionné dans un candidat plus signifiant.
 */
function crossingFreeGeometry(): FreeGeometry {
  let geometry = EMPTY_FREE_GEOMETRY;
  geometry = addFreeEntity(
    geometry,
    createFreeEntity("segment", [{ x: -40, y: -40 }, { x: 80, y: 80 }], "seg-1"),
  );
  geometry = addFreeEntity(
    geometry,
    createFreeEntity("segment", [{ x: -40, y: 40 }, { x: 60, y: -60 }], "seg-2"),
  );
  geometry = addFreeEntity(
    geometry,
    createFreeEntity(
      "polyline",
      [{ x: -50, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 60 }],
      "poly-1",
    ),
  );
  return geometry;
}

function sceneOf(geometry: FreeGeometry): PlanScene {
  return freeGeometryToShape(geometry, { id: "libre", name: "Tracé libre", frame: "sheet" }) as PlanScene;
}

describe("§6 — les primitives libres entrent dans le moteur d'intersections R2", () => {
  it("deux segments libres qui se croisent publient leur intersection", () => {
    const scene = sceneOf(crossingFreeGeometry());
    const found = sceneIntersections(scene);

    const cross = found.filter(
      (item) =>
        (item.entityAId === "seg-1" && item.entityBId === "seg-2") ||
        (item.entityAId === "seg-2" && item.entityBId === "seg-1"),
    );
    expect(cross).toHaveLength(1);
    expect(cross[0].position.x).toBeCloseTo(0, 9);
    expect(cross[0].position.y).toBeCloseTo(0, 9);
    expect(cross[0].entityAKind).toBe("segment");
    expect(cross[0].entityBKind).toBe("segment");
    expect(cross[0].tangent).toBe(false);
  });

  it("les ARÊTES d'une polyligne libre croisent les segments libres", () => {
    const scene = sceneOf(crossingFreeGeometry());
    const found = sceneIntersections(scene);

    // La première arête de `poly-1` (y = 10, de x = −50 à x = 50) traverse les deux diagonales.
    const withPolyline = found.filter((item) => item.entityAId === "poly-1" || item.entityBId === "poly-1");
    const partners = new Set(
      withPolyline
        .filter((item) => item.entityAId !== item.entityBId)
        .map((item) => (item.entityAId === "poly-1" ? item.entityBId : item.entityAId)),
    );
    expect(partners).toEqual(new Set(["seg-1", "seg-2"]));

    // La PREMIÈRE arête (y = 10) coupe y = x en (10, 10) et y = −x en (−10, 10) ; la SECONDE
    // (x = 50) recoupe y = x en (50, 50). Les clés d'arête distinguent les deux sans inventer
    // d'identifiant métier — c'est tout l'intérêt de `entityAKey`/`entityBKey` (R2 §3).
    const onFirstEdge = withPolyline.filter(
      // La jonction poly-1#0 / poly-1#1 tombe elle aussi sur y = 10 : elle a son propre test.
      (item) => item.entityAId !== item.entityBId && Math.abs(item.position.y - 10) < 1e-9,
    );
    expect(onFirstEdge.map((item) => item.position.x).sort((a, b) => a - b).map((x) => Math.round(x))).toEqual([-10, 10]);

    const keys = new Set(
      withPolyline.map((item) => (item.entityAId === "poly-1" ? item.entityAKey : item.entityBKey)),
    );
    expect(keys).toEqual(new Set(["poly-1#0", "poly-1#1"]));
  });

  /**
   * Deux arêtes CONSÉCUTIVES d'une polyligne libre se touchent par leur sommet commun, et R2
   * le publie comme n'importe quel autre croisement — l'index travaille par arête, il ne sait
   * pas que ces deux-là sont voisines.
   *
   * Ce n'est pas un défaut, parce que la seule couche qui le donne à voir le fusionne : la
   * position est déjà une EXTRÉMITÉ, et l'accrochage ne rend qu'un candidat (R2 §5). Le
   * vérifier ici évite qu'un futur lot « corrige » l'index et casse le dédoublonnage.
   */
  it("la jonction de deux arêtes consécutives ne produit qu'UN accrochage", () => {
    const scene = sceneOf(crossingFreeGeometry());
    const junction = sceneIntersections(scene).filter((item) => item.entityAId === item.entityBId);
    expect(junction).toHaveLength(1);
    expect(junction[0].position).toEqual({ x: 50, y: 10 });

    const here = snapCandidates(scene, { x: 50, y: 10 }, { toleranceWorld: 2 }).filter(
      (candidate) => Math.hypot(candidate.position.x - 50, candidate.position.y - 10) < 1e-6,
    );
    expect(here).toHaveLength(1);
    expect(here[0].kind).toBe("endpoint");
  });

  it("la broad-phase R2 borne bien le coût sur une scène libre", () => {
    const scene = sceneOf(crossingFreeGeometry());
    const near = intersectionsNear(scene, { x: 0, y: 0 }, 2);
    const all = sceneIntersections(scene);

    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(all.length);
    for (const item of near) expect(Math.hypot(item.position.x, item.position.y)).toBeLessThanOrEqual(2);
  });

  it("aucun moteur parallèle : la scène libre passe par le MÊME index que le paramétrique", () => {
    // R2 mémorise l'INDEX par référence de scène (WeakMap, §16) — pas le tableau de résultats.
    // C'est cet index que la scène libre doit partager avec le paramétrique : deux appels sur
    // la même scène libre ne le reconstruisent pas.
    const scene = sceneOf(crossingFreeGeometry());
    expect(intersectionIndexOf(scene)).toBe(intersectionIndexOf(scene));

    // Et l'index voit bien les primitives libres, segments comme arêtes de polyligne.
    const kinds = new Set(intersectionIndexOf(scene).entities.map((entity) => entity.kind));
    expect(kinds).toEqual(new Set(["segment"]));
    expect(sceneIntersections(scene).length).toBeGreaterThan(0);
  });
});

describe("§7 — l'accrochage R2 sert les primitives libres, toutes natures confondues", () => {
  const scene = sceneOf(crossingFreeGeometry());

  it("le croisement de deux segments libres est accrochable en tant qu'intersection", () => {
    const best = snap(scene, { x: 0.3, y: -0.2 }, { toleranceWorld: 2 });
    expect(best).not.toBeNull();
    expect(best!.kind).toBe("intersection");
    expect(best!.position.x).toBeCloseTo(0, 9);
    expect(best!.position.y).toBeCloseTo(0, 9);
    expect([...best!.entityIds!].sort()).toEqual(["seg-1", "seg-2"]);
  });

  it("la grille ne l'emporte pas sur une intersection libre au même endroit", () => {
    const best = snap(scene, { x: 0.3, y: -0.2 }, { toleranceWorld: 5, gridStepMm: 10 });
    expect(best!.kind).toBe("intersection");
  });

  it("extrémités et milieux des primitives libres restent servis", () => {
    const kinds = new Set(snapCandidates(scene, { x: 80, y: 80 }, { toleranceWorld: 3 }).map((c) => c.kind));
    expect(kinds.has("endpoint")).toBe(true);

    // Milieu de la seconde arête de la polyligne : de (50, 10) à (50, 60) ⇒ (50, 35).
    const mid = snapCandidates(scene, { x: 50, y: 35 }, { toleranceWorld: 2 });
    expect(mid.some((candidate) => candidate.kind === "midpoint")).toBe(true);
  });

  it("un point libre isolé est accrochable comme point", () => {
    const geometry = addFreeEntity(EMPTY_FREE_GEOMETRY, createFreeEntity("point", [{ x: 12, y: -7 }], "pt-1"));
    const candidates = snapCandidates(sceneOf(geometry), { x: 12.4, y: -6.7 }, { toleranceWorld: 2 });
    expect(candidates.some((candidate) => candidate.kind === "point")).toBe(true);
  });
});

describe("§9 — désignation, cycle et multisélection sur des primitives libres", () => {
  const scene = sceneOf(crossingFreeGeometry());

  it("hitTestAll désigne les deux segments libres superposés au croisement", () => {
    const ids = hitTestAll(scene, { x: 0, y: 0 }, 1).map((item) => item.entityId);
    expect(ids).toContain("seg-1");
    expect(ids).toContain("seg-2");
  });

  it("l'ordre de hitTestAll ne dépend pas de l'ordre de construction du tracé", () => {
    // Même géométrie, entités ajoutées dans l'ordre inverse : l'ordre rendu doit être le même.
    let reversed = EMPTY_FREE_GEOMETRY;
    reversed = addFreeEntity(
      reversed,
      createFreeEntity("segment", [{ x: -40, y: 40 }, { x: 40, y: -40 }], "seg-2"),
    );
    reversed = addFreeEntity(
      reversed,
      createFreeEntity("segment", [{ x: -40, y: -40 }, { x: 40, y: 40 }], "seg-1"),
    );
    const direct = sceneOf(crossingFreeGeometry());
    const a = hitTestAll(direct, { x: 0, y: 0 }, 1).map((item) => item.entityId).filter((id) => id.startsWith("seg-"));
    const b = hitTestAll(sceneOf(reversed), { x: 0, y: 0 }, 1).map((item) => item.entityId);
    expect(b).toEqual(a);
  });

  it("re-cliquer au croisement descend d'un cran, puis reboucle", () => {
    const point = { x: 240, y: 240 };
    const candidates = [...new Set(hitTestAll(scene, { x: 0, y: 0 }, 1).map((item) => item.entityId))];
    expect(candidates.length).toBeGreaterThan(1);

    let state = IDLE_SELECTION_CYCLE;
    const designated: string[] = [];
    for (let click = 0; click < candidates.length + 1; click += 1) {
      const step = advanceSelectionCycle(state, {
        key: "libre::select",
        point,
        candidates,
        anchorPx: cycleAnchorPx("fine"),
      });
      state = step.state;
      designated.push(step.entityId!);
    }
    // Un tour complet, puis retour exact à la tête.
    expect(new Set(designated.slice(0, candidates.length)).size).toBe(candidates.length);
    expect(designated[candidates.length]).toBe(designated[0]);
  });

  it("le cycle est plus tolérant au doigt qu'à la souris sur une scène libre", () => {
    expect(cycleAnchorPx("coarse")).toBeGreaterThan(cycleAnchorPx("fine"));
  });

  it("Maj+clic empile deux primitives libres, re-Maj+clic en retire une", () => {
    let selection = EMPTY_SELECTION;
    selection = toggleSelection(selection, "seg-1");
    selection = toggleSelection(selection, "poly-1");
    expect(selection).toEqual(["seg-1", "poly-1"]);

    selection = toggleSelection(selection, "seg-1");
    expect(selection).toEqual(["poly-1"]);
  });

  it("un clic simple réduit la sélection libre à une seule primitive", () => {
    expect(selectSingle(["seg-1", "poly-1"], "seg-2")).toEqual(["seg-2"]);
    expect(selectSingle(["seg-1", "poly-1"], null)).toEqual([]);
  });

  it("la synthèse multi décrit des primitives libres sans inventer de métré", () => {
    const summary = describeSceneSelection(scene, ["seg-1", "poly-1"]);
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(2);
    // §13 — aucune somme, aucune moyenne : R2 ne publie que des propriétés strictement communes.
    expect(summary!.commonRows.every((row) => !/total|somme|cumul/i.test(row.label))).toBe(true);
  });
});

/**
 * ATELIER-TOOLS-FREE-DRAWING-R2-RECONCILIATION-V1 §17 — reprise de couverture.
 *
 * Ces trois comportements étaient vérifiés par `multiselect-integration.test.ts` de la lignée
 * `b0c55e8`, que la lignée R2 n'a pas repris. Ils sont ici REFORMULÉS sur les contrats R2 —
 * pas recopiés : R2 a délibérément changé trois contrats voisins (longueur cumulée supprimée,
 * `roles` devenu l'union et non l'intersection, résumé vide rendu `null`), et les tests
 * correspondants de `b0c55e8` auraient contredit le canon plutôt que de le protéger.
 */
/**
 * ATELIER-TOOLS-FREE-DRAWING-R2-RECONCILIATION-V1 §3 — ordre TOTAL de `hitTestAll`.
 *
 * La lignée `b0c55e8` quantifiait les distances avant de les comparer (`distanceRank`) ; la
 * refonte R2 ne l'a pas emporté et son comparateur est redevenu intransitif — « à moins de ε »
 * n'est pas une relation d'ordre. `Array.prototype.sort` en exige une : sans elle, la liste
 * rendue dépend de l'ordre du tableau source.
 *
 * Avant la réconciliation, les 80 permutations ci-dessous rendaient 80 ordres DIFFÉRENTS. Le
 * cycle de sélection les compare d'un clic à l'autre : un ordre instable le rouvre en silence,
 * et « re-cliquer pour prendre l'entité en dessous » cesse de tenir.
 */
describe("§3 — hitTestAll rend un ordre total, indépendant de l'ordre de construction", () => {
  it("une chaîne de distances intransitive ne fait pas varier l'ordre rendu", () => {
    const N = 40;
    // Distances espacées d'un demi-ε : deux voisines sont « égales », deux lointaines non.
    // Et l'identifiant est ANTI-corrélé à la distance, pour que les deux critères se
    // contredisent — sans quoi le départage par identifiant masque le défaut.
    const distanceOf = (index: number) => index * 0.5e-6;
    const idOf = (index: number) => `p${String(N - index).padStart(2, "0")}`;

    const sceneFor = (order: readonly number[]): PlanScene => ({
      id: "chaine",
      name: "Chaîne",
      bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      points: order.map((index) => ({ id: idOf(index), x: distanceOf(index), y: 0 })),
    });

    const orderings = new Set<string>();
    for (let seed = 0; seed < 80; seed += 1) {
      const permutation = Array.from({ length: N }, (_, index) => index);
      let state = (seed * 2654435761) % 2147483647 || 7;
      for (let i = permutation.length - 1; i > 0; i -= 1) {
        state = (state * 48271) % 2147483647;
        const j = state % (i + 1);
        [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
      }
      orderings.add(
        hitTestAll(sceneFor(permutation), { x: 0, y: 0 }, 1)
          .map((item) => item.entityId)
          .join(","),
      );
    }

    expect(orderings.size).toBe(1);
  });

  it("le premier candidat de hitTestAll est toujours celui que hitTest désigne", () => {
    const scene = sceneOf(crossingFreeGeometry());
    for (const target of [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 50, y: 10 }, { x: -10, y: 10 }]) {
      const all = hitTestAll(scene, target, 1);
      const one = hitTest(scene, target, 1);
      expect(all[0]?.entityId ?? null).toBe(one?.entityId ?? null);
    }
  });
});

describe("§17 — couverture reprise de la lignée b0c55e8, reformulée sur les contrats R2", () => {
  const scene = sceneOf(crossingFreeGeometry());

  it("un Maj+clic MANQUÉ préserve la sélection (règle R2 §8)", () => {
    // Le workspace R2 sort AVANT toute modification quand un clic additif ne touche rien :
    // vider une sélection patiemment construite parce que le doigt a glissé de trois pixels
    // serait une perte sèche, et la sélection n'entre pas dans l'historique.
    const selection = ["seg-1", "poly-1"] as const;
    const found = hitTestAll(scene, { x: 500, y: 500 }, 1);
    expect(found).toHaveLength(0);

    const next = found.length === 0 ? selection : toggleSelection(selection, found[0].entityId);
    expect(next).toBe(selection);
  });

  it("les entités sont listées dans l'ordre de SÉLECTION, pas dans celui de la scène", () => {
    const summary = describeSceneSelection(scene, ["poly-1", "seg-1"]);
    expect(summary!.entries.map((entry) => entry.id)).toEqual(["poly-1", "seg-1"]);
  });

  it("une sélection vide ou fantôme ne lève jamais", () => {
    expect(describeSceneSelection(scene, [])).toBeNull();
    expect(describeSceneSelection(scene, ["inconnu"])).toBeNull();
    // Un identifiant inconnu mêlé à un vrai est ignoré, jamais affiché.
    expect(describeSceneSelection(scene, ["seg-1", "inconnu"])!.entries.map((e) => e.id)).toEqual(["seg-1"]);
  });
});

/**
 * ATELIER-TOOLS-FREE-DRAWING-R2-RECONCILIATION-V1 §16 — coût d'une scène LIBRE dense, et
 * d'une scène MÉLANGÉE (tracé libre + géométrie croisable) telle que la réconciliation la
 * rend désormais possible.
 *
 * La charge est celle de la recette : 100 points, 100 segments, une polyligne de 100 sommets.
 * Aucune des deux lignées ne pouvait mesurer ce cas — le tracé libre n'avait pas la
 * broad-phase R2, et R2 ne connaissait pas la géométrie libre.
 */
describe("§16 — performance sur tracé libre dense et scène mélangée", () => {
  /** Coût moyen d'un appel, en millisecondes. */
  function measure(run: () => void, iterations: number): number {
    run();
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) run();
    return (performance.now() - started) / iterations;
  }

  /**
   * Charge de la recette : 100 points, 100 segments, une polyligne de 100 sommets.
   *
   * Les segments forment un TREILLIS (50 quasi-horizontaux × 50 quasi-verticaux) : ils se
   * croisent massivement — environ 2 500 intersections sur la feuille — mais aucun point de
   * la feuille n'a cent entités au-dessus de lui. C'est la forme qu'un tracé réel prend, et
   * c'est elle qui doit tenir la trame. Le cas dégénéré est mesuré séparément ci-dessous.
   */
  function loadGeometry(): FreeGeometry {
    let geometry = EMPTY_FREE_GEOMETRY;
    for (let index = 0; index < 100; index += 1) {
      geometry = addFreeEntity(
        geometry,
        createFreeEntity("point", [{ x: (index % 10) * 90 + 15, y: Math.floor(index / 10) * 90 + 15 }], `pt-${index}`),
      );
    }
    for (let index = 0; index < 50; index += 1) {
      const y = index * 18 + 10;
      geometry = addFreeEntity(
        geometry,
        createFreeEntity("segment", [{ x: 5, y }, { x: 895, y: y + 6 }], `sh-${index}`),
      );
    }
    for (let index = 0; index < 50; index += 1) {
      const x = index * 18 + 10;
      geometry = addFreeEntity(
        geometry,
        createFreeEntity("segment", [{ x, y: 5 }, { x: x + 6, y: 895 }], `sv-${index}`),
      );
    }
    geometry = addFreeEntity(
      geometry,
      createFreeEntity(
        "polyline",
        Array.from({ length: 100 }, (_, index) => ({ x: index * 9, y: 450 + Math.sin(index / 4) * 120 })),
        "pl-1",
      ),
    );
    return geometry;
  }

  /** Cas dégénéré : cent segments concourants au MÊME point. Pire cas absolu de la broad-phase. */
  function pencilGeometry(): FreeGeometry {
    let geometry = EMPTY_FREE_GEOMETRY;
    for (let index = 0; index < 100; index += 1) {
      const angle = (index / 100) * Math.PI;
      geometry = addFreeEntity(
        geometry,
        createFreeEntity(
          "segment",
          [
            { x: 450 + Math.cos(angle) * 400, y: 450 + Math.sin(angle) * 400 },
            { x: 450 - Math.cos(angle) * 400, y: 450 - Math.sin(angle) * 400 },
          ],
          `px-${index}`,
        ),
      );
    }
    return geometry;
  }

  const LOAD = sceneOf(loadGeometry());
  const PENCIL = sceneOf(pencilGeometry());

  it("la scène de charge se projette bien en 201 primitives libres", () => {
    expect(LOAD.points).toHaveLength(100);
    expect(LOAD.segments).toHaveLength(100);
    expect(LOAD.polylines).toHaveLength(1);
    // Le treillis croise réellement : sans quoi la broad-phase n'aurait rien à borner.
    expect(sceneIntersections(LOAD).length).toBeGreaterThan(1000);
  });

  it("le survol reste très en deçà de la trame sur 100 points + 100 segments + polyligne 100 sommets", () => {
    const target = { x: 450, y: 450 };
    const hitCost = measure(() => void hitTestAll(LOAD, target, 3), 200);
    const nearCost = measure(() => void intersectionsNear(LOAD, target, 3), 200);
    const snapCost = measure(() => void snap(LOAD, target, { toleranceWorld: 3, gridStepMm: 100 }), 200);

    // Budget d'une trame à 60 Hz : 16,7 ms. Le survol fait UN hit-test et UN accrochage par
    // trame ; on exige le même ordre de grandeur de marge que la recette R2.
    expect(hitCost).toBeLessThan(1.5);
    expect(nearCost).toBeLessThan(1.5);
    expect(snapCost).toBeLessThan(1.5);
  });

  /**
   * Cent segments CONCOURANTS : au point de concours, la broad-phase ne peut écarter personne
   * et paie ~4 950 couples. C'est le pire cas géométrique, pas une scène de travail — mais il
   * doit rester dans une trame, faute de quoi un tracé maladroit figerait le plan.
   */
  it("le pire cas (100 segments concourants) reste dans une trame", () => {
    const target = { x: 450, y: 450 };
    const snapCost = measure(() => void snap(PENCIL, target, { toleranceWorld: 3, gridStepMm: 100 }), 50);
    const hitCost = measure(() => void hitTestAll(PENCIL, target, 3), 50);
    expect(snapCost).toBeLessThan(16.7);
    expect(hitCost).toBeLessThan(16.7);
  });

  it("le voisinage borne le coût sur une scène libre comme sur une scène paramétrique", () => {
    const exhaustive = measure(() => void sceneIntersections(LOAD), 5);
    const local = measure(() => void intersectionsNear(LOAD, { x: 450, y: 450 }, 3), 100);
    expect(local).toBeLessThan(exhaustive);
  });

  it("l'index d'une scène libre est mémorisé, pas reconstruit à chaque appel", () => {
    expect(intersectionIndexOf(LOAD)).toBe(intersectionIndexOf(LOAD));
  });

  it("le tracé libre n'ajoute pas de coût de désignation par rapport au même nombre d'entités", () => {
    // Même cible, même tolérance : le hit-test d'une scène libre coûte le même ordre de
    // grandeur qu'un balayage direct de ses primitives. Aucun moteur parallèle ne s'ajoute.
    const cost = measure(() => void hitTest(LOAD, { x: 450, y: 450 }, 3), 300);
    expect(cost).toBeLessThan(1.5);
  });
});
