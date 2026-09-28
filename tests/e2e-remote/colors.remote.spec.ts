import { expect, test } from "@playwright/test";
import { compteAutorise, pasDErreurApplicative, seConnecter, surveillerErreursServeur } from "./remote-aides";

test.describe("Colors — Preview distante", () => {
  test("connexion publique, tableau de bord fermé sans session", async ({ page }) => {
    const r = await page.goto("/login");
    expect(r?.status()).toBe(200);
    await pasDErreurApplicative(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("connexion du compte A, session conservée puis révoquée par effacement", async ({ page, context }) => {
    const a = compteAutorise("colors");
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
