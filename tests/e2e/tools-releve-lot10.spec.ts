import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 10 : estimation simplifiée HT, sur pile RÉELLE (GoTrue + PostgREST +
 * PostgreSQL avec la vraie RLS), Tools en `next dev`.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot10.spec.ts --project=desktop-chromium
 *
 * Les montants affichés sont ceux du SERVEUR (moteur déterministe). Valeurs attendues calculées à la main (voir le
 * rapport Lot 10). Tablette : Chromium en émulation (MOBILE EMULATED ONLY). Mesures : RELEVE_E2E_PERF_OUT.
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const SUPABASE_URL = process.env.RELEVE_E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.RELEVE_E2E_ANON_KEY ?? "";
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";
const CHROME = process.env.PW_CHROME_PATH;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1366, height: 1024 }, contextOptions: { reducedMotion: "reduce" }, acceptDownloads: true });
test.skip(!BASE || !SUPABASE_URL || !ANON_KEY || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");
test.setTimeout(300_000);

const suffix = Date.now().toString(36);
const dir = join(tmpdir(), `releve-lot10-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const perf: Record<string, unknown> = {};

type Pt = { x: number; y: number };
type Wall = { id: string; pieceId: null; donnees: { a: Pt; b: Pt; epaisseurMm: number; hauteurMm: number | null; typeMur: string; etatProjet?: string } };
type Ctx = { a: SupabaseClient; b: SupabaseClient; releveId: string; batimentId: string; e1: string; sejour: string; chambre: string };
let ctx: Ctx;
const walls: Record<string, string> = {};
const plans: Record<string, string> = {};
const ouv: Record<string, string> = {};

const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };
const wall = (id: string, ax: number, ay: number, bx: number, by: number, epaisseurMm = 200, typeMur = "porteur"): Wall =>
  ({ id, pieceId: null, donnees: { a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm, hauteurMm: 2500, typeMur } });
const opening = (id: string, murId: string, typeOuverture: string, decalageMm: number, largeurMm: number, hauteurMm: number, allegeMm: number | null) =>
  ({ id, murId, donnees: { decalageMm, largeurMm, hauteurMm, allegeMm, typeOuverture, sens: "gauche" } });
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const ouvrage = (extra: Record<string, unknown>) => ({
  nom: "Ouvrage", categorie: "peinture", unite: "m2", regle: { source: "surface_sol" }, pertePourcent: 0, arrondi: { mode: "aucun" },
  etatTravaux: "nouveau", etats: ["existant", "nouveau"], ...extra,
});
/** « 1 234,56 € » à partir de centimes exacts (même format que l'écran). */
const eur = (cents: number) => `${cents < 0 ? "-" : ""}${Math.trunc(Math.abs(cents) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${String(Math.abs(cents) % 100).padStart(2, "0")} €`;
const c = (value: number | string | null) => (value === null ? null : Math.round(Number(value) * 100));

async function client(email: string): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return supabase;
}
async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}
type Ligne = { ouvrageId: string; pieceId: string | null; etatProjet: string; nature: string; quantite: number | null; montantCalcule: number | null; montantRetenu: number | null; ajustement: { id: string; perime: boolean } | null };
type Estimation = { source: string; fige: boolean; lignes: Ligne[]; prix: { ouvrageId: string; origine: string }[]; anomalies: { code: string; ouvrageId: string }[];
  totaux: { montant: number; parEtat: Record<string, number>; heures: number; lignesSansPrix: number } };
async function estimation(planId: string, as: SupabaseClient = ctx.a): Promise<Estimation> {
  const { data } = must(await as.rpc("tools_releve_plan_estimation", { p_plan_id: planId }));
  return (data as { estimation: Estimation }).estimation;
}
async function revision(planId: string) {
  const { data } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  return (data as { revision: number }).revision;
}
async function seedPlan(etageId: string, mods: Record<string, unknown>, etat = "initial") {
  const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: etat }));
  const planId = (plan as { id: string }).id;
  if (Object.keys(mods).length) must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: await revision(planId), p_modifications: mods }));
  return planId;
}
const estUrl = (extra = "") => `${BASE}/releves/estimation?id=${ctx.releveId}${extra}`;
const message = (page: Page) => page.getByTestId("est-message");
const planSection = (page: Page, planId: string) => page.locator(`[data-testid="est-plan"][data-plan="${planId}"]`);
const carte = (page: Page, planId: string, nom: string) => planSection(page, planId).getByTestId("est-ouvrage").filter({ has: page.getByTestId("est-ouvrage-nom").filter({ hasText: new RegExp(`^${nom.replace(/[()]/g, "\\$&")}$`) }) });
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function ouvrir(page: Page, planId: string, nom: string) {
  const details = carte(page, planId, nom).first();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator("summary").click();
  await expect(details.getByTestId("est-prix-texte")).toBeVisible();
  return details;
}
const ligne = (details: ReturnType<typeof carte>, piece: string, etat: string, nature = "quantite") =>
  details.locator(`[data-testid="est-ligne"][data-piece="${piece}"][data-etat="${etat}"][data-nature="${nature}"]`);

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const keys = { releveId: uuid(), batimentId: uuid(), e1: uuid(), sejour: uuid(), chambre: uuid() };
  must(await a.from("tools_releves").insert({ id: keys.releveId, entreprise_id: tenantA, nom: `Relevé Lot 10 ${suffix}`, chantier_nom: "Maison Lot 10" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", keys.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: keys.releveId, nom: "Maison Lot 10" }));
  must(await a.from("tools_releves_batiments").insert({ id: keys.batimentId, releve_id: keys.releveId, chantier_id: chantierId, nom: "Maison" }));
  must(await a.from("tools_releves_etages").insert({ id: keys.e1, releve_id: keys.releveId, batiment_id: keys.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0 }));
  // Séjour : hauteur 2,50 m ; Chambre : SANS hauteur (murs nets non calculables, jamais inventés).
  must(await a.from("tools_releves_pieces").insert([
    { id: keys.sejour, releve_id: keys.releveId, etage_id: keys.e1, nom: "Séjour", usage: "sejour", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: keys.chambre, releve_id: keys.releveId, etage_id: keys.e1, nom: "Chambre", usage: "chambre", ordre: 1 },
  ]));
  ctx = { a, b, ...keys };
  // Maison 6 × 4 m à l'axe (murs de 20 cm, h 2,50), cloison x = 3 000 (10 cm) ; porte sud (Séjour), porte de cloison, fenêtre nord (Chambre).
  for (const key of ["s", "e", "n", "w", "c"]) walls[key] = uuid();
  plans.e1 = await seedPlan(keys.e1, {
    murs: [
      wall(walls.s, 0, 0, 6000, 0, 200, "exterieur"), wall(walls.e, 6000, 0, 6000, 4000, 200, "exterieur"),
      wall(walls.n, 6000, 4000, 0, 4000, 200, "exterieur"), wall(walls.w, 0, 4000, 0, 0, 200, "exterieur"),
      wall(walls.c, 3000, 0, 3000, 4000, 100, "cloison"),
    ],
    ouvertures: [opening(uuid(), walls.s, "porte", 1000, 900, 2150, 0), opening(uuid(), walls.c, "porte", 1500, 800, 2040, 0), opening(uuid(), walls.n, "fenetre", 1000, 1200, 1250, 900)],
    contours: [
      { pieceId: keys.sejour, points: rect(100, 100, 2950, 3900), murIds: [walls.s, walls.c, walls.n, walls.w], graine: { x: 1500, y: 2000 } },
      { pieceId: keys.chambre, points: rect(3050, 100, 5900, 3900), murIds: [walls.s, walls.e, walls.n, walls.c], graine: { x: 4500, y: 2000 } },
    ],
  });
  // Ouvrages du Lot 9 (catalogue) : quantités déjà calculées par le serveur, pertes comprises.
  for (const key of ["pei", "str", "por", "pli"]) ouv[key] = uuid();
  must(await a.rpc("tools_releve_ouvrages_importer", { p_plan_id: plans.e1, p_ouvrages: [
    { id: ouv.pei, donnees: ouvrage({ nom: "Peinture murs", code: "PEI-MUR", regle: { source: "surface_murs" }, pertePourcent: 5 }) },
    { id: ouv.str, donnees: ouvrage({ nom: "Sol stratifié", code: "SOL-STR", categorie: "sols", pertePourcent: 7, arrondi: { mode: "superieur", pas: 0.01 } }) },
    { id: ouv.por, donnees: ouvrage({ nom: "Portes", code: "POR-U", categorie: "portes", unite: "u", regle: { source: "nombre_ouvertures", filtre: { typesOuverture: ["porte"] } } }) },
    { id: ouv.pli, donnees: ouvrage({ nom: "Plinthes", code: "PLI-ML", categorie: "plinthes", unite: "ml", regle: { source: "perimetre_utile" }, pertePourcent: 5 }) },
  ] }));
});

test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// ─────────────────────────────────────────────────────────────────────────────
test("Prix structuré saisi à l'écran → montants du serveur ; perte non réappliquée ; sans prix exploitable en quantitatif", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/fiche?id=${ctx.releveId}`);
  await page.getByTestId("lien-estimation").click();
  await expect(page.getByRole("heading", { name: `Estimation · Relevé Lot 10 ${suffix}` })).toBeVisible();
  await expect(page.getByTestId("est-avertissement")).toContainText("Ce n'est ni un devis ni une facture");
  const section = planSection(page, plans.e1);
  await expect(section.getByTestId("est-plan-badge")).toHaveText("Plan 1 · Initiale · calculée");
  await expect(page.getByTestId("est-total")).toHaveText("0,00 €");
  await expect(carte(page, plans.e1, "Peinture murs").getByTestId("est-ouvrage-total")).toHaveText("sans prix");
  await expect(carte(page, plans.e1, "Peinture murs").getByTestId("est-sans-prix")).toHaveText("quantitatif seul");
  const pei = await ouvrir(page, plans.e1, "Peinture murs");
  await pei.getByTestId("est-prix-modifier").click();
  const form = pei.getByTestId("est-prix-form");
  await form.getByTestId("est-f-a").first().fill("3,5");
  await form.getByTestId("est-f-libelle").first().fill("Peinture velours");
  await form.getByTestId("est-f-ajouter").click();
  await form.getByTestId("est-f-a").last().fill("0,25");
  await form.getByTestId("est-f-b").last().fill("45");
  await expect(form.getByTestId("est-f-apercu")).toHaveText("PU estimatif : 14,75 € / m² HT");
  // Taux trop précis : refusé avant envoi (même message que le serveur).
  await form.getByTestId("est-f-b").last().fill("45,123");
  await expect(form.getByTestId("est-f-apercu")).toHaveText("Taux horaire : entre 0 et 10 000 € HT, deux décimales au plus.");
  await expect(form.getByTestId("est-f-enregistrer")).toBeDisabled();
  await form.getByTestId("est-f-b").last().fill("45");
  await form.getByTestId("est-f-enregistrer").click();
  await expect(message(page)).toHaveText("Prix de « Peinture murs » enregistré : montants recalculés par le serveur.");
  // Séjour : 31,167 m² (29,683 nets + 5 % : perte du Lot 9, NON réappliquée) × 3,50 = 109,08 ; × 0,25 h × 45 € = 350,63 → 459,71 €.
  const peiOuvert = await ouvrir(page, plans.e1, "Peinture murs");
  await expect(ligne(peiOuvert, ctx.sejour, "nouveau").getByTestId("est-ligne-montant")).toHaveText("459,71 €");
  await expect(ligne(peiOuvert, ctx.sejour, "nouveau")).toContainText("31,167 m² × 14,75 € · 7,792 h");
  await expect(ligne(peiOuvert, ctx.chambre, "nouveau").getByTestId("est-ligne-montant")).toHaveText("—");
  await expect(peiOuvert.getByTestId("est-prix-texte")).toHaveText("Matériau 3,50 €/m² (Peinture velours) + Main d'œuvre 0,25 h/m² × 45,00 €/h (HT)");
  await expect(page.getByTestId("est-anomalies").locator('[data-code="quantite_non_calculable"]')).toContainText("Quantité non calculable");
  // Saisie rapide d'un PU global (données structurées : une composante typée).
  const str = await ouvrir(page, plans.e1, "Sol stratifié");
  await str.getByTestId("est-prix-modifier").click();
  await str.getByTestId("est-f-a").fill("20");
  await str.getByTestId("est-f-enregistrer").click();
  await expect(message(page)).toHaveText("Prix de « Sol stratifié » enregistré : montants recalculés par le serveur.");
  // Stratifié : 11,59 m² (10,83 + 7 % → arrondi 0,01 : Lot 9) × 20 € = 231,80 € par pièce.
  await expect(carte(page, plans.e1, "Sol stratifié").getByTestId("est-ouvrage-total")).toHaveText("463,60 €");
  await expect(page.getByTestId("est-total")).toHaveText("923,31 €");
  // Parité écran ↔ serveur.
  const e = await estimation(plans.e1);
  expect(e.totaux.montant).toBe(923.31);
  expect(e.lignes.find((l) => l.ouvrageId === ouv.pei && l.pieceId === ctx.sejour)).toMatchObject({ quantite: 31.167, montantCalcule: 459.71 });
  expect(e.lignes.filter((l) => l.ouvrageId === ouv.por).every((l) => l.montantRetenu === null)).toBe(true);
  expect(e.anomalies.filter((a) => a.code === "prix_absent").map((a) => a.ouvrageId).sort()).toEqual([ouv.por, ouv.pli].sort());
  // Le serveur refuse ce que Tools ne gère pas : TVA, marge, remise, prix de vente, perte dans un prix.
  for (const donnees of [{ composantes: [{ type: "materiau", prixUnitaire: 1 }], tva: 20 }, { composantes: [{ type: "materiau", prixUnitaire: 1 }], marge: 10 },
    { composantes: [{ type: "materiau", prixUnitaire: 1, prixVente: 2 }] }, { composantes: [{ type: "materiau", prixUnitaire: 1 }], pertePourcent: 5 }]) {
    const refus = await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.e1, p_ouvrage_id: ouv.pli, p_donnees: donnees });
    expect(refus.error?.code).toBe("22023");
    expect(refus.error?.message).toContain("l'estimation Tools est simplifiée et HT");
  }
});

