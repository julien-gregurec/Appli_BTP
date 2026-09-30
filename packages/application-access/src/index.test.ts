import { describe, expect, it, vi } from "vitest";

import {
  AccesApplicationRefuseError,
  CODES_APPLICATIONS_ELSATIA,
  diagnostiquerRefusApplication,
  LIBELLES_STATUT_COMMERCIAL,
  STATUTS_COMMERCIAUX,
  STATUTS_COMMERCIAUX_OUVERTS,
  creerControleAccesApplications,
  estCodeApplicationElsatia,
  estRoleColors,
  ROLES_COLORS,
} from "./index";

describe("application-access", () => {
  it("expose les codes et rôles canoniques", () => {
    expect(CODES_APPLICATIONS_ELSATIA).toEqual(["gestion_pro", "colors", "tools", "reserves"]);
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

describe("diagnostiquerRefusApplication (per-app commercial suspension)", () => {
  const maintenant = Date.parse("2026-10-01T12:00:00Z");
  const ouvert = { autorise: true, valide_du: null, valide_jusqu_au: null };

  it("droit absent, retiré ou hors fenêtre : abonnement requis", () => {
    expect(diagnostiquerRefusApplication(null, maintenant)).toBe("abonnement_requis");
    expect(diagnostiquerRefusApplication({ ...ouvert, autorise: false }, maintenant)).toBe("abonnement_requis");
    expect(diagnostiquerRefusApplication({ ...ouvert, valide_jusqu_au: "2026-10-01T11:59:59Z" }, maintenant)).toBe("abonnement_requis");
    expect(diagnostiquerRefusApplication({ ...ouvert, valide_du: "2026-10-02T00:00:00Z" }, maintenant)).toBe("abonnement_requis");
  });

  it("statuts fermés : abonnement requis", () => {
    for (const statut of ["past_due", "unpaid", "cancelled", "suspended", "inconnu"]) {
      expect(diagnostiquerRefusApplication({ ...ouvert, statut_commercial: statut }, maintenant)).toBe("abonnement_requis");
    }
  });

  it("statuts ouverts : il manque l'habilitation personnelle", () => {
    for (const statut of ["entitled", "active"]) {
      expect(diagnostiquerRefusApplication({ ...ouvert, statut_commercial: statut }, maintenant)).toBe("habilitation_requise");
    }
    // Base antérieure à la migration : pas de colonne, droit accordé tel quel.
    expect(diagnostiquerRefusApplication(ouvert, maintenant)).toBe("habilitation_requise");
  });

  it("essai : ouvert jusqu'à sa fin exclue, fermé sans date", () => {
    expect(diagnostiquerRefusApplication({ ...ouvert, statut_commercial: "trial", essai_fin: "2026-10-01T12:00:01Z" }, maintenant)).toBe("habilitation_requise");
    expect(diagnostiquerRefusApplication({ ...ouvert, statut_commercial: "trial", essai_fin: "2026-10-01T12:00:00Z" }, maintenant)).toBe("abonnement_requis");
    expect(diagnostiquerRefusApplication({ ...ouvert, statut_commercial: "trial", essai_fin: null }, maintenant)).toBe("abonnement_requis");
  });

  it("les statuts ouverts sont exactement ceux de la base", () => {
    expect([...STATUTS_COMMERCIAUX_OUVERTS]).toEqual(["entitled", "trial", "active"]);
    expect(STATUTS_COMMERCIAUX).toHaveLength(7);
    expect(Object.keys(LIBELLES_STATUT_COMMERCIAL).sort()).toEqual([...STATUTS_COMMERCIAUX].sort());
  });
});
