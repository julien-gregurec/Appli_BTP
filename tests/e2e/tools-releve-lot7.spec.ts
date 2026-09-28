import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 7 : mobilier, équipements & calques, sur pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS), Tools en `next dev`.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot7.spec.ts --project=desktop-chromium
 *
 * Tablette : Chromium en émulation (viewport, `isMobile`, tactile) — MOBILE EMULATED ONLY. Glisser
 * et tourner au doigt : évènements tactiles CDP. Mesures de performance : RELEVE_E2E_PERF_OUT.
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
const dir = join(tmpdir(), `releve-lot7-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const SHOTS = process.env.RELEVE_E2E_SHOTS ?? dir;
const perf: Record<string, unknown> = {};

type Pt = { x: number; y: number };
type Wall = { id: string; pieceId: null; donnees: { a: Pt; b: Pt; epaisseurMm: number; hauteurMm: number | null; typeMur: string } };
type Ctx = { a: SupabaseClient; b: SupabaseClient; releveId: string; batimentId: string; e1: string; e3: string; sdb: string; bureau: string };
let ctx: Ctx;
const walls: Record<string, string> = {};
const plans: Record<string, string> = {};
const ids: Record<string, string> = {};

const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };
const wall = (id: string, ax: number, ay: number, bx: number, by: number, epaisseurMm = 200, typeMur = "porteur"): Wall =>
  ({ id, pieceId: null, donnees: { a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm, hauteurMm: 2500, typeMur } });
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
async function revision(planId: string) {
  const { data } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  return (data as { revision: number }).revision;
}
type Row = { id: string; type: string; piece_id: string | null; deleted_at: string | null; donnees: Record<string, unknown> & { position?: Pt; a?: Pt; b?: Pt } };
async function objets(planId: string, withDeleted = false) {
  let query = ctx.a.from("tools_releves_elements").select("id,type,piece_id,deleted_at,donnees").eq("plan_id", planId).eq("type", "equipement");
  if (!withDeleted) query = query.is("deleted_at", null);
  const { data } = must(await query);
  return data as Row[];
}
const objetOf = async (planId: string, objet: string) => (await objets(planId)).filter((row) => row.donnees.objet === objet);
async function murOf(planId: string, id: string) {
  const { data } = must(await ctx.a.from("tools_releves_elements").select("donnees").eq("id", id).single());
  return (data as { donnees: { a: Pt; b: Pt } }).donnees;
}

const planUrl = (etageId: string) => `${BASE}/releves/plan?id=${ctx.releveId}&etage=${etageId}`;
const canvas = (page: Page) => page.getByRole("application", { name: /^Plan / });
const saveStatus = (page: Page) => page.getByRole("status", { name: "État de sauvegarde — plan" });
const saved = (page: Page) => expect(saveStatus(page)).toHaveText(/Enregistré/, { timeout: 30_000 });
const message = (page: Page) => page.getByTestId("plan-message");
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function tool(page: Page, name: "Sélection" | "Mur" | "Objet" | "Pièce", touch = false) {
  const button = page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name, exact: true });
  if (touch) await button.tap(); else await button.click();
  await canvas(page).evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
}
/** Point du plan (mm, repère étage) → point de la page, via la transformation monde de la toile. */
async function at(page: Page, p: Pt): Promise<Pt & { pxPerMm: number }> {
  await canvas(page).evaluate((element) => { const r = element.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) element.scrollIntoView({ block: "center", behavior: "instant" }); });
  const matrix = await page.getByTestId("plan-monde").getAttribute("transform");
  const [a, b, c, d, e, f] = matrix!.replace(/^matrix\(|\)$/g, "").split(/[ ,]+/).map(Number);
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + a * p.x + c * p.y + e, y: box.y + b * p.x + d * p.y + f, pxPerMm: Math.hypot(a, b) };
}
async function drag(page: Page, from: Pt, to: Pt, steps = 10) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= steps; step++) await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
  await page.mouse.up();
}
async function handleOf(page: Page, name: "rotation" | "taille") {
  const box = (await page.locator(`[data-testid="plan-objet-poignee"][data-handle="${name}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function field(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).fill(value);
  await page.getByTestId(testId).press("Enter");
}
async function pose(page: Page, groupe: string, objet: string, p: Pt, expected: RegExp) {
  await page.getByTestId(`plan-groupe-${groupe}`).click();
  await page.getByTestId(`plan-objet-${objet}`).click();
  const target = await at(page, p);
  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId("plan-objet-apercu")).toBeVisible();
  await page.mouse.click(target.x, target.y);
  await expect(message(page)).toHaveText(expected);
}
async function seedPlan(etageId: string, murs: Wall[], extra: Record<string, unknown> = {}) {
  const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
  const planId = (plan as { id: string }).id;
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: 1, p_modifications: { murs, ...extra } }));
  return planId;
}

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const keys = { releveId: uuid(), batimentId: uuid(), e1: uuid(), e3: uuid(), sdb: uuid(), bureau: uuid() };
  must(await a.from("tools_releves").insert({ id: keys.releveId, entreprise_id: tenantA, nom: `Relevé Lot 7 ${suffix}`, chantier_nom: "Maison Lot 7" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", keys.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: keys.releveId, nom: "Maison Lot 7" }));
  must(await a.from("tools_releves_batiments").insert({ id: keys.batimentId, releve_id: keys.releveId, chantier_id: chantierId, nom: "Maison" }));
  must(await a.from("tools_releves_etages").insert([
    { id: keys.e1, releve_id: keys.releveId, batiment_id: keys.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: keys.e3, releve_id: keys.releveId, batiment_id: keys.batimentId, nom: "Combles", niveau: 1, type_niveau: "etage", ordre: 1, hauteur_sous_plafond_mm: 2500 },
  ]));
  must(await a.from("tools_releves_pieces").insert([
    { id: keys.sdb, releve_id: keys.releveId, etage_id: keys.e1, nom: "Salle d'eau", usage: "salle_de_bain", ordre: 0 },
    { id: keys.bureau, releve_id: keys.releveId, etage_id: keys.e1, nom: "Bureau", usage: "bureau", ordre: 1 },
  ]));
  ctx = { a, b, ...keys };
  // RDC : maison 6 × 4 m (murs de 20 cm) + cloison x = 3000 (10 cm) ; deux pièces associées.
  for (const key of ["s", "e", "n", "w", "c"]) walls[key] = uuid();
  plans.e1 = await seedPlan(keys.e1, [
    wall(walls.s, 0, 0, 6000, 0, 200, "exterieur"), wall(walls.e, 6000, 0, 6000, 4000, 200, "exterieur"),
    wall(walls.n, 6000, 4000, 0, 4000, 200, "exterieur"), wall(walls.w, 0, 4000, 0, 0, 200, "exterieur"),
    wall(walls.c, 3000, 0, 3000, 4000, 100, "cloison"),
  ], { contours: [
    { pieceId: keys.sdb, points: rect(100, 100, 2950, 3900), murIds: [walls.s, walls.c, walls.n, walls.w], graine: { x: 1500, y: 2000 } },
    { pieceId: keys.bureau, points: rect(3050, 100, 5900, 3900), murIds: [walls.s, walls.e, walls.n, walls.c], graine: { x: 4500, y: 2000 } },
  ] });
  plans.e3 = await seedPlan(keys.e3, [wall(uuid(), 0, 0, 5000, 0), wall(uuid(), 5000, 0, 5000, 3500), wall(uuid(), 5000, 3500, 0, 3500), wall(uuid(), 0, 3500, 0, 0)]);
});

test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// ─────────────────────────────────────────────────────────────────────────────
test("Palette et pose : objet libre, objet mural accroché et lié à la face du mur, objet dans l'angle ; pièce automatique", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await expect(page.getByTestId("plan-compteurs")).toContainText("5 mur(s) · 0 ouverture(s) · 0 objet(s) · 2 pièce(s)");
  await tool(page, "Objet");
  const groupes = page.getByRole("toolbar", { name: "Groupes d'objets" }).getByRole("button");
  await expect(groupes).toHaveText(["Mobilier", "Sanitaire", "Cuisine", "Électricité", "CVC", "Plomberie", "Sécurité", "Rangement", "Technique", "Autre", "Éclairage"]);
  await page.getByTestId("plan-groupe-mobilier").click();
  await expect(page.getByRole("toolbar", { name: "Objets", exact: true }).getByRole("button")).toHaveText(["Bureau", "Chaise", "Table", "Armoire", "Étagère", "Lit", "Canapé", "Meuble"]);
  await page.getByTestId("plan-groupe-sanitaire").click();
  await expect(page.getByRole("toolbar", { name: "Objets", exact: true }).getByRole("button")).toContainText(["WC", "Lavabo", "Douche", "Baignoire", "Urinoir"]);
  await page.getByTestId("plan-groupe-cuisine").click();
  await expect(page.getByRole("toolbar", { name: "Objets", exact: true }).getByRole("button")).toHaveText(["Évier", "Meuble bas", "Meuble haut", "Plan de travail", "Réfrigérateur", "Four", "Plaque de cuisson"]);

  await pose(page, "mobilier", "bureau", { x: 4500, y: 2000 }, /^Bureau posé/);
  // Radiateur près de la face intérieure du mur sud : accroché, dos au mur, lié.
  await page.getByTestId("plan-groupe-cvc").click();
  await page.getByTestId("plan-objet-radiateur").click();
  const near = await at(page, { x: 1500, y: 175 });
  await page.mouse.move(near.x, near.y);
  await expect(page.getByTestId("plan-objet-apercu")).toHaveAttribute("data-kind", "face");
  await page.mouse.click(near.x, near.y);
  await expect(message(page)).toHaveText("Radiateur posé contre le mur (lié).");
  // WC dans l'angle sud-ouest de la salle d'eau.
  await pose(page, "sanitaire", "wc", { x: 310, y: 435 }, /^WC posé dans l'angle contre le mur \(lié\)\.$/);
  await expect(page.getByTestId("plan-compteurs")).toContainText("3 objet(s)");
  await saved(page);
  const rows = await objets(plans.e1);
  expect(rows).toHaveLength(3);
  const by = (objet: string) => rows.find((row) => row.donnees.objet === objet)!;
  expect(by("bureau")).toMatchObject({ piece_id: ctx.bureau, donnees: { categorie: "mobilier", largeurMm: 1400, profondeurMm: 700, visible: true, verrouille: false, pieceAuto: true } });
  expect(by("radiateur")).toMatchObject({ piece_id: ctx.sdb, donnees: { murId: walls.s, face: "gauche", niveauMm: 150, rotationRad: 0 } });
  expect(by("radiateur").donnees.position!.y).toBe(150);
  expect(by("wc")).toMatchObject({ piece_id: ctx.sdb, donnees: { position: { x: 290, y: 425 }, categorie: "sanitaire" } });
  ids.bureau = by("bureau").id; ids.radiateur = by("radiateur").id; ids.wc = by("wc").id;
  await canvas(page).screenshot({ path: join(SHOTS, "lot7-pose.png") });
});

test("Édition à la souris et au panneau : déplacer, tourner, redimensionner, attributs, dupliquer, masquer, verrouiller", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await tool(page, "Sélection");
  let centre = await at(page, { x: 4500, y: 2000 });
  await page.mouse.click(centre.x, centre.y);
  await expect(page.getByTestId("plan-objet-panel")).toBeVisible();
  // Redimensionner par la poignée d'angle : +30 cm de largeur (coin opposé fixe).
  const grip = await handleOf(page, "taille");
  await drag(page, grip, { x: grip.x + 300 * centre.pxPerMm, y: grip.y });
  await saved(page);
  let row = (await objets(plans.e1)).find((item) => item.id === ids.bureau)!;
  expect(Math.abs(Number(row.donnees.largeurMm) - 1700)).toBeLessThan(25);
  expect(Math.abs(row.donnees.position!.x - 4650)).toBeLessThan(15);
  // Déplacer le corps : +50 cm vers le haut du plan (y +500).
  centre = await at(page, row.donnees.position!);
  await drag(page, centre, { x: centre.x, y: centre.y - 500 * centre.pxPerMm });
  await saved(page);
  row = (await objets(plans.e1)).find((item) => item.id === ids.bureau)!;
  expect(Math.abs(row.donnees.position!.y - 2500)).toBeLessThan(30);
  // Tourner par la poignée : un quart de tour (le pointeur passe à gauche de l'objet).
  const rot = await handleOf(page, "rotation");
  const c = await at(page, row.donnees.position!);
  const radius = Math.hypot(rot.x - c.x, rot.y - c.y);
  await drag(page, rot, { x: c.x - radius, y: c.y }, 12);
  await saved(page);
  row = (await objets(plans.e1)).find((item) => item.id === ids.bureau)!;
  expect(Number(row.donnees.rotationRad)).toBeCloseTo(Math.PI / 2, 2);
  // Panneau : dimensions, niveau, libellé, commentaire, rotation saisie.
  await field(page, "plan-objet-largeur", "150");
  await saved(page);
  await field(page, "plan-objet-niveau", "0");
  await page.getByTestId("plan-objet-libelle").fill("Bureau direction");
  await page.getByTestId("plan-objet-libelle").press("Tab");
  await page.getByTestId("plan-objet-commentaire").fill("Bois massif, à conserver");
  await page.getByTestId("plan-objet-commentaire").press("Tab");
  await field(page, "plan-objet-rotation", "0");
  await saved(page);
  row = (await objets(plans.e1)).find((item) => item.id === ids.bureau)!;
  expect(row.donnees).toMatchObject({ largeurMm: 1500, niveauMm: 0, libelle: "Bureau direction", commentaire: "Bois massif, à conserver", rotationRad: 0 });
  // Dupliquer, masquer la copie.
  await page.getByTestId("plan-objet-dupliquer").click();
  await expect(page.getByTestId("plan-compteurs")).toContainText("4 objet(s)");
  await page.getByTestId("plan-objet-visible").click();
  await saved(page);
  const copies = (await objetOf(plans.e1, "bureau")).filter((item) => item.id !== ids.bureau);
  expect(copies).toHaveLength(1);
  expect(copies[0].donnees).toMatchObject({ visible: false, libelle: "Bureau direction" });
  await expect(page.locator(`[data-testid="plan-objet"][data-id="${copies[0].id}"]`)).toHaveCount(0);
  ids.copie = copies[0].id;
  // Verrouiller le bureau : glisser ne le déplace pas, le panneau est en lecture seule.
  await page.keyboard.press("Escape");
  centre = await at(page, row.donnees.position!);
  await page.mouse.click(centre.x, centre.y);
  await page.getByTestId("plan-objet-verrou").click();
  await expect(page.getByTestId("plan-objet-largeur")).toBeDisabled();
  await drag(page, centre, { x: centre.x + 80, y: centre.y });
  await saved(page);
  row = (await objets(plans.e1)).find((item) => item.id === ids.bureau)!;
  expect(row.donnees).toMatchObject({ verrouille: true, position: { x: row.donnees.position!.x, y: row.donnees.position!.y } });
  expect(Math.abs(row.donnees.position!.x - 4650)).toBeLessThan(15);
  const server = await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.e1, p_revision: await revision(plans.e1), p_modifications: { supprimes: [ids.bureau] } });
  expect(server.error?.message).toBe("Objet verrouillé : déverrouillez-le d'abord.");
  await page.getByTestId("plan-objet-verrou").click();
  await saved(page);
  expect((await objets(plans.e1)).find((item) => item.id === ids.bureau)!.donnees.verrouille).toBe(false);
});

