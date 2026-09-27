import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readExifSummary } from "../../packages/releve-domain/src/exif";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 4 : capture terrain photo & médias, sur pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS + surface Storage locale dont les
 * métadonnées et les policies sont celles de `storage.objects`, octets sur disque).
 *
 * Pile : scripts/local-postgres-bootstrap/releve_e2e_stack.sh ; Tools en `next dev` (port 3020).
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot4.spec.ts --project=desktop-chromium
 *
 * Mobile : Chromium en émulation (viewport, `isMobile`, tactile, user-agent) de profils iPhone,
 * Android et tablette. Ce n'est PAS un WebKit iOS réel ni un appareil physique (voir le rapport).
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const SUPABASE_URL = process.env.RELEVE_E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.RELEVE_E2E_ANON_KEY ?? "";
const EMAIL_A = process.env.RELEVE_E2E_EMAIL_A ?? "";
const EMAIL_B = process.env.RELEVE_E2E_EMAIL_B ?? "";
const PASSWORD = process.env.RELEVE_E2E_PASSWORD ?? "";
const CHROME = process.env.PW_CHROME_PATH;
const BUCKET = "tools-releves";

test.describe.configure({ mode: "serial" });
test.skip(!BASE || !SUPABASE_URL || !ANON_KEY || !EMAIL_A || !EMAIL_B || !PASSWORD, "pile Relevé locale non configurée (RELEVE_E2E_*)");
test.setTimeout(120_000);

const suffix = Date.now().toString(36);
const dir = join(tmpdir(), `releve-lot4-${suffix}`);
const PHOTO_GPS = join(dir, "terrain-12mpx-exif-gps.jpg");
const PHOTO_PNG = join(dir, "capture-ecran.png");
const PHOTO_2 = join(dir, "terrain-remplacement.jpg");

type Ctx = { a: SupabaseClient; b: SupabaseClient; tenantA: string; tenantB: string; releveId: string; etageId: string; pieceId: string; murId: string; equipementId: string };
let ctx: Ctx;

async function client(email: string): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return supabase;
}

const uuid = () => crypto.randomUUID();
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function makePhotos() {
  mkdirSync(dir, { recursive: true });
  const noisy = (width: number, height: number, tint: number) => {
    const raw = Buffer.alloc(width * height * 3);
    for (let index = 0; index < raw.length; index += 3) {
      const n = (Math.random() * 90) | 0; const x = (index / 3) % width; const y = Math.floor(index / 3 / width);
      raw[index] = (x * 255 / width + n) & 255; raw[index + 1] = (y * 255 / height + n) & 255; raw[index + 2] = (tint + n) & 255;
    }
    return sharp(raw, { raw: { width, height, channels: 3 } });
  };
  await noisy(4032, 3024, 128).jpeg({ quality: 95 }).withExif({
    IFD0: { Make: "TestCam", Model: "Field 1" },
    IFD2: { DateTimeOriginal: "2026:09:27 14:05:33", OffsetTimeOriginal: "+02:00" },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 34/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "7/1 45/1 0/1" },
  }).toFile(PHOTO_GPS);
  await noisy(1280, 960, 40).png().toFile(PHOTO_PNG);
  await noisy(3000, 4000, 200).jpeg({ quality: 90 }).toFile(PHOTO_2);
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}

const photosUrl = () => `${BASE}/releves/photos?id=${ctx.releveId}`;
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function importPhoto(page: Page, file: string, target?: { kind: string; label?: RegExp }) {
  const capture = page.getByRole("region", { name: "Nouvelle photo" });
  if (target) {
    await capture.getByLabel("Rattacher à").selectOption(target.kind);
    if (target.label) await capture.locator("#capture-id").selectOption({ label: (await capture.locator("#capture-id option").allTextContents()).find((text) => target.label!.test(text))! });
  }
  await page.getByTestId("input-import").setInputFiles(file);
  const preview = page.getByRole("region", { name: "Prévisualisation" });
  await expect(preview.getByRole("img", { name: "Prévisualisation de la photo" })).toBeVisible();
  return preview;
}

