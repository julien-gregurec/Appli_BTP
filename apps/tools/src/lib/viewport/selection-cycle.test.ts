/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — cycle de sélection.
 *
 * Deux propriétés seulement, mais elles doivent tenir ensemble : re-cliquer au même endroit
 * DESCEND d'un cran, et tout ce qui change la question REFERME le cycle. Chaque condition de
 * réinitialisation a son test, parce qu'un cycle qui ne se referme pas est pire qu'un cycle
 * absent — il désigne alors une entité que l'utilisateur ne vise plus.
 */

import { describe, expect, it } from "vitest";
import {
  advanceSelectionCycle,
  SELECTION_CYCLE_SCALE_RATIO,
  type SelectionCycleRequest,
  type SelectionCycleState,
} from "./selection-cycle";

const BASE: SelectionCycleRequest = {
  world: { x: 100, y: 50 },
  scale: 1,
  sceneKey: "projet-1|modele-a",
  candidateIds: ["axe-h", "axe-v", "contour"],
  anchorToleranceWorld: 10,
};

/** Enchaîne `count` clics identiques et renvoie les entités successivement désignées. */
function clickRepeatedly(count: number, request: SelectionCycleRequest = BASE): string[] {
  let state: SelectionCycleState | null = null;
  const picked: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const step = advanceSelectionCycle(state, request);
    state = step.state;
    picked.push(step.entityId ?? "∅");
  }
  return picked;
}

describe("progression du cycle", () => {
  it("désigne le candidat prioritaire au premier clic", () => {
    const step = advanceSelectionCycle(null, BASE);
    expect(step.entityId).toBe("axe-h");
    expect(step.continued).toBe(false);
  });

  it("descend d'un cran à chaque clic répété au même endroit", () => {
    expect(clickRepeatedly(3)).toEqual(["axe-h", "axe-v", "contour"]);
  });

  it("BOUCLE : après le dernier candidat, on revient au premier", () => {
    expect(clickRepeatedly(7)).toEqual(["axe-h", "axe-v", "contour", "axe-h", "axe-v", "contour", "axe-h"]);
  });

  it("signale qu'un clic poursuit le cycle plutôt que d'en ouvrir un nouveau", () => {
    const first = advanceSelectionCycle(null, BASE);
    const second = advanceSelectionCycle(first.state, BASE);
    expect(first.continued).toBe(false);
    expect(second.continued).toBe(true);
  });

  it("ne cycle pas quand il n'y a qu'un seul candidat", () => {
    const single = { ...BASE, candidateIds: ["contour"] };
    expect(clickRepeatedly(3, single)).toEqual(["contour", "contour", "contour"]);
  });

  it("ne désigne rien et n'ouvre aucun cycle quand la liste est vide", () => {
    const step = advanceSelectionCycle(null, { ...BASE, candidateIds: [] });
    expect(step.entityId).toBeNull();
    expect(step.state).toBeNull();
  });

  it("referme le cycle quand un clic ne trouve plus rien, sans mémoire résiduelle", () => {
    const first = advanceSelectionCycle(null, BASE);
    const vide = advanceSelectionCycle(first.state, { ...BASE, candidateIds: [] });
    expect(vide.state).toBeNull();
    // Le clic suivant repart bien du candidat prioritaire, pas du rang mémorisé.
    expect(advanceSelectionCycle(vide.state, BASE).entityId).toBe("axe-h");
  });
});

describe("clic additif (advance: false)", () => {
  it("relit le rang COURANT sans le faire tourner", () => {
    const first = advanceSelectionCycle(null, BASE);
    expect(first.entityId).toBe("axe-h");
    const held = advanceSelectionCycle(first.state, { ...BASE, advance: false });
    expect(held.entityId).toBe("axe-h");
    expect(held.continued).toBe(true);
  });

  it("reste sur la même entité aussi longtemps qu'on le répète", () => {
    let state = advanceSelectionCycle(null, BASE).state;
    const picked: (string | null)[] = [];
    for (let index = 0; index < 4; index += 1) {
      const step = advanceSelectionCycle(state, { ...BASE, advance: false });
      state = step.state;
      picked.push(step.entityId);
    }
    expect(picked).toEqual(["axe-h", "axe-h", "axe-h", "axe-h"]);
  });

  it("n'empêche pas le cycle de reprendre ensuite au cran suivant", () => {
    let state = advanceSelectionCycle(null, BASE).state;
    state = advanceSelectionCycle(state, { ...BASE, advance: false }).state;
    expect(advanceSelectionCycle(state, BASE).entityId).toBe("axe-v");
  });

  it("désigne le candidat prioritaire quand aucun cycle n'est ouvert", () => {
    expect(advanceSelectionCycle(null, { ...BASE, advance: false }).entityId).toBe("axe-h");
  });
});

