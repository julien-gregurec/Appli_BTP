import { expect, test } from "@playwright/test";
import {
  COMPTES,
  LARGEURS_TELEPHONE,
  MARQUEUR_ENTREPRISE_B,
  cheminEtatSession,
  connecter,
  debordementHorizontal,
  verifierEcranMobile,
} from "./pilote-mobile-aides";

/**
 * Recette AUTHENTIFIÉE des six parcours du pilote mobile V1.
 *
 * Ferme la réserve R1 du lot précédent : « les six parcours authentifiés n'ont jamais été vus
 * sur un téléphone ». Ces tests ouvrent réellement l'application, derrière connexion, contre
 * la base de recette, sur les moteurs mobiles de Chromium et de WebKit.
 *
 * Les sessions sont ouvertes une fois pour toutes par `pilote-mobile-sessions.setup.ts` et
 * réutilisées ici. Ce n'est pas un raccourci : `/login` n'accepte que 10 tentatives par
 * tranche de 10 minutes et par IP, et une recette qui se reconnecte à chaque écran se fait
 * refuser avant d'avoir rien prouvé. C'est d'ailleurs le comportement d'un vrai téléphone.
 */

test.describe("@responsive @pilote parcours du salarié de terrain", () => {
  test.use({ storageState: cheminEtatSession("ouvrierA") });

  const PARCOURS_OUVRIER = ["/dashboard", "/pointage", "/notes-frais", "/mes-travaux"] as const;

  for (const largeur of LARGEURS_TELEPHONE) {
    test(`@responsive @pilote les écrans du salarié tiennent à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      for (const route of PARCOURS_OUVRIER) {
        await page.goto(route);
        await verifierEcranMobile(page, `${route} @${largeur}px`);
      }
    });
  }

  test("@responsive @pilote le menu mobile s'ouvre et navigue au doigt", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");

    const menu = page.getByRole("button", { name: /ouvrir le menu/i });
    await expect(menu).toBeVisible();

    // Au CLIC, pas au survol : un doigt ne survole pas.
    await menu.click();

    // Le lien est cherché DANS le tiroir. Le tableau de bord affiche sa propre grille de
    // modules, qui contient elle aussi un « Pointage » : viser le rôle sans portée
    // atteignait ce second lien, resté derrière le voile de fermeture du tiroir — l'échec
    // signalait alors une interception de clic, ce qui ressemblait à un défaut de l'appli.
    // Le libellé exact du menu est « Pointage heures » — pas « Pointage ». Viser le
    // second ne trouvait rien dans le tiroir et renvoyait vers la grille du tableau de bord.
    const tiroir = page.locator("#navigation-mobile");
    const lienPointage = tiroir.getByRole("link", { name: "Pointage heures", exact: true });
    await expect(lienPointage).toBeVisible();
    await lienPointage.click();
    await expect(page).toHaveURL(/\/pointage/);

    // Le tiroir se referme après navigation : sinon il masque l'écran atteint.
    //
    // On mesure sa POSITION, pas sa visibilité. Le tiroir se ferme par translation
    // (`-translate-x-full`) et reste donc dans le DOM avec une boîte non vide : Playwright
    // le tient pour « visible » alors qu'il est entièrement hors de l'écran. Vérifier
    // `toBeHidden()` aurait fait échouer un comportement correct.
    await expect.poll(async () => {
      const boite = await tiroir.boundingBox();
      return boite ? Math.round(boite.x + boite.width) : 0;
    }, { timeout: 5_000 }).toBeLessThanOrEqual(0);
  });

  test("@responsive @pilote les gestes du terrain sont atteignables sans déplier de menu", async ({ page }) => {
    // Défaut trouvé en recette : les groupes de navigation étaient repliés par défaut, ce
    // qui a du sens pour un administrateur aux cinquante entrées. Un salarié en a quatre —
    // et « Pointage heures », son geste le plus fréquent, était enfermé dans un accordéon
    // nommé « Équipe & temps ». Ouvrir le menu, deviner le groupe, le déplier, toucher le
    // lien : quatre gestes pour pointer une arrivée, sur un téléphone tenu d'une main.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /ouvrir le menu/i }).click();

    const tiroir = page.locator("#navigation-mobile");
    for (const libelle of ["Pointage heures", "Notes de frais", "Chantiers"]) {
      await expect(
        tiroir.getByRole("link", { name: libelle, exact: true }),
        `« ${libelle} » exige de déplier un groupe`,
      ).toBeVisible();
    }
  });

  test("@responsive @pilote le paysage ne casse pas le pointage", async ({ page }) => {
    // Un salarié qui pose son téléphone sur un capot bascule en paysage sans y penser.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/pointage");
    const debordement = await debordementHorizontal(page);
    expect(debordement, `pointage en paysage déborde de ${debordement} px`).toBeLessThanOrEqual(8);
  });
});

test.describe("@responsive @pilote parcours du chef d'équipe", () => {
  test.use({ storageState: cheminEtatSession("chefEquipeA") });

  for (const largeur of LARGEURS_TELEPHONE) {
    test(`@responsive @pilote le planning tient à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await page.goto("/planning");
      await verifierEcranMobile(page, `/planning @${largeur}px`);
    });
  }
});

