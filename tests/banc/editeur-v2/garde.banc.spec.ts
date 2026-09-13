import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Garde « modifications non enregistrées » (GP V1) : quitter avec un brouillon modifié propose Enregistrer et
// quitter / Quitter sans enregistrer / Annuler ; un brouillon enregistré part sans question.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");
const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);
const navigations = (page: Page) => page.evaluate(() => window.__navigations);
const enregistrements = (page: Page) => page.evaluate(() => window.__banc.enregistrements.length);

test("retour avec modifications : Annuler reste, Quitter sans enregistrer part, Enregistrer et quitter sauvegarde puis part", async ({ page }) => {
  await page.goto(url("?lignes=1"));
  // Sans modification : le retour part directement.
  await page.getByTestId("retour-devis").click();
  expect(await navigations(page)).toEqual(["/devis"]);
  // Modification non enregistrée (l'autosauvegarde attend 2 s) : la garde s'interpose.
  await cellule(page, 0, "quantite").fill("9");
  await page.keyboard.press("Tab");
  await page.getByTestId("retour-devis").click();
  const garde = page.getByTestId("garde-modifications");
  await expect(garde).toBeVisible();
  await expect(garde).toContainText("Des modifications ne sont pas enregistrées.");
  await garde.getByRole("button", { name: "Annuler" }).click();
  await expect(garde).toBeHidden();
  expect(await navigations(page)).toEqual(["/devis"]);
  // Un lien interne (barre latérale, fil d'Ariane…) est intercepté de la même façon.
  await page.evaluate(() => { const a = document.createElement("a"); a.href = "/clients"; a.textContent = "Clients (test)"; a.id = "lien-test"; document.body.appendChild(a); });
  await page.locator("#lien-test").click();
  await expect(garde).toBeVisible();
  await garde.getByRole("button", { name: "Quitter sans enregistrer" }).click();
  expect(await navigations(page)).toEqual(["/devis", "/clients"]);
  // Enregistrer et quitter : une sauvegarde puis la navigation.
  await cellule(page, 0, "quantite").fill("11");
  await page.keyboard.press("Tab");
  const avant = await enregistrements(page);
  await page.getByTestId("retour-devis").click();
  await garde.getByRole("button", { name: "Enregistrer et quitter" }).click();
  await expect.poll(() => navigations(page)).toEqual(["/devis", "/clients", "/devis"]);
  expect(await enregistrements(page)).toBe(avant + 1);
});
