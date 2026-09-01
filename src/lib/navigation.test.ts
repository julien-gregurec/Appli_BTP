import { describe, expect, it } from "vitest";
import { NAVIGATION_APPLICATION, NAVIGATION_GROUPES, navigationPourContexte } from "./navigation";

describe("navigation regroupée", () => {
  it("range chaque module dans un dossier déclaré", () => {
    const groupes = new Set(NAVIGATION_GROUPES.map((groupe) => groupe.cle));
    expect(NAVIGATION_APPLICATION.length).toBeGreaterThan(20);
    expect(NAVIGATION_APPLICATION.every((item) => groupes.has(item.groupe))).toBe(true);
  });

  it("conserve les modules sensibles derrière une permission", () => {
    const publics = NAVIGATION_APPLICATION.filter((item) => !item.permission).map((item) => item.href);
    expect(publics).toEqual(["/dashboard", "/mon-espace"]);
    expect(NAVIGATION_APPLICATION.find((item) => item.href === "/connecteurs")?.permission).toBe("acces_connecteurs");
    expect(NAVIGATION_APPLICATION.find((item) => item.href === "/rentabilite")?.permission).toBe("acces_rentabilite");
    expect(NAVIGATION_APPLICATION.find((item) => item.href === "/sous-traitants")?.permission).toBe("acces_sous_traitants");
  });
});

describe("navigationPourContexte", () => {
  it("vide le menu principal pour un admin plateforme sans entreprise cliente (pas de Tableau de bord ni Mon espace)", () => {
    expect(navigationPourContexte(true, NAVIGATION_APPLICATION)).toEqual([]);
  });

  it("laisse le menu inchangé pour un utilisateur ou admin d'entreprise cliente", () => {
    expect(navigationPourContexte(false, NAVIGATION_APPLICATION)).toBe(NAVIGATION_APPLICATION);
  });
});
