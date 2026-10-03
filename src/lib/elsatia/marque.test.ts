import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPLICATIONS_MARQUE_ELSATIA, COULEURS_ELSATIA, iconesApplication, LOGOS_ELSATIA, PRODUITS_ELSATIA, symboleProduit } from "@/lib/elsatia/marque";

const racine = process.cwd();

describe("marque ELSATIA : source de vérité unique public/elsatia/", () => {
  it("les fichiers officiels attendus sont exactement ceux de la décision", () => {
    expect(LOGOS_ELSATIA.principal).toBe("/elsatia/logo-officiel.svg");
    expect(LOGOS_ELSATIA.symbole).toBe("/elsatia/symbole.svg");
    expect(LOGOS_ELSATIA.negatif).toBe("/elsatia/logo-officiel-blanc.svg");
  });

  it("tous les chemins de marque restent sous /elsatia/", () => {
    const chemins = [
      ...Object.values(LOGOS_ELSATIA),
      ...PRODUITS_ELSATIA.map(symboleProduit),
      ...APPLICATIONS_MARQUE_ELSATIA.flatMap((a) => Object.values(iconesApplication(a.cle))),
    ];
    for (const chemin of chemins) expect(chemin.startsWith("/elsatia/")).toBe(true);
  });

  it("couvre les sept applications de l'écosystème", () => {
    expect(APPLICATIONS_MARQUE_ELSATIA.map((a) => a.cle)).toEqual(["site", "gestion-pro", "tools", "colors", "studio", "reserves", "social"]);
  });

  it("aucune convention parallèle (public/branding/) n'existe dans le dépôt", () => {
    expect(existsSync(join(racine, "public/branding"))).toBe(false);
    for (const app of readdirSync(join(racine, "apps"))) expect(existsSync(join(racine, "apps", app, "public/branding"))).toBe(false);
  });

  it("la palette CSS --elsatia-* reprend les valeurs de marque.ts", () => {
    const css = readFileSync(join(racine, "src/app/globals.css"), "utf8");
    for (const [nom, valeur] of Object.entries(COULEURS_ELSATIA)) expect(css).toContain(`--elsatia-${nom}: ${valeur};`);
  });
});
