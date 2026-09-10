import { expect, test, type Page } from "@playwright/test";
import { allerA, cheminEtatSession, viderStockageLocal } from "./pilote-mobile-aides";

/**
 * Recette du POINTAGE HORS LIGNE.
 *
 * Ces scénarios éprouvent ce qu'un salarié vit dans un sous-sol ou une cage d'ascenseur :
 * il pointe, l'application n'a pas de réseau, et il doit malgré tout pouvoir partir travailler
 * en sachant que sa saisie ne sera pas perdue.
 *
 * Le réseau est coupé par `context.setOffline`, qui agit sur la PILE RÉSEAU du navigateur.
 * Ce n'est pas un drapeau applicatif qu'on positionnerait soi-même : les requêtes échouent
 * réellement, comme sur le terrain.
 */

/** Lit la file locale telle qu'elle est réellement écrite sur l'appareil. */
async function lireFileLocale(page: Page, entrepriseId: string, utilisateurId: string) {
  return page.evaluate(async ({ entrepriseId, utilisateurId }) => {
    const nom = `elsatia:gp:${entrepriseId}:${utilisateurId}`;
    const base = await new Promise<IDBDatabase | null>((r) => {
      const requete = indexedDB.open(nom);
      requete.onsuccess = () => r(requete.result);
      requete.onerror = () => r(null);
    });
    if (!base || !base.objectStoreNames.contains("mutations")) return [];
    const lignes = await new Promise<unknown[]>((r) => {
      const requete = base.transaction("mutations", "readonly").objectStore("mutations").getAll();
      requete.onsuccess = () => r(requete.result as unknown[]);
      requete.onerror = () => r([]);
    });
    base.close();
    return lignes as { id: string; type: string; etat: string; entrepriseId: string; utilisateurId: string; capteA: number }[];
  }, { entrepriseId, utilisateurId });
}

/**
 * Le bouton de pointage, quel que soit l'état du salarié.
 *
 * L'écran montre une carte « arrivée » tant qu'aucune session n'est ouverte, et une carte
 * « départ » ensuite. Viser uniquement l'arrivée rendait les scénarios DÉPENDANTS DE LEUR
 * ORDRE : le premier ouvrait une session, et les suivants ne trouvaient plus le bouton
 * qu'ils attendaient — un échec qui parlait de l'enchaînement des tests, pas du hors-ligne.
 *
 * Ce que ces scénarios éprouvent — dépôt en file, identité inscrite, survie au redémarrage,
 * rejeu non dupliquant — vaut identiquement pour l'arrivée et pour le départ.
 */
function boutonPointage(page: Page) {
  return page.getByRole("button", {
    name: /pointer l’arrivée|pointer le départ|localisation en cours/i,
  });
}

/** Identités du décor, telles que le prélude de recette les pose. */
const ENTREPRISE_A = "a0000000-0000-0000-0000-000000000001";
const OUVRIER_TERRAIN_A = "40000000-0000-0000-0000-000000000003";

