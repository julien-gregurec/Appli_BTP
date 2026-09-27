import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 2 : parcours minimal sur une pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS, Tools en `next dev`).
 *
 * Pile : scripts/local-postgres-bootstrap/releve_e2e_stack.sh (voir son en-tête).
 * Sans RELEVE_E2E_BASE_URL, la spec est ignorée : elle ne vise jamais Gestion Pro.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… \
 *   npx playwright test tests/e2e/tools-releve-lot2.spec.ts --project=desktop-chromium
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });
test.skip(!BASE || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");

const suffix = Date.now().toString(36);
const NOM = `Relevé e2e ${suffix}`;
let ficheUrl = "";

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}

test("tenant A : création relevé → bâtiment → étage → pièce, navigation et persistance", async ({ page }) => {
  await signIn(page, EMAIL_A);

  await page.goto(`${BASE}/releves`);
  await page.getByRole("link", { name: "Nouveau relevé" }).click();
  await expect(page.getByRole("heading", { name: "Nouveau relevé" })).toBeVisible();
  await page.getByLabel("Nom du relevé *").fill(NOM);
  await page.getByLabel("Chantier *").fill("Résidence e2e");
  await page.getByLabel("Ville").fill("Strasbourg");
  await page.getByRole("button", { name: "Créer le relevé" }).click();

  await expect(page).toHaveURL(/\/releves\/fiche\?id=[0-9a-f-]{36}/);
  ficheUrl = page.url();
  const chantiers = page.getByRole("region", { name: "Chantiers" });
  await expect(chantiers.getByRole("heading", { name: "Résidence e2e" })).toBeVisible();
  await chantiers.getByRole("link", { name: "Bâtiments, étages, pièces" }).first().click();
  await expect(page).toHaveURL(/\/releves\/structure\?id=/);

  const batiments = page.getByRole("region", { name: "Bâtiments" });
  await batiments.getByLabel("Ajouter un bâtiment").fill("Bâtiment A");
  await batiments.getByRole("button", { name: "Ajouter" }).click();
  await batiments.getByRole("button", { name: "Bâtiment A", exact: true }).click();

  const etages = page.getByRole("region", { name: "Étages" });
  await etages.getByLabel("Ajouter un étage").fill("Rez-de-chaussée");
  await etages.getByLabel("Niveau (0 = RDC)").fill("0");
  await etages.getByRole("button", { name: "Ajouter" }).click();
  await etages.getByRole("button", { name: /^Rez-de-chaussée/ }).click();

  const pieces = page.getByRole("region", { name: "Zones et pièces" });
  await pieces.getByLabel("Ajouter une pièce").fill("Séjour e2e");
  await pieces.getByRole("button", { name: "Ajouter" }).last().click();
  await expect(pieces.getByText("Séjour e2e")).toBeVisible();

  // Persistance : rechargement complet, les données reviennent du serveur.
  await page.reload();
  await expect(page.getByRole("region", { name: "Bâtiments" }).getByRole("button", { name: "Bâtiment A", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Étages" }).getByRole("button", { name: /^Rez-de-chaussée/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Zones et pièces" }).getByText("Séjour e2e")).toBeVisible();

  // Navigation : fil d'Ariane → fiche → liste.
  await page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: NOM }).click();
  await expect(page).toHaveURL(/\/releves\/fiche\?id=/);
  await page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: "Mes relevés" }).click();
  await expect(page.getByRole("region", { name: "Relevés" }).getByRole("heading", { name: NOM })).toBeVisible();
});

test("tenant B : le relevé du tenant A est invisible et inaccessible par URL directe", async ({ page }) => {
  expect(ficheUrl, "le test précédent doit avoir créé le relevé").not.toBe("");
  await signIn(page, EMAIL_B);

  await page.goto(`${BASE}/releves`);
  await expect(page.getByRole("heading", { name: "Mes relevés" }).or(page.getByRole("region", { name: "Relevés" }))).toBeVisible();
  await expect(page.getByText(NOM)).toHaveCount(0);

  await page.goto(ficheUrl);
  await expect(page.getByText(/Relevé introuvable/)).toBeVisible();
  await expect(page.getByText(NOM)).toHaveCount(0);

  await page.goto(ficheUrl.replace("/releves/fiche?", "/releves/structure?"));
  await expect(page.getByText(/Relevé introuvable/)).toBeVisible();
  await expect(page.getByText("Bâtiment A")).toHaveCount(0);
});

for (const [nom, viewport] of [["smartphone", { width: 390, height: 844 }], ["tablette", { width: 820, height: 1180 }]] as const) {
  test(`${nom} : liste, fiche et structure utilisables sans débordement horizontal`, async ({ page }) => {
    expect(ficheUrl, "le premier test doit avoir créé le relevé").not.toBe("");
    await page.setViewportSize(viewport);
    await signIn(page, EMAIL_A);
    const sansDebordement = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

    await page.goto(`${BASE}/releves`);
    await expect(page.getByRole("region", { name: "Relevés" }).getByRole("heading", { name: NOM })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nouveau relevé" })).toBeVisible();
    expect(await sansDebordement()).toBe(true);

    await page.goto(ficheUrl);
    await expect(page.getByRole("region", { name: "Chantiers" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).first()).toBeVisible();
    expect(await sansDebordement()).toBe(true);

    await page.getByRole("region", { name: "Chantiers" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).first().click();
    await page.getByRole("region", { name: "Bâtiments" }).getByRole("button", { name: "Bâtiment A", exact: true }).click();
    await page.getByRole("region", { name: "Étages" }).getByRole("button", { name: /^Rez-de-chaussée/ }).click();
    await expect(page.getByRole("region", { name: "Zones et pièces" }).getByText("Séjour e2e")).toBeVisible();
    expect(await sansDebordement()).toBe(true);
  });
}
