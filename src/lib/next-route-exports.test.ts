// Garde structurelle Next.js — surface d'export des `route.ts`.
//
// Next.js n'autorise dans un fichier `route.ts` que les gestionnaires HTTP et
// la configuration de segment. Tout autre export de valeur est refusé au build
// (« … is not a valid Route export field »). Ce défaut est resté invisible tant
// que le build tournait sur Turbopack, dont le validateur généré n'est qu'une
// contrainte structurelle `extends` : il tolère les champs surnuméraires. Le
// bundler webpack, lui, génère une vérification exacte et échoue.
//
// Cette garde ne dépend d'aucun bundler : elle relit le code source de toutes
// les routes de l'application et refuse tout export de valeur hors liste.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `HTTP_METHODS` de Next.js + configuration de segment acceptée par le
// validateur de routes.
const EXPORTS_AUTORISES = new Set([
  "GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH",
  "config", "generateStaticParams", "revalidate", "dynamic", "dynamicParams",
  "fetchCache", "preferredRegion", "runtime", "maxDuration",
  "unstable_instant", "unstable_dynamicStaleTime",
]);

const RACINE_APP = join(process.cwd(), "src", "app");

function routes(repertoire: string): string[] {
  const trouvees: string[] = [];
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree);
    if (statSync(chemin).isDirectory()) trouvees.push(...routes(chemin));
    else if (entree === "route.ts" || entree === "route.tsx") trouvees.push(chemin);
  }
  return trouvees;
}

/**
 * Exports de VALEUR d'un module. Les exports de type (`export type`,
 * `export interface`) sont effacés à la compilation et n'apparaissent pas dans
 * le `typeof import(...)` que Next.js vérifie : ils sont donc ignorés ici, tout
 * comme par Next.js.
 */
function exportsDeValeur(source: string): string[] {
  const noms: string[] = [];
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  for (const [, nom] of sansCommentaires.matchAll(
    /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm,
  )) noms.push(nom);
  for (const [, liste] of sansCommentaires.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const morceau of liste.split(",")) {
      const brut = morceau.trim();
      if (!brut || brut.startsWith("type ")) continue;
      const alias = brut.split(/\s+as\s+/);
      noms.push((alias[1] ?? alias[0]).trim());
    }
  }
  if (/^export\s+default\b/m.test(sansCommentaires)) noms.push("default");
  if (/^export\s+\*/m.test(sansCommentaires)) noms.push("*");
  return noms;
}

describe("surface d'export des routes Next.js", () => {
  const fichiers = routes(RACINE_APP);

  it("découvre les routes de l'application", () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers.map((f) => [f.slice(process.cwd().length + 1), f]))(
    "%s n'exporte que des champs reconnus par Next.js",
    (_relatif, fichier) => {
      const interdits = exportsDeValeur(readFileSync(fichier, "utf8"))
        .filter((nom) => !EXPORTS_AUTORISES.has(nom));
      expect(interdits).toEqual([]);
    },
  );

  it("détecte bien un export interdit (contrôle de la garde elle-même)", () => {
    const source = 'export async function POST() {}\nexport async function synchroniserAbonnementCoordonne() {}\n';
    expect(exportsDeValeur(source).filter((n) => !EXPORTS_AUTORISES.has(n)))
      .toEqual(["synchroniserAbonnementCoordonne"]);
  });

  it("n'incrimine pas les exports de type, effacés à la compilation", () => {
    const source = 'export type StripeObjet = { id: string };\nexport interface Foo { a: 1 }\nexport async function GET() {}\n';
    expect(exportsDeValeur(source).filter((n) => !EXPORTS_AUTORISES.has(n))).toEqual([]);
  });
});
