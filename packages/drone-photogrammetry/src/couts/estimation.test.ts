import { describe, expect, it } from "vitest";

import {
  convertirEnCredits,
  ErreurTarifManquant,
  estimerCout,
  TARIFS_NON_RELEVES,
  TarificationPrematureeError,
  verifierTarifs,
  type TarifsInfrastructure,
} from "./estimation";

/** Tarifs **fictifs**, fournis par le test : le prototype n'en code aucun en dur. */
const TARIFS_FICTIFS: TarifsInfrastructure = {
  fournisseur: "fournisseur-test",
  region: "UE",
  releveLe: "2026-09-07",
  source: "valeurs de test, sans valeur commerciale",
  gpuCentimesParHeure: 100,
  stockageCentimesParGoMois: 2,
  egressCentimesParGo: 1,
};

describe("estimation de coût", () => {
  it("refuse de calculer sans tarifs relevés", () => {
    expect(verifierTarifs(TARIFS_NON_RELEVES)).toContain("gpuCentimesParHeure");
    expect(() =>
      estimerCout({ runtimeS: 3600, stockageGo: 1, retentionMois: 1, egressGo: 1 }, TARIFS_NON_RELEVES),
    ).toThrowError(ErreurTarifManquant);
  });

  it("applique la formule runtime + stockage + bande passante", () => {
    const estimation = estimerCout(
      { runtimeS: 5400, stockageGo: 10, retentionMois: 12, egressGo: 4 },
      TARIFS_FICTIFS,
    );

    expect(estimation.gpuCentimes).toBeCloseTo(150, 6);
    expect(estimation.stockageCentimes).toBeCloseTo(240, 6);
    expect(estimation.egressCentimes).toBeCloseTo(4, 6);
    expect(estimation.totalCentimes).toBeCloseTo(394, 6);
    expect(estimation.detail.join(" ")).toContain("2026-09-07");
  });
});

describe("conversion en crédits", () => {
  const estimation = estimerCout(
    { runtimeS: 3600, stockageGo: 1, retentionMois: 1, egressGo: 1 },
    TARIFS_FICTIFS,
  );

  it("refuse tant que les benchmarks ne sont pas réels", () => {
    expect(() =>
      convertirEnCredits(estimation, { mesuresReelles: false, echantillons: 3, centimesParCredit: 10 }),
    ).toThrowError(TarificationPrematureeError);
  });

  it("refuse avec moins de trois jeux mesurés", () => {
    expect(() =>
      convertirEnCredits(estimation, { mesuresReelles: true, echantillons: 1, centimesParCredit: 10 }),
    ).toThrowError(TarificationPrematureeError);
  });

  it("refuse sans valeur de crédit définie", () => {
    expect(() =>
      convertirEnCredits(estimation, {
        mesuresReelles: true,
        echantillons: 3,
        centimesParCredit: null,
      }),
    ).toThrowError(TarificationPrematureeError);
  });

  it("convertit une fois les trois conditions réunies", () => {
    expect(
      convertirEnCredits(estimation, {
        mesuresReelles: true,
        echantillons: 3,
        centimesParCredit: 10,
      }),
    ).toBeCloseTo(estimation.totalCentimes / 10, 6);
  });
});
