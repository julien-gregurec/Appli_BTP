import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES, SEAUX, seConnecter, seConnecterParFormulaire, seDeconnecter } from "./colors-aides";

/**
 * Suspension d'application et cycle de session, de bout en bout.
 *
 * Toutes ces bascules ont lieu PENDANT une session ouverte : l'utilisateur ne se reconnecte
 * jamais entre « autorisé » et « suspendu ». Le service (connexion administrateur à la base,
 * l'équivalent du rôle service de la plateforme) modifie l'entitlement ; la requête suivante
 * du navigateur doit en tenir compte, sur les pages, sur l'URL directe d'une fiche et sur
 * les routes API.
 *
 * Exige `E2E_DATABASE_URL` (connexion administrateur de la base de recette) et la passerelle
 * locale (`tests/e2e/colors-pile-locale`) pour les tests de rafraîchissement de jeton.
 */

const ORGANISATION_A = "e0000000-0000-4000-8000-00000000000a";
const GESTIONNAIRE_A = "11000000-0000-4000-8000-000000000002";
const PILE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

function service(sql: string) {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL est requise pour piloter l'entitlement pendant la recette");
  execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

const RETABLIR = `
  insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source)
  values ('${ORGANISATION_A}','colors',true,'recette')
  on conflict (entreprise_id,application_code) do update set autorise=true, valide_du=null, valide_jusqu_au=null;
  update public.entreprises set abonnement_statut='actif', suspension_prevue_at=null where id='${ORGANISATION_A}';
  update public.habilitations_applications_utilisateurs set autorise=true, valide_du=null, valide_jusqu_au=null,
    role_code='colors_gestionnaire_stock'
   where entreprise_id='${ORGANISATION_A}' and utilisateur_id='${GESTIONNAIRE_A}';
  update public.utilisateurs_entreprises set statut='actif'
   where entreprise_id='${ORGANISATION_A}' and utilisateur_id='${GESTIONNAIRE_A}';`;

async function exigerAccesOuvert(page: Page) {
  await page.goto("/inventaire");
  await expect(page).toHaveURL(/\/inventaire$/);
  await expect(page.locator(".bucket-card").first()).toBeVisible();
}

test.describe.serial("@colors-suspension suspension sans reconnexion", () => {
  test.afterEach(() => service(RETABLIR));

  test("entitlement autorise=false : pages, URL directe et API se ferment à la requête suivante, puis rouvrent", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await exigerAccesOuvert(page);

    service(`update public.acces_applications_entreprises set autorise=false where entreprise_id='${ORGANISATION_A}' and application_code='colors'`);

    await page.goto("/inventaire");
    await page.waitForURL(/\/abonnement-requis/);
    await page.goto(`/inventaire/${SEAUX.aAvecPhoto}`);
    await page.waitForURL(/\/abonnement-requis/);
    await expect(page.getByText("Blanc atelier")).toHaveCount(0);

    const exportRefuse = await page.request.get("/api/export/inventaire", { maxRedirects: 0 });
    // 403 explicite : un refus d'accès n'est ni un succès ni une panne serveur (500).
    expect(exportRefuse.status(), "l'export doit refuser explicitement pendant une suspension").toBe(403);
    expect(await exportRefuse.text()).not.toContain("Acrylique mate");

    // Rétablissement : même navigateur, mêmes cookies, aucune reconnexion.
    service(RETABLIR);
    await exigerAccesOuvert(page);
  });

  test("valide_jusqu_au échu : l'accès se ferme sans reconnexion", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await exigerAccesOuvert(page);
    service(`update public.acces_applications_entreprises set valide_du=now()-interval '30 days', valide_jusqu_au=now()-interval '1 second' where entreprise_id='${ORGANISATION_A}' and application_code='colors'`);
    await page.goto("/dashboard");
    await page.waitForURL(/\/abonnement-requis/);
  });

  test("entitlement absent : l'accès se ferme sans reconnexion", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await exigerAccesOuvert(page);
    service(`delete from public.acces_applications_entreprises where entreprise_id='${ORGANISATION_A}' and application_code='colors'`);
    await page.goto("/depots");
    await page.waitForURL(/\/abonnement-requis/);
  });

  test("tenant suspendu : l'accès se ferme sans reconnexion, et aucune écriture ne passe", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await expect(page.getByLabel("Nouvelle quantité")).toBeVisible();
    service(`update public.entreprises set abonnement_statut='suspendu' where id='${ORGANISATION_A}'`);

    // Le formulaire était déjà affiché : l'envoi après suspension ne doit rien écrire.
    await page.getByLabel("Nouvelle quantité").fill("0.2");
    await page.getByLabel("Motif").fill("Écriture après suspension");
    await page.getByRole("button", { name: "Mettre à jour" }).click();
    await expect(page.getByText("Quantité mise à jour")).toHaveCount(0);

    await page.goto("/inventaire");
    await page.waitForURL(/\/abonnement-requis/);

    service(RETABLIR);
    await page.goto(`/inventaire/${SEAUX.aStockFaible}`);
    await expect(page.getByText("Écriture après suspension")).toHaveCount(0);
  });

  test("habilitation individuelle retirée : refus d'habilitation, pas d'abonnement", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await exigerAccesOuvert(page);
    service(`update public.habilitations_applications_utilisateurs set autorise=false where entreprise_id='${ORGANISATION_A}' and utilisateur_id='${GESTIONNAIRE_A}'`);
    await page.goto("/inventaire");
    await page.waitForURL(/\/acces-refuse/);
  });

  test("changement de rôle pris en compte sans reconnexion", async ({ page }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    await page.goto("/depots");
    await expect(page.getByRole("button", { name: "Ajouter l’emplacement" })).toBeVisible();
    service(`update public.habilitations_applications_utilisateurs set role_code='colors_consultation' where entreprise_id='${ORGANISATION_A}' and utilisateur_id='${GESTIONNAIRE_A}'`);
    await page.goto("/depots");
    await expect(page.getByRole("button", { name: "Ajouter l’emplacement" })).toHaveCount(0);
  });
});

