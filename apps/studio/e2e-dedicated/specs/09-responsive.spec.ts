// RESPONSIVE — parcours réel sur viewport mobile et tablette (Chromium émulé ; Safari réel non
// disponible sur le banc) : connexion ELSATIA, espace, projet, réglages, membres, Brand Kit, éditeur,
// lien public inventé, logout. Contrôle : aucun débordement horizontal, actions visibles.
import { expect, test, type Page } from "@playwright/test";
import { elsatiaAccount, loginWithElsatia } from "./harness";

const VIEWPORTS = [
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: "tablette", viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
] as const;

async function sansDebordement(page: Page, ecran: string) {
  const { scroll, largeur } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    largeur: window.innerWidth,
  }));
  expect(scroll, `débordement horizontal sur ${ecran} (${scroll}px > ${largeur}px)`).toBeLessThanOrEqual(largeur + 1);
}

for (const v of VIEWPORTS) {
  test(`${v.name} ${v.viewport.width}×${v.viewport.height} : connexion, espace, projet, réglages, éditeur, logout`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v.viewport, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.deviceScaleFactor });
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await sansDebordement(page, "/login");
      await expect(page.getByRole("link", { name: "Continuer avec mon compte ELSATIA" })).toBeInViewport();

      const account = await elsatiaAccount(`rwd-${v.name}`);
      await loginWithElsatia(page, account, "/onboarding");
      await expect(page).toHaveURL(/\/onboarding/);
      await sansDebordement(page, "/onboarding");
      await page.getByRole("button", { name: "Ouvrir mon Studio personnel" }).click();
      await expect(page).toHaveURL(/\/dashboard\?workspace=/);
      const workspace = new URL(page.url()).searchParams.get("workspace")!;
      await sansDebordement(page, "/dashboard");

      await page.goto(`/projects?workspace=${workspace}`);
      await sansDebordement(page, "/projects");
      await page.getByLabel("Nom du projet").fill(`Projet ${v.name}`);
      await page.getByRole("button", { name: "Créer le projet" }).click();
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
      const projectId = /\/projects\/([0-9a-f-]{36})/.exec(page.url())![1];
      await expect(page.getByRole("heading", { name: new RegExp(`Projet ${v.name}`) })).toBeVisible();
      await sansDebordement(page, "/projects/[id]");

      await page.goto(`/projects/${projectId}/editor?workspace=${workspace}`);
      await expect(page.locator("main")).toBeVisible();
      await sansDebordement(page, "/projects/[id]/editor");

      for (const path of ["/settings", "/settings/members", "/brand-kit"]) {
        await page.goto(`${path}?workspace=${workspace}`);
        await expect(page.getByLabel("Espace actif")).toBeVisible();
        await sansDebordement(page, path);
      }

      await page.goto("/s/lien-invente-responsive-0000000000");
      await expect(page.getByRole("heading", { name: "Lien indisponible" })).toBeVisible();
      await sansDebordement(page, "/s/[token]");

      await page.goto(`/dashboard?workspace=${workspace}`);
      const logout = page.getByRole("button", { name: "Déconnexion" });
      await logout.scrollIntoViewIfNeeded();
      await expect(logout).toBeVisible();
      await logout.click();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
}