test("Sous-totaux par lot, total chantier, types, heures ; exports CSV, JSON (contrat GP) et impression", async ({ page }) => {
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.e1, p_ouvrage_id: ouv.pli, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 8.9 }] } }));
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.e1, p_ouvrage_id: ouv.por, p_donnees: { composantes: [{ type: "autre", prixUnitaire: 250 }, { type: "forfait", montant: 80, libelle: "Évacuation" }] } }));
  const e = await estimation(plans.e1);
  await signIn(page, EMAIL_A);
  await page.goto(estUrl());
  await expect(page.getByTestId("est-total")).toHaveText(eur(c(e.totaux.montant)!));
  // Portes existantes : 1 (Séjour) + 1 (cloison, étage) = 500 € + forfait 80 € (état de travaux « nouveau ») ; travaux sur existant = portes.
  await expect(page.getByTestId("est-existant")).toHaveText("500,00 €");
  const groupes = page.getByTestId("est-groupe");
  await expect(groupes.filter({ hasText: "Menuiseries intérieures" }).getByTestId("est-groupe-total")).toHaveText("580,00 €");
  await expect(groupes.filter({ hasText: "Revêtements de sols" }).getByTestId("est-groupe-total"))
    .toHaveText(eur(e.lignes.filter((l) => l.ouvrageId === ouv.str || l.ouvrageId === ouv.pli).reduce((s, l) => s + (c(l.montantRetenu) ?? 0), 0)));
  const lotTotals = await groupes.getByTestId("est-groupe-total").allTextContents();
  const somme = lotTotals.reduce((s, t) => s + Number(t.replace(/[ €]/g, "").replace(",", ".")) * 100, 0);
  expect(Math.round(somme)).toBe(c(e.totaux.montant));
  await expect(page.getByTestId("est-total-chantier")).toContainText(eur(c(e.totaux.montant)!));
  await expect(page.getByTestId("est-type-forfait")).toHaveText("Forfait 80,00 €");
  await expect(page.getByTestId("est-heures")).toHaveText("7,792 h");
  // Autres niveaux : pièce (éléments d'étage séparés), ouvrage.
  await page.getByTestId("est-niveau").selectOption("piece");
  await expect(groupes.filter({ hasText: "Séjour" }).first()).toBeVisible();
  await expect(page).toHaveURL(/niveau=piece/);
  await page.getByTestId("est-niveau").selectOption("lot");
  // CSV : une ligne par (ouvrage, pièce, état, nature) + ligne de total, montants exacts.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("est-export-csv").click()]);
  const csv = readFileSync((await download.path())!, "utf8");
  const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
  expect(rows[0]).toContain("Quantité retenue;PU HT;Matériau HT;Main d'œuvre HT;Forfait HT;Autre HT;Heures;Montant automatique HT;Montant retenu HT");
  expect(rows).toHaveLength(e.lignes.length + 2);
  expect(rows.some((r) => r.includes(";Séjour;Peinture;Peinture;PEI-MUR;Peinture murs;Quantité;Nouveau;m²;31,167;14,75;109,08;350,63;0,00;0,00;7,792;459,71;459,71;non;;"))).toBe(true);
  expect(rows.at(-1)).toContain(`;${eur(c(e.totaux.montant)!).replace(/ €$/, "").replace(/ /g, "")};`);
  // JSON : contrat Gestion Pro de l'estimation (préparé, non transmis ; aucun devis).
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("est-export-json").click()]);
  const gp = JSON.parse(readFileSync((await json.path())!, "utf8"));
  expect(gp.contract).toEqual({ name: "elsatia.tools.estimation", version: "1.1.0" });
  expect(gp.readiness).toEqual({ status: "contract-only", devis: "not-generated", documentsCommerciaux: "none" });
  expect(gp.montants).toEqual({ devise: "EUR", base: "HT", nature: "estimative" });
  expect(gp.perimetre.decideParGestionPro).toEqual(["prix_de_vente", "marge", "remise", "tva", "devis_final"]);
  expect(gp.quantitatif.contract).toEqual({ name: "elsatia.tools.quantitatif", version: "1.0.0" });
  expect(JSON.stringify(gp.quantitatif)).not.toMatch(/"[^"]*(prix|price|tarif|montant)[^"]*"\s*:/i);
  expect(JSON.stringify(gp)).not.toMatch(/"[^"]*(numeroDevis|facture|commande|signature|marge|remise|tva|ttc|prixVente)[^"]*"\s*:/i);
  expect(gp.totaux.total).toBe(Number(e.totaux.montant).toFixed(2));
  expect(gp.lignes).toHaveLength(e.lignes.length);
  expect(gp.pieces.map((p: { nom: string }) => p.nom).sort()).toEqual(["Chambre", "Séjour"]);
  expect(gp.revetements).toEqual([]);
  expect(Array.isArray(gp.photos) && Array.isArray(gp.annotations)).toBe(true);
  expect(gp.prix.find((p: { ouvrageRef: string }) => p.ouvrageRef === ouv.pei)).toMatchObject({ prixUnitaire: "14.75", composantes: [{ type: "materiau", prixUnitaire: "3.5", libelle: "Peinture velours" }, { type: "main_d_oeuvre", heuresParUnite: "0.25", tauxHoraire: "45" }] });
  // Impression / PDF navigateur : cartes dépliées, commandes masquées.
  await page.evaluate(() => { (window as unknown as { print: () => void }).print = () => { (window as unknown as { printed: boolean }).printed = true; }; });
  await page.getByTestId("est-imprimer").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: boolean }).printed === true)).toBe(true);
  expect(await page.locator("details[data-print]").evaluateAll((nodes) => nodes.every((n) => (n as HTMLDetailsElement).open))).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("est-export-csv")).toBeHidden();
  await expect(page.getByTestId("est-total")).toBeVisible();
  await page.pdf({ path: join(dir, "estimation.pdf") }).catch(() => undefined);
  await page.emulateMedia({ media: "screen" });
});

