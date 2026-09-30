import { execFileSync } from "node:child_process";
import { expect, test, type BrowserContext, type Page, type APIRequestContext } from "@playwright/test";

/*
 * ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1 — cycle commercial dans un vrai navigateur ET par l'API.
 *
 * Pile : PostgreSQL 16 portant le train complet (…0928 701-703 sur la branche du lot, …0928 801-803 dans le train V8), passerelle locale Supabase
 * (tests/e2e/colors-pile-locale/passerelle.mjs : RLS réelle sous le rôle du JWT), Gestion Pro.
 * L'état Stripe est projeté en base par les RPC de service réelles (celles du webhook) ; aucun
 * appel Stripe. Chaque droit est vérifié deux fois : dans l'application (redirections,
 * écrans) et par l'API REST avec le jeton de session de l'utilisateur (ce que la RLS laisse
 * réellement passer, indépendamment de l'interface).
 *
 * Variables : E2E_BILLING_DB_URL (connexion admin à la base de recette), E2E_BILLING_ENTREPRISE,
 * E2E_BILLING_ADMIN_EMAIL (gerer_parametres), E2E_BILLING_MEMBRE_EMAIL (acces_chantiers seul),
 * E2E_BILLING_MDP, E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY. Sans elles : ignoré.
 */
const DB = process.env.E2E_BILLING_DB_URL;
const ENTREPRISE = process.env.E2E_BILLING_ENTREPRISE;
const ADMIN = process.env.E2E_BILLING_ADMIN_EMAIL;
const MEMBRE = process.env.E2E_BILLING_MEMBRE_EMAIL;
const MDP = process.env.E2E_BILLING_MDP;
const SUPABASE = process.env.E2E_SUPABASE_URL;
const ANON = process.env.E2E_SUPABASE_ANON_KEY;

test.skip(!DB || !ENTREPRISE || !ADMIN || !MEMBRE || !MDP || !SUPABASE || !ANON, "pile de recette billing non configurée");
test.describe.configure({ mode: "serial" });

function sql(requete: string) {
  return execFileSync("psql", [DB!, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", requete], { stdio: "pipe" }).toString().trim();
}

/** Remet l'entreprise dans un état neutre puis applique l'état demandé (colonnes libres). */
function etat(colonnes: string) {
  sql(`delete from public.stripe_objets_ordre where objet_id = '${ENTREPRISE}' or entreprise_id = '${ENTREPRISE}'`);
  sql(`update public.entreprises set stripe_customer_id = null, stripe_subscription_id = null,
    abonnement_statut = 'essai', abonnement_essai_debut = current_date - 5, abonnement_essai_fin = current_date + 25,
    abonnement_annulation_prevue_at = null, suspension_prevue_at = null,
    derniere_facture_statut = null, derniere_facture_url = null where id = '${ENTREPRISE}'`);
  if (colonnes) sql(`update public.entreprises set ${colonnes} where id = '${ENTREPRISE}'`);
}

const sessions: Record<string, Awaited<ReturnType<BrowserContext["cookies"]>>> = {};
const jetons: Record<string, string> = {};

async function seConnecter(browser: import("@playwright/test").Browser, email: string) {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  sessions[email] = await contexte.cookies();
  await contexte.close();
}

async function jeton(request: APIRequestContext, email: string) {
  if (jetons[email]) return jetons[email];
  const r = await request.post(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON!, "Content-Type": "application/json" },
    data: { email, password: MDP },
  });
  expect(r.ok()).toBeTruthy();
  jetons[email] = (await r.json()).access_token as string;
  return jetons[email];
}

/** Lignes métier réellement lisibles par l'API avec la session de l'utilisateur. */
async function chantiersApi(request: APIRequestContext, email: string) {
  const r = await request.get(`${SUPABASE}/rest/v1/chantiers?select=id&entreprise_id=eq.${ENTREPRISE}`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${await jeton(request, email)}` },
  });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as unknown[]).length;
}

async function etatReprise(request: APIRequestContext, email: string) {
  const r = await request.post(`${SUPABASE}/rest/v1/rpc/etat_reabonnement_entreprise`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${await jeton(request, email)}`, "Content-Type": "application/json" },
    data: { p_entreprise_id: ENTREPRISE },
  });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as Array<{ abonnement_statut: string; peut_gerer: boolean }>)[0] ?? null;
}

async function en(page: Page, email: string) {
  await page.context().addCookies(sessions[email]);
}

test.beforeAll(async ({ browser }) => {
  etat("");
  await seConnecter(browser, ADMIN!);
  await seConnecter(browser, MEMBRE!);
});

test.afterAll(() => {
  if (DB) etat("abonnement_statut = 'actif', abonnement_essai_debut = current_date, abonnement_essai_fin = current_date + 30");
});

test("essai en cours : métier ouvert (écran + API), conditions de souscription sans paiement avant la fin d'essai", async ({ page, request }) => {
  etat("");
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/chantiers/);
  expect(await chantiersApi(request, ADMIN!)).toBeGreaterThan(0);
  await page.goto("/abonnement");
  await expect(page.getByTestId("souscription-conditions")).toContainText("aucun paiement avant cette date");
});

