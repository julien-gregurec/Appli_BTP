import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 8 : dimensions, surfaces, volumes & revêtements, sur pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS), Tools en `next dev`.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot8.spec.ts --project=desktop-chromium
 *
 * Toutes les valeurs attendues sont calculées à la main (voir le rapport Lot 8) : le métré affiché est
 * celui du SERVEUR. Tablette : Chromium en émulation (MOBILE EMULATED ONLY). Mesures : RELEVE_E2E_PERF_OUT.
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
const dir = join(tmpdir(), `releve-lot8-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const perf: Record<string, unknown> = {};
const NB = " ";

type Pt = { x: number; y: number };
type Wall = { id: string; pieceId: null; donnees: { a: Pt; b: Pt; epaisseurMm: number; hauteurMm: number | null; typeMur: string } };
type Ctx = { a: SupabaseClient; b: SupabaseClient; tenantA: string; releveId: string; chantierId: string; batimentId: string; e1: string; e2: string; zone: string; sejour: string; chambre: string };
let ctx: Ctx;
const walls: Record<string, string> = {};
const plans: Record<string, string> = {};

const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };
const wall = (id: string, ax: number, ay: number, bx: number, by: number, epaisseurMm = 200, typeMur = "porteur"): Wall =>
  ({ id, pieceId: null, donnees: { a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm, hauteurMm: 2500, typeMur } });
const ouv = (id: string, murId: string, typeOuverture: string, decalageMm: number, largeurMm: number, hauteurMm: number, allegeMm: number | null) =>
  ({ id, murId, donnees: { decalageMm, largeurMm, hauteurMm, allegeMm, typeOuverture, sens: "gauche" } });
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

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
type Metre = {
  source: string; fige: boolean; revision: number;
  pieces: { pieceId: string; hauteurMm: number | null; surfaceSolNetteMm2: number; surfaceMursNetteMm2: number | null; volumeMm3: number | null; perimetreUtileMm: number; retenu: Record<string, number | null>; ajustements: { id: string; perime: boolean }[] }[];
  revetements: { id: string; libelle: string; quantite: number | null; quantiteAvecPerte: number | null; quantiteCalculee: number | null }[];
  travaux: { murs: Record<string, { nombre: number }> };
};
async function metre(planId: string, as: SupabaseClient = ctx.a): Promise<Metre> {
  const { data } = must(await as.rpc("tools_releve_plan_metre", { p_plan_id: planId }));
  return data as Metre;
}
const pieceOf = async (planId: string, pieceId: string) => (await metre(planId)).pieces.find((p) => p.pieceId === pieceId)!;
async function revision(planId: string) {
  const { data } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  return (data as { revision: number }).revision;
}

const metreUrl = (extra = "") => `${BASE}/releves/metre?id=${ctx.releveId}${extra}`;
const planUrl = (etageId: string, planId?: string) => `${BASE}/releves/plan?id=${ctx.releveId}&etage=${etageId}${planId ? `&plan=${planId}` : ""}`;
const canvas = (page: Page) => page.getByRole("application", { name: /^Plan / });
const saved = (page: Page) => expect(page.getByRole("status", { name: "État de sauvegarde — plan" })).toHaveText(/Enregistré/, { timeout: 30_000 });
const message = (page: Page) => page.getByTestId("plan-message");
const metreMessage = (page: Page) => page.getByTestId("metre-message");
const card = (page: Page, pieceId: string) => page.locator(`details[data-piece="${pieceId}"]`);
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function openCard(page: Page, pieceId: string) {
  const details = card(page, pieceId);
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator("summary").click();
  await expect(details.getByTestId("metre-grandeurs")).toBeVisible();
  return details;
}
const valeur = (details: ReturnType<typeof card>, grandeur: string) => details.locator(`li[data-grandeur="${grandeur}"] [data-testid="metre-valeur"]`);

async function at(page: Page, p: Pt): Promise<Pt & { pxPerMm: number }> {
  await canvas(page).evaluate((element) => { const r = element.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) element.scrollIntoView({ block: "center", behavior: "instant" }); });
  const matrix = await page.getByTestId("plan-monde").getAttribute("transform");
  const [a, b, c, d, e, f] = matrix!.replace(/^matrix\(|\)$/g, "").split(/[ ,]+/).map(Number);
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + a * p.x + c * p.y + e, y: box.y + b * p.x + d * p.y + f, pxPerMm: Math.hypot(a, b) };
}
async function tool(page: Page, name: "Sélection" | "Cote", touch = false) {
  const button = page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name, exact: true });
  if (touch) await button.tap(); else await button.click();
  await canvas(page).evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
}
async function seedPlan(etageId: string, mods: Record<string, unknown>) {
  const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
  const planId = (plan as { id: string }).id;
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: 1, p_modifications: mods }));
  return planId;
}

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const keys = { releveId: uuid(), batimentId: uuid(), e1: uuid(), e2: uuid(), zone: uuid(), sejour: uuid(), chambre: uuid() };
  must(await a.from("tools_releves").insert({ id: keys.releveId, entreprise_id: tenantA, nom: `Relevé Lot 8 ${suffix}`, chantier_nom: "Maison Lot 8" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", keys.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: keys.releveId, nom: "Maison Lot 8" }));
  must(await a.from("tools_releves_batiments").insert({ id: keys.batimentId, releve_id: keys.releveId, chantier_id: chantierId, nom: "Maison" }));
  // RDC SANS hauteur d'étage : la chambre (sans hauteur) reste « non calculable ».
  must(await a.from("tools_releves_etages").insert([
    { id: keys.e1, releve_id: keys.releveId, batiment_id: keys.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0 },
    { id: keys.e2, releve_id: keys.releveId, batiment_id: keys.batimentId, nom: "Étage perf", niveau: 1, type_niveau: "etage", ordre: 1, hauteur_sous_plafond_mm: 2500 },
  ]));
  must(await a.from("tools_releves_zones").insert({ id: keys.zone, releve_id: keys.releveId, etage_id: keys.e1, nom: "Logement", type: "logement" }));
  must(await a.from("tools_releves_pieces").insert([
    { id: keys.sejour, releve_id: keys.releveId, etage_id: keys.e1, zone_id: keys.zone, nom: "Séjour", usage: "sejour", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: keys.chambre, releve_id: keys.releveId, etage_id: keys.e1, nom: "Chambre", usage: "chambre", ordre: 1 },
  ]));
  ctx = { a, b, tenantA, chantierId, ...keys };
  // Maison 6 × 4 m à l'axe (murs de 20 cm), cloison x = 3 000 (10 cm) ; porte sud (Séjour), porte de cloison, fenêtre nord (Chambre).
  for (const key of ["s", "e", "n", "w", "c"]) walls[key] = uuid();
  plans.e1 = await seedPlan(keys.e1, {
    murs: [
      wall(walls.s, 0, 0, 6000, 0, 200, "exterieur"), wall(walls.e, 6000, 0, 6000, 4000, 200, "exterieur"),
      wall(walls.n, 6000, 4000, 0, 4000, 200, "exterieur"), wall(walls.w, 0, 4000, 0, 0, 200, "exterieur"),
      wall(walls.c, 3000, 0, 3000, 4000, 100, "cloison"),
    ],
    ouvertures: [ouv(uuid(), walls.s, "porte", 1000, 900, 2150, 0), ouv(uuid(), walls.c, "porte", 1500, 800, 2040, 0), ouv(uuid(), walls.n, "fenetre", 1000, 1200, 1250, 900)],
    contours: [
      { pieceId: keys.sejour, points: rect(100, 100, 2950, 3900), murIds: [walls.s, walls.c, walls.n, walls.w], graine: { x: 1500, y: 2000 } },
      { pieceId: keys.chambre, points: rect(3050, 100, 5900, 3900), murIds: [walls.s, walls.e, walls.n, walls.c], graine: { x: 4500, y: 2000 } },
    ],
  });
});

test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// ─────────────────────────────────────────────────────────────────────────────
test("Métré : synthèse chantier → pièce, valeurs du serveur, hauteur inconnue non inventée, unités", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/fiche?id=${ctx.releveId}`);
  await page.getByTestId("lien-metre").click();
  await expect(page.getByRole("heading", { name: `Métré · Relevé Lot 8 ${suffix}` })).toBeVisible();
  // Séjour 2,85 × 3,80 = 10,83 m² ; Chambre idem.
  await expect(page.getByTestId("metre-total-sol")).toHaveText("21,66 m²");
  // Murs nets : Séjour seulement (33,25 − porte 1,935 − porte 1,632 = 29,683) ; la chambre n'a pas de hauteur.
  await expect(page.getByTestId("metre-total-murs")).toHaveText("29,68 m²");
  await expect(page.getByTestId("metre-total-volume")).toHaveText("27,08 m³");
  await expect(page.getByTestId("metre-total-pieces")).toHaveText("2 · 4");
  await expect(page.getByTestId("metre-avertissements")).toContainText("1 pièce(s) sans hauteur connue");
  // Arbre : chantier → bâtiment → étage (plan calculé) → zone → pièce.
  await expect(page.getByTestId("metre-chantier")).toHaveCount(1);
  await expect(page.getByTestId("metre-etage").first()).toContainText("Plan 1 · Initial");
  await expect(page.getByTestId("metre-zone")).toContainText("Zone · Logement");
  const sejour = await openCard(page, ctx.sejour);
  await expect(valeur(sejour, "surface_sol")).toHaveText("10,83 m²");
  await expect(valeur(sejour, "surface_plafond")).toHaveText("10,83 m²");
  await expect(valeur(sejour, "perimetre_brut")).toHaveText("13,30 ml");
  await expect(valeur(sejour, "perimetre_utile")).toHaveText("11,60 ml");
  await expect(valeur(sejour, "surface_murs")).toHaveText("29,68 m²");
  await expect(valeur(sejour, "volume")).toHaveText("27,08 m³");
  await expect(sejour.getByTestId("metre-ouvertures").locator("li")).toHaveCount(2);
  await expect(sejour.getByTestId("metre-faces").locator("li")).toHaveCount(4);
  await expect(sejour.getByTestId("metre-faces")).not.toContainText("mur non retrouvé");
  const chambre = await openCard(page, ctx.chambre);
  await expect(valeur(chambre, "volume")).toHaveText("non calculable");
  await expect(valeur(chambre, "surface_murs")).toHaveText("non calculable");
  await expect(chambre.getByTestId("metre-hauteur")).toContainText("Hauteur : inconnue");
  // Unités : m → cm → mm (hauteur de la pièce), valeurs internes inchangées.
  await expect(sejour.getByTestId("metre-hauteur")).toContainText("2,50 m (pièce)");
  await page.getByTestId("metre-unite").selectOption("cm");
  await expect(sejour.getByTestId("metre-hauteur")).toContainText("250,0 cm (pièce)");
  await page.getByTestId("metre-unite").selectOption("mm");
  await expect(sejour.getByTestId("metre-hauteur")).toContainText(`2${NB}500 mm (pièce)`);
  // Le serveur est la source : mêmes valeurs par RPC.
  const server = await pieceOf(plans.e1, ctx.sejour);
  expect([server.surfaceSolNetteMm2, server.surfaceMursNetteMm2, server.volumeMm3, server.perimetreUtileMm]).toEqual([10_830_000, 29_683_000, 27_075_000_000, 11_600]);
  // Hauteur de l'étage saisie → la chambre devient calculable (source « étage »), sans rien inventer.
  must(await ctx.a.from("tools_releves_etages").update({ hauteur_sous_plafond_mm: 2600 }).eq("id", ctx.e1));
  const chambreServeur = await pieceOf(plans.e1, ctx.chambre);
  expect([chambreServeur.hauteurMm, chambreServeur.volumeMm3]).toEqual([2600, 28_158_000_000]);
  must(await ctx.a.from("tools_releves_etages").update({ hauteur_sous_plafond_mm: null }).eq("id", ctx.e1));
});

