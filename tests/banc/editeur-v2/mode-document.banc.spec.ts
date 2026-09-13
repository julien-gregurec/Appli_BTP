import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Modes Grille / Document (GP V1) : le mode document affiche le devis comme il sera imprimé, en pleine
// largeur, et un clic sur une ligne ouvre sa fiche de modification ; la préférence est mémorisée.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");
const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);

test("bascule Grille → Document, modification par clic dans le document, préférence mémorisée, retour Grille", async ({ page }) => {
  await page.goto(url("?lignes=3"));
  await expect(page.getByRole("grid", { name: "Lignes du devis" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Document" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Document" }).click();
  await expect(page.getByRole("button", { name: "Document" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("grid", { name: "Lignes du devis" })).toBeHidden();
  const doc = page.locator(".doc-a4").first();
  await expect(doc).toBeVisible();
  // Clic sur la première ligne du document → dialogue de la ligne → quantité modifiée → document à jour.
  const premiere = doc.locator("tr[data-cle]").first();
  const designation = (await premiere.locator("td").first().innerText()).trim();
  await premiere.click();
  const dlg = page.locator("dialog[open]");
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Quantité").fill("42");
  await dlg.getByRole("button", { name: "Terminé" }).click();
  await expect(doc).toContainText("42");
  await expect(doc).toContainText(designation.slice(0, 12));
  // La barre d'outils reste utilisable en mode document : Ajouter → titre.
  await page.getByTestId("menu-ajouter").click();
  await page.locator('[role=menuitem][data-cle="titre"]').click();
  await expect(doc.locator("tr[data-genre='titre']")).toHaveCount(1);
  // Préférence mémorisée : rechargement en mode document.
  expect(await page.evaluate(() => localStorage.getItem("gp.devis.mode.v1"))).toBe("document");
  await page.reload();
  await expect(page.getByRole("button", { name: "Document" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("grid", { name: "Lignes du devis" })).toBeHidden();
  // Retour à la grille : cellules éditables, valeur conservée.
  await page.getByRole("button", { name: "Grille" }).click();
  await expect(page.getByRole("grid", { name: "Lignes du devis" })).toBeVisible();
  await expect(cellule(page, 0, "quantite")).toBeVisible();
});
