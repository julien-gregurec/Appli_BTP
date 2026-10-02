import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { destinationInterneSure } from "./redirects";

// Security Residual V2 (train canonique V9) : deux points de retour gardaient un contrôle
// « commence par / mais pas par // », contourné par l'antislash.
const ancienControlePaie = (retour: string) => (retour.startsWith("/") && !retour.startsWith("//") ? retour : "/paie");
const ancienControleBanque = (retour: string) =>
  retour.startsWith("/") && !retour.startsWith("//") && !retour.includes(":") ? retour : "/paiements-bancaires";

const base = "https://app.elsatia.test/api/paie/documents/upload";
const charges = ["/\\evil.example", "/\\/evil.example", "/%5c%5cevil.example", "/.//evil.example"];

describe("Security Residual V2 — redirections de retour", () => {
  it("l'ancien contrôle laissait sortir de l'origine (preuve rouge conservée)", () => {
    expect(new URL(ancienControlePaie("/\\evil.example"), base).origin).toBe("https://evil.example");
    expect(new URL(ancienControleBanque("/\\evil.example"), base).origin).toBe("https://evil.example");
  });

  it.each(charges)("%s reste sur l'origine de l'application", (charge) => {
    expect(new URL(destinationInterneSure(charge, "/paie"), base).origin).toBe("https://app.elsatia.test");
    expect(new URL(destinationInterneSure(charge, "/paiements-bancaires"), base).origin).toBe("https://app.elsatia.test");
  });

  it("un retour interne légitime est conservé", () => {
    expect(destinationInterneSure("/paie?mois=2026-09", "/paie")).toBe("/paie?mois=2026-09");
    expect(destinationInterneSure("/salaries/42?onglet=banque", "/paiements-bancaires")).toBe("/salaries/42?onglet=banque");
  });

  it.each([
    "src/app/api/paie/documents/upload/route.ts",
    "src/app/actions/paiements-bancaires.ts",
  ])("%s utilise le validateur commun", (fichier) => {
    const source = readFileSync(join(process.cwd(), fichier), "utf8");
    expect(source).toContain("destinationInterneSure(");
    expect(source).not.toMatch(/retour\.startsWith\("\/"\) && !retour\.startsWith\("\/\/"\)/);
  });
});
