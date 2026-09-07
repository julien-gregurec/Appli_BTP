import { describe, expect, it } from "vitest";

import { estReferenceExterneNonLiee } from "../common";
import { describeMeasurementTrust, uniteCoherenteAvecGrandeur } from "../measurement";
import { longueurCumuleeAretes, modeleEntierementValide, surfaceTotalePans } from "../roof";
import { facade, FIXTURES, maisonComplexe, toitureSimple } from "./index";

describe("jeux d'essai", () => {
  it("sont intégralement standalone : aucune liaison inter-applications (§43)", () => {
    for (const fixture of FIXTURES) {
      expect(estReferenceExterneNonLiee(fixture.project.external_reference)).toBe(true);
      for (const constat of fixture.findings) {
        expect(estReferenceExterneNonLiee(constat.external_reference)).toBe(true);
      }
    }
  });

  it("ne portent aucune donnée nominative", () => {
    for (const fixture of FIXTURES) {
      expect(fixture.project.client_name).toBeNull();
      expect(fixture.project.address).toBeNull();
    }
  });

  it("n'affichent aucune incertitude inventée", () => {
    for (const fixture of FIXTURES) {
      for (const mesure of fixture.measurements) {
        expect(mesure.quality.uncertainty_value).toBeNull();
        expect(mesure.quality.uncertainty_unit).toBeNull();
      }
    }
  });

  it("respectent l'unité imposée par la grandeur", () => {
    for (const fixture of FIXTURES) {
      for (const mesure of fixture.measurements) {
        expect(uniteCoherenteAvecGrandeur(mesure)).toBe(true);
      }
    }
  });

  it("toiture simple : géométrie entièrement validée et métré fiable", () => {
    expect(toitureSimple.roof).not.toBeNull();
    expect(modeleEntierementValide(toitureSimple.roof!)).toBe(true);
    expect(surfaceTotalePans(toitureSimple.roof!.planes)).toBeCloseTo(97.2, 6);
    expect(longueurCumuleeAretes(toitureSimple.roof!.edges, "ridge")).toBeCloseTo(8.1, 6);
    expect(describeMeasurementTrust(toitureSimple.measurements[0]).trusted).toBe(true);
  });

  it("maison complexe : validation partielle, donc métré non fiable", () => {
    expect(modeleEntierementValide(maisonComplexe.roof!)).toBe(false);
    const presentation = describeMeasurementTrust(maisonComplexe.measurements[0]);
    expect(presentation.trusted).toBe(false);
    expect(presentation.warning).not.toBe("");
    expect(presentation.nature_label).toBe("CALCULÉ");
  });

  it("façade : la dégradation vidéo se propage jusqu'à la mesure (§77)", () => {
    expect(facade.media[0].degraded_source).toBe(true);
    expect(facade.roof).toBeNull();
    const presentation = describeMeasurementTrust(facade.measurements[0]);
    expect(presentation.trusted).toBe(false);
    expect(presentation.nature_label).toBe("MESURÉ");
  });
});
