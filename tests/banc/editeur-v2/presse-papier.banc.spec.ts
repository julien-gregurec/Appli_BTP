import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Presse-papier de lignes (GP V1) sur le banc de l'éditeur v2 : sélection, Ctrl+C / Ctrl+V, coexistence
// avec le texte des cellules, deux onglets, ouvrage entier, refus inter-entreprises et document corrompu,
// boutons, position, annulation, 10 / 100 / 500 lignes.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");

const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const grille = (page: Page) => page.locator("[role=grid][aria-label='Lignes du devis']");
const rows = async (page: Page) => Number(await grille(page).getAttribute("aria-rowcount"));
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);
const retour = (page: Page) => page.locator("[data-testid=retour-presse-papier]");
const designations = (page: Page) => page.locator("[data-cellule$=':designation']").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? e.textContent));

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("sélection, Ctrl+C / Ctrl+V dans le même devis : nouvelles clés, ordre, totaux, texte de cellule préservé", async ({ page }) => {
  await page.goto(url("?lignes=10&couts=1"));
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "10");
  const avant = await designations(page);
  // Sélection : clic poignée ligne 2, Maj+clic ligne 4 → 3 lignes.
  await cellule(page, 1, "poignee").click();
  await cellule(page, 3, "poignee").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-testid=selection-lignes]")).toContainText("3 sélectionnées");
  await expect(page.locator("[role=row][aria-selected='true']")).toHaveCount(3);
  // Ctrl+C depuis la poignée (hors champ texte) → « 3 lignes copiées ».
  await page.keyboard.press("ControlOrMeta+c");
  await expect(retour(page)).toContainText("3 lignes copiées");
  const presse = await page.evaluate(() => localStorage.getItem("elsatia.devis.presse-papier.v1") ?? "");
  expect(presse).toContain("elsatia/devis-lines-v1");
  expect(presse).not.toMatch(/"cle":"[0-9a-f-]{36}"/);
  // Ctrl+V sur la dernière ligne : les 3 lignes s'ajoutent après elle.
  await cellule(page, 9, "poignee").click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "13");
  await expect(retour(page)).toContainText("3 lignes ajoutées au devis");
  const apres = await designations(page);
  expect(apres.slice(0, 10)).toEqual(avant);
  expect(apres.slice(10)).toEqual(avant.slice(1, 4));
  // Les lignes collées sont sélectionnées ; « Annuler le collage » les retire.
  await expect(page.locator("[role=row][aria-selected='true']")).toHaveCount(3);
  await page.getByRole("button", { name: "Annuler le collage" }).click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "10");
  // Texte dans une cellule : Ctrl+C / Ctrl+V restent du texte (aucune ligne ajoutée).
  await cellule(page, 0, "designation").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await cellule(page, 1, "designation").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.press("Tab");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "10");
  await expect(cellule(page, 1, "designation")).toHaveValue(avant[0]);
});

test("deux onglets : copie dans A, collage dans B ; refus d'une autre entreprise et d'un document corrompu", async ({ context }) => {
  const a = await context.newPage();
  await a.goto(url("?lignes=5&couts=1"));
  await cellule(a, 0, "poignee").click();
  await cellule(a, 2, "poignee").click({ modifiers: ["Shift"] });
  await a.keyboard.press("ControlOrMeta+c");
  await expect(retour(a)).toContainText("3 lignes copiées");
  const b = await context.newPage();
  await b.goto(url("?lignes=2"));
  await cellule(b, 1, "poignee").click();
  await b.keyboard.press("ControlOrMeta+v");
  await expect(grille(b)).toHaveAttribute("aria-rowcount", "5");
  await expect(retour(b)).toContainText("3 lignes ajoutées");
  // Le même presse-papier se colle plusieurs fois.
  await b.getByRole("button", { name: "Coller" }).click();
  await expect(grille(b)).toHaveAttribute("aria-rowcount", "8");
  // Autre entreprise : presse-papier marqué e-autre → refus, rien créé.
  await b.evaluate(() => { const p = JSON.parse(localStorage.getItem("elsatia.devis.presse-papier.v1")!); p.entrepriseId = "e-autre"; localStorage.setItem("elsatia.devis.presse-papier.v1", JSON.stringify(p)); });
  await b.evaluate(() => navigator.clipboard.writeText(localStorage.getItem("elsatia.devis.presse-papier.v1")!));
  await b.getByRole("button", { name: "Coller" }).click();
  await expect(retour(b)).toContainText("autre entreprise");
  await expect(grille(b)).toHaveAttribute("aria-rowcount", "8");
  // Document corrompu (quantité texte) → refus.
  await b.evaluate(() => { const p = JSON.parse(localStorage.getItem("elsatia.devis.presse-papier.v1")!); p.entrepriseId = "e-banc"; p.elements[0].ligne.quantite = "x"; const t = JSON.stringify(p); localStorage.setItem("elsatia.devis.presse-papier.v1", t); return navigator.clipboard.writeText(t); });
  await b.getByRole("button", { name: "Coller" }).click();
  await expect(retour(b)).toContainText("corrompu");
  await expect(grille(b)).toHaveAttribute("aria-rowcount", "8");
});

