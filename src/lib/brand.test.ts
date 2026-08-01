import { describe, expect, it } from "vitest";
import {
  BRAND,
  DESCRIPTION_APPLICATION,
  MARQUE,
  NOM_APPLICATION,
  NOM_COURT_PWA,
  creerConfigurationMarquePublique,
  creerConfigurationMarqueServeur,
} from "./brand";

describe("configuration de marque ELSATIA", () => {
  it("centralise les noms officiels sans dépendre d'une variable d'environnement", () => {
    expect(MARQUE).toBe("ELSATIA");
    expect(NOM_APPLICATION).toBe("ELSATIA Gestion Pro");
    expect(NOM_COURT_PWA).toBe("ELSATIA Gestion Pro");
    expect(DESCRIPTION_APPLICATION).toContain("ELSATIA Gestion Pro");
    expect(BRAND).toMatchObject({
      marque: "ELSATIA",
      nomApplication: "ELSATIA Gestion Pro",
      nomPdf: "ELSATIA Gestion Pro",
      nomAssistant: "ELSATIA Gestion Pro",
    });
  });

  it("normalise l'origine publique et refuse les protocoles non web", () => {
    expect(creerConfigurationMarquePublique({ NEXT_PUBLIC_APP_URL: "https://app.example.com/espace" }).urlPublique)
      .toBe("https://app.example.com");
    expect(creerConfigurationMarquePublique({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }).urlPublique)
      .toBeNull();
  });

  it("garde les coordonnées serveur hors de la configuration publique", () => {
    expect(BRAND).not.toHaveProperty("supportEmail");
    expect(BRAND).not.toHaveProperty("emailFromAddress");
    expect(creerConfigurationMarqueServeur({})).toEqual({
      supportEmail: null,
      emailFromName: "ELSATIA",
      emailFromAddress: null,
    });
    expect(creerConfigurationMarqueServeur({
      SUPPORT_EMAIL: " support@example.com ",
      EMAIL_FROM_NAME: " ELSATIA ",
      EMAIL_FROM_ADDRESS: " no-reply@example.com ",
    })).toEqual({
      supportEmail: "support@example.com",
      emailFromName: "ELSATIA",
      emailFromAddress: "no-reply@example.com",
    });
  });
});
