import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { motDePasseRecette, seConnecterParFormulaire, seDeconnecter } from "./colors-aides";

/**
 * Compte ELSATIA partagé — la chaîne d'accès de `julien@elsatia.fr` à Colors,
 * rejouée sur un jumeau (`partage-julien@recette.invalid`) qui a exactement sa
 * topologie : un compte Auth commun, membre ordinaire d'une organisation, PAS
 * administrateur plateforme, ouvert à Colors par l'autorisation de l'organisation
 * ET l'habilitation individuelle `colors_admin_organisation`.
 *
 * Jeu : `tests/e2e/fixtures/colors-compte-partage.sql`.
 *
 * Variables : `E2E_BASE_URL`, `MDP_RECETTE`, et `COLORS_DB_CONTAINER` (conteneur
 * PostgreSQL de la pile jetable) pour les deux scénarios où un droit est retiré
 * PENDANT une session ouverte.
 *
 * Le mot de passe réel de la plateforme n'intervient jamais : aucun test ne peut
 * ni le lire ni le fixer. Ce que ces scénarios établissent, c'est que la même
 * identité, sans second compte, ouvre Colors dès que les deux droits existent —
 * et qu'un seul maillon manquant est refusé pour la bonne raison, sans boucle.
 */

const ORG = "e0000000-0000-4000-8000-0000000000c1";
const COMPTE = (nom: string) => `partage-${nom}@recette.invalid`;

const REFUS_ACCES_ABSENT = "Votre compte ELSATIA ne dispose pas d’un accès actif à Colors.";