test("Revêtements : sol, peinture (tous les murs), faïence (zone), plinthe ; perte configurable ; synthèse par famille ; refus", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(metreUrl(`&piece=${ctx.sejour}`));
  const sejour = card(page, ctx.sejour);
  await expect(sejour.getByTestId("metre-grandeurs")).toBeVisible();
  const add = async (fill: (form: ReturnType<Page["getByTestId"]>) => Promise<void>, expected: RegExp) => {
    await sejour.getByTestId("metre-revetement-ajouter").click();
    const form = sejour.getByTestId("metre-revetement-form");
    await fill(form);
    await form.getByTestId("metre-revetement-enregistrer").click();
    await expect(metreMessage(page)).toHaveText(expected);
  };
  await add(async (form) => {
    await form.getByTestId("metre-revetement-famille").selectOption("carrelage");
    await form.getByTestId("metre-revetement-libelle").fill("Carrelage 60×60");
    await form.getByTestId("metre-revetement-perte").fill("10");
    await form.getByTestId("metre-revetement-format").fill("60×60");
    await form.getByTestId("metre-revetement-sens").fill("droit");
  }, /Carrelage 60×60.*enregistré/);
  await add(async (form) => {
    await form.getByTestId("metre-revetement-support").selectOption("mur");
    await form.getByTestId("metre-revetement-famille").selectOption("peinture");
    await form.getByTestId("metre-revetement-libelle").fill("Peinture murs");
    await form.getByTestId("metre-revetement-perte").fill("5");
  }, /Peinture murs.*enregistré/);
  // Faïence : zone du mur ouest (face intérieure), 1,20 m de large, de 0 à 1,50 m.
  await add(async (form) => {
    await form.getByTestId("metre-revetement-support").selectOption("mur");
    await form.getByTestId("metre-revetement-famille").selectOption("faience");
    await form.getByTestId("metre-revetement-libelle").fill("Faïence douche");
    await form.getByTestId("metre-revetement-perte").fill("12,5");
    await form.getByTestId("metre-revetement-mode-zone").check();
    await form.getByTestId("metre-revetement-zone-mur").selectOption(walls.w);
    await form.getByTestId("metre-revetement-zone-debut").fill("100");
    await form.getByTestId("metre-revetement-zone-fin").fill("220");
    await form.getByTestId("metre-revetement-zone-bas").fill("0");
    await form.getByTestId("metre-revetement-zone-haut").fill("150");
  }, /Faïence douche.*enregistré/);
  await add(async (form) => {
    await form.getByTestId("metre-revetement-support").selectOption("plinthe");
    await form.getByTestId("metre-revetement-famille").selectOption("plinthe");
    await form.getByTestId("metre-revetement-libelle").fill("Plinthes bois");
  }, /Plinthes bois.*enregistré/);
  // Refus côté client (miroir serveur) : perte hors bornes.
  await sejour.getByTestId("metre-revetement-ajouter").click();
  await sejour.getByTestId("metre-revetement-perte").fill("150");
  await sejour.getByTestId("metre-revetement-enregistrer").click();
  await expect(sejour.getByTestId("metre-revetement-form").getByRole("alert")).toHaveText("Perte entre 0 et 100 % (deux décimales au plus).");
  await sejour.getByTestId("metre-revetement-form").getByRole("button", { name: "Annuler" }).click();

  const lignes = sejour.getByTestId("metre-revetement");
  await expect(lignes).toHaveCount(4);
  const quantite = (famille: string) => sejour.locator(`[data-testid="metre-revetement"][data-famille="${famille}"] [data-testid="metre-revetement-quantite"]`);
  await expect(quantite("carrelage")).toContainText("10,83 m² · perte 10 % → 11,91 m²");
  await expect(quantite("peinture")).toContainText("29,68 m² · perte 5 % → 31,17 m²");
  await expect(quantite("faience")).toContainText("1,80 m² · perte 12,5 % → 2,03 m²");
  await expect(quantite("plinthe")).toContainText("11,60 ml");
  // Synthèse par famille.
  await expect(page.locator('[data-testid="metre-famille"][data-famille="carrelage"] [data-testid="metre-famille-quantite"]')).toContainText("10,83 m²");
  await expect(page.locator('[data-testid="metre-famille"][data-famille="plinthe"] [data-testid="metre-famille-quantite"]')).toContainText("11,60 ml");
  // Base : éléments `materiau` du plan (donnees du formulaire), quantités recalculées par le serveur.
  const { data: rows } = must(await ctx.a.from("tools_releves_elements").select("piece_id, donnees").eq("plan_id", plans.e1).eq("type", "materiau").is("deleted_at", null));
  expect((rows as { piece_id: string }[]).every((row) => row.piece_id === ctx.sejour)).toBe(true);
  expect((rows as { donnees: Record<string, unknown> }[]).find((row) => row.donnees.revetement === "carrelage")!.donnees).toMatchObject({ categorie: "sol", unite: "m2", pertePourcent: 10, format: "60×60", sensPose: "droit" });
  const server = await metre(plans.e1);
  expect(server.revetements.map((rev) => `${rev.libelle}:${rev.quantite}:${rev.quantiteAvecPerte}`).sort()).toEqual([
    "Carrelage 60×60:10830000:11913000", "Faïence douche:1800000:2025000", "Peinture murs:29683000:31167150", "Plinthes bois:11600:11600",
  ]);
  // Refus serveur : famille incompatible avec le support (écriture directe via RPC).
  const refus = await ctx.a.rpc("tools_releve_plan_revetement_enregistrer", { p_plan_id: plans.e1, p_id: uuid(), p_piece_id: ctx.sejour,
    p_donnees: { libelle: "X", categorie: "plafond", unite: "m2", pertePourcent: 0, revetement: "parquet" } });
  expect([refus.error?.code, refus.error?.message]).toEqual(["22023", "Famille de revêtement inconnue pour ce support."]);
  // Modifier puis supprimer (plinthe → corniche : périmètre brut 13,30 ml).
  await sejour.locator('[data-testid="metre-revetement"][data-famille="plinthe"] [data-testid="metre-revetement-modifier"]').click();
  await sejour.getByTestId("metre-revetement-famille").selectOption("corniche");
  await sejour.getByTestId("metre-revetement-enregistrer").click();
  await expect(quantite("corniche")).toContainText("13,30 ml");
  page.once("dialog", (dialog) => void dialog.accept());
  await sejour.locator('[data-testid="metre-revetement"][data-famille="corniche"] [data-testid="metre-revetement-supprimer"]').click();
  await expect(lignes).toHaveCount(3);
});

