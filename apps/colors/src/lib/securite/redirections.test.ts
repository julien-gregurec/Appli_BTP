import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { destinationInterneSure } from "@/lib/securite/redirections";

describe("destinationInterneSure — anti-redirection ouverte Colors", () => {
  it("conserve les chemins internes légitimes", () => {
    expect(destinationInterneSure("/dashboard")).toBe("/dashboard");
    expect(destinationInterneSure("/inventaire")).toBe("/inventaire");
    expect(destinationInterneSure("/dashboard?tab=inventaire#section")).toBe(
      "/dashboard?tab=inventaire#section",
    );
  });

  it("retombe sur /dashboard pour une origine externe", () => {
    expect(destinationInterneSure("https://evil.com")).toBe("/dashboard");
    expect(destinationInterneSure("http://evil.com/x")).toBe("/dashboard");
    expect(destinationInterneSure("//evil.com")).toBe("/dashboard");
  });

  it("neutralise les évasions par antislash brut ou encodé", () => {
    expect(destinationInterneSure("/\\evil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/\\/evil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/%5Cevil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/%5c/evil.com")).toBe("/dashboard");
  });

  it("neutralise les séparateurs encodés, simples ou doublement encodés", () => {
    expect(destinationInterneSure("/%2Fevil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/%2f%2fevil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/%252Fevil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/%252f%252fevil.com")).toBe("/dashboard");
  });

  it("neutralise tabulation, sauts de ligne et caractères de contrôle", () => {
    expect(destinationInterneSure("/\tevil")).toBe("/dashboard");
    expect(destinationInterneSure("/\nLocation: https://evil.com")).toBe("/dashboard");
    expect(destinationInterneSure("/%09evil")).toBe("/dashboard");
    expect(destinationInterneSure("/%0d%0aSet-Cookie: x=1")).toBe("/dashboard");
  });

  it("rejette identifiants intégrés, décodage invalide et valeurs vides", () => {
    expect(destinationInterneSure("/%")).toBe("/dashboard");
    expect(destinationInterneSure("/%zz")).toBe("/dashboard");
    expect(destinationInterneSure("")).toBe("/dashboard");
    expect(destinationInterneSure(null)).toBe("/dashboard");
    expect(destinationInterneSure(undefined)).toBe("/dashboard");
    expect(destinationInterneSure("https://user:pass@evil.com")).toBe("/dashboard");
  });

  it("respecte un repli explicite", () => {
    expect(destinationInterneSure("https://evil.com", "/login")).toBe("/login");
  });
});

describe("flux Colors — aucune garde de redirection locale plus faible", () => {
  const FICHIERS = [
    "src/app/actions.ts",
    "src/app/actions-mfa.ts",
    "src/app/login/mfa/page.tsx",
    "src/app/auth/callback/route.ts",
  ];
  const GARDE_FAIBLE = /startsWith\(\s*["'`]\/["'`]\s*\)\s*&&\s*!\s*\w*\.?startsWith\(\s*["'`]\/\/["'`]\s*\)/;

  for (const fichier of FICHIERS) {
    it(`${fichier} délègue à destinationInterneSure`, () => {
      const source = readFileSync(join(process.cwd(), fichier), "utf8");
      expect(source).toContain("destinationInterneSure");
      expect(source).not.toMatch(GARDE_FAIBLE);
    });
  }
});
