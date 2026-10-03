import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Recette navigateur ELSATIA SATELLITES PREVIEW READINESS V2 — Colors · Tools · Réserves.
 *
 * Pile : tests/e2e/satellites-pile-locale/preparer-base.sh (vrai PostgreSQL 16, train complet,
 * seed PILOTE-BTP-V1 + fixture satellites), tests/e2e/finance-pile-locale/demarrer-pile.sh
 * (vrai PostgREST + passerelle auth). Quatre applications COMPILÉES, chacune sur son port local
 * (celui de `url_locale` au catalogue) : GP 3000, Colors 3010, Tools 3020, Réserves 3040.
 *
 * `E2E_SAT_MODE` fixe l'environnement SERVEUR simulé (ELSATIA_APPLICATION_ENV de GP, Colors,
 * Réserves ; build NEXT_PUBLIC_TOOLS_ENV de Tools) :
 *   - local      : parcours réels d'une application à l'autre, sessions, refus, logout, next= ;
 *   - preview    : les liens rendus visent les URL Preview du catalogue, JAMAIS *.elsatia.fr ni
 *                  localhost (on ne les suit pas : ce sont des hôtes Vercel fictifs) ;
 *   - production : les liens rendus visent les hôtes canoniques *.elsatia.fr (non suivis).
 * Sans `E2E_SAT_MODE`, la recette est ignorée.
 */
const MODE = process.env.E2E_SAT_MODE as "local" | "preview" | "production" | undefined;
/*
 * GP est ouverte sur 127.0.0.1, les satellites sur localhost : deux HÔTES distincts. Les cookies
 * ignorent le port (RFC 6265 §8.5) — sur un même hôte localhost, GP et Colors partageraient leur
 * jar et la « session par application » serait invisible. En Preview et en Production, chaque
 * application a son propre hôte : c'est ce que reproduit ce choix.
 */
const GP = process.env.E2E_SAT_GP_URL ?? "http://127.0.0.1:3000";
const COLORS = process.env.E2E_SAT_COLORS_URL ?? "http://localhost:3010";
const TOOLS = process.env.E2E_SAT_TOOLS_URL ?? "http://localhost:3020";
const RESERVES = process.env.E2E_SAT_RESERVES_URL ?? "http://localhost:3040";

const KARIM = "pilote.karim.haddad@example.test";
const BELAID = "pilote.karim.belaid@example.test";
const EXPIRE = "expire@sat.invalid";
const SUSPENDU = "suspendu@sat.invalid";
const SUPPORT = "support@sat.invalid";
const PROPRIETAIRE = "julien@elsatia.fr";

const PREVIEW = {
  gestion_pro: "https://elsatia-gp-git-preview.vercel.app",
  colors: "https://elsatia-colors-git-preview.vercel.app",
  tools: "https://elsatia-tools-git-preview.vercel.app",
  reserves: "https://elsatia-reserves-git-preview.vercel.app",
};
/** Une application ELSATIA de Production (sous-domaine) ; le site vitrine elsatia.fr reste permis. */
const HOTE_APP_PRODUCTION = /https?:\/\/[a-z0-9-]+\.elsatia\.fr/i;
const LOCALHOST = /https?:\/\/(localhost|127\.0\.0\.1)/i;

test.skip(!MODE, "E2E_SAT_MODE absent : recette satellites ignorée");
test.describe.configure({ mode: "serial" });