test("Ajustements : valeur calculée jamais écrasée, raison obligatoire, auteur / date, journal, propagation, retrait", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(metreUrl(`&piece=${ctx.sejour}`));
  const sejour = card(page, ctx.sejour);
  await expect(sejour.getByTestId("metre-grandeurs")).toBeVisible();
  await sejour.getByTestId("metre-ajuster-surface_sol").click();
  const form = sejour.getByTestId("metre-ajustement-form");
  await form.getByTestId("metre-ajustement-valeur").fill("10,50");
  await form.getByTestId("metre-ajustement-valider").click();
  await expect(form.getByRole("alert")).toHaveText("La raison de l'ajustement est obligatoire.");
  await form.getByTestId("metre-ajustement-raison").fill("Poteau 0,57 × 0,58 non déduit par le plan");
  await form.getByTestId("metre-ajustement-valider").click();
  await expect(metreMessage(page)).toHaveText("Surface de sol ajustée : la valeur calculée reste affichée à côté.");
  await expect(valeur(sejour, "surface_sol")).toContainText("10,50 m² · calculé 10,83 m²");
  await expect(sejour.locator('li[data-grandeur="surface_sol"] [data-testid="metre-ajustement"]')).toContainText("Retenu 10,50 m² au lieu de 10,83 m² — « Poteau 0,57 × 0,58 non déduit par le plan »");
  // Le revêtement de sol suit la valeur retenue.
  await expect(sejour.locator('[data-testid="metre-revetement"][data-famille="carrelage"] [data-testid="metre-revetement-quantite"]')).toContainText("10,50 m² · perte 10 % → 11,55 m²");
  const { data: rows } = must(await ctx.a.from("tools_releves_metre_ajustements").select("valeur_calculee, valeur_retenue, raison, created_by, created_at, retire_le").eq("plan_id", plans.e1));
  const { data: me } = await ctx.a.auth.getUser();
  expect(rows).toHaveLength(1);
  expect((rows as Record<string, unknown>[])[0]).toMatchObject({ valeur_calculee: 10830000, valeur_retenue: 10500000, created_by: me.user!.id, retire_le: null });
  const { data: journal } = must(await ctx.a.from("tools_releves_journal").select("action, champs, details").eq("releve_id", ctx.releveId).eq("action", "ajustement"));
  expect((journal as { details: Record<string, unknown> }[])[0].details).toMatchObject({ grandeur: "surface_sol", valeur_calculee: 10830000, valeur_retenue: 10500000 });
  // Quantité d'un revêtement ajustée.
  await sejour.locator('[data-testid="metre-revetement"][data-famille="peinture"] [data-testid="metre-revetement-ajuster"]').click();
  await sejour.getByTestId("metre-ajustement-valeur").fill("30");
  await sejour.getByTestId("metre-ajustement-raison").fill("Retours de baie");
  await sejour.getByTestId("metre-ajustement-valider").click();
  await expect(sejour.locator('[data-testid="metre-revetement"][data-famille="peinture"] [data-testid="metre-revetement-quantite"]')).toContainText("30,00 m² · perte 5 % → 31,50 m²");
  await expect(sejour.locator('[data-testid="metre-revetement"][data-famille="peinture"]')).toContainText("ajusté (calculé 29,68 m²) — « Retours de baie »");
  // Retour à la valeur calculée (retrait tracé, jamais de suppression).
  await sejour.getByTestId("metre-retirer-surface_sol").click();
  await expect(valeur(sejour, "surface_sol")).toHaveText("10,83 m²");
  const { data: after } = must(await ctx.a.from("tools_releves_metre_ajustements").select("grandeur, retire_le, raison_retrait").eq("plan_id", plans.e1).eq("grandeur", "surface_sol"));
  expect((after as { retire_le: string | null; raison_retrait: string }[])[0]).toMatchObject({ raison_retrait: "Retour à la valeur calculée" });
  expect((after as { retire_le: string | null }[])[0].retire_le).not.toBeNull();
  // Aucune écriture directe dans la table des ajustements.
  const direct = await ctx.a.from("tools_releves_metre_ajustements").update({ valeur_retenue: 1 }).eq("plan_id", plans.e1).select();
  expect(direct.error?.code ?? ((direct.data as unknown[]) ?? []).length).toBeTruthy();
  expect(((await ctx.a.from("tools_releves_metre_ajustements").select("valeur_retenue").eq("plan_id", plans.e1).eq("grandeur", "quantite")).data as { valeur_retenue: number }[])[0].valeur_retenue).toBe(30_000_000);
});

