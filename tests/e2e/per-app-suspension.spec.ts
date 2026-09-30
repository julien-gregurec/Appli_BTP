import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/*
 * ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1 — suspension commerciale PAR APPLICATION, dans un
 * vrai navigateur (Gestion Pro) ET par l'API avec le jeton de session de l'utilisateur.
 *
 * Même pile et mêmes variables que billing-lifecycle.spec.ts (E2E_BILLING_*, E2E_SUPABASE_*).
 * Les états commerciaux sont posés comme le ferait la facturation : RPC de service réelle
 * (webhook par application) ou colonne de suspension globale (RPC plateforme en production).
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

let sequence = 0;
/** Webhook commercial d'une application (Stripe mock), chemin réel de la facturation. */
function webhookApplication(application: string, statutStripe: string) {
  sequence += 1;
  return sql(`select public.synchroniser_statut_commercial_application_service('${ENTREPRISE}', '${application}', '${statutStripe}',
    'sub_e2e_${application}', 'evt_e2e_perapp_${application}_${Date.now()}_${sequence}', now() + make_interval(secs => ${sequence}))->>'decision'`);
}

function neutre() {
  sql(`update public.entreprises set stripe_customer_id = null, stripe_subscription_id = null, abonnement_statut = 'actif',
    abonnement_essai_debut = current_date - 60, abonnement_essai_fin = current_date - 30, abonnement_annulation_prevue_at = null,
    suspension_prevue_at = null, suspension_globale_at = null, suspension_globale_motif = null,
    derniere_facture_statut = null, derniere_facture_url = null where id = '${ENTREPRISE}'`);
  for (const [application, role] of [["tools", "tools_pro"], ["colors", "colors_admin_organisation"], ["reserves", "reserves_admin_organisation"]]) {
    sql(`insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, statut_commercial)
      values ('${ENTREPRISE}', '${application}', true, 'recette', 'entitled')
      on conflict (entreprise_id, application_code) do update set autorise = true, valide_du = null, valide_jusqu_au = null,
        statut_commercial = 'entitled', commercial_subscription_ref = null, commercial_evenement_at = null`);
    sql(`insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
      select '${ENTREPRISE}', u.id, '${application}', '${role}' from auth.users u where u.email = '${ADMIN}'
      on conflict (entreprise_id, utilisateur_id, application_code) do update set autorise = true, valide_du = null, valide_jusqu_au = null`);
  }
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

async function rpc<T>(request: APIRequestContext, email: string, fonction: string, data: Record<string, unknown>) {
  const r = await request.post(`${SUPABASE}/rest/v1/rpc/${fonction}`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${await jeton(request, email)}`, "Content-Type": "application/json" },
    data,
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as T;
}

/** Accès réel de la session (autorité : la base), pour les 4 applications d'entreprise. */
async function acces(request: APIRequestContext, email: string) {
  const gp = await rpc<boolean>(request, email, "est_membre_actif", { p_entreprise_id: ENTREPRISE });
  const apps: Record<string, boolean> = { gestion_pro: gp };
  for (const application of ["tools", "colors", "reserves"]) {
    apps[application] = await rpc<boolean>(request, email, "a_acces_application", { p_entreprise_id: ENTREPRISE, p_application_code: application });
  }
  return apps;
}

type EtatApplication = { application_code: string; statut_commercial: string | null; acces_ouvert: boolean; compte_global: string; peut_gerer: boolean };
async function etats(request: APIRequestContext, email: string) {
  const lignes = await rpc<EtatApplication[]>(request, email, "etat_commercial_applications", { p_entreprise_id: ENTREPRISE });
  return Object.fromEntries(lignes.map((l) => [l.application_code, l]));
}

async function chantiersApi(request: APIRequestContext, email: string) {
  const r = await request.get(`${SUPABASE}/rest/v1/chantiers?select=id&entreprise_id=eq.${ENTREPRISE}`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${await jeton(request, email)}` },
  });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as unknown[]).length;
}

async function en(page: Page, email: string) {
  await page.context().addCookies(sessions[email]);
}

test.beforeAll(async ({ browser }) => {
  neutre();
  await seConnecter(browser, ADMIN!);
  await seConnecter(browser, MEMBRE!);
});

test.afterAll(() => {
  if (DB) neutre();
});

test("référence : GP et les trois applications ouverts", async ({ page, request }) => {
  neutre();
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/chantiers/);
  expect(await acces(request, ADMIN!)).toEqual({ gestion_pro: true, tools: true, colors: true, reserves: true });
});

