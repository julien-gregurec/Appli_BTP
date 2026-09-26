import { expect, test } from "@playwright/test";
import { IDS, login, USERS } from "./helpers";

const cases = [
  { role: "ouvrier", user: USERS.workerA, allowed: ["/mes-travaux", "/pointage", "/notes-frais"], denied: ["/plateforme", "/parametres", "/rentabilite"] },
  { role: "chef équipe", user: USERS.leaderA, allowed: ["/planning", "/pointage", "/messagerie"], denied: ["/plateforme", "/rentabilite", "/paie"] },
  { role: "conducteur", user: USERS.managerA, allowed: ["/chantiers", "/planning", "/devis"], denied: ["/plateforme", "/paie"] },
  { role: "comptable", user: USERS.accountantA, allowed: ["/factures", "/depenses", "/exports"], denied: ["/plateforme", "/employes"] },
  { role: "dirigeant", user: USERS.ownerA, allowed: ["/dashboard", "/clients", "/chantiers", "/rentabilite"], denied: ["/plateforme"] },
  { role: "admin entreprise", user: USERS.adminA, allowed: ["/dashboard", "/clients", "/employes", "/parametres"], denied: ["/plateforme"] },
] as const;

for (const item of cases) {
  test(`routes autorisées et refusées — ${item.role}`, async ({ page }) => {
    await login(page, item.user);
    for (const route of item.allowed) {
      await page.goto(route);
      expect(new URL(page.url()).pathname).not.toBe("/login");
      await expect(page.locator("body")).not.toContainText("RECETTE_B_");
    }
    for (const route of item.denied) {
      const response = await page.goto(route);
      if (new URL(page.url()).pathname === route) {
        expect(response?.status()).toBe(404);
      }
      await expect(page.locator("body")).not.toContainText("RECETTE_B_");
    }
  });
}

test("UUID B manipulés ne divulguent aucune donnée à A", async ({ page }) => {
  await login(page, USERS.adminA);
  for (const route of [
    `/clients/${IDS.clientB}`,
    `/chantiers/${IDS.siteB}`,
    `/devis/${IDS.quoteB}`,
    `/factures/${IDS.invoiceB}`,
    `/notes-frais/${IDS.expenseB}`,
  ]) {
    const response = await page.goto(route);
    expect(response?.status() ?? 200).toBeLessThan(500);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("TEST_B_");
    expect(body).not.toContain("RECETTE_B_");
  }
});

test("administrateur plateforme reste hors données privées par défaut", async ({ page }) => {
  await login(page, USERS.platform, /\/parametres\/securite\?.*requis=plateforme/);
  await page.goto("/plateforme");
  await expect(page).toHaveURL(/\/parametres\/securite\?.*requis=plateforme/);
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("TEST_A_FAC_001");
  expect(body).not.toContain("NDF-ISO-A");
  expect(body).not.toContain("TEST_A_Message");
});
