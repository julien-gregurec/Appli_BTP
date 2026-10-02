import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA Tools → Gestion Pro — Relevé & Métré — Lot 11 : costing handoff V1, sur pile RÉELLE (GoTrue + PostgREST +
 * PostgreSQL avec la vraie RLS et les 373 migrations). Tools en `next dev --webpack` (:3020), Gestion Pro en `next dev`
 * (:3100), MÊME pile Supabase.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_GP_URL=http://localhost:3100 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 \
 *   RELEVE_E2E_ANON_KEY=… RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot11-gp.spec.ts --project=desktop-chromium
 *
 * Pile : scripts/local-postgres-bootstrap/releve_e2e_stack.sh puis releve_lot11_gp_seed.sql (permissions GP des comptes).
 * Parcours : Tools « Envoyer vers Gestion Pro » → GP « Imports Tools / Relevé » → correspondance → devis brouillon →
 * nouvelle version (devis jamais modifié, comparaison) → erreurs (GP injoignable, import interrompu, source obsolète,
 * contrat invalide / version inconnue) → autre tenant → performance 100 / 1 000 / 5 000 lignes.
 */
const TOOLS = process.env.RELEVE_E2E_BASE_URL;
const GP = process.env.RELEVE_E2E_GP_URL;
const SUPABASE_URL = process.env.RELEVE_E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.RELEVE_E2E_ANON_KEY ?? "";
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";
/** Facultatif : clé service_role LOCALE, pour fermer puis rouvrir l'abonnement Gestion Pro (scénario « GP fermé »). */
const SERVICE_ROLE = process.env.RELEVE_E2E_SERVICE_ROLE_KEY ?? "";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1366, height: 1024 }, contextOptions: { reducedMotion: "reduce" } });
test.skip(!TOOLS || !GP || !SUPABASE_URL || !ANON_KEY || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Tools → GP locale non configurée (RELEVE_E2E_*)");
test.setTimeout(300_000);

const suffix = Date.now().toString(36);
const dir = join(tmpdir(), `releve-lot11-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const perf: Record<string, unknown> = {};

const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const ouvrage = (extra: Record<string, unknown>) => ({
  nom: "Ouvrage", categorie: "peinture", unite: "m2", regle: { source: "surface_sol" }, pertePourcent: 0, arrondi: { mode: "aucun" },
  etatTravaux: "nouveau", etats: ["existant", "nouveau"], ...extra,
});
/** Montant français tolérant aux espaces fines insécables (Intl). */
const montant = (texte: string) => new RegExp(texte.replace(/[+.*?()[\]]/g, "\\$&").replace(/ /g, "\\s?"));

type Ctx = { a: SupabaseClient; b: SupabaseClient; tenantA: string; releveId: string; etageId: string; planId: string; chantierGp: { id: string; nom: string; client_id: string }; ouv: Record<string, string> };
let ctx: Ctx;

async function client(email: string): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return supabase;
}
async function signInTools(page: Page, email = EMAIL_A) {
  await page.goto(`${TOOLS}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}
// Une seule connexion Gestion Pro par passe (la page /login est limitée à 10 essais / 10 min / IP, voulu) :
// la session est ensuite réutilisée par cookies.
const gpSession = join(dir, "gp-session.json");
async function signInGp(page: Page, email = EMAIL_A) {
  if (existsSync(gpSession)) {
    await page.context().addCookies((JSON.parse(readFileSync(gpSession, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] }).cookies);
    await page.goto(`${GP}/dashboard`);
    if (!/\/login/.test(page.url())) return;
  }
  await page.goto(`${GP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
  await page.context().storageState({ path: gpSession });
}
async function revision(planId: string) {
  const { data } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  return (data as { revision: number }).revision;
}
async function seedPlan(etageId: string, mods: Record<string, unknown>) {
  const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
  const planId = (plan as { id: string }).id;
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: await revision(planId), p_modifications: mods }));
  return planId;
}
async function imports(releveId = ctx.releveId, as: SupabaseClient = ctx.a) {
  const { data } = must(await as.from("gp_tools_imports").select("id,source_version,statut,devis_id,nouvelle_version_id,montant_estimatif_ht,nb_lignes,nb_ouvrages").eq("source_releve_id", releveId).order("source_version"));
  return (data ?? []) as { id: string; source_version: number; statut: string; devis_id: string | null; nouvelle_version_id: string | null; montant_estimatif_ht: number; nb_lignes: number; nb_ouvrages: number }[];
}
const estUrl = (releveId = ctx.releveId) => `${TOOLS}/releves/estimation?id=${releveId}`;
async function envoyer(page: Page) {
  await page.getByTestId("est-envoyer-gp").click();
  await expect(page.getByTestId("gp-envoi-resume")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("gp-envoi-confirmer").click();
}

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const { data: chantier } = must(await a.from("chantiers").select("id,nom,client_id").eq("entreprise_id", tenantA).order("nom").limit(1).single());
  const chantierGp = chantier as { id: string; nom: string; client_id: string };
  const releveId = uuid(); const batimentId = uuid(); const etageId = uuid(); const sejour = uuid(); const chambre = uuid();
  // Relevé lié au chantier GP (le client GP est déduit du chantier par le serveur à l'import).
  must(await a.from("tools_releves").insert({ id: releveId, entreprise_id: tenantA, nom: `Relevé Lot 11 ${suffix}`, reference: `L11-${suffix}`, chantier_nom: "Maison Lot 11", chantier_gp_id: chantierGp.id }));
  const { data: ch } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", releveId).limit(1).maybeSingle();
  const chantierId = (ch as { id: string } | null)?.id ?? uuid();
  if (!ch) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: releveId, nom: "Maison Lot 11" }));
  must(await a.from("tools_releves_batiments").insert({ id: batimentId, releve_id: releveId, chantier_id: chantierId, nom: "Maison" }));
  must(await a.from("tools_releves_etages").insert({ id: etageId, releve_id: releveId, batiment_id: batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0 }));
  must(await a.from("tools_releves_pieces").insert([
    { id: sejour, releve_id: releveId, etage_id: etageId, nom: "Séjour", usage: "sejour", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: chambre, releve_id: releveId, etage_id: etageId, nom: "Chambre", usage: "chambre", ordre: 1, hauteur_sous_plafond_mm: 2500 },
  ]));
  ctx = { a, b, tenantA, releveId, etageId, planId: "", chantierGp, ouv: { pei: uuid(), car: uuid(), net: uuid(), pli: uuid() } };
  // Séjour 4 × 3 m = 12 m², Chambre 3 × 3 m = 9 m² (contours, sol).
  ctx.planId = await seedPlan(etageId, { murs: [], ouvertures: [], contours: [
    { pieceId: sejour, points: rect(0, 0, 4000, 3000), murIds: [], graine: { x: 2000, y: 1500 } },
    { pieceId: chambre, points: rect(4000, 0, 7000, 3000), murIds: [], graine: { x: 5500, y: 1500 } },
  ] });
  must(await a.rpc("tools_releve_ouvrages_importer", { p_plan_id: ctx.planId, p_ouvrages: [
    { id: ctx.ouv.pei, donnees: ouvrage({ nom: "Peinture sol", code: `PEI-${suffix}` }) },
    { id: ctx.ouv.car, donnees: ouvrage({ nom: "Carrelage", code: `CAR-${suffix}`, categorie: "carrelage" }) },
    { id: ctx.ouv.net, donnees: ouvrage({ nom: "Nettoyage", categorie: "autre", unite: "forfait", regle: { source: "forfait" } }) },
    { id: ctx.ouv.pli, donnees: ouvrage({ nom: "Plinthes", code: `PLI-${suffix}`, categorie: "plinthes", unite: "ml", regle: { source: "perimetre_utile" } }) },
  ] }));
  const px = (id: string, donnees: unknown) => a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: ctx.planId, p_ouvrage_id: id, p_donnees: donnees });
  must(await px(ctx.ouv.pei, { composantes: [{ type: "materiau", prixUnitaire: 3.5 }, { type: "main_d_oeuvre", heuresParUnite: 0.25, tauxHoraire: 45 }] }));
  must(await px(ctx.ouv.car, { composantes: [{ type: "materiau", prixUnitaire: 40 }] }));
  must(await px(ctx.ouv.net, { composantes: [{ type: "autre", prixUnitaire: 350 }] }));
  // Plinthes : volontairement SANS prix (ligne conservée, « sans prix »).
});
test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// Total : peinture 21 m² × 14,75 = 309,75 ; carrelage 21 m² × 40 = 840,00 ; nettoyage 350,00 ; plinthes sans prix → 1 499,75 € HT.
test("Tools : « Envoyer vers Gestion Pro » — résumé (source, chantier, contrat, ouvrages, montant), confirmation, import v1", async ({ page }) => {
  await signInTools(page);
  await page.goto(estUrl());
  await expect(page.getByTestId("est-total")).toHaveText(montant("1 499,75 €"), { timeout: 60_000 });
  await page.getByTestId("est-envoyer-gp").click();
  const resume = page.getByTestId("gp-envoi-resume");
  await expect(resume).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("gp-resume-source")).toHaveText("Tools · Relevé & Métré");
  await expect(page.getByTestId("gp-resume-chantier")).toHaveText("Maison Lot 11");
  await expect(page.getByTestId("gp-resume-contrat")).toHaveText("elsatia.tools.estimation 1.1.0"); // train V9 : Lot 10 1.1.0
  await expect(page.getByTestId("gp-resume-ouvrages")).toHaveText("4");
  await expect(page.getByTestId("gp-resume-lignes")).toHaveText("7 · 2 sans prix");
  await expect(page.getByTestId("gp-resume-montant")).toHaveText(montant("1 499,75 € HT"));
  await expect(resume).toContainText("et non un devis");
  const t = Date.now();
  await page.getByTestId("gp-envoi-confirmer").click();
  const msg = page.getByTestId("gp-envoi-message");
  await expect(msg).toHaveAttribute("data-statut", "importe", { timeout: 60_000 });
  perf.envoiInitialMs = Date.now() - t;
  await expect(msg).toContainText("Transmis à Gestion Pro : import version 1 — 4 ouvrages, 7 lignes");
  await expect(msg).toContainText("Le chiffrage (prix de vente, marge, TVA, devis) se fait dans Gestion Pro.");
  await expect(page.getByTestId("gp-envoi-historique")).toHaveCount(1);
  await expect(page.getByTestId("gp-envoi-historique").first()).toContainText("Reçue par Gestion Pro");
  const rows = await imports();
  expect(rows.map((r) => [r.source_version, r.statut, Number(r.montant_estimatif_ht), r.nb_lignes, r.nb_ouvrages])).toEqual([[1, "importe", 1499.75, 7, 4]]);
  // Tools n'a créé aucun devis.
  const { count } = await ctx.a.from("devis").select("id", { count: "exact", head: true }).eq("chantier_id", ctx.chantierGp.id).ilike("notes_internes", `%Relevé Lot 11 ${suffix}%`);
  expect(count).toBe(0);
});

test("Double envoi : même dossier transmis deux fois → « déjà transmis », aucun doublon", async ({ page }) => {
  await signInTools(page);
  await page.goto(estUrl());
  await envoyer(page);
  await expect(page.getByTestId("gp-envoi-message")).toHaveText("Déjà transmis à Gestion Pro (version 1) : contenu identique, aucun doublon créé.", { timeout: 60_000 });
  // Double clic / envois concurrents : toujours un seul import.
  const { data: snap } = must(await ctx.a.from("gp_tools_imports").select("snapshot").eq("source_releve_id", ctx.releveId).single());
  const payload = (snap as { snapshot: unknown }).snapshot;
  const res = await Promise.all([1, 2, 3].map(() => ctx.a.rpc("gp_tools_importer_estimation", { p_releve_id: ctx.releveId, p_etat: "existant", p_payload: payload })));
  expect(res.map((r) => (r.data as { statut: string }).statut)).toEqual(["deja_importe", "deja_importe", "deja_importe"]);
  expect((await imports()).length).toBe(1);
});

test("Gestion Pro : « Imports Tools / Relevé » — source, date, version, chantier, nombre d'ouvrages, montant estimatif Tools", async ({ page }) => {
  await signInGp(page);
  await page.goto(`${GP}/devis`);
  await page.getByTestId("lien-imports-tools").click();
  await expect(page).toHaveURL(/\/devis\/imports-tools$/);
  await expect(page.getByRole("heading", { name: "Imports Tools / Relevé" })).toBeVisible();
  const carte = page.locator(`[data-testid="import-tools"][data-releve="${ctx.releveId}"]`);
  await expect(carte).toBeVisible();
  await expect(carte).toContainText(`Relevé Lot 11 ${suffix} · L11-${suffix}`);
  await expect(carte).toContainText("Source : Tools · Relevé & Métré · Existant · reçu le");
  await expect(carte.getByTestId("import-tools-version")).toContainText("v1 (contrat 1.0.0)");
  await expect(carte.getByTestId("import-tools-chantier")).toHaveText(ctx.chantierGp.nom);
  await expect(carte.getByTestId("import-tools-ouvrages")).toHaveText("4");
  await expect(carte.getByTestId("import-tools-montant")).toHaveText(montant("1 499,75 € HT"));
  await expect(carte.getByTestId("import-tools-statut")).toHaveText("À chiffrer");
  await carte.getByTestId("import-tools-lien").click();
  await expect(page.getByTestId("import-source")).toContainText("Tools · Relevé & Métré · Existant · version 1 · contrat 1.0.0 · reçu le");
  await expect(page.getByTestId("import-chantier")).toHaveText(ctx.chantierGp.nom);
  await expect(page.getByTestId("import-lignes")).toHaveText("7 · 0 liée(s) · 2 sans prix");
  await expect(page.getByTestId("import-pj")).toContainText("photo(s)");
  await expect(page.getByTestId("import-ligne")).toHaveCount(7);
  await expect(page.locator('[data-testid="import-ligne"][data-correspondance="non_liee"]')).toHaveCount(7);
  await expect(page.getByTestId("import-journal-ligne").filter({ hasText: "Réimport identique (aucun doublon)" })).toHaveCount(4);
  await expect(page.getByTestId("import-journal-ligne").filter({ hasText: "Import" }).first()).toBeVisible();
});

test("Gestion Pro : correspondance ouvrage Tools → prestation, puis devis BROUILLON explicite (une seule fois)", async ({ page }) => {
  const prestationId = uuid();
  must(await ctx.a.from("prestations_catalogue").insert({ id: prestationId, entreprise_id: ctx.tenantA, designation: `Carrelage grès posé ${suffix}`, type: "fourniture", unite: "m²", prix_unitaire_ht: 72, taux_tva: 10 }));
  const [v1] = await imports();
  await signInGp(page);
  await page.goto(`${GP}/devis/imports-tools/${v1.id}`);
  const ouvrageCar = page.locator(`[data-testid="import-ouvrage"][data-cle="car-${suffix}|m2"]`);
  await ouvrageCar.getByTestId("import-ouvrage-prestation").selectOption(prestationId);
  await ouvrageCar.getByTestId("import-ouvrage-enregistrer").click();
  await expect(page.getByTestId("import-succes")).toContainText("Correspondance enregistrée");
  await expect(page.getByTestId("import-lignes")).toHaveText("7 · 2 liée(s) · 2 sans prix");
  await page.getByTestId("import-creer-devis").click();
  await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}\?success=/, { timeout: 60_000 });
  const devisId = page.url().match(/\/devis\/([0-9a-f-]{36})/)![1];
  const { data: devis } = must(await ctx.a.from("devis").select("statut,numero,client_id,chantier_id,montant_ht").eq("id", devisId).single());
  expect(devis).toMatchObject({ statut: "brouillon", numero: null, client_id: ctx.chantierGp.client_id, chantier_id: ctx.chantierGp.id });
  const { data: lignes } = must(await ctx.a.from("lignes_devis").select("designation,quantite,unite,prix_unitaire_ht,taux_tva").eq("devis_id", devisId).order("ordre"));
  expect((lignes as { designation: string }[]).map((l) => l.designation)).toEqual(["Peinture sol", `Carrelage grès posé ${suffix}`, "Nettoyage", "Plinthes"]);
  const car = (lignes as { designation: string; quantite: number; prix_unitaire_ht: number; taux_tva: number }[])[1];
  expect([Number(car.quantite), Number(car.prix_unitaire_ht), Number(car.taux_tva)]).toEqual([21, 72, 10]);
  // GP propriétaire du prix : 21 × 14,75 + 21 × 72 (prestation GP) + 350 + plinthes (sans prix, 0) = 2 171,75 € HT.
  expect(Number((devis as { montant_ht: number }).montant_ht)).toBe(2171.75);
  await page.goto(`${GP}/devis/imports-tools/${v1.id}`);
  await expect(page.getByTestId("import-statut")).toHaveText("Devis brouillon créé");
  await expect(page.getByTestId("import-lien-devis")).toHaveAttribute("href", `/devis/${devisId}`);
  await expect(page.getByTestId("import-creer-devis")).toHaveCount(0);
  const again = await ctx.a.rpc("gp_tools_import_creer_devis", { p_import_id: v1.id });
  expect(again.error?.message).toBe("Un devis a déjà été créé depuis cet import");
  // Non-régression devis GP : l'éditeur du devis importé s'ouvre.
  await page.goto(`${GP}/devis/${devisId}/modifier`);
  await expect.poll(async () => page.locator("input, textarea").evaluateAll((els, v) => els.some((e) => (e as HTMLInputElement).value === v), `Carrelage grès posé ${suffix}`), { timeout: 60_000 }).toBe(true);
  await expect(page.locator("select").filter({ has: page.locator('option[value="m³"]') }).first()).toBeAttached();
});

test("Tools renvoie une nouvelle version : le devis GP déjà travaillé n'est jamais modifié ; nouvelle version disponible + comparaison", async ({ page }) => {
  const [v1] = await imports();
  const { data: avant } = must(await ctx.a.from("lignes_devis").select("id,designation,quantite,prix_unitaire_ht").eq("devis_id", v1.devis_id!).order("ordre"));
  const { data: devisAvant } = must(await ctx.a.from("devis").select("montant_ht,montant_ttc,updated_at").eq("id", v1.devis_id!).single());
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: ctx.planId, p_ouvrage_id: ctx.ouv.car, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 45 }] } }));
  await signInTools(page);
  await page.goto(estUrl());
  await expect(page.getByTestId("est-total")).toHaveText(montant("1 604,75 €"), { timeout: 60_000 });
  await envoyer(page);
  const msg = page.getByTestId("gp-envoi-message");
  await expect(msg).toHaveAttribute("data-statut", "nouvelle_version", { timeout: 60_000 });
  await expect(msg).toContainText("import version 2");
  await expect(msg).toContainText("le devis déjà créé n'est pas modifié");
  await expect(page.locator('[data-testid="gp-envoi-historique"][data-version="1"]')).toContainText("Prise en charge dans Gestion Pro");
  const rows = await imports();
  expect(rows.map((r) => [r.source_version, r.statut, Number(r.montant_estimatif_ht)])).toEqual([[1, "devis_cree", 1499.75], [2, "importe", 1604.75]]);
  expect(rows[0].nouvelle_version_id).toBe(rows[1].id);
  const { data: apres } = must(await ctx.a.from("lignes_devis").select("id,designation,quantite,prix_unitaire_ht").eq("devis_id", v1.devis_id!).order("ordre"));
  const { data: devisApres } = must(await ctx.a.from("devis").select("montant_ht,montant_ttc,updated_at").eq("id", v1.devis_id!).single());
  expect(apres).toEqual(avant);
  expect(devisApres).toEqual(devisAvant);
  // GP : bannière sur la v1 (devis créé), comparaison v1 → v2.
  await signInGp(page);
  await page.goto(`${GP}/devis/imports-tools/${v1.id}`);
  await expect(page.getByTestId("import-statut")).toHaveText("Devis créé · nouvelle version disponible");
  await expect(page.getByTestId("import-nouvelle-version")).toContainText("Nouvelle version disponible : v2");
  await expect(page.getByTestId("import-nouvelle-version")).toContainText("Le devis créé depuis cette version n'a pas été modifié.");
  await page.getByTestId("import-comparer-suivante").click();
  await expect(page.getByTestId("import-comparaison")).toBeVisible();
  await expect(page.getByTestId("import-comparaison-resume")).toContainText("Version 1 → 2 : 2 modifiée(s) ; écart estimatif");
  await expect(page.getByTestId("import-comparaison-resume")).toContainText(montant("+105,00 €"));
  await expect(page.getByTestId("import-comparaison-lot")).toContainText("Carrelage");
  await expect(page.locator('[data-testid="import-comparaison-ligne"][data-statut="modifiee"]')).toHaveCount(2);
  await page.goto(`${GP}/devis/imports-tools`);
  const carte = page.locator(`[data-testid="import-tools"][data-releve="${ctx.releveId}"]`);
  await expect(carte.getByTestId("import-tools-version")).toContainText("v2");
  await expect(carte).toContainText("Versions antérieures : v1 (devis créé)");
});

test("Erreurs : GP injoignable puis renvoi sûr ; import interrompu (réponse perdue) sans doublon ; source obsolète ; contrat invalide / version inconnue", async ({ page }) => {
  await signInTools(page);
  // 1. Gestion Pro injoignable : la requête n'arrive pas → rien d'écrit, renvoi.
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: ctx.planId, p_ouvrage_id: ctx.ouv.net, p_donnees: { composantes: [{ type: "autre", prixUnitaire: 400 }] } }));
  await page.goto(estUrl());
  await page.route("**/rest/v1/rpc/gp_tools_importer_estimation", (route) => route.abort("connectionrefused"));
  await envoyer(page);
  const erreur = page.getByTestId("gp-envoi-erreur");
  await expect(erreur).toHaveAttribute("data-type", "reseau", { timeout: 60_000 });
  await expect(erreur).toHaveText("Gestion Pro est injoignable pour le moment. Rien n'a été créé en double : vous pouvez renvoyer sans risque.");
  expect((await imports()).length).toBe(2);
  await page.unroute("**/rest/v1/rpc/gp_tools_importer_estimation");
  await expect(page.getByTestId("gp-envoi-confirmer")).toHaveText("Renvoyer");
  await page.getByTestId("gp-envoi-confirmer").click();
  await expect(page.getByTestId("gp-envoi-message")).toContainText("import version 3", { timeout: 60_000 });
  expect((await imports()).length).toBe(3);

  // 1 bis. Gestion Pro FERMÉ pour l'entreprise (abonnement GP suspendu ; Tools reste ouvert) : refus explicite, rien d'écrit.
  if (SERVICE_ROLE) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: ctx.planId, p_ouvrage_id: ctx.ouv.net, p_donnees: { composantes: [{ type: "autre", prixUnitaire: 410 }] } }));
    await page.goto(estUrl());
    await page.getByTestId("est-envoyer-gp").click();
    await expect(page.getByTestId("gp-envoi-resume")).toBeVisible({ timeout: 60_000 });
    // Gestion Pro se ferme pendant que l'utilisateur est sur l'écran : le serveur refuse, message exact.
    must(await admin.from("entreprises").update({ abonnement_statut: "suspendu" }).eq("id", ctx.tenantA));
    try {
      await page.getByTestId("gp-envoi-confirmer").click();
      await expect(page.getByTestId("gp-envoi-erreur")).toHaveAttribute("data-type", "gp_inaccessible", { timeout: 60_000 });
      await expect(page.getByTestId("gp-envoi-erreur")).toHaveText("Gestion Pro n'est pas accessible pour cette entreprise");
      // Rechargé, l'écran n'offre plus l'envoi (permission GP indisponible tant que Gestion Pro est fermé).
      await page.goto(estUrl());
      await expect(page.getByTestId("est-envoyer-gp")).toBeDisabled({ timeout: 60_000 });
      perf.gpFermeTeste = true;
    } finally {
      must(await admin.from("entreprises").update({ abonnement_statut: "essai" }).eq("id", ctx.tenantA));
    }
    expect((await imports()).length).toBe(3);
  }

  // 2. Import interrompu : le serveur a importé mais la réponse est perdue → le renvoi ne crée PAS de doublon.
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: ctx.planId, p_ouvrage_id: ctx.ouv.net, p_donnees: { composantes: [{ type: "autre", prixUnitaire: 420 }] } }));
  await page.goto(estUrl());
  await page.route("**/rest/v1/rpc/gp_tools_importer_estimation", async (route) => { await route.fetch(); await route.abort("connectionreset"); });
  await envoyer(page);
  await expect(page.getByTestId("gp-envoi-erreur")).toHaveAttribute("data-type", "reseau", { timeout: 60_000 });
  expect((await imports()).map((r) => r.source_version)).toEqual([1, 2, 3, 4]);
  await page.unroute("**/rest/v1/rpc/gp_tools_importer_estimation");
  await page.getByTestId("gp-envoi-confirmer").click();
  await expect(page.getByTestId("gp-envoi-message")).toHaveText("Déjà transmis à Gestion Pro (version 4) : contenu identique, aucun doublon créé.", { timeout: 60_000 });
  expect((await imports()).length).toBe(4);

  // 3. Ouvrage supprimé dans Tools après le chargement de l'estimation : envoi refusé, rechargement proposé.
  await page.goto(estUrl());
  await page.getByTestId("est-envoyer-gp").click();
  await expect(page.getByTestId("gp-envoi-resume")).toBeVisible({ timeout: 60_000 });
  must(await ctx.a.rpc("tools_releve_ouvrage_supprimer", { p_plan_id: ctx.planId, p_id: ctx.ouv.pli }));
  await page.getByTestId("gp-envoi-confirmer").click();
  await expect(page.getByTestId("gp-envoi-erreur")).toHaveAttribute("data-type", "obsolete", { timeout: 60_000 });
  await expect(page.getByTestId("gp-envoi-erreur")).toContainText("L'estimation a changé depuis son chargement");
  expect((await imports()).length).toBe(4);
  await page.getByTestId("gp-envoi-recharger").click();
  await expect(page.getByTestId("est-total")).toBeVisible({ timeout: 60_000 });
  await envoyer(page);
  await expect(page.getByTestId("gp-envoi-message")).toContainText("import version 5 — 3 ouvrages, 5 lignes", { timeout: 60_000 });

  // 4. Contrat invalide / version inconnue / données commerciales : refusés par Gestion Pro, rien d'écrit.
  const { data: snap } = must(await ctx.a.from("gp_tools_imports").select("snapshot").eq("source_releve_id", ctx.releveId).eq("source_version", 5).single());
  const p = (snap as { snapshot: Record<string, unknown> }).snapshot;
  const v2 = await ctx.a.rpc("gp_tools_importer_estimation", { p_releve_id: ctx.releveId, p_etat: "existant", p_payload: { ...p, contract: { name: "elsatia.tools.estimation", version: "2.0.0" } } });
  expect([v2.error?.code, v2.error?.message]).toEqual(["22023", "Version de contrat non prise en charge : 2.0.0 (Gestion Pro accepte elsatia.tools.estimation 1.x)"]);
  const inconnu = await ctx.a.rpc("gp_tools_importer_estimation", { p_releve_id: ctx.releveId, p_etat: "existant", p_payload: { ...p, contract: { name: "autre.contrat", version: "1.0.0" } } });
  expect(inconnu.error?.code).toBe("22023");
  const tva = await ctx.a.rpc("gp_tools_importer_estimation", { p_releve_id: ctx.releveId, p_etat: "existant", p_payload: { ...p, tauxTva: 20 } });
  expect(tva.error?.message).toContain("Donnée commerciale interdite");
  const minor = await ctx.a.rpc("gp_tools_importer_estimation", { p_releve_id: ctx.releveId, p_etat: "existant", p_payload: { ...p, contract: { name: "elsatia.tools.estimation", version: "1.4.0" } } });
  expect((minor.data as { statut: string }).statut).toBe("deja_importe");
  expect((await imports()).length).toBe(5);
});

test("Sécurité : l'autre tenant ne voit, n'importe, ne compare ni ne chiffre rien ; écritures directes refusées", async ({ page }) => {
  const rows = await imports();
  const { data: snap } = must(await ctx.a.from("gp_tools_imports").select("snapshot").eq("id", rows[rows.length - 1].id).single());
  const payload = (snap as { snapshot: unknown }).snapshot;
  const imp = await ctx.b.rpc("gp_tools_importer_estimation", { p_releve_id: ctx.releveId, p_etat: "existant", p_payload: payload });
  expect([imp.error?.code, imp.error?.message]).toEqual(["42501", "Relevé introuvable ou non accessible"]);
  expect((await imports(ctx.releveId, ctx.b)).length).toBe(0);
  const { count: lignesB } = await ctx.b.from("gp_tools_imports_lignes").select("id", { count: "exact", head: true });
  expect(lignesB).toBe(0);
  const cmp = await ctx.b.rpc("gp_tools_import_comparer", { p_import_id: rows[0].id, p_autre_id: rows[1].id });
  expect(cmp.error?.code).toBe("42501");
  const dv = await ctx.b.rpc("gp_tools_import_creer_devis", { p_import_id: rows[rows.length - 1].id });
  expect(dv.error?.code).toBe("42501");
  const hist = await ctx.b.rpc("gp_tools_imports_releve", { p_releve_id: ctx.releveId });
  expect(hist.error?.code).toBe("42501");
  // Écritures directes refusées, même pour le tenant propriétaire.
  const direct = await ctx.a.from("gp_tools_imports").update({ montant_estimatif_ht: 0 }).eq("id", rows[0].id).select();
  expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true);
  const ins = await ctx.a.from("gp_tools_imports_journal").insert({ entreprise_id: ctx.tenantA, action: "import" });
  expect(ins.error).not.toBeNull();
  // B dans Tools : le relevé de A est introuvable.
  await signInTools(page, EMAIL_B);
  await page.goto(estUrl());
  await expect(page.getByTestId("est-envoyer-gp")).toHaveCount(0);
  await expect(page.getByTestId("est-total")).toHaveCount(0);
});

test("Non-régression Gestion Pro : liste des devis, nouveau devis, chantiers et fiche chantier inchangés", async ({ page }) => {
  await signInGp(page);
  await page.goto(`${GP}/devis`);
  await expect(page.getByRole("heading", { name: "Devis", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Nouveau devis" })).toBeVisible();
  await expect(page.getByTestId("lien-imports-tools")).toHaveText("Imports Tools / Relevé");
  await page.goto(`${GP}/devis/nouveau`);
  await expect(page.getByRole("heading", { name: "Nouveau devis" })).toBeVisible({ timeout: 60_000 });
  await page.goto(`${GP}/chantiers`);
  await expect(page.getByRole("heading", { name: "Chantiers", exact: true })).toBeVisible();
  await expect(page.getByText(ctx.chantierGp.nom).filter({ visible: true }).first()).toBeVisible();
  await page.goto(`${GP}/chantiers/${ctx.chantierGp.id}`);
  await expect(page.getByRole("heading", { name: ctx.chantierGp.nom }).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
  // Les devis brouillons créés depuis Tools apparaissent dans la liste GP comme les autres (sans numéro).
  const { count } = await ctx.a.from("devis").select("id", { count: "exact", head: true }).eq("chantier_id", ctx.chantierGp.id).eq("statut", "brouillon").is("numero", null);
  expect(count ?? 0).toBeGreaterThanOrEqual(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance : 100, 1 000, 5 000 lignes (ouvrages × 5 pièces) : envoi réel (préparation + contrôle serveur + import),
// réimport identique, écran GP (liste, détail), comparaison, devis brouillon.
// ─────────────────────────────────────────────────────────────────────────────
for (const lignes of [100, 1000, 5000] as const) {
  test(`Performance ${lignes} lignes : envoi Tools → GP, réimport, écran GP, comparaison, devis`, async ({ page }) => {
    const nbPieces = 5; const nbOuvrages = lignes / nbPieces;
    const releveId = uuid(); const batimentId = uuid(); const etageId = uuid();
    must(await ctx.a.from("tools_releves").insert({ id: releveId, entreprise_id: ctx.tenantA, nom: `Perf Lot 11 ${lignes} ${suffix}`, chantier_nom: `Perf ${lignes}`, chantier_gp_id: ctx.chantierGp.id }));
    const { data: ch } = await ctx.a.from("tools_releves_chantiers").select("id").eq("releve_id", releveId).limit(1).maybeSingle();
    const chantierId = (ch as { id: string } | null)?.id ?? uuid();
    if (!ch) must(await ctx.a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: releveId, nom: `Perf ${lignes}` }));
    must(await ctx.a.from("tools_releves_batiments").insert({ id: batimentId, releve_id: releveId, chantier_id: chantierId, nom: "Bâtiment" }));
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: releveId, batiment_id: batimentId, nom: "Étage", niveau: 0, type_niveau: "rdc", ordre: 0 }));
    const pieces = Array.from({ length: nbPieces }, (_, i) => ({ id: uuid(), releve_id: releveId, etage_id: etageId, nom: `P${i + 1}`, usage: "bureau", ordre: i, hauteur_sous_plafond_mm: 2500 }));
    must(await ctx.a.from("tools_releves_pieces").insert(pieces));
    const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
    const planId = (plan as { id: string }).id;
    must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: await revision(planId), p_modifications: {
      contours: pieces.map((pc, i) => ({ pieceId: pc.id, points: rect(i * 3000, 0, i * 3000 + 2800, 2800), murIds: [], graine: { x: i * 3000 + 1400, y: 1400 } })) } }));
    const lot = Array.from({ length: nbOuvrages }, (_, i) => ({ id: uuid(), donnees: ouvrage({ nom: `Ouvrage ${i}`, code: `P11-${lignes}-${i}-${suffix}`, lot: `Lot ${i % 8}`, pertePourcent: 5 }) }));
    for (let i = 0; i < lot.length; i += 2000) must(await ctx.a.rpc("tools_releve_ouvrages_importer", { p_plan_id: planId, p_ouvrages: lot.slice(i, i + 2000) }));
    must(await ctx.a.rpc("tools_releve_estimation_prix_importer", { p_plan_id: planId, p_prix: lot.map((o, i) => ({ ouvrageId: o.id, donnees: { composantes: [{ type: "materiau", prixUnitaire: 2 + (i % 9) }, { type: "main_d_oeuvre", heuresParUnite: 0.2, tauxHoraire: 42 }] } })) }));

    await signInTools(page);
    await page.goto(estUrl(releveId));
    await expect(page.getByTestId("est-total")).toBeVisible({ timeout: 120_000 });
    let t = Date.now();
    await page.getByTestId("est-envoyer-gp").click();
    await expect(page.getByTestId("gp-resume-lignes")).toHaveText(`${lignes} · 0 sans prix`, { timeout: 120_000 });
    const preparationMs = Date.now() - t;
    t = Date.now();
    await page.getByTestId("gp-envoi-confirmer").click();
    await expect(page.getByTestId("gp-envoi-message")).toHaveAttribute("data-statut", "importe", { timeout: 120_000 });
    const envoiMs = Date.now() - t;
    const envoiServeurMs = Number(await page.getByTestId("gp-envoi").getAttribute("data-duree-ms"));
    t = Date.now();
    await envoyer(page);
    await expect(page.getByTestId("gp-envoi-message")).toHaveAttribute("data-statut", "deja_importe", { timeout: 120_000 });
    const reimportMs = Date.now() - t;
    // Nouvelle version (un prix modifié) pour la comparaison.
    must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: planId, p_ouvrage_id: lot[0].id, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 99 }] } }));
    await page.goto(estUrl(releveId));
    await expect(page.getByTestId("est-total")).toBeVisible({ timeout: 120_000 });
    t = Date.now();
    await envoyer(page);
    await expect(page.getByTestId("gp-envoi-message")).toHaveAttribute("data-statut", "nouvelle_version", { timeout: 120_000 });
    const nouvelleVersionMs = Date.now() - t;
    const rows = await imports(releveId);
    expect(rows.map((r) => [r.source_version, r.nb_lignes])).toEqual([[1, lignes], [2, lignes]]);

    await signInGp(page);
    t = Date.now();
    await page.goto(`${GP}/devis/imports-tools`);
    await expect(page.locator(`[data-testid="import-tools"][data-releve="${releveId}"]`)).toBeVisible({ timeout: 120_000 });
    const listeGpMs = Date.now() - t;
    t = Date.now();
    await page.goto(`${GP}/devis/imports-tools/${rows[1].id}`);
    await expect(page.getByTestId("import-lignes")).toContainText(`${lignes} ·`, { timeout: 120_000 });
    const detailGpMs = Date.now() - t;
    if (nbOuvrages > 100) await expect(page.getByTestId("import-ouvrages-pages")).toContainText(`${nbOuvrages} ouvrages · page 1/${Math.ceil(nbOuvrages / 100)}`);
    t = Date.now();
    await page.goto(`${GP}/devis/imports-tools/${rows[1].id}?comparer=${rows[0].id}`);
    await expect(page.getByTestId("import-comparaison-resume")).toContainText("Version 1 → 2 : 5 modifiée(s)", { timeout: 120_000 });
    const comparaisonMs = Date.now() - t;
    t = Date.now();
    await page.getByTestId("import-creer-devis").click();
    await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}\?success=/, { timeout: 120_000 });
    const devisMs = Date.now() - t;
    perf[`lignes_${lignes}`] = { lignes, ouvrages: nbOuvrages, preparationMs, envoiMs, envoiServeurMs, reimportMs, nouvelleVersionMs, listeGpMs, detailGpMs, comparaisonMs, devisMs };
    expect(envoiMs).toBeLessThan(60_000);
  });
}
