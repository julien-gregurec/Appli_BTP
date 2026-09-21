import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test("@responsive parcours critique ouvrier", async ({ page }) => {
  await login(page, USERS.workerA);
  for (const route of ["/dashboard", "/mes-travaux", "/pointage", "/notes-frais", "/messagerie"]) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("RECETTE_B_");
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(8);
  }
});
