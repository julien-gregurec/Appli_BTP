import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RPC_LEGACY = /plateforme_(?:appliquer|retirer)_remise/;

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersSource(chemin);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(nom) ? [chemin] : [];
  });
}

describe("surface cliente des anciennes RPC de remise", () => {
  it("aucun code applicatif n'appelle une RPC legacy hors saga", () => {
    const racine = join(process.cwd(), "src");
    const appels = fichiersSource(racine)
      .filter((chemin) => !chemin.endsWith("stripe-discount-legacy-surface.test.ts"))
      .filter((chemin) => RPC_LEGACY.test(readFileSync(chemin, "utf8")))
      .map((chemin) => relative(process.cwd(), chemin));
    expect(appels).toEqual([]);
    // Budget PROPRE à ce test, et non hausse du plafond global : il lit
    // l'intégralité de `src/` de façon synchrone, et le Train V3 y a ajouté le
    // moteur commercial, l'annuaire plateforme et l'assistance interapplications.
    // Le dépassement mesuré était une taille d'arborescence, jamais un appel legacy.
  }, 30_000);
});
