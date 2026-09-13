import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Rappel de sauvegarde (GP V1) : information non bloquante, distincte de l'autosauvegarde ; n'apparaît que si le
// devis est modifié et qu'aucune sauvegarde n'a réussi depuis ; jamais de double écriture.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");
const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);
const rappel = (page: Page) => page.locator("[data-testid=rappel-sauvegarde]");
const tentatives = (page: Page) => page.evaluate(() => window.__banc.tentatives);

test("devis inchangé : aucun rappel ; désactivé : aucun rappel même modifié", async ({ page }) => {
  await page.goto(url("?lignes=2&rappel=0.05"));
  await page.waitForTimeout(4_500);
  await expect(rappel(page)).toHaveCount(0);
  await page.goto(url("?lignes=2&rappel=off"));
  await page.evaluate(() => { window.__banc.refus = "Refus simulé du serveur."; });
  await cellule(page, 0, "quantite").fill("4"); await page.keyboard.press("Tab");
  await page.waitForTimeout(4_500);
  await expect(rappel(page)).toHaveCount(0);
});

test("modifié sans sauvegarde réussie : rappel après la fréquence ; sauvegarde échouée ne remet pas à zéro ; réussie oui", async ({ page }) => {
  await page.goto(url("?lignes=2&rappel=0.05"));
  await page.evaluate(() => { window.__banc.refus = "Refus simulé du serveur."; });
  await cellule(page, 0, "quantite").fill("5"); await page.keyboard.press("Tab");
  await expect(rappel(page)).toBeVisible({ timeout: 8_000 });
  await expect(rappel(page)).toContainText("Des modifications ont été apportées depuis la dernière sauvegarde.");
  const t0 = await tentatives(page);
  // Sauvegarder maintenant, mais le serveur refuse : le rappel reste, aucune écriture supplémentaire en boucle.
  await rappel(page).getByRole("button", { name: "Sauvegarder maintenant" }).click();
  await expect.poll(() => tentatives(page)).toBe(t0 + 1);
  await page.waitForTimeout(1_000);
  expect(await tentatives(page)).toBe(t0 + 1);
  // Plus tard : le rappel disparaît puis revient après une nouvelle fréquence.
  await rappel(page).getByRole("button", { name: "Plus tard" }).click();
  await expect(rappel(page)).toHaveCount(0);
  await expect(rappel(page)).toBeVisible({ timeout: 8_000 });
  // Le serveur accepte de nouveau : Sauvegarder maintenant → enregistré, rappel effacé, compteur reparti.
  await page.evaluate(() => { window.__banc.refus = null; });
  await rappel(page).getByRole("button", { name: "Sauvegarder maintenant" }).click();
  await expect(page.locator("[data-sauvegarde]")).toContainText("Enregistré à");
  await expect(rappel(page)).toHaveCount(0);
  await page.waitForTimeout(4_500);
  await expect(rappel(page)).toHaveCount(0);
  // Plusieurs modifications avec autosauvegarde qui réussit : jamais de rappel.
  for (const q of ["6", "7", "8"]) { await cellule(page, 0, "quantite").fill(q); await page.keyboard.press("Tab"); await page.waitForTimeout(1_200); }
  await expect(page.locator("[data-sauvegarde]")).toContainText("Enregistré à");
  await page.waitForTimeout(4_000);
  await expect(rappel(page)).toHaveCount(0);
});

test("« Ne plus me le rappeler pour ce devis » : plus jamais sur ce devis ; mobile : même bandeau", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url("?lignes=2&rappel=0.05"));
  await page.evaluate(() => { window.__banc.refus = "Refus simulé du serveur."; });
  // Modifier via le dialogue mobile de la ligne 1.
  await page.locator("ol li button").first().click();
  await page.locator("dialog[open]").getByLabel("Quantité").fill("9");
  await page.locator("dialog[open]").getByRole("button", { name: "Terminé" }).click();
  await expect(rappel(page)).toBeVisible({ timeout: 8_000 });
  await rappel(page).getByRole("button", { name: "Ne plus me le rappeler pour ce devis" }).click();
  await expect(rappel(page)).toHaveCount(0);
  await page.waitForTimeout(5_000);
  await expect(rappel(page)).toHaveCount(0);
});

test("deux onglets : chacun son rappel, aucune écriture provoquée par le rappel lui-même", async ({ context }) => {
  const a = await context.newPage(); const b = await context.newPage();
  await a.goto(url("?lignes=2&rappel=0.05")); await b.goto(url("?lignes=2&rappel=0.05"));
  for (const p of [a, b]) await p.evaluate(() => { window.__banc.refus = "Refus simulé du serveur."; });
  await cellule(a, 0, "quantite").fill("3"); await a.keyboard.press("Tab");
  await expect(rappel(a)).toBeVisible({ timeout: 8_000 });
  await expect(rappel(b)).toHaveCount(0);
  const tb = await tentatives(b);
  await b.waitForTimeout(3_000);
  expect(await tentatives(b)).toBe(tb);
});