test("Option « petites ouvertures » : seuil choisi par l'utilisateur, aucun défaut", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(metreUrl(`&piece=${ctx.sejour}`));
  const sejour = card(page, ctx.sejour);
  await expect(valeur(sejour, "surface_murs")).toHaveText("29,68 m²");
  await page.getByTestId("metre-seuil-ouvrir").first().click();
  await page.getByTestId("metre-seuil-valeur").fill("2");
  await page.getByTestId("metre-seuil").getByRole("button", { name: "Appliquer" }).click();
  await expect(metreMessage(page)).toHaveText("Ouvertures de moins de 2,00 m² non déduites des murs.");
  // Les deux portes (1,935 et 1,632 m²) ne sont plus déduites : murs = brut 33,25 m².
  await expect(valeur(sejour, "surface_murs")).toHaveText("33,25 m²");
  await expect(sejour.getByTestId("metre-ouvertures")).toContainText("(non déduite)");
  const { data } = must(await ctx.a.from("tools_releves_plans").select("reglages").eq("id", plans.e1).single());
  expect((data as { reglages: { metre: { seuilDeductionMm2: number } } }).reglages.metre.seuilDeductionMm2).toBe(2_000_000);
  await page.getByTestId("metre-seuil-ouvrir").first().click();
  await page.getByTestId("metre-seuil").getByRole("button", { name: "Tout déduire" }).click();
  await expect(valeur(sejour, "surface_murs")).toHaveText("29,68 m²");
});

