import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 6 : ouvertures, jonctions & géométrie bâtiment, sur pile
 * RÉELLE (GoTrue + PostgREST + PostgreSQL avec la vraie RLS), Tools en `next dev`.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot6.spec.ts --project=desktop-chromium
 *
 * Tablette : Chromium en émulation (viewport, `isMobile`, tactile) — MOBILE EMULATED ONLY. Glisser
 * au doigt : évènements tactiles CDP. Mesures de performance : RELEVE_E2E_PERF_OUT.
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
const dir = join(tmpdir(), `releve-lot6-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const SHOTS = process.env.RELEVE_E2E_SHOTS ?? dir;
const perf: Record<string, unknown> = {};

type Wall = { id: string; pieceId: null; donnees: { a: { x: number; y: number }; b: { x: number; y: number }; epaisseurMm: number; hauteurMm: number | null; typeMur: string } };
type Ctx = { a: SupabaseClient; b: SupabaseClient; tenantA: string; releveId: string; batimentId: string; e1: string; e2: string; e3: string; sejourId: string };
let ctx: Ctx;
const walls: Record<string, string> = {};
const plans: Record<string, string> = {};

const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };
const wall = (id: string, ax: number, ay: number, bx: number, by: number, epaisseurMm = 200, typeMur = "porteur"): Wall =>
  ({ id, pieceId: null, donnees: { a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseurMm, hauteurMm: 2500, typeMur } });

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
async function seedPlan(etageId: string, murs: Wall[], ouvertures: unknown[] = []) {
  const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
  const planId = (plan as { id: string }).id;
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: 1, p_modifications: { murs, ouvertures } }));
  return planId;
}
type Row = { id: string; type: string; parent_element_id: string | null; donnees: Record<string, unknown> & { a?: { x: number; y: number }; b?: { x: number; y: number } } };
async function elements(planId: string) {
  const { data } = must(await ctx.a.from("tools_releves_elements").select("id,type,parent_element_id,donnees").eq("plan_id", planId).is("deleted_at", null));
  return data as Row[];
}
const openingsOf = async (planId: string) => (await elements(planId)).filter((x) => x.type === "ouverture");

const planUrl = (etageId: string) => `${BASE}/releves/plan?id=${ctx.releveId}&etage=${etageId}`;
const canvas = (page: Page) => page.getByRole("application", { name: /^Plan / });
const saveStatus = (page: Page) => page.getByRole("status", { name: "État de sauvegarde — plan" });
const saved = (page: Page) => expect(saveStatus(page)).toHaveText(/Enregistré/, { timeout: 20_000 });
const message = (page: Page) => page.getByTestId("plan-message");
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function tool(page: Page, name: "Sélection" | "Mur" | "Ouverture" | "Pièce", touch = false) {
  const button = page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name, exact: true });
  if (touch) await button.tap(); else await button.click();
  await canvas(page).evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
}
/** Point de l'axe d'un mur (fraction `t` de A vers B) en coordonnées page, lu sur le trait d'axe. */
async function onWall(page: Page, id: string, t: number) {
  const line = page.locator(`[data-testid="plan-mur"][data-id="${id}"]`);
  const [x1, y1, x2, y2] = await Promise.all(["x1", "y1", "x2", "y2"].map(async (k) => Number(await line.getAttribute(k))));
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + x1 + (x2 - x1) * t, y: box.y + y1 + (y2 - y1) * t, pxPerMm: Math.hypot(x2 - x1, y2 - y1) };
}
async function handle(page: Page, edge: "start" | "end" | "corps") {
  const node = page.locator(`[data-testid="plan-ouverture-poignee"][data-edge="${edge}"]`);
  const box = (await node.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function bbox(page: Page, murId: string) {
  return page.locator(`[data-testid="plan-mur-corps"][data-id="${murId}"]`).evaluateAll((nodes) => {
    const boxes = nodes.map((n) => (n as SVGGraphicsElement).getBBox());
    const minX = Math.min(...boxes.map((b) => b.x)); const minY = Math.min(...boxes.map((b) => b.y));
    return { minX, minY, width: Math.max(...boxes.map((b) => b.x + b.width)) - minX, height: Math.max(...boxes.map((b) => b.y + b.height)) - minY };
  });
}
async function field(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).fill(value);
  await page.getByTestId(testId).press("Enter");
}

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const ids = { releveId: uuid(), batimentId: uuid(), e1: uuid(), e2: uuid(), e3: uuid(), sejourId: uuid() };
  must(await a.from("tools_releves").insert({ id: ids.releveId, entreprise_id: tenantA, nom: `Relevé Lot 6 ${suffix}`, chantier_nom: "Maison Lot 6" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", ids.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: ids.releveId, nom: "Maison Lot 6" }));
  must(await a.from("tools_releves_batiments").insert({ id: ids.batimentId, releve_id: ids.releveId, chantier_id: chantierId, nom: "Maison" }));
  must(await a.from("tools_releves_etages").insert([
    { id: ids.e1, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: ids.e2, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "R+1", niveau: 1, type_niveau: "etage", ordre: 1, hauteur_sous_plafond_mm: 2500 },
    { id: ids.e3, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "Combles", niveau: 2, type_niveau: "etage", ordre: 2, hauteur_sous_plafond_mm: 2500 },
  ]));
  must(await a.from("tools_releves_pieces").insert({ id: ids.sejourId, releve_id: ids.releveId, etage_id: ids.e1, nom: "Séjour", usage: "sejour", ordre: 0 }));
  ctx = { a, b, tenantA, ...ids };
  // RDC : maison 6 × 4 m (murs de 20 cm), cloison en T (10 cm), mur de refend qui la croise (X), mur isolé.
  for (const key of ["s", "e", "n", "w", "c", "x", "f"]) walls[key] = uuid();
  plans.e1 = await seedPlan(ids.e1, [
    wall(walls.s, 0, 0, 6000, 0, 200, "exterieur"), wall(walls.e, 6000, 0, 6000, 4000, 200, "exterieur"),
    wall(walls.n, 6000, 4000, 0, 4000, 200, "exterieur"), wall(walls.w, 0, 4000, 0, 0, 200, "exterieur"),
    wall(walls.c, 3000, 0, 3000, 4000, 100, "cloison"), wall(walls.x, 2000, 2000, 4000, 2000, 100, "cloison"),
    wall(walls.f, 8000, 0, 12000, 0, 200, "porteur"),
  ]);
  // R+1 : relevé imprécis (extrémités presque jointes, about et dépassement approximatifs).
  plans.e2 = await seedPlan(ids.e2, [
    wall(uuid(), 0, 0, 6000, 0), wall(uuid(), 6012, 8, 6000, 4000), wall(uuid(), 6000, 4000, 0, 4000), wall(uuid(), 0, 4000, -9, 14),
    wall(uuid(), 3000, 25, 3000, 3000, 100, "cloison"), wall(uuid(), 1500, 4080, 1500, 2500, 100, "cloison"),
  ]);
  // Combles (tablette) : rectangle simple.
  plans.e3 = await seedPlan(ids.e3, [wall(uuid(), 0, 0, 5000, 0), wall(uuid(), 5000, 0, 5000, 3500), wall(uuid(), 5000, 3500, 0, 3500), wall(uuid(), 0, 3500, 0, 0)]);
});

test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// ─────────────────────────────────────────────────────────────────────────────
test("Géométrie bâtiment : épaisseur réelle, jonctions L / T / X sans chevauchement ni surépaisseur", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await expect(page.getByTestId("plan-compteurs")).toContainText("7 mur(s)");
  await expect(page.getByTestId("plan-jonctions")).toHaveText("Jonctions : 4 L · 2 T · 1 X");
  // Mur sud : largeur hors tout 6,20 m (onglets aux deux angles, pas de débord au-delà des faces).
  const s = await bbox(page, walls.s);
  const scale = s.width / 6200;
  expect(s.height / scale).toBeCloseTo(200, -1);
  // Cloison : elle s'arrête sur la face intérieure des murs sud et nord (3,80 m, about en T), sans
  // entrer dans leur épaisseur ; le mur de refend la croise (X) : ses parties restent jointives.
  const c = await bbox(page, walls.c);
  expect(Math.abs(c.height / scale - 3800)).toBeLessThan(6);
  expect(Math.abs(c.width / scale - 100)).toBeLessThan(6);
  // Mur isolé : bouts droits, exactement 4,00 m.
  expect(Math.abs((await bbox(page, walls.f)).width / scale - 4000)).toBeLessThan(6);
  // Sélection : nature des raccords affichée.
  await tool(page, "Sélection");
  const p = await onWall(page, walls.s, 0.2);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("plan-wall-jonctions")).toHaveText("Extrémité A : angle (L) · extrémité B : angle (L) · 1 mur(s) raccordé(s) en T / X");
  await page.keyboard.press("Escape");
  await canvas(page).screenshot({ path: join(SHOTS, "lot6-jonctions.png") });
});

test("Ouvertures au clic : palette, aperçu, pose sur le mur, mur interrompu, attributs enregistrés", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await tool(page, "Ouverture");
  const palette = page.getByRole("toolbar", { name: "Menuiseries" });
  await expect(palette.getByRole("button")).toHaveText(["Porte", "Porte double", "Porte coulissante", "Fenêtre", "Châssis fixe", "Porte-fenêtre", "Baie", "Ouverture libre"]);
  const place = async (kind: string, murId: string, t: number) => {
    await page.getByTestId(`plan-menuiserie-${kind}`).click();
    const at = await onWall(page, murId, t);
    await page.mouse.move(at.x, at.y);
    await expect(page.getByTestId("plan-ouverture-apercu")).toHaveAttribute("data-valid", "true");
    await page.mouse.click(at.x, at.y);
    await expect(message(page)).toContainText("posée sur le mur");
  };
  await place("porte", walls.s, 0.25);
  await expect(page.locator(`[data-testid="plan-mur-corps"][data-id="${walls.s}"]`)).toHaveCount(2);
  await place("porte_fenetre", walls.s, 0.75);
  await place("fenetre", walls.n, 0.25);
  await place("chassis_fixe", walls.n, 0.8);
  await place("baie", walls.e, 0.5);
  await place("porte_double", walls.w, 0.5);
  await place("ouverture_libre", walls.c, 0.25);
  await place("porte_coulissante", walls.c, 0.75);
  await expect(page.locator('[data-testid="plan-ouverture"]')).toHaveCount(8);
  await expect(page.locator(`[data-testid="plan-mur-corps"][data-id="${walls.s}"]`)).toHaveCount(3);
  await saved(page);
  const rows = await openingsOf(plans.e1);
  const on = (murId: string) => rows.filter((o) => o.parent_element_id === murId).map((o) => o.donnees);
  expect(rows).toHaveLength(8);
  expect(on(walls.s).map((d) => d.typeOuverture).sort()).toEqual(["porte", "porte_fenetre"]);
  expect(on(walls.w)[0]).toMatchObject({ typeOuverture: "porte", vantaux: 2, modele: "battant", largeurMm: 1400 });
  expect(on(walls.n).map((d) => d.modele).sort()).toEqual(["battant", "fixe"]);
  expect(on(walls.e)[0]).toMatchObject({ typeOuverture: "baie", modele: "coulissant" });
  expect(on(walls.c).map((d) => d.typeOuverture).sort()).toEqual(["passage", "porte"]);
  expect(on(walls.c).find((d) => d.typeOuverture === "porte")).toMatchObject({ sens: "coulissant", modele: "coulissant" });
  // Aucune ouverture sur une jonction : ni dans les angles (≥ 100 mm), ni au droit de la cloison.
  for (const d of on(walls.s)) {
    const from = Number(d.decalageMm); const to = from + Number(d.largeurMm);
    expect(from).toBeGreaterThanOrEqual(100); expect(to).toBeLessThanOrEqual(5900);
    expect(to <= 2950 || from >= 3050).toBe(true);
  }
  await canvas(page).screenshot({ path: join(SHOTS, "lot6-ouvertures.png") });
});

test("Validations : chevauchement, jonction, plus large que le mur, hauteur incohérente, pas de place (UI et serveur)", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  // Baie de 2,40 m sur la cloison : 1,85 m libres de chaque côté du refend → refus motivé.
  await tool(page, "Ouverture");
  await page.getByTestId("plan-menuiserie-baie").click();
  const on = await onWall(page, walls.c, 0.4);
  await page.mouse.click(on.x, on.y);
  await expect(message(page)).toHaveText(/Pas de place libre/);
  await expect(page.locator('[data-testid="plan-ouverture"]')).toHaveCount(8);
  // Porte du mur sud : sélection (clic dans la baie).
  const before = (await openingsOf(plans.e1)).find((o) => o.parent_element_id === walls.s && o.donnees.typeOuverture === "porte")!;
  await tool(page, "Sélection");
  const centre = (Number(before.donnees.decalageMm) + Number(before.donnees.largeurMm) / 2) / 6000;
  const door = await onWall(page, walls.s, centre);
  await page.mouse.click(door.x, door.y);
  await expect(page.getByTestId("plan-opening-panel")).toBeVisible();
  await field(page, "plan-ouverture-position", "250");
  await expect(message(page)).toHaveText(/jonction de murs/);
  await field(page, "plan-ouverture-position", "400");
  await expect(message(page)).toHaveText(/chevauchent/);
  await field(page, "plan-ouverture-largeur", "700");
  await expect(message(page)).toHaveText(/plus large que son mur/);
  await field(page, "plan-ouverture-hauteur", "260");
  await expect(message(page)).toHaveText(/Hauteur incohérente/);
  expect((await openingsOf(plans.e1)).find((o) => o.id === before.id)!.donnees).toEqual(before.donnees);
  // Serveur : un chevauchement envoyé directement est refusé (22023), rien n'est écrit.
  const rev = await revision(plans.e1);
  const refused = await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.e1, p_revision: rev, p_modifications: { ouvertures: [{ id: uuid(), murId: walls.s,
    donnees: { ...before.donnees, decalageMm: Number(before.donnees.decalageMm) + 100 } }] } });
  expect(refused.error?.code).toBe("22023");
  expect(refused.error?.message).toBe("Deux ouvertures se chevauchent sur ce mur.");
  expect(await revision(plans.e1)).toBe(rev);
});

test("Glisser / redimensionner à la souris ; l'ouverture reste attachée au mur déplacé, allongé, raccourci, pivoté", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  // Mur isolé : une porte posée au panneau (« + Porte »).
  await tool(page, "Sélection");
  let at = await onWall(page, walls.f, 0.2);
  await page.mouse.click(at.x, at.y);
  await page.getByTestId("plan-wall-panel").getByRole("button", { name: "+ Porte" }).click();
  await expect(page.getByTestId("plan-opening-panel")).toBeVisible();
  await saved(page);
  const door = (await openingsOf(plans.e1)).find((o) => o.parent_element_id === walls.f)!;
  expect(door.donnees).toMatchObject({ decalageMm: 1585, largeurMm: 830 });
  // Glisser le corps de +50 cm (accrochage : pas de 1 cm).
  const pxPerMm = at.pxPerMm / 4000;
  let from = await handle(page, "corps");
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(from.x + (500 * pxPerMm * step) / 10, from.y);
  await page.mouse.up();
  await saved(page);
  const moved = (await openingsOf(plans.e1)).find((o) => o.id === door.id)!.donnees;
  expect(Math.abs(Number(moved.decalageMm) - 2085)).toBeLessThan(40);
  expect(moved.largeurMm).toBe(830);
  // Redimensionner par le tableau B : +20 cm.
  from = await handle(page, "end");
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 5; step++) await page.mouse.move(from.x + (200 * pxPerMm * step) / 5, from.y);
  await page.mouse.up();
  await saved(page);
  const resized = (await openingsOf(plans.e1)).find((o) => o.id === door.id)!.donnees;
  expect(Math.abs(Number(resized.largeurMm) - 1030)).toBeLessThan(40);
  expect(resized.decalageMm).toBe(moved.decalageMm);
  // Mur allongé (panneau) : la porte garde sa distance à A.
  await page.keyboard.press("Escape");
  at = await onWall(page, walls.f, 0.1);
  await page.mouse.click(at.x, at.y);
  await field(page, "plan-wall-longueur", "500");
  await saved(page);
  expect((await openingsOf(plans.e1)).find((o) => o.id === door.id)!.donnees.decalageMm).toBe(resized.decalageMm);
  // Mur pivoté à 90° : la porte pivote avec lui (position relative inchangée).
  await field(page, "plan-wall-angle", "90");
  await saved(page);
  const rows = await elements(plans.e1);
  expect(rows.find((x) => x.id === walls.f)!.donnees.b).toEqual({ x: 8000, y: 5000 });
  expect(rows.find((x) => x.id === door.id)!.donnees.decalageMm).toBe(resized.decalageMm);
  // Raccourci sous la largeur de la porte : refusé, rien ne change.
  await field(page, "plan-wall-longueur", "80");
  await expect(message(page)).toHaveText(/Modification refusée/);
  // Raccourci juste assez : la porte glisse dans le mur, largeur conservée.
  await field(page, "plan-wall-longueur", "150");
  await saved(page);
  const fitted = (await openingsOf(plans.e1)).find((o) => o.id === door.id)!.donnees;
  expect(Number(fitted.decalageMm) + Number(fitted.largeurMm)).toBeLessThanOrEqual(1500);
  expect(fitted.largeurMm).toBe(resized.largeurMm);
  // Mur déplacé (glisser le corps) : la porte suit.
  const body = await onWall(page, walls.f, 0.2);
  await page.mouse.move(body.x, body.y); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(body.x + step * 10, body.y);
  await page.mouse.up();
  await saved(page);
  const shifted = await elements(plans.e1);
  expect(shifted.find((x) => x.id === walls.f)!.donnees.a!.x).toBeGreaterThan(8000);
  expect(shifted.find((x) => x.id === door.id)!.donnees).toMatchObject({ decalageMm: fitted.decalageMm, largeurMm: fitted.largeurMm });
});

test("Menuiserie : sens, poussée, vantaux, modèle ; symbole mis à jour", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  const door = (await openingsOf(plans.e1)).find((o) => o.parent_element_id === walls.s && o.donnees.typeOuverture === "porte")!;
  await tool(page, "Sélection");
  const at = await onWall(page, walls.s, (Number(door.donnees.decalageMm) + 415) / 6000);
  await page.mouse.click(at.x, at.y);
  const panel = page.getByTestId("plan-opening-panel");
  await panel.getByTestId("plan-ouverture-sens").selectOption("droite");
  await panel.getByTestId("plan-ouverture-poussee").selectOption("poussant");
  await expect(page.locator(`[data-testid="plan-ouverture"][data-id="${door.id}"]`)).toHaveAttribute("data-poussee", "poussant");
  await saved(page);
  expect((await openingsOf(plans.e1)).find((o) => o.id === door.id)!.donnees).toMatchObject({ sens: "droite", poussee: "poussant" });
  await panel.getByTestId("plan-ouverture-vantaux").selectOption("2");
  await expect(page.locator(`[data-testid="plan-ouverture"][data-id="${door.id}"] path`)).toHaveCount(2);
  await page.getByTestId("plan-ouverture-menuiserie").selectOption("porte_coulissante");
  await expect(page.locator(`[data-testid="plan-ouverture"][data-id="${door.id}"] path`)).toHaveCount(0);
  await saved(page);
  expect((await openingsOf(plans.e1)).find((o) => o.id === door.id)!.donnees).toMatchObject({ sens: "coulissant", modele: "coulissant" });
  await page.getByTestId("plan-ouverture-menuiserie").selectOption("porte");
  await saved(page);
});

test("Annuler / rétablir : ajout, déplacement, redimensionnement, suppression, scission aux jonctions", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  const count = async () => (await openingsOf(plans.e1)).length;
  const initial = await count();
  const undoBtn = page.getByRole("button", { name: "Annuler", exact: true });
  const redoBtn = page.getByRole("button", { name: "Rétablir", exact: true });
  // Ajout (outil) → annuler → rétablir.
  await tool(page, "Ouverture");
  await page.getByTestId("plan-menuiserie-fenetre").click();
  const at = await onWall(page, walls.n, 3700 / 6000); // entre la cloison (T) et le châssis fixe
  await page.mouse.click(at.x, at.y);
  await saved(page); expect(await count()).toBe(initial + 1);
  await page.keyboard.press("Control+z"); await saved(page); expect(await count()).toBe(initial);
  await redoBtn.click(); await saved(page); expect(await count()).toBe(initial + 1);
  const added = (await openingsOf(plans.e1)).find((o) => o.parent_element_id === walls.n && o.donnees.typeOuverture === "fenetre" && o.donnees.modele === "battant" && Number(o.donnees.decalageMm) > 3000)!;
  // Déplacement (panneau) → annuler.
  await tool(page, "Sélection");
  const sel = await onWall(page, walls.n, (Number(added.donnees.decalageMm) + 600) / 6000);
  await page.mouse.click(sel.x, sel.y);
  await field(page, "plan-ouverture-position", "320");
  await saved(page);
  expect((await openingsOf(plans.e1)).find((o) => o.id === added.id)!.donnees.decalageMm).toBe(3200);
  await undoBtn.click(); await saved(page);
  expect((await openingsOf(plans.e1)).find((o) => o.id === added.id)!.donnees.decalageMm).toBe(added.donnees.decalageMm);
  // Redimensionnement → annuler.
  await field(page, "plan-ouverture-largeur", "100");
  await saved(page);
  await undoBtn.click(); await saved(page);
  expect((await openingsOf(plans.e1)).find((o) => o.id === added.id)!.donnees.largeurMm).toBe(1200);
  // Suppression → annuler (restauration serveur).
  await page.getByTestId("plan-opening-panel").getByRole("button", { name: "Supprimer l'ouverture" }).click();
  await saved(page); expect(await count()).toBe(initial);
  await undoBtn.click(); await saved(page); expect(await count()).toBe(initial + 1);
  // Scission du mur sud aux jonctions (cloison en T) → annuler.
  await page.keyboard.press("Escape");
  const s = await onWall(page, walls.s, 0.97);
  await page.mouse.click(s.x, s.y);
  await page.getByRole("button", { name: "Scinder aux jonctions" }).click();
  await saved(page);
  const murs = async () => (await elements(plans.e1)).filter((x) => x.type === "mur").length;
  expect(await murs()).toBe(8);
  await undoBtn.click(); await saved(page);
  expect(await murs()).toBe(7);
  expect((await openingsOf(plans.e1)).filter((o) => o.parent_element_id === walls.s)).toHaveLength(2);
});

test("Nettoyage des jonctions : extrémités fusionnées, abouts raccordés, dépassement recoupé ; annulable", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e2));
  await expect(page.getByTestId("plan-jonctions")).not.toHaveText("Jonctions : 4 L · 2 T · 0 X");
  await page.getByRole("button", { name: "Nettoyer les jonctions" }).click();
  await expect(message(page)).toHaveText("Jonctions nettoyées : 2 extrémité(s) fusionnée(s), 1 raccord(s) en T, 1 dépassement(s) recoupé(s).");
  await expect(page.getByTestId("plan-jonctions")).toHaveText("Jonctions : 4 L · 2 T · 0 X");
  await saved(page);
  const cleaned = (await elements(plans.e2)).filter((x) => x.type === "mur");
  expect(cleaned.some((x) => x.donnees.a!.x === 1500 && x.donnees.a!.y === 4000)).toBe(true);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await saved(page);
  expect((await elements(plans.e2)).some((x) => x.donnees.a?.y === 4080)).toBe(true);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Nettoyer les jonctions" }).click();
  await expect(message(page)).toHaveText("Jonctions déjà propres : rien à corriger.");
});

test("Pièces : détection malgré les ouvertures, association, surface calculée par le serveur", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  await page.getByRole("button", { name: "Détecter les pièces" }).click();
  await expect(message(page)).toHaveText("2 pièce(s) fermée(s) détectée(s).");
  await expect(page.locator('[data-testid="plan-room-detected"]')).toHaveCount(2);
  await tool(page, "Pièce");
  await page.getByTestId("plan-piece-select").selectOption(ctx.sejourId);
  const inside = await onWall(page, walls.x, 0.1); // (2200, 2000) : dans la pièce ouest
  await page.mouse.click(inside.x, inside.y - 40);
  await expect(message(page)).toHaveText("Séjour associée au contour.");
  await saved(page);
  const { data } = must(await ctx.a.from("tools_releves_plans").select("contours").eq("id", plans.e1).single());
  const contour = (data as { contours: Array<{ pieceId: string; surfaceMm2: number }> }).contours[0];
  // Nu intérieur : 100 → 2950 (x) × 100 → 3900 (y) = 2,85 × 3,80 m.
  expect(contour).toMatchObject({ pieceId: ctx.sejourId, surfaceMm2: 2850 * 3800 });
  await expect(page.locator(`[data-testid="plan-surface"][data-piece="${ctx.sejourId}"]`)).toContainText("10,83 m²");
});

test("Versioning : les ouvertures appartiennent à leur plan ; plan figé jamais modifié ; dérivé indépendant", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl(ctx.e1));
  const frozenOpenings = await openingsOf(plans.e1);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Figer ce plan" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText(/figé/);
  await expect(page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name: "Ouverture", exact: true })).toHaveCount(0);
  const refused = await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.e1, p_revision: await revision(plans.e1), p_modifications: {
    ouvertures: [{ id: frozenOpenings[0].id, murId: frozenOpenings[0].parent_element_id, donnees: { ...frozenOpenings[0].donnees, largeurMm: 500 } }] } });
  expect(refused.error?.code).toBe("42501");
  await page.getByRole("button", { name: "Nouveau plan corrigé" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText("Corrigée");
  const { data: list } = must(await ctx.a.from("tools_releves_plans").select("id,etat_documente").eq("etage_id", ctx.e1).order("numero"));
  plans.e1Corrige = (list as Array<{ id: string }>)[1].id;
  const copies = await openingsOf(plans.e1Corrige);
  expect(copies).toHaveLength(frozenOpenings.length);
  expect(copies.every((o) => frozenOpenings.some((f) => f.id === o.donnees.origineId))).toBe(true);
  // Déplacer une ouverture copiée dans le dérivé : le plan figé reste identique.
  const copy = copies.find((o) => o.donnees.typeOuverture === "baie")!;
  await tool(page, "Sélection");
  const murCopy = copy.parent_element_id!;
  const at = await onWall(page, murCopy, (Number(copy.donnees.decalageMm) + 1200) / 4000);
  await page.mouse.click(at.x, at.y);
  await field(page, "plan-ouverture-position", "20");
  await saved(page);
  expect((await openingsOf(plans.e1Corrige)).find((o) => o.id === copy.id)!.donnees.decalageMm).toBe(200);
  expect(await openingsOf(plans.e1)).toEqual(frozenOpenings);
});

test("Sélecteur de cible photo : un mur copié dans un plan dérivé n'apparaît plus en double", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/photos?id=${ctx.releveId}`);
  const region = page.getByRole("region", { name: "Ajouter une photo" });
  await expect(region).toBeVisible();
  const open = region.getByRole("button", { name: "Ajouter une photo" });
  if (await open.isVisible()) await open.click();
  await region.getByLabel("Rattacher à").selectOption("mur");
  const options = await region.locator("#capture-id option").evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  // Murs actifs : RDC figé (7) + RDC corrigé (7 copies) + R+1 (6) + Combles (4). Proposés : les copies du
  // RDC corrigé (pas les murs du plan figé qu'elles remplacent), R+1 et Combles = 7 + 6 + 4.
  expect(options).toHaveLength(17);
  expect(new Set(options).size).toBe(17);
  for (const id of Object.values(walls)) expect(options).not.toContain(id);
});

