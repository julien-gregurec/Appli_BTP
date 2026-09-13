import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Autosauvegarde (GP V1) : un brouillon invalide affiche son motif au lieu de se taire ; après une erreur
// du serveur, aucune nouvelle tentative automatique tant que rien ne change ; la modification suivante relance.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");

const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);
const statut = (page: Page) => page.locator("[data-sauvegarde]");
const tentatives = (page: Page) => page.evaluate(() => window.__banc.tentatives);

test("brouillon invalide : le motif est affiché, rien ne part, la correction relance l'autosauvegarde", async ({ page }) => {
  await page.goto(url("?lignes=2"));
  // Désignation effacée sur la ligne 1 : brouillon invalide.
  await cellule(page, 0, "designation").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Tab");
  await expect(statut(page)).toContainText("Non enregistré — Chaque ligne doit porter une désignation.", { timeout: 6_000 });
  await page.waitForTimeout(4_500);
  expect(await tentatives(page)).toBe(0);
  // Correction : l'autosauvegarde repart et aboutit.
  await cellule(page, 0, "designation").click();
  await page.keyboard.type("Ligne corrigée");
  await page.keyboard.press("Tab");
  await expect(statut(page)).toContainText("Enregistré à", { timeout: 8_000 });
  expect(await tentatives(page)).toBe(1);
});

test("erreur du serveur : une seule tentative, motif affiché, la modification suivante réessaie", async ({ page }) => {
  await page.goto(url("?lignes=2"));
  await page.evaluate(() => { window.__banc.refus = "Refus simulé du serveur."; });
  await cellule(page, 0, "quantite").fill("7");
  await page.keyboard.press("Tab");
  await expect(statut(page)).toContainText("Non enregistré — Refus simulé du serveur.", { timeout: 8_000 });
  const t1 = await tentatives(page);
  expect(t1).toBe(1);
  await page.waitForTimeout(5_000);
  expect(await tentatives(page)).toBe(1);
  // Le serveur répond de nouveau ; la modification suivante efface l'erreur et enregistre.
  await page.evaluate(() => { window.__banc.refus = null; });
  await cellule(page, 0, "quantite").fill("8");
  await page.keyboard.press("Tab");
  await expect(statut(page)).toContainText("Enregistré à", { timeout: 8_000 });
  expect(await tentatives(page)).toBe(2);
});
