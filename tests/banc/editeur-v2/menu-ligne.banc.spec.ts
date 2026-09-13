import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Menu contextuel de ligne (GP V1, attente Batappli) : clic droit ou bouton ⋯ → insérer au-dessus / en
// dessous, dupliquer, copier, transformer, supprimer ; barre d'outils « Ajouter ▾ » et « Dupliquer ».

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");
const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const grille = (page: Page) => page.locator("[role=grid][aria-label='Lignes du devis']");
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);
const designations = (page: Page) => page.locator("[data-cellule$=':designation']").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? e.textContent));
const menu = (page: Page) => page.locator("[data-testid=menu-contextuel]");

test("clic droit : insérer au-dessus / en dessous, dupliquer, transformer en titre, supprimer ; bouton ⋯ ; Ajouter ▾ ; Dupliquer", async ({ page }) => {
  await page.goto(url("?lignes=3"));
  const avant = await designations(page);
  // Clic droit sur la ligne 2 → menu → dupliquer.
  await cellule(page, 1, "quantite").click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await menu(page).locator('[role=menuitem][data-cle="dupliquer"]').click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "4");
  expect((await designations(page))[2]).toBe(avant[1]);
  // Bouton ⋯ de la ligne 1 → insérer un titre au-dessus.
  await cellule(page, 0, "menu").click();
  await expect(menu(page)).toBeVisible();
  await menu(page).locator('[role=menuitem][data-cle="titre-dessus"]').click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "5");
  await expect(cellule(page, 0, "type")).toHaveValue("titre");
  // Transformer la ligne 2 (ancienne ligne 1) en commentaire.
  await cellule(page, 1, "menu").click();
  await menu(page).locator('[role=menuitem][data-cle="type-commentaire"]').click();
  await expect(cellule(page, 1, "type")).toHaveValue("commentaire");
  // Insérer en dessous puis supprimer.
  await cellule(page, 4, "menu").click();
  await menu(page).locator('[role=menuitem][data-cle="dessous"]').click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "6");
  await cellule(page, 5, "menu").click();
  await menu(page).locator('[role=menuitem][data-cle="supprimer"]').click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "5");
  // Échap ferme le menu sans rien faire.
  await cellule(page, 2, "menu").click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "5");
  // Barre d'outils : Ajouter ▾ (sous-total) et Dupliquer (sélection de 2 lignes).
  await page.getByTestId("menu-ajouter").click();
  await page.locator('[role=menuitem][data-cle="sous_total"]').click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "6");
  await cellule(page, 2, "poignee").click();
  await cellule(page, 3, "poignee").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Dupliquer" }).click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "8");
  await expect(page.locator("[data-testid=retour-presse-papier]")).toContainText("2 lignes dupliquées");
});
