import { expect, test, type Page } from "@playwright/test";

/*
 * Aides de la recette DISTANTE. Les comptes de recette sont fournis par l'orchestrateur
 * (scripts/preview/qualification/steps/e2e-logs.mjs) via l'environnement ; aucun identifiant
 * n'est écrit dans ce dépôt ni affiché. Un compte absent SAUTE le parcours authentifié (le
 * statut SKIPPED remonte au rapport : il n'est jamais compté comme réussi).
 */
export type CompteRecette = { email: string; motDePasse: string; apps: string[] };

// Noms littéraux (le contrôle du manifeste d'environnement refuse les accès dynamiques).
const COMPTES = {
  A: { email: process.env.E2E_REMOTE_EMAIL_A, motDePasse: process.env.E2E_REMOTE_PASSWORD_A, apps: process.env.E2E_REMOTE_APPS_A },
  B: { email: process.env.E2E_REMOTE_EMAIL_B, motDePasse: process.env.E2E_REMOTE_PASSWORD_B, apps: process.env.E2E_REMOTE_APPS_B },
};

export function compte(lettre: "A" | "B"): CompteRecette | null {
  const { email, motDePasse, apps } = COMPTES[lettre];
  if (!email || !motDePasse) return null;
  return { email, motDePasse, apps: (apps ?? "gp").split(",").map((s) => s.trim()).filter(Boolean) };
}

/** Compte A autorisé sur l'application, sinon le test est sauté avec la raison. */
export function compteAutorise(app: string, lettre: "A" | "B" = "A"): CompteRecette {
  const c = compte(lettre);
  test.skip(!c, `compte de recette ${lettre} non fourni`);
  test.skip(Boolean(c && !c.apps.includes(app)), `compte de recette ${lettre} sans accès déclaré à ${app} (qa.tenant_${lettre.toLowerCase()}.apps)`);
  return c as CompteRecette;
}

/** Aucune réponse 5xx sur le document ni sur les requêtes de l'application pendant le parcours. */
export function surveillerErreursServeur(page: Page) {
  const erreurs: string[] = [];
  const origine = new URL(process.env.E2E_REMOTE_BASE_URL ?? "http://invalid").origin;
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith(origine)) erreurs.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return erreurs;
}

/** Formulaire de connexion commun à GP, Colors et Réserves (input email/password + submit). */
export async function seConnecter(page: Page, c: CompteRecette) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(c.email);
  await page.locator('input[type="password"]').first().fill(c.motDePasse);
  await page.locator('button[type="submit"]').first().click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 45_000 });
}

/** La page ne montre pas l'écran d'erreur générique de Next.js. */
export async function pasDErreurApplicative(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error|This page could not be found/i);
}
