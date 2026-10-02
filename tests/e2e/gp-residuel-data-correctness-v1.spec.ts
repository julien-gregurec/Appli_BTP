import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — recette navigateur : fiches client,
 * sous-traitant, véhicule, outil et chantier, paie, notes de frais, CRM, tableau
 * de bord et listes, comparés à la vérité PostgreSQL sous un PostgREST réel
 * plafonné à 1 000 lignes, aux volumes 1 462, 5 000 et 20 000.
 *
 * Pile : tests/e2e/gp-residuel-pile-locale/preparer-base.sh puis
 * tests/e2e/finance-pile-locale/demarrer-pile.sh (vrai PostgreSQL 16 + train
 * complet, VRAI PostgREST avec db-max-rows = 1000, passerelle d'auth locale),
 * Gestion Pro compilé (next build + next start). Décor :
 * scripts/qualification/gp-residual/seed.sql.
 */
const BASE = process.env.GP_E2E_DB ?? "gp_e2e";
const MDP = "test";
const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const uuid = (prefixe: string, n: number) => `${prefixe}${n.toString(16).padStart(32 - prefixe.length, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const ids = (p: string) => ({
  e: uuid(`${p}e`, 1), client: uuid(`${p}c`, 1), st: uuid(`${p}d`, 1), vehicule: uuid(`${p}f`, 1), outil: uuid(`${p}f`, 2),
  chantier: uuid(`${p}ca`, 1), periode: uuid(`${p}e5`, 1),
});

function psql(requete: string) {
  if (!/^[a-z0-9_]+$/.test(BASE)) throw new Error("GP_E2E_DB invalide");
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -A -t -v ON_ERROR_STOP=1 -d ${BASE}`], { input: requete, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const verite = (sql: string) => Number(psql(`select coalesce((${sql})::text, '0');`));
test.beforeEach(() => { psql("truncate rate_limits_applicatifs;"); });

async function connecter(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Ouvre la page et renvoie sa durée de réponse serveur (TTFB) en ms. */
async function ouvrir(page: Page, chemin: string) {
  const reponse = await page.goto(chemin, { timeout: 120_000 });
  expect(reponse?.status(), `${chemin} : statut HTTP`).toBe(200);
  const ttfb = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return Math.round(n.responseStart - n.requestStart); });
  test.info().annotations.push({ type: "ttfb", description: `${chemin} ${ttfb} ms` });
  return ttfb;
}

