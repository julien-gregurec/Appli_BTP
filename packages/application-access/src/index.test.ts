import { describe, expect, it, vi } from "vitest";

import {
  AccesApplicationRefuseError,
  CODES_APPLICATIONS_ELSATIA,
  creerControleAccesApplications,
  estCodeApplicationElsatia,
  estRoleColors,
  ROLES_COLORS,
} from "./index";

describe("application-access", () => {
  it("expose les codes et rôles canoniques", () => {
    expect(CODES_APPLICATIONS_ELSATIA).toEqual(["gestion_pro", "colors"]);
    expect(ROLES_COLORS).toContain("colors_admin_organisation");
    expect(estCodeApplicationElsatia("future_app")).toBe(true);
    expect(estCodeApplicationElsatia("Future App")).toBe(false);
    expect(estRoleColors("gestion_pro_admin")).toBe(false);
  });

  it("vérifie exclusivement l’accès de la session via la RPC canonique", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const controle = creerControleAccesApplications(async () => ({ rpc }));

    await expect(
      controle.verifierAccesApplication(
        { entrepriseId: "entreprise-a" },
        "colors",
      ),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("a_acces_application", {
      p_entreprise_id: "entreprise-a",
      p_application_code: "colors",
    });
  });

  it("refuse l’accès sans tenter d’accorder une habilitation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const controle = creerControleAccesApplications(async () => ({ rpc }));

    await expect(
      controle.exigerAccesApplication({ entrepriseId: null }, "colors"),
    ).rejects.toBeInstanceOf(AccesApplicationRefuseError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("normalise les lignes du sélecteur et ignore les réponses invalides", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          application_code: "colors",
          nom: "ELSATIA Colors",
          role_code: "colors_consultation",
          url_locale: "http://localhost:3010",
          url_preview: null,
          url_production: "https://colors.elsatia.fr",
          icone: "colors",
          est_admin_plateforme: false,
        },
        { application_code: "INVALIDE", nom: "Invalide", role_code: "x" },
      ],
      error: null,
    });
    const controle = creerControleAccesApplications(async () => ({ rpc }));

    await expect(
      controle.listerApplicationsAutorisees({ entrepriseId: "entreprise-a" }),
    ).resolves.toEqual([
      {
        applicationCode: "colors",
        nom: "ELSATIA Colors",
        roleCode: "colors_consultation",
        urlLocale: "http://localhost:3010",
        urlPreview: null,
        urlProduction: "https://colors.elsatia.fr",
        icone: "colors",
        estAdminPlateforme: false,
      },
    ]);
  });

  it("ne propage pas les messages techniques de la base", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "sensitive database detail" },
    });
    const controle = creerControleAccesApplications(async () => ({ rpc }));

    await expect(
      controle.verifierAccesApplication({ entrepriseId: null }, "colors"),
    ).rejects.toThrow("Vérification d’accès indisponible");
    await expect(
      controle.verifierAccesApplication({ entrepriseId: null }, "colors"),
    ).rejects.not.toThrow("sensitive database detail");
  });
});