test("Objet lié au mur : il suit le mur déplacé ; détacher ; pièce choisie à la main", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await tool(page, "Sélection");
  const origin = (await objets(plans.e1)).find((row) => row.id === ids.radiateur)!;
  // Glisser le mur sud de 30 cm vers le haut : le radiateur suit (dos contre la face).
  let p = await at(page, { x: 4000, y: 0 });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("plan-wall-panel")).toBeVisible();
  p = await at(page, { x: 4000, y: 0 });
  await drag(page, p, { x: p.x, y: p.y - 300 * p.pxPerMm }, 8);
  await saved(page);
  const mur = await murOf(plans.e1, walls.s);
  expect(mur.a.y).toBeGreaterThan(200);
  const radiateur = (await objets(plans.e1)).find((row) => row.id === ids.radiateur)!;
  expect(radiateur.donnees.position!.y).toBeCloseTo(mur.a.y + 150, 0);
  expect(radiateur.donnees).toMatchObject({ murId: walls.s, decalageMm: origin.donnees.decalageMm });
  expect(radiateur.donnees.position!.x).toBe(origin.donnees.position!.x);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await saved(page);
  expect((await objets(plans.e1)).find((row) => row.id === ids.radiateur)!.donnees.position).toEqual(origin.donnees.position);
  // Détacher du mur puis pièce manuelle.
  await page.keyboard.press("Escape");
  const r = await at(page, origin.donnees.position!);
  await page.mouse.click(r.x, r.y);
  await expect(page.getByTestId("plan-objet-liaison")).toContainText("Lié au mur");
  await page.getByRole("button", { name: "Détacher du mur" }).click();
  await expect(page.getByTestId("plan-objet-liaison")).toContainText("posez-le contre un mur");
  await page.getByTestId("plan-objet-piece").selectOption(ctx.bureau);
  await saved(page);
  expect((await objets(plans.e1)).find((row) => row.id === ids.radiateur)!).toMatchObject({ piece_id: ctx.bureau, donnees: { pieceAuto: false } });
  await page.getByTestId("plan-objet-piece").selectOption("");
  await saved(page);
  expect((await objets(plans.e1)).find((row) => row.id === ids.radiateur)!).toMatchObject({ piece_id: ctx.sdb, donnees: { pieceAuto: true } });
  expect((await objets(plans.e1)).find((row) => row.id === ids.radiateur)!.donnees.murId).toBeUndefined();
});

