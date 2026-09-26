import { expect, test } from "@playwright/test";
import { COMPTES, SEAUX, empreinteNavigateur, seConnecter, seConnecterParFormulaire, seDeconnecter } from "./colors-aides";

/**
 * Recette authentifiée d'ELSATIA Colors — pile dédiée `colors-pilot-e2e`.
 *
 * Ces parcours sont ceux que le lot précédent n'avait PAS pu exercer, faute de
 * base au ledger du train V3. Ils s'exécutent contre une pile Supabase montée
 * pour cette seule mission, avec sept identités de recette et deux
 * organisations, dont la seconde n'existe que pour prouver le cloisonnement.
 *
 * Aucun `retry`, aucun délai global rallongé : un test instable est un défaut à
 * comprendre, pas un test à répéter jusqu'à ce qu'il passe.
 */

test.describe("@colors-auth accès", () => {
  test("@responsive connexion puis déconnexion", async ({ page }) => {
    await seConnecterParFormulaire(page, COMPTES.admin);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bonjour");
    await seDeconnecter(page);
    await expect(page.getByText("Vous êtes déconnecté")).toBeVisible();
  });

  test("un lien profond conduit à la page demandée après connexion", async ({ page }) => {
    // Le défaut fermé par le lot précédent : la destination était perdue et l'on
    // atterrissait sur le tableau de bord. Ici on vérifie l'aller ET le retour.
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await page.waitForURL(new RegExp(`next=%2Finventaire%2F${SEAUX.aAvecPhoto}`));
    await page.getByLabel("Adresse email").fill(COMPTES.admin);
    await page.getByLabel("Mot de passe").fill(process.env.MDP_RECETTE!);
    await page.getByRole("button", { name: "Se connecter à Colors" }).click();
    await page.waitForURL(new RegExp(`/inventaire/${SEAUX.aAvecPhoto}$`));
  });

  test("une session terminée est annoncée, et la page demandée conservée", async ({ page, context }) => {
    await seConnecterParFormulaire(page, COMPTES.admin);
    await page.goto("/depots");
    await context.clearCookies();
    await page.goto("/depots");
    await page.waitForURL(/\/login\?next=%2Fdepots&error=session-expiree/);
    await expect(page.getByText(/Votre session a pris fin/)).toBeVisible();
  });

  test("un compte sans habilitation Colors est refusé sans être présenté comme un mauvais mot de passe", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill(COMPTES.sansDroit);
    await page.getByLabel("Mot de passe").fill(process.env.MDP_RECETTE!);
    await page.getByRole("button", { name: "Se connecter à Colors" }).click();
    await page.waitForURL(/\/login\?error=acces-colors/);
    await expect(page.getByText(/ne dispose pas d’un accès actif à Colors/)).toBeVisible();
    await expect(page.getByText(/Identifiants incorrects/)).toHaveCount(0);
  });
});

test.describe("@colors-auth mise en service", () => {
  test("une organisation entièrement en service ne voit plus le bandeau de démarrage", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await expect(page.getByRole("heading", { name: "Mettre Colors en service" })).toHaveCount(0);
  });

  test("une organisation incomplète voit les étapes qui lui restent", async ({ page }) => {
    await seConnecter(page, COMPTES.autreEntreprise);
    const bandeau = page.getByRole("heading", { name: "Mettre Colors en service" });
    await expect(bandeau).toBeVisible();
    await expect(page.getByText("Photographier un seau", { exact: true })).toBeVisible();
    await expect(page.getByText("Régler le seuil de stock faible", { exact: true })).toBeVisible();
  });
});

