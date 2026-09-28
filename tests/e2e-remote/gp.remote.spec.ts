import { expect, test } from "@playwright/test";
import { compteAutorise, pasDErreurApplicative, seConnecter, surveillerErreursServeur } from "./remote-aides";

test.describe("Gestion Pro — Preview distante", () => {
  test("pages publiques servies sans erreur", async ({ page }) => {
    const erreurs = surveillerErreursServeur(page);
    for (const chemin of ["/login", "/signup", "/mot-de-passe-oublie", "/tarifs"]) {
      const r = await page.goto(chemin);
      expect(r?.status(), chemin).toBe(200);
      await pasDErreurApplicative(page);
    }
    await expect(page.locator("body")).toContainText("ELSATIA");
    expect(erreurs).toEqual([]);
  });

  test("page protégée fermée sans session", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("connexion, conservation de session, déconnexion (compte A)", async ({ page }) => {
    const a = compteAutorise("gp");
    const erreurs = surveillerErreursServeur(page);
    await seConnecter(page, a);
    await pasDErreurApplicative(page);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    expect(erreurs).toEqual([]);
  });

  test("connexion du compte B (seconde entreprise)", async ({ page }) => {
    const b = compteAutorise("gp", "B");
    await seConnecter(page, b);
    await pasDErreurApplicative(page);
  });
});
