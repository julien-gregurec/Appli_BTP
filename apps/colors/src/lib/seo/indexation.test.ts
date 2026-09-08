import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONSIGNE_ROBOTS,
  REGLES_ROBOTS_PRECOMMERCIAL,
  ROBOTS_PRECOMMERCIAL,
  headersIndexationColors,
} from "@/lib/seo/indexation";
import robots from "@/app/robots";

const RACINE_APP = fileURLToPath(new URL("../../app", import.meta.url));

/** Toutes les sources de `src/app`, gabarits et pages compris. */
function sourcesApplicatives(dossier = RACINE_APP): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return sourcesApplicatives(chemin);
    return /\.tsx?$/.test(entree.name) && !entree.name.endsWith(".test.ts") ? [chemin] : [];
  });
}

describe("consigne d’indexation précommerciale", () => {
  it("refuse l’index et le suivi des liens", () => {
    const consigne = ROBOTS_PRECOMMERCIAL as Exclude<typeof ROBOTS_PRECOMMERCIAL, string | null>;
    expect(consigne).toMatchObject({ index: false, follow: false });
  });

  it("étend le refus à Googlebot et à ses images", () => {
    const consigne = ROBOTS_PRECOMMERCIAL as { googleBot?: Record<string, unknown> };
    expect(consigne.googleBot).toMatchObject({
      index: false,
      follow: false,
      noimageindex: true,
    });
  });

  it("dit la même chose dans l’en-tête HTTP que dans la balise", () => {
    expect(CONSIGNE_ROBOTS).toBe("noindex, nofollow");
    expect(headersIndexationColors()).toEqual([{ key: "X-Robots-Tag", value: CONSIGNE_ROBOTS }]);
  });
});

describe("/robots.txt", () => {
  it("interdit tout le site à tous les robots", () => {
    expect(robots()).toEqual(REGLES_ROBOTS_PRECOMMERCIAL);
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("ne publie aucun sitemap : il désignerait les URL à ne pas parcourir", () => {
    expect(robots().sitemap).toBeUndefined();
    expect(sourcesApplicatives().filter((chemin) => /\/sitemap\.tsx?$/.test(chemin))).toEqual([]);
  });
});

describe("aucune route ne rouvre l’indexation", () => {
  // Le `robots` du gabarit racine est hérité par toute l'application : il ne
  // tient que si aucune page ni aucun gabarit imbriqué ne le redéclare.
  it("ne déclare `robots` que dans le gabarit racine", () => {
    const declarants = sourcesApplicatives()
      .filter((chemin) => /\brobots\s*:/.test(readFileSync(chemin, "utf8")))
      .map((chemin) => chemin.slice(RACINE_APP.length + 1));
    expect(declarants).toEqual(["layout.tsx"]);
  });
});