test.describe("@colors-auth parcours métier", () => {
  test("créer un seau, le modifier, le retrouver dans l'historique", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/inventaire");
    await page.getByText("Ajouter un seau manuellement").click();
    await page.getByLabel("Marque", { exact: true }).fill("Recette E2E");
    await page.getByLabel("Produit", { exact: true }).fill("Produit créé par la recette");
    await page.getByLabel("Couleur HEX").fill("#1F7A4C");
    await page.getByRole("button", { name: "Créer le seau" }).click();

    await page.waitForURL(/\/inventaire\/[0-9a-f-]{36}\?ok=seau-ajoute/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Recette E2E");

    await page.getByText("Modifier les informations").click();
    await page.getByLabel("Produit", { exact: true }).fill("Produit corrigé");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(/ok=informations-mises-a-jour/);
    await expect(page.getByText("Informations mises à jour")).toBeVisible();

    // Le journal doit porter l'ancienne ET la nouvelle valeur.
    await expect(page.getByText("Produit créé par la recette")).toBeVisible();
    await expect(page.getByText("Produit corrigé").first()).toBeVisible();
  });

  test("un double envoi du formulaire ne crée pas deux seaux", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/inventaire?q=Doublon");
    const avant = await page.locator(".bucket-card").count();
    await page.goto("/inventaire");
    await page.getByText("Ajouter un seau manuellement").click();
    await page.getByLabel("Marque", { exact: true }).fill("Doublon");
    await page.getByLabel("Produit", { exact: true }).fill("Essai de double envoi");
    const bouton = page.getByRole("button", { name: "Créer le seau" });
    // Deux clics rapprochés : la Server Action ne doit être jouée qu'une fois.
    await Promise.all([bouton.click(), bouton.click().catch(() => undefined)]);
    await page.waitForURL(/\/inventaire\/[0-9a-f-]{36}/);
    await page.goto("/inventaire?q=Doublon");
    await expect(page.locator(".bucket-card")).toHaveCount(avant + 1);
  });

  test("déplacer un seau vers un autre emplacement laisse une trace", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await page.getByLabel("Déplacer vers").selectOption({ label: "Camion 1" });
    await page.getByRole("button", { name: "Déplacer" }).click();
    await page.waitForURL(/ok=seau-deplace/);
    await expect(page.getByText("Seau déplacé")).toBeVisible();
    await expect(page.getByText("Camion 1").first()).toBeVisible();
  });

  test("une sortie de stock met à jour le niveau et exige un motif", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await page.getByLabel("Nouvelle quantité").fill("0.5");
    await page.getByLabel("Motif").fill("Retouche cage d’escalier");
    await page.getByRole("button", { name: "Mettre à jour" }).click();
    await page.waitForURL(/ok=quantite-mise-a-jour/);
    await expect(page.getByText("Quantité mise à jour")).toBeVisible();
    await expect(page.getByText("10%")).toBeVisible();
  });
});

test.describe("@colors-auth teinte, référence et finition", () => {
  test("la référence la plus proche est proposée depuis la teinte DÉCLARÉE, avec son écart", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await expect(page.locator('[data-test="reference-proposee"]')).toHaveText("TEST-BLANC");
    await expect(page.getByText(/ΔE \d+\.\d+ —/)).toBeVisible();
    await expect(page.getByText(/D’après Nuancier fictif de recette ELSATIA, version recette-2026-09/)).toBeVisible();
  });

  test("l'application n'affirme jamais mesurer une couleur depuis une photographie", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    const texte = await page.locator(".nuancier-panel").innerText();
    expect(texte).toMatch(/pas mesurée/);
    expect(texte).toMatch(/proposition de proximité/);
    // Aucune formulation ne doit laisser croire à une mesure ou à une certitude.
    expect(texte).not.toMatch(/couleur mesurée|analyse de la photo|mesure colorimétrique|correspondance exacte|référence certifiée/i);
  });

  test("déclarer une finition l'enregistre et la journalise", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await expect(page.locator('[data-test="finition"]')).toHaveText("Finition inconnue");
    await page.getByLabel("Déclarer la finition").selectOption("satine");
    await page.getByRole("button", { name: "Enregistrer la finition" }).click();
    await page.waitForURL(/ok=finition-enregistree/);
    await expect(page.getByText("Finition enregistrée")).toBeVisible();
    await expect(page.locator('[data-test="finition"]')).toHaveText("Satiné");
    await expect(page.getByText("Finition", { exact: false }).first()).toBeVisible();
  });

  test("une référence fabricant est proposée mais jamais retenue, et l'écran l'explique", async ({ page }) => {
    // Décision D1 : `ral_approxime` reste réservé au format RAL. Une référence
    // fabricant n'a aucune colonne où être retenue. L'écran ne doit donc PAS
    // proposer de bouton qui échouerait ensuite : il explique.
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await expect(page.locator('[data-test="reference-proposee"]')).toHaveText("TEST-BLANC");
    await expect(page.locator('[data-test="nature-reference"]')).toHaveText("Référence fabricant");
    await expect(page.getByRole("button", { name: /Retenir/ })).toHaveCount(0);
    await expect(page.locator('[data-test="reference-non-retenable"]')).toBeVisible();
    await expect(page.locator('[data-test="sans-reference"]')).toBeVisible();
  });

  test("l'export distingue une référence fabricant d'une référence RAL", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    const csv = await (await page.request.get("/api/export/inventaire")).text();
    expect(csv).toContain("Référentiel");
    expect(csv).toContain('"Fabricant"');
    // Aucune ligne ne doit présenter cette proposition comme du RAL.
    expect(csv).not.toContain('"TEST-BLANC";"RAL"');
  });

  test("l'écran Nuanciers cite la source, la version et la licence du nuancier chargé", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/nuanciers");
    await expect(page.getByText("Nuancier fictif de recette ELSATIA")).toBeVisible();
    await expect(page.getByText("recette-2026-09")).toBeVisible();
    await expect(page.getByText(/Aucune donnee RAL ni fabricant|Aucune donnée RAL ni fabricant/)).toBeVisible();
  });
});

