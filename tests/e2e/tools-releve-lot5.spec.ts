import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 5 : plan 2D (building editor foundation), sur pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS + surface Storage locale), Tools en `next dev`.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot5.spec.ts --project=desktop-chromium
 *
 * Tablette / smartphone : Chromium en émulation (viewport, `isMobile`, tactile, user-agent) — pas un
 * WebKit iOS réel ni un appareil physique (MOBILE EMULATED ONLY). Pincement : évènements tactiles CDP.
 * Mesures de performance écrites dans RELEVE_E2E_PERF_OUT (défaut : dossier temporaire du test).
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const SUPABASE_URL = process.env.RELEVE_E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.RELEVE_E2E_ANON_KEY ?? "";
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";
const CHROME = process.env.PW_CHROME_PATH;

test.describe.configure({ mode: "serial" });
// Poste de bureau courant (portable 1366×1024) : la toile entière est à l'écran.
// Mouvements réduits : le défilement doux du site (`scroll-behavior: smooth`) fausserait les
// coordonnées écran lues pendant l'animation.
test.use({ viewport: { width: 1366, height: 1024 }, contextOptions: { reducedMotion: "reduce" } });
test.skip(!BASE || !SUPABASE_URL || !ANON_KEY || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");
test.setTimeout(240_000);

const suffix = Date.now().toString(36);
const dir = join(tmpdir(), `releve-lot5-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const perf: Record<string, unknown> = {};

type Ctx = {
  a: SupabaseClient; b: SupabaseClient; tenantA: string; releveId: string; chantierId: string; batimentId: string; etageId: string; r1Id: string;
  zoneId: string; sejourId: string; cuisineId: string; legacyMurId: string; mediaId: string; planAnchorId: string; murAnchorId: string;
};
let ctx: Ctx;
let planId = "";

const uuid = () => crypto.randomUUID();
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };

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

const planUrl = (query = "") => `${BASE}/releves/plan?id=${ctx.releveId}&etage=${ctx.etageId}${query}`;
const canvas = (page: Page) => page.getByRole("application", { name: /^Plan / });
const saveStatus = (page: Page) => page.getByRole("status", { name: "État de sauvegarde — plan" });
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function saved(page: Page) {
  await expect(saveStatus(page)).toHaveText(/Enregistré/, { timeout: 20_000 });
}

/** Coordonnées page d'un point exprimé en coordonnées SVG (locales à la toile). */
async function onCanvas(page: Page, local: { x: number; y: number }) {
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + local.x, y: box.y + local.y };
}
async function wallScreen(page: Page, id: string) {
  const line = page.locator(`[data-testid="plan-mur"][data-id="${id}"]`);
  const [x1, y1, x2, y2] = await Promise.all(["x1", "y1", "x2", "y2"].map(async (k) => Number(await line.getAttribute(k))));
  return {
    a: await onCanvas(page, { x: x1, y: y1 }), b: await onCanvas(page, { x: x2, y: y2 }), mid: await onCanvas(page, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }),
    quarter: await onCanvas(page, { x: x1 + (x2 - x1) / 4, y: y1 + (y2 - y1) / 4 }),
  };
}
async function planWalls() {
  const { data } = must(await ctx.a.from("tools_releves_elements").select("id,type,parent_element_id,donnees,deleted_at").eq("plan_id", planId).is("deleted_at", null));
  return data as Array<{ id: string; type: string; parent_element_id: string | null; donnees: { a: { x: number; y: number }; b: { x: number; y: number }; [key: string]: unknown } }>;
}
const lengthOf = (d: { a: { x: number; y: number }; b: { x: number; y: number } }) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);

async function tool(page: Page, name: "Sélection" | "Mur" | "Pièce", touch = false) {
  // Parcours tactiles : on TOUCHE les boutons (un clic souris synthétique dans un contexte
  // tactile émulé fait ignorer par Chromium le toucher suivant — artefact d'émulation).
  const button = page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name, exact: true });
  if (touch) await button.tap(); else await button.click();
  // Toile centrée à l'écran : les coordonnées lues ensuite restent valables.
  await canvas(page).evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
}

/** Trace un rectangle au clavier numérique (longueur + angle) depuis un point touché. */
async function drawRectangle(page: Page, at: { fx: number; fy: number }, widthCm: number, depthCm: number, tap = false) {
  await tool(page, "Mur");
  // Boîte relue APRÈS le choix de l'outil : le clic sur la barre peut faire défiler la page.
  const box = (await canvas(page).boundingBox())!;
  const start = { x: box.x + box.width * at.fx, y: box.y + box.height * at.fy };
  if (tap) await page.touchscreen.tap(start.x, start.y); else await page.mouse.click(start.x, start.y);
  for (const [longueur, angle] of [[widthCm, 0], [depthCm, 90], [widthCm, 180], [depthCm, 270]] as const) {
    await page.getByTestId("plan-draw-longueur").fill(String(longueur));
    await page.getByTestId("plan-draw-angle").fill(String(angle));
    await page.getByRole("button", { name: "Placer" }).click();
  }
  await expect(page.getByTestId("plan-message")).toContainText("Contour fermé");
}

/** Murs du rectangle tracé au test 2, dans l'ordre du tracé (0°, 90°, 180°, 270°), lus en base. */
let rectangle: string[] = [];
async function rectangleWalls(page: Page) {
  if (rectangle.length === 0) {
    const walls = (await planWalls()).filter((w) => w.type === "mur" && w.id !== ctx.legacyMurId);
    const angle = (w: (typeof walls)[number]) => ((Math.round((Math.atan2(w.donnees.b.y - w.donnees.a.y, w.donnees.b.x - w.donnees.a.x) * 180) / Math.PI) % 360) + 360) % 360;
    rectangle = [0, 90, 180, 270].map((deg) => walls.find((w) => angle(w) === deg)!.id);
  }
  await expect(page.locator(`[data-testid="plan-mur"][data-id="${rectangle[0]}"]`)).toHaveCount(1);
  return rectangle;
}

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const ids = { releveId: uuid(), batimentId: uuid(), etageId: uuid(), r1Id: uuid(), zoneId: uuid(), sejourId: uuid(), cuisineId: uuid(), legacyMurId: uuid(), mediaId: uuid(), planAnchorId: uuid(), murAnchorId: uuid() };
  must(await a.from("tools_releves").insert({ id: ids.releveId, entreprise_id: tenantA, nom: `Relevé plan ${suffix}`, chantier_nom: "Résidence Lot 5" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", ids.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: ids.releveId, nom: "Résidence Lot 5" }));
  must(await a.from("tools_releves_batiments").insert({ id: ids.batimentId, releve_id: ids.releveId, chantier_id: chantierId, nom: "Bâtiment A" }));
  must(await a.from("tools_releves_etages").insert([
    { id: ids.etageId, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: ids.r1Id, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "R+1", niveau: 1, type_niveau: "etage", ordre: 1 },
  ]));
  must(await a.from("tools_releves_zones").insert({ id: ids.zoneId, releve_id: ids.releveId, etage_id: ids.etageId, nom: "Appartement 1", type: "appartement" }));
  must(await a.from("tools_releves_pieces").insert([
    { id: ids.sejourId, releve_id: ids.releveId, etage_id: ids.etageId, zone_id: ids.zoneId, nom: "Séjour", usage: "sejour", ordre: 0 },
    { id: ids.cuisineId, releve_id: ids.releveId, etage_id: ids.etageId, nom: "Cuisine", usage: "cuisine", ordre: 1 },
  ]));
  // Mur relevé AVANT le Lot 5 (sans plan) : doit être adopté par le plan initial.
  must(await a.from("tools_releves_elements").insert({ id: ids.legacyMurId, releve_id: ids.releveId, type: "mur", etage_id: ids.etageId,
    donnees: { a: { x: 0, y: 9000 }, b: { x: 3000, y: 9000 }, epaisseurMm: 100, hauteurMm: 2500, typeMur: "cloison" } }));
  // Photo Lot 4 : fichier + miniature + deux rattachements (point du plan, mur antérieur).
  const bytes = new Uint8Array(await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 180, g: 120, b: 40 } } }).jpeg().toBuffer());
  const path = `${tenantA}/${ids.releveId}/photos/${ids.mediaId}.jpg`;
  const mini = `${tenantA}/${ids.releveId}/photos/${uuid()}.jpg`;
  must(await a.storage.from("tools-releves").upload(path, bytes, { contentType: "image/jpeg" }));
  must(await a.storage.from("tools-releves").upload(mini, bytes, { contentType: "image/jpeg" }));
  must(await a.from("tools_releves_medias").insert({ id: ids.mediaId, releve_id: ids.releveId, categorie: "photos", storage_path: path, miniature_storage_path: mini,
    mime_type: "image/jpeg", taille_octets: bytes.byteLength, commentaire: "Fissure en pied de mur",
    metadata: { source: "import", priseLe: "2026-09-27T10:00:00+02:00", priseLeSource: "exif", orientation: "paysage", orientationExif: 1, largeurPx: 640, hauteurPx: 480,
      largeurOriginePx: 640, hauteurOriginePx: 480, tailleOrigineOctets: bytes.byteLength, compressionQualite: 0.85, compressionCoteMaxPx: 3072,
      empreinteSha256: "ab".repeat(32), gpsRetire: false, remplaceMediaId: null } }));
  must(await a.from("tools_releves_elements").insert([
    { id: ids.planAnchorId, releve_id: ids.releveId, type: "photo_anchor", etage_id: ids.etageId,
      donnees: { mediaId: ids.mediaId, ancre: { kind: "plan", etageId: ids.etageId, x: 0.25, y: 0.25 }, directionRad: null, legende: "Point du plan" } },
    { id: ids.murAnchorId, releve_id: ids.releveId, type: "photo_anchor", etage_id: ids.etageId,
      donnees: { mediaId: ids.mediaId, ancre: { kind: "entite", ref: { kind: "element", id: ids.legacyMurId } }, directionRad: null, legende: "Mur" } },
  ]));
  ctx = { a, b, tenantA, chantierId, ...ids };
});

test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// ─────────────────────────────────────────────────────────────────────────────
test("Structure → plan de l'étage : plan initial créé, mur antérieur adopté, repères photo", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/structure?id=${ctx.releveId}&chantier=${ctx.chantierId}&batiment=${ctx.batimentId}&etage=${ctx.etageId}`);
  await page.getByTestId("lien-plan-etage").click();
  await expect(page).toHaveURL(/\/releves\/plan\?id=.*&etage=/);
  await expect(page.getByRole("heading", { name: "Aucun plan pour cet étage" })).toBeVisible();
  await page.getByRole("button", { name: "Créer le plan initial" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText("Initiale");
  await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(1);
  await expect(page.locator(`[data-testid="plan-mur"][data-id="${ctx.legacyMurId}"]`)).toHaveCount(1);
  // Photos : un repère sur le point du plan (ancre normalisée), un au milieu du mur antérieur.
  await expect(page.locator('[data-testid="plan-photo"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="plan-photo"][data-source="mur"]')).toHaveCount(1);
  const { data } = must(await ctx.a.from("tools_releves_plans").select("id,numero,etat_documente,revision").eq("etage_id", ctx.etageId));
  expect(data).toHaveLength(1);
  planId = (data as Array<{ id: string }>)[0].id;
  expect((await planWalls()).map((w) => w.id)).toEqual([ctx.legacyMurId]);
});

test("Dessin desktop : rectangle par longueurs et angles, accrochage, cotes, dimensions principales, sauvegarde", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(1);
  await drawRectangle(page, { fx: 0.3, fy: 0.3 }, 420, 320);
  await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(5);
  await saved(page);
  const walls = (await planWalls()).filter((w) => w.id !== ctx.legacyMurId);
  expect(walls.map((w) => Math.round(lengthOf(w.donnees))).sort()).toEqual([3200, 3200, 4200, 4200]);
  expect(walls.every((w) => w.donnees.epaisseurMm === 200 && w.donnees.hauteurMm === 2500)).toBe(true);
  // Cotes des murs et dimensions principales hors tout.
  await expect(page.locator('[data-testid="plan-cote"]').filter({ hasText: "4,20 m" })).toHaveCount(2);
  await expect(page.getByTestId("plan-dimensions-principales")).toBeVisible();

  // Accrochage à la souris : extrémité, puis horizontale depuis le point de départ.
  const [first] = await rectangleWalls(page);
  await tool(page, "Mur");
  const w = await wallScreen(page, first);
  await page.mouse.move(w.a.x + 4, w.a.y + 3);
  await expect(page.getByTestId("plan-snap")).toHaveAttribute("data-kind", "extremite");
  await page.mouse.click(w.a.x + 4, w.a.y + 3);
  // Vers le bas, à 1° près de la verticale : contrainte verticale (270°).
  await page.mouse.move(w.a.x + 40, w.a.y + 60);
  await page.mouse.move(w.a.x + 2, w.a.y + 120);
  await expect(page.getByTestId("plan-snap")).toHaveAttribute("data-kind", "vertical");
  await expect(page.getByTestId("plan-snap-label")).toHaveText(/Vertical 270°/);
  await page.keyboard.press("Escape");
});