test.describe("@pilote @horsligne pointage sans réseau", () => {
  test.use({ storageState: cheminEtatSession("ouvrierTerrainA") });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pointage");
    await viderStockageLocal(page);
  });

  test("@pilote @horsligne une arrivée saisie sans réseau est conservée, pas perdue", async ({ page }) => {
    await page.goto("/pointage");
    const bouton = boutonPointage(page);
    await expect(bouton).toBeVisible();

    await page.context().setOffline(true);
    await expect(bouton).toBeEnabled({ timeout: 20_000 });
    await bouton.click();

    // L'utilisateur DOIT être informé : une saisie qui disparaît en silence est pire
    // qu'un refus, parce qu'il croira avoir pointé.
    const bandeau = page.locator('[data-test="pointage-hors-ligne"]');
    await expect(bandeau).toBeVisible();
    await expect(bandeau).toContainText(/conservé sur l’appareil/i);

    const file = await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A);
    expect(file, "rien n'a été déposé dans la file").toHaveLength(1);
    expect(["pointage_arrivee", "pointage_depart"]).toContain(file[0].type);
    expect(file[0].etat).toBe("en_attente");
    // L'identité qui a préparé la mutation est inscrite avec elle : c'est ce qui permettra
    // de refuser son envoi sous un autre compte.
    expect(file[0].entrepriseId).toBe(ENTREPRISE_A);
    expect(file[0].utilisateurId).toBe(OUVRIER_TERRAIN_A);

    await page.context().setOffline(false);
  });

  test("@pilote @horsligne un double clic ne dépose qu'une seule fois… ou deux fois distinctes", async ({ page }) => {
    await page.goto("/pointage");
    const bouton = boutonPointage(page);
    await expect(bouton).toBeVisible();

    await page.context().setOffline(true);
    await expect(bouton).toBeEnabled({ timeout: 20_000 });

    // Un pouce sur un écran mouillé produit facilement deux appuis.
    await bouton.click();
    await bouton.click();

    const file = await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A);
    // Ce qui compte n'est pas le nombre d'entrées mais qu'elles portent des identifiants
    // DISTINCTS : deux entrées de même identifiant se rejoueraient l'une l'autre en
    // silence, alors que deux identifiants distincts se verront et s'arbitreront — la
    // seconde butera sur l'unicité « une seule session ouverte par salarié ».
    const identifiants = new Set(file.map((m) => m.id));
    expect(identifiants.size).toBe(file.length);
    expect(file.length).toBeGreaterThanOrEqual(1);

    await page.context().setOffline(false);
  });

  test("@pilote @horsligne la file survit au redémarrage de l'application", async ({ page }) => {
    await page.goto("/pointage");
    const bouton = boutonPointage(page);
    await page.context().setOffline(true);
    await expect(bouton).toBeEnabled({ timeout: 20_000 });
    await bouton.click();
    await expect(page.locator('[data-test="pointage-hors-ligne"]')).toBeVisible();

    // Redémarrage : on quitte la page et on revient, toujours sans réseau. C'est ce que fait
    // un système mobile qui évince un onglet pour récupérer de la mémoire.
    await page.goto("about:blank");
    await page.context().setOffline(false);
    await page.goto("/pointage");

    const file = await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A);
    expect(file.length, "la file a été perdue au redémarrage").toBeGreaterThanOrEqual(1);
  });

  test("@pilote @horsligne le retour du réseau transmet la saisie, et le rejeu ne duplique pas", async ({ page }) => {
    await page.goto("/pointage");
    const bouton = boutonPointage(page);
    await page.context().setOffline(true);
    await expect(bouton).toBeEnabled({ timeout: 20_000 });
    await bouton.click();
    await expect(page.locator('[data-test="pointage-hors-ligne"]')).toBeVisible();

    const avant = await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A);
    const identifiant = avant[0].id;

    // Retour du réseau : la reprise se déclenche à l'ouverture et sur l'événement `online`.
    await page.context().setOffline(false);
    await page.goto("/pointage");

    await expect
      .poll(async () => (await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A))
        .find((m) => m.id === identifiant)?.etat, { timeout: 20_000 })
      .toMatch(/synchronise|conflit|echec/);

    const apres = (await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A)).find((m) => m.id === identifiant)!;

    // Une mutation acquittée ne doit JAMAIS repartir : la table de transitions l'interdit.
    // On recharge pour vérifier qu'aucune reprise ne la remet en attente.
    await page.goto("/pointage");
    await page.waitForTimeout(1500);
    const final = (await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A)).find((m) => m.id === identifiant)!;
    expect(final.etat, "une mutation acquittée est repartie en file").toBe(apres.etat);
  });
});

test.describe("@pilote @horsligne refus sous une autre identité", () => {
  test.use({ storageState: cheminEtatSession("ouvrierTerrainA") });

  test("@pilote @horsligne une saisie préparée par A ne part jamais sous B", async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // A prépare une saisie hors réseau.
    await allerA(page, "/pointage");
    await viderStockageLocal(page);
    await allerA(page, "/pointage");

    const bouton = boutonPointage(page);
    await page.context().setOffline(true);
    await expect(bouton).toBeEnabled({ timeout: 20_000 });
    await bouton.click();
    await expect(page.locator('[data-test="pointage-hors-ligne"]')).toBeVisible();

    const preparee = await lireFileLocale(page, ENTREPRISE_A, OUVRIER_TERRAIN_A);
    expect(preparee).toHaveLength(1);
    const mutation = preparee[0];

    await page.context().setOffline(false);

    // B ouvre l'application sur le même appareil, dans un contexte à part — ce qui reproduit
    // fidèlement le téléphone de chantier qu'on se passe, sans consommer le quota de /login
    // (10 tentatives par tranche de 10 minutes et par IP).
    const contexteB = await browser.newContext({
      storageState: cheminEtatSession("ouvrierB"),
      ignoreHTTPSErrors: true,
    });
    try {
      const pageB = await contexteB.newPage();
      await pageB.goto("/dashboard");

      // B tente d'envoyer la file de A telle quelle.
      const refus = await pageB.evaluate(async (m) => {
        const reponse = await fetch("/api/mobile/offline/mutations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mutations: [m] }),
        });
        return { statut: reponse.status, corps: await reponse.json() };
      }, mutation);

      // Le serveur REFUSE explicitement : il n'applique pas sous l'identité courante, et il
      // ne se contente pas non plus d'ignorer en silence — un refus muet laisserait croire
      // à une transmission réussie.
      expect(refus.statut).toBe(200);
      const resultat = refus.corps.resultats[0];
      expect(resultat.issue, "une saisie de A a été acceptée sous B").toBe("refus");
      expect(resultat.motif).toMatch(/autre compte/i);
    } finally {
      await contexteB.close();
    }
  });
});
