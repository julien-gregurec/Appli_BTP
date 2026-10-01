// ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — recette navigateur réelle.
//
// Pile : PostgreSQL 16 (train complet), GoTrue compilé, PostgREST v12.2.3 avec
// db-max-rows = 1000 (comme supabase/config.toml), local_supabase_proxy.mjs,
// `next dev -p 3100`. Base pilote : scripts/local-postgres-bootstrap/pilot_acceptance_v3.sh
// pilot_gp (voir docs/qualification/ELSATIA_RENTABILITE_DATA_CORRECTNESS_V1.md
// § Reproduire). Hors `npm run test:e2e` :
//
//   GP_RENT_DB=pilot_gp GP_RENT_POINTAGES=5000 npx playwright test \
//     tests/e2e/gp-rentabilite-data-correctness-v1.spec.ts --project=desktop-chromium
//
// La vérité est lue directement en base (superutilisateur) et comparée à ce
// que l'écran affiche.
import { expect, test, type Page, type Response } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const DB = process.env.GP_RENT_DB ?? "pilot_gp";
const N = Number(process.env.GP_RENT_POINTAGES ?? 5000);
const PASSWORD = "PiloteTest!2026";
const GERANT = "pilote.karim.haddad@example.test";
const CHEF_CHANTIER = "pilote.farid.amrani@example.test";
const OUVRIER = "pilote.sofiane.aitali@example.test";
const TENANT_B = { email: "pilote.tenantb.manager@example.test", password: "TenantB!2026" };
const CHANTIER_CHARGE = "Charge rentabilité V1 - 01";

function sql(requete: string, variables: Record<string, string> = {}): string {
  const vars = Object.entries(variables).map(([k, v]) => `-v ${k}='${v}'`).join(" ");
  const res = spawnSync("su", ["postgres", "-c", `psql -X -q -At -v ON_ERROR_STOP=1 ${vars} -d ${DB}`], { input: requete, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`psql: ${res.stderr}`);
  return res.stdout.trim();
}

const entreprise = () => sql("select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1';");
const chantierCharge = () => sql(`select id from public.chantiers where entreprise_id = '${entreprise()}' and nom = '${CHANTIER_CHARGE}';`);

async function login(page: Page, email: string, password = PASSWORD) {
  sql("truncate public.rate_limits_applicatifs;");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
}

/** « 1 234 567,89 € » → 1234567.89 */
const montant = (texte: string) => Number(texte.replace(/[\s  €]/g, "").replace(",", "."));
const centimes = (valeur: number) => Math.round(valeur * 100);

async function mesurer(page: Page, reponse: Response | null) {
  const timing = reponse?.request().timing();
  const navigation = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return nav ? { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null;
  });
  return {
    serveurMs: timing ? Math.round(timing.responseStart - timing.requestStart) : null,
    octetsHtml: (await reponse?.body())?.byteLength ?? 0,
    navigateurMs: navigation,
  };
}

/** Vérité PostgreSQL de /rentabilite pour un profil qui voit tout (gérant), formule de l'écran. */
function veriteRentabilite(ent: string) {
  const [ca, mo, marge, heures] = sql(`
    with l as (
      select c.id,
        coalesce((select sum(montant_ht) from public.factures f where f.entreprise_id = c.entreprise_id and f.chantier_id = c.id and f.statut not in ('annulee','avoir_emis')), 0) as ca,
        coalesce((select sum(p.heures_normales + p.heures_supplementaires) from public.pointages p where p.entreprise_id = c.entreprise_id and p.chantier_id = c.id and p.verification_statut = 'valide'), 0) as heures,
        coalesce((select sum((p.heures_normales + p.heures_supplementaires) * coalesce(co.cout_horaire, 0)) from public.pointages p left join public.employes_cout_horaire co on co.employe_id = p.employe_id and co.entreprise_id = p.entreprise_id where p.entreprise_id = c.entreprise_id and p.chantier_id = c.id and p.verification_statut = 'valide'), 0) as mo,
        coalesce((select sum(montant_ht) from public.depenses_fournisseurs d where d.entreprise_id = c.entreprise_id and d.chantier_id = c.id and d.statut is distinct from 'annulee'), 0) as dep,
        coalesce((select sum(m.quantite * coalesce(a.prix_achat_ht, 0)) from public.mouvements_stock m left join public.articles_stock a on a.id = m.article_id where m.entreprise_id = c.entreprise_id and m.chantier_id = c.id and m.type = 'sortie'), 0) as stock,
        coalesce((select sum(montant_ttc) from public.notes_frais n where n.entreprise_id = c.entreprise_id and n.chantier_id = c.id and n.statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) as notes,
        coalesce((select sum(montant_total) from public.indemnites_deplacement_paie i where i.entreprise_id = c.entreprise_id and i.chantier_id = c.id), 0) as ind
      from public.chantiers c where c.entreprise_id = '${ent}')
    select sum(ca) || '|' || sum(mo) || '|' || sum(ca - mo - dep - stock - notes - ind) || '|' || sum(heures) from l;`).split("|").map(Number);
  return { ca, mo, marge, heures };
}

