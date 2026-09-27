import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 3 : structure terrain et relevé métier, sur la pile
 * RÉELLE (GoTrue + PostgREST + PostgreSQL avec la vraie RLS et la migration 701, Tools en
 * `next dev`). Même pile et mêmes variables que la spec Lot 2 :
 *
 *   scripts/local-postgres-bootstrap/releve_e2e_stack.sh
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… \
 *   npx playwright test tests/e2e/tools-releve-lot3.spec.ts --project=desktop-chromium
 *
 * Sans RELEVE_E2E_BASE_URL, la spec est ignorée : elle ne vise jamais Gestion Pro.
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });
test.skip(!BASE || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");

const suffix = Date.now().toString(36);
const NOM = `Relevé Lot3 ${suffix}`;
const PIECE = `Bureau 12 ${suffix}`;
let ficheUrl = "";
let pieceUrl = "";

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}

const saved = (page: Page, label: string) => expect(page.getByRole("status", { name: `État de sauvegarde — ${label}` })).toContainText("Enregistré");

test("parcours terrain : projet → chantier → bâtiment → étage → zone → pièce, édition, rechargement", async ({ page }) => {
  await signIn(page, EMAIL_A);

  // Projet
  await page.goto(`${BASE}/releves`);
  await page.getByRole("link", { name: "Nouveau relevé" }).click();
  await page.getByLabel("Nom du relevé *").fill(NOM);
  await page.getByLabel("Client").fill("SCI Tilleuls");
  await page.getByLabel("Chantier *").fill("Résidence Lot3");
  await page.getByLabel("Ville").fill("Strasbourg");
  await page.getByRole("button", { name: "Créer le relevé" }).click();
  await expect(page).toHaveURL(/\/releves\/fiche\?id=[0-9a-f-]{36}/);
  ficheUrl = page.url();

  // Chantier : fiche complète en sauvegarde automatique
  const chantiers = page.getByRole("region", { name: "Chantiers" });
  await chantiers.getByText("Informations du chantier Résidence Lot3").click();
  await chantiers.getByLabel("Référence").fill("CH-LOT3");
  await chantiers.getByLabel("Code postal").fill("67000");
  await chantiers.getByLabel("Description").fill("Réhabilitation complète");
  await chantiers.getByLabel("Statut").selectOption("a_relever");
  await saved(page, "chantier");
  await expect(chantiers.getByText("À relever · 0 bâtiment(s) · CH-LOT3")).toBeVisible();

  // Bâtiment, étage (ajout rapide), zone, pièce
  await chantiers.getByRole("link", { name: "Bâtiments, étages, pièces" }).first().click();
  const batiments = page.getByRole("region", { name: "Bâtiments" });
  await batiments.getByLabel("Ajouter un bâtiment").fill("Bâtiment A");
  await batiments.getByRole("button", { name: "Ajouter" }).click();
  await batiments.getByRole("button", { name: "Bâtiment A", exact: true }).click();

  const etages = page.getByRole("region", { name: "Étages" });
  await etages.getByRole("button", { name: "+ RDC" }).click();
  await expect(etages.getByRole("button", { name: "RDC", exact: true })).toBeVisible();
  await etages.getByRole("button", { name: "+ R+1" }).click();
  await etages.getByRole("button", { name: "R+1", exact: true }).click();

  const pieces = page.getByRole("region", { name: "Zones et pièces" });
  await pieces.getByLabel("Ajouter une zone (facultatif)").fill("Zone Est");
  await pieces.getByLabel("Type de zone").selectOption("aile");
  await pieces.getByRole("button", { name: "Ajouter" }).first().click();
  await expect(pieces.getByText("Aile · 0 pièce(s)")).toBeVisible();
  await pieces.getByLabel("Ajouter une pièce").fill(PIECE);
  await pieces.getByLabel("Type de pièce").selectOption("bureau");
  await pieces.getByRole("combobox", { name: /^Zone/ }).selectOption({ label: "Zone Est" });
  await pieces.getByRole("button", { name: "Ajouter" }).last().click();
  await expect(pieces.getByText("Aile · 1 pièce(s)")).toBeVisible();

  // Propriétés d'étage en sauvegarde automatique
  await pieces.getByText("Propriétés de l'étage").click();
  await pieces.getByLabel("Hauteur sous plafond (cm)").fill("250");
  await pieces.getByLabel("Hauteur sous plafond (cm)").blur();
  await saved(page, "étage");

  // Fiche pièce : fil d'Ariane complet, édition sans bouton « Enregistrer »
  await pieces.getByRole("link", { name: `Ouvrir la fiche ${PIECE}` }).click();
  await expect(page).toHaveURL(/\/releves\/piece\?id=[0-9a-f-]{36}&piece=[0-9a-f-]{36}/);
  pieceUrl = page.url();
  await expect(page.getByRole("navigation", { name: "Fil d'Ariane" })).toContainText(`${NOM}›Résidence Lot3›Bâtiment A›R+1›Zone Est›${PIECE}`.replace(/›/g, ""), { useInnerText: false });
  const fiche = page.getByRole("region", { name: "Informations de la pièce" });
  await fiche.getByLabel("Statut").selectOption("en_cours");
  await fiche.getByLabel("Hauteur sous plafond (cm)").fill("247,5");
  await fiche.getByLabel("Commentaire").fill("Fissure mur nord");
  await fiche.getByLabel("Commentaire").blur();
  await saved(page, "pièce");
  await expect(page.getByRole("region", { name: "Métré calculé" })).toContainText("Surface—");

  // Rechargement : tout revient du serveur
  await page.reload();
  const recharge = page.getByRole("region", { name: "Informations de la pièce" });
  await expect(recharge.getByLabel("Statut")).toHaveValue("en_cours");
  await expect(recharge.getByLabel("Hauteur sous plafond (cm)")).toHaveValue("247.5");
  await expect(recharge.getByLabel("Commentaire")).toHaveValue("Fissure mur nord");
  await expect(page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: "Zone Est" })).toBeVisible();

  // Retour à l'étage par la barre du pouce
  await page.getByRole("navigation", { name: "Navigation entre pièces" }).getByRole("link", { name: "R+1" }).click();
  await expect(page.getByRole("region", { name: "Zones et pièces" }).getByText(PIECE)).toBeVisible();
});

