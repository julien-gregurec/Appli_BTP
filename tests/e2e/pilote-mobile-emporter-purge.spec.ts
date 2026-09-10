import { expect, test, type Page } from "@playwright/test";
import { allerA, cheminEtatSession } from "./pilote-mobile-aides";

/**
 * Recette des écrans « Emporter » (phase G) et de la purge multi-navigateur (phase H, R4).
 */

const CHANTIER_TERRAIN = "a4000000-0000-0000-0000-000000000002";
const DOC_PDF = "a7000000-0000-0000-0000-000000000011";
const DOC_PNG = "a7000000-0000-0000-0000-000000000012";

async function basesGestionPro(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const registre = (() => { try { return JSON.parse(localStorage.getItem("elsatia:gp:registre-bases") ?? "[]"); } catch { return []; } })();
    const natives = typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((b) => b.name ?? "") : [];
    return [...new Set([...registre, ...natives])].filter((n) => n.startsWith("elsatia:gp:"));
  });
}

/** Une base existe-t-elle vraiment ? On l'ouvre : si elle n'existait pas, elle naît vide (version 1) et on la supprime. */
async function baseContientDesDonnees(page: Page, nom: string): Promise<boolean> {
  return page.evaluate(async (n) => {
    return new Promise<boolean>((r) => {
      const requete = indexedDB.open(n);
      let creee = false;
      requete.onupgradeneeded = () => { creee = true; };
      requete.onsuccess = () => {
        const base = requete.result;
        const stores = [...base.objectStoreNames];
        base.close();
        if (creee) { indexedDB.deleteDatabase(n); r(false); return; }
        r(stores.length > 0);
      };
      requete.onerror = () => r(false);
    });
  }, nom);
}

test.describe("@pilote @emporter documents emportés pour consultation hors ligne", () => {
  test.use({ storageState: cheminEtatSession("ouvrierTerrainA") });

  test("@pilote @emporter rien n'est téléchargé sans un geste, et la taille est annoncée", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allerA(page, `/chantiers/${CHANTIER_TERRAIN}/documents`);
    const bloc = page.locator('[data-test="documents-emportes"]');
    await expect(bloc).toBeVisible();
    await expect(bloc.locator(`[data-test="doc-${DOC_PDF}"]`)).toContainText("92 octets");
    await expect(bloc.locator(`[data-test="doc-${DOC_PDF}"]`)).toContainText("Non emporté");
    await expect(bloc.locator(`[data-test="doc-${DOC_PNG}"]`)).toContainText("Non emporté");
  });

  test("@pilote @emporter un PDF et une image emportés restent consultables sans réseau", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allerA(page, `/chantiers/${CHANTIER_TERRAIN}/documents`);
    const bloc = page.locator('[data-test="documents-emportes"]');
    for (const id of [DOC_PDF, DOC_PNG]) {
      await bloc.locator(`[data-test="doc-${id}"]`).getByRole("button", { name: /emporter/i }).click();
      await expect(bloc.locator(`[data-test="doc-${id}"]`)).toContainText("Disponible hors ligne", { timeout: 20_000 });
      await expect(bloc.locator(`[data-test="doc-${id}"]`)).toContainText("synchronisé le");
    }
    // Hors réseau, le contenu est lu depuis l'appareil — octet pour octet.
    await page.context().setOffline(true);
    const tailles = await page.evaluate(async (ids) => {
      const base = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open("elsatia:gp:a0000000-0000-0000-0000-000000000001:40000000-0000-0000-0000-000000000003"); q.onsuccess = () => r(q.result); });
      const lire = (id: string) => new Promise<number>((r) => { const q = base.transaction("documents_emportes").objectStore("documents_emportes").get(id); q.onsuccess = () => r((q.result?.contenu as Blob | undefined)?.size ?? -1); });
      const res = await Promise.all(ids.map(lire)); base.close(); return res;
    }, [DOC_PDF, DOC_PNG]);
    expect(tailles).toEqual([92, 70]);
    await page.context().setOffline(false);
  });

  test("@pilote @emporter un document retiré de l'appareil ne l'est plus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allerA(page, `/chantiers/${CHANTIER_TERRAIN}/documents`);
    const ligne = page.locator(`[data-test="doc-${DOC_PNG}"]`);
    if (await ligne.getByRole("button", { name: /emporter/i }).isVisible()) {
      await ligne.getByRole("button", { name: /emporter/i }).click();
      await expect(ligne).toContainText("Disponible hors ligne", { timeout: 20_000 });
    }
    await ligne.getByRole("button", { name: /retirer de l’appareil/i }).click();
    await expect(ligne).toContainText("Non emporté");
  });

  test("@pilote @emporter le plan réservé aux gestionnaires n'est même pas proposé", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allerA(page, `/chantiers/${CHANTIER_TERRAIN}/documents`);
    await expect(page.locator('[data-test="documents-emportes"]')).not.toContainText("Plan privé A");
    // Et le téléchargement direct est refusé par la base, pas seulement caché par l'écran.
    const statut = await page.evaluate(async () => (await fetch("/api/documents/a7000000-0000-0000-0000-000000000002")).status);
    expect(statut).toBe(404);
  });
});

test.describe("@pilote @purge purge effective sur Chromium, WebKit et Firefox", () => {
  test.use({ storageState: cheminEtatSession("ouvrierTerrainA") });

  test("@pilote @purge la déconnexion efface les bases, même avec une connexion ouverte et deux onglets", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allerA(page, `/chantiers/${CHANTIER_TERRAIN}/documents`);
    const ligne = page.locator(`[data-test="doc-${DOC_PDF}"]`);
    if (await ligne.getByRole("button", { name: /emporter/i }).isVisible()) {
      await ligne.getByRole("button", { name: /emporter/i }).click();
      await expect(ligne).toContainText("Disponible hors ligne", { timeout: 20_000 });
    }
    const avant = await basesGestionPro(page);
    expect(avant.length, "aucune base à purger : le test ne prouverait rien").toBeGreaterThan(0);

    // Un second onglet garde la base OUVERTE — cas qui bloquait `deleteDatabase`.
    const second = await context.newPage();
    await second.goto(`/chantiers/${CHANTIER_TERRAIN}/documents`);
    await second.evaluate((nom) => new Promise<void>((r) => { const q = indexedDB.open(nom); q.onsuccess = () => { (window as unknown as { __tenue: IDBDatabase }).__tenue = q.result; q.result.onversionchange = () => q.result.close(); r(); }; }), avant[0]);

    await page.getByRole("button", { name: /ouvrir le menu/i }).click();
    await page.getByRole("button", { name: /se déconnecter/i }).click();
    await expect(page).toHaveURL(/\/login/);
    // L'autre onglet n'est prévenu qu'une fois la session FERMÉE : il doit donc rester sur
    // /login, et non être renvoyé vers /dashboard par une session encore valide.
    await expect(second).toHaveURL(/\/login/, { timeout: 15_000 });

    for (const nom of avant) {
      await expect.poll(() => baseContientDesDonnees(page, nom), { timeout: 10_000, message: `la base ${nom} a survécu à la déconnexion` }).toBe(false);
    }
    await second.close();
  });
});
