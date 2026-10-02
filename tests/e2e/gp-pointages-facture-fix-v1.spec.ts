// ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — recette navigateur réelle des deux correctifs.
//
// Pile : PostgreSQL 16 (train complet), GoTrue compilé, PostgREST v12.2.3 avec
// db-max-rows = 1000 (comme supabase/config.toml), local_supabase_proxy.mjs,
// `next dev -p 3100`. Base pilote : gotrue_pilot_bootstrap.sh pilot_gp +
// run_pilot_auth_scenarios.sh pilot_gp (voir docs/qualification/
// ELSATIA_GP_POINTAGES_FACTURE_FIX_V1.md §Reproduire). Hors `npm run test:e2e` :
//
//   GP_FIX_DB=pilot_gp GP_FIX_POINTAGES=1462 npx playwright test \
//     tests/e2e/gp-pointages-facture-fix-v1.spec.ts --project=desktop-chromium
//
// La vérité est lue directement en base (superutilisateur) et comparée à ce
// que l'écran affiche.
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const DB = process.env.GP_FIX_DB ?? "pilot_gp";
const N = Number(process.env.GP_FIX_POINTAGES ?? 1462);
const MOIS = process.env.GP_FIX_MOIS ?? "2026-08";
const PASSWORD = "PiloteTest!2026";
const GERANT = "pilote.karim.haddad@example.test";
const TENANT_B = { email: "pilote.tenantb.manager@example.test", password: "TenantB!2026" };