test.beforeAll(async () => {
  await makePhotos();
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const tenant = async (supabase: SupabaseClient) => {
    const { data: session } = await supabase.auth.getUser();
    const { data } = await supabase.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
    return (data as { entreprise_id: string }).entreprise_id;
  };
  const [tenantA, tenantB] = [await tenant(a), await tenant(b)];
  const releveId = uuid(); const batimentId = uuid(); const etageId = uuid(); const pieceId = uuid(); const murId = uuid(); const equipementId = uuid();
  const must = (result: { error: unknown }) => { if (result.error) throw new Error(JSON.stringify(result.error)); };
  must(await a.from("tools_releves").insert({ id: releveId, entreprise_id: tenantA, nom: `Relevé photos ${suffix}`, chantier_nom: "Résidence Lot 4" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: releveId, nom: "Résidence Lot 4" }));
  must(await a.from("tools_releves_batiments").insert({ id: batimentId, releve_id: releveId, chantier_id: chantierId, nom: "Bâtiment A" }));
  must(await a.from("tools_releves_etages").insert({ id: etageId, releve_id: releveId, batiment_id: batimentId, nom: "RDC", niveau: 0 }));
  must(await a.from("tools_releves_pieces").insert({ id: pieceId, releve_id: releveId, etage_id: etageId, nom: "Séjour", usage: "sejour" }));
  must(await a.from("tools_releves_elements").insert({ id: murId, releve_id: releveId, type: "mur", etage_id: etageId, piece_id: pieceId, donnees: { a: { x: 0, y: 0 }, b: { x: 4200, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } }));
  must(await a.from("tools_releves_elements").insert({ id: equipementId, releve_id: releveId, type: "equipement", etage_id: etageId, piece_id: pieceId, donnees: { categorie: "electricite", libelle: "Tableau électrique", position: { x: 100, y: 100 }, rotationRad: 0, largeurMm: null, profondeurMm: null, hauteurMm: null } }));
  ctx = { a, b, tenantA, tenantB, releveId, etageId, pieceId, murId, equipementId };
});

// ─────────────────────────────────────────────────────────────────────────────
// Storage : upload, read, signed URL, delete, cross-tenant
// ─────────────────────────────────────────────────────────────────────────────
test("Storage : dépôt, lecture, URL signée, suppression et isolation entre tenants", async () => {
  const bytes = new Uint8Array(readFileSync(PHOTO_PNG));
  const mediaId = uuid();
  const path = `${ctx.tenantA}/${ctx.releveId}/photos/${mediaId}.png`;
  const storageA = ctx.a.storage.from(BUCKET); const storageB = ctx.b.storage.from(BUCKET);

  // Upload (sans écrasement) puis doublon refusé (409 → « déjà présent » côté adaptateur).
  expect((await storageA.upload(path, bytes, { contentType: "image/png", upsert: false })).error).toBeNull();
  expect((await storageA.upload(path, bytes, { contentType: "image/png", upsert: false })).error).not.toBeNull();
  // Read authentifié : octets identiques.
  const read = await storageA.download(path);
  expect(read.error).toBeNull();
  expect(sha256(new Uint8Array(await read.data!.arrayBuffer()))).toBe(sha256(bytes));
  // URL signée courte : lisible sans jeton de session, octets identiques.
  const signed = await storageA.createSignedUrl(path, 600);
  expect(signed.error).toBeNull();
  const response = await fetch(signed.data!.signedUrl);
  expect(response.status).toBe(200);
  expect(sha256(new Uint8Array(await response.arrayBuffer()))).toBe(sha256(bytes));
  // Jeton altéré : refusé.
  expect((await fetch(signed.data!.signedUrl.replace(/token=[^&]+/, "token=forge"))).status).toBe(400);

  // Cross-tenant : B ne lit pas, ne signe pas, ne supprime pas, ne dépose pas chez A.
  expect((await storageB.download(path)).error).not.toBeNull();
  expect((await storageB.createSignedUrl(path, 600)).error).not.toBeNull();
  await storageB.remove([path]);
  expect((await storageA.download(path)).error).toBeNull();
  const intrusion = await storageB.upload(`${ctx.tenantA}/${ctx.releveId}/photos/${uuid()}.png`, bytes, { contentType: "image/png" });
  expect(intrusion.error).not.toBeNull();
  // Chemin non canonique et type refusé par le bucket.
  expect((await storageA.upload(`${ctx.tenantA}/${ctx.releveId}/photos/../x.png`, bytes, { contentType: "image/png" })).error).not.toBeNull();
  expect((await storageA.upload(`${ctx.tenantA}/${ctx.releveId}/photos/${uuid()}.png`, bytes, { contentType: "image/gif" })).error).not.toBeNull();

  // Delete par le propriétaire : l'objet disparaît, la lecture et l'URL signée échouent.
  const removed = await storageA.remove([path]);
  expect(removed.error).toBeNull();
  expect(removed.data?.map((file) => file.name)).toEqual([path]);
  expect((await storageA.download(path)).error).not.toBeNull();
  expect((await fetch(signed.data!.signedUrl)).status).toBe(404);
});

// ─────────────────────────────────────────────────────────────────────────────
// Parcours desktop : import, métadonnées, repères, annotations, persistance
// ─────────────────────────────────────────────────────────────────────────────
let mediaId = "";

test("import d'une photo 12 Mpx : compression, date EXIF, GPS retiré, rattachement à une pièce", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await expect(page.getByRole("heading", { name: `Relevé photos ${suffix}` })).toBeVisible();
  const capture = page.getByRole("region", { name: "Nouvelle photo" });
  // Faisabilité : champ de capture système présent (appareil photo sur mobile).
  await expect(page.getByTestId("input-capture")).toHaveAttribute("capture", "environment");
  await expect(page.getByTestId("input-capture")).toHaveAttribute("accept", "image/*");
  await expect(capture.getByLabel("Rattacher à").locator("option")).toHaveText(["Relevé", "Bâtiment", "Étage", "Zone", "Pièce", "Mur", "Équipement", "Point du plan"].filter((label) => label !== "Zone"));

  await capture.getByLabel("Légende (facultatif)").fill("Séjour, mur nord");
  const preview = await importPhoto(page, PHOTO_GPS, { kind: "piece", label: /Séjour/ });
  await expect(preview.getByText("GPS d’origine retiré")).toBeVisible();
  const weight = await preview.getByTestId("preview-weight").textContent();
  const [before, after] = (weight ?? "").split("→").map((part) => Number(part.replace(/[^\d,]/g, "").replace(",", ".")));
  expect(before).toBeGreaterThan(9);
  expect(after).toBeLessThan(before / 2);
  await expect(preview.getByText("3072 × 2304 px")).toBeVisible();
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText(/1 photo\(s\) synchronisée\(s\)/);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(1);

  // Vérité serveur : ligne média, métadonnées de preuve, fichier stocké sans EXIF ni GPS.
  const { data: rows } = await ctx.a.from("tools_releves_medias").select("*").eq("releve_id", ctx.releveId).is("deleted_at", null);
  expect(rows).toHaveLength(1);
  const media = rows![0] as { id: string; storage_path: string; taille_octets: number; created_by: string; metadata: Record<string, unknown> };
  mediaId = media.id;
  expect(media.metadata).toMatchObject({ source: "import", priseLe: "2026-09-27T14:05:33+02:00", priseLeSource: "exif", orientation: "paysage", largeurPx: 3072, hauteurPx: 2304, gpsRetire: true });
  expect(Object.keys(media.metadata).join(",")).not.toMatch(/gps(?!Retire)|lat|lon/i);
  const stored = new Uint8Array(await (await ctx.a.storage.from(BUCKET).download(media.storage_path)).data!.arrayBuffer());
  expect(stored.byteLength).toBe(Number(media.taille_octets));
  expect(sha256(stored)).toBe(media.metadata.empreinteSha256);
  expect(readExifSummary(stored)).toMatchObject({ hasGps: false, dateTimeOriginal: null });
  expect(Buffer.from(stored).includes(Buffer.from("TestCam"))).toBe(false);
  const { data: anchors } = await ctx.a.from("tools_releves_elements").select("*").eq("type", "photo_anchor").eq("releve_id", ctx.releveId);
  expect(anchors?.[0]).toMatchObject({ etage_id: ctx.etageId, piece_id: ctx.pieceId, donnees: { mediaId, legende: "Séjour, mur nord", ancre: { kind: "entite", ref: { kind: "piece", id: ctx.pieceId } } } });
});

