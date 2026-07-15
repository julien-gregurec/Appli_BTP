import { describe, expect, it } from "vitest";
import { NAVIGATION_APPLICATION, NAVIGATION_GROUPES } from "./navigation";

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
  });
});
