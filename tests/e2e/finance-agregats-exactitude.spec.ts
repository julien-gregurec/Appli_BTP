import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — recette navigateur : écrans et exports
 * financiers comparés à la vérité PostgreSQL, sous un PostgREST réel plafonné à 1 000 lignes.
 *
 * Pile : tests/e2e/finance-pile-locale (vrai PostgreSQL 16 + train complet, VRAI PostgREST
 * avec db-max-rows = 1000, passerelle locale pour l'auth), Gestion Pro compilé. Décor :
 * scripts/qualification/finance-aggregates/seed.sql — entreprises de 500 à 20 000 lignes
 * par table sur 2026-01-01 → 2026-06-30, plus un tenant témoin.
 */
const BASE = process.env.FIN_E2E_DB ?? "fin_e2e";
const MDP = "test";
const admin = (prefixe: string) => `${prefixe}-admin@invalid.local`;
const ouvrier = (prefixe: string) => `${prefixe}-ouvrier@invalid.local`;
const entreprise = (prefixe: string) => `${prefixe}e00-0000-0000-0000-000000000001`;
const PERIODE = "debut=2026-01-01&fin=2026-06-30";
const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

function psql(requete: string) {
  if (!/^[a-z0-9_]+$/.test(BASE)) throw new Error("FIN_E2E_DB invalide");
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -A -t -v ON_ERROR_STOP=1 -d ${BASE}`], { input: requete, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const verite = <T,>(sql: string): T => JSON.parse(psql(`select coalesce((${sql})::text, 'null');`)) as T;
test.beforeEach(() => { psql("truncate rate_limits_applicatifs;"); });

async function connecter(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

// CSV produit par src/lib/csv.ts : « ; », BOM, nombres « 1234,56 », textes entre guillemets.
function lireCsv(texte: string) {
  return texte.replace(/^﻿/, "").split("\r\n").filter((l) => l.length > 0)
    .map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "").replaceAll('""', '"')));
}
const nombre = (cellule: string) => Number(cellule.replace(",", "."));
const centimes = (n: number) => Math.round(n * 100);

// Téléchargement depuis la page, avec la session du navigateur (cookies `Secure` compris,
// qu'un contexte de requête Playwright n'envoie pas sur http://127.0.0.1).
async function telecharger(page: Page, chemin: string) {
  return page.evaluate(async (url) => {
    const r = await fetch(url, { redirect: "manual" });
    return { statut: r.status, texte: await r.text() };
  }, chemin);
}

async function exporter(page: Page, type: string) {
  const r = await telecharger(page, `/api/exports/comptabilite?type=${type}&format=csv&${PERIODE}`);
  expect(r.statut, `${type} : statut HTTP`).toBe(200);
  const lignes = lireCsv(r.texte);
  const synthese = lignes.findIndex((l) => l[0] === "SYNTHÈSE PAR TAUX");
  return { entete: lignes[0], detail: lignes.slice(1, synthese < 0 ? undefined : synthese), synthese: lignes.filter((l) => l[0] === "TOTAL") };
}

test.describe("exports comptables et TVA — jamais tronqués", () => {
  test.setTimeout(180_000);
  for (const [prefixe, volume] of [["f1462", 1462], ["f5000", 5000], ["f2000", 20000]] as const) {
    test(`journal des ventes et TVA collectée (${volume} factures)`, async ({ page }) => {
      const e = entreprise(prefixe);
      await connecter(page, admin(prefixe));
      const ventes = await exporter(page, "ventes");
      const v = verite<{ n: number; ttc: number }>(`select json_build_object('n', count(*), 'ttc', sum(montant_ttc)) from factures where entreprise_id = '${e}' and numero is not null and date_emission between '2026-01-01' and '2026-06-30'`);
      expect(ventes.detail).toHaveLength(v.n);
      expect(v.n).toBe(volume);
      expect(centimes(ventes.detail.reduce((s, l) => s + nombre(l[8]), 0))).toBe(centimes(v.ttc));

      const tva = await exporter(page, "tva");
      const t = verite<Record<string, number>>(`select json_object_agg(taux::float8::text, round(tva, 2)) from (select l.taux_tva taux, sum(l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100) * l.taux_tva / 100) tva from lignes_factures l join factures f on f.id = l.facture_id where f.entreprise_id = '${e}' and f.numero is not null and f.date_emission between '2026-01-01' and '2026-06-30' and f.statut <> 'annulee' group by l.taux_tva) s`);
      expect(Object.fromEntries(tva.synthese.map((l) => [String(nombre(l[2])), nombre(l[4])]))).toEqual(t);
    });
  }

  test("règlements, achats et TVA déductible complets (1 462 lignes)", async ({ page }) => {
    const e = entreprise("f1462");
    await connecter(page, admin("f1462"));
    const n = verite<{ reglements: number; achats: number; tva: Record<string, number> }>(`select json_build_object(
      'reglements', (select count(*) from paiements p join factures f on f.id = p.facture_id where f.entreprise_id = '${e}' and p.date between '2026-01-01' and '2026-06-30'),
      'achats', (select count(*) from depenses_fournisseurs where entreprise_id = '${e}' and date_piece between '2026-01-01' and '2026-06-30' and statut <> 'annulee'),
      'tva', (select json_object_agg(taux_tva::float8::text, tva) from (select taux_tva, sum(montant_tva) tva from depenses_fournisseurs where entreprise_id = '${e}' and date_piece between '2026-01-01' and '2026-06-30' and statut <> 'annulee' group by taux_tva) s))`);
    expect((await exporter(page, "reglements")).detail).toHaveLength(n.reglements);
    expect((await exporter(page, "achats")).detail).toHaveLength(n.achats);
    const tvaAchats = await exporter(page, "tva-achats");
    expect(tvaAchats.detail).toHaveLength(n.achats);
    expect(Object.fromEntries(tvaAchats.synthese.map((l) => [String(nombre(l[3])), nombre(l[5])]))).toEqual(n.tva);
  });

  test("un ouvrier n'obtient aucun export comptable", async ({ page }) => {
    await connecter(page, ouvrier("f1462"));
    const r = await telecharger(page, `/api/exports/comptabilite?type=tva&format=csv&${PERIODE}`);
    // Refus par la route (403) ou en amont par le proxy (redirection, statut opaque 0).
    expect([0, 403]).toContain(r.statut);
    expect(r.texte).not.toContain("SYNTHÈSE PAR TAUX");
  });

  test("export des notes de frais : refus explicite au-delà de 500, jamais tronqué", async ({ page }) => {
    await connecter(page, admin("f1000"));
    const r = await telecharger(page, `/api/notes-frais/exports?${PERIODE}`);
    expect(r.statut).toBe(413);
    expect(JSON.parse(r.texte).error).toMatch(/Plus de 500 dépenses/);
  });
});

test.describe("écrans financiers — totaux exacts au-delà de 1 000 lignes", () => {
  test.setTimeout(180_000);

  test("trésorerie : total à encaisser et à payer (5 000 pièces)", async ({ page }) => {
    const e = entreprise("f5000");
    const v = verite<{ encaisser: number; payer: number }>(`select json_build_object(
      'encaisser', (select coalesce(sum(greatest(0, f.montant_ttc - f.montant_paye + coalesce((select sum(a.montant_ttc) from factures a where a.entreprise_id = f.entreprise_id and a.type = 'avoir' and a.statut <> 'annulee' and a.facture_origine_id = f.id), 0))), 0) from factures f where f.entreprise_id = '${e}' and f.statut not in ('payee','annulee','avoir_emis','brouillon')),
      'payer', (select coalesce(sum(greatest(0, d.montant_ttc - d.montant_regle)), 0) from depenses_fournisseurs d where d.entreprise_id = '${e}' and d.statut not in ('payee','annulee')))`);
    await connecter(page, admin("f5000"));
    await page.goto("/tresorerie");
    await expect(page.getByRole("link", { name: /Total à encaisser/ })).toContainText(euros(v.encaisser));
    await expect(page.getByRole("link", { name: /Total à payer/ })).toContainText(euros(v.payer));
  });

  test("factures fournisseurs : totaux sur 20 000 pièces, liste bornée annoncée", async ({ page }) => {
    const e = entreprise("f2000");
    const v = verite<{ total: number; regle: number }>(`select json_build_object('total', sum(montant_ttc) filter (where statut <> 'annulee'), 'regle', sum(montant_regle)) from depenses_fournisseurs where entreprise_id = '${e}'`);
    await connecter(page, admin("f2000"));
    await page.goto("/depenses");
    await expect(page.getByText("Total TTC")).toContainText(euros(v.total));
    await expect(page.getByText("Réglé", { exact: false }).first()).toContainText(euros(v.regle));
    await expect(page.getByText(/pièces les plus récentes sont listées sur 20000/)).toBeVisible();
  });

  test("stock : valeur et nombre d'articles (5 000 articles)", async ({ page }) => {
    const e = entreprise("f5000");
    const v = verite<{ n: number; valeur: number }>(`select json_build_object('n', count(*), 'valeur', sum(quantite_stock * prix_achat_ht)) from articles_stock where entreprise_id = '${e}' and actif`);
    await connecter(page, admin("f5000"));
    await page.goto("/stock");
    await expect(page.getByText("Articles actifs").locator("..")).toContainText(String(v.n));
    await expect(page.locator("main")).toContainText(euros(v.valeur));
  });

  test("pointage d'équipe : heures par salarié sur le mois (5 000 pointages)", async ({ page }) => {
    const e = entreprise("f5000");
    const v = verite<{ nom: string; heures: number }>(`select json_build_object('nom', min(em.prenom || ' ' || em.nom), 'heures', sum(p.heures_normales + p.heures_supplementaires)) from pointages p join employes em on em.id = p.employe_id where p.entreprise_id = '${e}' and p.date between '2026-03-01' and '2026-03-31' and em.nom = 'Salarié001'`);
    await connecter(page, admin("f5000"));
    await page.goto("/pointage/gestion?mois=2026-03");
    const carte = page.locator("div.rounded.bg-neutral-50.px-3", { hasText: v.nom });
    await expect(carte).toContainText(`${Number(v.heures)} h`);
  });

  test("planning : heures planifiées de la semaine (1 462 affectations)", async ({ page }) => {
    const e = entreprise("f1462");
    const v = verite<{ heures: number; ouvriers: number }>(`select json_build_object('heures', sum(heures), 'ouvriers', count(distinct employe_id)) from affectations where entreprise_id = '${e}' and date between '2026-03-02' and '2026-03-08'`);
    await connecter(page, admin("f1462"));
    await page.goto("/planning?semaine=2026-03-02");
    await expect(page.getByText(/heures planifiées/)).toHaveText(`${Number(v.heures)} heures planifiées · ${v.ouvriers} ouvrier(s)`);
  });
});
