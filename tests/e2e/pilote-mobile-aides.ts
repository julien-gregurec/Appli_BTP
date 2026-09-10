import { expect, type Page } from "@playwright/test";

/**
 * Aides de la recette mobile authentifiée.
 *
 * Elles pilotent la VRAIE application contre une VRAIE base de recette. Aucun harnais ne
 * reproduit ici du HTML : un écran qui passe parce qu'on a réécrit son balisage ne prouve
 * rien sur l'écran que le salarié ouvrira.
 */

/** Comptes du décor. Les deux derniers sont ajoutés par `scripts/e2e/prepare-pilote-mobile.sql`. */
export const COMPTES = {
  adminA: "admin-a@invalid.local",
  chefEquipeA: "chef-equipe-a@invalid.local",
  ouvrierA: "ouvrier-a@invalid.local",
  /**
   * Salarié de terrain dont le POINTAGE PERSONNEL est activé.
   *
   * Distinct de `ouvrierA` : aucun compte du décor Train V3 n'a
   * `pointage_personnel_actif = true`, si bien que la page de pointage y affiche
   * « Votre administrateur n'a pas activé le pointage personnel pour ce compte » et
   * n'expose aucun formulaire. Le pointage n'y a donc jamais été éprouvé.
   */
  ouvrierTerrainA: "ouvrier-terrain-a@invalid.local",
  conducteurA: "conducteur-a@invalid.local",
  expertComptableA: "expert-comptable-a@invalid.local",
  sansDroitA: "sans-droit-a@invalid.local",
  adminB: "admin-b@invalid.local",
  ouvrierB: "ouvrier-b@invalid.local",
} as const;

/** Largeurs exigées par la recette. */
export const LARGEURS_TELEPHONE = [375, 390, 430] as const;

/** Marqueur du décor de l'entreprise B : sa présence chez A signale une fuite entre locataires. */
export const MARQUEUR_ENTREPRISE_B = "RECETTE_B_";

/**
 * Chemin de la session conservée pour un rôle.
 *
 * Les sessions vivent dans `test-results/`, déjà ignoré par Git : elles contiennent des
 * jetons de la base de recette, qui n'ont rien à faire dans le dépôt.
 */
export function cheminEtatSession(role: string): string {
  return `test-results/etats/${role}.json`;
}

/**
 * Connexion par le VRAI formulaire.
 *
 * À n'employer que dans les scénarios qui éprouvent la connexion elle-même. Partout ailleurs,
 * on réutilise une session ouverte au préalable : `/login` n'accepte que 10 tentatives par
 * tranche de 10 minutes et par IP, et une recette qui se reconnecte à chaque écran se fait
 * refuser avant d'avoir rien prouvé.
 */
export async function connecter(page: Page, email: string, destination: RegExp = /\/dashboard/) {
  await page.goto("/login");
  await attendreHydratation(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(destination, { timeout: 20_000 });
}

/**
 * Attend que le document soit chargé et le formulaire réellement utilisable.
 *
 * Ce n'est ni un délai de complaisance, ni une nouvelle tentative déguisée : c'est l'attente
 * qu'un humain fait naturellement avant de taper.
 *
 * On n'attend PAS `networkidle`, et c'est un choix mesuré : essayé d'abord, il a fait passer
 * les échecs de un à trois. L'application entretient un trafic de fond — surveillance, tunnel
 * Sentry — qui peut ne jamais laisser le réseau se taire ; l'attente consommait alors le
 * budget du test sans rien garantir.
 *
 * Le signal retenu est BORNÉ : le document est complet et le bouton d'envoi est activé.
 * Il ne dépend d'aucun silence réseau et ne masque aucune lenteur — il la laisse apparaître.
 */
export async function attendreHydratation(page: Page) {
  await page.waitForFunction(() => document.readyState === "complete");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeEnabled();
}

/**
 * Navigue vers une route et attend d'y être RÉELLEMENT.
 *
 * WebKit refuse une navigation lancée pendant qu'une autre est encore en train de valider,
 * et lève « Navigation to X is interrupted by another navigation to Y ». Chromium l'accepte
 * silencieusement, ce qui masquait le problème sur le profil Android.
 *
 * Attendre l'URL de destination n'est pas un contournement : c'est ce qui rend l'échec
 * LISIBLE. Si l'application redirigeait vraiment ailleurs, le test le dirait en nommant la
 * page atteinte, au lieu de se plaindre d'une navigation interrompue — un message qui parle
 * du pilote de test et pas du produit.
 */
export async function allerA(page: Page, route: string) {
  // `load` — le défaut — et non `domcontentloaded` : essayé d'abord, ce dernier rendait la
  // main pendant que la navigation précédente achevait de se valider, et WebKit refusait la
  // suivante. Le symptôme nommait toujours la route PRÉCÉDENTE comme interruptrice, ce qui
  // désignait la cause sans ambiguïté une fois qu'on le lisait dans ce sens.
  await page.goto(route);
  await page.waitForURL((url) => url.pathname === route || url.pathname.startsWith(`${route}/`), {
    timeout: 20_000,
  });
}

/** Débordement horizontal du document, en pixels. */
export async function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Commandes dont la hauteur passe sous le seuil tactile.
 *
 * Seules les COMMANDES sont retenues — boutons et liens présentés comme des boutons. Un lien
 * de texte en ligne (« CGV » dans un pied de page) n'est pas une commande : lui imposer 44 px
 * de haut étirerait la page sans le rendre plus facile à toucher.
 */
export async function commandesSousSeuilTactile(page: Page, seuil = 44): Promise<string[]> {
  return page.evaluate((limite) => {
    const cibles = [...document.querySelectorAll<HTMLElement>(
      'main button, main [role="button"], main a.rounded-md, main a.rounded-lg',
    )];
    return cibles
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.height < limite;
      })
      .map((element) => `${element.tagName} « ${(element.textContent ?? "").trim().slice(0, 30)} »`);
  }, seuil);
}