test("Cotations dans l'éditeur : automatiques (partielles, cumulées, pièces), manuelles (calculée, relevée), hauteur ponctuelle, annuler", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await expect(page.getByTestId("plan-compteurs")).toContainText("5 mur(s) · 3 ouverture(s)");
  // Mur sud sélectionné : chaîne de cotes (porte 1,00 → 1,90 m) et faces raccordées.
  const sud = await at(page, { x: 4500, y: 0 });
  await page.mouse.click(sud.x, sud.y);
  await expect(page.getByTestId("plan-wall-panel")).toBeVisible();
  const partielles = page.locator('[data-testid="plan-cote-ligne"][data-kind="partielle"]');
  await expect(partielles).toHaveCount(3);
  expect(await partielles.evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-valeur"))))).toEqual([1000, 900, 4100]);
  expect(await page.locator('[data-testid="plan-cote-ligne"][data-kind="cumulee"]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-valeur"))))).toEqual([1000, 1900]);
  await expect(page.locator('[data-testid="plan-cote-ligne"][data-kind="exterieure"]')).toHaveAttribute("data-valeur", "6200");
  // Cotes des pièces : intérieures (4 par pièce) + longueur / largeur / diagonale.
  await page.getByTestId("plan-cotes-pieces").check();
  await expect(page.locator('[data-testid="plan-cote-ligne"][data-kind="interieure"]')).toHaveCount(4 * 2 + 1);
  expect(await page.locator('[data-testid="plan-cote-ligne"][data-kind="largeur"]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-valeur"))))).toEqual([2850, 2850]);
  await page.getByTestId("plan-cotes-pieces").uncheck();
  // Cote manuelle (accrochage coupé : points exacts du toucher) dans le séjour.
  await page.getByRole("checkbox", { name: "Accrochage" }).uncheck();
  await tool(page, "Cote");
  const a = await at(page, { x: 500, y: 2000 }); const b = await at(page, { x: 2500, y: 2000 });
  await page.mouse.click(a.x, a.y);
  await expect(message(page)).toHaveText("Premier point de la cote posé : touchez le second point.");
  await page.mouse.click(b.x, b.y);
  await expect(message(page)).toHaveText(/^Cote de (1,99|2,0\d) m posée\.$/);
  await saved(page);
  const cotes = async () => {
    const { data } = must(await ctx.a.from("tools_releves_elements").select("id, piece_id, deleted_at, donnees").eq("plan_id", plans.e1).eq("type", "mesure"));
    return data as { id: string; piece_id: string | null; deleted_at: string | null; donnees: { typeCote: string; source: string; valeur: number; a: Pt; b: Pt | null } }[];
  };
  let rows = await cotes();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ piece_id: ctx.sejour, donnees: { typeCote: "libre", source: "calcule" } });
  expect(Math.abs(rows[0].donnees.valeur - 2000)).toBeLessThan(20);
  // Valeur relevée sur site : jamais écrasée, écart au plan affiché.
  await expect(page.getByTestId("plan-cote-panel")).toBeVisible();
  await page.getByTestId("plan-cote-valeur").fill("200,5");
  await page.getByTestId("plan-cote-valeur").press("Enter");
  await expect(page.getByTestId("plan-cote-ecart")).toContainText("Valeur relevée au mètre ; plan : ");
  await saved(page);
  rows = await cotes();
  expect(rows[0].donnees).toMatchObject({ source: "manuel", valeur: 2005 });
  await expect(page.locator(`[data-testid="plan-cote-ligne"][data-cote="${rows[0].id}"]`)).toHaveAttribute("data-valeur", "2005");
  // Hauteur ponctuelle dans la chambre.
  await tool(page, "Cote");
  await page.getByTestId("plan-cote-mode-hauteur").click();
  await page.getByTestId("plan-cote-hauteur").fill("248");
  const h = await at(page, { x: 4500, y: 2000 });
  await page.mouse.click(h.x, h.y);
  await expect(message(page)).toHaveText("Hauteur ponctuelle 2,48 m posée (Chambre).");
  await saved(page);
  rows = await cotes();
  const hauteur = rows.find((row) => row.donnees.typeCote === "hauteur")!;
  expect(hauteur).toMatchObject({ piece_id: ctx.chambre, deleted_at: null, donnees: { valeur: 2480, source: "manuel", b: null } });
  // Annuler : la hauteur disparaît (suppression douce) ; rétablir : restaurée.
  await page.getByRole("button", { name: "Annuler" }).click();
  await saved(page);
  expect((await cotes()).find((row) => row.id === hauteur.id)!.deleted_at).not.toBeNull();
  await page.getByRole("button", { name: "Rétablir" }).click();
  await saved(page);
  expect((await cotes()).find((row) => row.id === hauteur.id)!.deleted_at).toBeNull();
  // Métré : hauteur ponctuelle rattachée à la chambre.
  await page.goto(metreUrl(`&piece=${ctx.chambre}`));
  await expect(card(page, ctx.chambre).getByTestId("metre-hauteur")).toContainText("hauteurs ponctuelles : 2,48 m (plafond incliné non pris en charge");
});

test("Exports : CSV (valeurs exactes, FR), contrat Gestion Pro (JSON), impression", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(metreUrl());
  await expect(page.getByTestId("metre-total-sol")).toHaveText("21,66 m²");
  let started = Date.now();
  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("metre-export-csv").click()]);
  const csv = readFileSync((await csvDownload.path())!, "utf8");
  perf.export_csv_ms = Date.now() - started;
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain(";Maison;RDC;Logement;Séjour;Surface de sol;10,83;m²;;10,83;non;;");
  expect(csv).toContain(";Maison;RDC;Logement;Séjour;Volume;27,075;m³;;27,075;non;;");
  expect(csv).toContain(";Maison;RDC;;Chambre;Volume;;m³;;;non;Non calculable;");
  expect(csv).toMatch(/Séjour;Sol · Carrelage · Carrelage 60×60;10,83;m²;11,91;10,83;non;;Existant/);
  started = Date.now();
  const [gpDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("metre-export-gp").click()]);
  const gp = JSON.parse(readFileSync((await gpDownload.path())!, "utf8"));
  perf.export_gp_ms = Date.now() - started;
  expect(gp).toMatchObject({ contractVersion: 1, kind: "releve-metre/metre", source: { releveId: ctx.releveId, etat: "existant" } });
  expect(gp.pieces.find((p: { ref: string }) => p.ref === ctx.sejour)).toMatchObject({ surfaceSolM2: 10.83, perimetreUtileM: 11.6, surfaceMursNetteM2: 29.683, volumeM3: 27.075, hauteurM: 2.5 });
  expect(gp.pieces.find((p: { ref: string }) => p.ref === ctx.chambre)).toMatchObject({ volumeM3: null, surfaceMursNetteM2: null });
  expect(gp.ouvertures).toHaveLength(3);
  expect(JSON.stringify(gp)).not.toMatch(/prix|montant|tarif/i);
  // Impression : toutes les pièces dépliées puis impression du navigateur (PDF).
  await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
  await page.getByTestId("metre-imprimer").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  expect(await page.locator("details[data-piece]").evaluateAll((nodes) => nodes.every((node) => (node as HTMLDetailsElement).open))).toBe(true);
});