test("duplication, réordonnancement, suppression maîtrisée et restauration", async ({ page }) => {
  expect(ficheUrl).not.toBe("");
  await signIn(page, EMAIL_A);
  await page.goto(ficheUrl);
  await page.getByRole("region", { name: "Chantiers" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).first().click();
  const batiments = page.getByRole("region", { name: "Bâtiments" });

  // Dupliquer le bâtiment : structure copiée, jamais de photo ni de mesure
  await batiments.getByRole("button", { name: "Actions Bâtiment A" }).click();
  await batiments.getByRole("button", { name: "Dupliquer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copie créée (structure seule : ni photo ni mesure)." })).toBeVisible();
  await expect(batiments.getByRole("button", { name: "Bâtiment A (copie)", exact: true })).toBeVisible();

  // Réordonner : la copie monte en premier, identifiants inchangés
  await batiments.getByRole("button", { name: "Actions Bâtiment A (copie)" }).click();
  await batiments.getByRole("button", { name: "Monter" }).click();
  await expect(batiments.locator("[data-kind=batiment]").first()).toContainText("Bâtiment A (copie)");
  await page.reload();
  await expect(page.getByRole("region", { name: "Bâtiments" }).locator("[data-kind=batiment]").first()).toContainText("Bâtiment A (copie)");

  // Retirer avec confirmation explicite (impact annoncé), puis restaurer depuis la fiche
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.accept(); });
  const batimentsApres = page.getByRole("region", { name: "Bâtiments" });
  await batimentsApres.getByRole("button", { name: "Actions Bâtiment A (copie)" }).click();
  await batimentsApres.getByRole("button", { name: "Retirer" }).click();
  await expect(batimentsApres.getByRole("button", { name: "Bâtiment A (copie)", exact: true })).toHaveCount(0);
  expect(dialogs[0]).toContain("Retirer le bâtiment « Bâtiment A (copie) » ?");
  expect(dialogs[0]).toContain("2 étage(s), 1 zone(s), 1 pièce(s)");
  expect(dialogs[0]).toContain("restaurable");

  await page.goto(ficheUrl);
  const corbeille = page.getByRole("region", { name: "Corbeille du relevé" });
  await expect(corbeille.getByText("Bâtiment A (copie)")).toBeVisible();
  await corbeille.getByRole("button", { name: "Restaurer" }).click();
  await expect(corbeille.getByText("Aucun élément retiré.")).toBeVisible();

  // Activité : création, duplication, nouvel ordre, suppression, restauration
  const activite = page.getByRole("region", { name: "Activité" });
  for (const action of ["Création", "Duplication", "Nouvel ordre", "Suppression", "Restauration"]) await expect(activite.getByText(action, { exact: true }).first()).toBeVisible();

  // Version INITIALE
  const versions = page.getByRole("region", { name: "Versions" });
  await versions.getByRole("button", { name: "Figer la version initiale" }).click();
  await expect(versions.getByText("V1 · Initiale")).toBeVisible();
  await expect(versions.getByLabel("Type de version")).toContainText("Corrigée");
});

