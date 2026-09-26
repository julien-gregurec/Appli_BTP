import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

/**
 * Invariants d'écriture d'ELSATIA Colors.
 *
 * Ces règles ne sont pas des préférences de style : elles reproduisent, du côté
 * du code, ce que la base impose déjà par les droits. Relevé sur le schéma du
 * train V3 (conteneur d'audit, lecture seule) :
 *
 *   colors_emplacements   SELECT, INSERT, UPDATE   authenticated
 *   colors_seaux          SELECT, INSERT           authenticated
 *   colors_mouvements     SELECT                   authenticated
 *   colors_parametres     SELECT                   authenticated
 *   colors_analyses_ocr   SELECT                   authenticated
 *   colors_nettoyages_photos   aucun droit, RLS active sans aucune politique
 *
 * Autrement dit : aucune mise à jour de seau, aucune écriture de paramètre,
 * aucune écriture d'analyse OCR n'est possible depuis le rôle applicatif. Tout
 * passe par des fonctions `security definer` qui vérifient l'habilitation.
 * `colors_valider_seau` refuse d'ailleurs explicitement toute mutation dont
 * l'appelant n'est pas `postgres`.
 *
 * Une écriture directe écrite ici échouerait donc en production, pas en revue.
 * Ces tests la font échouer en revue.
 */

const racine = join(process.cwd(), "src");

function sources(repertoire: string): string[] {
  return readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(repertoire, entree.name);
    return entree.isDirectory() ? sources(chemin) : [chemin];
  });
}

const APPLICATIVES = sources(racine).filter((fichier) => /\.tsx?$/.test(fichier) && !fichier.endsWith(".test.ts"));
const CONTENU = APPLICATIVES.map((fichier) => `${fichier}\n${readFileSync(fichier, "utf8")}`).join("\n");

/** Tables Colors sur lesquelles le rôle applicatif peut insérer. */
const INSERTION_AUTORISEE = ["colors_emplacements", "colors_seaux"];

const TABLES_COLORS = [
  "colors_emplacements",
  "colors_seaux",
  "colors_mouvements",
  "colors_parametres",
  "colors_analyses_ocr",
  "colors_nettoyages_photos",
];

describe("écritures directes en base", () => {
  it("aucune mise à jour, suppression ou upsert direct sur une table Colors", () => {
    for (const table of TABLES_COLORS) {
      const ecriture = new RegExp(`from\\(["']${table}["']\\)\\s*\\.\\s*(?:update|delete|upsert)`, "g");
      expect(CONTENU, `écriture directe sur ${table}`).not.toMatch(ecriture);
    }
  });

  it("n'insère que dans les deux tables où le rôle applicatif en a le droit", () => {
    for (const table of TABLES_COLORS.filter((nom) => !INSERTION_AUTORISEE.includes(nom))) {
      const insertion = new RegExp(`from\\(["']${table}["']\\)\\s*\\.\\s*insert`, "g");
      expect(CONTENU, `insertion directe sur ${table}`).not.toMatch(insertion);
    }
  });

  it("ne lit jamais colors_nettoyages_photos en direct : aucune politique ne l'autorise", () => {
    expect(CONTENU).not.toMatch(/from\(["']colors_nettoyages_photos["']\)/);
    expect(CONTENU).toContain("colors_nettoyages_photos_seau");
  });
});

describe("clé de service", () => {
  it("n'est lue que par le client de stockage administrateur", () => {
    const lecteurs = APPLICATIVES.filter((fichier) => readFileSync(fichier, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(lecteurs.map((chemin) => chemin.replace(racine, ""))).toEqual(["/lib/supabase/admin-storage.ts"]);
  });

  it("n'est jamais portée par une variable publique", () => {
    expect(CONTENU).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
    expect(CONTENU).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SECRET/);
  });

  it("le client administrateur ne sert qu'au stockage, jamais à contourner la RLS métier", () => {
    const admin = readFileSync(join(racine, "lib/supabase/admin-storage.ts"), "utf8");
    expect(admin).not.toMatch(/\.from\(["']colors_/);
    const appelants = APPLICATIVES.filter((f) => readFileSync(f, "utf8").includes("createAdminStorageClient"));
    expect(appelants.map((c) => c.replace(racine, "")).sort()).toEqual([
      "/app/api/photos/route.ts",
      "/lib/supabase/admin-storage.ts",
    ]);
  });
});

describe("cloisonnement par organisation", () => {
  it("l'identifiant d'organisation ne vient jamais de la requête", () => {
    // Il vient de `contexte.entrepriseId`, issu de la RPC canonique. Le lire
    // dans l'URL ou dans un formulaire rendrait le cloisonnement contournable :
    // il suffirait de changer un identifiant pour voir le stock d'un autre.
    // Le code de Colors étant volontairement dense — plusieurs instructions par
    // ligne — la recherche vise des formes de LECTURE précises, pas la
    // cohabitation de deux mots sur une même ligne.
    expect(CONTENU).not.toMatch(/\.get\(["'][^"']*entreprise[^"']*["']\)/i);
    expect(CONTENU).not.toMatch(/(?:searchParams|params|formulaire|formData)\s*\.\s*entreprise/i);
    expect(CONTENU).not.toMatch(/texte\(\s*\w+\s*,\s*["'][^"']*entreprise/i);
    // La seule provenance admise, et elle est bien présente.
    expect(CONTENU).toMatch(/contexte\.entrepriseId|c\.entrepriseId/);
  });

  it("les routes d'API exigent toutes le contexte et l'accès applicatif", () => {
    const routes = APPLICATIVES.filter((fichier) => /\/app\/api\/.*route\.ts$/.test(fichier));
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const route of routes) {
      const contenu = readFileSync(route, "utf8");
      expect(contenu, route).toContain("getContexteColors()");
      // Deux formes de la même garde : `exigerAccesApplication` directement, ou
      // `protegerRouteColors` qui l'appelle. La route de diagnostic /api/acces
      // emploie la seconde et ne résout aucun rôle — elle ne renvoie qu'un
      // booléen d'accès et ne lit aucune donnée métier.
      expect(contenu, route).toMatch(/exigerAccesApplication\(contexte\s*,\s*"colors"\)|protegerRouteColors\(contexte\)/);
      const litDesDonnees = /from\(["']colors_|rpc\(["']colors_/.test(contenu);
      if (litDesDonnees) expect(contenu, route).toContain("resoudreRoleColors(contexte)");
    }
  });
});