test("Export SVG : épaisseur des murs, portes, fenêtres, baies", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${planUrl(ctx.e1)}&plan=${plans.e1Corrige}`);
  await expect(page.getByTestId("plan-compteurs")).toContainText("7 mur(s)");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exporter SVG" }).click()]);
  const file = join(dir, "plan.svg");
  await download.saveAs(file);
  const svg = readFileSync(file, "utf8");
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg.match(/<polygon[^>]*data-ref=/g)!.length).toBeGreaterThanOrEqual(7 + 8);
  expect(svg).toContain('stroke="#2563eb"'); // vitrages (fenêtres, baie, porte-fenêtre)
  expect(svg.match(/ A\d/g)!.length).toBeGreaterThanOrEqual(3); // arcs de débattement
  expect(svg).toContain("-100,-100"); // coin extérieur en onglet (épaisseur réelle)
  writeFileSync(join(SHOTS, "lot6-export.svg"), svg);
});

test("Sécurité : un autre tenant ne lit ni n'écrit les ouvertures", async () => {
  const { data } = await ctx.b.from("tools_releves_elements").select("id").eq("plan_id", plans.e1Corrige);
  expect(data ?? []).toHaveLength(0);
  const write = await ctx.b.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.e1Corrige, p_revision: 1, p_modifications: { ouvertures: [] } });
  expect(write.error?.code).toBe("42501");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tablette — Chromium en émulation tactile (MOBILE EMULATED ONLY)
// ─────────────────────────────────────────────────────────────────────────────
const TABLET: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
type Cdp = Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>;
async function touch(cdp: Cdp, type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number }>) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
}

test("Tablette 820×1180 : ouverture ajoutée au toucher, glissée au doigt, panneau utilisable", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(TABLET);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(planUrl(ctx.e3));
    await expect(page.getByTestId("plan-compteurs")).toContainText("4 mur(s)");
    const { data: murRows } = must(await ctx.a.from("tools_releves_elements").select("id,donnees").eq("plan_id", plans.e3).eq("type", "mur"));
    const south = (murRows as Array<{ id: string; donnees: { a: { y: number }; b: { y: number } } }>).find((m) => m.donnees.a.y === 0 && m.donnees.b.y === 0)!.id;
    await tool(page, "Ouverture", true);
    await page.getByTestId("plan-menuiserie-porte").tap();
    const at = await onWall(page, south, 0.3);
    await page.touchscreen.tap(at.x, at.y);
    await expect(message(page)).toContainText("posée sur le mur");
    await expect(page.locator('[data-testid="plan-ouverture"]')).toHaveCount(1);
    await saved(page);
    const door = (await openingsOf(plans.e3))[0];
    // Sélection au toucher puis glisser le corps de l'ouverture au doigt (+60 cm).
    await tool(page, "Sélection", true);
    const centre = await onWall(page, south, (Number(door.donnees.decalageMm) + 415) / 5000);
    await page.touchscreen.tap(centre.x, centre.y);
    await expect(page.getByTestId("plan-opening-panel")).toBeVisible();
    await canvas(page).evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const grip = await handle(page, "corps");
    const pxPerMm = (await onWall(page, south, 0)).pxPerMm / 5000;
    const cdp = await context.newCDPSession(page);
    await touch(cdp, "touchStart", [grip]);
    for (let step = 1; step <= 8; step++) await touch(cdp, "touchMove", [{ x: grip.x + (600 * pxPerMm * step) / 8, y: grip.y }]);
    await touch(cdp, "touchEnd", []);
    await cdp.detach();
    await saved(page);
    const moved = (await openingsOf(plans.e3))[0].donnees;
    expect(Math.abs(Number(moved.decalageMm) - Number(door.donnees.decalageMm) - 600)).toBeLessThan(60);
    // Outils ≥ 44 px (palette comprise), aucun débordement horizontal.
    await tool(page, "Ouverture", true);
    const heights = await page.getByRole("toolbar", { name: "Menuiseries" }).getByRole("button").evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: join(SHOTS, "lot6-tablette.png") });
    await context.close();
  } finally { await browser.close(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance : 100 + 50, 250 + 150, 500 + 300 (render, pan, zoom, edit, save)
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

for (const [size, openings] of [[100, 50], [250, 150], [500, 300]] as const) {
  test(`Performance : ${size} murs + ${openings} ouvertures (rendu, pan, zoom, édition, sauvegarde)`, async ({ page }) => {
    const etageId = uuid();
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: `Perf ${size}`, niveau: 3 + [100, 250, 500].indexOf(size), type_niveau: "etage", ordre: 3 + [100, 250, 500].indexOf(size) }));
    const columns = Math.ceil(Math.sqrt(size / 2));
    const murs: Wall[] = [];
    for (let k = 0; murs.length < size; k++) {
      const x = (k % columns) * 3000; const y = Math.floor(k / columns) * 3000;
      murs.push(wall(uuid(), x, y, x + 3000, y));
      if (murs.length < size) murs.push(wall(uuid(), x, y, x, y + 3000, 100, "cloison"));
    }
    // Une porte au milieu des premiers murs (1085 → 1915 : hors des jonctions L / T / X).
    const ouvertures = murs.slice(0, openings).map((m) => ({ id: uuid(), murId: m.id,
      donnees: { decalageMm: 1085, largeurMm: 830, hauteurMm: 2040, allegeMm: null, typeOuverture: "porte", sens: "gauche", vantaux: 1, poussee: "tirant", modele: "battant" } }));
    const t0 = Date.now();
    const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
    must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: (plan as { id: string }).id, p_revision: 1, p_modifications: { murs, ouvertures } }));
    const bulkSaveMs = Date.now() - t0;

    await signIn(page, EMAIL_A);
    const renderStarted = Date.now();
    await page.goto(planUrl(etageId));
    await expect(page.getByTestId("plan-compteurs")).toContainText(`${size} mur(s) · ${openings} ouverture(s)`, { timeout: 60_000 });
    await expect(page.locator('[data-testid="plan-mur-corps"]').first()).toBeAttached();
    const renderMs = Date.now() - renderStarted;
    const drawnParts = await page.locator('[data-testid="plan-mur-corps"]').count();

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
    // Édition : sélectionner une ouverture visible puis la déplacer (position saisie) ; mesure jusqu'au symbole redessiné.
    const target = ouvertures[Math.floor(openings / 2)];
    await tool(page, "Sélection");
    const at = await onWall(page, target.murId, 1500 / 3000);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId("plan-opening-panel")).toBeVisible();
    const editStarted = Date.now();
    await field(page, "plan-ouverture-position", "150");
    await expect(page.getByTestId("plan-ouverture-position")).toHaveValue("150");
    await expect(page.locator(`[data-testid="plan-ouverture"][data-id="${target.id}"]`)).toBeAttached();
    const editMs = Date.now() - editStarted;
    const saveStarted = Date.now();
    await saved(page);
    const autosaveMs = Date.now() - saveStarted;
    const { data: row } = must(await ctx.a.from("tools_releves_elements").select("donnees").eq("id", target.id).single());
    expect((row as { donnees: { decalageMm: number } }).donnees.decalageMm).toBe(1500);
    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    perf[`murs_${size}_ouvertures_${openings}`] = { bulkSaveMs, renderMs, drawnParts, pan, zoom, editMs, autosaveMs, heapMb: Math.round(heap / 1e6) };
    expect(renderMs).toBeLessThan(20_000);
    expect(pan.p95FrameMs).toBeLessThan(250);
    expect(editMs).toBeLessThan(5_000);
  });
}
