import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import manifest from "@/app/manifest";
import { NAVIGATION_COLORS } from "@/lib/navigation";

function fichiersSource(repertoire: string): string[] {
  return readdirSync(repertoire).flatMap((nom) => {
    const chemin = join(repertoire, nom);
    return statSync(chemin).isDirectory() ? fichiersSource(chemin) : [chemin];
  });
}

describe("shell autonome ELSATIA Colors", () => {
  it("prépare toutes les sections annoncées", () => {
    expect(NAVIGATION_COLORS.map((item) => item.label)).toEqual([
      "Tableau de bord",
      "Inventaire",
      "Ajout par photo",
      "Dépôts et emplacements",
      "Mouvements",
      "Nuanciers",
      "Catalogues produits",
      "Imports",
      "Utilisateurs et habilitations",
      "Paramètres",
    ]);
  });

  it("possède un manifeste PWA Colors indépendant", () => {
    const resultat = manifest();
    expect(resultat.name).toBe("ELSATIA Colors");
    expect(resultat.short_name).toBe("Colors");
    expect(resultat.start_url).toBe("/dashboard");
    expect(resultat.theme_color).toBe("#44264d");
    expect(resultat.icons?.every((icone) => icone.src.includes("colors"))).toBe(true);

    const serviceWorker = readFileSync(join(process.cwd(), "public/sw-colors.js"), "utf8");
    expect(serviceWorker).toContain("elsatia-colors-");
    expect(serviceWorker).not.toMatch(/cache\.put|\/api\//);
  });

  it("résout le contexte commun sans dépendre de l’abonnement Gestion Pro", () => {
    const contexte = readFileSync(join(process.cwd(), "src/lib/contexte.ts"), "utf8");
    expect(contexte).toContain('rpc("contexte_application_courant")');
    expect(contexte).not.toMatch(/contexte_abonnement_courant|abonnement_statut/);
  });

  it("rend le sélecteur identifiable et conserve les décisions côté serveur", () => {
    const selecteur = readFileSync(join(process.cwd(), "src/components/ApplicationSwitcher.tsx"), "utf8");
    const menu = readFileSync(join(process.cwd(), "src/components/ApplicationSwitcherMenu.tsx"), "utf8");
    const acces = readFileSync(join(process.cwd(), "src/lib/acces-colors.ts"), "utf8");
    expect(menu).toContain('aria-label="Applications ELSATIA"');
    expect(menu).toContain("aria-expanded={ouvert}");
    expect(acces).toContain("verifierAccesApplication");
    expect(acces).toContain("exigerAccesApplication");
    expect(selecteur).not.toMatch(/julien@elsatia\.fr/);
    expect(menu).not.toMatch(/julien@elsatia\.fr/);
  });

  it("ne transmet jamais une erreur Supabase brute au login", () => {
    const actions = readFileSync(join(process.cwd(), "src/app/actions.ts"), "utf8");
    expect(actions).toContain("Identifiants incorrects.");
    expect(actions).toContain("Votre compte ELSATIA ne dispose pas d’un accès actif à Colors.");
    expect(actions).toContain('rpc("contexte_application_courant")');
    expect(actions).toContain('rpc("a_acces_application"');
    expect(actions).not.toMatch(/error\.message/);
  });

  it("résout et affiche un rôle Colors canonique", () => {
    const acces = readFileSync(join(process.cwd(), "src/lib/acces-colors.ts"), "utf8");
    const shell = readFileSync(join(process.cwd(), "src/components/Shell.tsx"), "utf8");
    expect(acces).toContain("resoudreRoleColors");
    expect(acces).toContain("estRoleColors");
    expect(shell).toContain("colors_admin_organisation");
    expect(shell).toContain("colors_gestionnaire_stock");
    expect(shell).toContain("colors_utilisateur_depot");
    expect(shell).toContain("colors_consultation");
  });

  it("ferme le sélecteur avec Échap et rend le focus au déclencheur", () => {
    const menu = readFileSync(join(process.cwd(), "src/components/ApplicationSwitcherMenu.tsx"), "utf8");
    expect(menu).toContain('event.key === "Escape"');
    expect(menu).toContain("declencheur.current?.focus()");
    expect(menu).toContain('aria-label="Applications accessibles"');
  });

  it("piège le focus dans le tiroir mobile et le rend au déclencheur", () => {
    const navigation = readFileSync(join(process.cwd(), "src/components/Navigation.tsx"), "utf8");
    expect(navigation).toContain('event.key === "Escape"');
    expect(navigation).toContain('event.key !== "Tab"');
    expect(navigation).toContain("declencheur.current?.focus()");
    expect(navigation).toContain('role="dialog"');
    expect(navigation).toContain('aria-modal="true"');
    expect(navigation).toContain("{ouvert && <aside");
  });

  it("rend la fermeture du seau et le motif d’ajustement explicites", () => {
    const fiche = readFileSync(join(process.cwd(), "src/app/(colors)/inventaire/[id]/page.tsx"), "utf8");
    expect(fiche).toContain('value="ferme"');
    expect(fiche).toContain("Marquer fermé");
    expect(fiche).toContain('<input name="motif" required/>');
  });

  it("affiche et suit explicitement la dette de nettoyage photo", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/photos/route.ts"), "utf8");
    const composant = readFileSync(join(process.cwd(), "src/components/PhotoUploader.tsx"), "utf8");
    expect(route).toContain('rpc("colors_signaler_nettoyage_photo"');
    expect(route).toContain('rpc("colors_resoudre_nettoyage_photo"');
    expect(route).toContain("validerSignaturePhotoColors");
    expect(route).toContain("createAdminStorageClient");
    expect(composant).toContain("resultat.nettoyageRequis");
    expect(composant).toContain("sera nettoyée automatiquement");
  });

  it("ne dépend d’aucune permission ni route du stock Gestion Pro", () => {
    const racine = join(process.cwd(), "src");
    const contenu = fichiersSource(racine)
      .filter((fichier) => !fichier.endsWith("shell-colors.test.ts"))
      .map((fichier) => readFileSync(fichier, "utf8"))
      .join("\n");
    expect(contenu).not.toMatch(/acces_stock|gerer_stock|["'`]\/stock(?:[\/"'`?]|$)/);
  });
});