test("essai expiré : métier bloqué à l'écran ET par l'API (B-4), l'admin garde le chemin de souscription", async ({ page, request }) => {
  etat("abonnement_essai_debut = current_date - 40, abonnement_essai_fin = current_date - 10");
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu\?motif=essai_expire/);
  await expect(page.getByRole("heading", { name: "Votre période d’essai est terminée" })).toBeVisible();
  expect(await chantiersApi(request, ADMIN!), "RLS : aucune donnée métier après l'essai").toBe(0);
  expect(await chantiersApi(request, MEMBRE!)).toBe(0);
  expect((await etatReprise(request, ADMIN!))?.peut_gerer).toBe(true);

  await page.goto("/abonnement");
  await expect(page.getByRole("heading", { name: "Fonctionnalité non disponible" })).toHaveCount(0);
  await expect(page.getByTestId("souscription-conditions")).toContainText("période d’essai est terminée");
  await expect(page.getByRole("button", { name: "Souscrire (paiement immédiat)" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /essai/i })).toHaveCount(0);
});

test("essai à moins de 48 h : paiement immédiat annoncé, métier encore ouvert", async ({ page, request }) => {
  etat("abonnement_essai_debut = current_date - 30, abonnement_essai_fin = current_date");
  await en(page, ADMIN!);
  expect(await chantiersApi(request, ADMIN!)).toBeGreaterThan(0);
  await page.goto("/abonnement");
  await expect(page.getByTestId("souscription-conditions")).toContainText("moins de 48 heures");
});

test("paiement échoué : suspension immédiate ; admin voit « Payer la facture », membre simple rien", async ({ page, request }) => {
  etat("stripe_customer_id = 'cus_e2e_billing', stripe_subscription_id = 'sub_e2e_billing', abonnement_statut = 'actif'");
  sql(`select public.appliquer_evenement_facture_abonnement_v2_service('${ENTREPRISE}', 'evt_e2e_fail_' || extract(epoch from clock_timestamp())::bigint,
    'invoice.payment_failed', now(), 'in_e2e_fail', 'open', now(), 'ELS-E2E', now(), now(), 79, 0, 79, 'eur',
    'https://invoice.stripe.com/i/in_e2e_fail', null, 'sub_e2e_billing')`);
  expect(sql(`select abonnement_statut from public.entreprises where id = '${ENTREPRISE}'`)).toBe("suspendu");
  expect(await chantiersApi(request, ADMIN!)).toBe(0);

  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  await expect(page.getByRole("heading", { name: "Paiement requis" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Payer la facture" })).toHaveAttribute("href", "https://invoice.stripe.com/i/in_e2e_fail");
  await expect(page.getByRole("button", { name: "Mettre à jour le moyen de paiement" })).toBeVisible();

  await page.context().clearCookies();
  await en(page, MEMBRE!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  await expect(page.getByRole("link", { name: "Payer la facture" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mettre à jour le moyen de paiement" })).toHaveCount(0);
  expect((await etatReprise(request, MEMBRE!))).toMatchObject({ abonnement_statut: "suspendu", peut_gerer: false });
});

test("annulation puis invoice.paid tardif : l'accès n'est jamais rouvert (B-1)", async ({ page, request }) => {
  etat("stripe_customer_id = 'cus_e2e_billing', stripe_subscription_id = 'sub_e2e_billing', abonnement_statut = 'actif'");
  const t = Date.now();
  sql(`select public.synchroniser_abonnement_stripe_ordonne_service('${ENTREPRISE}', 'sub_e2e_billing', 'cus_e2e_billing', 'annule', 'pro', 'mensuel',
    current_date, null, null, null, null, 'evt_e2e_del_${t}', 'customer.subscription.deleted', now(), 'subscription', 'sub_e2e_billing')`);
  const decision = sql(`select public.appliquer_evenement_facture_abonnement_v2_service('${ENTREPRISE}', 'evt_e2e_late_${t}', 'invoice.paid',
    now() + interval '1 hour', 'in_e2e_late_${t}', 'paid', now(), 'ELS-E2E-L', now(), now(), 79, 0, 79, 'eur', null, null, 'sub_e2e_billing')->>'decision'`);
  expect(decision).toBe("sans_effet");
  expect(await chantiersApi(request, ADMIN!)).toBe(0);
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  await expect(page.getByRole("heading", { name: "Abonnement annulé" })).toBeVisible();
  await page.goto("/abonnement");
  await expect(page.getByRole("button", { name: "Réactiver avec cette offre" }).first()).toBeVisible();
});

test("abonnement actif : tout est rouvert (écran + API), sans reconnexion", async ({ page, request }) => {
  etat("stripe_customer_id = 'cus_e2e_billing', stripe_subscription_id = 'sub_e2e_billing', abonnement_statut = 'actif'");
  await en(page, MEMBRE!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/chantiers/);
  expect(await chantiersApi(request, MEMBRE!)).toBeGreaterThan(0);
});