test("Corrections : montant automatique jamais écrasé, raison obligatoire, auteur / date, retrait tracé, obsolescence", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(estUrl());
  const avant = await estimation(plans.e1);
  const pli = await ouvrir(page, plans.e1, "Plinthes");
  const auto = avant.lignes.find((l) => l.ouvrageId === ouv.pli && l.pieceId === ctx.sejour)!;
  const row = ligne(pli, ctx.sejour, "nouveau");
  await row.getByTestId("est-corriger").click();
  await row.getByTestId("est-correction-valeur").fill("100");
  await row.getByTestId("est-correction-valider").click();
  await expect(row.getByRole("alert")).toHaveText("La raison de la correction est obligatoire.");
  await row.getByTestId("est-correction-raison").fill("Plinthes récupérées sur stock");
  await row.getByTestId("est-correction-valider").click();
  await expect(message(page)).toHaveText("Plinthes corrigé : le montant automatique reste affiché à côté.");
  const after = ligne(await ouvrir(page, plans.e1, "Plinthes"), ctx.sejour, "nouveau");
  await expect(after.getByTestId("est-ligne-montant")).toHaveText(`100,00 € · automatique ${eur(c(auto.montantCalcule)!)}`);
  await expect(after.getByTestId("est-correction")).toContainText(`Retenu 100,00 € au lieu de ${eur(c(auto.montantCalcule)!)} — « Plinthes récupérées sur stock »`);
  await expect(page.getByTestId("est-compteurs")).toContainText("1 corrigée(s)");
  await expect(page.getByTestId("est-ecart")).toHaveText(`Corrections ${eur(10000 - c(auto.montantCalcule)!)}`);
  const { data: aj } = must(await ctx.a.from("tools_releves_estimation_ajustements").select("valeur_calculee, valeur_retenue, raison, created_by, created_at").eq("plan_id", plans.e1).is("retire_le", null).single());
  const { data: user } = await ctx.a.auth.getUser();
  expect(aj).toMatchObject({ valeur_calculee: auto.montantCalcule, valeur_retenue: 100, raison: "Plinthes récupérées sur stock", created_by: user.user!.id });
  // Le prix change : correction OBSOLÈTE, jamais remplacée en silence.
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.e1, p_ouvrage_id: ouv.pli, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 9.5 }] } }));
  await page.reload();
  const perime = ligne(await ouvrir(page, plans.e1, "Plinthes"), ctx.sejour, "nouveau");
  await expect(perime.getByTestId("est-ligne-montant")).toContainText("(à revoir : a changé depuis la correction)");
  await expect(perime.getByTestId("est-ligne-automatique")).toHaveAttribute("data-perime", "montant");
  await expect(page.getByTestId("est-anomalies").locator('[data-code="estimation_obsolete"]')).toHaveCount(1);
  // Retour au montant automatique : retrait tracé.
  await perime.getByTestId("est-retirer-correction").click();
  await expect(message(page)).toHaveText("Correction retirée : retour au montant automatique.");
  const { data: historique } = must(await ctx.a.rpc("tools_releve_estimation_corrections", { p_plan_id: plans.e1 }));
  expect((historique as { retireLe: string | null; raisonRetrait: string | null }[]).map((h) => h.raisonRetrait)).toEqual(["Retour au montant automatique"]);
  const direct = await ctx.a.from("tools_releves_estimation_ajustements").update({ valeur_retenue: 1 }).eq("plan_id", plans.e1).select();
  expect(direct.data ?? []).toHaveLength(0);
});

