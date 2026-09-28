import { expect, test } from "@playwright/test";
import { compteAutorise, pasDErreurApplicative, seConnecter, surveillerErreursServeur } from "./remote-aides";

test.describe("Réserves — Preview distante (mobile)", () => {
  test("sonde hors-ligne, connexion publique, tableau de bord fermé", async ({ page, request }) => {
    expect((await request.get("/api/offline/ping")).status()).toBe(204);
    expect((await request.get("/sw-reserves.js")).status()).toBe(200);
    const r = await page.goto("/login");
    expect(r?.status()).toBe(200);
    await pasDErreurApplicative(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("connexion du compte A, session conservée puis révoquée par effacement", async ({ page, context }) => {
    const a = compteAutorise("reserves");
    const erreurs = surveillerErreursServeur(page);
    await seConnecter(page, a);
    await pasDErreurApplicative(page);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await context.clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    expect(erreurs).toEqual([]);
  });
});
