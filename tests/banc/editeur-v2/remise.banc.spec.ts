import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Remises (GP V1) : l'interface refuse ce que la base refusera (0 à 100 %), avec un message, au clavier
// comme au collage de texte ; la remise fixe en euros n'est pas plafonnée à 100.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");

const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);
const retour = (page: Page) => page.locator("[data-testid=retour-presse-papier]");
const totalHt = async (page: Page) => (await page.getByLabel("Totaux").innerText()).match(/Total HT\s+([\d\s  ,]+)€/)?.[1]?.replace(/[\s  ]/g, "") ?? "?";

async function saisirRemise(page: Page, texte: string) {
  await cellule(page, 0, "remise").click();
  await page.keyboard.press("ControlOrMeta+a");
  if (texte) await page.keyboard.type(texte); else await page.keyboard.press("Backspace");
  await page.keyboard.press("Tab");
}

test("remise de ligne : 0, 0,01, 50, 99,99 et 100 acceptées ; 100,01, 101, négatif, texte et collage « 150 » refusés avec message, valeur rétablie", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await page.goto(url("?lignes=1"));
  await cellule(page, 0, "quantite").fill("1"); await page.keyboard.press("Tab");
  await cellule(page, 0, "prix_vente").fill("1000"); await page.keyboard.press("Tab");
  await expect.poll(() => totalHt(page)).toBe("1000,00");
  for (const [saisie, attenduHt, affiche] of [["0", "1000,00", "0"], ["0,01", "999,90", "0,01"], ["50", "500,00", "50"], ["99,99", "0,10", "99,99"], ["100", "0,00", "100"]] as const) {
    await saisirRemise(page, saisie);
    await expect.poll(() => totalHt(page)).toBe(attenduHt);
    await expect(cellule(page, 0, "remise")).toHaveValue(affiche);
  }
  // Remise à 50 % puis saisies refusées : le total et la cellule restent à 50.
  await saisirRemise(page, "50");
  await expect.poll(() => totalHt(page)).toBe("500,00");
  for (const [saisie, motif] of [["100,01", "dépasser 100 %"], ["101", "dépasser 100 %"], ["-5", "négative"], ["abc", "n’est pas un pourcentage"]] as const) {
    await saisirRemise(page, saisie);
    await expect(retour(page)).toContainText(motif);
    await expect(retour(page)).toHaveAttribute("data-genre", "erreur");
    expect(await totalHt(page)).toBe("500,00");
    await expect(cellule(page, 0, "remise")).toHaveValue("50");
    await retour(page).getByRole("button", { name: "Fermer ce message" }).click();
  }
  // Collage de texte « 150 » dans la cellule (Ctrl+V, presse-papier système du banc alimenté par Ctrl+C dans une autre cellule) : même refus.
  await cellule(page, 0, "unite").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("150");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("Escape");
  await cellule(page, 0, "remise").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(cellule(page, 0, "remise")).toHaveValue("150");
  await page.keyboard.press("Tab");
  await expect(retour(page)).toContainText("dépasser 100 %");
  expect(await totalHt(page)).toBe("500,00");
  await expect(cellule(page, 0, "remise")).toHaveValue("50");
});

test("remise de section : « 150 % » refusée, « 12,5 % » acceptée ; remise fixe « 250 » = −250 € sans plafond ; remise globale 101 refusée", async ({ page }) => {
  await page.goto(url("?lignes=2"));
  await cellule(page, 0, "quantite").fill("1"); await page.keyboard.press("Tab");
  await cellule(page, 0, "prix_vente").fill("1000"); await page.keyboard.press("Tab");
  await cellule(page, 1, "quantite").fill("1"); await page.keyboard.press("Tab");
  await cellule(page, 1, "prix_vente").fill("1000"); await page.keyboard.press("Tab");
  await expect.poll(() => totalHt(page)).toBe("2000,00");
  await page.getByTestId("menu-ajouter").click(); await page.locator('[role=menuitem][data-cle="remise"]').click();
  const remise = page.locator("[data-cellule='2:prix_vente']");
  await expect(remise).toBeVisible();
  await remise.fill("150 %"); await page.keyboard.press("Tab");
  await expect(retour(page)).toContainText("dépasser 100 %");
  expect(await totalHt(page)).toBe("2000,00");
  await retour(page).getByRole("button", { name: "Fermer ce message" }).click();
  await remise.fill("12,5 %"); await page.keyboard.press("Tab");
  await expect.poll(() => totalHt(page)).toBe("1750,00");
  // Remise fixe : montant en euros, négatif, non plafonné à 100.
  await remise.fill("250"); await page.keyboard.press("Tab");
  await expect.poll(() => totalHt(page)).toBe("1750,00");
  await expect(page.locator("[data-cellule='2:prix_vente']")).toHaveValue("-250");
  await page.locator("[data-cellule='2:prix_vente']").fill("abc"); await page.keyboard.press("Tab");
  await expect(retour(page)).toContainText("n’est pas un montant");
  expect(await totalHt(page)).toBe("1750,00");
  await retour(page).getByRole("button", { name: "Fermer ce message" }).click();
  // Remise globale (en-tête) : 101 refusée, 10 acceptée.
  const globale = page.getByLabel("Remise globale (%)");
  await globale.click();
  await globale.pressSequentially("101");
  await expect(retour(page)).toContainText("dépasser 100 %");
  await expect(globale).toHaveValue("10");
  await expect.poll(() => totalHt(page)).toBe("1575,00");
});
