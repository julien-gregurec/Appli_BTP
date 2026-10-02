import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ELSATIA_NEXT_MEMORY_CAPACITY_V1 : un `new Intl.DateTimeFormat(...)` construit à chaque
// appel d'un formateur (par ligne, par cellule) alloue des objets ICU natifs libérés
// seulement au GC. Mesuré : `/planning` à 10 utilisateurs montait le serveur `next start`
// à ~3 Go de RSS, retenus après GC (heap JS ≈ 90 Mo). Les formateurs doivent être construits
// une fois (constante de module) et réutilisés.
//
// Garde syntaxique volontairement simple : interdit les deux formes « par appel » qui
// avaient causé le défaut — flèche qui renvoie directement `new Intl.DateTimeFormat(`, et
// `return new Intl.DateTimeFormat(`. Les appels uniques (version, paie, assistant, libellés
// de 6 mois) restent possibles sous une autre forme.
const RACINE = join(__dirname, "..", "..");
const MOTIFS = [/=>\s*\(?\s*new Intl\.DateTimeFormat\(/, /\?\s*new Intl\.DateTimeFormat\(/, /return new Intl\.DateTimeFormat\(/];

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.ts$/.test(nom) ? [chemin] : [];
  });
}

describe("formateurs Intl.DateTimeFormat", () => {
  it("ne sont jamais reconstruits à chaque appel", () => {
    const fautifs = fichiers(RACINE).flatMap((chemin) =>
      readFileSync(chemin, "utf8")
        .split("\n")
        .map((ligne, i) => ({ ligne, i }))
        .filter(({ ligne }) => MOTIFS.some((motif) => motif.test(ligne)))
        .map(({ i }) => `${relative(RACINE, chemin)}:${i + 1}`),
    );
    expect(fautifs).toEqual([]);
  });
});
