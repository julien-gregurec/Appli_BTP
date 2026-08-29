import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  estRoleColors,
  ROLES_COLORS,
  ROLE_ADMIN_PLATEFORME,
} from "@elsatia/application-access";

vi.mock("server-only", () => ({}));

const racine = join(process.cwd(), "src");

function sources(repertoire: string): string[] {
  return readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(repertoire, entree.name);
    return entree.isDirectory() ? sources(chemin) : [chemin];
  });
}

const sourcesApplicatives = () => sources(racine).filter((fichier) => !fichier.endsWith(".test.ts"));

describe("contrat canonique ELSATIA", () => {
  afterEach(() => {
    delete process.env.ELSATIA_APPLICATION_ENV;
  });

  it("reconnaît exactement les quatre rôles Colors canoniques", () => {
    expect(ROLES_COLORS).toEqual([
      "colors_admin_organisation",
      "colors_gestionnaire_stock",
      "colors_utilisateur_depot",
      "colors_consultation",
    ]);
    expect(ROLES_COLORS.every(estRoleColors)).toBe(true);
    expect(estRoleColors("gestion_pro_admin")).toBe(false);
    expect(ROLE_ADMIN_PLATEFORME).toBe("administrateur_plateforme_global");
  });

  it("ne maintient plus les migrations centrales concurrentes", () => {
    const migrations = join(process.cwd(), "../../supabase/migrations");
    for (const nom of [
      "20260824000184_socle_multi_applications.sql",
      "20260825000185_contexte_application_courant.sql",
      "20260825000186_compte_commun_colors_v1.sql",
    ]) expect(existsSync(join(migrations, nom))).toBe(false);
  });

  it("n’utilise aucun ancien bypass admin ou membre dans le code Colors", () => {
    const contenu = sourcesApplicatives().map((fichier) => readFileSync(fichier, "utf8")).join("\n");
    expect(contenu).not.toContain("est_administrateur_plateforme_global");
    expect(contenu).not.toContain("est_membre_organisation_elsatia");
    expect(contenu).not.toMatch(/julien@elsatia\.fr/i);
  });

  it("ne tente aucune écriture directe dans les tables d’entitlement", () => {
    const contenu = sourcesApplicatives().map((fichier) => readFileSync(fichier, "utf8")).join("\n");
    expect(contenu).not.toMatch(/from\(["'](?:applications_elsatia|roles_applications_elsatia|acces_applications_entreprises|habilitations_applications_utilisateurs|historique_acces_applications)["']\)\s*\.(?:insert|update|delete)/);
  });

  it("utilise exclusivement les URLs du catalogue selon l’environnement", async () => {
    const { urlApplication } = await import("@/lib/routes-applications");
    const application = {
      applicationCode: "future_app",
      nom: "Future",
      roleCode: "future_role",
      urlLocale: "http://localhost:3090",
      urlPreview: "https://future-preview.example",
      urlProduction: "https://future.example",
      icone: null,
      estAdminPlateforme: false,
    };
    expect(urlApplication(application, "local")).toBe(application.urlLocale);
    expect(urlApplication(application, "preview")).toBe(application.urlPreview);
    expect(urlApplication(application, "production")).toBe(application.urlProduction);
  });
});