async function connexionGp(page: Page, email: string) {
  await page.goto(`${GP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  // Première visite du tableau de bord : configuration de l'accueil (préférence locale au navigateur).
  const configuration = page.getByRole("button", { name: "Enregistrer et ouvrir mon tableau de bord" });
  if (await configuration.isVisible().catch(() => false)) await configuration.click();
}

async function connexionSatellite(page: Page, base: string, bouton: RegExp, email: string, destination = /\/dashboard/) {
  await page.goto(`${base}/login`);
  await page.getByLabel(/Adresse email/).fill(email);
  await page.getByLabel(/Mot de passe/).fill("test");
  await page.getByRole("button", { name: bouton }).click();
  await expect(page).toHaveURL(destination);
}

async function liensGp(page: Page) {
  await page.getByRole("button", { name: "Applications ELSATIA" }).click();
  const menu = page.getByRole("menu", { name: "Applications accessibles" });
  await expect(menu).toBeVisible();
  return menu;
}

async function hrefs(page: Page) {
  return page.locator("a[href]").evaluateAll((liens) => liens.map((a) => (a as HTMLAnchorElement).href));
}

async function aucuneBasculeVersProduction(page: Page) {
  for (const href of await hrefs(page)) expect(href, `lien ${href}`).not.toMatch(HOTE_APP_PRODUCTION);
}

function cookiesHoteSeul(context: BrowserContext) {
  return context.cookies().then((cookies) => {
    for (const cookie of cookies) {
      expect(cookie.domain, `cookie ${cookie.name}`).not.toMatch(/elsatia\.fr/);
      expect(cookie.domain.startsWith("."), `cookie ${cookie.name} limité à son hôte`).toBe(false);
    }
    return cookies;
  });
}

// ══ LOCAL : parcours réels ═══════════════════════════════════════════════════
test.describe("LOCAL — navigation réelle entre applications", () => {
  test.skip(MODE !== "local", "mode local uniquement");

  test("lanceur GP (Karim) : Colors, Tools, Réserves en local, jamais Drone ni la Production", async ({ page }) => {
    await connexionGp(page, KARIM);
    const menu = await liensGp(page);
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Colors/ })).toHaveAttribute("href", "http://localhost:3010");
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Tools/ })).toHaveAttribute("href", "http://localhost:3020");
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Réserves/ })).toHaveAttribute("href", "http://localhost:3040");
    await expect(menu.getByText(/Drone/)).toHaveCount(0);
    await aucuneBasculeVersProduction(page);
  });

  test("GP → Colors → GP : session propre à chaque application, liens locaux, cookies hôte seul", async ({ page, context }) => {
    await connexionGp(page, KARIM);
    const menu = await liensGp(page);
    await menu.getByRole("menuitem", { name: /ELSATIA Colors/ }).click();
    // Session par application : Colors exige sa propre connexion (aucun cookie partagé).
    await expect(page).toHaveURL(/localhost:3010\/login/);
    await connexionSatellite(page, COLORS, /Se connecter à Colors/, KARIM);
    await page.getByRole("button", { name: "Applications ELSATIA" }).click();
    const gp = page.locator(".app-switcher-menu a", { hasText: "ELSATIA Gestion Pro" });
    await expect(gp).toHaveAttribute("href", "http://localhost:3000");
    await expect(page.locator("a.account-link")).toHaveAttribute("href", "http://localhost:3000/abonnement");
    await aucuneBasculeVersProduction(page);
    await gp.click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\//);
    await cookiesHoteSeul(context);
  });

  test("GP → Réserves → GP : Réserves propose le retour vers l'univers ELSATIA (A-09)", async ({ page }) => {
    await connexionGp(page, KARIM);
    const menu = await liensGp(page);
    await menu.getByRole("menuitem", { name: /ELSATIA Réserves/ }).click();
    await expect(page).toHaveURL(/localhost:3040\/login/);
    await connexionSatellite(page, RESERVES, /Se connecter à Réserves/, KARIM);
    const nav = page.getByRole("navigation", { name: "Applications ELSATIA" });
    await expect(nav.getByRole("link", { name: /Gestion Pro/ })).toHaveAttribute("href", "http://localhost:3000");
    await expect(nav.getByRole("link", { name: /Colors/ })).toHaveAttribute("href", "http://localhost:3010");
    await expect(nav.getByRole("link", { name: /Réserves/ })).toHaveCount(0);
    await aucuneBasculeVersProduction(page);
    await nav.getByRole("link", { name: /Gestion Pro/ }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\//);
  });

  test("Tools → GP / Colors : liens locaux (promotions, création de compte)", async ({ page }) => {
    await page.goto(`${TOOLS}/compte`);
    await expect(page.getByRole("link", { name: "Créer un compte ELSATIA" })).toHaveAttribute("href", "http://localhost:3000/signup");
    await page.goto(`${TOOLS}/outils/quantite-peinture`);
    await expect(page.locator(".elsatia-promotion a")).toHaveAttribute("href", "http://localhost:3010");
    await page.goto(`${TOOLS}/outils/repartition`);
    await expect(page.locator(".elsatia-promotion a")).toHaveAttribute("href", "http://localhost:3000");
    await aucuneBasculeVersProduction(page);
  });

  // Contrat produit : un compte sans accès (absent, échu, suspendu) est refusé DÈS la connexion
  // et sa session est refermée (Colors : ?error=acces-colors ; Réserves : message « sans Réserves »).
  test("même entreprise, sans habilitation (Belaid) : lanceur vide, Colors et Réserves refusent", async ({ page }) => {
    await connexionGp(page, BELAID);
    const menu = await liensGp(page);
    for (const nom of [/Colors/, /Tools/, /Réserves/, /Drone/]) await expect(menu.getByRole("menuitem", { name: nom })).toHaveCount(0);
    await connexionSatellite(page, COLORS, /Se connecter à Colors/, BELAID, /localhost:3010\/login\?error=acces-colors/);
    await expect(page.getByText("ne dispose pas d’un accès actif à Colors")).toBeVisible();
    await connexionSatellite(page, RESERVES, /Se connecter à Réserves/, BELAID, /localhost:3040\/login\?error=/);
    // URL directe : aucune session n'a survécu au refus.
    await page.goto(`${COLORS}/dashboard`);
    await expect(page).toHaveURL(/localhost:3010\/login/);
    await page.goto(`${RESERVES}/dashboard`);
    await expect(page).toHaveURL(/localhost:3040\/login/);
  });

  test("droit expiré et droit suspendu : Colors refuse à la connexion, URL directe refusée", async ({ page }) => {
    for (const compte of [EXPIRE, SUSPENDU]) {
      await connexionSatellite(page, COLORS, /Se connecter à Colors/, compte, /localhost:3010\/login\?error=acces-colors/);
      await page.goto(`${COLORS}/dashboard`);
      await expect(page).toHaveURL(/localhost:3010\/login/);
    }
  });

  test("Drone (A-05) : absent du lanceur d'un administrateur plateforme, présent au catalogue", async ({ page }) => {
    await connexionGp(page, SUPPORT);
    const menu = await liensGp(page);
    await expect(menu.getByText(/Drone/)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto(`${GP}/plateforme/applications`);
    await expect(page.getByRole("heading", { name: "ELSATIA Drone / Scan" })).toBeVisible();
    await expect(page.getByText("Bientôt disponible")).toBeVisible();
    // Un délégué n'a aucun formulaire d'URL système (A-11).
    await expect(page.getByRole("form", { name: /URL Preview/ })).toHaveCount(0);
  });

  test("url_preview (A-11) : le propriétaire la définit, les URL dangereuses sont refusées", async ({ page }) => {
    await connexionGp(page, PROPRIETAIRE);
    await page.goto(`${GP}/plateforme/applications`);
    const formulaire = page.getByRole("form", { name: "URL Preview de ELSATIA Colors" });
    for (const refusee of ["https://colors.elsatia.fr", "javascript:alert(1)", "https://elsatia-colors-git-preview.vercel.app/login?next=https://evil.example"]) {
      await formulaire.getByRole("textbox").fill(refusee);
      await formulaire.evaluate((f: HTMLFormElement) => { f.noValidate = true; });
      await formulaire.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.locator("p[role=alert]")).toContainText("URL Preview refusée");
    }
    await page.getByRole("form", { name: "URL Preview de ELSATIA Colors" }).getByRole("textbox").fill("HTTPS://Elsatia-Colors-Git-Preview.vercel.app/");
    await page.getByRole("form", { name: "URL Preview de ELSATIA Colors" }).getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("p[role=status]")).toContainText("URL Preview de colors enregistrée");
    await expect(page.getByRole("form", { name: "URL Preview de ELSATIA Colors" }).getByRole("textbox")).toHaveValue(PREVIEW.colors);
  });

  test("next= et en-tête Host : aucune redirection hors de l'application", async ({ request }) => {
    for (const base of [COLORS, RESERVES]) {
      for (const next of ["https://evil.example", "//evil.example", "/%2F%2Fevil.example", "%5C%5Cevil.example"]) {
        const reponse = await request.get(`${base}/auth/callback?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
        const destination = reponse.headers()["location"] ?? "";
        expect(destination, `${base} next=${next}`).not.toMatch(/evil\.example/);
      }
      const hote = await request.get(`${base}/auth/callback?next=/dashboard`, { maxRedirects: 0, headers: { "x-forwarded-host": "evil.example" } });
      expect(hote.headers()["location"] ?? "").not.toMatch(/evil\.example/);
    }
  });

  /*
   * Contrat ACTUEL (constaté, non modifié — DECISION_REQUIRED du rapport) : GP, Colors et Réserves
   * appellent `signOut()` sans portée, donc la portée par défaut de supabase-js, `global` : la
   * déconnexion d'une application révoque TOUTES les sessions du compte (autres applications et
   * autres appareils). Les cookies restent propres à chaque hôte ; c'est la révocation côté Auth
   * qui ferme les autres applications. Seuls Studio et Tools utilisent `scope: "local"`.
   */
  test("logout : retour à /login ; déconnexion globale (toutes les applications du compte)", async ({ page }) => {
    await connexionGp(page, KARIM);
    await connexionSatellite(page, COLORS, /Se connecter à Colors/, KARIM);
    await page.goto(`${GP}/dashboard`);
    await expect(page).toHaveURL(/127\.0\.0\.1:3000\/dashboard/);
    await page.goto(`${COLORS}/dashboard`);
    await page.getByRole("button", { name: "Se déconnecter" }).first().click();
    await expect(page).toHaveURL(/localhost:3010\/login/);
    await page.goto(`${COLORS}/dashboard`);
    await expect(page).toHaveURL(/localhost:3010\/login/);
    // Portée globale : la session GP (autre hôte, autre cookie) est révoquée côté Auth.
    await page.goto(`${GP}/dashboard`);
    await expect(page).toHaveURL(/127\.0\.0\.1:3000\/login/);
    // Réserves : même contrat de déconnexion (bouton qui purge d'abord l'appareil).
    await connexionSatellite(page, RESERVES, /Se connecter à Réserves/, KARIM);
    await page.getByRole("button", { name: /Se déconnecter/ }).first().click();
    await expect(page).toHaveURL(/localhost:3040\/login/);
    await page.goto(`${RESERVES}/dashboard`);
    await expect(page).toHaveURL(/localhost:3040\/login/);
  });
});

