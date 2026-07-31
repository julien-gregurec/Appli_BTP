import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test("connexion, conservation de session et déconnexion", async ({ page }) => {
  await login(page, USERS.adminA);
  await expect(page.locator("body")).toContainText("RECETTE_A_ENTREPRISE");
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("mauvais mot de passe et utilisateur inexistant sont refusés", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.adminA);
  await page.getByLabel("Mot de passe").fill("incorrect");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("body")).toContainText(/incorrect|invalide|connexion/i);

  await page.getByLabel("Email").fill("absent@invalid.local");
  await page.getByLabel("Mot de passe").fill("incorrect");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/login/);
});
