import { expect, test } from "@playwright/test";
import { motDePasseRecette } from "./colors-aides";

/**
 * Un compte ELSATIA, deux applications : Gestion Pro puis Colors.
 *
 * Éprouve, sur la pile locale, ce que le code promet : le MÊME identifiant et le MÊME mot de
 * passe ouvrent Gestion Pro et Colors (un seul `auth.users`), mais chaque application garde sa
 * propre session — les cookies sont des cookies d'hôte. Deux noms d'hôte distincts servent à le
 * reproduire : `127.0.0.1` pour Gestion Pro, `localhost` pour Colors. Sur un même nom d'hôte,
 * seul le port différerait, et les cookies ne connaissent pas les ports : la session serait
 * partagée, ce qui n'est PAS ce qui se produit entre `app.` et `colors.elsatia.fr`.
 *
 * Variables : `E2E_GP_URL` (ex. http://127.0.0.1:3100), `E2E_COLORS_HOTE_DISTINCT_URL`
 * (ex. http://localhost:3141), `MDP_RECETTE`. Le catalogue local doit pointer `colors` vers la
 * seconde. Le scénario est ignoré si l'une manque.
 *
 * Gestion Pro tourne ici en `next dev` : la première compilation de chaque route dépasse les
 * budgets habituels, d'où le délai large.
 */

const GP = process.env.E2E_GP_URL;
const COLORS = process.env.E2E_COLORS_HOTE_DISTINCT_URL;
const EMAIL = "partage-julien@recette.invalid";

test("@inter-apps le même compte ouvre Gestion Pro puis Colors, une session par application", async ({ page }) => {
  test.skip(!GP || !COLORS, "E2E_GP_URL et E2E_COLORS_HOTE_DISTINCT_URL sont requis");
  test.setTimeout(900_000);
  page.setDefaultNavigationTimeout(420_000);
  page.setDefaultTimeout(60_000);

  // 1. Gestion Pro : connexion avec le compte commun.
  await page.goto(`${GP}/login`);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(motDePasseRecette());
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 420_000 });
  const arriveeGp = new URL(page.url()).pathname;

  // 2. Le sélecteur d'applications de Gestion Pro propose Colors, sans qu'aucun second compte n'existe.
  await page.goto(`${GP}/dashboard`);
  // Première connexion : Gestion Pro ouvre un dialogue de personnalisation qui masque la page.
  const premiereConnexion = page.getByRole("button", { name: /Enregistrer et ouvrir mon tableau de bord/ });
  // Le dialogue n'apparaît qu'après l'hydratation : on l'attend un temps borné plutôt que de le tester d'emblée.
  await premiereConnexion.click({ timeout: 45_000 }).catch(() => undefined);
  await page.getByRole("button", { name: /Applications ELSATIA/ }).click();
  const colors = page.getByRole("menuitem", { name: /ELSATIA Colors/ });
  await expect(colors).toBeVisible();
  expect(await colors.getAttribute("href")).toBe(`${COLORS}`);

  // 3. Colors, sur un autre hôte : la session de Gestion Pro n'y est pas (voulu). Mêmes identifiants.
  await page.goto(`${COLORS}/dashboard`);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Adresse email").fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(motDePasseRecette());
  await page.getByRole("button", { name: "Se connecter à Colors" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bonjour");

  // 4. Retour sur Gestion Pro : sa session est intacte ; retour sur Colors : la sienne aussi.
  await page.goto(`${GP}/dashboard`);
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto(`${COLORS}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard$/);

  test.info().annotations.push({ type: "arrivée Gestion Pro", description: arriveeGp });
});