test("Versioning : métré figé avec le plan (immuable), dérivé recalculé indépendamment, projeté : existant / dépose / neuf", async ({ page }) => {
  await signIn(page, EMAIL_A);
  const figer = await ctx.a.rpc("tools_releve_plan_figer", { p_plan_id: plans.e1, p_revision: await revision(plans.e1), p_libelle: "Existant" });
  must(figer);
  const fige = await metre(plans.e1);
  expect([fige.source, fige.fige]).toEqual(["gel", true]);
  // Hauteur modifiée APRÈS le gel : le métré figé ne change pas.
  must(await ctx.a.from("tools_releves_pieces").update({ hauteur_sous_plafond_mm: 2700 }).eq("id", ctx.sejour));
  expect((await pieceOf(plans.e1, ctx.sejour)).volumeMm3).toBe(27_075_000_000);
  const refus = await ctx.a.rpc("tools_releve_metre_ajuster", { p_plan_id: plans.e1, p_piece_id: ctx.sejour, p_revetement_id: null, p_grandeur: "volume", p_valeur_retenue: 1, p_raison: "Après gel" });
  expect(refus.error?.code).toBe("42501");
  await page.goto(metreUrl(`&piece=${ctx.sejour}`));
  await expect(page.getByTestId("metre-plan-badge")).toContainText("métré figé");
  const sejour = card(page, ctx.sejour);
  await expect(valeur(sejour, "volume")).toHaveText("27,08 m³");
  await expect(sejour.getByTestId("metre-ajuster-volume")).toHaveCount(0);
  await expect(sejour.getByTestId("metre-revetement-ajouter")).toHaveCount(0);
  // Plan projeté dérivé : revêtements et cotes copiés, ajustements NON copiés, recalcul à 2,70 m.
  const { data: created } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: ctx.e1, p_etat: "projete", p_plan_base_id: plans.e1 }));
  plans.projete = (created as { id: string }).id;
  const derive = await metre(plans.projete);
  const sejourDerive = derive.pieces.find((p) => p.pieceId === ctx.sejour)!;
  expect([sejourDerive.volumeMm3, sejourDerive.ajustements.length, derive.revetements.length]).toEqual([29_241_000_000, 0, 3]);
  expect(derive.revetements.find((rev) => rev.libelle === "Peinture murs")!.quantite).toBe(sejourDerive.surfaceMursNetteMm2);
  // Éditeur (plan projeté) : cloison à déposer.
  await page.goto(planUrl(ctx.e1, plans.projete));
  await expect(page.getByTestId("plan-etat")).toHaveText("Projetée");
  const cloison = await at(page, { x: 3000, y: 800 });
  await page.mouse.click(cloison.x, cloison.y);
  await page.getByTestId("plan-wall-etat").selectOption("a_deposer");
  await saved(page);
  const { data: murs } = must(await ctx.a.from("tools_releves_elements").select("donnees").eq("plan_id", plans.projete).eq("type", "mur"));
  expect((murs as { donnees: { etatProjet?: string; typeMur: string } }[]).filter((m) => m.donnees.etatProjet === "a_deposer").map((m) => m.donnees.typeMur)).toEqual(["cloison"]);
  // Vue Métré, onglet Projeté : existant / dépose / neuf distingués.
  await page.goto(metreUrl());
  await page.getByTestId("metre-etat-projete").click();
  await expect(page.getByTestId("metre-travaux")).toBeVisible();
  await expect(page.locator('[data-testid="metre-travaux"] li[data-etat="a_deposer"]')).toContainText("murs 1 (4,00 ml · 10,00 m²)");
  await expect(page.locator('[data-testid="metre-travaux"] li[data-etat="existant"]')).toContainText("murs 4");
  // Le plan figé est intact (métré figé identique).
  expect((await metre(plans.e1)).pieces).toEqual(fige.pieces);
});

