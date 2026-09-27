import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 3 : structure terrain & relevé métier, sur pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS, Tools en `next dev`).
 * Pile : scripts/local-postgres-bootstrap/releve_e2e_stack.sh. Ignorée sans RELEVE_E2E_*.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… \
 *   PW_CHROME_PATH=/opt/pw-browsers/chromium npx playwright test tests/e2e/tools-releve-lot3.spec.ts --project=desktop-chromium
 *
 * Mobile : Chromium en émulation (viewport, `isMobile`, tactile, user-agent) — pas un appareil physique.
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });
test.skip(!BASE || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");
test.setTimeout(90_000);

const suffix = Date.now().toString(36);
const NOM = `Résidence Tilleuls ${suffix}`;
let ficheUrl = ""; let structureUrl = ""; let pieceUrl = "";

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("workflow complet : relevé → chantier → bâtiment → étages libres → zone → pièces → fiche pièce, persistance", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves`);
  await page.getByRole("link", { name: "Nouveau relevé" }).click();
  await page.getByLabel("Nom du relevé *").fill(NOM);
  await page.getByLabel("Référence").fill(`REL-${suffix}`);
  await page.getByLabel("Client").fill("SCI Tilleuls");
  await page.getByLabel("Date du relevé").fill("2026-09-28");
  await page.getByLabel("Chantier *").fill("Site Tilleuls");
  await page.getByLabel("Adresse").fill("3 rue des Lilas");
  await page.getByLabel("Code postal").fill("68000");
  await page.getByLabel("Ville").fill("Colmar");
  await page.getByRole("button", { name: "Créer le relevé" }).click();
  await expect(page).toHaveURL(/\/releves\/fiche\?id=/);
  ficheUrl = page.url();

  // Chantier : champs métier pré-remplis, description enregistrée automatiquement (pas de bouton).
  const chantier = page.getByRole("article", { name: "Chantier Site Tilleuls" });
  await expect(chantier.getByLabel("Client")).toHaveValue("SCI Tilleuls");
  await expect(chantier.getByLabel("Référence")).toHaveValue(`REL-${suffix}`);
  await expect(chantier.getByLabel("Date")).toHaveValue("2026-09-28");
  await chantier.getByLabel("Description").fill("Relevé avant rénovation");
  await chantier.getByLabel("Statut").selectOption("en_cours");
  await expect(chantier.getByRole("status", { name: /Chantier Site Tilleuls : Enregistré/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article", { name: "Chantier Site Tilleuls" }).getByLabel("Description")).toHaveValue("Relevé avant rénovation");

  await page.getByRole("article", { name: "Chantier Site Tilleuls" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).click();
  await expect(page).toHaveURL(/\/releves\/structure\?id=/);
  const batiments = page.getByRole("region", { name: "Bâtiments" });
  await batiments.getByLabel("Ajouter un bâtiment").fill("Bâtiment A");
  await batiments.getByRole("button", { name: "Ajouter", exact: true }).click();
  await batiments.getByRole("button", { name: "Bâtiment A", exact: true }).click();

  const etages = page.getByRole("region", { name: "Étages" });
  for (const [nom, niveau, type] of [["RDC", "0", ""], ["R+1", "1", ""], ["Combles", "", "combles"]] as const) {
    await etages.getByLabel("Ajouter un étage").fill(nom);
    if (type) await etages.getByLabel("Type de niveau").selectOption(type);
    await etages.getByLabel("Niveau (0 = RDC)").fill(niveau);
    await etages.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(etages.getByRole("button", { name: new RegExp(`^${nom.replace("+", "\\+")}`) })).toBeVisible();
  }
  // Combles sans niveau : libellé de catégorie, en haut de la pile.
  await expect(etages.getByRole("button", { name: "Combles Combles" })).toBeVisible();
  await etages.getByRole("button", { name: /^R\+1/ }).click();

  const pieces = page.getByRole("region", { name: "Zones et pièces" });
  await pieces.getByLabel("Ajouter une zone (facultatif)").fill("Appartement 12");
  await pieces.getByLabel("Type de zone").selectOption("appartement");
  await pieces.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await expect(pieces.getByRole("heading", { name: /Appartement 12/ })).toBeVisible();
  for (const [nom, type, zone] of [["Séjour", "sejour", "Appartement 12"], ["Chambre", "chambre", "Appartement 12"], ["Palier", "circulation", ""]] as const) {
    await pieces.getByLabel("Ajouter une pièce").fill(nom);
    await pieces.getByRole("combobox", { name: "Type", exact: true }).selectOption(type);
    await pieces.getByRole("combobox", { name: "Zone", exact: true }).selectOption(zone ? { label: zone } : { value: "" });
    await pieces.getByRole("button", { name: "Ajouter", exact: true }).last().click();
    await expect(pieces.getByRole("link", { name: new RegExp(`^${nom}`) })).toBeVisible();
  }
  structureUrl = page.url();

  await pieces.getByRole("link", { name: /^Séjour/ }).click();
  await expect(page).toHaveURL(/\/releves\/piece\?id=.*&piece=/);
  pieceUrl = page.url();
  const crumbs = page.getByRole("navigation", { name: "Fil d'Ariane" });
  await expect(crumbs).toContainText(NOM);
  await expect(crumbs).toContainText("Bâtiment A");
  await expect(crumbs).toContainText("R+1");
  await expect(crumbs).toContainText("Appartement 12");
  await expect(crumbs.locator("[aria-current=location]")).toHaveText("Séjour");
  const identite = page.getByRole("region", { name: "Identité de la pièce" });
  await identite.getByLabel("Hauteur sous plafond (cm)").fill("250");
  await identite.getByText("En cours", { exact: true }).click();
  await identite.getByLabel("Commentaire").fill("Parquet ancien à conserver");
  await page.getByRole("region", { name: "Métré préparé" }).getByLabel("Surface déclarée (m²)").fill("24,5");
  await expect(page.getByTestId("volume")).toHaveText("61,25 m³");
  await page.getByRole("region", { name: "Métré préparé" }).getByLabel("Surface déclarée (m²)").blur();
  await expect(page.getByRole("status", { name: "Fiche pièce : Enregistré" })).toBeVisible();

  await page.reload();
  const reloaded = page.getByRole("region", { name: "Identité de la pièce" });
  await expect(reloaded.getByLabel("Hauteur sous plafond (cm)")).toHaveValue("250");
  await expect(reloaded.getByLabel("Commentaire")).toHaveValue("Parquet ancien à conserver");
  await expect(reloaded.getByRole("radio", { name: "En cours" })).toBeChecked();
  await expect(page.getByRole("region", { name: "Métré préparé" }).getByLabel("Surface déclarée (m²)")).toHaveValue("24,5");
  await expect(page.getByTestId("volume")).toHaveText("61,25 m³");
});

test("ordre, duplication, suppression contrôlée, corbeille, historique", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(structureUrl);
  const batiments = page.getByRole("region", { name: "Bâtiments" });
  await batiments.getByRole("button", { name: "Bâtiment A", exact: true }).click();
  await batiments.getByLabel("Nom du bâtiment Bâtiment A").fill("Bâtiment Nord");
  await expect(batiments.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
  await expect(batiments.getByRole("button", { name: "Bâtiment Nord", exact: true })).toBeVisible();
  await batiments.getByRole("button", { name: "Dupliquer" }).click();
  await expect(batiments.getByRole("button", { name: "Bâtiment Nord (copie)", exact: true })).toBeVisible();
  await batiments.getByRole("button", { name: "Bâtiment Nord (copie)", exact: true }).click();
  await batiments.getByRole("button", { name: "Monter Bâtiment Nord (copie)" }).click();
  await expect(batiments.locator("[aria-current=true]").first()).toContainText("Bâtiment Nord (copie)");
  await expect(batiments.getByRole("button", { name: /^Bâtiment Nord/ }).first()).toHaveText("Bâtiment Nord (copie)");
  // La copie reprend étages et pièces, pas les saisies (statut remis « à relever »).
  const etages = page.getByRole("region", { name: "Étages" });
  await expect(etages.getByRole("button", { name: /^Combles/ })).toBeVisible();
  page.once("dialog", (dialog) => { expect(dialog.message()).toMatch(/3 étage\(s\).*3 pièce\(s\)/); void dialog.accept(); });
  await batiments.getByRole("button", { name: "Supprimer" }).click();
  await expect(batiments.getByRole("button", { name: "Bâtiment Nord (copie)", exact: true })).toHaveCount(0);

  await page.goto(ficheUrl);
  const corbeille = page.getByRole("list", { name: "Corbeille" });
  await expect(corbeille).toContainText("Bâtiment Nord (copie)");
  await corbeille.getByRole("button", { name: "Restaurer" }).click();
  await expect(page.getByText("Rien à restaurer.")).toBeVisible();
  const historique = page.getByRole("list", { name: "Historique" });
  for (const action of ["Renommage", "Duplication", "Suppression", "Restauration", "Réordonnancement", "Création"]) await expect(historique).toContainText(action);
});

test("concurrence : deux onglets, aucune écriture écrasée en silence", async ({ page, context }) => {
  await signIn(page, EMAIL_A);
  const other = await context.newPage();
  await page.goto(pieceUrl); await other.goto(pieceUrl);
  await page.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Nom").fill("Séjour double");
  await page.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Nom").blur();
  await expect(page.getByRole("status", { name: "Fiche pièce : Enregistré" })).toBeVisible();
  // Second onglet, révision périmée : conflit signalé, rien n'est écrasé.
  await other.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Commentaire").fill("Écrasement tenté");
  await other.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Commentaire").blur();
  await expect(other.getByRole("status", { name: /Modifié ailleurs/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Nom")).toHaveValue("Séjour double");
  await expect(page.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Commentaire")).toHaveValue("Parquet ancien à conserver");
  await other.getByRole("button", { name: "Recharger" }).click();
  await expect(other.getByRole("region", { name: "Identité de la pièce" }).getByLabel("Nom")).toHaveValue("Séjour double");
  await other.close();
});

test("recherche : pièce, bâtiment, filtres ; version INITIALE figée", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves`);
  await page.getByLabel("Rechercher un chantier, un bâtiment, une pièce").fill("Séjour double");
  const resultats = page.getByRole("region", { name: "Résultats" });
  // Base partagée entre exécutions : on ne regarde que les résultats de CE relevé.
  const ofThis = (titre: string) => resultats.getByRole("article").filter({ hasText: NOM }).filter({ has: page.getByRole("heading", { name: titre, exact: true }) });
  await expect(ofThis("Séjour double")).toHaveCount(1);
  await page.getByLabel("Rechercher un chantier, un bâtiment, une pièce").fill("Bâtiment Nord");
  await expect(resultats.getByRole("heading", { name: "Bâtiment Nord (copie)" }).first()).toBeVisible();
  await page.getByLabel("Rechercher un chantier, un bâtiment, une pièce").fill(suffix);
  await expect(ofThis(NOM)).toHaveCount(1);
  await page.getByRole("radio", { name: "Archivés" }).click();
  await expect(ofThis(NOM)).toHaveCount(0);
  await page.getByRole("radio", { name: "Récents" }).click();
  await expect(ofThis(NOM)).toHaveCount(1);
  await page.getByLabel("Rechercher un chantier, un bâtiment, une pièce").fill("Séjour double");
  await ofThis("Séjour double").getByRole("link", { name: "Ouvrir" }).click();
  await expect(page).toHaveURL(/\/releves\/piece\?/);

  await page.goto(ficheUrl);
  const versions = page.getByRole("region", { name: "Versions" });
  await versions.getByRole("button", { name: "Figer une version" }).click();
  await expect(versions.getByText(/V1 · Initiale/)).toBeVisible();
  await expect(versions.getByLabel("Type de version").locator("option")).toHaveText(["Corrigée", "Projetée", "Tel que construit"]);
});

