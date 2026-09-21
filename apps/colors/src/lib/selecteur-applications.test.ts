import { describe, expect, it } from "vitest";
import { construireSelecteurApplications } from "@/lib/selecteur-applications";
import type { ApplicationElsatiaAutorisee } from "@elsatia/application-access";

const application = (code: string, nom: string, roleCode: string, estAdminPlateforme = false) => ({
  applicationCode: code,
  nom,
  roleCode,
  urlLocale: `http://localhost/${code}`,
  urlPreview: null,
  urlProduction: null,
  icone: code,
  estAdminPlateforme,
});

const url = (item: ApplicationElsatiaAutorisee) => item.urlLocale;

describe("sélecteur d’applications", () => {
  it("n’affiche que Colors pour un utilisateur Colors uniquement", () => {
    const resultat = construireSelecteurApplications([
      application("colors", "ELSATIA Colors", "colors_consultation"),
    ], url, "colors");
    expect(resultat.map((item) => item.code)).toEqual(["colors"]);
  });

  it("affiche les deux applications pour un utilisateur doublement autorisé", () => {
    const resultat = construireSelecteurApplications([
      application("gestion_pro", "ELSATIA Gestion Pro", "gestion_pro_utilisateur"),
      application("colors", "ELSATIA Colors", "colors_consultation"),
    ], url, "colors");
    expect(resultat.map((item) => item.code)).toEqual(["gestion_pro", "colors"]);
    expect(resultat.find((item) => item.code === "colors")?.active).toBe(true);
  });

  it("accepte une future application renvoyée dynamiquement par le catalogue", () => {
    const resultat = construireSelecteurApplications([
      application("future_app", "ELSATIA Future", "administrateur_plateforme_global", true),
    ], () => null, "colors");
    expect(resultat).toEqual([expect.objectContaining({ code: "future_app", url: null, estAdminPlateforme: true })]);
  });
});