/**
 * Champs dont la police descend sous 16 px.
 *
 * Sous ce seuil, Safari iOS ZOOME automatiquement à la mise au point : la page saute,
 * l'utilisateur perd son repère et doit dézoomer à la main. Le défaut ne se voit pas sur un
 * émulateur de largeur — il se déduit de la taille de police, d'où cette mesure.
 */
export async function champsSousSeuilZoomIos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const champs = [...document.querySelectorAll<HTMLElement>("main input, main select, main textarea")];
    return champs
      .filter((champ) => {
        const rect = champ.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && parseFloat(getComputedStyle(champ).fontSize) < 16;
      })
      .map((champ) => `${champ.tagName}[${champ.getAttribute("name") ?? champ.getAttribute("type") ?? "?"}]`);
  });
}

/** Contrôles d'écran communs à tous les parcours, à toutes les largeurs. */
export async function verifierEcranMobile(page: Page, route: string) {
  await expect(page.locator("body")).toBeVisible();

  const debordement = await debordementHorizontal(page);
  expect(debordement, `${route} déborde de ${debordement} px`).toBeLessThanOrEqual(8);

  const petites = await commandesSousSeuilTactile(page);
  expect(petites, `${route} — commandes sous 44 px : ${petites.join(" · ")}`).toEqual([]);

  const champs = await champsSousSeuilZoomIos(page);
  expect(champs, `${route} — champs sous 16 px (zoom iOS) : ${champs.join(" · ")}`).toEqual([]);

  // Aucune donnée de l'entreprise voisine, jamais.
  await expect(page.locator("body")).not.toContainText(MARQUEUR_ENTREPRISE_B);
}

/**
 * Coupe le réseau pour la page, en laissant l'application tourner.
 *
 * `context.setOffline` agit sur la pile réseau du navigateur, pas sur un indicateur applicatif :
 * c'est ce qui rend le test représentatif d'un sous-sol, et non d'un drapeau qu'on aurait
 * positionné soi-même.
 */
export async function couperLeReseau(page: Page) {
  await page.context().setOffline(true);
}

export async function retablirLeReseau(page: Page) {
  await page.context().setOffline(false);
}

/** Vide la file et les données locales entre deux scénarios du même fichier. */
export async function viderStockageLocal(page: Page) {
  await page.evaluate(async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* stockage refusé */ }
    if (typeof indexedDB?.databases === "function") {
      const bases = await indexedDB.databases();
      await Promise.all(
        bases.filter((b) => b.name?.startsWith("elsatia:gp:"))
          .map((b) => new Promise<void>((r) => {
            const requete = indexedDB.deleteDatabase(b.name!);
            requete.onsuccess = () => r(); requete.onerror = () => r(); requete.onblocked = () => r();
          })),
      );
    }
  });
}
