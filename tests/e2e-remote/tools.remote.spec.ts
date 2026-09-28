import { expect, test } from "@playwright/test";
import { pasDErreurApplicative, surveillerErreursServeur } from "./remote-aides";

test.describe("Tools — Preview distante", () => {
  test("accueil, catalogue d'outils, compte et hors-ligne servis sans erreur", async ({ page }) => {
    const erreurs = surveillerErreursServeur(page);
    for (const chemin of ["/", "/outils", "/compte", "/offline"]) {
      const r = await page.goto(chemin);
      expect(r?.status(), chemin).toBe(200);
      await pasDErreurApplicative(page);
    }
    expect(erreurs).toEqual([]);
  });

  test("service worker et manifeste publiés", async ({ request }) => {
    expect((await request.get("/sw-tools.js")).status()).toBe(200);
    expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
  });
});