test.describe("@colors-auth photo", () => {
  test("une photo piégée est nettoyée avant d'être stockée, et c'est vérifiable sur le fichier servi", async ({ page }) => {
    // Décision D2. La photo envoyée porte GPS, orientation, appareil, logiciel,
    // date et profil colorimétrique. Ce qui est stocké ne doit rien en garder.
    const sharp = (await import("sharp")).default;
    const piegee = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 20, g: 120, b: 200 } },
    })
      .withExif({
        IFD0: { Make: "FabricantDeRecette", Model: "ModeleDeRecette X1", Software: "LogicielDeRecette 1.0", Orientation: "6" },
        IFD2: { DateTimeOriginal: "2026:09:10 08:30:00" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 2999/100", GPSLongitudeRef: "E", GPSLongitude: "2/1 17/1 2999/100" },
      })
      .withMetadata({ orientation: 6 })
      .withIccProfile("srgb")
      .jpeg({ quality: 90 })
      .toBuffer();

    // La fixture est bien piégée : sans cette vérification, la suite ne
    // prouverait rien.
    expect(Buffer.from(piegee).toString("latin1")).toContain("FabricantDeRecette");

    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await page.getByLabel("Photo du seau").setInputFiles({ name: "chantier.jpg", mimeType: "image/jpeg", buffer: piegee });
    await page.getByRole("button", { name: "Ajouter la photo" }).click();
    await expect(page.getByRole("status")).toContainText("Photo enregistrée", { timeout: 30_000 });

    // Le fichier réellement servi par le stockage, récupéré par son lien signé.
    await page.reload();
    const source = await page.locator(".photo-panel img").first().getAttribute("src");
    expect(source, "aucune photo servie").toBeTruthy();
    const servie = await page.request.get(source!);
    expect(servie.status()).toBe(200);
    const octets = Buffer.from(await servie.body()).toString("latin1");

    for (const secret of ["FabricantDeRecette", "ModeleDeRecette", "LogicielDeRecette", "2026:09:10", "GPSLatitude", "ICC_PROFILE"]) {
      expect(octets, `« ${secret} » survit dans le fichier stocké`).not.toContain(secret);
    }
  });

  test("un fichier qui n'est pas une image est refusé, et rien n'est stocké", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await page.getByLabel("Photo du seau").setInputFiles({
      name: "faux.jpg", mimeType: "image/jpeg", buffer: Buffer.from("ceci n'est pas une image"),
    });
    await page.getByRole("button", { name: "Ajouter la photo" }).click();
    await expect(page.getByRole("status")).toContainText(/pas une image|non pris en charge|ne correspond pas/, { timeout: 30_000 });
  });
});

