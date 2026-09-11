import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Recette de l'éditeur v2 dans un vrai navigateur, sur le banc (actions serveur simulées, données
// fictives). Couvre : clavier, sélection multiple, article déjà présent, archivé, code-barres,
// ouvrage, modes de présentation, prix global, aperçu en direct, focus, clic sur l'aperçu, filigrane,
// enregistrement, droits sur les coûts, responsive et cibles tactiles.

const dossier = process.env.BANC_EDITEUR_V2;
const captures = process.env.BANC_CAPTURES;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");

const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const apercu = (page: Page) => page.locator(".doc-a4");
const dialogue = (page: Page) => page.locator("dialog[open]");
const capture = async (page: Page, nom: string, pleinePage = true) => {
  if (captures) await page.screenshot({ path: path.join(captures, `${nom}.png`), fullPage: pleinePage });
};
const actif = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("id") ?? document.activeElement?.tagName ?? "");

async function ajouterAuClavier(page: Page, recherche: string, choix: Array<{ fleches: number; quantite: string }>) {
  await page.keyboard.press("Control+k");
  await expect(dialogue(page)).toBeVisible();
  await expect.poll(() => actif(page)).toBe("recherche-articles");
  await page.keyboard.type(recherche);
  await expect(page.locator("#resultats-articles [role=option]").first()).toBeVisible();
  for (const c of choix) {
    for (let i = 0; i < Math.abs(c.fleches); i += 1) await page.keyboard.press(c.fleches > 0 ? "ArrowDown" : "ArrowUp");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("li")?.textContent ?? "")).not.toBe("");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(c.quantite);
    await page.keyboard.press("Enter");
    await expect.poll(() => actif(page)).toBe("recherche-articles");
  }
}

test("7–9. clavier, sélection multiple, classement, quantités différentes, article déjà présent", async ({ page }) => {
  await page.goto(url());
  await expect(apercu(page)).toBeVisible();

  await ajouterAuClavier(page, "BA13-200", []);
  const options = page.locator("#resultats-articles [role=option]");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Réf. interne exacte");
  await expect(options.nth(1)).toContainText("Réf. interne exacte");
  await expect(options.nth(2)).toContainText("Réf. fabricant exacte");
  await expect(options.nth(2)).toContainText("Rail métallique 48");

  // À rang égal, l'ordre alphabétique départage : « Plaque BA13 hydro » puis « Plaque de plâtre ».
  await expect(options.nth(0)).toContainText("Plaque BA13 hydro (fictif)");
  await expect(options.nth(1)).toContainText("Plaque de plâtre BA13 (fictif)");

  // Deux articles de même référence : choisis tous les deux, chacun avec sa quantité, sans souris.
  // La quantité reçoit le focus ET une sélection complète : taper la remplace directement.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.type("12");
  await page.keyboard.press("Enter");
  await expect.poll(() => actif(page)).toBe("recherche-articles");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await capture(page, "selection-multiple-1440", false);
  await page.keyboard.press("Control+Enter");
  await expect(dialogue(page)).toHaveCount(0);

  await expect(apercu(page)).toContainText("Plaque BA13 hydro (fictif)");
  await expect(apercu(page)).toContainText("Plaque de plâtre BA13 (fictif)");
  await expect(page.getByLabel("Totaux")).toContainText("312,00"); // plâtre 12 × 20 + hydro 3 × 24

  // Le même article, à nouveau : une décision explicite est exigée.
  await ajouterAuClavier(page, "BA13-200", [{ fleches: 0, quantite: "1" }]);
  await page.keyboard.press("Control+Enter");
  await expect(dialogue(page)).toContainText("déjà dans le devis");
  await dialogue(page).getByLabel("Additionner la quantité").check();
  await dialogue(page).getByRole("button", { name: "Confirmer l’ajout" }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.getByLabel("Totaux")).toContainText("336,00"); // + 1 hydro × 24, sans nouvelle ligne
  await expect(page.locator("ol[aria-label='Lignes et ouvrages du devis'] > li")).toHaveCount(2);
});

