import { existsSync, readFileSync } from "node:fs";
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

  it("déclare des icônes PWA dont chaque fichier existe réellement dans public/", () => {
    const { icons } = manifest();
    expect(icons).toBeDefined();
    expect(icons!.length).toBeGreaterThanOrEqual(4);
    expect(icons!.some((icone) => icone.purpose === "any")).toBe(true);
    expect(icons!.some((icone) => icone.purpose === "maskable")).toBe(true);

    for (const icone of icons!) {
      expect(typeof icone.src).toBe("string");
      const cheminDisque = join(process.cwd(), "public", (icone.src as string).replace(/^\//, ""));
      expect(existsSync(cheminDisque), `Icône PWA manquante sur le disque : ${icone.src}`).toBe(true);
    }

    const serviceWorker = lire("public/sw.js");
    expect(serviceWorker).toContain("/icons/");
    expect(serviceWorker).not.toContain(ancienNom);
  });

  it("utilise un nom ELSATIA pour l'export RGPD téléchargé", () => {
    const source = lire("src/app/api/rgpd/export/route.ts");

    expect(source).toContain("export-donnees-elsatia-gestion-pro-");
    expect(source).not.toContain(ancienNom.toLowerCase());
  });
});