test.describe("@colors-auth activité, export et écrans annoncés", () => {
  test("l'activité récente porte l'auteur et la nature de chaque événement", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/activite");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Activité");
    await expect(page.getByText("Ada").first()).toBeVisible();
  });

  test("l'export complet porte la provenance de la référence et ne s'annonce pas partiel", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    const reponse = await page.request.get("/api/export/inventaire");
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-disposition"]).not.toContain("-partiel");
    const csv = await reponse.text();
    expect(csv).toContain("Référence proposée (non vérifiée)");
    expect(csv).toContain("Nuancier source");
    expect(csv).toContain("Moteur de correspondance");
    expect(csv).not.toContain("EXPORT INCOMPLET");
  });

  test("les écrans non livrés le disent, et ne simulent rien", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    for (const chemin of ["/imports", "/catalogues", "/utilisateurs"]) {
      await page.goto(chemin);
      await expect(page.getByText("Bientôt disponible")).toBeVisible();
      await expect(page.getByText("Aucune fonctionnalité métier n’est simulée dans ce jalon.")).toBeVisible();
    }
  });
});

test.describe("@colors-auth habilitations et cloisonnement", () => {
  test("un rôle de consultation lit sans pouvoir écrire", async ({ page }) => {
    await seConnecter(page, COMPTES.consultation);
    await page.goto("/inventaire");
    await expect(page.locator(".bucket-card").first()).toBeVisible();
    await expect(page.getByText("Ajouter un seau manuellement")).toHaveCount(0);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await expect(page.getByRole("button", { name: "Enregistrer la finition" })).toHaveCount(0);
    await expect(page.getByText("Modifier les informations")).toHaveCount(0);
  });

  test("un opérateur de dépôt ajuste une quantité mais ne gère ni emplacements ni paramètres", async ({ page }) => {
    await seConnecter(page, COMPTES.operateur);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await expect(page.getByLabel("Nouvelle quantité")).toBeVisible();
    await page.goto("/depots");
    await expect(page.getByRole("button", { name: "Ajouter l’emplacement" })).toHaveCount(0);
    await page.goto("/parametres");
    await expect(page.getByText("Lecture seule")).toBeVisible();
  });

  test("un gestionnaire de stock gère les emplacements mais pas les paramètres", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await page.goto("/depots");
    await expect(page.getByRole("button", { name: "Ajouter l’emplacement" })).toBeVisible();
    await page.goto("/parametres");
    await expect(page.getByText("Lecture seule")).toBeVisible();
  });

  test("un seau d'une autre organisation est introuvable, même par son URL exacte", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    const reponse = await page.goto(`/inventaire/${SEAUX.bConfidentiel}`);
    expect(reponse?.status()).toBe(404);
    await expect(page.getByText("Produit confidentiel B")).toHaveCount(0);
    await expect(page.getByText("Vert secret")).toHaveCount(0);
  });

  test("l'export d'une organisation ne contient rien de l'autre", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    const csv = await (await page.request.get("/api/export/inventaire")).text();
    expect(csv).not.toContain("Produit confidentiel B");
    expect(csv).not.toContain("Dépôt Sud");
  });

  test("changer de compte ne laisse aucune donnée de l'organisation précédente dans le navigateur", async ({ page }) => {
    await seConnecter(page, COMPTES.autreEntreprise);
    await page.goto("/inventaire");
    await expect(page.getByText("Produit confidentiel B")).toBeVisible();
    await seDeconnecter(page);

    await seConnecter(page, COMPTES.admin);
    await page.goto("/inventaire");
    await expect(page.getByText("Produit confidentiel B")).toHaveCount(0);

    const empreinte = await empreinteNavigateur(page);
    const tout = JSON.stringify(empreinte);
    for (const fuite of ["Produit confidentiel B", "Vert secret", "Dépôt Sud", "e0000000-0000-4000-8000-00000000000b"]) {
      expect(tout, `fuite dans le navigateur : ${fuite}`).not.toContain(fuite);
    }
    // Le cache du service worker ne doit contenir que la coquille publique.
    for (const url of empreinte.caches) {
      expect(url).toMatch(/\/(hors-ligne\.html|icons\/|sw-colors\.js)/);
    }
  });
});