function sql(requete: string) {
  const conteneur = process.env.COLORS_DB_CONTAINER;
  if (!conteneur) throw new Error("COLORS_DB_CONTAINER est requis pour retirer un droit en cours de session");
  execFileSync("docker", ["exec", "-i", conteneur, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", requete]);
}

/** Codes HTTP >= 400 observés sur les réponses du domaine testé (documents, API, actions). */
function surveillerErreursHttp(page: Page) {
  const erreurs: string[] = [];
  const origine = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100").origin;
  page.on("response", (reponse) => {
    const url = new URL(reponse.url());
    if (url.origin !== origine) return;
    if ([401, 403].includes(reponse.status())) erreurs.push(`${reponse.status()} ${url.pathname}`);
  });
  return erreurs;
}

test.describe("@colors-partage compte partagé — parcours nominal", () => {
  test("connexion, session persistante, navigation, autre origine, déconnexion, reconnexion", async ({ page }) => {
    const erreurs = surveillerErreursHttp(page);

    // 1-2. Page de connexion : elle annonce le compte commun et n'ouvre aucun compte.
    await page.goto("/login");
    await expect(page.getByText("Compte ELSATIA commun")).toBeVisible();
    await expect(page.getByText(/Aucun second compte n’est nécessaire/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Mot de passe oublié ?" })).toBeVisible();

    // 3-6. Connexion par le formulaire, redirection, arrivée dans Colors.
    await seConnecterParFormulaire(page, COMPTE("julien"));
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Bonjour Julien/ })).toBeVisible();
    await expect(page.getByText("Organisation Compte Partagé").first()).toBeVisible();
    await expect(page.getByText("Accès Colors vérifié côté serveur")).toBeVisible();

    // 7-8. Les données se chargent : les quatre cartes de métriques, aucun 401/403.
    await expect(page.locator(".metric-card")).toHaveCount(4);
    const acces = await page.request.get("/api/acces");
    expect(acces.status()).toBe(200);
    expect(await acces.json()).toEqual({ application: "colors", autorise: true });

    // 11. Rafraîchir ne perd pas la session.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Bonjour Julien/ })).toBeVisible();

    // 12. Navigation entre plusieurs pages Colors, dont celles réservées à l'administration.
    for (const chemin of ["/inventaire", "/activite", "/depots", "/catalogues", "/nuanciers", "/utilisateurs", "/parametres"]) {
      const reponse = await page.goto(chemin);
      expect(reponse?.status(), chemin).toBe(200);
      await expect(page, chemin).toHaveURL(new RegExp(`${chemin}$`));
    }

    // L'ancienne URL /mouvements est conservée et renvoie, volontairement, vers l'activité.
    await page.goto("/mouvements");
    await expect(page).toHaveURL(/\/activite$/);

    // 13. « Retour après une autre application » : une autre ORIGINE ne partage pas la session
    //     (cookies d'hôte, voulu — voir la mention de /login), et revenir la retrouve intacte.
    const base = new URL(page.url());
    const autreOrigine = `http://localhost:${base.port}`;
    await page.goto(`${autreOrigine}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Bonjour Julien/ })).toBeVisible();

    // 14. Déconnexion : plus aucune page protégée.
    await seDeconnecter(page);
    await expect(page.getByText("Vous êtes déconnecté")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    // 15. Reconnexion.
    await seConnecterParFormulaire(page, COMPTE("julien"));
    await expect(page.getByRole("heading", { name: /Bonjour Julien/ })).toBeVisible();

    expect(erreurs, "aucune réponse 401/403 sur l'origine de Colors").toEqual([]);
  });

  test("le jumeau n'est pas administrateur plateforme : son accès vient des deux droits, pas d'un contournement", async ({ page }) => {
    await seConnecterParFormulaire(page, COMPTE("julien"));
    // Le rôle affiché est celui de l'habilitation, jamais « administrateur plateforme ».
    await page.goto("/utilisateurs");
    await expect(page.getByText(/administrateur_plateforme_global|Administration ELSATIA/)).toHaveCount(0);
  });

  test("un mauvais mot de passe reste un mauvais mot de passe", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill(COMPTE("julien"));
    await page.getByLabel("Mot de passe").fill(`${motDePasseRecette()}-faux`);
    await page.getByRole("button", { name: "Se connecter à Colors" }).click();
    await page.waitForURL(/error=identifiants/);
    await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
  });
});

test.describe("@colors-partage un seul maillon manquant est refusé pour la bonne raison", () => {
  const CAS: Array<[string, string]> = [
    ["sans-entreprise-active", "contexte canonique vide : aucune entreprise active"],
    ["profil-sans-appartenance", "entreprise active désignée mais aucune appartenance"],
    ["sans-habilitation", "organisation autorisée, aucune habilitation individuelle"],
    ["organisation-non-autorisee", "habilitation présente, organisation jamais ouverte à Colors"],
    ["organisation-suspendue", "tout est accordé mais l'abonnement de l'organisation est suspendu"],
    ["habilitation-expiree", "habilitation dont la fenêtre est échue"],
  ];

  for (const [nom, raison] of CAS) {
    test(`${nom} — ${raison}`, async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Adresse email").fill(COMPTE(nom));
      await page.getByLabel("Mot de passe").fill(motDePasseRecette());
      await page.getByRole("button", { name: "Se connecter à Colors" }).click();
      await page.waitForURL(/\/login\?error=/);

      // Refusé pour absence de DROIT — pas présenté comme un mot de passe faux,
      // pas comme une panne du service.
      await expect(page).toHaveURL(/error=acces-colors/);
      await expect(page.getByText(REFUS_ACCES_ABSENT)).toBeVisible();
      await expect(page.getByText("Identifiants incorrects.")).toHaveCount(0);

      // La session non autorisée a été refermée : aucune page protégée, et aucune boucle.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("un e-mail non confirmé est annoncé comme tel — mot de passe juste — et n'ouvre aucune session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill(COMPTE("non-confirme"));
    await page.getByLabel("Mot de passe").fill(motDePasseRecette());
    await page.getByRole("button", { name: "Se connecter à Colors" }).click();
    await page.waitForURL(/error=email-non-confirme/);
    await expect(page.getByText(/pas encore confirmée/)).toBeVisible();
    await expect(page.getByText("Identifiants incorrects.")).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("le même compte avec un MAUVAIS mot de passe ne révèle pas que l'e-mail est non confirmé", async ({ page }) => {
    // Sinon le formulaire deviendrait un oracle d'existence de compte.
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill(COMPTE("non-confirme"));
    await page.getByLabel("Mot de passe").fill(`${motDePasseRecette()}-faux`);
    await page.getByRole("button", { name: "Se connecter à Colors" }).click();
    await page.waitForURL(/error=identifiants/);
    await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
  });
});

test.describe("@colors-partage un droit retiré pendant une session ouverte", () => {
  test("l'habilitation retirée mène à /acces-refuse, page terminale avec sortie, jamais en boucle", async ({ page }) => {
    const erreurs = surveillerErreursHttp(page);
    await seConnecterParFormulaire(page, COMPTE("revocable"));
    await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();

    sql(`update public.habilitations_applications_utilisateurs set autorise = false
           where entreprise_id = '${ORG}' and utilisateur_id = '12000000-0000-4000-8000-000000000009' and application_code = 'colors'`);
    try {
      let redirections = 0;
      page.on("response", (r) => { if ([301, 302, 303, 307, 308].includes(r.status())) redirections += 1; });
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/acces-refuse/);
      await expect(page.getByRole("heading", { name: "Votre accès Colors doit être autorisé" })).toBeVisible();
      // Page terminale : la recharger la laisse où elle est.
      await page.reload();
      await expect(page).toHaveURL(/\/acces-refuse/);
      expect(redirections, "pas de cascade de redirections").toBeLessThan(6);

      // Sortie réelle : se déconnecter, puis la page protégée renvoie à /login.
      await page.getByRole("button", { name: "Se déconnecter" }).click();
      await page.waitForURL(/\/login/);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      sql(`update public.habilitations_applications_utilisateurs set autorise = true
             where entreprise_id = '${ORG}' and utilisateur_id = '12000000-0000-4000-8000-000000000009' and application_code = 'colors'`);
    }
    expect(erreurs.filter((e) => !e.includes("/acces-refuse"))).toEqual([]);
  });

  test("l'entreprise active retirée mène à /acces-refuse?motif=appartenance, sans boucle", async ({ page }) => {
    await seConnecterParFormulaire(page, COMPTE("revocable"));
    sql(`update public.utilisateurs set entreprise_active_id = null where id = '12000000-0000-4000-8000-000000000009'`);
    try {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/acces-refuse\?motif=/);
      await expect(page.getByRole("heading", { name: "Votre accès Colors doit être autorisé" })).toBeVisible();
      await page.reload();
      await expect(page).toHaveURL(/\/acces-refuse\?motif=/);
    } finally {
      sql(`update public.utilisateurs set entreprise_active_id = '${ORG}' where id = '12000000-0000-4000-8000-000000000009'`);
    }
    // Rétabli : la même session retrouve Colors sans se reconnecter.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
