import { describe, expect, it } from "vitest";

import {
  applyDegradedSource,
  combineOrigins,
  describeOrigin,
  isRealWorldTrusted,
  originWarning,
  resolveMeasurementTrust,
} from "./provenance";

describe("provenance", () => {
  it("place le contrôle terrain au-dessus de la géométrie exacte", () => {
    expect(combineOrigins("field_controlled", "exact")).toBe("exact");
    expect(isRealWorldTrusted("field_controlled")).toBe(true);
    expect(describeOrigin("field_controlled")).toContain("terrain");
  });

  it("combine par le maillon le plus faible", () => {
    expect(combineOrigins("manual", "approximated")).toBe("approximated");
    expect(combineOrigins("exact", "calibrated", "manual")).toBe("calibrated");
    expect(combineOrigins()).toBe("approximated");
  });

  it("ne laisse pas un clic humain rattraper une chaîne non fiable", () => {
    // Le cas exact décrit au §4 du modèle de données : une surface tracée proprement sur un
    // pan issu d'une reconstruction importée reste une valeur importée.
    expect(combineOrigins("manual", "imported")).toBe("imported");
    expect(isRealWorldTrusted("imported")).toBe(false);
    expect(originWarning("imported")).not.toBe("");
  });

  it("plafonne toute chaîne dégradée, quelle que soit la qualité du geste", () => {
    expect(applyDegradedSource("field_controlled", true)).toBe("approximated");
    expect(applyDegradedSource("manual", false)).toBe("manual");
  });

  it("résout la confiance d'une grandeur dérivée en un seul point", () => {
    const fiable = resolveMeasurementTrust({
      origins: ["exact", "calibrated"],
      degraded_source: false,
    });
    expect(fiable).toEqual({ origin: "calibrated", trusted: true, warning: "" });

    const degradee = resolveMeasurementTrust({ origins: ["manual"], degraded_source: true });
    expect(degradee.origin).toBe("approximated");
    expect(degradee.trusted).toBe(false);
    expect(degradee.warning).not.toBe("");
  });
});