test("Calques : masquer, verrouiller ; mémorisés avec le plan", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await page.getByTestId("plan-calques-bouton").click();
  const panel = page.getByTestId("plan-calques");
  await expect(panel.locator('[data-testid^="plan-calque-"][data-visible]')).toHaveCount(9);
  await expect(page.locator('[data-testid="plan-objet"][data-calque="mobilier"]')).toHaveCount(1);
  await page.getByTestId("plan-calque-mobilier-visible").uncheck();
  await expect(page.locator('[data-testid="plan-objet"][data-calque="mobilier"]')).toHaveCount(0);
  await saved(page);
  const { data } = must(await ctx.a.from("tools_releves_plans").select("reglages").eq("id", plans.e1).single());
  expect((data as { reglages: { calques: Record<string, { visible: boolean }> } }).reglages.calques.mobilier.visible).toBe(false);
  await page.reload();
  await expect(page.getByTestId("plan-compteurs")).toContainText("4 objet(s)");
  await expect(page.locator('[data-testid="plan-objet"][data-calque="mobilier"]')).toHaveCount(0);
  await page.getByTestId("plan-calques-bouton").click();
  await page.getByTestId("plan-calque-mobilier-visible").check();
  // Verrouiller Sanitaire : le WC ne se sélectionne plus.
  await page.getByTestId("plan-calque-sanitaire-verrou").check();
  await tool(page, "Sélection");
  const wc = await at(page, { x: 290, y: 425 });
  await page.mouse.click(wc.x, wc.y);
  await expect(page.getByTestId("plan-objet-panel")).toHaveCount(0);
  await page.getByTestId("plan-calque-sanitaire-verrou").uncheck();
  await page.mouse.click(wc.x, wc.y);
  await expect(page.getByTestId("plan-objet-panel")).toBeVisible();
  // Structure verrouillée : un mur ne se sélectionne plus ; Cotations masquées.
  await page.keyboard.press("Escape");
  await page.getByTestId("plan-calque-structure-verrou").check();
  const south = await at(page, { x: 4000, y: 0 });
  await page.mouse.click(south.x, south.y);
  await expect(page.getByTestId("plan-wall-panel")).toHaveCount(0);
  await page.getByTestId("plan-calque-structure-verrou").uncheck();
  await page.getByTestId("plan-calque-cotations-visible").uncheck();
  await expect(page.locator('[data-testid="plan-cote"]')).toHaveCount(0);
  await page.getByTestId("plan-calque-cotations-visible").check();
  await expect(page.locator('[data-testid="plan-cote"]').first()).toBeVisible();
  await saved(page);
  await canvas(page).screenshot({ path: join(SHOTS, "lot7-calques.png") });
});

