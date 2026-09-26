import { describe, expect, it } from "vitest";
import { FEATURE_CATALOGUE, featureForPath } from "./feature-catalogue";

describe("catalogue des fonctionnalités V3", () => {
  it("conserve les parcours cœur actifs", () => {
    expect(FEATURE_CATALOGUE.clients.visibleByDefault).toBe(true);
    expect(FEATURE_CATALOGUE.quotes.visibleByDefault).toBe(true);
    expect(FEATURE_CATALOGUE.jobs.visibleByDefault).toBe(true);
    expect(FEATURE_CATALOGUE.time_tracking.visibleByDefault).toBe(true);
    expect(FEATURE_CATALOGUE.invoices.visibleByDefault).toBe(true);
  });

  it("masque les fonctions postérieures à la commercialisation V3", () => {
    expect(FEATURE_CATALOGUE.tenders.status).toBe("disabled");
    expect(FEATURE_CATALOGUE.banking.status).toBe("disabled");
    expect(FEATURE_CATALOGUE.connectors.status).toBe("disabled");
    expect(FEATURE_CATALOGUE.payroll.visibleByDefault).toBe(false);
    expect(FEATURE_CATALOGUE.interventions.visibleByDefault).toBe(false);
  });

  it("masque les sous-traitants par défaut (section embarquée sur la fiche chantier incluse)", () => {
    // La section « Sous-traitants du chantier » de /chantiers/[id] doit suivre
    // ce même indicateur, pas seulement le droit de rôle acces_sous_traitants.
    expect(FEATURE_CATALOGUE.subcontractors.status).toBe("beta");
    expect(FEATURE_CATALOGUE.subcontractors.visibleByDefault).toBe(false);
  });

  it("associe les routes sensibles à leur fonctionnalité", () => {
    expect(featureForPath("/clients/nouveau")).toBe("clients");
    expect(featureForPath("/facturation-avancee/situations")).toBe("advanced_invoicing");
    expect(featureForPath("/paiements-bancaires")).toBe("banking");
    expect(featureForPath("/connecteurs")).toBe("connectors");
    expect(featureForPath("/route-inconnue")).toBeNull();
  });
});
