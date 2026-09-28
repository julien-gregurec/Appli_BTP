import { describe, expect, it } from "vitest";
import { cheminInterneSur } from "@/lib/redirections";

// Reproduction du contrôle historique, pour documenter la faille corrigée.
function controleHistorique(valeur: string | null): string {
  return valeur?.startsWith("/") && !valeur.startsWith("//") ? valeur : "/dashboard";
}

// Vecteurs de redirection ouverte : chemins qui, une fois résolus par le parseur
// URL du navigateur/serveur contre l'origine de l'application, pointent vers un
// hôte externe alors qu'ils « commencent par / ».
const VECTEURS_EXTERNES = [
  "//evil.com",
  "/\\evil.com",
  "/\t/evil.com",
  "/\r/evil.com",
  "/\n/evil.com",
  "https://evil.com",
  "http:evil.com",
  "javascript:alert(1)",
];

const CHEMINS_LEGITIMES = [
  ["/dashboard", "/dashboard"],
  ["/onboarding?code=ABC", "/onboarding?code=ABC"],
  ["/nouveau-mot-de-passe", "/nouveau-mot-de-passe"],
  ["/paie?onglet=periodes#bas", "/paie?onglet=periodes#bas"],
] as const;

describe("cheminInterneSur", () => {
  it("conserve les chemins internes légitimes", () => {
    for (const [entree, attendu] of CHEMINS_LEGITIMES) {
      expect(cheminInterneSur(entree, "/secours")).toBe(attendu);
    }
  });

  it("retombe sur le secours pour les valeurs absentes ou non-chemins", () => {
    expect(cheminInterneSur(null, "/secours")).toBe("/secours");
    expect(cheminInterneSur(undefined, "/secours")).toBe("/secours");
    expect(cheminInterneSur("", "/secours")).toBe("/secours");
    expect(cheminInterneSur("dashboard", "/secours")).toBe("/secours");
  });

  it("neutralise tous les vecteurs de redirection ouverte", () => {
    for (const vecteur of VECTEURS_EXTERNES) {
      const resultat = cheminInterneSur(vecteur, "/secours");
      expect(resultat).toBe("/secours");
      // Garantie forte : la valeur retenue, résolue contre l'origine applicative,
      // ne quitte jamais cette origine.
      const origine = new URL(resultat, "https://app.exemple.com").origin;
      expect(origine).toBe("https://app.exemple.com");
    }
  });

  it("prouve que le contrôle historique laissait fuir ces vecteurs (régression)", () => {
    // Au moins un vecteur passait le contrôle historique et pointait hors origine :
    // c'est précisément la faille que cheminInterneSur ferme.
    const fuites = VECTEURS_EXTERNES.filter((vecteur) => {
      const retenu = controleHistorique(vecteur);
      return new URL(retenu, "https://app.exemple.com").origin !== "https://app.exemple.com";
    });
    expect(fuites).toContain("/\\evil.com");
    expect(fuites.length).toBeGreaterThan(0);
  });
});