test("Groupes : tout masquer, tout supprimer (confirmation), corbeille et restauration", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await page.getByTestId("plan-calques-bouton").click();
  await page.getByTestId("plan-groupe-masquer-sanitaire").click();
  await saved(page);
  expect((await objets(plans.e1)).filter((row) => row.donnees.categorie === "sanitaire").every((row) => row.donnees.visible === false)).toBe(true);
  await page.getByTestId("plan-groupe-afficher-sanitaire").click();
  await saved(page);
  // Refus puis acceptation de la confirmation.
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByTestId("plan-groupe-supprimer-mobilier").click();
  await expect(page.getByTestId("plan-compteurs")).toContainText("4 objet(s)");
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("Supprimer les 2 objet(s) du groupe « Mobilier »"); void dialog.accept(); });
  await page.getByTestId("plan-groupe-supprimer-mobilier").click();
  await expect(page.getByTestId("plan-compteurs")).toContainText("2 objet(s)");
  await saved(page);
  const deleted = (await objets(plans.e1, true)).filter((row) => row.donnees.categorie === "mobilier");
  expect(deleted.map((row) => Boolean(row.deleted_at))).toEqual([true, true]);
  await expect(page.getByTestId("plan-corbeille").locator("li")).toHaveCount(2);
  // Corbeille relue du serveur après rechargement, puis tout restaurer.
  await page.reload();
  await page.getByTestId("plan-calques-bouton").click();
  await expect(page.getByTestId("plan-corbeille").locator("li")).toHaveCount(2);
  await page.getByTestId("plan-corbeille-tout").click();
  await expect(page.getByTestId("plan-compteurs")).toContainText("4 objet(s)");
  await saved(page);
  expect((await objets(plans.e1)).filter((row) => row.donnees.categorie === "mobilier")).toHaveLength(2);
  await expect(page.getByTestId("plan-corbeille")).toHaveCount(0);
});