// ══ PREVIEW simulée : liens rendus ═══════════════════════════════════════════
test.describe("PREVIEW simulée — aucun lien Preview → Production", () => {
  test.skip(MODE !== "preview", "mode preview uniquement");

  test("lanceur GP : URL Preview du catalogue, jamais *.elsatia.fr ni localhost", async ({ page }) => {
    await connexionGp(page, KARIM);
    const menu = await liensGp(page);
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Colors/ })).toHaveAttribute("href", PREVIEW.colors);
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Tools/ })).toHaveAttribute("href", PREVIEW.tools);
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Réserves/ })).toHaveAttribute("href", PREVIEW.reserves);
    for (const href of await hrefs(page)) {
      expect(href).not.toMatch(HOTE_APP_PRODUCTION);
      if (!href.startsWith(GP)) expect(href).not.toMatch(LOCALHOST);
    }
  });

  test("Colors : retour GP = Preview GP ; portail de compte localhost masqué plutôt que servi", async ({ page }) => {
    await connexionSatellite(page, COLORS, /Se connecter à Colors/, KARIM);
    await page.getByRole("button", { name: "Applications ELSATIA" }).click();
    await expect(page.locator(".app-switcher-menu a", { hasText: "ELSATIA Gestion Pro" })).toHaveAttribute("href", PREVIEW.gestion_pro);
    await expect(page.locator("a.account-link")).toHaveCount(0);
    for (const href of await hrefs(page)) {
      expect(href).not.toMatch(HOTE_APP_PRODUCTION);
      if (!href.startsWith(COLORS)) expect(href).not.toMatch(LOCALHOST);
    }
  });

  test("Réserves : liens Preview vers GP et Colors", async ({ page }) => {
    await connexionSatellite(page, RESERVES, /Se connecter à Réserves/, KARIM);
    const nav = page.getByRole("navigation", { name: "Applications ELSATIA" });
    await expect(nav.getByRole("link", { name: /Gestion Pro/ })).toHaveAttribute("href", PREVIEW.gestion_pro);
    await expect(nav.getByRole("link", { name: /Colors/ })).toHaveAttribute("href", PREVIEW.colors);
    await aucuneBasculeVersProduction(page);
  });

  test("Tools (build NEXT_PUBLIC_TOOLS_ENV=preview) : création de compte et promotions en Preview", async ({ page }) => {
    await page.goto(`${TOOLS}/compte`);
    await expect(page.getByRole("link", { name: "Créer un compte ELSATIA" })).toHaveAttribute("href", `${PREVIEW.gestion_pro}/signup`);
    await page.goto(`${TOOLS}/outils/quantite-peinture`);
    await expect(page.locator(".elsatia-promotion a")).toHaveAttribute("href", PREVIEW.colors);
    await page.goto(`${TOOLS}/outils/repartition`);
    await expect(page.locator(".elsatia-promotion a")).toHaveAttribute("href", PREVIEW.gestion_pro);
    await aucuneBasculeVersProduction(page);
  });
});