test("repères et annotations (texte, flèche, cercle) sur la photo, persistés après rechargement", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await page.getByTestId("photo-thumb").first().click();
  const detail = page.getByRole("region", { name: "Photo sélectionnée" });
  const overlay = detail.getByTestId("photo-overlay");
  await expect(detail.getByRole("img", { name: "Séjour, mur nord" })).toBeVisible();
  await expect(detail.getByText("GPS d’origine retiré")).toBeVisible();
  const box = (await overlay.boundingBox())!;
  const at = (x: number, y: number) => ({ position: { x: box.width * x, y: box.height * y } });

  await detail.getByRole("button", { name: "Repère", exact: true }).click();
  await overlay.click(at(0.25, 0.5));
  await detail.getByLabel("Libellé du repère").fill("Tableau électrique");
  await detail.getByLabel("Objet désigné (facultatif)").selectOption({ label: "Tableau électrique · RDC" });
  await detail.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(detail.getByText("1. Tableau électrique")).toBeVisible();
  await overlay.click(at(0.75, 0.2));
  await detail.getByLabel("Libellé du repère").fill("Angle nord-est");
  await detail.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(detail.getByText("2. Angle nord-est")).toBeVisible();
  await detail.getByRole("button", { name: "Monter Angle nord-est" }).click();
  await expect(detail.getByText("1. Angle nord-est")).toBeVisible();

  await detail.getByRole("button", { name: "Flèche", exact: true }).click();
  await overlay.click(at(0.1, 0.1)); await overlay.click(at(0.4, 0.45));
  await expect(overlay.getByTestId("annotation-fleche")).toHaveCount(1);
  await detail.getByRole("button", { name: "Cercle", exact: true }).click();
  await overlay.click(at(0.6, 0.6)); await overlay.click(at(0.7, 0.6));
  await expect(overlay.getByTestId("annotation-cercle")).toHaveCount(1);
  await detail.getByRole("button", { name: "Texte", exact: true }).click();
  await overlay.click(at(0.5, 0.85));
  await detail.getByLabel("Texte").fill("Humidité en pied de mur");
  await detail.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(overlay.getByTestId("annotation-texte")).toHaveText("Humidité en pied de mur");

  await page.reload();
  await page.getByTestId("photo-thumb").first().click();
  const reloaded = page.getByRole("region", { name: "Photo sélectionnée" });
  await expect(reloaded.getByTestId("repere")).toHaveCount(2);
  await expect(reloaded.getByTestId("photo-overlay").locator("[data-testid^=annotation-]")).toHaveCount(3);
  const { data } = await ctx.a.from("tools_releves_elements").select("donnees").eq("type", "photo_anchor").eq("releve_id", ctx.releveId).is("deleted_at", null).single();
  const reperes = (data as { donnees: { reperes: Array<{ x: number; y: number; label: string; ordre: number; cible: { kind: string; id: string } | null }> } }).donnees.reperes;
  expect(reperes.map((repere) => [repere.label, repere.ordre])).toEqual(expect.arrayContaining([["Angle nord-est", 0], ["Tableau électrique", 1]]));
  const tableau = reperes.find((repere) => repere.label === "Tableau électrique")!;
  expect(tableau.cible).toEqual({ kind: "element", id: ctx.equipementId });
  expect(tableau.x).toBeCloseTo(0.25, 1); expect(tableau.y).toBeCloseTo(0.5, 1);
});

