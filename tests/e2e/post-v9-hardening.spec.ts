import { spawnSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";

/*
 * ELSATIA POST-V9 HARDENING V1 — recette navigateur.
 *
 *   Lot C : sortie de l'onboarding bloquant (utilisateur authentifié sans entreprise).
 *   Lot D : V9-01, champs datetime-local saisis dans le fuseau du NAVIGATEUR (émulé par
 *           Playwright : Europe/Paris, UTC, Asia/Tokyo, America/New_York), serveur en UTC.
 *           Écrans actifs du produit : habilitations plateforme (origine de V9-01) et
 *           e-mails de chantier. CRM (BETA) et appels d'offres (DISABLED) ne sont pas servis
 *           en V3 : couverts par Vitest seulement.
 *   Lot E : V9-02, « Sans date de fin » sur une habilitation (création, modification,
 *           suppression, réouverture, expiration).
 *
 * Pile : tests/e2e/post-v9-pile-locale (PostgreSQL 16 + train complet, VRAI PostgREST,
 * passerelle locale pour l'auth, AAL2 simulé pour plateforme@pv9.invalid), Gestion Pro
 * compilé (`next build` + `next start -p 3100`, TZ=UTC). Décor : preparer-base.sh.
 */
const BASE = process.env.PV9_E2E_DB ?? "pv9_e2e";
const MDP = "test";

function psql(requete: string) {
  if (!/^[a-z0-9_]+$/.test(BASE)) throw new Error("PV9_E2E_DB invalide");
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -A -t -v ON_ERROR_STOP=1 -d ${BASE}`], { input: requete, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
test.beforeEach(() => { psql("truncate rate_limits_applicatifs;"); });

async function connecter(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

const ENTREPRISE_A = () => psql("select id from entreprises where nom = 'PV9 Entreprise A';");

// ─────────────────────────────────────────────────────────────────────────────
// Lot C — onboarding bloquant
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Lot C — sortie de l'onboarding bloquant", () => {
  test("la sortie est présente, sans aucune donnée d'organisation", async ({ page }) => {
    await connecter(page, "sans-entreprise@pv9.invalid");
    await expect(page).toHaveURL(/\/onboarding$/);
    const sortie = page.getByRole("navigation", { name: "Quitter la configuration du compte" });
    await expect(sortie.getByRole("button", { name: /Retour à l’accueil/ })).toBeVisible();
    await expect(sortie.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    const texte = await page.locator("body").innerText();
    expect(texte).not.toContain("PV9 Tenant Secret B");
    expect(texte).not.toContain("PV9 Entreprise A");
  });

  test("« Se déconnecter » : logout réel, aucune boucle", async ({ page }) => {
    await connecter(page, "sans-entreprise@pv9.invalid");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL(/\/login$/);
    // Session réellement fermée : une route authentifiée renvoie à la connexion.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("« Retour à l'accueil » au clavier : déconnexion puis accueil public, sans boucle", async ({ page }) => {
    await connecter(page, "sans-entreprise@pv9.invalid");
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.locator("body").focus();
    let atteint = false;
    for (let i = 0; i < 15 && !atteint; i++) {
      await page.keyboard.press("Tab");
      atteint = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "onboarding-retour-accueil");
    }
    expect(atteint, "le bouton est atteignable au clavier").toBe(true);
    // Anneau de focus visible (focus-visible).
    const anneau = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
    expect(anneau).not.toBe("none");
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("mobile : boutons visibles, cibles ≥ 44 px, pas de défilement horizontal", async ({ browser }) => {
    const contexte = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await contexte.newPage();
    await connecter(page, "sans-entreprise@pv9.invalid");
    for (const nom of [/Retour à l’accueil/, /^Se déconnecter$/]) {
      const bouton = page.getByRole("button", { name: nom });
      await expect(bouton).toBeInViewport();
      const boite = await bouton.boundingBox();
      expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debordement).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /Retour à l’accueil/ }).tap();
    await page.waitForURL((url) => url.pathname === "/");
    await contexte.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lot D — V9-01 : fuseau du navigateur (serveur en UTC)
// ─────────────────────────────────────────────────────────────────────────────
const FUSEAUX: Array<{ fuseau: string; attendu: string }> = [
  { fuseau: "Europe/Paris", attendu: "2026-07-15 07:00:00+00" },
  { fuseau: "UTC", attendu: "2026-07-15 09:00:00+00" },
  { fuseau: "Asia/Tokyo", attendu: "2026-07-15 00:00:00+00" },
  { fuseau: "America/New_York", attendu: "2026-07-15 13:00:00+00" },
];

async function pageDansFuseau(browser: Browser, fuseau: string) {
  const contexte = await browser.newContext({ timezoneId: fuseau, locale: "fr-FR" });
  return { contexte, page: await contexte.newPage() };
}

test.describe("Lot D — V9-01 datetime-local", () => {
  test.describe.configure({ mode: "serial" });
  const GERANT = "9a000000-0000-4000-8000-0000000000a1";

  // Écran d'origine de V9-01 : habilitation (application Colors, distincte du Lot E).
  for (const { fuseau, attendu } of FUSEAUX) {
    test(`habilitation : début 15/07/2026 09:00 saisi à ${fuseau} → ${attendu}`, async ({ browser }) => {
      const { contexte, page } = await pageDansFuseau(browser, fuseau);
      await connecter(page, "plateforme@pv9.invalid");
      await page.goto(`/plateforme/entreprises/${ENTREPRISE_A()}/applications`);
      const fiche = page.locator("details").filter({ hasText: GERANT });
      await fiche.locator("summary").click();
      const article = fiche.locator("article").filter({ has: page.getByRole("heading", { name: "ELSATIA Colors" }) });
      await expect(article.locator('input[name="valide_du__fuseau"]')).toHaveValue(fuseau);
      await article.locator('select[name="role_code"]').selectOption({ index: 1 });
      await article.locator('input[name="valide_du"]').fill("2026-07-15T09:00");
      await article.getByRole("button", { name: /Habiliter|Modifier/ }).click();
      await page.waitForURL(/succes=/);
      expect(psql(`select valide_du from habilitations_applications_utilisateurs
                   where utilisateur_id = '${GERANT}' and application_code = 'colors';`)).toBe(attendu);
      await contexte.close();
    });
  }

  test("e-mail de chantier (module cœur) : saisi à Tokyo, stocké en UTC", async ({ browser }) => {
    const { contexte, page } = await pageDansFuseau(browser, "Asia/Tokyo");
    await connecter(page, "gerant@pv9.invalid");
    await page.goto("/chantiers/9f000000-0000-4000-8000-0000000000f1/emails");
    await expect(page.locator('input[name="recu_at__fuseau"]')).toHaveValue("Asia/Tokyo");
    await page.locator('input[name="objet"]').fill("PV9 e-mail Tokyo");
    await page.locator('input[name="recu_at"]').fill("2026-07-15T09:00");
    await page.getByRole("button", { name: "Archiver dans ce chantier" }).click();
    await page.waitForURL(/success=/);
    expect(psql("select recu_at from emails_chantier where objet = 'PV9 e-mail Tokyo';")).toBe("2026-07-15 00:00:00+00");
    await contexte.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lot E — V9-02 : date de fin d'habilitation (et V9-01 sur cet écran)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Lot E — V9-02 « Sans date de fin »", () => {
  test.describe.configure({ mode: "serial" });
  const GERANT = "9a000000-0000-4000-8000-0000000000a1";
  const finStockee = () => psql(`select coalesce(valide_jusqu_au::text, 'NULL') from habilitations_applications_utilisateurs
                                  where utilisateur_id = '${GERANT}' and application_code = 'gestion_pro';`);

  async function ouvrirHabilitation(page: Page) {
    await page.goto(`/plateforme/entreprises/${ENTREPRISE_A()}/applications`);
    const fiche = page.locator("details").filter({ hasText: GERANT });
    await fiche.locator("summary").click();
    return fiche.locator("article").filter({ has: page.getByRole("heading", { name: "ELSATIA Gestion Pro" }) });
  }

  test("création avec date de fin (Paris) → stockée en UTC, relue à l'identique", async ({ browser }) => {
    const { contexte, page } = await pageDansFuseau(browser, "Europe/Paris");
    await connecter(page, "plateforme@pv9.invalid");
    let article = await ouvrirHabilitation(page);
    await article.locator('select[name="role_code"]').selectOption({ index: 1 });
    const sansFin = article.getByLabel("Sans date de fin");
    await expect(sansFin).toBeChecked(); // aucune date enregistrée
    await sansFin.uncheck();
    await article.locator('input[name="valide_jusqu_au"]').fill("2030-12-31T18:00");
    await article.getByRole("button", { name: /Habiliter|Modifier/ }).click();
    await page.waitForURL(/succes=/);
    expect(finStockee()).toBe("2030-12-31 17:00:00+00");
    // Réouverture : même heure murale, case décochée.
    article = await ouvrirHabilitation(page);
    await expect(article.locator('input[name="valide_jusqu_au"]')).toHaveValue("2030-12-31T18:00");
    await expect(article.getByLabel("Sans date de fin")).not.toBeChecked();
    await contexte.close();
  });

  test("réouverture depuis New York : même instant, heure locale de New York", async ({ browser }) => {
    const { contexte, page } = await pageDansFuseau(browser, "America/New_York");
    await connecter(page, "plateforme@pv9.invalid");
    const article = await ouvrirHabilitation(page);
    await expect(article.locator('input[name="valide_jusqu_au"]')).toHaveValue("2030-12-31T12:00");
    await expect(article.locator('input[name="valide_jusqu_au__fuseau"]')).toHaveValue("America/New_York");
    // Ré-enregistrer sans rien changer ne déplace pas la date.
    await article.getByRole("button", { name: /Modifier/ }).click();
    await page.waitForURL(/succes=/);
    expect(finStockee()).toBe("2030-12-31 17:00:00+00");
    await contexte.close();
  });

  test("suppression de la date : « Sans date de fin » cochée → NULL, réouverture cohérente", async ({ browser }) => {
    const { contexte, page } = await pageDansFuseau(browser, "Europe/Paris");
    await connecter(page, "plateforme@pv9.invalid");
    let article = await ouvrirHabilitation(page);
    await article.getByLabel("Sans date de fin").check();
    await expect(article.locator('input[name="valide_jusqu_au"]')).toBeDisabled();
    await article.getByRole("button", { name: /Modifier/ }).click();
    await page.waitForURL(/succes=/);
    expect(finStockee()).toBe("NULL");
    article = await ouvrirHabilitation(page);
    await expect(article.getByLabel("Sans date de fin")).toBeChecked();
    await expect(article.locator('input[name="valide_jusqu_au"]')).toBeDisabled();
    await contexte.close();
  });

  test("expiration : une date de fin passée affiche « Expirée »", async ({ browser }) => {
    const { contexte, page } = await pageDansFuseau(browser, "Europe/Paris");
    await connecter(page, "plateforme@pv9.invalid");
    let article = await ouvrirHabilitation(page);
    await article.getByLabel("Sans date de fin").uncheck();
    await article.locator('input[name="valide_jusqu_au"]').fill("2021-01-01T00:00");
    await article.getByRole("button", { name: /Modifier/ }).click();
    await page.waitForURL(/succes=/);
    expect(finStockee()).toBe("2020-12-31 23:00:00+00");
    article = await ouvrirHabilitation(page);
    await expect(article.getByText("Expirée")).toBeVisible();
    await expect(article.locator('input[name="valide_jusqu_au"]')).toHaveValue("2021-01-01T00:00");
    await contexte.close();
  });
});
