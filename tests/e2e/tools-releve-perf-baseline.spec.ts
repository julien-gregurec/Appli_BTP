import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA — Baseline performance V1 (docs/qualification/ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md)
 * Tools / Relevé & Métré : relevé à grosse STRUCTURE et plan 2D de 500 murs + 300 ouvertures,
 * sur la pile Relevé RÉELLE (scripts/local-postgres-bootstrap/releve_e2e_stack.sh : GoTrue,
 * PostgREST, RLS, Storage local). Même protocole de mesure que la recette Lot 5 (§ Performance) :
 * rendu, pan, zoom, édition, sauvegarde automatique, tas JS. Aucune donnée d'une autre recette
 * n'est modifiée : relevé dédié.
 *
 *   RELEVE_E2E_BASE_URL=… RELEVE_E2E_SUPABASE_URL=… RELEVE_E2E_ANON_KEY=… RELEVE_E2E_EMAIL_A=… RELEVE_E2E_PASSWORD=…
 *   RELEVE_E2E_PERF_OUT=/tmp/perf/tools.json npx playwright test tests/e2e/tools-releve-perf-baseline.spec.ts --project=desktop-chromium
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const SUPABASE_URL = process.env.RELEVE_E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.RELEVE_E2E_ANON_KEY ?? "";
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1366, height: 1024 }, contextOptions: { reducedMotion: "reduce" } });
test.skip(!BASE || !SUPABASE_URL || !ANON_KEY || !EMAIL_A || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");
test.setTimeout(300_000);

const suffix = Date.now().toString(36);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(tmpdir(), `releve-perf-baseline-${suffix}.json`);
const perf: Record<string, unknown> = {};
const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };

let a: SupabaseClient;
let tenantA = "";
let releveId = "";
let batimentIds: string[] = [];
let etageIds: string[] = [];

async function signIn(page: Page) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(EMAIL_A);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}
const heapMb = (page: Page) => page.evaluate(() => Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6));

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

test.beforeAll(async () => {
  a = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await a.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD }));
  const { data: session } = await a.auth.getUser();
  const { data: m } = must(await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single());
  tenantA = (m as { entreprise_id: string }).entreprise_id;

  // Structure : 3 bâtiments × 8 niveaux × 25 pièces = 600 pièces (résidence réelle de taille moyenne).
  const started = Date.now();
  releveId = uuid();
  must(await a.from("tools_releves").insert({ id: releveId, entreprise_id: tenantA, nom: `Relevé baseline perf ${suffix}`, chantier_nom: "Résidence perf" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: releveId, nom: "Résidence perf" }));
  batimentIds = [uuid(), uuid(), uuid()];
  must(await a.from("tools_releves_batiments").insert(batimentIds.map((id, i) => ({ id, releve_id: releveId, chantier_id: chantierId, nom: `Bâtiment ${"ABC"[i]}` }))));
  const etages = batimentIds.flatMap((batimentId) => Array.from({ length: 8 }, (_, n) => ({ id: uuid(), releve_id: releveId, batiment_id: batimentId, nom: n === 0 ? "RDC" : `R+${n}`, niveau: n, type_niveau: n === 0 ? "rdc" : "etage", ordre: n })));
  must(await a.from("tools_releves_etages").insert(etages));
  etageIds = etages.map((e) => e.id);
  const pieces = etages.flatMap((e) => Array.from({ length: 25 }, (_, k) => ({ id: uuid(), releve_id: releveId, etage_id: e.id, nom: `Pièce ${k + 1}`, usage: "bureau", ordre: k })));
  for (let i = 0; i < pieces.length; i += 200) must(await a.from("tools_releves_pieces").insert(pieces.slice(i, i + 200)));
  perf.structure = { batiments: 3, etages: etages.length, pieces: pieces.length, depotMs: Date.now() - started };
});