test.describe("@colors-auth hors ligne", () => {
  test("hors réseau, l'application dit qu'elle est hors ligne au lieu d'un écran de connexion trompeur", async ({ page, context }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/dashboard");
    // Laisser le service worker s'installer avant de couper.
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, { timeout: 10_000 }).catch(() => undefined);
    await context.setOffline(true);
    await page.goto("/inventaire").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "Vous êtes hors ligne" })).toBeVisible();
    await expect(page.getByText(/Aucune donnée de stock n’est conservée sur cet appareil/)).toBeVisible();
    await context.setOffline(false);
  });

  test("une mutation tentée hors ligne échoue franchement, sans faire croire qu'elle a abouti", async ({ page, context }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, { timeout: 10_000 }).catch(() => undefined);
    await context.setOffline(true);
    await page.getByLabel("Nouvelle quantité").fill("3");
    await page.getByLabel("Motif").fill("Tentative hors ligne");
    await page.getByRole("button", { name: "Mettre à jour" }).click().catch(() => undefined);
    // Aucune confirmation ne doit apparaître : Colors n'a pas de file d'attente.
    await expect(page.getByText("Quantité mise à jour")).toHaveCount(0);
    context.setOffline(false);
  });

  test("après reconnexion, l'application reprend et la donnée est celle du serveur", async ({ page, context }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await context.setOffline(true);
    await page.goto("/dashboard").catch(() => undefined);
    await context.setOffline(false);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // La tentative hors ligne du test précédent ne doit avoir laissé aucune trace.
    await expect(page.getByText("Tentative hors ligne")).toHaveCount(0);
  });
});

test.describe("@colors-auth lecture d'étiquette fermée", () => {
  test("la route d'analyse refuse, et le refus est explicite", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAj/2Q==", "base64");
    const reponse = await page.request.post("/api/ocr", {
      multipart: {
        seauId: SEAUX.aAvecPhoto,
        consentement: "oui",
        photo: { name: "etiquette.jpg", mimeType: "image/jpeg", buffer: jpeg },
      },
    });
    // 409 : la demande est recevable, l'état de l'installation la refuse.
    expect(reponse.status()).toBe(409);
    const corps = await reponse.json();
    expect(corps.code).toBe("desactive");
    expect(corps.erreur).toMatch(/Aucune image n’est transmise à un tiers/);
  });

  test("aucun écran ne propose de lancer une lecture d'étiquette", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/ajout-photo");
    await expect(page.getByText("Lecture d’étiquette inactive")).toBeVisible();
    await expect(page.getByText(/Aucune image n’est transmise à un tiers/)).toBeVisible();
    await expect(page.getByRole("button", { name: /lire l.étiquette|analyser/i })).toHaveCount(0);
  });

  test("l'écran d'ajout par photo n'affirme plus qu'un contrat de prestataire est prêt", async ({ page }) => {
    // L'ancienne version l'annonçait alors qu'aucun prestataire n'était
    // contractualisé ni implémenté.
    await seConnecter(page, COMPTES.admin);
    await page.goto("/ajout-photo");
    const texte = await page.locator("main").innerText();
    expect(texte).not.toMatch(/contrat de fournisseur OCR est prêt/i);
    expect(texte).toMatch(/aucune couleur\s+depuis la photographie|aucune couleur depuis la photographie/);
  });
});

test.describe("@colors-auth terrain", () => {
  test("@responsive l'inventaire est utilisable au doigt, sans débordement", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto("/inventaire");
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement).toBeLessThanOrEqual(0);

    const petites = await page.evaluate(() =>
      [...document.querySelectorAll("a.bucket-card, .filter-bar button, .topbar button, .topbar a")]
        .map((el) => ({ c: el.className, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(({ c, r }) => `${c}:${Math.round(r.height)}`),
    );
    expect(petites).toEqual([]);
  });

  test("@responsive aucune page authentifiée ne sert de secret au navigateur", async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    for (const chemin of ["/dashboard", "/inventaire", `/inventaire/${SEAUX.aAvecPhoto}`, "/nuanciers", "/parametres"]) {
      await page.goto(chemin);
      const html = await page.content();
      expect(html, chemin).not.toMatch(/sb_secret_/);
      expect(html, chemin).not.toMatch(/service_role/);
      expect(html, chemin).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(html, chemin).not.toMatch(/COLORS_NUANCIER_FICHIER/);
    }
  });
});