describe("réinitialisation du cycle", () => {
  /** Ouvre un cycle et le fait avancer d'un cran, pour que la reprise soit visible. */
  function openedCycle(): SelectionCycleState | null {
    return advanceSelectionCycle(null, BASE).state;
  }

  it("repart de zéro quand le point de clic bouge au-delà de la tolérance", () => {
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, world: { x: 140, y: 50 } });
    expect(step.entityId).toBe("axe-h");
    expect(step.continued).toBe(false);
  });

  it("poursuit le cycle malgré une légère dérive du pointeur", () => {
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, world: { x: 104, y: 53 } });
    expect(step.entityId).toBe("axe-v");
    expect(step.continued).toBe(true);
  });

  it("garde l'ancre du PREMIER clic : une dérive répétée finit par refermer le cycle", () => {
    // Cinq pas de 3 mm depuis l'ancre : chaque PAS reste très en dessous de la tolérance de
    // 10 mm, mais l'écart CUMULÉ à l'ancre la franchit au quatrième. Si l'ancre suivait le
    // pointeur, aucun de ces clics ne la franchirait jamais et le cycle se laisserait promener
    // indéfiniment loin de l'endroit où il a commencé.
    let state = openedCycle();
    let world = { ...BASE.world };
    const continued: boolean[] = [];
    for (let index = 0; index < 5; index += 1) {
      world = { x: world.x + 3, y: world.y };
      const step = advanceSelectionCycle(state, { ...BASE, world });
      state = step.state;
      continued.push(step.continued);
    }
    // +3, +6, +9 poursuivent ; +12 dépasse et referme ; le clic suivant repart d'une ancre neuve.
    expect(continued).toEqual([true, true, true, false, true]);
  });

  it("repart de zéro quand le zoom change notablement", () => {
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, scale: SELECTION_CYCLE_SCALE_RATIO * 1.5 });
    expect(step.continued).toBe(false);
    expect(step.entityId).toBe("axe-h");
  });

  it("tolère un micro-ajustement de zoom sous le seuil", () => {
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, scale: 1.05 });
    expect(step.continued).toBe(true);
    expect(step.entityId).toBe("axe-v");
  });

  it("traite le dézoom comme le zoom — le seuil porte sur un RAPPORT, pas sur un écart signé", () => {
    const dezoom = advanceSelectionCycle(openedCycle(), { ...BASE, scale: 1 / (SELECTION_CYCLE_SCALE_RATIO * 1.5) });
    expect(dezoom.continued).toBe(false);
  });

  it("repart de zéro quand la scène change", () => {
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, sceneKey: "projet-1|modele-b" });
    expect(step.continued).toBe(false);
    expect(step.entityId).toBe("axe-h");
  });

  it("repart de zéro quand la liste des candidats change", () => {
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, candidateIds: ["axe-h", "contour"] });
    expect(step.continued).toBe(false);
    expect(step.entityId).toBe("axe-h");
  });

  it("repart de zéro quand les candidats sont les mêmes mais dans un autre ORDRE", () => {
    // L'index mémorisé ne désignerait plus la même entité : reprendre serait pire que repartir.
    const step = advanceSelectionCycle(openedCycle(), { ...BASE, candidateIds: ["axe-v", "axe-h", "contour"] });
    expect(step.continued).toBe(false);
    expect(step.entityId).toBe("axe-v");
  });

  it("repart de zéro sur une échelle nulle ou non finie plutôt que de propager un NaN", () => {
    expect(advanceSelectionCycle(openedCycle(), { ...BASE, scale: 0 }).continued).toBe(false);
    expect(advanceSelectionCycle(openedCycle(), { ...BASE, scale: Number.NaN }).continued).toBe(false);
  });

  it("repart de zéro quand la tolérance d'ancre est nulle ou absurde", () => {
    expect(advanceSelectionCycle(openedCycle(), { ...BASE, anchorToleranceWorld: 0 }).continued).toBe(false);
    expect(advanceSelectionCycle(openedCycle(), { ...BASE, anchorToleranceWorld: Number.NaN }).continued).toBe(false);
  });
});