test("Pièces : détection, association au Séjour (Lot 3), surface calculée par le serveur", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  const ids = await rectangleWalls(page);
  await page.getByRole("button", { name: "Détecter les pièces" }).click();
  await expect(page.locator('[data-testid="plan-room-detected"]')).toHaveCount(1);
  await tool(page, "Pièce");
  const w0 = await wallScreen(page, ids[0]); const w1 = await wallScreen(page, ids[1]);
  await page.getByTestId("plan-piece-select").selectOption({ label: "Séjour" });
  await page.mouse.click((w0.a.x + w1.b.x) / 2, (w0.a.y + w1.b.y) / 2);
  await expect(page.locator(`[data-testid="plan-surface"][data-piece="${ctx.sejourId}"]`)).toContainText("12,00 m²");
  await saved(page);
  const { data } = must(await ctx.a.from("tools_releves_plans").select("contours").eq("id", planId).single());
  const contours = (data as { contours: Array<{ pieceId: string; surfaceMm2: number; murIds: string[] }> }).contours;
  expect(contours).toHaveLength(1);
  expect(contours[0]).toMatchObject({ pieceId: ctx.sejourId, surfaceMm2: 12_000_000 });
  expect(contours[0].murIds.sort()).toEqual([...ids].sort());
});

test("Édition : longueur, angle, glisser un point, glisser un mur, supprimer, annuler, rétablir", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  const ids = await rectangleWalls(page);
  await tool(page, "Sélection");
  let w = await wallScreen(page, ids[0]);
  await page.mouse.click(w.mid.x, w.mid.y);
  await expect(page.getByTestId("plan-wall-panel")).toBeVisible();
  // Longueur : 420 → 450 cm ; le mur voisin suit (joint).
  await page.getByTestId("plan-wall-longueur").fill("450");
  await page.getByTestId("plan-wall-longueur").press("Enter");
  await expect(page.locator(`[data-testid="plan-cote"][data-id="${ids[0]}"]`)).toHaveText("4,50 m");
  await saved(page);
  let walls = await planWalls();
  expect(Math.round(lengthOf(walls.find((x) => x.id === ids[0])!.donnees))).toBe(4500);
  // La surface du Séjour suit les murs (recalage du contour, surface serveur).
  // Seul le joint B bouge : le séjour devient un trapèze (4,00 + 4,30) / 2 × 3,00 ≈ 12,45 m².
  await expect(page.locator(`[data-testid="plan-surface"][data-piece="${ctx.sejourId}"]`)).toContainText("12,45 m²");
  const { data: surface } = must(await ctx.a.from("tools_releves_plans").select("contours").eq("id", planId).single());
  expect(Math.round((surface as { contours: Array<{ surfaceMm2: number }> }).contours[0].surfaceMm2 / 10_000)).toBe(1245);

  // Glisser l'extrémité B du mur sélectionné (poignée) de 40 px vers la droite.
  w = await wallScreen(page, ids[0]);
  await page.mouse.move(w.b.x, w.b.y); await page.mouse.down(); await page.mouse.move(w.b.x + 20, w.b.y, { steps: 3 }); await page.mouse.move(w.b.x + 40, w.b.y, { steps: 3 }); await page.mouse.up();
  await saved(page);
  walls = await planWalls();
  const moved = lengthOf(walls.find((x) => x.id === ids[0])!.donnees);
  expect(moved).toBeGreaterThan(4500);

  // Glisser le mur entier (corps du mur sélectionné) vers le bas.
  w = await wallScreen(page, ids[0]);
  const before = walls.find((x) => x.id === ids[0])!.donnees.a.y;
  await page.mouse.move(w.mid.x, w.mid.y); await page.mouse.down(); await page.mouse.move(w.mid.x, w.mid.y + 30, { steps: 4 }); await page.mouse.up();
  await saved(page);
  walls = await planWalls();
  expect(walls.find((x) => x.id === ids[0])!.donnees.a.y).toBeLessThan(before);

  // Angle : le mur sélectionné passe à 10° ; annuler le ramène à sa valeur d'avant.
  const angleAvant = await page.getByTestId("plan-wall-angle").inputValue();
  await page.getByTestId("plan-wall-angle").fill("10");
  await page.getByTestId("plan-wall-angle").press("Enter");
  await expect(page.getByTestId("plan-wall-angle")).toHaveValue("10");
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByTestId("plan-wall-angle")).toHaveValue(angleAvant);
  await page.getByRole("button", { name: "Rétablir" }).click();
  await expect(page.getByTestId("plan-wall-angle")).toHaveValue("10");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("plan-wall-angle")).toHaveValue(angleAvant);

  // Supprimer puis annuler : le mur revient (restauration serveur).
  await page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name: "Supprimer" }).click();
  await expect(page.locator(`[data-testid="plan-mur"][data-id="${ids[0]}"]`)).toHaveCount(0);
  await saved(page);
  expect((await planWalls()).some((x) => x.id === ids[0])).toBe(false);
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator(`[data-testid="plan-mur"][data-id="${ids[0]}"]`)).toHaveCount(1);
  await saved(page);
  expect((await planWalls()).some((x) => x.id === ids[0])).toBe(true);

  // Rechargement : persistance.
  await page.reload();
  await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(5);
});

