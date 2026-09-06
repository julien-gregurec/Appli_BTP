import { describe, expect, it } from "vitest";
import {
  EMPTY_PARAM_HISTORY,
  PARAM_HISTORY_LIMIT,
  canRedo,
  canUndo,
  overridesForProject,
  overridesOf,
  pushParamHistory,
  redoParamHistory,
  undoParamHistory,
  valuesOf,
  type ParamHistory,
} from "./param-history";

const entry = (label: string, source: string, before: Record<string, number>, after: Record<string, number>, coalesce = false) => ({
  label,
  source,
  coalesce,
  before,
  after,
});

describe("pile d'annulation", () => {
  it("part vide et sans rien à annuler ni refaire", () => {
    expect(canUndo(EMPTY_PARAM_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_PARAM_HISTORY)).toBe(false);
    expect(undoParamHistory(EMPTY_PARAM_HISTORY)).toBeNull();
    expect(redoParamHistory(EMPTY_PARAM_HISTORY)).toBeNull();
  });

  it("annule puis refait en restaurant les surcharges", () => {
    const history = pushParamHistory(EMPTY_PARAM_HISTORY, entry("Diamètre", "handle:P1", {}, { diameter: 2400 }));
    expect(canUndo(history)).toBe(true);

    const undone = undoParamHistory(history)!;
    expect(undone.overrides).toEqual({});
    expect(undone.label).toBe("Diamètre");
    expect(canUndo(undone.history)).toBe(false);
    expect(canRedo(undone.history)).toBe(true);

    const redone = redoParamHistory(undone.history)!;
    expect(redone.overrides).toEqual({ diameter: 2400 });
    expect(canRedo(redone.history)).toBe(false);
  });

  it("remonte plusieurs actions dans l'ordre inverse", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("Diamètre", "handle:P1", {}, { diameter: 2400 }));
    history = pushParamHistory(history, entry("Angle", "handle:P2", { diameter: 2400 }, { diameter: 2400, startAngle: 30 }));

    const first = undoParamHistory(history)!;
    expect(first.overrides).toEqual({ diameter: 2400 });
    const second = undoParamHistory(first.history)!;
    expect(second.overrides).toEqual({});
    expect(undoParamHistory(second.history)).toBeNull();
  });

  it("une nouvelle action invalide le futur", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("A", "handle:P1", {}, { diameter: 2400 }));
    const undone = undoParamHistory(history)!;
    expect(canRedo(undone.history)).toBe(true);

    const branched = pushParamHistory(undone.history, entry("B", "handle:P2", {}, { startAngle: 45 }));
    expect(canRedo(branched)).toBe(false);
    expect(branched.past).toHaveLength(1);
    expect(undoParamHistory(branched)!.overrides).toEqual({});
  });

  it("n'empile rien quand la modification ne change rien", () => {
    const history = pushParamHistory(EMPTY_PARAM_HISTORY, entry("Néant", "form:diameter", { diameter: 2400 }, { diameter: 2400 }));
    expect(history).toBe(EMPTY_PARAM_HISTORY);
  });
});

describe("fusion des saisies", () => {
  it("réunit les frappes consécutives d'un même champ en une seule annulation", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", {}, { diameter: 2 }, true));
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", { diameter: 2 }, { diameter: 20 }, true));
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", { diameter: 20 }, { diameter: 200 }, true));

    expect(history.past).toHaveLength(1);
    const undone = undoParamHistory(history)!;
    expect(undone.overrides).toEqual({});
  });

  it("ne fusionne pas deux champs différents", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", {}, { diameter: 2400 }, true));
    history = pushParamHistory(history, entry("Angle", "form:startAngle", { diameter: 2400 }, { diameter: 2400, startAngle: 15 }, true));
    expect(history.past).toHaveLength(2);
  });

  it("ne fusionne jamais deux glissements, même sur la même poignée", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("Sommet", "handle:P1", {}, { diameter: 2400 }));
    history = pushParamHistory(history, entry("Sommet", "handle:P1", { diameter: 2400 }, { diameter: 2600 }));
    expect(history.past).toHaveLength(2);
  });

  it("supprime l'entrée quand la saisie revient à son point de départ", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", { diameter: 2000 }, { diameter: 2400 }, true));
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", { diameter: 2400 }, { diameter: 2000 }, true));
    expect(history.past).toHaveLength(0);
    expect(canUndo(history)).toBe(false);
  });

  it("ne fusionne pas par-dessus un « refaire » disponible", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", {}, { diameter: 2400 }, true));
    history = pushParamHistory(history, entry("Diamètre", "form:diameter", { diameter: 2400 }, { diameter: 2500 }, true));
    const undone = undoParamHistory(history)!;
    const next = pushParamHistory(undone.history, entry("Diamètre", "form:diameter", {}, { diameter: 3000 }, true));
    expect(next.past).toHaveLength(1);
    expect(canRedo(next)).toBe(false);
  });

  it("borne la profondeur de la pile", () => {
    let history: ParamHistory = EMPTY_PARAM_HISTORY;
    for (let index = 0; index < PARAM_HISTORY_LIMIT + 25; index += 1) {
      history = pushParamHistory(history, entry(`#${index}`, `handle:${index}`, { diameter: index }, { diameter: index + 1 }));
    }
    expect(history.past).toHaveLength(PARAM_HISTORY_LIMIT);
    expect(history.past[history.past.length - 1].label).toBe(`#${PARAM_HISTORY_LIMIT + 24}`);
  });
});

describe("surcharges et valeurs effectives", () => {
  const defaults = { diameter: 2000, divisions: 6, startAngle: 0 };

  it("ne retient que les écarts aux défauts du modèle", () => {
    expect(overridesOf({ diameter: 2400, divisions: 6, startAngle: 0 }, defaults)).toEqual({ diameter: 2400 });
    expect(overridesOf(defaults, defaults)).toEqual({});
  });

  // Porté depuis `atelier.test.ts` avec la réconciliation WORKSHOP-UI-CANONICAL-V2 : le lot
  // Workshop portait un second calcul de surcharges (`modelParamOverrides`), supprimé au
  // profit de celui-ci. Son cas propre reste couvert, ici et une seule fois.
  it("retient une valeur dont le modèle ne publie pas de défaut", () => {
    expect(overridesOf({ diameter: 2400 }, {})).toEqual({ diameter: 2400 });
    expect(overridesForProject(overridesOf({ diameter: 2400 }, {}))).toEqual({ diameter: 2400 });
  });

  it("recompose les valeurs effectives", () => {
    expect(valuesOf(defaults, { diameter: 2400 })).toEqual({ diameter: 2400, divisions: 6, startAngle: 0 });
    expect(valuesOf(defaults, undefined)).toEqual(defaults);
  });

  it("rend `undefined` plutôt qu'un objet vide, comme l'attend le projet", () => {
    expect(overridesForProject({})).toBeUndefined();
    expect(overridesForProject({ diameter: 2400 })).toEqual({ diameter: 2400 });
  });

  it("fait l'aller-retour valeurs → surcharges → valeurs", () => {
    const values = { diameter: 2400, divisions: 8, startAngle: 0 };
    expect(valuesOf(defaults, overridesOf(values, defaults))).toEqual(values);
  });
});
