import { describe, expect, it } from "vitest";
import { formatWorkingPrice, hasReleveMetre, isReleveMetrePurchasable, RELEVE_METRE_CAPABILITY, RELEVE_METRE_OFFER, TOOLS_ADDON_CAPABILITIES } from "./entitlement";

describe("entitlement premium releve-metre", () => {
  it("fige la capability candidate et l'add-on", () => {
    expect(RELEVE_METRE_CAPABILITY).toBe("releve-metre");
    expect(TOOLS_ADDON_CAPABILITIES).toEqual(["releve-metre"]);
    expect(hasReleveMetre(["export-pdf", "releve-metre"])).toBe(true);
    expect(hasReleveMetre(new Set(["export-pdf"]))).toBe(false);
  });

  it("porte les prix de travail par utilisateur, HT", () => {
    expect(RELEVE_METRE_OFFER).toMatchObject({ monthlyPriceCents: 2490, annualPriceCents: 24900, vat: "HT", perUser: true, includesToolsPro: true });
    expect(formatWorkingPrice(RELEVE_METRE_OFFER.monthlyPriceCents).replace(/\s/g, " ")).toBe("24,90 € HT");
    expect(formatWorkingPrice(RELEVE_METRE_OFFER.annualPriceCents).replace(/\s/g, " ")).toBe("249,00 € HT");
  });

  it("n'est pas commercialement activé", () => {
    expect(RELEVE_METRE_OFFER.commercialActivation).toBe(false);
    expect(RELEVE_METRE_OFFER.status).toBe("working-price");
    expect(isReleveMetrePurchasable()).toBe(false);
    expect(Object.isFrozen(RELEVE_METRE_OFFER)).toBe(true);
  });
});

describe("prix de référence : une seule source, jamais codée en dur ailleurs", () => {
  it("aucun fichier source de Tools, du domaine ni des migrations ne recopie le prix", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const scanned = ["apps/tools/src", "packages/releve-domain/src"].map((dir) => join(root, dir));
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        if (/\b(2490|24900)\b|24,90|249 ?€/.test(readFileSync(path, "utf8"))) hits.push(relative(root, path));
      }
    };
    scanned.forEach(walk);
    const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) => /_tools_releve_metre_.*\.sql$/.test(name));
    expect(migrations.length).toBeGreaterThanOrEqual(4);
    for (const migration of migrations) {
      if (/\b(2490|24900)\b|24,90/.test(readFileSync(join(root, "supabase/migrations", migration), "utf8"))) hits.push(migration);
    }
    expect(hits).toEqual(["packages/releve-domain/src/entitlement.ts"]);
  });
});
