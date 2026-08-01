import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { PRODUCT_NAME } from "@/lib/brand";

const lire = (fichier: string) => readFileSync(join(process.cwd(), fichier), "utf8");
const ancienNom = ["Li", "ria"].join("");

describe("identité visible", () => {
  it("raccorde la connexion au wordmark et au nom du produit", () => {
    const source = lire("src/app/login/page.tsx");

    expect(source).toContain("BrandWordmark");
    expect(source).toContain("PRODUCT_NAME");
    expect(source).not.toContain(ancienNom);
  });

  it("publie les noms officiels dans le manifeste PWA", () => {
    expect(manifest()).toMatchObject({
      name: PRODUCT_NAME,
      short_name: PRODUCT_NAME,
      description: expect.stringContaining(PRODUCT_NAME),
    });
  });

  it("raccorde les métadonnées, l'abonnement et le document principal", () => {
    const sources = [
      lire("src/app/layout.tsx"),
      lire("src/app/(app)/abonnement/page.tsx"),
      lire("src/components/DocumentImprimable.tsx"),
    ];

    for (const source of sources) {
      expect(source).toMatch(/BRAND|PRODUCT_NAME/);
      expect(source).not.toContain(ancienNom);
    }
  });

  it("utilise un nom ELSATIA pour l'export RGPD téléchargé", () => {
    const source = lire("src/app/api/rgpd/export/route.ts");

    expect(source).toContain("export-donnees-elsatia-gestion-pro-");
    expect(source).not.toContain(ancienNom.toLowerCase());
  });
});