test("Ouvertures foundation : porte, fenêtre, baie, ouverture libre (wall_id, position, largeur, hauteur, type)", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  const ids = await rectangleWalls(page);
  await tool(page, "Sélection");
  // Lot 6 : les ouvertures ne se chevauchent plus et évitent les jonctions — 83 + 120 + 240 + 90 cm
  // ne tiennent pas sur un mur de 4,20 m (4,00 m libres entre les angles) : elles sont réparties
  // sur les quatre murs du rectangle.
  const panel = page.getByTestId("plan-wall-panel");
  for (const [wall, labels] of [[ids[0], ["+ Baie"]], [ids[1], ["+ Ouverture libre"]], [ids[3], ["+ Fenêtre"]], [ids[2], ["+ Porte"]]] as const) {
    const w = await wallScreen(page, wall);
    await page.mouse.click(w.quarter.x, w.quarter.y);
    await expect(panel).toBeVisible();
    for (const label of labels) await panel.getByRole("button", { name: label }).click();
  }
  await expect(page.locator('[data-testid="plan-ouverture"]')).toHaveCount(4);
  // Porte : position 30 cm depuis A, largeur 90 cm.
  await panel.getByRole("button", { name: /^Porte/ }).click();
  await page.getByTestId("plan-ouverture-position").fill("30"); await page.getByTestId("plan-ouverture-position").press("Enter");
  await page.getByTestId("plan-ouverture-largeur").fill("90"); await page.getByTestId("plan-ouverture-largeur").press("Enter");
  await saved(page);
  const openings = (await planWalls()).filter((x) => x.type === "ouverture");
  expect(openings).toHaveLength(4);
  expect(new Set(openings.map((o) => o.parent_element_id))).toEqual(new Set(ids));
  expect(openings.map((o) => o.donnees.typeOuverture).sort()).toEqual(["baie", "fenetre", "passage", "porte"]);
  const porte = openings.find((o) => o.donnees.typeOuverture === "porte")!.donnees as unknown as { decalageMm: number; largeurMm: number; hauteurMm: number };
  expect(porte).toMatchObject({ decalageMm: 300, largeurMm: 900, hauteurMm: 2040 });
});

