import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 — recette navigateur des pages lourdes et des PDF sur la
 * fixture de capacité (scripts/perf/generate_fixture.sql + semaine d'affectations), servie par
 * `next start` (build de production) devant la pile Supabase locale (GoTrue + PostgREST réels).
 * Vérifie que les réductions de poids n'ont retiré AUCUNE fonctionnalité : pagination des alertes
 * jusqu'au bout, ignorer / rétablir, formulaire d'édition d'affectation et lots, validation d'un
 * pointage par l'action unique, pagination des anciennes saisies, PDF et file saturée.
 *
 * Opt-in (jeu de données dédié) :
 *   E2E_CAPACITE=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/gp-heavy-pages-capacity.spec.ts --project=desktop-chromium
 */
test.skip(process.env.E2E_CAPACITE !== "1", "recette de capacité : E2E_CAPACITE=1 et fixture de capacité requis");
test.describe.configure({ mode: "serial" });

const COMPTE = process.env.E2E_CAPACITE_COMPTE ?? "fixture.principale.1@perf.invalid";
const MOT_DE_PASSE = process.env.E2E_CAPACITE_MOT_DE_PASSE ?? "PiloteTest!2026";

async function connexion(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(COMPTE);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => { await connexion(page); });

test("dashboard : résumé exact, première page, « Afficher plus », ignorer puis rétablir", async ({ page }) => {
  const centre = page.locator("section", { has: page.getByRole("heading", { name: "Centre d’alertes opérationnelles" }) });
  await expect(centre).toBeVisible();
  const compteur = centre.getByText(/^\d+ affichées? sur \d+$/);
  await expect(compteur).toHaveText(/^30 affichées sur \d+$/);
  const total = Number((await compteur.textContent())!.match(/sur (\d+)/)![1]);
  expect(total).toBeGreaterThan(1000);
  const critiques = Number((await centre.getByText(/^\d+ critiques?$/).textContent())!.match(/\d+/)![0]);
  const aAnticiper = Number((await centre.getByText(/^\d+ à anticiper$/).textContent())!.match(/\d+/)![0]);
  expect(critiques + aAnticiper).toBe(total);
  await expect(centre.getByRole("link", { name: "Ouvrir et traiter" })).toHaveCount(30);

  await centre.getByRole("button", { name: /Afficher 30 de plus/ }).click();
  await expect(compteur).toHaveText(`60 affichées sur ${total}`);
  await expect(centre.getByRole("link", { name: "Ouvrir et traiter" })).toHaveCount(60);

  // Ignorer la 45e alerte (chargée à la demande) : elle disparaît, le total baisse de 1.
  // Identifiée par son lien (les titres de la fixture ne sont pas uniques).
  const cible = centre.locator("article").nth(44);
  const href = (await cible.getByRole("link", { name: "Ouvrir et traiter" }).getAttribute("href"))!;
  expect(href).toMatch(/^\/(factures|devis)\/[0-9a-f-]{36}$/);
  const lienCible = centre.locator(`article a[href="${href}"]`);
  await expect(lienCible).toHaveCount(1);
  await cible.getByRole("button", { name: "Ignorer" }).click();
  await expect(lienCible).toHaveCount(0);
  await expect(compteur).toHaveText(new RegExp(`^\\d+ affichées sur ${total - 1}$`));

  // Rétablir depuis la liste des ignorées (chargée à la demande).
  await centre.getByRole("button", { name: /ignorées? · Afficher/ }).click();
  const ignoree = centre.locator("div.flex-wrap", { has: page.locator(`a[href="${href}"]`) }).filter({ has: page.getByRole("button", { name: "Rétablir" }) });
  await ignoree.getByRole("button", { name: "Rétablir" }).click();
  await expect(compteur).toHaveText(new RegExp(`^\\d+ affichées sur ${total}$`));
  await expect(lienCible).toHaveCount(1);
});

test("dashboard : poids borné (≤ 30 alertes rendues côté serveur)", async ({ page }) => {
  const html = await (await page.request.get("/dashboard")).text();
  expect((html.match(/Ouvrir et traiter/g) ?? []).length).toBe(30);
  expect(html.length).toBeLessThan(600_000);
});

test("planning : création groupée, formulaire « Modifier » à la demande, lot, enregistrement, suppression", async ({ page }) => {
  await page.goto("/planning");
  expect(await page.locator("select[name=chantier_id]").count()).toBe(0); // aucun formulaire d'édition rendu tant que fermé
  // Saisie groupée (3 ouvriers, même moment, même activité) : crée un lot de 3 affectations.
  const marque = `Recette capacité ${Date.now()}`;
  const creation = page.locator("form", { has: page.getByRole("button", { name: "Ajouter au planning" }) });
  await creation.locator("select[name=type_activite]").selectOption("formation");
  await creation.locator("input[name=lieu_activite]").fill("Centre de formation");
  await creation.locator("input[name=tache]").fill(marque);
  const ouvriers = creation.locator("input[name=employe_ids]");
  for (const i of [0, 1, 2]) await ouvriers.nth(i).check();
  await creation.getByRole("button", { name: "Ajouter au planning" }).click();
  const cartes = page.locator("table td div.relative").filter({ hasText: marque });
  await expect(cartes).toHaveCount(3);
  await expect(page.locator("section[id^=jour-] article").filter({ hasText: marque })).toHaveCount(3);

  // « Modifier » : formulaire rendu à l'ouverture, avec toutes les listes et les 2 autres du lot.
  const carte = cartes.first();
  await carte.getByText("Modifier", { exact: true }).click();
  const formulaire = carte.locator("form").filter({ has: page.locator("select[name=chantier_id]") });
  await expect(formulaire).toBeVisible();
  await expect(formulaire.locator("input[name=affectation_id]")).toHaveCount(1);
  expect(await formulaire.locator("select[name=chantier_id] option").count()).toBeGreaterThan(100);
  await expect(formulaire.locator("select[name=type_activite] option")).toHaveCount(7);
  await expect(formulaire.locator("select[name=type_activite]")).toHaveValue("formation");
  await expect(formulaire.locator("input[name=ids_supplementaires]")).toHaveCount(2);

  // Enregistrement via l'action unique, appliqué aussi aux deux autres du lot (cases cochées).
  await formulaire.locator("input[name=tache]").fill(`${marque} modifiée`);
  for (const i of [0, 1]) await formulaire.locator("input[name=ids_supplementaires]").nth(i).check();
  await formulaire.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/planning\?semaine=/);
  const modifiees = page.locator("table td div.relative").filter({ hasText: `${marque} modifiée` });
  await expect(modifiees).toHaveCount(3);

  // Suppression (confirmation) : remise en état.
  page.on("dialog", (dialogue) => dialogue.accept());
  for (let restantes = 3; restantes > 0; restantes--) {
    await modifiees.first().getByRole("button", { name: "×" }).click();
    await expect(modifiees).toHaveCount(restantes - 1);
  }
});