test.describe("@responsive @pilote parcours du conducteur de travaux", () => {
  test.use({ storageState: cheminEtatSession("conducteurA") });

  for (const largeur of LARGEURS_TELEPHONE) {
    test(`@responsive @pilote les chantiers tiennent à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await page.goto("/chantiers");
      await verifierEcranMobile(page, `/chantiers @${largeur}px`);
    });
  }

  test("@responsive @pilote le retour mobile ramène à la liste, pas au tableau de bord", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chantiers");

    // « Nouveau chantier » porte lui aussi un href sous /chantiers/ et vient en premier
    // dans le DOM : sans cette exclusion, le test ouvrait le formulaire de création et
    // concluait à tort que la fiche ne s'ouvrait pas.
    const premierChantier = page
      .locator("main a[href^='/chantiers/']:not([href$='/nouveau'])")
      .first();
    await expect(premierChantier).toBeVisible();
    await premierChantier.click();
    await expect(page).toHaveURL(/\/chantiers\/[0-9a-f-]+/);

    // En mode installé il n'y a pas de bouton retour du navigateur : c'est `MobileBack` qui
    // doit ramener à la liste. Le renvoyer au tableau de bord ferait perdre le contexte.
    await page.getByRole("button", { name: /revenir à la page précédente/i }).click();
    await expect(page).toHaveURL(/\/chantiers$/);
  });
});

test.describe("@pilote refus et cloisonnement", () => {
  test.describe("compte sans habilitation", () => {
    test.use({ storageState: cheminEtatSession("sansDroitA") });

    test("@pilote reçoit un refus lisible, jamais un écran vide", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/dashboard");

      // Le témoin n'a AUCUNE permission. Quelle que soit la page atteinte, elle doit dire
      // quelque chose : un écran vide laisserait croire à une panne de l'application.
      const corps = (await page.locator("body").innerText()).trim();
      expect(corps.length, "le témoin sans droit voit un écran vide").toBeGreaterThan(40);
      await expect(page.locator("body")).not.toContainText(MARQUEUR_ENTREPRISE_B);
    });
  });

  test.describe("administrateur de l'entreprise A", () => {
    test.use({ storageState: cheminEtatSession("adminA") });

    test("@pilote ne voit jamais le décor de l'entreprise B", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ["/dashboard", "/chantiers", "/notes-frais", "/planning", "/clients"]) {
        await page.goto(route);
        await expect(page.locator("body"), `${route} laisse fuir l'entreprise B`)
          .not.toContainText(MARQUEUR_ENTREPRISE_B);
      }
    });
  });
});

/**
 * Scénarios qui éprouvent la CONNEXION elle-même.
 *
 * Ils passent par le vrai formulaire et consomment donc le quota de `/login`. Ils sont
 * volontairement peu nombreux : trois connexions par exécution, très en deçà des dix
 * autorisées par tranche de dix minutes.
 */
test.describe("@pilote sortie de session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@pilote une session expirée renvoie à la connexion sans écran blanc", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connecter(page, COMPTES.ouvrierA);
    await page.goto("/pointage");

    // On invalide la session comme le ferait une expiration : les cookies disparaissent.
    await page.context().clearCookies();
    await page.goto("/pointage");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("@pilote changer d'utilisateur ne laisse aucune trace du précédent", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    /**
     * Clés dont la survie est LÉGITIME.
     *
     * `elsatia-appareil-id` identifie l'APPAREIL PHYSIQUE, pas la personne. Le serveur le
     * range sous `appareils_comptes`, dont la contrainte `UNIQUE (utilisateur_id,
     * identifiant_appareil)` crée une ligne DISTINCTE par utilisateur : le même téléphone
     * partagé par deux salariés produit deux lignes, et révoquer celle de l'un ne touche pas
     * l'autre. Aucune donnée de A n'est donc lisible par B à travers cette clé.
     *
     * L'effacer à chaque déconnexion serait un défaut, pas une précaution : la liste des
     * appareils se remplirait de fantômes et le plafond d'appareils facturés deviendrait faux.
     */
    const CLES_APPAREIL_LEGITIMES = ["elsatia-appareil-id", "liria-appareil-id"];

    const empreinte = () => page.evaluate(async () => {
      const trace = { local: [] as string[], bases: [] as string[] };
      try { trace.local = Object.keys(localStorage).filter((c) => c.startsWith("elsatia")); } catch { /* refusé */ }
      if (typeof indexedDB?.databases === "function") {
        trace.bases = (await indexedDB.databases())
          .map((b) => b.name ?? "").filter((n) => n.startsWith("elsatia:gp:"));
      }
      return trace;
    });

    await connecter(page, COMPTES.adminA);
    await page.goto("/dashboard");
    const avant = await empreinte();

    // Déconnexion par le VRAI bouton : c'est lui qui déclenche la purge.
    await page.getByRole("button", { name: /ouvrir le menu/i }).click();
    await page.getByRole("button", { name: /se déconnecter/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await connecter(page, COMPTES.adminB);
    await page.goto("/dashboard");
    const apres = await empreinte();

    for (const cle of avant.local) {
      if (CLES_APPAREIL_LEGITIMES.includes(cle)) continue;
      expect(apres.local, `la clé « ${cle} » de A survit chez B`).not.toContain(cle);
    }
    for (const base of avant.bases) {
      expect(apres.bases, `la base « ${base} » de A survit chez B`).not.toContain(base);
    }
    // Et rien de l'entreprise A ne doit s'afficher chez B.
    await expect(page.locator("body")).not.toContainText("RECETTE_A_");
  });
});