test("ouvrage copié entier, remise et sous-total recalculés, sans coût pour un profil sans droit", async ({ page }) => {
  await page.goto(url("?couts=1"));
  // Ouvrage fictif de la bibliothèque du banc via le bouton Ouvrage.
  await page.getByRole("button", { name: /^Ouvrage$/ }).first().click();
  const dlg = page.locator("dialog[open]").last();
  await dlg.locator("#recherche-ouvrage").pressSequentially("PC", { delay: 20 });
  await dlg.locator("li button").first().click();
  await dlg.getByRole("button", { name: /Insérer tout/ }).click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "1");
  await page.getByLabel("Insérer").selectOption("remise");
  await page.getByLabel("Insérer").selectOption("sous_total");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "3");
  await cellule(page, 0, "poignee").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(retour(page)).toContainText("3 lignes copiées");
  const presse = await page.evaluate(() => JSON.parse(localStorage.getItem("elsatia.devis.presse-papier.v1")!));
  expect(presse.elements[0].type).toBe("ouvrage");
  expect(presse.elements[0].instance.lignes.length).toBeGreaterThan(1);
  expect(presse.elements[0].instance.modele.composants.length).toBeGreaterThan(1);
  await cellule(page, 2, "poignee").click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "6");
  const totaux = await page.getByLabel("Totaux").innerText();
  expect(totaux).toContain("Total HT");
  // Profil sans droit : rien de coût dans le presse-papier.
  await page.goto(url());
  await page.getByLabel("Insérer").selectOption("titre");
  await page.getByRole("button", { name: "Coller" }).click();
  await expect(retour(page)).toContainText("ajoutée");
  await cellule(page, 0, "poignee").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  const sansCouts = await page.evaluate(() => localStorage.getItem("elsatia.devis.presse-papier.v1") ?? "");
  expect(sansCouts).not.toMatch(/"prixAchatHt":[0-9]/);
});

test("boutons, position de collage, 100 et 500 lignes", async ({ page }) => {
  await page.goto(url("?lignes=100"));
  await cellule(page, 0, "poignee").click();
  await page.keyboard.press("ControlOrMeta+a");
  const t0 = Date.now();
  await page.getByRole("button", { name: /^Copier/ }).click();
  await expect(retour(page)).toContainText("100 lignes copiées");
  const copie100 = Date.now() - t0;
  await page.getByLabel("Position de collage").selectOption("fin");
  const t1 = Date.now();
  await page.getByRole("button", { name: "Coller" }).click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "200");
  const colle100 = Date.now() - t1;
  console.log(`[perf] copie 100 : ${copie100} ms · collage 100 : ${colle100} ms`);
  await page.goto(url("?lignes=500"));
  await cellule(page, 0, "poignee").click();
  await page.keyboard.press("ControlOrMeta+a");
  const t2 = Date.now();
  await page.getByRole("button", { name: /^Copier/ }).click();
  await expect(retour(page)).toContainText("500 lignes copiées");
  const copie500 = Date.now() - t2;
  await page.getByLabel("Position de collage").selectOption("fin");
  const t3 = Date.now();
  await page.getByRole("button", { name: "Coller" }).click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "1000");
  const colle500 = Date.now() - t3;
  const dom = await page.locator("[data-cellule$=':designation']").count();
  console.log(`[perf] copie 500 : ${copie500} ms · collage 500 : ${colle500} ms · cellules DOM : ${dom}`);
  expect(dom).toBeLessThan(80);
  // Position « avant » : la ligne collée précède la sélection.
  await page.goto(url("?lignes=3"));
  await cellule(page, 2, "poignee").click();
  await page.keyboard.press("ControlOrMeta+c");
  await cellule(page, 0, "poignee").click();
  await page.getByLabel("Position de collage").selectOption("avant");
  await page.getByRole("button", { name: "Coller" }).click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "4");
  const d = await designations(page);
  expect(d[0]).toBe(d[3]);
});

test("une validation de cellule différée (blur) n'écrase pas un collage ni une duplication survenus juste après", async ({ page }) => {
  await page.goto(url("?lignes=3"));
  await cellule(page, 1, "poignee").click();
  await cellule(page, 2, "poignee").click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(retour(page)).toContainText("2 lignes copiées");
  // Saisie dans la désignation de la ligne 1, puis collage immédiat (la validation de la cellule est différée de 120 ms).
  await cellule(page, 0, "designation").click();
  await page.keyboard.type(" modifiée");
  await cellule(page, 2, "poignee").click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "5");
  await page.waitForTimeout(400);
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "5");
  await expect(cellule(page, 0, "designation")).toHaveValue(/ modifiée$/);
  // Même chose avec Ctrl+D depuis une cellule dont la saisie vient d'être quittée.
  await cellule(page, 1, "designation").click();
  await page.keyboard.type(" bis");
  await cellule(page, 3, "designation").click();
  await page.keyboard.press("Control+d");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "6");
  await page.waitForTimeout(400);
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "6");
  await expect(cellule(page, 1, "designation")).toHaveValue(/ bis$/);
});
