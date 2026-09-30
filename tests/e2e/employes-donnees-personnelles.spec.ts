import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA-EMPLOYEE-PERSONAL-DATA-ACCESS-HARDENING-V1 — recette navigateur des écrans touchés.
 *
 * Pile : tests/e2e/employes-pile-locale (vrai PostgreSQL 16 + train complet, VRAI PostgREST
 * pour /rest/v1, passerelle locale pour l'auth), Gestion Pro compilé. Décor :
 * supabase/tests/fixtures/employes_donnees_personnelles.inc — postes issus des modèles de
 * rôles canoniques (ouvrier, chef de chantier, RH, administration, gérant), entreprises A et B.
 *
 * Deux modes :
 *   - EDP_ATTENDU=corrige (défaut) : base avec 20260928000701 ;
 *   - EDP_ATTENDU=v6 : base V6 (préparée avec --sans-701), seuls les tests marqués @avant
 *     tournent et prouvent la fuite d'origine au niveau de l'API.
 */
const MODE = process.env.EDP_ATTENDU === "v6" ? "v6" : "corrige";
const BASE = process.env.EDP_E2E_DB ?? "edp_e2e";
const MDP = "test";
const U = {
  gerant: "gerant-a@edp.invalid",
  rh: "rh-a@edp.invalid",
  administration: "administration-a@edp.invalid",
  chefChantier: "chef-chantier-a@edp.invalid",
  ouvrier: "ouvrier-a@edp.invalid",
};
const VICTIME = "ed1e0000-0000-0000-0000-0000000000f1";
const SALARIE_B = "ed2e0000-0000-0000-0000-0000000000f1";

// Même geste que les recettes pilotes : la limitation de débit des connexions (429) n'est pas
// l'objet de cette recette, qui se connecte une quinzaine de fois de suite.
function sql(requete: string) {
  if (!/^[a-z0-9_]+$/.test(BASE)) throw new Error("EDP_E2E_DB invalide");
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -v ON_ERROR_STOP=1 -d ${BASE}`], { input: requete, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}
test.beforeEach(() => sql("truncate rate_limits_applicatifs;"));

async function connecter(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function jeton(page: Page, email: string) {
  const url = process.env.E2E_SUPABASE_URL;
  const cle = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url?.startsWith("http://127.0.0.1") || !cle) throw new Error("Supabase local explicite requis");
  const r = await page.request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: cle, "Content-Type": "application/json" },
    data: { email, password: MDP },
  });
  expect(r.status()).toBe(200);
  return { url, cle, jeton: (await r.json()).access_token as string };
}

test.describe("API — REST direct sous la session réelle de l'ouvrier @avant", () => {
  test("ouvrier : email d'un collègue par /rest/v1/employes", async ({ page }) => {
    const { url, cle, jeton: j } = await jeton(page, U.ouvrier);
    const r = await page.request.get(`${url}/rest/v1/employes?select=email,notes&id=eq.${VICTIME}`, {
      headers: { apikey: cle, Authorization: `Bearer ${j}` },
    });
    if (MODE === "v6") {
      // Constat d'origine : 200 et la donnée privée du collègue.
      expect(r.status()).toBe(200);
      expect(JSON.stringify(await r.json())).toContain("victime.privee@edp.invalid");
    } else {
      expect(r.status()).toBe(403);
      expect((await r.json()).code).toBe("42501");
    }
  });

  test("ouvrier : l'annuaire (prénom, nom) reste lisible", async ({ page }) => {
    const { url, cle, jeton: j } = await jeton(page, U.ouvrier);
    const r = await page.request.get(`${url}/rest/v1/employes?select=prenom,nom&id=eq.${VICTIME}`, {
      headers: { apikey: cle, Authorization: `Bearer ${j}` },
    });
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual([{ prenom: "Victime", nom: "A" }]);
  });
});

test.describe("écrans Employés après correctif", () => {
  test.skip(MODE === "v6", "écrans migrés vers employes_fiche : base corrigée requise");

  test("chef de chantier : /employes liste les coordonnées des collègues", async ({ page }) => {
    await connecter(page, U.chefChantier);
    await page.goto("/employes");
    await expect(page.getByRole("link", { name: "Victime A" })).toBeVisible();
    await expect(page.getByText("0611223344").first()).toBeVisible();
  });

  test("chef de chantier : fiche d'un collègue sans note RH ni secret", async ({ page }) => {
    await connecter(page, U.chefChantier);
    await page.goto(`/employes/${VICTIME}`);
    await expect(page.getByText("victime.privee@edp.invalid").first()).toBeVisible();
    await expect(page.getByText("NOTE_RH_SECRETE_A")).toHaveCount(0);
    await expect(page.getByText("EDP-A-VICTIME")).toHaveCount(0);
  });

  test("chef de chantier : carte d'identification avec n° de carte BTP", async ({ page }) => {
    await connecter(page, U.chefChantier);
    await page.goto(`/employes/${VICTIME}/carte`);
    await expect(page.getByText("CBTP-VICTIME-123").first()).toBeVisible();
    await expect(page.getByText("EDP-A-VICTIME")).toHaveCount(0);
  });

  test("chef de chantier A : fiche d'un salarié de B introuvable", async ({ page }) => {
    await connecter(page, U.chefChantier);
    const r = await page.goto(`/employes/${SALARIE_B}`);
    expect(r?.status()).toBe(404);
    await expect(page.getByText("salarie.prive@edp-b.invalid")).toHaveCount(0);
  });

  test("RH : fiche complète, note RH visible, modification enregistrée", async ({ page }) => {
    sql(`update public.employes set notes = 'NOTE_RH_SECRETE_A' where id = '${VICTIME}';`);
    await connecter(page, U.rh);
    await page.goto(`/employes/${VICTIME}`);
    await expect(page.getByText("NOTE_RH_SECRETE_A").first()).toBeVisible();
    await page.goto(`/employes/${VICTIME}/modifier`);
    await expect(page.locator("#notes")).toHaveValue("NOTE_RH_SECRETE_A");
    await page.locator("#notes").fill("NOTE_RH_MAJ_E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(new RegExp(`/employes/${VICTIME}(\\?.*)?$`));
    await expect(page.getByText("NOTE_RH_MAJ_E2E").first()).toBeVisible();
  });

  test("ouvrier : /mon-espace affiche ses propres coordonnées", async ({ page }) => {
    await connecter(page, U.ouvrier);
    await page.goto("/mon-espace");
    await expect(page.getByText("ouvrier-a@edp.invalid").first()).toBeVisible();
    await expect(page.getByText("EDPAOUV").first()).toBeVisible();
  });

  test("ouvrier : module Employés toujours refusé (garde de route)", async ({ page }) => {
    await connecter(page, U.ouvrier);
    await page.goto("/employes");
    await expect(page).not.toHaveURL(/\/employes$/);
  });

  for (const chemin of ["/planning", "/pointage", "/messagerie", "/conges", "/notes-frais"]) {
    test(`ouvrier : ${chemin} (embeds d'annuaire) s'affiche sans erreur`, async ({ page }) => {
      await connecter(page, U.ouvrier);
      const r = await page.goto(chemin);
      expect(r?.status()).toBeLessThan(400);
      await expect(page.getByText(/erreur inattendue|Application error/i)).toHaveCount(0);
    });
  }

  test("administration : export RGPD sans paie, RIB, notes ni numéros d'inscription", async ({ page }) => {
    await connecter(page, U.administration);
    // fetch depuis la page : mêmes cookies de session (Secure) que le bouton « Exporter ».
    const { statut, texte } = await page.evaluate(async () => {
      const r = await fetch("/api/rgpd/export");
      return { statut: r.status, texte: await r.text() };
    });
    expect(statut).toBe(200);
    const json = JSON.parse(texte);
    expect(Object.keys(json.donnees)).not.toContain("profils_paie_employes");
    expect(Object.keys(json.donnees)).not.toContain("coordonnees_bancaires");
    expect(json.sections_restreintes).toContain("profils_paie_employes");
    expect(texte).not.toContain("NIR_SECRET_VICTIME");
    expect(texte).not.toContain("NOTE_RH_");
    expect(texte).not.toContain("EDP-A-VICTIME");
    expect(json.donnees.employes.length).toBeGreaterThanOrEqual(8);
  });
});
