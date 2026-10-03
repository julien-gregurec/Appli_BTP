import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/*
 * ELSATIA GP BUSINESS HARDENING V9.1 — recette métier navigateur (UI réelle).
 *
 * Parcours : client → chantier → devis remisé → acceptation → facture → émission →
 * paiement (double clic) → impression → pointage oublié (salarié) → rejet (chef) →
 * totaux d'heures → rentabilité → clôture ; matrice écran × rôle (6 rôles) ;
 * contrôles UI = DB au centime.
 *
 * Pile : tests/e2e/gp-business-hardening-pile-locale/preparer-base.sh (PostgreSQL 16 +
 * train complet + vrai PostgREST + passerelle locale), Gestion Pro compilé
 * (`next build` + `next start -p 3100`). Mot de passe « test » pour tous les comptes.
 */
const BASE = process.env.GPB_E2E_DB ?? "gpb_e2e";
const MDP = "test";

function psql(requete: string) {
  if (!/^[a-z0-9_]+$/.test(BASE)) throw new Error("GPB_E2E_DB invalide");
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -A -t -v ON_ERROR_STOP=1 -d ${BASE}`], { input: requete, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const ENTREPRISE = () => psql("select id from entreprises where nom = 'GPB Alsace Test BTP';");
const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const espaces = (s: string) => s.replace(/[  ]/g, " ");

async function connecter(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });
test.beforeEach(() => { psql("truncate rate_limits_applicatifs;"); });

const etat: { clientId?: string; chantierId?: string; devisId?: string; factureId?: string } = {};

test("S1 client : identité obligatoire (B02), puis création", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto("/clients/nouveau");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText("Renseignez au moins un nom ou une société.")).toBeVisible();
  expect(Number(psql(`select count(*) from clients where entreprise_id = '${ENTREPRISE()}' and nom is null and societe is null;`))).toBe(0);

  await page.locator("select[name=statut]").selectOption("actif");
  await page.locator("input[name=nom]").fill("Dupont Recette");
  await page.locator("input[name=prenom]").fill("Marie");
  await page.locator("input[name=delai_paiement_jours]").fill("45");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  etat.clientId = page.url().split("/").pop();
  expect(psql(`select nom || '|' || delai_paiement_jours from clients where id = '${etat.clientId}';`)).toBe("Dupont Recette|45");
});

test("S2 chantier : budget négatif (B31) et dates inversées (B07) refusés, puis création", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto("/chantiers/nouveau");
  const remplir = async () => {
    await page.locator("select[name=client_id]").selectOption(etat.clientId!);
    await page.locator("input[name=nom]").fill("Rénovation Recette");
  };
  await remplir();
  await page.locator("input[name=budget_previsionnel]").fill("-500");
  await page.getByRole("button", { name: "Créer le chantier" }).click();
  await expect(page.getByText("Le budget prévisionnel doit être un montant positif.")).toBeVisible();

  await remplir();
  await page.locator("input[name=date_debut_prevue]").fill("2026-11-10");
  await page.locator("input[name=date_fin_prevue]").fill("2026-11-01");
  await page.getByRole("button", { name: "Créer le chantier" }).click();
  await expect(page.getByText("La date de fin prévue précède la date de début.")).toBeVisible();

  await remplir();
  await page.locator("input[name=date_debut_prevue]").fill("2026-10-05");
  await page.locator("input[name=date_fin_prevue]").fill("2026-12-18");
  await page.locator("input[name=budget_previsionnel]").fill("6000");
  await page.getByRole("button", { name: "Créer le chantier" }).click();
  await page.waitForURL(/\/chantiers\/[0-9a-f-]{36}$/);
  etat.chantierId = page.url().split("/").pop();
  expect(psql(`select count(*) from chantiers where client_id = '${etat.clientId}';`)).toBe("1");
});

async function saisirLigne(page: Page, i: number, l: { designation: string; quantite: string; pu: string; remise: string; tva: string }) {
  await page.getByPlaceholder("Désignation").nth(i).fill(l.designation);
  await page.getByTitle("Quantité").nth(i).fill(l.quantite);
  await page.getByTitle("Prix unitaire HT").nth(i).fill(l.pu);
  await page.getByTitle("Remise ligne %").nth(i).fill(l.remise);
  await page.getByTitle("Taux TVA").nth(i).selectOption(l.tva);
}

test("S3 devis : quantité négative refusée (B05), devis remisé 3 taux de TVA = calcul indépendant au centime", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto("/devis/nouveau");
  const selects = page.locator("main select");
  await selects.nth(0).selectOption(etat.clientId!);
  await expect(selects.nth(1)).toBeEnabled();
  await selects.nth(1).selectOption(etat.chantierId!);
  await page.locator('main input[type=number][step="0.5"]').fill("3");
  await saisirLigne(page, 0, { designation: "Peinture murs", quantite: "-2", pu: "33.33", remise: "5", tva: "10" });
  await page.getByRole("button", { name: "Créer le devis (brouillon)" }).click();
  await expect(page.getByText(/Quantité négative sur la ligne « Peinture murs »/)).toBeVisible();

  await saisirLigne(page, 0, { designation: "Peinture murs", quantite: "12.5", pu: "33.33", remise: "5", tva: "10" });
  await page.getByRole("button", { name: "+ Ajouter une ligne" }).click();
  await saisirLigne(page, 1, { designation: "Fourniture menuiseries", quantite: "3", pu: "1234.56", remise: "2.5", tva: "20" });
  await page.getByRole("button", { name: "+ Ajouter une ligne" }).click();
  await saisirLigne(page, 2, { designation: "Isolation forfait", quantite: "1", pu: "999.99", remise: "0", tva: "5.5" });
  await page.getByRole("button", { name: "Créer le devis (brouillon)" }).click();
  await page.waitForURL(/\/devis\/[0-9a-f-]{36}/);
  etat.devisId = page.url().split("/").pop()!.split("?")[0];

  // Calcul indépendant : HT ligne = q × PU × (1 − remise ligne), remise globale sur HT et TVA, arrondi final.
  const lignes = [[12.5, 33.33, 5, 10], [3, 1234.56, 2.5, 20], [1, 999.99, 0, 5.5]];
  let ht = 0; let tva = 0;
  for (const [q, pu, r, t] of lignes) { const l = q * pu * (1 - r / 100); ht += l; tva += (l * t) / 100; }
  ht *= 0.97; tva *= 0.97;
  const attendu = { ht: Math.round(ht * 100) / 100, tva: Math.round(tva * 100) / 100, ttc: Math.round((ht + tva) * 100) / 100 };
  expect(attendu.ttc).toBe(5648.96);
  expect(psql(`select montant_ht || '|' || montant_tva || '|' || montant_ttc from devis where id = '${etat.devisId}';`)).toBe(`${attendu.ht.toFixed(2)}|${attendu.tva.toFixed(2)}|${attendu.ttc.toFixed(2)}`);
  const texte = espaces(await page.locator("main").innerText());
  expect(texte).toContain(espaces(euros(attendu.ttc)));
});

test("S4 acceptation → facture = devis au centime (B16), devis facturé une fois (B34)", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto(`/devis/${etat.devisId}`);
  const statutDevis = page.locator("main select").filter({ has: page.locator('option[value="envoye"]') });
  await statutDevis.selectOption("envoye");
  await expect.poll(() => psql(`select statut from devis where id = '${etat.devisId}';`)).toBe("envoye");
  await page.reload();
  await statutDevis.selectOption("accepte");
  await expect.poll(() => psql(`select statut from devis where id = '${etat.devisId}';`)).toBe("accepte");
  await page.reload();
  await expect(page.getByRole("button", { name: "Créer une facture depuis ce devis" })).toBeVisible();
  expect(psql(`select statut from devis where id = '${etat.devisId}';`)).toBe("accepte");
  await page.getByRole("button", { name: "Créer une facture depuis ce devis" }).click();
  await page.waitForURL(/\/factures\/[0-9a-f-]{36}/);
  etat.factureId = page.url().split("/").pop()!.split("?")[0];
  expect(psql(`select f.montant_ht || '|' || f.montant_tva || '|' || f.montant_ttc = d.montant_ht || '|' || d.montant_tva || '|' || d.montant_ttc from factures f join devis d on d.id = f.devis_origine_id where f.id = '${etat.factureId}';`)).toBe("t");
  expect(espaces(await page.locator("main").innerText())).toContain(espaces(euros(5648.96)));
  // Échéance = émission + délai du client (45 j).
  expect(psql(`select date_echeance - date_emission from factures where id = '${etat.factureId}';`)).toBe("45");

  await page.goto(`/devis/${etat.devisId}`);
  await expect(page.getByText(/Devis facturé/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer une facture depuis ce devis" })).toHaveCount(0);
});

test("S5 émission : échéance antérieure refusée (B30), plus d'annulation après émission (B24)", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto(`/factures/${etat.factureId}`);
  const emission = psql(`select date_emission from factures where id = '${etat.factureId}';`);
  const veille = new Date(new Date(`${emission}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  await page.locator("input[name=date_echeance]").fill(veille);
  await page.getByRole("button", { name: "Enregistrer l’échéance" }).click();
  await expect(page.getByText("L’échéance ne peut pas précéder la date d’émission.")).toBeVisible();
  expect(psql(`select date_echeance - date_emission from factures where id = '${etat.factureId}';`)).toBe("45");

  const statut = page.locator("main select").filter({ has: page.locator('option[value="envoyee"]') });
  await statut.selectOption("envoyee");
  await expect.poll(() => psql(`select statut from factures where id = '${etat.factureId}';`)).toBe("envoyee");
  await page.reload();
  const numero = psql(`select numero from factures where id = '${etat.factureId}';`);
  expect(numero).toMatch(/^FAC-\d{4}-\d{3,}$/);
  await expect(page.locator("main")).toContainText(numero);
  const options = await page.locator("main select").filter({ has: page.locator('option[value="envoyee"]') }).locator("option").allTextContents();
  expect(options.join("|")).not.toMatch(/Annul/);
});