function veriteHeuresChantier(chantierId: string) {
  const [validees, planifiees, nb] = sql(`
    select (select coalesce(sum(heures_normales + heures_supplementaires), 0) from public.pointages where chantier_id = '${chantierId}' and verification_statut = 'valide')
      || '|' || (select coalesce(sum(heures), 0) from public.affectations where chantier_id = '${chantierId}')
      || '|' || (select count(*) from public.pointages where chantier_id = '${chantierId}' and verification_statut = 'valide');`).split("|").map(Number);
  return { validees, planifiees, nb };
}

async function carte(page: Page, libelle: string) {
  return page.locator("div.rounded-md.border.p-4", { has: page.locator("div.text-xs", { hasText: new RegExp(`^${libelle}$`) }) }).locator("div.font-mono").innerText();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // Gestes de test uniquement : fin d'essai de la fixture pilote reportée (datée
  // de sa création), et jeu de charge chargé une fois.
  sql("update public.entreprises set abonnement_essai_debut = current_date - 1, abonnement_essai_fin = current_date + 29 where reference_interne = 'PILOTE-BTP-V1' and abonnement_statut = 'essai';");
  if (sql(`select count(*) from public.chantiers where nom = '${CHANTIER_CHARGE}';`) === "0") {
    sql(`\\i ${resolve(process.cwd(), "scripts/perf/rentabilite_charge.sql")}`, { entreprise: entreprise(), n: String(N) });
  }
});