test("CAS PRINCIPAL — GP impayé : GP bloqué (écran + API), Tools / Colors / Réserves restent accessibles", async ({ page, request }) => {
  neutre();
  sql(`update public.entreprises set stripe_customer_id = 'cus_e2e_perapp', stripe_subscription_id = 'sub_e2e_perapp', abonnement_statut = 'suspendu', derniere_facture_statut = 'open',
    derniere_facture_url = 'https://invoice.stripe.com/i/acct_e2e/perapp' where id = '${ENTREPRISE}'`);
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu/);
  // L'écran annonce que les autres applications restent ouvertes, avec leur état propre.
  const autres = page.getByText("Vos autres applications ELSATIA").locator("..");
  await expect(autres).toBeVisible();
  await expect(autres).toContainText("la suspension de Gestion Pro ne les coupe pas");
  await expect(autres.getByText("Accès accordé")).toHaveCount(3);
  // Chemin de paiement GP toujours proposé à l'admin.
  await expect(page.getByRole("link", { name: /Payer/ })).toBeVisible();

  expect(await chantiersApi(request, ADMIN!), "RLS : aucune donnée GP").toBe(0);
  expect(await acces(request, ADMIN!)).toEqual({ gestion_pro: false, tools: true, colors: true, reserves: true });
  const e = await etats(request, ADMIN!);
  expect(e.gestion_pro).toMatchObject({ statut_commercial: "suspended", acces_ouvert: false, peut_gerer: true });
  expect(e.tools).toMatchObject({ statut_commercial: "entitled", acces_ouvert: true });
  // Membre simple : voit l'état, ne gère rien.
  expect(Object.values(await etats(request, MEMBRE!)).every((l) => !l.peut_gerer)).toBe(true);
});

test("Réserves past_due (webhook d'application) : seul Réserves se ferme, GP reste ouvert", async ({ page, request }) => {
  neutre();
  expect(webhookApplication("reserves", "past_due")).toBe("applique");
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/chantiers/);
  expect(await chantiersApi(request, ADMIN!)).toBeGreaterThan(0);
  expect(await acces(request, ADMIN!)).toEqual({ gestion_pro: true, tools: true, colors: true, reserves: false });
  expect((await etats(request, ADMIN!)).reserves).toMatchObject({ statut_commercial: "past_due", acces_ouvert: false, peut_gerer: true });
  expect(webhookApplication("reserves", "active")).toBe("applique");
  expect((await acces(request, ADMIN!)).reserves).toBe(true);
});

test("suspension GLOBALE explicite : toutes les applications coupées, écran dédié sans bouton de paiement", async ({ page, request }) => {
  neutre();
  sql(`update public.entreprises set suspension_globale_at = now(), suspension_globale_motif = 'recette sécurité' where id = '${ENTREPRISE}'`);
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu\?motif=suspension_plateforme/);
  await expect(page.getByRole("heading", { name: "Compte suspendu par ELSATIA" })).toBeVisible();
  await expect(page.getByText("recette sécurité")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Régulariser|Payer/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Payer|Réactiver/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Contacter le support" })).toBeVisible();

  expect(await acces(request, ADMIN!)).toEqual({ gestion_pro: false, tools: false, colors: false, reserves: false });
  expect(await chantiersApi(request, ADMIN!)).toBe(0);
  const e = await etats(request, ADMIN!);
  expect(Object.values(e).every((l) => l.compte_global === "ACCOUNT_GLOBAL_SUSPENDED" && !l.acces_ouvert)).toBe(true);

  // Levée : même session, aucune reconnexion.
  sql(`update public.entreprises set suspension_globale_at = null, suspension_globale_motif = null where id = '${ENTREPRISE}'`);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/chantiers/);
  expect(await acces(request, ADMIN!)).toEqual({ gestion_pro: true, tools: true, colors: true, reserves: true });
});

test("essai GP expiré : Tools / Colors / Réserves indépendants conservés", async ({ page, request }) => {
  neutre();
  sql(`update public.entreprises set abonnement_statut = 'essai', abonnement_essai_debut = current_date - 40, abonnement_essai_fin = current_date - 10 where id = '${ENTREPRISE}'`);
  await en(page, ADMIN!);
  await page.goto("/chantiers");
  await expect(page).toHaveURL(/\/abonnement-suspendu\?motif=essai_expire/);
  expect(await acces(request, ADMIN!)).toEqual({ gestion_pro: false, tools: true, colors: true, reserves: true });
});