test("Corrections : redresser, scinder, fusionner, aligner", async ({ page }) => {
  // Deux murs saisis « de travers » par l'API (plan en cours, révision courante).
  const { data: plan } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  const crooked = uuid(); const second = uuid();
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: (plan as { revision: number }).revision, p_modifications: { murs: [
    { id: crooked, pieceId: null, donnees: { a: { x: 0, y: -4000 }, b: { x: 3000, y: -3850 }, epaisseurMm: 100, hauteurMm: 2500, typeMur: "cloison" } },
    { id: second, pieceId: null, donnees: { a: { x: 3000, y: -3850 }, b: { x: 6000, y: -3700 }, epaisseurMm: 100, hauteurMm: 2500, typeMur: "cloison" } },
  ] } }));
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  await tool(page, "Sélection");
  let w = await wallScreen(page, crooked);
  await page.mouse.click(w.mid.x, w.mid.y);
  await page.getByRole("button", { name: "Redresser" }).click();
  await expect(page.getByTestId("plan-wall-angle")).toHaveValue("0");
  // Aligner le second sur le premier (Maj + clic), puis fusionner.
  w = await wallScreen(page, crooked); const w2 = await wallScreen(page, second);
  await page.mouse.click(w.mid.x, w.mid.y);
  await page.keyboard.down("Shift"); await page.mouse.click(w2.mid.x, w2.mid.y); await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Aligner sur le premier" }).click();
  await page.getByRole("button", { name: "Fusionner" }).click();
  await expect(page.locator(`[data-testid="plan-mur"][data-id="${second}"]`)).toHaveCount(0);
  await saved(page);
  let walls = await planWalls();
  const merged = walls.find((x) => x.id === crooked)!.donnees;
  expect(Math.abs(merged.a.y - merged.b.y)).toBeLessThan(1);
  expect(Math.round(lengthOf(merged))).toBeGreaterThan(5900);
  // Scinder au milieu : deux murs.
  w = await wallScreen(page, crooked);
  await page.mouse.click(w.mid.x, w.mid.y);
  await page.getByRole("button", { name: "Scinder au milieu" }).click();
  await saved(page);
  walls = await planWalls();
  expect(walls.filter((x) => x.type === "mur" && Math.abs(x.donnees.a.y + 4000) < 1)).toHaveLength(2);
});

