import { afterEach, describe, expect, it } from "vitest";
import { formatDateVersion, informationsVersion } from "./version";

const anciennesValeurs = {
  version: process.env.ELSATIA_APP_VERSION,
  commit: process.env.ELSATIA_BUILD_COMMIT,
  dateBuild: process.env.ELSATIA_BUILD_DATE,
  environnement: process.env.ELSATIA_BUILD_ENVIRONMENT,
  dateDeploiement: process.env.ELSATIA_DEPLOYMENT_DATE,
  url: process.env.ELSATIA_DEPLOYMENT_URL,
};

afterEach(() => {
  process.env.ELSATIA_APP_VERSION = anciennesValeurs.version;
  process.env.ELSATIA_BUILD_COMMIT = anciennesValeurs.commit;
  process.env.ELSATIA_BUILD_DATE = anciennesValeurs.dateBuild;
  process.env.ELSATIA_BUILD_ENVIRONMENT = anciennesValeurs.environnement;
  process.env.ELSATIA_DEPLOYMENT_DATE = anciennesValeurs.dateDeploiement;
  process.env.ELSATIA_DEPLOYMENT_URL = anciennesValeurs.url;
});

describe("informationsVersion", () => {
  it("retourne les informations injectées au build sans secret", () => {
    process.env.ELSATIA_APP_VERSION = "1.2.3";
    process.env.ELSATIA_BUILD_COMMIT = "abc123";
    process.env.ELSATIA_BUILD_DATE = "2026-07-28T08:00:00.000Z";
    process.env.ELSATIA_BUILD_ENVIRONMENT = "production";
    process.env.ELSATIA_DEPLOYMENT_DATE = "2026-07-28T08:01:00.000Z";
    process.env.ELSATIA_DEPLOYMENT_URL = "app.example.test";

    expect(informationsVersion()).toEqual({
      version: "1.2.3",
      commit: "abc123",
      dateBuild: "2026-07-28T08:00:00.000Z",
      environnement: "production",
      dateDeploiement: "2026-07-28T08:01:00.000Z",
      urlDeploiement: "app.example.test",
    });
  });

  it("conserve une valeur non datée au lieu de lever une erreur", () => {
    expect(formatDateVersion("indisponible")).toBe("indisponible");
  });
});