test.afterAll(() => { mkdirSync(join(PERF_OUT, ".."), { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

test("Relevé structure (3 bâtiments, 24 niveaux, 600 pièces) : chargement fiche et structure", async ({ page }) => {
  await signIn(page);
  const mesures: Record<string, number[]> = { structure: [], fiche: [] };
  for (let k = 0; k < 5; k++) {
    let t = Date.now();
    await page.goto(`${BASE}/releves/structure?id=${releveId}`);
    await expect(page.getByText("Bâtiment C").first()).toBeVisible({ timeout: 60_000 });
    mesures.structure.push(Date.now() - t);
    t = Date.now();
    await page.goto(`${BASE}/releves/fiche?id=${releveId}`);
    await expect(page.getByText(`Relevé baseline perf ${suffix}`).first()).toBeVisible({ timeout: 60_000 });
    mesures.fiche.push(Date.now() - t);
  }
  perf.structurePages = { ...mesures, heapMb: await heapMb(page) };
});

test("Plan 2D : 500 murs + 300 ouvertures (sauvegarde, rendu, pan, zoom, édition, mémoire)", async ({ page }) => {
  const etageId = etageIds[0];
  const created = must(await a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
  const plan = created.data as { id: string; revision: number };
  const murs: { id: string; pieceId: null; donnees: Record<string, unknown> }[] = [];
  const columns = Math.ceil(Math.sqrt(500 / 2));
  for (let k = 0; murs.length < 500; k++) {
    const x = (k % columns) * 3000; const y = Math.floor(k / columns) * 3000;
    murs.push({ id: uuid(), pieceId: null, donnees: { a: { x, y }, b: { x: x + 3000, y }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } });
    if (murs.length < 500) murs.push({ id: uuid(), pieceId: null, donnees: { a: { x, y }, b: { x, y: y + 3000 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } });
  }
  const types = ["porte", "fenetre", "baie", "passage"];
  const ouvertures = Array.from({ length: 300 }, (_, i) => ({ id: uuid(), murId: murs[i].id,
    donnees: { decalageMm: 600, largeurMm: 900, hauteurMm: i % 4 === 0 ? 2040 : 1250, allegeMm: i % 4 === 0 ? 0 : 950, typeOuverture: types[i % 4], sens: "gauche" } }));
  let t = Date.now();
  const saved1 = must(await a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plan.id, p_revision: plan.revision, p_modifications: { murs } }));
  const saveMursMs = Date.now() - t;
  t = Date.now();
  must(await a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plan.id, p_revision: (saved1.data as { revision: number }).revision, p_modifications: { ouvertures } }));
  const saveOuverturesMs = Date.now() - t;

  await signIn(page);
  const heapAvant = await heapMb(page);
  const rendus: number[] = [];
  for (let k = 0; k < 3; k++) {
    t = Date.now();
    await page.goto(`${BASE}/releves/plan?id=${releveId}&etage=${etageId}`);
    await expect(page.getByTestId("plan-compteurs")).toContainText("500 mur(s)", { timeout: 60_000 });
    await expect(page.locator('[data-testid="plan-ouverture"]').first()).toBeAttached();
    rendus.push(Date.now() - t);
  }
  const drawnWalls = await page.locator('[data-testid="plan-mur"]').count();
  const drawnOpenings = await page.locator('[data-testid="plan-ouverture"]').count();
  const canvas = page.getByRole("application", { name: /^Plan / });
  const box = (await canvas.boundingBox())!;
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
  const id = await page.locator('[data-testid="plan-mur"]').nth(Math.floor(drawnWalls / 2)).getAttribute("data-id");
  await page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name: "Sélection", exact: true }).click();
  await canvas.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const line = page.locator(`[data-testid="plan-mur"][data-id="${id}"]`);
  const [x1, y1, x2, y2] = await Promise.all(["x1", "y1", "x2", "y2"].map(async (k) => Number(await line.getAttribute(k))));
  const b2 = (await canvas.boundingBox())!;
  await page.mouse.click(b2.x + (x1 + x2) / 2, b2.y + (y1 + y2) / 2);
  await expect(page.getByTestId("plan-wall-panel")).toBeVisible();
  t = Date.now();
  await page.getByTestId("plan-wall-longueur").fill("250");
  await page.getByTestId("plan-wall-longueur").press("Enter");
  await expect(page.getByTestId("plan-wall-panel").getByRole("heading", { level: 2 })).toHaveText("Mur · 2,50 m");
  const editMs = Date.now() - t;
  t = Date.now();
  await expect(page.getByRole("status", { name: "État de sauvegarde — plan" })).toHaveText(/Enregistré/, { timeout: 30_000 });
  const autosaveMs = Date.now() - t;
  perf.plan500x300 = { saveMursMs, saveOuverturesMs, rendusMs: rendus, drawnWalls, drawnOpenings, pan, zoom, editMs, autosaveMs, heapAvantMb: heapAvant, heapMb: await heapMb(page) };
  expect(drawnOpenings).toBeGreaterThan(0);
});