test("planning : vue mobile rendue depuis les mêmes données @responsive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planning");
  const jours = page.locator("nav[aria-label='Jours de la semaine'] a");
  await expect(jours).toHaveCount(7);
  const articles = page.locator("section[id^=jour-] article");
  expect(await articles.count()).toBe(await page.locator("table td div.relative").count());
});

test("pointage/gestion : action unique de validation, anciennes saisies paginées", async ({ page }) => {
  await page.goto("/pointage/gestion?mois=2026-09");
  const anciennes = page.locator("details", { hasText: "Anciennes saisies d’heures" });
  const total = Number((await anciennes.locator("summary").textContent())!.match(/\((\d+)\)/)![1]);
  // Train V9 : pagination servie en base (lib/pointages-gestion, 50 par page, compteur exact).
  expect(total).toBeGreaterThan(50);
  const pages = Math.ceil(total / 50);
  await anciennes.locator("summary").click();
  await expect(anciennes.locator("article")).toHaveCount(50);
  await expect(anciennes.getByText(`Page 1 sur ${pages}`)).toBeVisible();
  await anciennes.getByRole("link", { name: "Page suivante →" }).click();
  await expect(page).toHaveURL(/anciens=2/);
  const page2 = page.locator("details", { hasText: "Anciennes saisies d’heures" });
  await expect(page2).toHaveAttribute("open", "");
  await expect(page2.getByText(`Page 2 sur ${pages}`)).toBeVisible();
  // Aucune action liée chiffrée dans la page.
  expect((await page.content()).includes("$ACTION_REF_")).toBe(false);
  // Validation d'un pointage via l'action unique (champs cachés).
  const article = page2.locator("article").first();
  await expect(article.locator("input[name=pointage_id]").first()).toHaveAttribute("value", /^[0-9a-f-]{36}$/);
  await article.getByRole("button", { name: "Valider" }).click();
  await expect(page).toHaveURL(/\/pointage\?mois=2026-09&succes=validation/);
});

test("PDF : document produit, rafale bornée (200 ou 503 + Retry-After), aucun Chromium restant", async ({ page }) => {
  const request = page.request;
  await page.goto("/devis");
  const lien = page.locator("a[href^='/devis/']").filter({ hasText: /\S/ }).nth(2);
  const id = (await lien.getAttribute("href"))!.split("/")[2];
  const unique = await request.get(`/api/documents/devis/${id}/pdf`);
  expect(unique.status()).toBe(200);
  expect(unique.headers()["content-type"]).toBe("application/pdf");
  expect((await unique.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const rafale = await Promise.all(Array.from({ length: 16 }, () => request.get(`/api/documents/devis/${id}/pdf`, { timeout: 90_000 })));
  const statuts = rafale.map((r) => r.status());
  expect(statuts.every((s) => s === 200 || s === 503)).toBe(true);
  expect(statuts.filter((s) => s === 200).length).toBeGreaterThanOrEqual(2);
  for (const r of rafale.filter((x) => x.status() === 503)) expect(r.headers()["retry-after"]).toBe("10");

  // Plus aucun Chromium de génération après la rafale (même machine que le serveur).
  await expect.poll(() => readdirSync("/proc").filter((p) => /^\d+$/.test(p)).filter((p) => {
    try { return readFileSync(`/proc/${p}/cmdline`, "utf8").includes("--elsatia-pdf-proprietaire="); } catch { return false; }
  }).length, { timeout: 10_000 }).toBe(0);
});
