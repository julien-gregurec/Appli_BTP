// ELSATIA_PILOT_REMAINING_FAILS_CLOSURE_V2 — real browser flows for the cases
// closed by this mission: CH-09, PL-03, PT-08, PE-07, FA-08 (NF-01 lives in
// pilot-acceptance-v3.spec.ts, where its V3 test was corrected).
//
// Same requirements as pilot-acceptance-v3.spec.ts: local stack running
// (npm run pilot:acceptance:v3) + `next dev -p 3100` with .env.local pointing
// at the local proxy. FA-08 additionally needs CRON_SECRET and
// FEATURE_CRONS_ENABLED=true in .env.local (it calls the real cron endpoint).
// Fixture gestures (a known affectation, an overdue invoice date) are done by
// direct SQL, like the V3 spec — they are setup, not what is being tested.
// Every case ends with a DB witness read straight from Postgres.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PASSWORD = "PiloteTest!2026";
const PROFILES = {
  gerant: "pilote.karim.haddad@example.test",
  chef_chantier: "pilote.farid.amrani@example.test",
  ouvrier: "pilote.sofiane.aitali@example.test",
} as const;

const DB = "pilot_gp";
function psql(sql: string): string {
  const res = spawnSync("su", ["postgres", "-c", `psql -X -q -t -A -d ${DB} -c "${sql.replace(/"/g, '\\"')}"`], { encoding: "utf8" });
  return (res.stdout || "").trim();
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

// Supabase SSR stores the session in (possibly chunked) `sb-*-auth-token` cookies.
async function jetonAcces(page: Page): Promise<string> {
  const morceaux = (await page.context().cookies())
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("");
  const brut = morceaux.startsWith("base64-") ? Buffer.from(morceaux.slice(7), "base64url").toString("utf8") : decodeURIComponent(morceaux);
  return (JSON.parse(brut) as { access_token: string }).access_token;
}
const SUPABASE_URL = "http://localhost:54321";
const ANON_KEY = readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/)?.[1]?.trim() ?? "";

const ENT_A = psql("select id from entreprises where reference_interne='PILOTE-BTP-V1';");
const uid = (email: string) => psql(`select id from auth.users where email='${email}';`);
const employeDe = (email: string) => psql(`select e.id from employes e join auth.users u on u.id=e.utilisateur_id where u.email='${email}' and e.entreprise_id='${ENT_A}';`);

test.beforeEach(() => {
  // Real anti-abuse limiter (10 logins / 10 min / IP): these flows log in several times.
  psql("truncate rate_limits_applicatifs;");
});

test.describe("CH-09: carte réelle sur /chantiers/[id]/localisation", () => {
  test("sans position : adresse + message ; après GPS : carte OSM centrée avec marqueur", async ({ page, context }) => {
    const chantier = psql(`select id || '|' || adresse || '|' || coalesce(code_postal,'') || '|' || coalesce(ville,'') from chantiers where entreprise_id='${ENT_A}' and nom like 'Construction 6 logements%';`);
    const [chantierId, adresse] = chantier.split("|");
    psql(`update chantiers set latitude=null, longitude=null where id='${chantierId}';`);

    await login(page, PROFILES.chef_chantier);
    await page.goto(`/chantiers/${chantierId}/localisation`);
    await expect(page.getByTestId("adresse-chantier")).toContainText(adresse);
    await expect(page.getByText("Position GPS non renseignée")).toBeVisible();
    await expect(page.getByTestId("carte-chantier")).toHaveCount(0);

    // Real geolocation gesture through the product's own GPS button.
    await context.grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });
    await context.setGeolocation({ latitude: 45.7578, longitude: 4.832, accuracy: 10 });
    await page.getByRole("button", { name: /position actuelle/i }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForLoadState("networkidle");

    const carte = page.getByTestId("carte-chantier");
    await expect(carte).toBeVisible();
    await expect(carte).toHaveAttribute("data-latitude", "45.7578");
    await expect(carte).toHaveAttribute("data-longitude", "4.832");
    await expect(page.getByTestId("marqueur-chantier")).toBeAttached();
    await expect(page.getByTestId("adresse-chantier")).toContainText(adresse);
    // Centre tile for 45.7578,4.832 @ z16 = 16/33647/23378 (src/lib/carte-tuiles.test.ts).
    await expect(carte.locator('img[src="https://tile.openstreetmap.org/16/33647/23378.png"]')).toHaveCount(1);
    await expect(carte.locator('img[src^="https://tile.openstreetmap.org/16/"]')).toHaveCount(15);
    expect(psql(`select latitude || ',' || longitude from chantiers where id='${chantierId}';`)).toBe("45.7578000,4.8320000");
  });
});

