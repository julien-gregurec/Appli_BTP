import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Garde statique (ELSATIA-STOCK-PRIX-CONFIDENTIALITE-COLONNES-V1).
 *
 * Les prix de `articles_stock` ne sont plus lisibles par `authenticated` : toute lecture
 * directe échouerait en 42501 — ou, pire, recommencerait à fuir si un privilège table
 * revenait comme avec la migration 00189. Le code doit passer par les RPC
 * `articles_stock_avec_prix`, `lignes_inventaire_avec_prix`, `couts_stock_par_chantier`
 * et `importer_articles_stock`.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
// D4 : copie Finder non routée ni importée, supprimée par le lot distinct
// `chore/remove-finder-duplicate-copies-v1`. Isolée nommément, jamais tolérée ailleurs.
const COPIE_FINDER = join("app", "(app)", "stock", "page 2.tsx");

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.ts$/.test(nom) ? [chemin] : [];
  });
}

const fichiers = sources(SRC).map((chemin) => ({ chemin: relative(SRC, chemin), texte: readFileSync(chemin, "utf8") }));
const surveilles = fichiers.filter((f) => f.chemin !== COPIE_FINDER);

function occurrences(regex: RegExp) {
  return surveilles.flatMap((f) => [...f.texte.matchAll(regex)].map((m) => ({ fichier: f.chemin, extrait: m[0] })));
}

describe("garde : aucune lecture directe des prix du stock", () => {
  it("aucun embed PostgREST articles_stock(…) ne demande un prix", () => {
    expect(occurrences(/articles_stock\s*\(([^)]*)\)/g).filter((o) => o.extrait.includes("prix_"))).toEqual([]);
  });

  it("aucun from(\"articles_stock\").select(…) ne demande un prix ni *", () => {
    const selects = occurrences(/from\(\s*["'`]articles_stock["'`]\s*\)\s*\.select\(\s*["'`]([^"'`]*)["'`]/g);
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.filter((o) => /prix_|\*/.test(o.extrait))).toEqual([]);
  });

  it("aucun upsert PostgREST sur articles_stock (EXCLUDED relirait les prix)", () => {
    expect(occurrences(/from\(\s*["'`]articles_stock["'`]\s*\)\s*\.upsert\(/g)).toEqual([]);
  });

  it("la rentabilité passe par couts_stock_par_chantier et ne lit aucun prix unitaire", () => {
    for (const chemin of [join("app", "(app)", "rentabilite", "page.tsx"), join("app", "actions", "rentabilite.ts"), join("lib", "rentabilite.ts")]) {
      const texte = readFileSync(join(SRC, chemin), "utf8");
      expect(texte, chemin).not.toContain("prix_achat_ht");
      expect(texte, chemin).not.toContain("prix_vente_ht");
    }
    for (const chemin of [join("app", "(app)", "rentabilite", "page.tsx"), join("app", "actions", "rentabilite.ts")]) {
      expect(readFileSync(join(SRC, chemin), "utf8"), chemin).toContain("lireCoutsStockChantiers");
    }
  });
});

describe("D4 : copie Finder `stock/page 2.tsx`", () => {
  it("si elle existe encore, elle n'est ni une route ni importée", () => {
    if (!existsSync(join(SRC, COPIE_FINDER))) return;
    expect(basename(COPIE_FINDER)).not.toBe("page.tsx");
    expect(fichiers.filter((f) => /from\s+["'][^"']*page 2["']/.test(f.texte)).map((f) => f.chemin)).toEqual([]);
  });
});