test.describe.serial("@colors-session cycle de session", () => {
  test.afterEach(async ({ request }) => {
    await request.post(`${PILE}/__recette/duree-jeton`, { data: { secondes: 3600 } });
  });

  test("un jeton d'accès proche de l'expiration est rafraîchi, et la navigation continue", async ({ page, request }) => {
    // 95 s : juste au-dessus de la marge de 90 s du SDK, le jeton devient « à rafraîchir »
    // cinq secondes après la connexion.
    await request.post(`${PILE}/__recette/duree-jeton`, { data: { secondes: 95 } });
    const avant = (await (await request.get(`${PILE}/__recette/journal`)).json()) as { type: string }[];
    await seConnecter(page, COMPTES.gestionnaire);
    await page.waitForTimeout(6_000);
    await exigerAccesOuvert(page);
    await page.goto("/depots");
    await expect(page).toHaveURL(/\/depots$/);
    const apres = (await (await request.get(`${PILE}/__recette/journal`)).json()) as { type: string; userId?: string }[];
    const rafraichissements = apres.slice(avant.length).filter((e) => e.type === "rafraichissement" && e.userId === GESTIONNAIRE_A);
    expect(rafraichissements.length, "aucun rafraîchissement de jeton observé").toBeGreaterThan(0);
  });

  test("les cookies d'une session fermée ne rouvrent rien", async ({ page, context }) => {
    await seConnecter(page, COMPTES.gestionnaire);
    const cookiesAvantDeconnexion = await context.cookies();
    await seDeconnecter(page);
    await context.addCookies(cookiesAvantDeconnexion);
    await page.goto("/inventaire");
    await page.waitForURL(/\/login\?next=%2Finventaire&error=session-expiree/);
  });

  test("sans session, les URL directes et les routes API ne livrent rien", async ({ page }) => {
    for (const chemin of ["/dashboard", "/inventaire", `/inventaire/${SEAUX.aAvecPhoto}`, "/parametres", "/activite"]) {
      await page.goto(chemin);
      await page.waitForURL(/\/login/);
    }
    const exportAnonyme = await page.request.get("/api/export/inventaire", { maxRedirects: 0 });
    expect(exportAnonyme.status()).not.toBe(200);
    expect(await exportAnonyme.text()).not.toContain("Acrylique mate");
    const photoAnonyme = await page.request.post("/api/photos", {
      multipart: { seauId: SEAUX.aAvecPhoto, photo: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
      maxRedirects: 0,
    });
    expect(photoAnonyme.status()).not.toBe(200);
  });

  test("un compte sans habilitation Colors est refusé à la connexion puis sur URL directe", async ({ page }) => {
    await page.goto("/login");
    await seConnecterParFormulaire(page, COMPTES.sansDroit, /\/login\?error=acces-colors/);
    await page.goto("/inventaire");
    await page.waitForURL(/\/login/);
  });
});