test("Bibliothèque : prix facultatif saisi à l'écran, repris par code sur les ouvrages sans prix", async ({ page }) => {
  const plafond = uuid(); const code = `PLA-${suffix}`.toUpperCase();
  must(await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: plans.e1, p_id: plafond, p_donnees: ouvrage({ nom: "Faux plafond", code, categorie: "plafonds", regle: { source: "surface_plafond" }, pertePourcent: 5 }) }));
  must(await ctx.a.rpc("tools_releve_bibliotheque_enregistrer", { p_releve_id: ctx.releveId, p_id: uuid(), p_donnees: ouvrage({ nom: `Faux plafond (biblio ${suffix})`, code, categorie: "plafonds", regle: { source: "surface_plafond" }, pertePourcent: 5 }) }));
  await signIn(page, EMAIL_A);
  await page.goto(estUrl());
  const biblio = page.getByTestId("est-bibliotheque");
  await biblio.locator("summary").click();
  const entree = biblio.getByTestId("est-bibliotheque-entree").filter({ hasText: code });
  await expect(entree.getByTestId("est-bibliotheque-prix")).toHaveText(" · sans prix");
  await entree.getByTestId("est-bibliotheque-modifier").click();
  await entree.getByTestId("est-f-type").selectOption("main_d_oeuvre");
  await entree.getByTestId("est-f-a").fill("0,6");
  await entree.getByTestId("est-f-b").fill("40");
  await entree.getByTestId("est-f-enregistrer").click();
  await expect(message(page)).toHaveText(`Prix de « Faux plafond (biblio ${suffix}) » enregistré dans la bibliothèque.`);
  await expect(entree.getByTestId("est-bibliotheque-prix")).toHaveText(" · Main d'œuvre 0,6 h/m² × 40,00 €/h (HT)");
  await planSection(page, plans.e1).getByTestId("est-appliquer-bibliotheque").click();
  await expect(message(page)).toHaveText("1 prix repris de la bibliothèque (ouvrages sans prix seulement).");
  // Faux plafond : 10,83 m² × 1,05 = 11,372 m² par pièce × 0,6 h × 40 € = 272,93 € par pièce.
  await expect(carte(page, plans.e1, "Faux plafond").getByTestId("est-ouvrage-total")).toHaveText("545,86 €");
  const { data: prix } = must(await ctx.a.from("tools_releves_estimation_prix").select("origine").eq("ouvrage_id", plafond).single());
  expect(prix).toEqual({ origine: "bibliotheque" });
});