test("Repère photo : clic → la photo s'affiche", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  await tool(page, "Sélection");
  const marker = page.locator('[data-testid="plan-photo"][data-source="plan"] circle');
  const [cx, cy] = [Number(await marker.getAttribute("cx")), Number(await marker.getAttribute("cy"))];
  const at = await onCanvas(page, { x: cx, y: cy });
  await page.mouse.click(at.x, at.y);
  const panel = page.getByTestId("plan-photo-panel");
  await expect(panel.getByRole("img", { name: "Fissure en pied de mur" })).toBeVisible();
  await expect(panel.getByRole("img")).toHaveJSProperty("naturalWidth", 640);
});

test("Conflit de version : modification concurrente détectée, rien n'est écrasé", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  await expect(page.locator('[data-testid="plan-mur"]')).not.toHaveCount(0);
  // Un autre appareil enregistre entre-temps.
  const { data: plan } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: (plan as { revision: number }).revision, p_modifications: { reglages: { epaisseurMm: 150 } } }));
  const ids = await rectangleWalls(page);
  await tool(page, "Sélection");
  const w = await wallScreen(page, ids[0]);
  await page.mouse.click(w.mid.x, w.mid.y);
  await page.getByTestId("plan-wall-epaisseur").fill("25"); await page.getByTestId("plan-wall-epaisseur").press("Enter");
  await expect(saveStatus(page)).toHaveText(/Modifié ailleurs/, { timeout: 20_000 });
  const { data: after } = must(await ctx.a.from("tools_releves_plans").select("reglages").eq("id", planId).single());
  expect((after as { reglages: { epaisseurMm: number } }).reglages.epaisseurMm).toBe(150);
  // L'utilisateur garde sa saisie : réappliquée sur la version serveur.
  await saveStatus(page).getByRole("button", { name: "Garder ma saisie" }).click();
  await saved(page);
  expect((await planWalls()).find((x) => x.id === ids[0])!.donnees.epaisseurMm).toBe(250);
});