test("rattachements multiples : mur, équipement, point du plan futur ; la photo n'est jamais orpheline", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await page.getByTestId("photo-thumb").first().click();
  const detail = page.getByRole("region", { name: "Photo sélectionnée" });
  await detail.getByRole("button", { name: "Ajouter un rattachement" }).click();
  await detail.locator("#attach-kind").selectOption("plan");
  await detail.getByRole("button", { name: "Placer le point sur le plan futur" }).click({ position: { x: 26, y: 58 } });
  await detail.getByRole("button", { name: "Rattacher" }).click();
  await expect(detail.getByText(/Point du plan · RDC/)).toBeVisible();
  await detail.getByRole("button", { name: "Ajouter un rattachement" }).click();
  await detail.locator("#attach-kind").selectOption("mur");
  await detail.getByRole("button", { name: "Rattacher" }).click();
  await expect(detail.getByText("Mur", { exact: true })).toBeVisible();
  const { data } = await ctx.a.from("tools_releves_elements").select("donnees,etage_id").eq("type", "photo_anchor").eq("releve_id", ctx.releveId).is("deleted_at", null);
  const ancres = (data as Array<{ donnees: { ancre: { kind: string; x?: number; ref?: { kind: string; id: string } } } }>).map((row) => row.donnees.ancre);
  expect(ancres).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "plan" }), { kind: "entite", ref: { kind: "element", id: ctx.murId } }]));
  const plan = ancres.find((ancre) => ancre.kind === "plan")!;
  expect(plan.x).toBeGreaterThan(0); expect(plan.x).toBeLessThan(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Caméra en direct (getUserMedia) : Chromium avec périphérique vidéo simulé
// ─────────────────────────────────────────────────────────────────────────────
test("caméra en direct : aperçu getUserMedia, capture, dépôt (source camera_web, date = horloge de capture)", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    const context = await browser.newContext({ permissions: ["camera"] });
    const page = await context.newPage();
    const response = await page.goto(`${BASE}/compte`);
    // En-têtes : caméra ouverte à la même origine seulement, géolocalisation toujours fermée.
    const policy = (await response!.allHeaders())["permissions-policy"] ?? "";
    expect(policy).toContain("camera=(self)"); expect(policy).toContain("geolocation=()"); expect(policy).toContain("microphone=()");
    await signIn(page, EMAIL_A);
    await page.goto(photosUrl());
    const capture = page.getByRole("region", { name: "Nouvelle photo" });
    await capture.getByRole("button", { name: "Caméra" }).click();
    const camera = page.getByRole("dialog", { name: "Caméra" });
    await expect(camera.getByLabel("Aperçu de la caméra")).toBeVisible();
    await expect(camera.getByRole("button", { name: "Capturer la photo" })).toBeEnabled();
    expect(await page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await camera.getByRole("button", { name: "Capturer la photo" }).click();
    await expect(camera).toHaveCount(0);
    // Le flux est coupé après la capture (voyant caméra éteint).
    expect(await page.evaluate(() => document.querySelectorAll("video").length)).toBe(0);
    await page.getByRole("region", { name: "Prévisualisation" }).getByRole("button", { name: "Enregistrer la photo" }).click();
    await expect(page.getByTestId("photo-thumb")).toHaveCount(2);
    const { data } = await ctx.a.from("tools_releves_medias").select("metadata,created_at").eq("releve_id", ctx.releveId).is("deleted_at", null);
    const camMedia = (data as Array<{ metadata: Record<string, unknown> }>).find((row) => row.metadata.source === "camera_web")!;
    expect(camMedia.metadata).toMatchObject({ source: "camera_web", priseLeSource: "capture", gpsRetire: false });
    await context.close();
  } finally {
    await browser.close();
  }
});

