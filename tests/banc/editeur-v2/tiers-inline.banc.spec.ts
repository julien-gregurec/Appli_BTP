import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Création client / chantier depuis le devis (GP V1, attente Batappli) : le brouillon n'est jamais perdu,
// le tiers créé est immédiatement affecté, le chantier reprend l'adresse du client.

const dossier = process.env.BANC_EDITEUR_V2;
test.skip(!dossier, "BANC_EDITEUR_V2 non défini : construire le banc d'abord");
const url = (parametres = "") => `${pathToFileURL(path.join(dossier!, "index.html")).href}${parametres}`;
const cellule = (page: Page, i: number, c: string) => page.locator(`[data-cellule='${i}:${c}']`);

test("client inexistant → « + Client » → créé et affecté ; « + Chantier » prérempli ; le brouillon reste intact", async ({ page }) => {
  await page.goto(url("?lignes=2"));
  await cellule(page, 0, "designation").fill("Ligne conservée pendant la création du client");
  await page.keyboard.press("Tab");
  const client = page.getByRole("combobox", { name: "Client", exact: true });
  await client.selectOption("");
  await expect(page.getByRole("button", { name: "+ Chantier" })).toBeDisabled();
  await page.getByRole("button", { name: "+ Client" }).click();
  const dlg = page.locator("[data-testid=dialogue-client-rapide]");
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Type").selectOption("professionnel");
  await dlg.getByLabel("Raison sociale *").fill("Menuiserie Test SARL");
  await dlg.getByLabel("Adresse").fill("4 rue du Banc");
  await dlg.getByLabel("Code postal").fill("67000");
  await dlg.getByLabel("Ville").fill("Strasbourg");
  await dlg.getByLabel("Téléphone").fill("03 88 00 00 00");
  await dlg.getByLabel("SIRET").fill("123 456 789 00012");
  await dlg.getByLabel("Contact (nom)").fill("Mme Test");
  await dlg.getByRole("button", { name: "Créer et affecter au devis" }).click();
  await expect(dlg).toBeHidden();
  await expect(client).toHaveValue("client-banc-1");
  await expect(page.locator("[data-testid=retour-presse-papier]")).toContainText("Client « Menuiserie Test SARL » créé et affecté au devis");
  await expect(cellule(page, 0, "designation")).toHaveValue("Ligne conservée pendant la création du client");
  // Chantier, prérempli avec l'adresse du client, rattaché au devis.
  await page.getByRole("button", { name: "+ Chantier" }).click();
  const dlgCh = page.locator("[data-testid=dialogue-chantier-rapide]");
  await expect(dlgCh).toContainText("Menuiserie Test SARL");
  await expect(dlgCh.getByLabel("Adresse")).toHaveValue("4 rue du Banc");
  await expect(dlgCh.getByLabel("Ville")).toHaveValue("Strasbourg");
  await dlgCh.getByLabel("Nom du chantier *").fill("Atelier — bureaux");
  await dlgCh.getByRole("button", { name: "Créer et rattacher au devis" }).click();
  await expect(dlgCh).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Chantier", exact: true })).toHaveValue("chantier-banc-2");
  await expect(cellule(page, 0, "designation")).toHaveValue("Ligne conservée pendant la création du client");
  // Refus du serveur : message dans le dialogue, rien d'affecté.
  await page.getByRole("button", { name: "+ Client" }).click();
  await dlg.getByLabel("Type").selectOption("professionnel");
  await dlg.getByLabel("Raison sociale *").fill("REFUS");
  await dlg.getByRole("button", { name: "Créer et affecter au devis" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Refus simulé du serveur.");
  await dlg.getByRole("button", { name: "Annuler" }).click();
  await expect(client).toHaveValue("client-banc-1");
});
