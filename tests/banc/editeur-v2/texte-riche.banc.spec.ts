import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Texte riche (GP V1) : gras / italique / souligné / couleur posés depuis la barre sur la sélection d'une
// désignation, rendus dans l'aperçu A4 (même composant que l'impression et le PDF), jamais de HTML.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");
const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);

test("gras, souligné, italique, couleur accent : éditeur → aperçu A4 ; HTML saisi rendu en texte", async ({ page }) => {
  await page.goto(url("?lignes=1"));
  const d = cellule(page, 0, "designation");
  await d.fill("Cloison vitrée bord à bord avec porte toute hauteur");
  const selectionner = async (debut: number, fin: number) => { await d.focus(); await d.evaluate((el, r) => (el as HTMLInputElement).setSelectionRange(r[0], r[1]), [debut, fin]); };
  await expect(page.locator("[data-testid=barre-formatage]")).toHaveAttribute("data-actif", "1");
  await selectionner(0, 14);
  await page.getByRole("button", { name: "Gras" }).click();
  await expect(d).toHaveValue("[b]Cloison vitrée[/b] bord à bord avec porte toute hauteur");
  // « porte toute hauteur » souligné (positions après l'ajout des balises).
  const v1 = await d.inputValue();
  await selectionner(v1.indexOf("porte"), v1.length);
  await page.getByRole("button", { name: "Souligné" }).click();
  const v2 = await d.inputValue();
  expect(v2).toBe("[b]Cloison vitrée[/b] bord à bord avec [u]porte toute hauteur[/u]");
  // « bord à bord » en italique via Ctrl+I, « avec » en couleur accent.
  await selectionner(v2.indexOf("bord à bord"), v2.indexOf("bord à bord") + 11);
  await page.keyboard.press("ControlOrMeta+i");
  const v3 = await d.inputValue();
  expect(v3).toContain("[i]bord à bord[/i]");
  await selectionner(v3.indexOf("avec"), v3.indexOf("avec") + 4);
  await page.getByLabel("Couleur du texte").selectOption("accent");
  const v4 = await d.inputValue();
  expect(v4).toContain("[c=accent]avec[/c]");
  await page.keyboard.press("Tab");
  // Aperçu A4 : spans stylés, aucune balise visible, aucun HTML interprété.
  const apercu = page.getByRole("button", { name: "Aperçu A4" });
  if (await apercu.isVisible()) await apercu.click();
  const doc = page.locator(".doc-a4").first();
  await expect(doc).toBeVisible();
  await expect(doc.locator("span[style*='font-weight: 700']").filter({ hasText: "Cloison vitrée" })).toHaveCount(1);
  await expect(doc.locator("span[style*='underline']").filter({ hasText: "porte toute hauteur" })).toHaveCount(1);
  await expect(doc.locator("span[style*='italic']").filter({ hasText: "bord à bord" })).toHaveCount(1);
  await expect(doc.locator("span[style*='--doc-accent']").filter({ hasText: "avec" })).toHaveCount(1);
  await expect(doc).not.toContainText("[b]");
  // Une saisie HTML reste du texte.
  await d.fill("<b>pas du HTML</b> [b]gras[/b]");
  await page.keyboard.press("Tab");
  await expect(doc).toContainText("<b>pas du HTML</b>");
  await expect(doc.locator("b")).toHaveCount(0);
  // Aucune sélection : message, rien n'est modifié.
  await d.focus(); await d.evaluate((el) => (el as HTMLInputElement).setSelectionRange(2, 2));
  await page.getByRole("button", { name: "Gras" }).click();
  await expect(page.locator("[data-testid=retour-presse-papier]")).toContainText("Sélectionnez d’abord le texte");
});