test("Annuler / rétablir : ajout, rotation (touche R), suppression", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  const undoBtn = page.getByRole("button", { name: "Annuler", exact: true });
  const redoBtn = page.getByRole("button", { name: "Rétablir", exact: true });
  const count = async () => (await objets(plans.e1)).length;
  await tool(page, "Objet");
  await pose(page, "cuisine", "plaque", { x: 4500, y: 3400 }, /^Plaque de cuisson posé/);
  await saved(page); expect(await count()).toBe(5);
  await page.keyboard.press("Control+z"); await saved(page); expect(await count()).toBe(4);
  await redoBtn.click(); await saved(page); expect(await count()).toBe(5);
  const plaque = (await objetOf(plans.e1, "plaque"))[0];
  // Rotation clavier (R) puis annuler.
  await tool(page, "Sélection");
  const p = await at(page, plaque.donnees.position!);
  await page.mouse.click(p.x, p.y);
  await canvas(page).focus();
  await page.keyboard.press("r");
  await saved(page);
  expect(Number((await objetOf(plans.e1, "plaque"))[0].donnees.rotationRad)).toBeCloseTo(Math.PI / 2, 3);
  await undoBtn.click(); await saved(page);
  expect(Number((await objetOf(plans.e1, "plaque"))[0].donnees.rotationRad)).toBe(plaque.donnees.rotationRad);
  // Suppression puis annuler (restauration serveur).
  await page.getByTestId("plan-objet-supprimer").click();
  await saved(page); expect(await count()).toBe(4);
  await undoBtn.click(); await saved(page); expect(await count()).toBe(5);
  expect((await objetOf(plans.e1, "plaque"))[0].id).toBe(plaque.id);
});