test("Existant / dépose / neuf / déplacement, versioning (estimation figée, plan dérivé) et comparaison solution A / B", async ({ page }) => {
  // Gel du plan existant : estimation figée.
  must(await ctx.a.rpc("tools_releve_plan_figer", { p_plan_id: plans.e1, p_revision: await revision(plans.e1), p_libelle: "Existant Lot 10" }));
  const fige = await estimation(plans.e1);
  expect(fige).toMatchObject({ source: "gel", fige: true });
  const refus = await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.e1, p_ouvrage_id: ouv.pei, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 1 }] } });
  expect(refus.error?.code).toBe("42501");
  must(await ctx.a.from("tools_releves_pieces").update({ hauteur_sous_plafond_mm: 2500 }).eq("id", ctx.chambre));
  expect((await estimation(plans.e1)).totaux).toEqual(fige.totaux);
  // Projeté A (dérivé) : prix copiés ; un mur à déposer, une cloison neuve, un radiateur déplacé.
  plans.a = await seedPlan(ctx.e1, {}, "projete");
  const a0 = await estimation(plans.a);
  expect(a0.prix.length).toBeGreaterThanOrEqual(5);
  expect(new Set(a0.prix.map((p) => p.origine))).toEqual(new Set(["copie"]));
  const { data: murA } = must(await ctx.a.from("tools_releves_elements").select("id, piece_id, donnees").eq("plan_id", plans.a).eq("type", "mur").eq("donnees->>origineId", walls.c).single());
  const mur = murA as { id: string; piece_id: string | null; donnees: Record<string, unknown> };
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.a, p_revision: await revision(plans.a), p_modifications: { murs: [
    { id: mur.id, pieceId: mur.piece_id, donnees: { ...mur.donnees, etatProjet: "a_deposer" } },
    { ...wall(uuid(), 1500, 100, 1500, 3900, 100, "cloison"), donnees: { ...wall("x", 1500, 100, 1500, 3900, 100, "cloison").donnees, etatProjet: "nouveau" } },
  ] } }));
  const dem = uuid(); const clo = uuid(); const rad = uuid();
  must(await ctx.a.rpc("tools_releve_ouvrages_importer", { p_plan_id: plans.a, p_ouvrages: [
    { id: dem, donnees: ouvrage({ nom: "Démolition cloison", categorie: "demolition", regle: { source: "surface_murs_plan" }, etatTravaux: "a_deposer", etats: ["a_deposer"] }) },
    { id: clo, donnees: ouvrage({ nom: "Cloison neuve", categorie: "cloisons", regle: { source: "surface_murs_plan" }, etats: ["nouveau"] }) },
    { id: rad, donnees: ouvrage({ nom: "Déplacement radiateur", categorie: "cvc", unite: "u", regle: { source: "saisie", valeur: 1 }, etatTravaux: "deplace", etats: ["deplace"] }) },
  ] }));
  must(await ctx.a.rpc("tools_releve_estimation_prix_importer", { p_plan_id: plans.a, p_prix: [
    { ouvrageId: dem, donnees: { composantes: [{ type: "main_d_oeuvre", heuresParUnite: 0.5, tauxHoraire: 40 }] } },
    { ouvrageId: clo, donnees: { composantes: [{ type: "materiau", prixUnitaire: 18 }, { type: "main_d_oeuvre", heuresParUnite: 0.6, tauxHoraire: 45 }] } },
    { ouvrageId: rad, donnees: { composantes: [{ type: "main_d_oeuvre", heuresParUnite: 2, tauxHoraire: 50 }] } },
  ] }));
  const a1 = await estimation(plans.a);
  // Cloison 4,00 m × 2,50 = 10,00 m² à déposer × 20 € = 200,00 € ; cloison neuve 3,80 × 2,50 = 9,50 m² × 45 € = 427,50 € ; radiateur 100 €.
  expect(a1.lignes.filter((l) => l.ouvrageId === dem).map((l) => [l.etatProjet, l.quantite, l.montantRetenu])).toEqual([["a_deposer", 10, 200]]);
  expect(a1.lignes.filter((l) => l.ouvrageId === clo).map((l) => [l.etatProjet, l.quantite, l.montantRetenu])).toEqual([["nouveau", 9.5, 427.5]]);
  expect(a1.totaux.parEtat).toMatchObject({ a_deposer: 200, deplace: 100 });
  await signIn(page, EMAIL_A);
  await page.goto(estUrl("&etat=projete"));
  await expect(page.getByTestId("est-depose")).toHaveText("200,00 €");
  await expect(page.getByTestId("est-deplacement")).toHaveText("100,00 €");
  await expect(page.getByTestId("est-neuf")).toHaveText(eur(c(a1.totaux.parEtat.nouveau)!));
  await expect(page.getByTestId("est-total")).toHaveText(eur(c(a1.totaux.montant)!));
  // Plan figé : lecture seule, estimation figée.
  await page.getByTestId("est-etat-existant").click();
  await expect(planSection(page, plans.e1).getByTestId("est-plan-badge")).toHaveText("Plan 1 · Initiale · Existant Lot 10 · estimation figée");
  await expect(page.getByTestId("est-prix-modifier")).toHaveCount(0);
  await expect(page.getByTestId("est-appliquer-bibliotheque")).toHaveCount(0);
  await expect(page.getByTestId("est-total")).toHaveText(eur(c(fige.totaux.montant)!));
  // Solution A figée ; solution B dérivée de A, peinture plus chère : comparaison A / B.
  must(await ctx.a.rpc("tools_releve_plan_figer", { p_plan_id: plans.a, p_revision: await revision(plans.a), p_libelle: "Solution A" }));
  plans.b = await seedPlan(ctx.e1, {}, "projete");
  const peiB = (await ctx.a.from("tools_releves_ouvrages").select("id").eq("plan_id", plans.b).eq("donnees->>code", "PEI-MUR").single()).data as { id: string };
  must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.b, p_ouvrage_id: peiB.id, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 6 }, { type: "main_d_oeuvre", heuresParUnite: 0.3, tauxHoraire: 45 }] } }));
  const b1 = await estimation(plans.b);
  await page.goto(estUrl("&etat=projete"));
  const cmp = page.getByTestId("est-comparaison");
  await cmp.locator("summary").click();
  await expect(cmp.getByTestId("est-cmp-a").locator("option")).toHaveCount(3);
  await cmp.getByTestId("est-cmp-a").selectOption(plans.a);
  await cmp.getByTestId("est-cmp-b").selectOption(plans.b);
  await cmp.getByTestId("est-cmp-lancer").click();
  const ecart = c(b1.totaux.montant)! - c(a1.totaux.montant)!;
  await expect(cmp.getByTestId("est-cmp-total")).toContainText(`A ${eur(c(a1.totaux.montant)!)} · B ${eur(c(b1.totaux.montant)!)} · écart ${ecart > 0 ? "+" : ""}${eur(ecart)}`);
  await expect(cmp.getByTestId("est-cmp-lot").filter({ hasText: "Peinture" }).getByTestId("est-cmp-lot-ecart")).toHaveText(`${ecart > 0 ? "+" : ""}${eur(ecart)}`);
  expect(ecart).toBeGreaterThan(0);
});

