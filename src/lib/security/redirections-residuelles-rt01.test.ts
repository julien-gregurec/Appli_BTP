import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { destinationInterneSure } from "./redirects";

// Train V9 — résiduel de la red team V1 (RT-01, branche claude/ecstatic-fermat-bcqats, jamais
// intégrée) : deux destinations de retour étaient encore validées par un contrôle « commence par /
// sans // », qui accepte `/\evil.com`. Le parseur d'URL (et les navigateurs) lisent l'antislash
// comme une barre : la destination devient `//evil.com`, une autre origine.

const ORIGINE = "https://app.elsatia.test";
const sortDeLOrigine = (destination: string) => new URL(destination, ORIGINE).origin !== ORIGINE;

// Témoins : les deux contrôles de V8, recopiés à l'identique.
const ancienRetourPaiements = (retour: string) => (retour.startsWith("/") && !retour.startsWith("//") && !retour.includes(":") ? retour : "/paiements-bancaires");
const ancienRetourPaie = (retour: string) => (retour.startsWith("/") && !retour.startsWith("//") ? retour : "/paie");

const EXPLOITS = ["/\\evil.com", "/\\/evil.com", "/%5C%5Cevil.com", "/.//evil.com", "/%2e//evil.com"];

describe("RT-01 résiduel : retours de /paiements-bancaires et de l'import de pièces de paie", () => {
  it("RED (V8) : l'ancien contrôle laisse sortir de l'origine", () => {
    expect(sortDeLOrigine(ancienRetourPaiements("/\\evil.com"))).toBe(true);
    expect(sortDeLOrigine(ancienRetourPaie("/\\evil.com"))).toBe(true);
  });

  it("GREEN (V9) : le validateur commun ne sort jamais de l'origine", () => {
    for (const exploit of EXPLOITS) {
      expect(sortDeLOrigine(destinationInterneSure(exploit, "/paiements-bancaires"))).toBe(false);
      expect(sortDeLOrigine(destinationInterneSure(exploit, "/paie"))).toBe(false);
    }
    expect(destinationInterneSure("/paie/abc?onglet=pieces", "/paie")).toBe("/paie/abc?onglet=pieces");
    expect(destinationInterneSure("/paiements-bancaires?lot=1", "/paiements-bancaires")).toBe("/paiements-bancaires?lot=1");
  });

  it("les deux points d'entrée passent par destinationInterneSure", () => {
    const racine = resolve(import.meta.dirname, "../../..");
    const paiements = readFileSync(resolve(racine, "src/app/actions/paiements-bancaires.ts"), "utf8");
    const paie = readFileSync(resolve(racine, "src/app/api/paie/documents/upload/route.ts"), "utf8");
    expect(paiements).toMatch(/const retourAutorise = \(formData: FormData\) => destinationInterneSure\(/);
    expect(paie).toMatch(/const destination = destinationInterneSure\(retour, "\/paie"\);/);
    expect(paiements).not.toMatch(/retour\.startsWith\("\/"\) && !retour\.startsWith\("\/\/"\)/);
    expect(paie).not.toMatch(/retour\.startsWith\("\/"\) && !retour\.startsWith\("\/\/"\)/);
  });
});