test("Fiche pièce : équipements présents, compteur réel", async ({ page }) => {
  await signIn(page, EMAIL_A);
  const expected = (await objets(plans.e1)).filter((row) => row.piece_id === ctx.bureau);
  await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.bureau}`);
  const panel = page.getByTestId("piece-equipements");
  await expect(panel.getByTestId("piece-equipements-compteur")).toHaveText(String(expected.length));
  await expect(panel.getByTestId("piece-equipements-liste").locator("li")).toHaveCount(expected.length);
  await expect(panel.getByTestId("piece-equipements-groupes")).toContainText("Mobilier : 2");
  await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.sdb}`);
  const sdb = (await objets(plans.e1)).filter((row) => row.piece_id === ctx.sdb);
  await expect(page.getByTestId("piece-equipements-compteur")).toHaveText(String(sdb.length));
  await expect(page.getByTestId("piece-equipements-liste")).toContainText("WC");
});

test("Versioning : objets du plan figé immuables ; plan projeté (existant, à déposer, nouveau, déplacé) ; figé intact", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  const frozen = await objets(plans.e1);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Figer ce plan" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText(/figé/);
  await expect(page.getByTestId("plan-outil-objet")).toHaveCount(0);
  const refused = await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.e1, p_revision: await revision(plans.e1), p_modifications: {
    equipements: [{ id: frozen[0].id, pieceId: frozen[0].piece_id, donnees: { ...frozen[0].donnees, largeurMm: 500 } }] } });
  expect(refused.error?.code).toBe("42501");
  const direct = await ctx.a.from("tools_releves_elements").update({ donnees: { ...frozen[0].donnees, visible: false } }).eq("id", frozen[0].id);
  expect(direct.error?.code).toBe("42501");
  // Plan figé consultable : calques en affichage local.
  await page.getByRole("button", { name: "Nouveau plan projeté" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText(/Projet/);
  const { data: list } = must(await ctx.a.from("tools_releves_plans").select("id").eq("etage_id", ctx.e1).order("numero"));
  plans.projete = (list as Array<{ id: string }>)[1].id;
  const copies = await objets(plans.projete);
  expect(copies).toHaveLength(frozen.length);
  expect(copies.every((row) => frozen.some((f) => f.id === row.donnees.origineId))).toBe(true);
  // WC à déposer ; douche nouvelle ; bureau déplacé.
  await tool(page, "Sélection");
  const wcCopy = copies.find((row) => row.donnees.objet === "wc")!;
  let p = await at(page, wcCopy.donnees.position!);
  await page.mouse.click(p.x, p.y);
  await page.getByTestId("plan-objet-etat").selectOption("a_deposer");
  await expect(page.locator(`[data-testid="plan-objet"][data-id="${wcCopy.id}"]`)).toHaveAttribute("data-etat", "a_deposer");
  await page.keyboard.press("Escape");
  const bureauCopy = copies.find((row) => row.donnees.objet === "bureau" && row.donnees.visible === true)!;
  p = await at(page, bureauCopy.donnees.position!);
  await page.mouse.click(p.x, p.y);
  await page.getByTestId("plan-objet-etat").selectOption("deplace");
  p = await at(page, bureauCopy.donnees.position!);
  await drag(page, p, { x: p.x - 300 * p.pxPerMm, y: p.y });
  await tool(page, "Objet");
  await pose(page, "sanitaire", "douche", { x: 2400, y: 3300 }, /^Douche posé/);
  await tool(page, "Sélection");
  await page.getByTestId("plan-objet-etat").selectOption("nouveau");
  await saved(page);
  const projete = await objets(plans.projete);
  expect(projete.find((row) => row.id === wcCopy.id)!.donnees.etatProjet).toBe("a_deposer");
  expect(projete.find((row) => row.id === bureauCopy.id)!.donnees.etatProjet).toBe("deplace");
  expect(projete.find((row) => row.donnees.objet === "douche")!.donnees.etatProjet).toBe("nouveau");
  // Le plan figé n'a pas bougé d'une ligne.
  expect(await objets(plans.e1)).toEqual(frozen);
  await canvas(page).screenshot({ path: join(SHOTS, "lot7-projete.png") });
});