for (const [p, n] of [["a1462", 1462], ["a5000", 5000], ["a2000", 20000]] as const) {
  const id = ids(p);
  test.describe(`${n} lignes par chemin`, () => {
    test.setTimeout(300_000);

    test(`fiches client, sous-traitant, véhicule et outil exactes (${n})`, async ({ page }) => {
      await connecter(page, `${p}-admin@invalid.local`);
      await ouvrir(page, `/clients/${id.client}`);
      await expect(page.getByText(euros(verite(`select sum(montant_ttc) filter (where statut <> 'annulee') from factures where client_id = '${id.client}'`)), { exact: true })).toBeVisible();
      await expect(page.getByText(euros(verite(`select sum(montant_paye) from factures where client_id = '${id.client}'`)), { exact: true })).toBeVisible();
      await expect(page.getByText(`(${n} au total)`).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Plus anciens →" })).toBeVisible();

      await ouvrir(page, `/sous-traitants/${id.st}`);
      const ht = verite(`select sum(montant_ht) filter (where statut <> 'annulee') from depenses_fournisseurs where fournisseur_id = '${id.st}'`);
      const regle = verite(`select sum(montant_regle) from depenses_fournisseurs where fournisseur_id = '${id.st}'`);
      await expect(page.getByText(`${euros(ht)} / ${euros(regle)}`)).toBeVisible();
      await expect(page.getByText(euros(verite(`select sum(montant_previsionnel_ht) filter (where statut <> 'annulee') from sous_traitants_chantiers where fournisseur_id = '${id.st}'`)), { exact: true })).toBeVisible();
      await expect(page.getByText(`${n} facture(s) au total.`)).toBeVisible();

      await ouvrir(page, `/flotte/${id.vehicule}`);
      await expect(page.getByText(euros(verite(`select sum(montant_ttc) filter (where statut <> 'annulee') from depenses_fournisseurs where vehicule_id = '${id.vehicule}'`)), { exact: true })).toBeVisible();
      await expect(page.getByText(`${n} facture(s) au total.`)).toBeVisible();

      await ouvrir(page, "/outillage");
      await expect(page.getByText(`${verite(`select count(*) from outils where entreprise_id = '${id.e}'`)} outil(s) · ${verite(`select count(*) from outils where entreprise_id = '${id.e}' and prochaine_verification <= current_date`)} vérification(s) échue(s)`)).toBeVisible();
      await ouvrir(page, "/flotte");
      await expect(page.getByText(`${verite(`select count(*) from vehicules where entreprise_id = '${id.e}'`)} véhicule(s) ·`)).toBeVisible();

      await ouvrir(page, `/outillage/${id.outil}`);
      await expect(page.getByText(euros(verite(`select sum(montant_ttc) filter (where statut <> 'annulee') from depenses_fournisseurs where outil_id = '${id.outil}'`)), { exact: true })).toBeVisible();
    });

    test(`fiche chantier, documents et DOE complets (${n})`, async ({ page }) => {
      await connecter(page, `${p}-admin@invalid.local`);
      await ouvrir(page, `/chantiers/${id.chantier}`);
      await expect(page.getByRole("link", { name: `Photos & documents (${n})` })).toBeVisible();
      await expect(page.getByText(euros(verite(`select sum(montant_ttc) filter (where statut <> 'annulee') from depenses_fournisseurs where chantier_id = '${id.chantier}'`)), { exact: true }).first()).toBeVisible();
      await expect(page.getByText(euros(verite(`select sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')) from notes_frais where chantier_id = '${id.chantier}'`)), { exact: true }).first()).toBeVisible();

      await ouvrir(page, `/chantiers/${id.chantier}/documents`);
      await expect(page.getByText(`${n} documents`, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Plus anciens →" }).click();
      await expect(page).toHaveURL(/apres=/);

      await ouvrir(page, `/chantiers/${id.chantier}/doe`);
      const articles = verite(`select count(distinct article_id) from mouvements_stock where chantier_id = '${id.chantier}' and type = 'sortie'`);
      await expect(page.locator("article").filter({ hasText: "Article" })).toHaveCount(articles);
    });

    test(`paie, notes de frais, CRM et tableau de bord exacts (${n})`, async ({ page }) => {
      await connecter(page, `${p}-admin@invalid.local`);
      await ouvrir(page, `/paie/${id.periode}`);
      await expect(page.getByText(euros(verite(`select sum(total_primes) from dossiers_paie_salaries where periode_id = '${id.periode}'`)), { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: `Contrôles (${n})` })).toBeVisible();

      await ouvrir(page, "/notes-frais");
      const aControler = verite(`select count(*) from notes_frais where entreprise_id = '${id.e}' and employe_id = '${uuid(`${p}7e`, 2)}' and statut in ('soumis','en_verification','correction_demandee')`);
      const nb = verite(`select count(*) from notes_frais where entreprise_id = '${id.e}' and employe_id = '${uuid(`${p}7e`, 2)}'`);
      const groupe = page.locator("details").filter({ has: page.getByText("Prénom2 Salarié000002", { exact: true }) });
      await expect(groupe.getByText(`${nb} dépenses · ${aControler} à contrôler`)).toBeVisible();

      await ouvrir(page, "/crm");
      await expect(page.getByText(euros(verite(`select sum(montant_ttc - montant_paye) from factures where entreprise_id = '${id.e}' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye`)), { exact: true })).toBeVisible();

      const ttfbDashboard = await ouvrir(page, "/dashboard");
      expect(ttfbDashboard).toBeLessThan(15_000);
    });

    test(`profil ouvrier : rien de plus que sa RLS, sans balayage (${n})`, async ({ page }) => {
      await connecter(page, `${p}-ouvrier@invalid.local`);
      const ttfb = await ouvrir(page, `/flotte/${id.vehicule}`);
      await expect(page.getByText("Coûts facturés")).toBeVisible();
      await expect(page.getByText(euros(0), { exact: true }).first()).toBeVisible();
      expect(ttfb).toBeLessThan(10_000);
    });
  });
}
