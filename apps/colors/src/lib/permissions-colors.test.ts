import { describe, expect, it } from "vitest";
import { MATRICE_PERMISSIONS_COLORS, peutEffectuerColors } from "@/lib/permissions-colors";

describe("matrice des permissions Colors", () => {
  it("donne l’administration complète au rôle admin", () => expect(MATRICE_PERMISSIONS_COLORS.colors_admin_organisation).toHaveLength(13));
  it("réserve les paramètres à l’admin", () => {
    expect(peutEffectuerColors("colors_admin_organisation", "gerer_parametres")).toBe(true);
    expect(peutEffectuerColors("colors_gestionnaire_stock", "gerer_parametres")).toBe(false);
  });
  it("autorise les mouvements au dépôt sans l’archivage", () => {
    expect(peutEffectuerColors("colors_utilisateur_depot", "ajuster_quantite")).toBe(true);
    expect(peutEffectuerColors("colors_utilisateur_depot", "archiver")).toBe(false);
  });
  it("maintient la consultation en lecture/export", () => {
    expect(peutEffectuerColors("colors_consultation", "voir_stock")).toBe(true);
    expect(peutEffectuerColors("colors_consultation", "exporter")).toBe(true);
    expect(peutEffectuerColors("colors_consultation", "ajouter_seau")).toBe(false);
  });
});