test("Sécurité : autre tenant (lecture, synthèse, ajustement, revêtement), écriture directe contrôlée", async ({ page }) => {
  const metreB = await ctx.b.rpc("tools_releve_plan_metre", { p_plan_id: plans.projete });
  expect(metreB.error?.code).toBe("42501");
  const syntheseB = await ctx.b.rpc("tools_releve_metre_synthese", { p_releve_id: ctx.releveId, p_etat: "existant" });
  expect(syntheseB.error?.code).toBe("42501");
  const ajusterB = await ctx.b.rpc("tools_releve_metre_ajuster", { p_plan_id: plans.projete, p_piece_id: ctx.sejour, p_revetement_id: null, p_grandeur: "volume", p_valeur_retenue: 1, p_raison: "Intrusion" });
  expect(ajusterB.error?.code).toBe("42501");
  const revB = await ctx.b.rpc("tools_releve_plan_revetement_enregistrer", { p_plan_id: plans.projete, p_id: uuid(), p_piece_id: ctx.sejour,
    p_donnees: { libelle: "X", categorie: "sol", unite: "m2", pertePourcent: 0, revetement: "parquet" } });
  expect(revB.error?.code).toBe("42501");
  const lectureB = await ctx.b.from("tools_releves_metre_ajustements").select("id").eq("releve_id", ctx.releveId);
  expect(lectureB.data ?? []).toHaveLength(0);
  // Écriture directe d'un revêtement invalide par le propriétaire : refusée par la garde de ligne.
  const direct = await ctx.a.from("tools_releves_elements").insert({ releve_id: ctx.releveId, type: "materiau", etage_id: ctx.e1, piece_id: ctx.sejour, plan_id: plans.projete,
    donnees: { libelle: "Marbre", categorie: "sol", unite: "m2", pertePourcent: 0, revetement: "parquet", application: { mode: "murs", murIds: [] } } });
  expect(direct.error?.code).toBe("22023");
  await signIn(page, EMAIL_B);
  await page.goto(metreUrl());
  await expect(page.locator("main")).not.toContainText("Calcul du métré…", { timeout: 30_000 });
  await expect(page.getByTestId("metre-vue")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Séjour");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tablette — Chromium en émulation tactile (MOBILE EMULATED ONLY)
// ─────────────────────────────────────────────────────────────────────────────
const TABLET: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };

test("Tablette 820×1180 : métré consultable (cartes, aucun débordement), ajuster et ajouter au doigt, coter au doigt", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(TABLET);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(metreUrl());
    await page.getByTestId("metre-etat-projete").tap();
    await expect(page.getByTestId("metre-total-sol")).toHaveText("21,66 m²");
    expect(await sansDebordement(page)).toBe(true);
    const sejour = card(page, ctx.sejour);
    await sejour.locator("summary").tap();
    await expect(sejour.getByTestId("metre-grandeurs")).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    // Cibles tactiles ≥ 40 px.
    for (const target of [sejour.locator("summary"), sejour.getByTestId("metre-ajuster-volume"), page.getByTestId("metre-export-csv")]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    }
    await sejour.getByTestId("metre-ajuster-volume").tap();
    await sejour.getByTestId("metre-ajustement-valeur").fill("29");
    await sejour.getByTestId("metre-ajustement-raison").fill("Faux plafond partiel");
    await sejour.getByTestId("metre-ajustement-valider").tap();
    await expect(valeur(sejour, "volume")).toContainText("29,00 m³ · calculé 29,24 m³");
    await sejour.getByTestId("metre-revetement-ajouter").tap();
    await sejour.getByTestId("metre-revetement-support").selectOption("plafond");
    await sejour.getByTestId("metre-revetement-famille").selectOption("ba13");
    await sejour.getByTestId("metre-revetement-etat").selectOption("nouveau");
    await sejour.getByTestId("metre-revetement-enregistrer").tap();
    await expect(sejour.locator('[data-testid="metre-revetement"][data-famille="ba13"]')).toContainText("Nouveau");
    await expect(sejour.locator('[data-testid="metre-revetement"][data-famille="ba13"] [data-testid="metre-revetement-quantite"]')).toContainText("10,83 m²");
    expect(await sansDebordement(page)).toBe(true);
    // Coter au doigt sur le plan projeté.
    await page.goto(planUrl(ctx.e1, plans.projete));
    await expect(page.getByTestId("plan-compteurs")).toContainText("5 mur(s)");
    await page.getByRole("checkbox", { name: "Accrochage" }).tap();
    await tool(page, "Cote", true);
    const a = await at(page, { x: 3600, y: 1000 }); const b = await at(page, { x: 3600, y: 3000 });
    await page.touchscreen.tap(a.x, a.y);
    await page.touchscreen.tap(b.x, b.y);
    await expect(message(page)).toHaveText(/^Cote de (1,99|2,0\d) m posée\.$/);
    await saved(page);
    const { data } = must(await ctx.a.from("tools_releves_elements").select("piece_id, donnees").eq("plan_id", plans.projete).eq("type", "mesure").is("deleted_at", null));
    expect((data as { piece_id: string }[]).some((row) => row.piece_id === ctx.chambre)).toBe(true);
    expect(await sansDebordement(page)).toBe(true);
    await context.close();
  } finally {
    await browser.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Performances : 50 / 200 / 500 pièces avec métré (murs, ouvertures, revêtements)
// ─────────────────────────────────────────────────────────────────────────────
for (const count of [50, 200, 500]) {
  test(`Performance ${count} pièces : calcul serveur, recalcul après édition, affichage, édition, export`, async ({ page }) => {
    const etageId = uuid();
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: `Perf ${count}`, niveau: count === 50 ? 3 : count === 200 ? 4 : 5, type_niveau: "etage", ordre: 10 + count, hauteur_sous_plafond_mm: 2500 }));
    const cols = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count / cols); const step = 3000;
    const h = (r: number, c: number) => `h${r}-${c}`; const v = (c: number, r: number) => `v${c}-${r}`;
    const idOf: Record<string, string> = {};
    const murs: Wall[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) { idOf[h(r, c)] = uuid(); murs.push(wall(idOf[h(r, c)], c * step, r * step, (c + 1) * step, r * step)); }
    for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) { idOf[v(c, r)] = uuid(); murs.push(wall(idOf[v(c, r)], c * step, r * step, c * step, (r + 1) * step)); }
    const pieces: { id: string; releve_id: string; etage_id: string; nom: string; usage: string; ordre: number }[] = [];
    const contours: unknown[] = [];
    const ouvertures: ReturnType<typeof ouv>[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols); const c = i % cols; const id = uuid();
      pieces.push({ id, releve_id: ctx.releveId, etage_id: etageId, nom: `Pièce ${i + 1}`, usage: "bureau", ordre: i });
      contours.push({ pieceId: id, points: rect(c * step + 100, r * step + 100, (c + 1) * step - 100, (r + 1) * step - 100), murIds: [idOf[h(r, c)], idOf[v(c + 1, r)], idOf[h(r + 1, c)], idOf[v(c, r)]], graine: { x: c * step + 1500, y: r * step + 1500 } });
      ouvertures.push(ouv(uuid(), idOf[h(r, c)], "porte", 1000, 900, 2100, 0), ouv(uuid(), idOf[v(c, r)], "fenetre", 900, 1200, 1000, 1000));
    }
    must(await ctx.a.from("tools_releves_pieces").insert(pieces));
    let t = Date.now();
    const planId = await seedPlan(etageId, { murs, ouvertures, contours });
    const seedMs = Date.now() - t;
    // Deux revêtements par pièce (écriture directe, contrôlée par la garde de ligne).
    const revs = pieces.flatMap((piece) => [
      { releve_id: ctx.releveId, type: "materiau", etage_id: etageId, piece_id: piece.id, plan_id: planId, donnees: { libelle: "Carrelage", categorie: "sol", unite: "m2", pertePourcent: 10, revetement: "carrelage", application: { mode: "tous" } } },
      { releve_id: ctx.releveId, type: "materiau", etage_id: etageId, piece_id: piece.id, plan_id: planId, donnees: { libelle: "Peinture", categorie: "mur", unite: "m2", pertePourcent: 5, revetement: "peinture", application: { mode: "tous" } } },
    ]);
    for (let i = 0; i < revs.length; i += 500) must(await ctx.a.from("tools_releves_elements").insert(revs.slice(i, i + 500)));
    // Calcul serveur (RPC) puis recalcul après une édition (fenêtre élargie).
    t = Date.now();
    const first = await metre(planId);
    const calculMs = Date.now() - t;
    expect(first.pieces).toHaveLength(count);
    expect(first.pieces[0].surfaceSolNetteMm2).toBe(2800 * 2800);
    const window0 = ouvertures[1];
    must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: await revision(planId), p_modifications: { ouvertures: [{ ...window0, donnees: { ...window0.donnees, largeurMm: 1400 } }] } }));
    t = Date.now();
    const second = await metre(planId);
    const recalculMs = Date.now() - t;
    expect(second.pieces[0].surfaceMursNetteMm2).toBe(first.pieces[0].surfaceMursNetteMm2! - 200 * 1000);
    // Affichage de la vue Métré (tous les étages, dont celui-ci).
    await signIn(page, EMAIL_A);
    t = Date.now();
    await page.goto(metreUrl());
    await expect(page.locator(`[data-testid="metre-etage"][data-id="${etageId}"]`)).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - t;
    const serverMs = Number(await page.getByTestId("metre-vue").getAttribute("data-calcul-ms"));
    // Édition : ajustement d'une pièce → relecture du plan → valeur affichée.
    const target = pieces[count - 1].id;
    await card(page, target).locator("summary").scrollIntoViewIfNeeded();
    await card(page, target).locator("summary").click();
    await card(page, target).getByTestId("metre-ajuster-surface_sol").click();
    await card(page, target).getByTestId("metre-ajustement-valeur").fill("7,5");
    await card(page, target).getByTestId("metre-ajustement-raison").fill("Mesure de contrôle");
    t = Date.now();
    await card(page, target).getByTestId("metre-ajustement-valider").click();
    await expect(valeur(card(page, target), "surface_sol")).toContainText("7,50 m²", { timeout: 60_000 });
    const editMs = Date.now() - t;
    t = Date.now();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("metre-export-csv").click()]);
    const csv = readFileSync((await download.path())!, "utf8");
    const exportMs = Date.now() - t;
    expect(csv.split("\r\n").filter((line) => line.includes(`;Perf ${count};`)).length).toBeGreaterThanOrEqual(count * 10);
    perf[`pieces_${count}`] = { murs: murs.length, ouvertures: ouvertures.length, revetements: revs.length, seedMs, calculMs, recalculMs, renderMs, serverMs, editMs, exportMs };
    expect(calculMs).toBeLessThan(15_000);
    expect(editMs).toBeLessThan(30_000);
  });
}