function sql(requete: string, variables: Record<string, string> = {}): string {
  const vars = Object.entries(variables).map(([k, v]) => `-v ${k}='${v}'`).join(" ");
  const res = spawnSync("su", ["postgres", "-c", `psql -X -q -At -v ON_ERROR_STOP=1 ${vars} -d ${DB}`], { input: requete, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`psql: ${res.stderr}`);
  return res.stdout.trim();
}

const entreprise = () => sql("select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1';");

async function login(page: Page, email: string, password = PASSWORD) {
  sql("truncate public.rate_limits_applicatifs;");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

// Geste de test uniquement : l'essai de la fixture pilote est daté de sa
// création ; sans ce report, l'écran « période d'essai terminée » masque tout.
test.beforeAll(() => {
  sql("update public.entreprises set abonnement_essai_debut = current_date - 1, abonnement_essai_fin = current_date + 29 where reference_interne = 'PILOTE-BTP-V1' and abonnement_statut = 'essai';");
});

test.describe(`B1 — gestion des pointages, ${N} pointages dans le mois ${MOIS}`, () => {
  test.beforeAll(() => {
    const ent = entreprise();
    sql(`\\i ${resolve(process.cwd(), "scripts/perf/pointages_mois_charge.sql")}`, { entreprise: ent, mois: MOIS, n: String(N) });
  });

  test("les totaux par salarié affichés sont exactement ceux de la base", async ({ page }, info) => {
    test.setTimeout(180_000);
    const ent = entreprise();
    await login(page, GERANT);

    const debut = Date.now();
    const reponse = await page.goto(`/pointage/gestion?mois=${MOIS}`);
    await expect(page.getByRole("heading", { name: "Gérer et vérifier les pointages" })).toBeVisible();
    const dureeMs = Date.now() - debut;
    const octetsHtml = (await reponse?.body())?.byteLength ?? 0;

    const affiches = new Map<string, number>();
    // Lecture par la structure (titre « Total par employé » puis sa grille) : même sélecteur
    // avant et après correctif, pour une comparaison RED → GREEN honnête.
    const lignesTotaux = page.locator('h2:text-is("Total par employé") + div > div');
    for (const ligne of await lignesTotaux.all()) {
      const [nom, heures] = await ligne.locator("span").allInnerTexts();
      affiches.set(nom.trim(), Number(heures.replace(/\s*h$/, "").replace(",", ".")));
    }
    const verite = new Map<string, number>(sql(`
      select trim(coalesce(e.prenom, '') || ' ' || e.nom) || '|' || sum(p.heures_normales + p.heures_supplementaires)
      from public.pointages p join public.employes e on e.id = p.employe_id
      where p.entreprise_id = '${ent}' and p.date between '${MOIS}-01' and ('${MOIS}-01'::date + interval '1 month - 1 day')::date
      group by e.id, e.prenom, e.nom;`).split("\n").filter(Boolean).map((l) => { const [n, h] = l.split("|"); return [n, Number(h)] as [string, number]; }));
    const nbPointages = Number(sql(`select count(*) from public.pointages where entreprise_id = '${ent}' and date between '${MOIS}-01' and ('${MOIS}-01'::date + interval '1 month - 1 day')::date;`));
    const totalAffiche = Math.round([...affiches.values()].reduce((a, b) => a + b, 0) * 100) / 100;
    const totalVerite = Math.round([...verite.values()].reduce((a, b) => a + b, 0) * 100) / 100;

    const [nbSessions, nbAnciennes] = sql(`select (select count(*) from public.sessions_pointage where entreprise_id = '${ent}' and arrivee_at between '${MOIS}-01T00:00:00+02:00' and (('${MOIS}-01'::date + interval '1 month - 1 day')::date || 'T23:59:59+02:00')::timestamptz) || '|' ||
      (select count(*) from public.pointages p where entreprise_id = '${ent}' and date between '${MOIS}-01' and ('${MOIS}-01'::date + interval '1 month - 1 day')::date and not exists (select 1 from public.sessions_pointage s where s.pointage_id = p.id));`).split("|").map(Number);

    const mesures = { N, nbPointages, salaries: verite.size, totalVerite, totalAffiche, dureeMs, octetsHtml, nbSessions, nbAnciennes };
    console.log(`MESURES ${JSON.stringify(mesures)}`);
    await info.attach("mesures", { contentType: "application/json", body: JSON.stringify(mesures, null, 2) });

    expect(nbPointages).toBeGreaterThanOrEqual(N);
    expect(affiches.size).toBe(verite.size);
    for (const [nom, heures] of verite) expect(affiches.get(nom), nom).toBeCloseTo(heures, 2);
    expect(totalAffiche).toBe(totalVerite);

    // Listes : total exact dans les titres, pagination fonctionnelle.
    await expect(page.getByRole("heading", { name: `Pointages de l’équipe (${nbSessions})` })).toBeVisible();
    expect(await page.locator("section article").count()).toBe(Math.min(50, nbSessions));
    await expect(page.getByText(`Anciennes saisies d’heures (${nbAnciennes})`)).toBeVisible();
    if (nbSessions > 50) {
      const nav = page.getByRole("navigation", { name: "Pagination des sessions" });
      await expect(nav).toContainText(`Page 1 sur ${Math.ceil(nbSessions / 50)}`);
      await nav.getByRole("link", { name: "Page suivante →" }).click();
      await expect(page.getByRole("navigation", { name: "Pagination des sessions" })).toContainText(`Page 2 sur ${Math.ceil(nbSessions / 50)}`);
      expect(await page.locator("section article").count()).toBe(Math.min(50, nbSessions - 50));
      // Les totaux ne dépendent pas de la page affichée.
      expect(await lignesTotaux.count()).toBe(verite.size);
    }
  });
});

test.describe("B2 — facture brouillon : création, modification, enregistrement", () => {
  let factureId = "";

  let devisId = "";

  // Rejouable : un devis accepté neuf (brouillon + une ligne, puis accepté) est créé pour
  // chaque passage, les factures de la fixture ne sont pas touchées.
  test.beforeAll(() => {
    devisId = sql(`with e as (select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1'),
      c as (select ch.id, ch.client_id from public.chantiers ch, e where ch.entreprise_id = e.id order by ch.created_at limit 1),
      d as (insert into public.devis (entreprise_id, client_id, chantier_id, statut, notes_internes)
            select e.id, c.client_id, c.id, 'brouillon', 'Recette GP FIX V1' from e, c returning id)
      insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, taux_tva, ordre)
      select id, 'Prestation recette GP FIX V1', 2, 150, 20, 0 from d returning devis_id;`);
    sql(`update public.devis set statut = 'accepte' where id = '${devisId}';`);
  });

  test("le gérant crée une facture brouillon depuis un devis accepté, la modifie et l'enregistre", async ({ page }) => {
    test.setTimeout(180_000);
    expect(devisId, "devis accepté de recette").toMatch(/^[0-9a-f-]{36}$/);
    await login(page, GERANT);

    // Création (brouillon).
    await page.goto(`/devis/${devisId}`);
    await page.getByRole("button", { name: "Créer une facture depuis ce devis" }).click();
    await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    factureId = page.url().split("/").pop()!;
    expect(sql(`select statut from public.factures where id = '${factureId}';`)).toBe("brouillon");

    // Modification.
    await page.getByRole("link", { name: "Modifier", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/factures/${factureId}/modifier$`));
    const designation = page.getByPlaceholder("Désignation").first();
    await designation.fill("Ligne modifiée par la recette GP FIX V1");
    await page.getByLabel("Notes visibles client").fill("Modifié en brouillon");

    // Enregistrement.
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/factures/${factureId}$`), { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText("Impossible de créer cette facture");

    const [premiere, notes, ttc, recalcule] = sql(`select
      (select designation from public.lignes_factures where facture_id = '${factureId}' order by ordre limit 1) || '|' ||
      (select notes_client from public.factures where id = '${factureId}') || '|' ||
      (select montant_ttc from public.factures where id = '${factureId}') || '|' ||
      (select round(sum(q.ht) + sum(q.ht * q.taux_tva / 100), 2) from (select (quantite * prix_unitaire_ht) * (1 - remise_ligne / 100) as ht, taux_tva from public.lignes_factures where facture_id = '${factureId}') q);`).split("|");
    expect(premiere).toBe("Ligne modifiée par la recette GP FIX V1");
    expect(notes).toBe("Modifié en brouillon");
    expect(Number(ttc)).toBe(Number(recalcule));
  });

  test("une fois émise, la facture n'est plus modifiable", async ({ page }) => {
    expect(factureId).not.toBe("");
    sql(`update public.factures set statut = 'envoyee' where id = '${factureId}';`);
    const ttcAvant = sql(`select montant_ttc from public.factures where id = '${factureId}';`);
    await login(page, GERANT);
    await page.goto(`/factures/${factureId}`);
    await expect(page.getByRole("link", { name: "Modifier", exact: true })).toHaveCount(0);
    await page.goto(`/factures/${factureId}/modifier`);
    await expect(page).toHaveURL(new RegExp(`/factures/${factureId}$`));
    expect(sql(`select montant_ttc from public.factures where id = '${factureId}';`)).toBe(ttcAvant);
  });

  test("une autre entreprise ne voit pas la facture", async ({ page }) => {
    expect(factureId).not.toBe("");
    await login(page, TENANT_B.email, TENANT_B.password);
    const reponse = await page.goto(`/factures/${factureId}/modifier`);
    expect(reponse?.status()).toBe(404);
  });
});