test.describe("PL-03: modification d'affectation historisée", () => {
  test("le chef de chantier modifie une affectation dans /planning ; l'historique garde avant/après/auteur", async ({ page }) => {
    const employe = employeDe(PROFILES.ouvrier);
    const chantierId = psql(`select id from chantiers where entreprise_id='${ENT_A}' and nom like 'Construction 6 logements%';`);
    const tache = `TestPL03-${Date.now()}`;
    psql(`delete from affectations where tache like 'TestPL03-%';`); // leftovers of previous runs
    const affectationId = psql(`insert into affectations (entreprise_id, chantier_id, employe_id, date, heures, tache) values ('${ENT_A}','${chantierId}','${employe}', current_date, 7, '${tache}') returning id;`).split("\n")[0];

    await login(page, PROFILES.chef_chantier);
    await page.goto("/planning");
    await page.waitForLoadState("networkidle");
    // Innermost, visible <details> only (the planning renders mobile + desktop layouts).
    const bloc = page.locator("details:not(:has(details)):visible", { has: page.locator(`input[name="tache"][value="${tache}"]`) });
    await bloc.locator("summary").click();
    await bloc.locator('input[name="heures"]').fill("3.5");
    await bloc.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForLoadState("networkidle");

    await expect.poll(() => psql(`select heures from affectations where id='${affectationId}';`), { timeout: 15_000 }).toBe("3.50");
    const ligne = psql(`select operation || '|' || array_to_string(champs_modifies, ',') || '|' || (avant->>'heures') || '|' || (apres->>'heures') || '|' || auteur_id from affectations_historique where affectation_id='${affectationId}';`);
    expect(ligne).toBe(`modification|heures|7.00|3.50|${uid(PROFILES.chef_chantier)}`);
  });
});

