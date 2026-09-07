import { describe, expect, it } from "vitest";

import * as noyau from "./index";
import {
  aUneIncertitudeEtablie,
  describeUncertainty,
  estIncertitudeCoherente,
  QUALITE_INDICATIVE_SANS_INCERTITUDE,
  QUALITY_EVIDENCE_INCONNUE,
} from "./quality";

describe("qualité et incertitude", () => {
  it("part d'une incertitude inconnue plutôt que d'un chiffre plausible", () => {
    expect(QUALITE_INDICATIVE_SANS_INCERTITUDE.uncertainty_value).toBeNull();
    expect(aUneIncertitudeEtablie(QUALITE_INDICATIVE_SANS_INCERTITUDE)).toBe(false);
    expect(describeUncertainty(QUALITE_INDICATIVE_SANS_INCERTITUDE)).toBe("Incertitude inconnue");
  });

  it("affiche une incertitude seulement lorsqu'elle a été établie", () => {
    const mesuree = {
      ...QUALITE_INDICATIVE_SANS_INCERTITUDE,
      level: "high_precision" as const,
      uncertainty_value: 0.02,
      uncertainty_unit: "m" as const,
    };
    expect(describeUncertainty(mesuree)).toBe("± 0.02 m");
  });

  it("refuse une demi-incertitude", () => {
    expect(estIncertitudeCoherente(QUALITE_INDICATIVE_SANS_INCERTITUDE)).toBe(true);
    expect(
      estIncertitudeCoherente({
        ...QUALITE_INDICATIVE_SANS_INCERTITUDE,
        uncertainty_value: 0.05,
      }),
    ).toBe(false);
  });

  it("laisse toutes les métriques de qualité nulles tant qu'elles ne sont pas mesurées", () => {
    expect(Object.values(QUALITY_EVIDENCE_INCONNUE).every((valeur) => valeur === null)).toBe(true);
  });

  it("n'expose aucune dérivation automatique d'un niveau de qualité", () => {
    // §24 et §107 : les seuils sont la sortie d'une campagne métrologique qui n'a pas eu lieu.
    // Toute fonction qui les devinerait serait un seuil inventé déguisé en code.
    const noms = Object.keys(noyau).filter(
      (nom) => /derive.*quality|quality.*from|computeQuality/i.test(nom),
    );
    expect(noms).toEqual([]);
  });
});