test("deux onglets : un conflit de modification n'écrase rien silencieusement", async ({ browser }) => {
  expect(pieceUrl).not.toBe("");
  const context = await browser.newContext();
  const tab1 = await context.newPage();
  await signIn(tab1, EMAIL_A);
  const tab2 = await context.newPage();
  await tab1.goto(pieceUrl); await tab2.goto(pieceUrl);
  const form1 = tab1.getByRole("region", { name: "Informations de la pièce" });
  const form2 = tab2.getByRole("region", { name: "Informations de la pièce" });
  await expect(form2.getByLabel("Commentaire")).toHaveValue("Fissure mur nord");

  await form1.getByLabel("Commentaire").fill("Onglet 1 : reprise enduit");
  await form1.getByLabel("Commentaire").blur();
  await saved(tab1, "pièce");

  await form2.getByLabel("Commentaire").fill("Onglet 2 : autre constat");
  await form2.getByLabel("Commentaire").blur();
  const status2 = tab2.getByRole("status", { name: "État de sauvegarde — pièce" });
  await expect(status2).toContainText("Modifié ailleurs entre-temps : rien n'a été écrasé.");

  // Le serveur a gardé la saisie de l'onglet 1.
  await tab1.reload();
  await expect(tab1.getByRole("region", { name: "Informations de la pièce" }).getByLabel("Commentaire")).toHaveValue("Onglet 1 : reprise enduit");

  // L'onglet 2 choisit explicitement de recharger la version à jour.
  await status2.getByRole("button", { name: "Recharger la version à jour" }).click();
  await expect(tab2.getByRole("region", { name: "Informations de la pièce" }).getByLabel("Commentaire")).toHaveValue("Onglet 1 : reprise enduit");
  await context.close();
});

test("recherche et filtres de la liste", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves`);
  await page.getByLabel("Rechercher").fill(PIECE.toUpperCase());
  const resultats = page.getByRole("region", { name: "Résultats de recherche" });
  await expect(resultats.getByRole("link", { name: new RegExp(PIECE) }).first()).toBeVisible();
  await resultats.getByRole("link", { name: new RegExp(PIECE) }).first().click();
  await expect(page).toHaveURL(/\/releves\/piece\?/);

  await page.goto(`${BASE}/releves`);
  await page.getByLabel("Rechercher").fill("CH-LOT3");
  await expect(page.getByRole("region", { name: "Résultats de recherche" }).getByRole("link", { name: `Chantier Résidence Lot3 · ${NOM}` })).toBeVisible();
  await page.getByLabel("Rechercher").fill("");

  const liste = page.getByRole("region", { name: "Relevés" });
  const filtres = page.getByRole("group", { name: "Filtres" });
  await expect(liste.getByRole("heading", { name: NOM })).toBeVisible();
  await filtres.getByRole("button", { name: "Récents" }).click();
  await expect(liste.getByRole("heading", { name: NOM })).toBeVisible();
  await filtres.getByRole("button", { name: "Archivés" }).click();
  await expect(liste.getByRole("heading", { name: NOM })).toHaveCount(0);
  await filtres.getByRole("button", { name: "Corbeille" }).click();
  await expect(liste.getByRole("heading", { name: NOM })).toHaveCount(0);
});

test("autre tenant : relevé, pièce et recherche inaccessibles", async ({ page }) => {
  expect(pieceUrl).not.toBe("");
  await signIn(page, EMAIL_B);
  await page.goto(`${BASE}/releves`);
  await page.getByLabel("Rechercher").fill(PIECE);
  await expect(page.getByRole("region", { name: "Résultats de recherche" }).getByText("Aucun chantier, bâtiment ni pièce ne correspond.")).toBeVisible();
  await expect(page.getByText(NOM)).toHaveCount(0);

  await page.goto(pieceUrl);
  await expect(page.getByText(/introuvable/)).toBeVisible();
  await expect(page.getByText(PIECE)).toHaveCount(0);
  await expect(page.getByText("Fissure")).toHaveCount(0);

  await page.goto(ficheUrl);
  await expect(page.getByText(/Relevé introuvable/)).toBeVisible();
});

test("smartphone : navigation en profondeur, gros boutons, barre du pouce, sans débordement", async ({ browser }) => {
  expect(ficheUrl).not.toBe("");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await signIn(page, EMAIL_A);
  const sansDebordement = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await page.goto(ficheUrl);
  await page.getByRole("region", { name: "Chantiers" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).first().click();
  // Une seule colonne à la fois : Bâtiments, puis Étages, puis Pièces.
  await expect(page.getByRole("region", { name: "Bâtiments" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Étages" })).toBeHidden();
  const ajouter = page.getByRole("button", { name: "+ Bâtiment" });
  await expect(ajouter).toBeVisible();
  const box = await ajouter.boundingBox();
  expect(box && box.height >= 48 && box.y > 844 / 2).toBe(true);
  expect(await sansDebordement()).toBe(true);

  await page.getByRole("region", { name: "Bâtiments" }).getByRole("button", { name: "Bâtiment A", exact: true }).click();
  await expect(page.getByRole("region", { name: "Bâtiments" })).toBeHidden();
  await page.getByRole("region", { name: "Étages" }).getByRole("button", { name: "R+1", exact: true }).click();
  const pieces = page.getByRole("region", { name: "Zones et pièces" });
  await expect(pieces.getByText(PIECE)).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Pièce" })).toBeVisible();
  expect(await sansDebordement()).toBe(true);
  await pieces.getByRole("button", { name: "‹ Étages" }).click();
  await expect(page.getByRole("region", { name: "Étages" })).toBeVisible();

  await page.goto(pieceUrl);
  await expect(page.getByRole("navigation", { name: "Navigation entre pièces" })).toBeVisible();
  expect(await sansDebordement()).toBe(true);
  await context.close();
});