test.describe(`${N} pointages — /rentabilite et fiche chantier`, () => {
  test("gérant : les totaux de /rentabilite sont exactement ceux de la base", async ({ page }, info) => {
    test.setTimeout(180_000);
    const ent = entreprise();
    await login(page, GERANT);
    const debut = Date.now();
    const reponse = await page.goto("/rentabilite");
    await expect(page.getByRole("heading", { name: "Rentabilité des chantiers" })).toBeVisible();
    const dureeMs = Date.now() - debut;
    const verite = veriteRentabilite(ent);
    const affiche = { ca: montant(await carte(page, "CA HT")), mo: montant(await carte(page, "Main-d’œuvre")), marge: montant(await carte(page, "Marge")) };
    const mesures = { N, verite, affiche, dureeMs, ...(await mesurer(page, reponse)) };
    console.log(`MESURES_RENTABILITE ${JSON.stringify(mesures)}`);
    await info.attach("mesures", { contentType: "application/json", body: JSON.stringify(mesures, null, 2) });
    expect(centimes(affiche.ca)).toBe(centimes(verite.ca));
    expect(centimes(affiche.mo)).toBe(centimes(verite.mo));
    expect(centimes(affiche.marge)).toBe(centimes(verite.marge));
    // Heures du chantier de charge dans le tableau détaillé.
    const ligne = page.locator("tbody tr", { has: page.getByRole("link", { name: CHANTIER_CHARGE, exact: true }) });
    const heuresAffichees = Number((await ligne.locator("td").nth(3).innerText()).replace(/\s*h$/, ""));
    expect(centimes(heuresAffichees)).toBe(centimes(veriteHeuresChantier(chantierCharge()).validees));
  });

  test("gérant : fiche chantier, heures planifiées / validées exactes et liste paginée", async ({ page }, info) => {
    test.setTimeout(180_000);
    const id = chantierCharge();
    const verite = veriteHeuresChantier(id);
    await login(page, GERANT);
    const debut = Date.now();
    const reponse = await page.goto(`/chantiers/${id}`);
    await expect(page.getByRole("heading", { name: CHANTIER_CHARGE })).toBeVisible();
    const dureeMs = Date.now() - debut;
    const texte = await page.locator("div.rounded-md", { has: page.locator("div.text-xs", { hasText: "Heures planifiées / validées" }) }).locator("div.font-mono").innerText();
    const [planifiees, validees] = texte.split("/").map((t) => Number(t.replace(/\s*h\s*$/, "").trim()));
    const lignesListe = page.locator("section:has(> h2:text-is('Intervenants et heures réalisées')) > div.space-y-2 > div");
    const nbLignes = await lignesListe.count();
    const mesures = { N, verite, affiche: { planifiees, validees }, nbLignes, dureeMs, ...(await mesurer(page, reponse)) };
    console.log(`MESURES_FICHE ${JSON.stringify(mesures)}`);
    await info.attach("mesures", { contentType: "application/json", body: JSON.stringify(mesures, null, 2) });
    expect(centimes(validees)).toBe(centimes(verite.validees));
    expect(centimes(planifiees)).toBe(centimes(verite.planifiees));
    expect(nbLignes).toBe(Math.min(50, verite.nb));
    await expect(page.getByText(`${verite.nb} pointage(s) validé(s)`)).toBeVisible();
    // Dernière page : les plus anciens pointages validés, relus sous RLS.
    const derniere = Math.ceil(verite.nb / 50);
    const debutDerniere = Date.now();
    await page.goto(`/chantiers/${id}?page_pointages=${derniere}`);
    await expect(page.getByText(`Page ${derniere} sur ${derniere}`)).toBeVisible();
    const dureeDerniereMs = Date.now() - debutDerniere;
    console.log(`MESURES_FICHE_DERNIERE_PAGE ${JSON.stringify({ N, derniere, dureeDerniereMs })}`);
    expect(await lignesListe.count()).toBe(verite.nb - (derniere - 1) * 50);
    const plusAncienne = sql(`select date from public.pointages where chantier_id = '${id}' and verification_statut = 'valide' order by date, id desc limit 1;`);
    await expect(lignesListe.last()).toContainText(plusAncienne);
  });

  test("chef de chantier (autorisé : voir_heures_chantiers, gerer_pointage, gerer_planning) : fiche chantier exacte ; /rentabilite refusée", async ({ page }) => {
    test.setTimeout(120_000);
    const id = chantierCharge();
    const verite = veriteHeuresChantier(id);
    await login(page, CHEF_CHANTIER);
    await page.goto(`/chantiers/${id}`);
    await expect(page.getByRole("heading", { name: CHANTIER_CHARGE })).toBeVisible();
    await expect(page.getByText(`${verite.nb} pointage(s) validé(s)`)).toBeVisible();
    const planifiees = Number((await page.locator("div.rounded-md.border.p-4", { has: page.locator("p", { hasText: /^Heures planifiées$/ }) }).locator("strong").innerText()).replace(/\s*h$/, ""));
    const validees = Number((await page.locator("div.rounded-md.border.p-4", { has: page.locator("p", { hasText: /^Heures pointées validées$/ }) }).locator("strong").innerText()).replace(/\s*h$/, ""));
    expect(centimes(planifiees)).toBe(centimes(verite.planifiees));
    expect(centimes(validees)).toBe(centimes(verite.validees));
    await page.goto("/rentabilite");
    await expect(page).toHaveURL(/\/dashboard\?acces=refuse/);
  });

  test("ouvrier (non autorisé) : /rentabilite refusée, chantier non affecté introuvable", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, OUVRIER);
    await page.goto("/rentabilite");
    await expect(page).toHaveURL(/\/dashboard\?acces=refuse/);
    const reponse = await page.goto(`/chantiers/${chantierCharge()}`);
    expect(reponse?.status()).toBe(404);
  });

  test("autre entreprise : aucun total ni chantier de l'entreprise pilote", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, TENANT_B.email, TENANT_B.password);
    const reponse = await page.goto(`/chantiers/${chantierCharge()}`);
    expect(reponse?.status()).toBe(404);
    await page.goto("/rentabilite");
    console.log(`TENANT_B_RENTABILITE_URL ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
    if (page.url().includes("/rentabilite")) {
      await expect(page.getByRole("heading", { name: "Rentabilité des chantiers" })).toBeVisible();
      await expect(page.getByRole("link", { name: CHANTIER_CHARGE })).toHaveCount(0);
      const entB = sql(`select entreprise_id from public.utilisateurs_entreprises ue join auth.users u on u.id = ue.utilisateur_id where u.email = '${TENANT_B.email}' limit 1;`);
      expect(centimes(montant(await carte(page, "CA HT")))).toBe(centimes(veriteRentabilite(entB).ca));
    }
  });
});