test("Sécurité : autre tenant (lecture, synthèse, prix, corrections, bibliothèque), écritures directes refusées, aucun devis", async ({ page, browser }) => {
  for (const [rpc, args] of [
    ["tools_releve_plan_estimation", { p_plan_id: plans.b }],
    ["tools_releve_estimation_synthese", { p_releve_id: ctx.releveId, p_etat: "projete" }],
    ["tools_releve_estimation_prix_enregistrer", { p_plan_id: plans.b, p_ouvrage_id: uuid(), p_donnees: { composantes: [{ type: "autre", prixUnitaire: 1 }] } }],
    ["tools_releve_estimation_ajuster", { p_plan_id: plans.b, p_ouvrage_id: uuid(), p_piece_id: null, p_etat: "nouveau", p_nature: "quantite", p_valeur_retenue: 1, p_raison: "Intrusion" }],
    ["tools_releve_bibliotheque_prix", { p_releve_id: ctx.releveId }],
    ["tools_releve_estimation_plans", { p_etage_id: ctx.e1 }],
  ] as const) {
    const { error } = await ctx.b.rpc(rpc, args);
    expect(error?.code, rpc).toBe("42501");
  }
  const { data: visibles } = await ctx.b.from("tools_releves_estimation_prix").select("id").eq("releve_id", ctx.releveId);
  expect(visibles ?? []).toHaveLength(0);
  const direct = await ctx.a.from("tools_releves_estimation_prix").insert({ releve_id: ctx.releveId, plan_id: plans.b, ouvrage_id: uuid(), donnees: { composantes: [{ type: "autre", prixUnitaire: 1 }] } });
  expect(direct.error).not.toBeNull();
  await signIn(page, EMAIL_A);
  await page.goto(estUrl("&etat=projete"));
  await expect(page.getByTestId("est-vue")).toBeVisible();
  const texte = await page.locator("main").innerText();
  expect(texte).not.toMatch(/devis n°|facture n°|bon de commande|TTC|signature|accepté|refusé/i);
  const autre = await browser.newContext();
  const pageB = await autre.newPage();
  await signIn(pageB, EMAIL_B);
  await pageB.goto(estUrl());
  await expect(pageB.getByRole("alert").or(pageB.getByRole("status")).first()).toBeVisible();
  await expect(pageB.getByTestId("est-vue")).toHaveCount(0);
  await autre.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tablette — Chromium en émulation tactile (MOBILE EMULATED ONLY)
// ─────────────────────────────────────────────────────────────────────────────
const TABLET: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };

test("Tablette 820×1180 : estimation lisible (cartes, aucun tableau horizontal), prix et correction au doigt", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(TABLET);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(estUrl("&etat=projete"));
    await expect(page.getByTestId("est-total")).not.toHaveText("0,00 €");
    expect(await sansDebordement(page)).toBe(true);
    expect(await page.locator("table").count()).toBe(0);
    const str = carte(page, plans.b, "Sol stratifié");
    await str.locator("summary").tap();
    await expect(str.getByTestId("est-prix-texte")).toBeVisible();
    for (const target of [str.locator("summary"), page.getByTestId("est-export-csv"), page.getByTestId("est-niveau"), str.getByTestId("est-prix-modifier")]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    }
    await str.getByTestId("est-prix-modifier").tap();
    await str.getByTestId("est-f-a").fill("22,5");
    await str.getByTestId("est-f-enregistrer").tap();
    await expect(page.getByTestId("est-message")).toHaveText("Prix de « Sol stratifié » enregistré : montants recalculés par le serveur.");
    // 11,59 m² × 22,50 € = 260,78 € (Séjour).
    const row = ligne(carte(page, plans.b, "Sol stratifié"), ctx.sejour, "nouveau");
    await expect(row.getByTestId("est-ligne-montant")).toHaveText("260,78 €");
    expect(await sansDebordement(page)).toBe(true);
    await row.getByTestId("est-corriger").tap();
    await row.getByTestId("est-correction-valeur").fill("250");
    await row.getByTestId("est-correction-raison").fill("Lot de fin de série");
    await row.getByTestId("est-correction-valider").tap();
    await expect(page.getByTestId("est-message")).toHaveText("Sol stratifié corrigé : le montant automatique reste affiché à côté.");
    expect(await sansDebordement(page)).toBe(true);
    await page.getByTestId("est-niveau").selectOption("piece");
    await expect(page.getByTestId("est-groupe").first()).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: join(dir, "tablette-estimation.png"), fullPage: false });
    await context.close();
  } finally {
    await browser.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Performances : 100, 1 000, 5 000 lignes (ouvrages × 5 pièces), calcul, édition de prix, recalcul, affichage, export
// ─────────────────────────────────────────────────────────────────────────────
for (const lignes of [100, 1000, 5000] as const) {
  test(`Performance ${lignes} lignes : calcul, édition de prix, recalcul, affichage, sous-totaux, export`, async ({ page }) => {
    const nbPieces = 5; const nbOuvrages = lignes / nbPieces;
    const etageId = uuid();
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: `Perf ${lignes}`, niveau: 10 + String(lignes).length, type_niveau: "etage", ordre: 10 + String(lignes).length, hauteur_sous_plafond_mm: 2500 }));
    const step = 3000; const murs: Wall[] = []; const contours: unknown[] = [];
    const pieces = Array.from({ length: nbPieces }, (_, i) => ({ id: uuid(), releve_id: ctx.releveId, etage_id: etageId, nom: `P${lignes}-${i + 1}`, usage: "bureau", ordre: i }));
    const v = Array.from({ length: nbPieces + 1 }, () => uuid()); const hs = Array.from({ length: nbPieces }, () => uuid()); const hn = Array.from({ length: nbPieces }, () => uuid());
    for (let i = 0; i <= nbPieces; i++) murs.push(wall(v[i], i * step, 0, i * step, step));
    for (let i = 0; i < nbPieces; i++) { murs.push(wall(hs[i], i * step, 0, (i + 1) * step, 0)); murs.push(wall(hn[i], (i + 1) * step, step, i * step, step)); }
    for (let i = 0; i < nbPieces; i++) contours.push({ pieceId: pieces[i].id, points: rect(i * step + 100, 100, (i + 1) * step - 100, step - 100), murIds: [hs[i], v[i + 1], hn[i], v[i]], graine: { x: i * step + 1500, y: 1500 } });
    must(await ctx.a.from("tools_releves_pieces").insert(pieces));
    const planId = await seedPlan(etageId, { murs, contours });
    const lot = Array.from({ length: nbOuvrages }, (_, i) => ({ id: uuid(), donnees: ouvrage({ nom: `Ouvrage ${i}`, code: `PERF-${lignes}-${i}`, lot: `Lot ${i % 8}`, pertePourcent: 5 }) }));
    for (let i = 0; i < lot.length; i += 2000) must(await ctx.a.rpc("tools_releve_ouvrages_importer", { p_plan_id: planId, p_ouvrages: lot.slice(i, i + 2000) }));
    let t = Date.now();
    must(await ctx.a.rpc("tools_releve_estimation_prix_importer", { p_plan_id: planId, p_prix: lot.map((o, i) => ({ ouvrageId: o.id, donnees: { composantes: [{ type: "materiau", prixUnitaire: 2 + (i % 9) }, { type: "main_d_oeuvre", heuresParUnite: 0.2, tauxHoraire: 42 }] } })) }));
    const importPrixMs = Date.now() - t;
    t = Date.now();
    const first = await estimation(planId);
    const calculMs = Date.now() - t;
    expect(first.lignes).toHaveLength(lignes);
    t = Date.now();
    must(await ctx.a.rpc("tools_releve_estimation_prix_enregistrer", { p_plan_id: planId, p_ouvrage_id: lot[0].id, p_donnees: { composantes: [{ type: "materiau", prixUnitaire: 99 }] } }));
    const editionMs = Date.now() - t;
    t = Date.now();
    const second = await estimation(planId);
    const recalculMs = Date.now() - t;
    expect(second.totaux.montant).not.toBe(first.totaux.montant);
    await signIn(page, EMAIL_A);
    t = Date.now();
    await page.goto(estUrl());
    await expect(planSection(page, planId)).toBeVisible({ timeout: 90_000 });
    const renderMs = Date.now() - t;
    const serverMs = Number(await page.getByTestId("est-vue").getAttribute("data-calcul-ms"));
    // Édition d'un prix à l'écran → relecture du seul plan concerné.
    const carteO = carte(page, planId, "Ouvrage 1");
    await carteO.locator("summary").click();
    await carteO.getByTestId("est-prix-modifier").click();
    await carteO.getByTestId("est-f-a").first().fill("50");
    t = Date.now();
    await carteO.getByTestId("est-f-enregistrer").click();
    await expect(message(page)).toHaveText("Prix de « Ouvrage 1 » enregistré : montants recalculés par le serveur.", { timeout: 60_000 });
    const editionEcranMs = Date.now() - t;
    t = Date.now();
    await page.getByTestId("est-niveau").selectOption("piece");
    await expect(page.getByTestId("est-groupe").filter({ hasText: `P${lignes}-${nbPieces}` })).toBeVisible({ timeout: 60_000 });
    const sousTotauxMs = Date.now() - t;
    t = Date.now();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("est-export-csv").click()]);
    const csv = readFileSync((await download.path())!, "utf8");
    const exportCsvMs = Date.now() - t;
    expect(csv.split("\r\n").filter((l) => l.includes(`;Perf ${lignes};`)).length).toBe(lignes);
    t = Date.now();
    const [json] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), page.getByTestId("est-export-json").click()]);
    const gp = JSON.parse(readFileSync((await json.path())!, "utf8"));
    const exportJsonMs = Date.now() - t;
    expect(gp.lignes.length).toBeGreaterThanOrEqual(lignes);
    perf[`lignes_${lignes}`] = { ouvrages: nbOuvrages, pieces: nbPieces, lignes: first.lignes.length, importPrixMs, calculMs, editionMs, recalculMs, renderMs, serverMs, editionEcranMs, sousTotauxMs, exportCsvMs, exportJsonMs };
    expect(calculMs).toBeLessThan(15_000);
    expect(renderMs).toBeLessThan(90_000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Complément Lot 10 (migration 1402) : coefficients, hypothèses, travaux séparés, obsolescence sur quantité, GP 1.1.0.
// Dernier test du fichier : les coefficients du relevé changent les montants de tous ses plans non figés ; ils sont
// remis à zéro à la fin.
test("Coefficients général / par lot (priorité ouvrage > lot > général), hypothèses, travaux séparés, obsolescence sur quantité, contrat GP 1.1.0", async ({ page }) => {
  const e2 = uuid();
  must(await ctx.a.from("tools_releves_etages").insert({ id: e2, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: "R+1", niveau: 1, type_niveau: "etage", ordre: 1 }));
  const p2 = await seedPlan(e2, {});
  const k: Record<string, string> = { pei: uuid(), clo: uuid(), div: uuid(), dep: uuid(), eva: uuid() };
  const saisie = (valeur: number) => ({ source: "saisie", valeur });
  const etage = (extra: Record<string, unknown>) => ouvrage({ categorie: "autre", unite: "u", regle: saisie(1), etats: ["nouveau"], ...extra });
  must(await ctx.a.rpc("tools_releve_ouvrages_importer", { p_plan_id: p2, p_ouvrages: [
    { id: k.pei, donnees: etage({ nom: "Peinture N1", categorie: "peinture", unite: "m2", regle: saisie(20) }) },
    { id: k.clo, donnees: etage({ nom: "Cloison N1", categorie: "cloisons", unite: "m2", regle: saisie(10) }) },
    { id: k.div, donnees: etage({ nom: "Divers N1", regle: saisie(2) }) },
    { id: k.dep, donnees: etage({ nom: "Dépose N1", categorie: "depose", etatTravaux: "a_deposer", etats: ["a_deposer"], regle: saisie(4) }) },
    { id: k.eva, donnees: etage({ nom: "Évacuation N1", lot: "Lot A", regle: saisie(5) }) },
  ] }));
  must(await ctx.a.rpc("tools_releve_estimation_prix_importer", { p_plan_id: p2, p_prix: [
    { ouvrageId: k.pei, donnees: { composantes: [{ type: "materiau", prixUnitaire: 10 }] } },
    { ouvrageId: k.clo, donnees: { composantes: [{ type: "materiau", prixUnitaire: 20 }], coefficient: 1 } },
    { ouvrageId: k.div, donnees: { composantes: [{ type: "autre", prixUnitaire: 50 }] } },
    { ouvrageId: k.dep, donnees: { composantes: [{ type: "main_d_oeuvre", heuresParUnite: 0.5, tauxHoraire: 50 }] } },
  ] }));
  await signIn(page, EMAIL_A);
  await page.goto(estUrl());
  const p2s = planSection(page, p2);
  await expect(carte(page, p2, "Peinture N1").getByTestId("est-ouvrage-total")).toHaveText("200,00 €");
  // Saisie des coefficients et hypothèses au doigt (panneau en cartes).
  const panel = page.getByTestId("est-parametres");
  await panel.locator("summary").click();
  await expect(panel).toContainText("Priorité : coefficient de l'ouvrage, sinon coefficient de son lot, sinon coefficient général (jamais cumulés).");
  await panel.getByTestId("est-parametres-modifier").click();
  await panel.getByTestId("est-p-general").fill("1,1");
  await panel.locator('[data-testid="est-p-lot"][data-lot="Peinture"]').fill("1,2");
  await panel.locator('[data-testid="est-p-lot"][data-lot="Plâtrerie – cloisons"]').fill("1,5");
  await panel.getByTestId("est-p-hypotheses").fill("Site occupé, accès par escalier");
  await panel.getByTestId("est-p-lot").first().fill("0");
  await panel.getByTestId("est-p-enregistrer").click();
  await expect(panel.getByTestId("est-p-erreur")).toContainText("Coefficient de lot : entre 0,01 et 10");
  await panel.getByTestId("est-p-lot").first().fill("");
  await panel.locator('[data-testid="est-p-lot"][data-lot="Peinture"]').fill("1,2");
  const t0 = Date.now();
  await panel.getByTestId("est-p-enregistrer").click();
  await expect(message(page)).toHaveText("Coefficients et hypothèses enregistrés : estimation recalculée par le serveur (plans figés inchangés).");
  perf.coefficientsRecalcul = Date.now() - t0;
  await expect(panel.getByTestId("est-parametres-resume")).toHaveText("général × 1,1 · 2 lot(s) · hypothèses");
  await expect(panel.getByTestId("est-parametres-hypotheses")).toHaveText("Site occupé, accès par escalier");
  // Priorité : Peinture × 1,2 (lot) = 240 ; Cloison × 1 (ouvrage, prime sur le lot 1,5) = 200 ; Divers × 1,1 (général) = 110 ;
  // Dépose 4 u × 0,5 h × 50 € × 1,1 (général) = 110.
  await expect(carte(page, p2, "Peinture N1").getByTestId("est-ouvrage-total")).toHaveText("240,00 €");
  await expect(carte(page, p2, "Peinture N1").getByTestId("est-coefficient")).toHaveText("× 1,2 (lot)");
  await expect(carte(page, p2, "Cloison N1").getByTestId("est-ouvrage-total")).toHaveText("200,00 €");
  await expect(carte(page, p2, "Cloison N1").getByTestId("est-coefficient")).toHaveCount(0);
  await expect(carte(page, p2, "Divers N1").getByTestId("est-coefficient")).toHaveText("× 1,1 (général)");
  await expect(carte(page, p2, "Divers N1").getByTestId("est-ouvrage-total")).toHaveText("110,00 €");
  await expect(carte(page, p2, "Dépose N1").getByTestId("est-ouvrage-total")).toHaveText("110,00 €");
  await expect(p2s.getByTestId("est-plan-total")).toHaveText("660,00 €");
  const e = (await estimation(p2)) as unknown as { totaux: { montant: number }; prix: { ouvrageId: string; coefficientSource: string; coefficientApplique: number }[]; parametres: { revision: number } };
  expect(e.totaux.montant).toBe(660);
  expect(Object.fromEntries(e.prix.map((x) => [x.ouvrageId, `${x.coefficientSource}:${x.coefficientApplique}`]))).toEqual({ [k.pei]: "lot:1.2", [k.clo]: "ouvrage:1", [k.div]: "general:1.1", [k.dep]: "general:1.1" });
  // Formulaire de prix : coefficient vide = hérité.
  const pei = await ouvrir(page, p2, "Peinture N1");
  await pei.getByTestId("est-prix-modifier").click();
  await expect(pei.getByTestId("est-f-coefficient")).toHaveValue("");
  await expect(pei.getByTestId("est-f-apercu")).toHaveText("PU estimatif : 10,00 € / m² HT (avant coefficient de lot ou général)");
  await pei.getByRole("button", { name: "Annuler" }).click();
  // Estimation séparée des travaux : à déposer seulement (tous les plans du relevé), puis travaux (créer + déposer + déplacer).
  const { data: synthese } = must(await ctx.a.rpc("tools_releve_estimation_synthese", { p_releve_id: ctx.releveId, p_etat: "existant" }));
  const lignesRel = (synthese as { estimation: Estimation }[]).flatMap((s) => s.estimation.lignes);
  const somme = (etats: string[]) => lignesRel.filter((l) => etats.includes(l.etatProjet)).reduce((t, l) => t + (c(l.montantRetenu) ?? 0), 0);
  await page.getByTestId("est-filtre-travaux").selectOption("a_deposer");
  await expect(page.getByTestId("est-total-selection")).toHaveText(eur(somme(["a_deposer"])));
  await expect(page.getByTestId("est-total-chantier")).toContainText(`Total de la sélection HT (estimation)${eur(somme(["a_deposer"]))}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("est-export-csv").click()]);
  const rows = readFileSync((await dl.path())!, "utf8").replace(/^\uFEFF/, "").trim().split("\r\n");
  expect(rows.slice(1, -1).every((r) => r.split(";")[10] === "À déposer")).toBe(true);
  expect(rows.some((r) => r.includes(";Dépose N1;Quantité;À déposer;u;4,000;27,5;0,00;110,00;0,00;0,00;2,200;110,00;110,00;non;;;1,1;général;;"))).toBe(true);
  await page.getByTestId("est-filtre-travaux").selectOption("travaux");
  await expect(page.getByTestId("est-total-selection")).toHaveText(eur(somme(["nouveau", "a_deposer", "deplace"])));
  await page.getByTestId("est-filtre-travaux").selectOption("tout");
  await expect(page.getByTestId("est-total-selection")).toHaveCount(0);
  // Traçabilité : correction motivée sur un ouvrage SANS prix, puis la QUANTITÉ change → obsolète (motif quantité).
  const eva = await ouvrir(page, p2, "Évacuation N1");
  const row = eva.locator(`[data-testid="est-ligne"][data-piece="etage"][data-etat="nouveau"][data-nature="quantite"]`);
  await row.getByTestId("est-corriger").click();
  await row.getByTestId("est-correction-valeur").fill("40");
  await row.getByTestId("est-correction-raison").fill("Évacuation au forfait benne");
  await row.getByTestId("est-correction-valider").click();
  await expect(message(page)).toHaveText("Évacuation N1 corrigé : le montant automatique reste affiché à côté.");
  const { data: hist } = must(await ctx.a.rpc("tools_releve_estimation_corrections", { p_plan_id: p2 }));
  expect((hist as { valeurSource: Record<string, unknown> }[])[0].valeurSource).toMatchObject({ quantite: 5, unite: "u", montantCalcule: null });
  must(await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: p2, p_id: k.eva, p_bibliotheque_id: null, p_donnees: etage({ nom: "Évacuation N1", lot: "Lot A", regle: saisie(6) }) }));
  await page.reload();
  const stale = (await ouvrir(page, p2, "Évacuation N1")).locator(`[data-testid="est-ligne"][data-piece="etage"][data-etat="nouveau"][data-nature="quantite"]`);
  await expect(stale.getByTestId("est-ligne-automatique")).toHaveAttribute("data-perime", "quantite");
  await expect(stale.getByTestId("est-ligne-montant")).toContainText("40,00 €");
  await expect(stale.getByTestId("est-ligne-montant")).toContainText("(à revoir : quantité 5 u → 6 u depuis la correction)");
  await expect(page.getByTestId("est-anomalies")).toContainText("la quantité a changé depuis la correction");
  // Écriture concurrente : révision obsolète refusée, rien n'est écrasé. Autre tenant : rien de visible.
  const concurrent = await ctx.a.rpc("tools_releve_estimation_parametres_enregistrer", { p_releve_id: ctx.releveId, p_donnees: { coefficientGeneral: 3 }, p_revision: 0 });
  expect(concurrent.error?.code).toBe("PT409");
  expect((await ctx.b.rpc("tools_releve_estimation_parametres", { p_releve_id: ctx.releveId })).error?.code).toBe("42501");
  expect((await ctx.a.rpc("tools_releve_estimation_parametres_enregistrer", { p_releve_id: ctx.releveId, p_donnees: { acompte: 30 }, p_revision: e.parametres.revision })).error?.code).toBe("22023");
  // Contrat Gestion Pro 1.1.0 : hypothèses, coefficients appliqués, valeur source, métadonnées de source ; aucun devis.
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("est-export-json").click()]);
  const gp = JSON.parse(readFileSync((await json.path())!, "utf8"));
  expect(gp.contract).toEqual({ name: "elsatia.tools.estimation", version: "1.1.0" });
  expect(gp.perimetre.gestionProLibreDeRechiffrer).toBe(true);
  expect(gp.source).toMatchObject({ application: "elsatia-tools", module: "releve-metre", releveId: ctx.releveId });
  expect(gp.hypotheses.priorite).toEqual(["ouvrage", "lot", "general"]);
  expect(gp.hypotheses.plans.find((h: { planRef: string }) => h.planRef === p2)).toMatchObject({ coefficientGeneral: "1.1", texte: "Site occupé, accès par escalier",
    coefficientsLots: [{ lot: "Peinture", coefficient: "1.2" }, { lot: "Plâtrerie – cloisons", coefficient: "1.5" }] });
  expect(gp.prix.find((x: { ouvrageRef: string }) => x.ouvrageRef === k.pei)).toMatchObject({ coefficient: "1.2", coefficientSaisi: null, coefficientSource: "lot", prixUnitaire: "12" });
  expect(gp.lignes.find((l: { ouvrageRef: string }) => l.ouvrageRef === k.eva).correction).toMatchObject({ quantiteSource: "5.000", obsolete: true, motifObsolescence: "quantite", raison: "Évacuation au forfait benne" });
  expect(JSON.stringify(gp)).not.toMatch(/"[^"]*(numeroDevis|facture|commande|signature|marge|remise|tva|ttc|prixVente|acompte|conditionsCommerciales)[^"]*"\s*:/i);
  // Tablette : panneau des coefficients lisible, sans tableau ni débordement.
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator("table")).toHaveCount(0);
  expect(await sansDebordement(page)).toBe(true);
  // Remise à zéro des coefficients (aucun effet sur un éventuel test suivant).
  const { data: lu } = must(await ctx.a.rpc("tools_releve_estimation_parametres", { p_releve_id: ctx.releveId }));
  must(await ctx.a.rpc("tools_releve_estimation_parametres_enregistrer", { p_releve_id: ctx.releveId, p_donnees: {}, p_revision: (lu as { revision: number }).revision }));
});
