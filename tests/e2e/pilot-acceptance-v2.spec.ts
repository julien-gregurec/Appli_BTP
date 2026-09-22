// ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2 — real browser flows against the local GoTrue + PostgREST
// stack built by scripts/local-postgres-bootstrap/ (see npm run pilot:acceptance:v2). V1 never got a
// real PostgREST running, so it explicitly skipped Playwright (see docs/qualification/
// ELSATIA_PILOT_AUTH_POSTGREST_ACCEPTANCE_AUTOMATION_V1.md §6). This resolves that gap for the login,
// onboarding, and the 8 URL-guard NOT_TESTABLE_LOCALLY cases V1 flagged (§4.2): whether a direct-URL
// access attempt that the RPC layer already refuses actually redirects/errors at the page level, or
// silently renders an empty page (the exact CL-05/DV-09 defect V1 found for /clients and /devis).
//
// Requires: the local pilot stack running (npm run pilot:auth:local) + `next dev -p 3100` with
// .env.local pointing NEXT_PUBLIC_SUPABASE_URL at the local proxy (scripts/local-postgres-bootstrap/
// local_supabase_proxy.mjs). Not part of `npm run test:e2e` (which targets the isolation_multitenant
// fixture) -- run directly: npx playwright test tests/e2e/pilot-acceptance-v2.spec.ts
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "PiloteTest!2026";
const PROFILES = {
  gerant: "pilote.karim.haddad@example.test",
  admin: "pilote.nadia.ferreira@example.test",
  chef_chantier: "pilote.farid.amrani@example.test",
  chef_equipe: "pilote.rachid.belkacem@example.test",
  ouvrier: "pilote.sofiane.aitali@example.test",
} as const;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("Login (real GoTrue + real PostgREST)", () => {
  for (const [role, email] of Object.entries(PROFILES)) {
    test(`login réussi -- ${role}`, async ({ page }) => {
      await login(page, email);
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
      await expect(page.locator("body")).not.toContainText("Identifiants invalides");
    });
  }
});

// V1 §4.2: SEC-01/02/03, CM-07, EX-03, ST-08, PA-04/05 all resolve `a_permission()` correctly
// (verified server-side, real JWT) but the exact UI behaviour on direct URL access was never checked
// in a real browser -- V1 flagged this as the one open question, having found CL-05/DV-09 already
// exhibit "RPC refuses, page renders empty" instead of a redirect/message. This closes that gap.
const URL_GUARD_CASES: { id: string; path: string }[] = [
  { id: "SEC-01", path: "/employes" },
  { id: "SEC-02", path: "/parametres/acces" },
  { id: "SEC-03a", path: "/rentabilite" },
  { id: "SEC-03b", path: "/tresorerie" },
  { id: "CM-07", path: "/fournisseurs" },
  { id: "EX-03", path: "/exports" },
  { id: "ST-08", path: "/stock" },
  { id: "PA-04", path: "/paie" },
  { id: "CL-05", path: "/clients" },
  { id: "DV-09", path: "/devis" },
  { id: "AV-04", path: "/factures" },
];

test.describe("URL guards -- direct access as ouvrier (no acces_* permission)", () => {
  for (const { id, path } of URL_GUARD_CASES) {
    test(`${id}: /${path} en tant qu'ouvrier`, async ({ page }) => {
      await login(page, PROFILES.ouvrier);
      const response = await page.goto(path);
      await page.waitForLoadState("networkidle");
      const finalUrl = new URL(page.url()).pathname;
      const bodyText = await page.locator("body").innerText();
      const redirected = finalUrl !== path;
      const hasExplicitMessage = /acc[eè]s refus[eé]|non autoris|acces=refuse/i.test(bodyText);
      const status = response?.status() ?? 0;
      // Record the exact observed behaviour rather than asserting one specific shape -- this IS the
      // measurement V1 was missing, not a known-good expectation to enforce.
      console.log(`[URL-GUARD ${id}] path=${path} finalUrl=${finalUrl} status=${status} redirected=${redirected} explicitMessage=${hasExplicitMessage} bodyLen=${bodyText.length}`);
      // Minimum bar: never actually show the ouvrier real data from a permission-gated page.
      expect(bodyText).not.toMatch(/PILOTE-CLI-|DEV-PILOTE-|FAC-PILOTE-|CMD-PILOTE-/);
    });
  }
});

test.describe("Flux principaux (smoke, réel PostgREST)", () => {
  test("chantier: liste et détail visibles (gérant)", async ({ page }) => {
    await login(page, PROFILES.gerant);
    await page.goto("/chantiers");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Renovation|Ravalement|Construction|Extension|Refection/);
  });

  test("devis: liste visible (admin)", async ({ page }) => {
    await login(page, PROFILES.admin);
    await page.goto("/devis");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/DEV-PILOTE/);
  });

  test("facture: liste visible (admin)", async ({ page }) => {
    await login(page, PROFILES.admin);
    await page.goto("/factures");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/FAC-PILOTE/);
  });

  test("planning: visible (chef de chantier)", async ({ page }) => {
    await login(page, PROFILES.chef_chantier);
    await page.goto("/planning");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Une erreur");
  });

  test("pointage: écran ouvrier accessible", async ({ page }) => {
    await login(page, PROFILES.ouvrier);
    await page.goto("/pointage");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Une erreur");
  });

  test("mes-travaux: ouvrier voit ses chantiers sans prix", async ({ page }) => {
    await login(page, PROFILES.ouvrier);
    await page.goto("/mes-travaux");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\d+[,.]\d{2}\s*€/); // no price-formatted amounts
  });

  test("onboarding wizard (/onboarding/demarrage) rendu pour un compte gérant", async ({ page }) => {
    await login(page, PROFILES.gerant);
    await page.goto("/onboarding/demarrage");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Une erreur");
  });
});