// ══ PRODUCTION simulée : hôtes canoniques ═══════════════════════════════════
test.describe("PRODUCTION simulée — hôtes canoniques", () => {
  test.skip(MODE !== "production", "mode production uniquement");

  test("lanceur GP : url_production du catalogue ; Réserves (sans url_production) non cliquable", async ({ page }) => {
    await connexionGp(page, KARIM);
    const menu = await liensGp(page);
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Colors/ })).toHaveAttribute("href", "https://colors.elsatia.fr");
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Tools/ })).toHaveAttribute("href", "https://tools.elsatia.fr");
    // Réserves n'a pas d'url_production (statut « interne ») : entrée non cliquable, jamais un repli.
    await expect(menu.locator("a", { hasText: "ELSATIA Réserves" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: /ELSATIA Réserves/ })).toHaveAttribute("aria-disabled", "true");
    for (const href of await hrefs(page)) if (!href.startsWith(GP)) expect(href).not.toMatch(/vercel\.app|localhost/);
  });

  test("Tools (build production) : liens canoniques", async ({ page }) => {
    await page.goto(`${TOOLS}/compte`);
    await expect(page.getByRole("link", { name: "Créer un compte ELSATIA" })).toHaveAttribute("href", "https://app.elsatia.fr/signup");
    await page.goto(`${TOOLS}/outils/quantite-peinture`);
    await expect(page.locator(".elsatia-promotion a")).toHaveAttribute("href", "https://colors.elsatia.fr");
  });
});