test("Export : SVG et DXF conservent les objets (calques, symboles), feuille A3 à l'échelle", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${planUrl(ctx.e1)}&plan=${plans.projete}`);
  await expect(page.getByTestId("plan-compteurs")).toContainText("5 mur(s)");
  const grab = async (name: string, file: string) => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
    await download.saveAs(join(dir, file));
    return readFileSync(join(dir, file), "utf8");
  };
  const svg = await grab("Exporter SVG", "plan.svg");
  for (const layer of ["MOBILIER", "SANITAIRE", "CUISINE", "TECHNIQUE"]) expect(svg).toContain(`<g id="${layer}"`);
  expect(svg).toContain(">Bureau direction</text>");
  expect((svg.match(/<circle /g) ?? []).length).toBeGreaterThanOrEqual(4); // feux de la plaque
  const dxf = await grab("Exporter DXF", "plan.dxf");
  expect(dxf.startsWith("0\nSECTION\n2\nHEADER\n")).toBe(true);
  for (const layer of ["MOBILIER", "SANITAIRE", "CUISINE", "TECHNIQUE"]) expect(dxf).toContain(`\n8\n${layer}\n`);
  expect(dxf).toContain("\nCIRCLE\n");
  const print = await grab("Feuille A3 (PDF)", "plan-a3.svg");
  expect(print).toContain('width="420mm" height="297mm"');
  expect(print).toMatch(/échelle 1:(20|50)/);
  writeFileSync(join(SHOTS, "lot7-export.svg"), svg);
});

test("Sécurité : un autre tenant ne lit, n'écrit ni ne restaure les objets", async () => {
  const { data } = await ctx.b.from("tools_releves_elements").select("id").eq("plan_id", plans.projete);
  expect(data ?? []).toHaveLength(0);
  const write = await ctx.b.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.projete, p_revision: 1, p_modifications: { equipements: [] } });
  expect(write.error?.code).toBe("42501");
  const trash = await ctx.b.rpc("tools_releve_plan_equipements_supprimes", { p_plan_id: plans.e1 });
  expect(trash.error?.code).toBe("42501");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tablette — Chromium en émulation tactile (MOBILE EMULATED ONLY)
// ─────────────────────────────────────────────────────────────────────────────
const TABLET: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
type Cdp = Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>;
async function touch(cdp: Cdp, type: "touchStart" | "touchMove" | "touchEnd", points: Pt[]) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
}
async function fingerDrag(cdp: Cdp, from: Pt, to: Pt, steps = 8) {
  await touch(cdp, "touchStart", [from]);
  for (let step = 1; step <= steps; step++) await touch(cdp, "touchMove", [{ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps }]);
  await touch(cdp, "touchEnd", []);
}

test("Tablette 820×1180 : ajouter, déplacer et tourner un objet au doigt", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(TABLET);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(planUrl(ctx.e3));
    await expect(page.getByTestId("plan-compteurs")).toContainText("4 mur(s)");
    await tool(page, "Objet", true);
    await page.getByTestId("plan-groupe-mobilier").tap();
    await page.getByTestId("plan-objet-lit").tap();
    const target = await at(page, { x: 2500, y: 1750 });
    await page.touchscreen.tap(target.x, target.y);
    await expect(message(page)).toHaveText(/^Lit posé/);
    await page.getByTestId("plan-groupe-cvc").tap();
    await page.getByTestId("plan-objet-radiateur").tap();
    const wallSide = await at(page, { x: 1200, y: 170 });
    await page.touchscreen.tap(wallSide.x, wallSide.y);
    await expect(message(page)).toHaveText("Radiateur posé contre le mur (lié).");
    await saved(page);
    const lit = (await objetOf(plans.e3, "lit"))[0];
    expect((await objetOf(plans.e3, "radiateur"))[0].donnees.face).toBe("gauche");
    // Sélection au toucher, glisser au doigt (+60 cm), tourner au doigt (poignée de rotation).
    await tool(page, "Sélection", true);
    let p = await at(page, lit.donnees.position!);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId("plan-objet-panel")).toBeVisible();
    await canvas(page).evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    p = await at(page, lit.donnees.position!);
    const cdp = await context.newCDPSession(page);
    await fingerDrag(cdp, p, { x: p.x + 600 * p.pxPerMm, y: p.y });
    await saved(page);
    const moved = (await objetOf(plans.e3, "lit"))[0].donnees;
    expect(Math.abs(moved.position!.x - lit.donnees.position!.x - 600)).toBeLessThan(60);
    const rot = await handleOf(page, "rotation");
    const c = await at(page, moved.position!);
    const radius = Math.hypot(rot.x - c.x, rot.y - c.y);
    await fingerDrag(cdp, rot, { x: c.x + radius, y: c.y }, 10);
    await cdp.detach();
    await saved(page);
    expect(Number((await objetOf(plans.e3, "lit"))[0].donnees.rotationRad)).toBeCloseTo(-Math.PI / 2, 2);
    // Boutons ≥ 44 px (palette, fiche objet), aucun débordement horizontal.
    await tool(page, "Objet", true);
    const heights = await page.getByTestId("plan-objets-palette").getByRole("button").evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: join(SHOTS, "lot7-tablette.png") });
    await context.close();
  } finally { await browser.close(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance : 50, 250, 500, 1000 objets sur un plan complexe (250 murs, L / T / X, 60 portes)
// ─────────────────────────────────────────────────────────────────────────────
async function frameStats(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = []; w.__stop = false;
    let last = performance.now();
    const tick = (now: number) => { w.__frames.push(now - last); last = now; if (!w.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const started = Date.now();
  await action();
  const total = Date.now() - started;
  const frames = await page.evaluate(() => { const w = window as unknown as { __frames: number[]; __stop: boolean }; w.__stop = true; return w.__frames.slice(1); });
  const sorted = [...frames].sort((x, y) => x - y);
  return { totalMs: total, frames: frames.length, p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), maxFrameMs: Math.round(sorted[sorted.length - 1] ?? 0) };
}

const KINDS: Array<[string, string, number, number]> = [
  ["bureau", "mobilier", 1400, 700], ["chaise", "mobilier", 450, 500], ["lit", "mobilier", 1400, 2000], ["wc", "sanitaire", 380, 650],
  ["lavabo", "sanitaire", 600, 450], ["meuble_bas", "cuisine", 600, 600], ["plaque", "cuisine", 600, 520], ["radiateur", "cvc", 1000, 100],
  ["prise", "electricite", 80, 40], ["extincteur", "securite", 250, 200],
];

for (const count of [50, 250, 500, 1000] as const) {
  test(`Performance : ${count} objets sur plan complexe (rendu, pan, zoom, déplacement, sauvegarde)`, async ({ page }) => {
    const etageId = uuid();
    const index = [50, 250, 500, 1000].indexOf(count);
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: `Perf ${count}`, niveau: 2 + index, type_niveau: "etage", ordre: 2 + index }));
    const columns = 12;
    const murs: Wall[] = [];
    for (let k = 0; murs.length < 250; k++) {
      const x = (k % columns) * 3000; const y = Math.floor(k / columns) * 3000;
      murs.push(wall(uuid(), x, y, x + 3000, y));
      if (murs.length < 250) murs.push(wall(uuid(), x, y, x, y + 3000, 100, "cloison"));
    }
    const ouvertures = murs.slice(0, 60).map((m) => ({ id: uuid(), murId: m.id,
      donnees: { decalageMm: 1085, largeurMm: 830, hauteurMm: 2040, allegeMm: null, typeOuverture: "porte", sens: "gauche", vantaux: 1, poussee: "tirant", modele: "battant" } }));
    const cells = Math.ceil(murs.length / 2);
    const equipements = Array.from({ length: count }, (_, i) => {
      const [objet, categorie, largeurMm, profondeurMm] = KINDS[i % KINDS.length];
      const cell = i % cells; const slot = Math.floor(i / cells);
      const x = (cell % columns) * 3000 + 700 + (slot % 3) * 800; const y = Math.floor(cell / columns) * 3000 + 700 + Math.floor(slot / 3) * 800;
      return { id: uuid(), pieceId: null, donnees: { categorie, objet, libelle: `${objet} ${i}`, position: { x, y }, rotationRad: 0, largeurMm: Math.min(largeurMm, 700),
        profondeurMm: Math.min(profondeurMm, 700), hauteurMm: null, niveauMm: 0, visible: true, verrouille: false, pieceAuto: true } };
    });
    const t0 = Date.now();
    const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
    const planId = (plan as { id: string }).id;
    must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: 1, p_modifications: { murs, ouvertures, equipements } }));
    const bulkSaveMs = Date.now() - t0;

    await signIn(page, EMAIL_A);
    const renderStarted = Date.now();
    await page.goto(planUrl(etageId));
    await expect(page.getByTestId("plan-compteurs")).toContainText(`250 mur(s) · 60 ouverture(s) · ${count} objet(s)`, { timeout: 60_000 });
    await expect(page.locator('[data-testid="plan-objet"]')).toHaveCount(count);
    const renderMs = Date.now() - renderStarted;

    const box = (await canvas(page).boundingBox())!;
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const pan = await frameStats(page, async () => {
      await page.mouse.move(c.x, c.y); await page.mouse.down();
      for (let step = 1; step <= 20; step++) await page.mouse.move(c.x + step * 10, c.y + step * 5);
      await page.mouse.up();
    });
    const zoom = await frameStats(page, async () => {
      for (let step = 0; step < 10; step++) { await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, step < 5 ? -120 : 120); }
    });
    await page.getByRole("button", { name: "Recentrer" }).click();
    // Déplacer un objet à la souris : mesure du glisser (trames) et de la sauvegarde.
    await tool(page, "Sélection");
    const target = equipements[Math.floor(count / 2)];
    const p = await at(page, target.donnees.position);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId("plan-objet-panel")).toBeVisible();
    const selectedId = await page.locator('[data-testid="plan-objet"][data-selected="true"]').getAttribute("data-id");
    const q = await at(page, equipements.find((item) => item.id === selectedId)!.donnees.position);
    const move = await frameStats(page, async () => drag(page, q, { x: q.x + 40, y: q.y + 20 }, 12));
    const saveStarted = Date.now();
    await saved(page);
    const autosaveMs = Date.now() - saveStarted;
    const { data: row } = must(await ctx.a.from("tools_releves_elements").select("donnees").eq("id", selectedId).single());
    expect((row as { donnees: { position: Pt } }).donnees.position).not.toEqual(equipements.find((item) => item.id === selectedId)!.donnees.position);
    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    perf[`objets_${count}`] = { murs: 250, ouvertures: 60, bulkSaveMs, renderMs, pan, zoom, move, autosaveMs, heapMb: Math.round(heap / 1e6) };
    expect(renderMs).toBeLessThan(30_000);
    expect(pan.p95FrameMs).toBeLessThan(250);
    expect(move.p95FrameMs).toBeLessThan(500);
  });
}