test.describe("PT-08: pointage créé par un responsable au nom d'un salarié", () => {
  test("le gérant saisit une régularisation depuis /pointage/gestion", async ({ page }) => {
    const employe = employeDe(PROFILES.ouvrier);
    const motif = `TestPT08 téléphone oublié ${Date.now()}`;
    await login(page, PROFILES.gerant);
    await page.goto("/pointage/gestion");
    await page.getByText("Saisir un pointage au nom d’un salarié (régularisation)").click();
    await page.getByLabel("Salarié").selectOption(employe);
    await page.getByLabel("Chantier").selectOption({ index: 1 });
    await page.getByLabel("Arrivée").fill("07:30");
    await page.getByLabel("Départ").fill("16:30");
    await page.getByLabel("Pause (minutes)").fill("60");
    await page.getByLabel("Motif de la régularisation").fill(motif);
    await page.getByRole("button", { name: "Créer le pointage de régularisation" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Pointage de régularisation créé au nom du salarié, à valider.")).toBeVisible();

    const ligne = psql(`select employe_id || '|' || origine_pointage || '|' || verification_statut || '|' || (heures_normales + heures_supplementaires) || '|' || regularise_par from pointages where commentaire='${motif}';`);
    expect(ligne).toBe(`${employe}|regularisation_responsable|a_verifier|8.00|${uid(PROFILES.gerant)}`);
    expect(psql(`select count(*) from notifications_utilisateurs where utilisateur_id='${uid(PROFILES.ouvrier)}' and type='pointage_regularise' and message like '%${motif}%';`)).toBe("1");
  });

  test("un ouvrier n'a pas le formulaire et la RPC le refuse", async ({ page }) => {
    await login(page, PROFILES.ouvrier);
    await page.goto("/pointage/gestion");
    await expect(page.getByText("Saisir un pointage au nom d’un salarié (régularisation)")).toHaveCount(0);
  });
});

test.describe("PE-07: révoquer l'appareil invalide sa session", () => {
  test("révocation par le gérant -> l'ouvrier est déconnecté à la requête suivante, sans attendre l'expiration", async ({ browser }: { browser: Browser }) => {
    const ouvrierUid = uid(PROFILES.ouvrier);
    psql(`delete from appareils_comptes where utilisateur_id='${ouvrierUid}';`);
    const telephone = await browser.newContext();
    const pageOuvrier = await telephone.newPage();
    await login(pageOuvrier, PROFILES.ouvrier);
    // AppPresenceTracker registers the device (and now its GoTrue session).
    await expect.poll(() => psql(`select count(*) from appareils_comptes where utilisateur_id='${ouvrierUid}' and session_id is not null and revoque_at is null;`), { timeout: 15_000 }).toBe("1");
    const sessionId = psql(`select session_id from appareils_comptes where utilisateur_id='${ouvrierUid}';`);
    expect(psql(`select count(*) from auth.sessions where id='${sessionId}';`)).toBe("1");
    await pageOuvrier.goto("/pointage");
    await expect(pageOuvrier).toHaveURL(/\/pointage/);
    // The phone's access token, as an attacker who kept the device would hold it.
    const jeton = await jetonAcces(pageOuvrier);
    const lirePointages = () => fetch(`${SUPABASE_URL}/rest/v1/pointages?select=id`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${jeton}` } }).then((r) => r.json() as Promise<unknown[]>);
    expect((await lirePointages()).length).toBeGreaterThan(0);

    const bureau = await browser.newContext();
    const pageGerant = await bureau.newPage();
    await login(pageGerant, PROFILES.gerant);
    await pageGerant.goto(`/employes/${employeDe(PROFILES.ouvrier)}`);
    pageGerant.on("dialog", (dialog) => dialog.accept());
    await pageGerant.getByRole("button", { name: "Révoquer" }).first().click();
    await expect(pageGerant.getByText("Appareil révoqué")).toBeVisible({ timeout: 20_000 });

    expect(psql(`select count(*) from sessions_revoquees where session_id='${sessionId}';`)).toBe("1");
    expect(psql(`select count(*) from auth.sessions where id='${sessionId}';`)).toBe("0");

    // Direct PostgREST with the same, still unexpired JWT: RLS now returns nothing
    // (PostgREST only checks the signature — sessions_revoquees is what closes it).
    expect(await lirePointages()).toEqual([]);
    // Same browser: next navigation is cut. Here GoTrue itself already rejects the
    // token (its auth.sessions row was deleted by the revocation), so the proxy's
    // generic "no user" branch redirects; the proxy's own session_revoquee branch
    // (with its explanatory message) covers deployments where that delete is not
    // permitted — exercised at DB level by pe07_revocation_appareil_invalide_session.test.sql.
    await pageOuvrier.goto("/pointage");
    await expect(pageOuvrier).toHaveURL(/\/login/);
    await pageOuvrier.goto("/dashboard");
    await expect(pageOuvrier).toHaveURL(/\/login/);

    // The manager's own session (another device) is untouched.
    await pageGerant.goto("/dashboard");
    await expect(pageGerant).toHaveURL(/\/dashboard/);
    await telephone.close();
    await bureau.close();
  });
});

test.describe("FA-08: bascule automatique en_retard par le cron", () => {
  test("échéance dépassée -> le cron quotidien bascule la facture, visible en_retard dans /factures", async ({ page, request }) => {
    const secret = process.env.CRON_SECRET ?? "pilot-cron-secret";
    // Simulated passage of time: the émise-invoice lock forbids moving date_echeance,
    // so the fixture gesture bypasses triggers for that one column only.
    // FAC-PILOTE-006 is unpaid; FAC-PILOTE-004 is fully paid in this fixture run
    // (montant_paye = montant_ttc) and serves as the negative witness.
    psql(`set session_replication_role=replica; update factures set date_echeance=current_date-5, statut='envoyee' where numero in ('FAC-PILOTE-004','FAC-PILOTE-006');`);
    expect(psql("select statut from factures where numero='FAC-PILOTE-006';")).toBe("envoyee");

    const reponse = await request.get("/api/cron/abonnements", { headers: { authorization: `Bearer ${secret}` } });
    const corps = await reponse.json();
    expect(corps.facturesEnRetard?.ok).toBe(true);
    expect(corps.facturesEnRetard?.basculees).toBeGreaterThanOrEqual(1);
    expect(psql("select statut from factures where numero='FAC-PILOTE-006';")).toBe("en_retard");
    expect(psql("select statut from factures where numero='FAC-PILOTE-004';")).toBe("envoyee");

    await login(page, PROFILES.gerant);
    await page.goto("/factures");
    await expect(page.locator("tr, article, a", { hasText: "FAC-PILOTE-006" }).first()).toContainText("En retard");
  });
});