test("Versioning : plan figé immuable, plan corrigé dérivé, plan initial intact", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(planUrl());
  const before = (await planWalls()).map((x) => x.id).sort();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Figer ce plan" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText(/figé/);
  await expect(page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name: "Mur", exact: true })).toHaveCount(0);
  const { data: frozen } = must(await ctx.a.from("tools_releves_plans").select("fige_le,empreinte,version_id").eq("id", planId).single());
  expect(frozen).toMatchObject({ empreinte: expect.stringMatching(/^[0-9a-f]{64}$/) });
  // Écriture directe refusée par le serveur.
  const refused = await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: 999, p_modifications: {} });
  expect(refused.error).not.toBeNull();
  // Plan corrigé.
  await page.getByRole("button", { name: "Nouveau plan corrigé" }).click();
  await expect(page.getByTestId("plan-etat")).toHaveText("Corrigée");
  const { data: plans } = must(await ctx.a.from("tools_releves_plans").select("id,numero,etat_documente,plan_base_id").eq("etage_id", ctx.etageId).order("numero"));
  expect((plans as Array<{ etat_documente: string }>).map((p) => p.etat_documente)).toEqual(["initial", "corrige"]);
  const corrige = (plans as Array<{ id: string }>)[1].id;
  const { data: copies } = must(await ctx.a.from("tools_releves_elements").select("id,donnees").eq("plan_id", corrige).is("deleted_at", null));
  expect((copies as Array<{ donnees: { origineId?: string } }>).every((x) => typeof x.donnees.origineId === "string")).toBe(true);
  // La photo rattachée au mur d'origine reste sur le plan corrigé (lignée origineId).
  await expect(page.locator('[data-testid="plan-photo"][data-source="mur"]')).toHaveCount(1);
  // Modifier le plan corrigé ne touche pas le plan figé.
  const copy = (copies as Array<{ id: string; donnees: { origineId?: string } }>).find((x) => x.donnees.origineId === rectangle[1])!.id;
  await tool(page, "Sélection");
  const w = await wallScreen(page, copy);
  await page.mouse.click(w.quarter.x, w.quarter.y);
  await page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button", { name: "Supprimer" }).click();
  await saved(page);
  expect((await planWalls()).map((x) => x.id).sort()).toEqual(before);
  planId = corrige;
});