test("S6 paiement : double clic = un seul encaissement (B17/B29), solde → payée", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto(`/factures/${etat.factureId}`);
  const actions: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.url()); });
  // Réseau lent : chaque action serveur prend 1,5 s (fenêtre de double soumission élargie).
  await page.route("**/factures/**", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.locator("input[name=montant]").fill("1000");
  await page.locator("select[name=mode]").selectOption("virement");
  await page.getByRole("button", { name: "Enregistrer l’encaissement" }).dblclick();
  await page.getByRole("button", { name: "Enregistrer l’encaissement" }).click({ timeout: 2_000 }).catch(() => {});
  await expect.poll(() => psql(`select count(*) || '|' || coalesce(sum(montant), 0)::numeric(12,2) from paiements where facture_id = '${etat.factureId}';`), { timeout: 15_000 }).toBe("1|1000.00");
  await page.waitForTimeout(2_500);
  expect(psql(`select count(*) from paiements where facture_id = '${etat.factureId}';`)).toBe("1");
  expect(actions.length).toBe(1);
  expect(psql(`select statut || '|' || montant_paye from factures where id = '${etat.factureId}';`)).toBe("payee_partiel|1000.00");

  // Second clic légitime après la réponse : solde exact → payée.
  await page.unroute("**/factures/**");
  await page.reload();
  await page.locator("input[name=montant]").fill("4648.96");
  await page.locator("select[name=mode]").selectOption("cheque");
  await page.locator("input[name=reference]").fill("CHQ-1");
  await page.getByRole("button", { name: "Enregistrer l’encaissement" }).click();
  await expect.poll(() => psql(`select statut || '|' || montant_paye from factures where id = '${etat.factureId}';`), { timeout: 15_000 }).toBe("payee|5648.96");
  await page.reload();
  await expect(page.getByText("Cette facture est entièrement réglée.")).toBeVisible();
});

test("S7 impression : dates au format français (B06)", async ({ page }) => {
  await connecter(page, "gerant@gpb.invalid");
  await page.goto(`/imprimer/factures/${etat.factureId}`);
  const [emission, echeance] = psql(`select to_char(date_emission, 'DD/MM/YYYY') || '|' || to_char(date_echeance, 'DD/MM/YYYY') from factures where id = '${etat.factureId}';`).split("|");
  const texte = await page.locator("body").innerText();
  expect(texte).toContain(`Émis le ${emission}`);
  expect(texte).toContain(`Échéance le ${echeance}`);
  expect(texte).not.toMatch(/Émis le \d{4}-\d{2}-\d{2}/);
  await page.goto(`/imprimer/devis/${etat.devisId}`);
  expect(await page.locator("body").innerText()).not.toMatch(/Émis le \d{4}-\d{2}-\d{2}/);
});
