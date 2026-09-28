import { execFileSync } from "node:child_process";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 — écrans de réabonnement dans un vrai navigateur.
 *
 * Pile : PostgreSQL 16 portant le train complet (…0928 201, train V5), passerelle locale Supabase
 * (tests/e2e/colors-pile-locale/passerelle.mjs : RLS réelle sous le rôle du JWT),
 * Gestion Pro en `next dev`. Aucun appel Stripe réussi n'est possible (clé factice) :
 * l'état Stripe est projeté en base comme le ferait le webhook, et le chemin d'action
 * qui relit Stripe doit aboutir à l'écran « échec » sans rouvrir aucun droit.
 *
 * Variables : E2E_REABONNEMENT_DB_URL (connexion admin à la base de recette),
 * E2E_REABONNEMENT_EMAIL / E2E_REABONNEMENT_MDP (compte administrateur de recette),
 * E2E_REABONNEMENT_ENTREPRISE (uuid de son entreprise active). Sans elles : ignoré.
 */
const DB = process.env.E2E_REABONNEMENT_DB_URL;
const EMAIL = process.env.E2E_REABONNEMENT_EMAIL;
const MDP = process.env.E2E_REABONNEMENT_MDP;
const ENTREPRISE = process.env.E2E_REABONNEMENT_ENTREPRISE;

test.skip(!DB || !EMAIL || !MDP || !ENTREPRISE, "pile de recette réabonnement non configurée");
test.describe.configure({ mode: "serial" });

function sql(requete: string) {
  execFileSync("psql", [DB!, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", requete], { stdio: "pipe" });
}

function etat(colonnes: string) {
  sql(`update public.entreprises set stripe_customer_id = 'cus_e2e_reabonnement', stripe_subscription_id = 'sub_e2e_ancienne',
    abonnement_offre = 'pro', abonnement_periodicite = 'mensuel', abonnement_annulation_prevue_at = null,
    suspension_prevue_at = null, derniere_facture_statut = null, derniere_facture_url = null
    where id = '${ENTREPRISE}'`);
  sql(`update public.entreprises set ${colonnes} where id = '${ENTREPRISE}'`);
}

// Une seule connexion pour toute la suite (la connexion est limitée à 10 / 10 min par IP) :
// l'état de session est réutilisé par chaque test.
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
test.beforeAll(async ({ browser }) => {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  cookies = await contexte.cookies();
  await contexte.close();
});

async function connexion(page: Page) {
  await page.context().addCookies(cookies);
}

test.afterAll(() => {
  if (DB) etat("abonnement_statut = 'essai'");
});

test("abonnement annulé : métier bloqué, écran « Abonnement annulé », offres re-souscriptibles sans essai", async ({ page }) => {
  etat("abonnement_statut = 'annule'");
  await connexion(page);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  await expect(page.getByRole("heading", { name: "Abonnement annulé" })).toBeVisible();
  await expect(page.getByText("sans nouvelle période d’essai")).toBeVisible();

  await page.goto("/abonnement");
  const bandeau = page.getByTestId("reabonnement-annule");
  await expect(bandeau).toContainText("Abonnement annulé");
  await expect(bandeau.getByRole("link", { name: "Réactiver mon abonnement" })).toHaveAttribute("href", "#choisir-offre");
  await expect(page.getByRole("heading", { name: "Réactiver mon abonnement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réactiver avec cette offre" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Démarrer l’essai" })).toHaveCount(0);
});

test("résiliation programmée : « Reprendre l’abonnement » (Portail), aucune offre proposée", async ({ page }) => {
  etat("abonnement_statut = 'actif', abonnement_annulation_prevue_at = now() + interval '12 days'");
  await connexion(page);
  await page.goto("/abonnement");
  const bandeau = page.getByTestId("reabonnement-reprendre");
  await expect(bandeau).toContainText("Résiliation programmée le");
  await expect(bandeau.getByRole("button", { name: "Reprendre l’abonnement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réactiver avec cette offre" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Démarrer l’essai" })).toHaveCount(0);
});

test("échec : Stripe injoignable ou refus → écran d’échec, aucun droit modifié", async ({ page }) => {
  etat("abonnement_statut = 'actif', abonnement_annulation_prevue_at = now() + interval '12 days'");
  await connexion(page);
  await page.goto("/abonnement");
  await page.getByTestId("reabonnement-reprendre").getByRole("button", { name: "Reprendre l’abonnement" }).click();
  await expect(page).toHaveURL(/\/abonnement\?error=/);
  await expect(page.getByText("Le réabonnement n’a pas abouti")).toBeVisible();
  const statut = execFileSync("psql", [DB!, "-X", "-At", "-c", `select abonnement_statut from public.entreprises where id = '${ENTREPRISE}'`]).toString().trim();
  expect(statut).toBe("actif");
});

test("paiement requis : écran dédié, lien de facture Stripe, portail de paiement", async ({ page }) => {
  etat("abonnement_statut = 'suspendu', derniere_facture_statut = 'open', derniere_facture_url = 'https://invoice.stripe.com/i/acct_e2e/test_reabonnement'");
  await connexion(page);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  await expect(page.getByRole("heading", { name: "Paiement requis" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Payer la facture" })).toHaveAttribute("href", "https://invoice.stripe.com/i/acct_e2e/test_reabonnement");
  await expect(page.getByRole("button", { name: "Mettre à jour le moyen de paiement" })).toBeVisible();

  await page.goto("/abonnement");
  const bandeau = page.getByTestId("reabonnement-paiement-requis");
  await expect(bandeau).toContainText("Paiement requis");
  await expect(bandeau.getByRole("link", { name: "Payer la facture" })).toBeVisible();
});

test("droits rendus uniquement après un état Stripe compatible (projection webhook)", async ({ page }) => {
  etat("abonnement_statut = 'annule'");
  await connexion(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  // Le webhook a rattaché la nouvelle subscription mais le paiement n'est pas confirmé.
  etat("stripe_subscription_id = 'sub_e2e_nouvelle', abonnement_statut = 'suspendu', derniere_facture_statut = 'open'");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  // invoice.paid appliqué → actif : le métier rouvre.
  etat("stripe_subscription_id = 'sub_e2e_nouvelle', abonnement_statut = 'actif', derniere_facture_statut = 'paid'");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("retours Checkout du réabonnement : succès en attente de confirmation, abandon = échec", async ({ page }) => {
  await page.goto("/paiement/abonnement/succes?reabonnement=1");
  await expect(page.getByRole("heading", { name: "Réabonnement en cours de confirmation" })).toBeVisible();
  await expect(page.getByText(/essai/)).toHaveCount(0);
  await page.goto("/paiement/abonnement/annule?reabonnement=1");
  await expect(page.getByRole("heading", { name: "Réabonnement non finalisé" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Réactiver mon abonnement" })).toHaveAttribute("href", "/abonnement#choisir-offre");
});