test("Portée zone et pièce : plan cadré, lien depuis la fiche pièce", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.sejourId}`);
  await page.getByTestId("lien-plan-piece").click();
  await expect(page).toHaveURL(new RegExp(`piece=${ctx.sejourId}`));
  await expect(page.getByText("PLAN 2D · PIÈCE · SÉJOUR")).toBeVisible();
  await expect(page.locator(`[data-testid="plan-contour"][data-piece="${ctx.sejourId}"]`)).toHaveAttribute("data-scope", "true");
  await page.goto(planUrl(`&zone=${ctx.zoneId}`));
  await expect(page.getByText("PLAN 2D · ZONE · APPARTEMENT 1")).toBeVisible();
});

test("Sécurité : un autre tenant ne voit ni ne modifie le plan", async ({ page }) => {
  const { data } = await ctx.b.from("tools_releves_plans").select("id").eq("id", planId);
  expect(data ?? []).toHaveLength(0);
  const write = await ctx.b.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: 1, p_modifications: {} });
  expect(write.error?.code).toBe("42501");
  const create = await ctx.b.rpc("tools_releve_plan_creer", { p_etage_id: ctx.r1Id, p_etat: "initial" });
  expect(create.error?.code).toBe("42501");
  const direct = await ctx.a.from("tools_releves_plans").update({ libelle: "x" }).eq("id", planId);
  expect(direct.error).not.toBeNull();
  await signIn(page, EMAIL_B);
  await page.goto(planUrl());
  await expect(page.getByText(/introuvable|non accessible|droits|Accès/i).first()).toBeVisible();
  await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tablette (priorité dessin) et smartphone — Chromium en émulation tactile
// ─────────────────────────────────────────────────────────────────────────────
const TABLET: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
const PHONE: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };

/** Geste tactile multipoint : UNE session CDP par geste (l'état des contacts vit dans la session). */
type Cdp = Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>;
async function touch(cdp: Cdp, type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number }>) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
}

async function zoomLabel(page: Page) {
  return Number((await page.locator("text=/Zoom \\d+ %/").first().textContent())!.match(/(\d+)/)![1]);
}

test("Tablette 820×1180 : tracé au toucher, pincement deux doigts, pan un doigt, sélection au toucher", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(TABLET);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(planUrl(`&plan=${planId}`));
    await expect(page.locator('[data-testid="plan-mur"]').first()).toBeAttached();
    const count = await page.locator('[data-testid="plan-mur"]').count();
    // Tracé simplifié : un toucher pour le départ, un toucher pour l'arrivée (accrochage tactile plus large).
    await tool(page, "Mur", true);
    await canvas(page).scrollIntoViewIfNeeded();
    const box = (await canvas(page).boundingBox())!;
    const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.8 };
    await page.touchscreen.tap(start.x, start.y);
    await page.touchscreen.tap(start.x + 180, start.y + 3);
    await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(count + 1);
    await page.getByRole("button", { name: "Terminer" }).tap();
    await saved(page);
    // Pincement : écarter deux doigts → zoom avant.
    const zoom0 = await zoomLabel(page);
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await context.newCDPSession(page);
    const started = Date.now();
    await touch(cdp, "touchStart", [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }]);
    for (let step = 1; step <= 8; step++) await touch(cdp, "touchMove", [{ x: c.x - 40 - step * 15, y: c.y }, { x: c.x + 40 + step * 15, y: c.y }]);
    await touch(cdp, "touchEnd", []);
    perf.tabletPinchMs = Date.now() - started;
    expect(await zoomLabel(page)).toBeGreaterThan(zoom0 * 1.5);
    // Pan un doigt : le plan se déplace.
    await tool(page, "Sélection", true);
    const panBox = (await canvas(page).boundingBox())!;
    c.x = panBox.x + panBox.width / 2; c.y = panBox.y + panBox.height / 2;
    const cadre = page.getByTestId("plan-cadre");
    const x0 = Number(await cadre.getAttribute("x"));
    await touch(cdp, "touchStart", [{ x: c.x, y: c.y }]);
    for (let step = 1; step <= 6; step++) await touch(cdp, "touchMove", [{ x: c.x + step * 20, y: c.y }]);
    await touch(cdp, "touchEnd", []);
    await expect.poll(async () => Number(await cadre.getAttribute("x"))).toBeGreaterThan(x0 + 60);
    await cdp.detach();
    // Fin du geste émulé : Chromium ignore un toucher trop rapproché d'une séquence CDP.
    await page.waitForTimeout(1_000);
    // Sélection au toucher : un mur, panneau propriétés.
    await page.getByRole("button", { name: "Recentrer" }).tap();
    await expect(page.locator('[data-testid="plan-mur"]')).not.toHaveCount(0);
    await tool(page, "Sélection", true);
    // Le mur le plus long à l'écran (cible confortable au doigt).
    const id = await page.locator('[data-testid="plan-mur"]').evaluateAll((nodes) => nodes
      .map((n) => ({ id: n.getAttribute("data-id"), l: Math.hypot(Number(n.getAttribute("x2")) - Number(n.getAttribute("x1")), Number(n.getAttribute("y2")) - Number(n.getAttribute("y1"))) }))
      .sort((x, y) => y.l - x.l)[0].id);
    const w = await wallScreen(page, id!);
    await page.touchscreen.tap(w.quarter.x, w.quarter.y);
    await expect(page.getByTestId("plan-wall-panel"), `message : ${await page.getByTestId("plan-message").textContent()}`).toBeVisible();
    // Outils ≥ 44 px, aucun débordement horizontal.
    const heights = await page.getByRole("toolbar", { name: "Outils du plan" }).getByRole("button").evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    expect(await sansDebordement(page)).toBe(true);
    await context.close();
  } finally { await browser.close(); }
});

test("Smartphone 390×844 : consultation, tracé au toucher, aucun débordement", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(planUrl(`&plan=${planId}`));
    await expect(page.locator('[data-testid="plan-mur"]').first()).toBeAttached();
    expect(await sansDebordement(page)).toBe(true);
    const count = await page.locator('[data-testid="plan-mur"]').count();
    await tool(page, "Mur", true);
    await canvas(page).scrollIntoViewIfNeeded();
    const box = (await canvas(page).boundingBox())!;
    await page.touchscreen.tap(box.x + 60, box.y + box.height - 60);
    await page.touchscreen.tap(box.x + 220, box.y + box.height - 60);
    await expect(page.locator('[data-testid="plan-mur"]')).toHaveCount(count + 1);
    await saved(page);
    expect(await sansDebordement(page)).toBe(true);
    await context.close();
  } finally { await browser.close(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance : 50 / 100 / 250 / 500 murs (render, pan, zoom, edit, save)
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

for (const size of [50, 100, 250, 500]) {
  test(`Performance : ${size} murs (rendu, pan, zoom, édition, sauvegarde)`, async ({ page }) => {
    // Étage dédié, plan initial, grille de murs (cellules 3 m, pièces fermées), chargés en UN lot.
    const etageId = uuid();
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: `Perf ${size}`, niveau: 10 + size / 50, ordre: 10 }));
    const created = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: "initial" }));
    const perfPlan = created.data as { id: string; revision: number };
    const murs: unknown[] = [];
    const columns = Math.ceil(Math.sqrt(size / 2));
    for (let k = 0; murs.length < size; k++) {
      const row = Math.floor(k / columns); const col = k % columns;
      const x = col * 3000; const y = row * 3000;
      murs.push({ id: uuid(), pieceId: null, donnees: { a: { x, y }, b: { x: x + 3000, y }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } });
      if (murs.length < size) murs.push({ id: uuid(), pieceId: null, donnees: { a: { x, y }, b: { x, y: y + 3000 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } });
    }
    const saveStarted = Date.now();
    must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: perfPlan.id, p_revision: perfPlan.revision, p_modifications: { murs } }));
    const bulkSaveMs = Date.now() - saveStarted;

    await signIn(page, EMAIL_A);
    const renderStarted = Date.now();
    await page.goto(`${BASE}/releves/plan?id=${ctx.releveId}&etage=${etageId}`);
    await expect(page.getByTestId("plan-compteurs")).toContainText(`${size} mur(s)`, { timeout: 60_000 });
    await expect(page.locator('[data-testid="plan-mur"]').first()).toBeAttached();
    const renderMs = Date.now() - renderStarted;
    const drawn = await page.locator('[data-testid="plan-mur"]').count();

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
    // Édition : sélection d'un mur visible puis longueur saisie ; mesure jusqu'à la cote mise à jour.
    const id = await page.locator('[data-testid="plan-mur"]').nth(Math.floor(drawn / 2)).getAttribute("data-id");
    await tool(page, "Sélection");
    const w = await wallScreen(page, id!);
    await page.mouse.click(w.mid.x, w.mid.y);
    await expect(page.getByTestId("plan-wall-panel")).toBeVisible();
    const editStarted = Date.now();
    await page.getByTestId("plan-wall-longueur").fill("250");
    await page.getByTestId("plan-wall-longueur").press("Enter");
    await expect(page.getByTestId("plan-wall-panel").getByRole("heading", { level: 2 })).toHaveText("Mur · 2,50 m");
    const editMs = Date.now() - editStarted;
    const saveEditStarted = Date.now();
    await saved(page);
    const autosaveMs = Date.now() - saveEditStarted;
    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    perf[`murs_${size}`] = { bulkSaveMs, renderMs, drawnWalls: drawn, pan, zoom, editMs, autosaveMs, heapMb: Math.round(heap / 1e6) };
    expect(renderMs).toBeLessThan(20_000);
    expect(pan.p95FrameMs).toBeLessThan(250);
    expect(editMs).toBeLessThan(5_000);
  });
}