test("caméra refusée : message clair et repli sur l'appareil photo système / l'import", async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-fake-device-for-media-stream"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(photosUrl());
    page.on("dialog", (dialog) => void dialog.dismiss());
    await context.clearPermissions();
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("refus", "NotAllowedError")); });
    await page.getByRole("region", { name: "Nouvelle photo" }).getByRole("button", { name: "Caméra" }).click();
    await expect(page.getByRole("dialog", { name: "Caméra" }).getByRole("alert")).toHaveText(/Accès à la caméra refusé/);
    await page.getByRole("dialog", { name: "Caméra" }).getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("region", { name: "Nouvelle photo" }).getByRole("button", { name: "Prendre une photo" })).toBeVisible();
    await context.close();
  } finally {
    await browser.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// File « à synchroniser » : coupure réseau, persistance IndexedDB, reprise
// ─────────────────────────────────────────────────────────────────────────────
test("hors ligne : la photo reste dans la file locale (IndexedDB, survit au rechargement) puis se synchronise", async ({ page, context }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await expect(page.getByTestId("photo-thumb")).toHaveCount(2);
  await context.setOffline(true);
  await expect(page.getByText("Hors ligne", { exact: false }).first()).toBeVisible();
  const preview = await importPhoto(page, PHOTO_PNG);
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  const queue = page.getByRole("region", { name: "À synchroniser" });
  await expect(queue.getByText("Relevé", { exact: true })).toBeVisible();
  await expect(queue.getByText("À synchroniser", { exact: true })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((db) => db.name ?? "");
    return names.filter((name) => name.startsWith("elsatia-releve-file:"));
  });
  expect(stored).toHaveLength(1);

  // Retour du réseau MAIS Storage encore injoignable : l'élément reste en file ; rechargement complet.
  await page.route(`${SUPABASE_URL}/storage/v1/object/**`, (route) => route.abort("internetdisconnected"));
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toBeVisible();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(2);
  // Storage revient : « Réessayer » synchronise, la file se vide.
  await page.unroute(`${SUPABASE_URL}/storage/v1/object/**`);
  await page.getByRole("region", { name: "À synchroniser" }).getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toHaveCount(0);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(3);
});