test("5, 10. code-barres exact et article archivé à confirmer", async ({ page }) => {
  await page.goto(url());
  await ajouterAuClavier(page, "3760123456789", []);
  await expect(page.locator("#resultats-articles [role=option]").first()).toContainText("Code-barres");
  await page.keyboard.press("Escape");

  await ajouterAuClavier(page, "RAIL-OLD", [{ fleches: 0, quantite: "2" }]);
  await page.keyboard.press("Control+Enter");
  await expect(dialogue(page).getByRole("alert")).toContainText("archivé");
  await dialogue(page).getByLabel("Article archivé : je confirme vouloir l’ajouter").check();
  await dialogue(page).getByRole("button", { name: /Ajouter l’article au devis/ }).click();
  await expect(apercu(page)).toContainText("Ancien rail (fictif)");
});

test("16, 19–23. ouvrage PC-001 : insertion, vue regroupée puis éclatée, prix global, enregistrement", async ({ page }) => {
  await page.goto(url());
  await page.getByRole("button", { name: "Insérer un ouvrage" }).click();
  await dialogue(page).getByLabel(/Référence, nom, catégorie/).fill("PC-001");
  await dialogue(page).getByRole("button", { name: /Plancher chauffant/ }).click();
  await dialogue(page).getByLabel(/^Quantité \(m²\)/).fill("120");
  await dialogue(page).getByText("à saisir").locator("input").fill("44");
  await dialogue(page).getByText("à saisir").locator("input").blur();
  await expect(dialogue(page)).toContainText("Montant HT de l’ouvrage");
  await capture(page, "insertion-ouvrage-1440", false);
  await dialogue(page).getByRole("button", { name: "Insérer tout l’ouvrage" }).click();

  // 19. Regroupée : une seule ligne client, quantité principale et montant global.
  await expect(apercu(page)).toContainText("Plancher chauffant");
  await expect(apercu(page)).toContainText("120 m²");
  await expect(apercu(page)).not.toContainText("Isolant à plots");
  await expect(page.getByLabel("Totaux")).toContainText("8 360,00");

  // 21. Éclatée : chaque composant chiffré.
  await page.locator("ol[aria-label='Lignes et ouvrages du devis'] select").filter({ hasText: "Regroupée" }).selectOption("eclate");
  await expect(apercu(page)).toContainText("Isolant à plots (fictif)");
  await expect(apercu(page)).toContainText("2 730,00");

  // 23. Prix global par ajustement : l'écart apparaît tel quel, le total tombe juste.
  await page.getByRole("button", { name: "Prix global…" }).click();
  await dialogue(page).getByLabel("Nouveau prix global HT").fill("8000");
  await dialogue(page).getByRole("button", { name: "Voir le résultat" }).click();
  await dialogue(page).getByRole("button", { name: "Appliquer ce prix" }).click();
  await expect(apercu(page)).toContainText("Ajustement du prix de l’ouvrage");
  await expect(page.getByLabel("Totaux")).toContainText("8 000,00");
  await capture(page, "editeur-ouvrage-eclate-1440", false);

  // Enregistrement : l'appel contient l'ouvrage, ses lignes, et aucun coût sans droit.
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.evaluate(() => window.__banc.enregistrements.length)).toBe(1);
  const appel = await page.evaluate(() => window.__banc.enregistrements[0].payload);
  expect(appel.p_ouvrages).toHaveLength(1);
  expect(appel.p_lignes.filter((l: { ouvrage_cle: string | null }) => l.ouvrage_cle).length).toBeGreaterThan(5);
  expect(appel.p_couts).toEqual([]);
  expect(await page.evaluate(() => window.__navigations)).toEqual(["/devis/devis-banc"]);
});