test("tenant B : relevé, structure, fiche pièce et recherche du tenant A inaccessibles", async ({ page }) => {
  await signIn(page, EMAIL_B);
  for (const url of [ficheUrl, structureUrl, pieceUrl]) {
    await page.goto(url);
    await expect(page.getByText(/introuvable/i).first()).toBeVisible();
    await expect(page.getByText("Séjour double")).toHaveCount(0);
  }
  await page.goto(`${BASE}/releves`);
  await page.getByLabel("Rechercher un chantier, un bâtiment, une pièce").fill("Séjour");
  await expect(page.getByRole("region", { name: "Résultats" }).getByText("Aucun résultat.")).toBeVisible();
});

const PROFILES: Array<[string, BrowserContextOptions]> = [
  ["iPhone-like", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
  ["Android-like", { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" }],
  ["tablette", { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
];

for (const [nom, profile] of PROFILES) {
  test(`@responsive ${nom} : un niveau à la fois, fil d'Ariane permanent, cibles tactiles, sans débordement`, async ({ browser }) => {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    try {
      await signIn(page, EMAIL_A);
      await page.goto(ficheUrl);
      await page.getByRole("article", { name: "Chantier Site Tilleuls" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).tap();
      const batiments = page.getByRole("region", { name: "Bâtiments" });
      await expect(batiments).toBeVisible();
      await expect(page.getByRole("region", { name: "Étages" })).toBeHidden();
      expect(await sansDebordement(page)).toBe(true);
      const button = await batiments.getByRole("button", { name: "Bâtiment Nord", exact: true }).boundingBox();
      expect(button!.height).toBeGreaterThanOrEqual(44);
      await batiments.getByRole("button", { name: "Bâtiment Nord", exact: true }).tap();
      await expect(page.getByRole("region", { name: "Étages" })).toBeVisible();
      await expect(batiments).toBeHidden();
      await page.getByRole("region", { name: "Étages" }).getByRole("button", { name: /^R\+1/ }).tap();
      const pieces = page.getByRole("region", { name: "Zones et pièces" });
      await expect(pieces.getByRole("link", { name: /^Séjour double/ })).toBeVisible();
      expect(await sansDebordement(page)).toBe(true);
      // Remonter par le fil d'Ariane (toujours visible, même après défilement).
      await page.mouse.wheel(0, 2000);
      const crumbs = page.getByRole("navigation", { name: "Fil d'Ariane" });
      await expect(crumbs).toBeInViewport();
      await crumbs.getByRole("button", { name: "Bâtiment Nord" }).tap();
      await expect(page.getByRole("region", { name: "Étages" })).toBeVisible();
      await page.getByRole("region", { name: "Étages" }).getByRole("button", { name: /^R\+1/ }).tap();
      await pieces.getByRole("link", { name: /^Séjour double/ }).tap();
      await expect(page.getByRole("region", { name: "Identité de la pièce" })).toBeVisible();
      for (const radio of await page.locator("fieldset label").all()) expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await sansDebordement(page)).toBe(true);
    } finally {
      await context.close();
    }
  });
}