// ─────────────────────────────────────────────────────────────────────────────
// Remplacement, suppression (Storage), isolation tenant dans l'interface
// ─────────────────────────────────────────────────────────────────────────────
test("remplacement puis suppression : ancres conservées, anciens fichiers retirés du bucket", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  const oldPath = ((await ctx.a.from("tools_releves_medias").select("storage_path").eq("id", mediaId).single()).data as { storage_path: string }).storage_path;
  await page.getByRole("button", { name: /Séjour, mur nord/ }).click();
  const detail = page.getByRole("region", { name: "Photo sélectionnée" });
  const chooser = page.waitForEvent("filechooser");
  await detail.getByRole("button", { name: "Remplacer la photo" }).click();
  await (await chooser).setFiles(PHOTO_2);
  const preview = page.getByRole("region", { name: "Prévisualisation" });
  await expect(preview.getByRole("heading", { name: "Remplacer la photo" })).toBeVisible();
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText(/synchronisée/);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(3);

  const { data: old } = await ctx.a.from("tools_releves_medias").select("deleted_at").eq("id", mediaId).single();
  expect((old as { deleted_at: string | null }).deleted_at).not.toBeNull();
  expect((await ctx.a.storage.from(BUCKET).download(oldPath)).error).not.toBeNull();
  const { data: fresh } = await ctx.a.from("tools_releves_medias").select("id,storage_path,metadata").eq("releve_id", ctx.releveId).is("deleted_at", null);
  const replacement = (fresh as Array<{ id: string; storage_path: string; metadata: Record<string, unknown> }>).find((row) => row.metadata.remplaceMediaId === mediaId)!;
  expect(replacement.metadata).toMatchObject({ orientation: "portrait", largeurPx: 2304, hauteurPx: 3072 });
  const { data: anchors } = await ctx.a.from("tools_releves_elements").select("donnees").eq("type", "photo_anchor").eq("releve_id", ctx.releveId).is("deleted_at", null);
  const moved = (anchors as Array<{ donnees: { mediaId: string; legende: string | null; reperes?: unknown[] } }>).filter((row) => row.donnees.mediaId === replacement.id);
  expect(moved.length).toBe(3);
  expect(moved.find((row) => row.donnees.legende === "Séjour, mur nord")?.donnees.reperes).toEqual([]);
  const { count } = await ctx.a.from("tools_releves_elements").select("id", { count: "exact", head: true }).eq("type", "annotation").eq("releve_id", ctx.releveId).is("deleted_at", null);
  expect(count).toBe(0);

  // Suppression de la photo remplaçante.
  await page.getByRole("button", { name: /Séjour, mur nord/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("region", { name: "Photo sélectionnée" }).getByRole("button", { name: "Supprimer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText("Photo retirée.");
  await expect(page.getByTestId("photo-thumb")).toHaveCount(2);
  expect((await ctx.a.storage.from(BUCKET).download(replacement.storage_path)).error).not.toBeNull();
  const { data: gone } = await ctx.a.from("tools_releves_elements").select("id").eq("type", "photo_anchor").eq("releve_id", ctx.releveId).is("deleted_at", null);
  expect((gone as unknown[]).length).toBe(2);
});

test("tenant B : photos du tenant A invisibles, page inaccessible, aucune ligne ni fichier lisible", async ({ page }) => {
  await signIn(page, EMAIL_B);
  await page.goto(photosUrl());
  await expect(page.getByText(/introuvable ou non accessible|Relevé introuvable/)).toBeVisible();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(0);
  const { data } = await ctx.b.from("tools_releves_medias").select("id").eq("releve_id", ctx.releveId);
  expect(data).toEqual([]);
  const { data: paths } = await ctx.a.from("tools_releves_medias").select("storage_path").eq("releve_id", ctx.releveId).is("deleted_at", null);
  for (const { storage_path } of paths as Array<{ storage_path: string }>) {
    expect((await ctx.b.storage.from(BUCKET).createSignedUrl(storage_path, 60)).error).not.toBeNull();
  }
});

test("navigation terrain (Lot 3) : fiche pièce → photos pré-rattachées à la pièce → compteur de la fiche", async ({ page }) => {
  await signIn(page, EMAIL_A);
  const countAnchors = async () => (await ctx.a.from("tools_releves_elements").select("id", { count: "exact", head: true })
    .eq("type", "photo_anchor").eq("piece_id", ctx.pieceId).is("deleted_at", null)).count ?? 0;
  const avant = await countAnchors();
  await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.pieceId}`);
  await page.getByRole("link", { name: "Photos de la pièce" }).click();
  await expect(page).toHaveURL(/\/releves\/photos\?id=.*cible=piece/);
  const capture = page.getByRole("region", { name: "Nouvelle photo" });
  await expect(capture.getByLabel("Rattacher à")).toHaveValue("piece");
  await expect(capture.locator("#capture-id")).toHaveValue(ctx.pieceId);
  const preview = await importPhoto(page, PHOTO_PNG);
  await expect(preview.getByText(/Pièce · Séjour/)).toBeVisible();
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText(/synchronisée/);
  expect(await countAnchors()).toBe(avant + 1);
  await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.pieceId}`);
  await expect(page.getByRole("region", { name: "Métré préparé" }).getByText(`${avant + 1} rattaché(s)`).first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Mobile : iPhone-like, Android-like, tablette (Chromium en émulation)
// ─────────────────────────────────────────────────────────────────────────────
const PROFILES: Array<[string, BrowserContextOptions]> = [
  ["iPhone-like (390×844, tactile)", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
  ["Android-like (412×915, tactile)", { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" }],
  ["tablette (820×1180, tactile)", { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
];

for (const [nom, profile] of PROFILES) {
  test(`@responsive ${nom} : capture, prévisualisation, repère au toucher, sans débordement`, async ({ browser }) => {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    try {
      await signIn(page, EMAIL_A);
      await page.goto(photosUrl());
      await expect(page.getByTestId("photo-thumb").first()).toBeVisible();
      expect(await sansDebordement(page)).toBe(true);
      // Cibles tactiles ≥ 44 px pour les commandes de capture.
      for (const name of ["Prendre une photo", "Importer"]) {
        const box = await page.getByRole("region", { name: "Nouvelle photo" }).getByRole("button", { name }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const preview = await importPhoto(page, PHOTO_PNG, { kind: "etage", label: /RDC/ });
      expect(await sansDebordement(page)).toBe(true);
      const image = (await preview.getByRole("img", { name: "Prévisualisation de la photo" }).boundingBox())!;
      expect(image.width).toBeLessThanOrEqual(profile.viewport!.width);
      await preview.getByRole("button", { name: "Enregistrer la photo" }).tap();
      await expect(page.getByTestId("photos-feedback")).toHaveText(/synchronisée/);

      await page.getByTestId("photo-thumb").first().tap();
      const detail = page.getByRole("region", { name: "Photo sélectionnée" });
      await detail.getByRole("button", { name: "Repère", exact: true }).tap();
      const overlay = detail.getByTestId("photo-overlay");
      const box = (await overlay.boundingBox())!;
      await overlay.tap({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
      await detail.getByLabel("Libellé du repère").fill(`Repère ${nom.split(" ")[0]}`);
      await detail.getByRole("button", { name: "Ajouter", exact: true }).tap();
      await expect(detail.getByText(`Repère ${nom.split(" ")[0]}`)).toBeVisible();
      expect(await sansDebordement(page)).toBe(true);
    } finally {
      await context.close();
    }
  });
}