test("11, 24. coûts et marges : visibles pour l'éditeur autorisé, absents de l'aperçu, transmis à l'enregistrement", async ({ page }) => {
  await page.goto(url("?couts=1"));
  await ajouterAuClavier(page, "POSE", [{ fleches: 0, quantite: "10" }]);
  await expect(dialogue(page)).toContainText("achat 32,00");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText(/achat 32,00/)).toBeVisible();
  await expect(apercu(page)).not.toContainText("32,00");
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.evaluate(() => window.__banc.enregistrements.length)).toBe(1);
  const appel = await page.evaluate(() => window.__banc.enregistrements[0].payload);
  expect(appel.p_couts).toEqual([expect.objectContaining({ prix_achat_ht: 32 })]);
});

test("27. l'aperçu suit la saisie sans voler le focus ; un clic sur l'aperçu ouvre la ligne", async ({ page }) => {
  await page.goto(url());
  await page.getByRole("button", { name: "Ligne libre" }).click();
  const designation = page.getByLabel("Désignation").first();
  await designation.click();
  await page.keyboard.type("Nettoyage de fin de chantier (fictif)");
  await expect(designation).toBeFocused();
  await expect(apercu(page)).toContainText("Nettoyage de fin de chantier (fictif)");
  await expect(designation).toBeFocused();

  await page.getByLabel("Désignation").first().evaluate((e) => (e as HTMLElement).blur());
  await apercu(page).getByText("Nettoyage de fin de chantier (fictif)").click();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[id^=el-]"))).toBe(true);
});

test("30–31. filigrane BROUILLON par défaut, désactivable pour ce devis", async ({ page }) => {
  await page.goto(url());
  await expect(apercu(page).locator("[data-testid=filigrane]").first()).toContainText("BROUILLON");
  await page.getByRole("radiogroup", { name: /Filigrane de ce devis/ }).getByLabel("Aucun").check();
  await expect(apercu(page).locator("[data-testid=filigrane]")).toHaveCount(0);
});

for (const largeur of [375, 390, 430, 768, 1024, 1440]) {
  test(`40. responsive ${largeur} px : aucun débordement horizontal, onglets sous 1024 px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: largeur < 768 ? 812 : 1000 });
    await page.goto(url());
    await page.getByRole("button", { name: "Ligne libre" }).click();
    await page.getByLabel("Désignation").first().fill("Ligne fictive de recette responsive");
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(1);
    const onglets = page.getByRole("tablist", { name: "Affichage" });
    if (largeur < 1024) {
      await expect(onglets).toBeVisible();
      await capture(page, `editeur-saisie-${largeur}`);
      await onglets.getByRole("tab", { name: "Aperçu du document" }).click();
      await expect(apercu(page)).toBeVisible();
      await capture(page, `editeur-apercu-${largeur}`);
    } else {
      await expect(onglets).toBeHidden();
      await expect(apercu(page)).toBeVisible();
      await capture(page, `editeur-${largeur}`, false);
    }
  });
}

test("41–42. mobile 375 px : dialogue plein écran et cibles tactiles d'au moins 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url());
  await page.getByRole("button", { name: /Ajouter des articles/ }).click();
  await page.locator("#recherche-articles").fill("BA13");
  await expect(page.locator("#resultats-articles [role=option]").first()).toBeVisible();
  await page.locator("#resultats-articles [role=option]").first().click();
  const petites = await dialogue(page).evaluate((d) =>
    [...d.querySelectorAll<HTMLElement>("button, input:not([type=checkbox]):not([type=radio]), select, [role=option]")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ texte: (e.getAttribute("aria-label") ?? e.textContent ?? e.tagName).trim().slice(0, 40), h: e.getBoundingClientRect().height }))
      .filter((e) => e.h < 43.5));
  expect(petites).toEqual([]);
  const largeurDialogue = await dialogue(page).evaluate((d) => d.getBoundingClientRect().width);
  expect(largeurDialogue).toBeGreaterThanOrEqual(374);
  await capture(page, "selection-mobile-375", false);
});
