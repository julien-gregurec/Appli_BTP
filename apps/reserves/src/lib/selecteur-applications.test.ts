import { describe, expect, it } from "vitest";
import type { ApplicationElsatiaAutorisee } from "@elsatia/application-access";
import { construireLiensApplications } from "./selecteur-applications";

const app = (code: string, urls: Partial<ApplicationElsatiaAutorisee> = {}): ApplicationElsatiaAutorisee => ({
  applicationCode: code, nom: `ELSATIA ${code}`, roleCode: `${code}_role`, icone: null, estAdminPlateforme: false,
  urlLocale: `http://localhost:${code === "gestion_pro" ? 3000 : 3010}`,
  urlPreview: `https://${code}-git-main.vercel.app`,
  urlProduction: `https://${code === "gestion_pro" ? "app" : code}.elsatia.fr`,
  ...urls,
});

/* A-08 / A-09 (ELSATIA_SATELLITES_PREVIEW_READINESS_V2) : Réserves → GP selon l'environnement. */
describe("liens Réserves → autres applications ELSATIA", () => {
  const catalogue = [app("gestion_pro"), app("colors"), app("reserves")];

  it("exclut Réserves elle-même et suit l'environnement", () => {
    expect(construireLiensApplications(catalogue, "local")).toEqual([
      { code: "gestion_pro", nom: "ELSATIA gestion_pro", url: "http://localhost:3000" },
      { code: "colors", nom: "ELSATIA colors", url: "http://localhost:3010" },
    ]);
    expect(construireLiensApplications(catalogue, "preview").map((l) => l.url)).toEqual([
      "https://gestion_pro-git-main.vercel.app", "https://colors-git-main.vercel.app",
    ]);
    expect(construireLiensApplications(catalogue, "production").map((l) => l.url)).toEqual([
      "https://app.elsatia.fr", "https://colors.elsatia.fr",
    ]);
  });

  it("PREVIEW : une url_preview absente ou de Production n'est jamais proposée", () => {
    const liens = construireLiensApplications([app("gestion_pro", { urlPreview: null }), app("colors", { urlPreview: "https://colors.elsatia.fr" })], "preview");
    expect(liens).toEqual([]);
  });

  it("environnement inconnu : aucun lien", () => {
    expect(construireLiensApplications(catalogue, null)).toEqual([]);
  });
});
