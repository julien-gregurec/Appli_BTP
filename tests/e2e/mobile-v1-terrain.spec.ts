import { expect, test, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

/**
 * Recette mobile du périmètre V1 terrain.
 *
 * Ces tests portent la marque `@responsive` : la configuration Playwright les rejoue sur
 * `iphone-webkit`, `android-chromium` et `tablet-webkit` en plus de Chromium de bureau.
 *
 * ── Ce qu'ils éprouvent, et pourquoi ce sont ces choses-là ──────────────────────────────
 *
 * L'application embarquait un correctif CSS global qui forçait toute grille en une colonne
 * et rendait tout tableau défilable. Les 12 pages du périmètre V1 s'en sont soustraites
 * (classe `.ecran-mobile`), et ce correctif masquait peut-être des débordements. C'est ce
 * que ces tests vont chercher en premier.
 *
 * La règle en cas d'échec est écrite dans le document de phase C, et elle vaut d'être
 * rappelée ici : SI UN DÉBORDEMENT APPARAÎT SUR UNE PAGE `.ecran-mobile`, LA CORRECTION EST
 * DE CORRIGER CETTE PAGE — jamais de lui remettre le correctif global. Le remettre
 * rétablirait le confort d'affichage en renonçant à l'objectif du lot.
 */

/** Les six parcours terrain arbitrés. */
const PARCOURS_V1 = [
  "/dashboard",
  "/pointage",
  "/planning",
  "/chantiers",
  "/notes-frais",
  "/mes-travaux",
] as const;

/** Largeurs exigées par la recette. 375–430 : téléphones. 768–1024 : tablettes. */
const LARGEURS = [375, 390, 430, 768, 1024] as const;

async function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("@responsive périmètre V1 terrain", () => {
  for (const largeur of LARGEURS) {
    test(`@responsive aucun débordement horizontal à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await login(page, USERS.workerA);

      for (const route of PARCOURS_V1) {
        await page.goto(route);
        await expect(page.locator("body")).toBeVisible();
        const debordement = await debordementHorizontal(page);
        // 8 px de tolérance : c'est la largeur d'une barre de défilement sur certains moteurs,
        // pas une marge de confort pour un défaut de mise en page.
        expect(debordement, `${route} déborde de ${debordement} px à ${largeur} px`)
          .toBeLessThanOrEqual(8);
      }
    });
  }

  test("@responsive les cibles tactiles atteignent 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await login(page, USERS.workerA);
    await page.goto("/pointage");

    // 44 px est le seuil recommandé par Apple ET par Android. L'application était à 42 px.
    const trop_petites = await page.evaluate(() => {
      // Uniquement les COMMANDES : boutons et liens présentés comme des boutons.
      // Un lien de texte en ligne (« CGV » dans un pied de page) n'est pas une commande ;
      // lui imposer 44 px de haut étirerait la page sans le rendre plus facile à toucher.
      const cibles = [...document.querySelectorAll(
        'main button, main [role="button"], main a.rounded-md, main a.rounded-lg',
      )];
      return cibles
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          // On ignore ce qui n'est pas affiché : un élément masqué n'est pas une cible.
          return rect.width > 0 && rect.height > 0 && rect.height < 44;
        })
        .map((element) => `${element.tagName} « ${element.textContent?.trim().slice(0, 40)} »`);
    });
    expect(trop_petites, `cibles sous 44 px : ${trop_petites.join(" · ")}`).toEqual([]);
  });

  test("@responsive l'entreprise voisine reste invisible sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await login(page, USERS.workerA);
    for (const route of PARCOURS_V1) {
      await page.goto(route);
      // Le décor de recette nomme l'entreprise B « RECETTE_B_… » : sa présence sur un écran
      // de l'entreprise A signalerait une fuite entre locataires.
      await expect(page.locator("body")).not.toContainText("RECETTE_B_");
    }
  });

  test("@responsive le manifeste PWA est servi et installable", async ({ page }) => {
    await login(page, USERS.workerA);
    const reponse = await page.request.get("/manifest.webmanifest");
    expect(reponse.ok()).toBe(true);
    const manifeste = await reponse.json();

    expect(manifeste.display).toBe("standalone");
    expect(manifeste.start_url).toBe("/dashboard");
    // Le nom court existe et n'est pas vide. On ne contraint PAS sa longueur ici :
    // « ELSATIA Gestion Pro » dépasse les ~12 caractères qu'iOS et Android affichent sous
    // l'icône, mais c'est un arbitrage de marque en attente, pas un défaut à faire échouer.
    // Voir le rapport du lot, section des décisions en attente.
    expect(manifeste.short_name).toBeTruthy();
    // Une icône « maskable » est ce qui évite qu'Android n'affiche l'icône dans une pastille
    // blanche au lieu de la découper à sa forme de lanceur.
    expect(manifeste.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    expect(manifeste.shortcuts?.length).toBeGreaterThan(0);
  });

  test("@responsive les fichiers d'association d'application échappent à l'authentification", async ({ page }) => {
    // Récupérés par les CDN d'Apple et de Google, SANS session. Une redirection vers /login
    // ferait échouer les liens profonds sans message exploitable — et Apple met en cache.
    const contexte = page.context();
    for (const chemin of ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"]) {
      const reponse = await contexte.request.get(chemin, { maxRedirects: 0 });
      expect(reponse.status(), `${chemin} doit répondre 200 sans session`).toBe(200);
    }
  });
});
