import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readExifSummary } from "../../packages/releve-domain/src/exif";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 4 : capture terrain photo & médias, rebasé sur la
 * hiérarchie du Lot 3 (Mes relevés → relevé → chantier → bâtiment → étage → zone → pièce),
 * sur pile RÉELLE (GoTrue + PostgREST + PostgreSQL avec la vraie RLS + surface Storage locale
 * dont les métadonnées et les policies sont celles de `storage.objects`, octets sur disque).
 *
 * Pile : scripts/local-postgres-bootstrap/releve_e2e_stack.sh ; Tools en `next dev` (port 3020).
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot4.spec.ts --project=desktop-chromium
 *
 * Mobile : Chromium en émulation (viewport, `isMobile`, tactile, user-agent) de profils iPhone,
 * Android et tablette. Ce n'est PAS un WebKit iOS réel ni un appareil physique (MOBILE EMULATED ONLY).
 * Mesures de performance écrites dans RELEVE_E2E_PERF_OUT (défaut : dossier temporaire du test).
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
test.setTimeout(180_000);

const suffix = Date.now().toString(36);
const dir = join(tmpdir(), `releve-lot4-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const PHOTO_GPS = join(dir, "terrain-12mpx-exif-gps.jpg");
const PHOTO_PNG = join(dir, "capture-ecran.png");
const PHOTO_2 = join(dir, "terrain-remplacement.jpg");
const PHOTO_3 = join(dir, "terrain-hors-ligne.jpg");
const PHOTO_4 = join(dir, "terrain-coupure.jpg");
const PHOTO_5 = join(dir, "terrain-version.jpg");
const PHOTO_6 = join(dir, "terrain-cuisine.jpg");
const MOBILE = [join(dir, "mobile-1.jpg"), join(dir, "mobile-2.jpg"), join(dir, "mobile-3.jpg")];
const perf: Record<string, unknown> = {};

type Ctx = {
  a: SupabaseClient; b: SupabaseClient; tenantA: string; tenantB: string; releveId: string; chantierId: string; batimentId: string;
  etageId: string; r1Id: string; zoneId: string; pieceId: string; cuisineId: string; murId: string; equipementId: string;
};
let ctx: Ctx;

async function client(email: string): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return supabase;
}

const uuid = () => crypto.randomUUID();
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const must = <T extends { error: unknown }>(result: T): T => { if (result.error) throw new Error(JSON.stringify(result.error)); return result; };

function noisy(width: number, height: number, tint: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let index = 0; index < raw.length; index += 3) {
    const n = (Math.random() * 90) | 0; const x = (index / 3) % width; const y = Math.floor(index / 3 / width);
    raw[index] = (x * 255 / width + n) & 255; raw[index + 1] = (y * 255 / height + n) & 255; raw[index + 2] = (tint + n) & 255;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

async function makePhotos() {
  mkdirSync(dir, { recursive: true });
  await noisy(4032, 3024, 128).jpeg({ quality: 95 }).withExif({
    IFD0: { Make: "TestCam", Model: "Field 1" },
    IFD2: { DateTimeOriginal: "2026:09:27 14:05:33", OffsetTimeOriginal: "+02:00" },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 34/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "7/1 45/1 0/1" },
  }).toFile(PHOTO_GPS);
  await noisy(1280, 960, 40).png().toFile(PHOTO_PNG);
  await noisy(3000, 4000, 200).jpeg({ quality: 90 }).toFile(PHOTO_2);
  for (const [file, tint] of [[PHOTO_3, 10], [PHOTO_4, 70], [PHOTO_5, 160], [PHOTO_6, 230]] as const) await noisy(2400, 1800, tint).jpeg({ quality: 88 }).toFile(file);
  for (const [index, file] of MOBILE.entries()) await noisy(1600, 1200, 30 + index * 50).jpeg({ quality: 85 }).toFile(file);
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/compte`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("CONNECTÉ")).toBeVisible();
}

const photosUrl = (query = "") => `${BASE}/releves/photos?id=${ctx.releveId}${query}`;
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const captureRegion = (page: Page) => page.getByRole("region", { name: "Ajouter une photo" });

async function openCapture(page: Page) {
  const region = captureRegion(page);
  await expect(region).toBeVisible();
  const open = region.getByRole("button", { name: "Ajouter une photo" });
  if (await open.isVisible()) await open.click();
  await expect(region.getByLabel("Rattacher à")).toBeVisible();
  return region;
}

async function importPhoto(page: Page, file: string, target?: { kind: string; label?: RegExp }) {
  const capture = await openCapture(page);
  if (target) {
    await capture.getByLabel("Rattacher à").selectOption(target.kind);
    if (target.label) await capture.locator("#capture-id").selectOption({ label: (await capture.locator("#capture-id option").allTextContents()).find((text) => target.label!.test(text))! });
  }
  await page.getByTestId("input-import").setInputFiles(file);
  const preview = page.getByRole("region", { name: "Prévisualisation" });
  await expect(preview.getByRole("img", { name: "Prévisualisation de la photo" })).toBeVisible();
  return preview;
}

async function activeMedias() {
  const { data } = must(await ctx.a.from("tools_releves_medias").select("*").eq("releve_id", ctx.releveId).is("deleted_at", null));
  return data as Array<{ id: string; storage_path: string; miniature_storage_path: string | null; taille_octets: number; metadata: Record<string, unknown>; commentaire: string | null; etat_documente: string; version_reference_id: string | null }>;
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
  const ids = { releveId: uuid(), batimentId: uuid(), etageId: uuid(), r1Id: uuid(), zoneId: uuid(), pieceId: uuid(), cuisineId: uuid(), murId: uuid(), equipementId: uuid() };
  must(await a.from("tools_releves").insert({ id: ids.releveId, entreprise_id: tenantA, nom: `Relevé photos ${suffix}`, chantier_nom: "Résidence Lot 4" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", ids.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: ids.releveId, nom: "Résidence Lot 4" }));
  must(await a.from("tools_releves_batiments").insert({ id: ids.batimentId, releve_id: ids.releveId, chantier_id: chantierId, nom: "Bâtiment A" }));
  must(await a.from("tools_releves_etages").insert([
    { id: ids.etageId, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0 },
    { id: ids.r1Id, releve_id: ids.releveId, batiment_id: ids.batimentId, nom: "R+1", niveau: 1, type_niveau: "etage", ordre: 1 },
  ]));
  must(await a.from("tools_releves_zones").insert({ id: ids.zoneId, releve_id: ids.releveId, etage_id: ids.etageId, nom: "Appartement 1", type: "appartement" }));
  must(await a.from("tools_releves_pieces").insert([
    { id: ids.pieceId, releve_id: ids.releveId, etage_id: ids.etageId, zone_id: ids.zoneId, nom: "Séjour", usage: "sejour", ordre: 0 },
    { id: ids.cuisineId, releve_id: ids.releveId, etage_id: ids.etageId, nom: "Cuisine", usage: "cuisine", ordre: 1 },
  ]));
  must(await a.from("tools_releves_elements").insert({ id: ids.murId, releve_id: ids.releveId, type: "mur", etage_id: ids.etageId, piece_id: ids.pieceId, donnees: { a: { x: 0, y: 0 }, b: { x: 4200, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } }));
  must(await a.from("tools_releves_elements").insert({ id: ids.equipementId, releve_id: ids.releveId, type: "equipement", etage_id: ids.etageId, piece_id: ids.pieceId, donnees: { categorie: "electricite", libelle: "Tableau électrique", position: { x: 100, y: 100 }, rotationRad: 0, largeurMm: null, profondeurMm: null, hauteurMm: null } }));
  ctx = { a, b, tenantA, tenantB, chantierId, ...ids };
});

test.afterAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2)); });

// ─────────────────────────────────────────────────────────────────────────────
// Storage : upload, read, signed URL, delete, cross-tenant
// ─────────────────────────────────────────────────────────────────────────────
test("Storage : dépôt, lecture, URL signée, suppression et isolation entre tenants", async () => {
  const bytes = new Uint8Array(readFileSync(PHOTO_PNG));
  const mediaId = uuid();
  const path = `${ctx.tenantA}/${ctx.releveId}/photos/${mediaId}.png`;
  const storageA = ctx.a.storage.from(BUCKET); const storageB = ctx.b.storage.from(BUCKET);

  expect((await storageA.upload(path, bytes, { contentType: "image/png", upsert: false })).error).toBeNull();
  expect((await storageA.upload(path, bytes, { contentType: "image/png", upsert: false })).error).not.toBeNull();
  const read = await storageA.download(path);
  expect(read.error).toBeNull();
  expect(sha256(new Uint8Array(await read.data!.arrayBuffer()))).toBe(sha256(bytes));
  const signed = await storageA.createSignedUrl(path, 600);
  expect(signed.error).toBeNull();
  const response = await fetch(signed.data!.signedUrl);
  expect(response.status).toBe(200);
  expect(sha256(new Uint8Array(await response.arrayBuffer()))).toBe(sha256(bytes));
  expect((await fetch(signed.data!.signedUrl.replace(/token=[^&]+/, "token=forge"))).status).toBe(400);
  // Signature groupée (galerie) : chemins autorisés signés, chemin d'un autre relevé refusé.
  const many = await storageA.createSignedUrls([path, `${ctx.tenantB}/${uuid()}/photos/${uuid()}.jpg`], 600);
  expect(many.data?.filter((item) => item.signedUrl).map((item) => item.path)).toEqual([path]);

  expect((await storageB.download(path)).error).not.toBeNull();
  expect((await storageB.createSignedUrl(path, 600)).error).not.toBeNull();
  await storageB.remove([path]);
  expect((await storageA.download(path)).error).toBeNull();
  const intrusion = await storageB.upload(`${ctx.tenantA}/${ctx.releveId}/photos/${uuid()}.png`, bytes, { contentType: "image/png" });
  expect(intrusion.error).not.toBeNull();
  expect((await storageA.upload(`${ctx.tenantA}/${ctx.releveId}/photos/../x.png`, bytes, { contentType: "image/png" })).error).not.toBeNull();
  expect((await storageA.upload(`${ctx.tenantA}/${ctx.releveId}/photos/${uuid()}.png`, bytes, { contentType: "image/gif" })).error).not.toBeNull();

  const removed = await storageA.remove([path]);
  expect(removed.error).toBeNull();
  expect(removed.data?.map((file) => file.name)).toEqual([path]);
  expect((await storageA.download(path)).error).not.toBeNull();
  expect((await fetch(signed.data!.signedUrl)).status).toBe(404);
});

// ─────────────────────────────────────────────────────────────────────────────
// Parcours Lot 3 → Lot 4 : Mes relevés → relevé → structure → pièce → Ajouter une photo
// ─────────────────────────────────────────────────────────────────────────────
let mediaId = "";

test("parcours terrain : ouvrir un relevé, aller dans une pièce, « Ajouter une photo » (12 Mpx, EXIF, GPS retiré, miniature)", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves`);
  await page.getByRole("article").filter({ hasText: `Relevé photos ${suffix}` }).getByRole("link", { name: "Ouvrir la fiche" }).click();
  await expect(page).toHaveURL(/\/releves\/fiche\?id=/);
  await page.getByRole("region", { name: "Chantiers" }).getByRole("link", { name: "Bâtiments, étages, pièces" }).first().click();
  await page.getByRole("region", { name: "Bâtiments" }).getByRole("button", { name: "Bâtiment A", exact: true }).click();
  await page.getByRole("region", { name: "Étages" }).getByRole("button", { name: "RDC", exact: true }).click();
  await page.getByRole("link", { name: "Ouvrir la fiche Séjour" }).click();
  await expect(page).toHaveURL(/\/releves\/piece\?/);
  const piecePhotos = page.getByRole("region", { name: "Photos de la pièce" });
  await expect(piecePhotos.getByText("Aucune photo pour cette pièce.")).toBeVisible();
  await piecePhotos.getByTestId("piece-add-photo").click();

  // Capture ouverte directement, ciblée sur la pièce ; fil d'Ariane de la hiérarchie Lot 3.
  await expect(page).toHaveURL(/portee=piece.*ajout=1/);
  const crumbs = page.getByRole("navigation", { name: "Fil d'Ariane" });
  for (const label of ["Résidence Lot 4", "Bâtiment A", "RDC", "Appartement 1", "Séjour"]) await expect(crumbs.getByRole("link", { name: label, exact: true })).toBeVisible();
  const capture = captureRegion(page);
  await expect(capture.getByLabel("Rattacher à")).toHaveValue("piece");
  await expect(capture.locator("#capture-id option:checked")).toHaveText(/Séjour/);
  await expect(capture.getByLabel("Rattacher à").locator("option")).toHaveText(["Relevé", "Chantier", "Bâtiment", "Étage", "Zone", "Pièce", "Mur", "Équipement", "Point du plan"]);
  await expect(page.getByTestId("input-capture")).toHaveAttribute("capture", "environment");
  await expect(page.getByTestId("input-capture")).toHaveAttribute("accept", "image/*");

  await page.getByTestId("input-import").setInputFiles(PHOTO_GPS);
  const preview = page.getByRole("region", { name: "Prévisualisation" });
  await expect(preview.getByText("GPS d’origine retiré")).toBeVisible();
  const weight = await preview.getByTestId("preview-weight").textContent();
  const [before, after] = (weight ?? "").split("→").map((part) => Number(part.replace(/[^\d.,]/g, "").replace(",", ".")));
  expect(before).toBeGreaterThan(9);
  expect(after).toBeLessThan(before / 2);
  const timing = Number((await preview.getByTestId("preview-timing").textContent())?.replace(/\D/g, ""));
  perf.compression12Mpx = { avantMo: before, apresMo: after, traitementMs: timing };
  await expect(preview.getByText("3072 × 2304 px")).toBeVisible();
  await preview.getByLabel("Commentaire (facultatif)").fill("Séjour, mur nord");
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText(/1 photo\(s\) synchronisée\(s\)/);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(1);
  await expect(page.getByTestId("photo-thumb").locator("img")).toHaveAttribute("src", /photos%2F|photos\//);

  // Vérité serveur : métadonnées de preuve, fichier stocké sans EXIF ni GPS, miniature séparée.
  const rows = await activeMedias();
  expect(rows).toHaveLength(1);
  const media = rows[0];
  mediaId = media.id;
  expect(media).toMatchObject({ commentaire: "Séjour, mur nord", etat_documente: "initial", version_reference_id: null });
  expect(media.metadata).toMatchObject({ source: "import", priseLe: "2026-09-27T14:05:33+02:00", priseLeSource: "exif", orientation: "paysage", largeurPx: 3072, hauteurPx: 2304, gpsRetire: true });
  expect(Object.keys(media.metadata).join(",")).not.toMatch(/gps(?!Retire)|lat|lon/i);
  const stored = new Uint8Array(await (await ctx.a.storage.from(BUCKET).download(media.storage_path)).data!.arrayBuffer());
  expect(stored.byteLength).toBe(Number(media.taille_octets));
  expect(sha256(stored)).toBe(media.metadata.empreinteSha256);
  expect(readExifSummary(stored)).toMatchObject({ hasGps: false, dateTimeOriginal: null });
  expect(Buffer.from(stored).includes(Buffer.from("TestCam"))).toBe(false);
  const mini = new Uint8Array(await (await ctx.a.storage.from(BUCKET).download(media.miniature_storage_path!)).data!.arrayBuffer());
  const miniMeta = await sharp(Buffer.from(mini)).metadata();
  expect(Math.max(miniMeta.width!, miniMeta.height!)).toBe(480);
  expect(mini.byteLength).toBeLessThan(120_000);
  perf.miniature = { octets: mini.byteLength, photoOctets: stored.byteLength };
  const { data: anchors } = await ctx.a.from("tools_releves_elements").select("*").eq("type", "photo_anchor").eq("releve_id", ctx.releveId);
  expect(anchors?.[0]).toMatchObject({ etage_id: ctx.etageId, piece_id: ctx.pieceId, donnees: { mediaId, ancre: { kind: "entite", ref: { kind: "piece", id: ctx.pieceId } } } });

  // Retour à la fiche pièce : aperçu à jour.
  await crumbs.getByRole("link", { name: "Séjour", exact: true }).click();
  await expect(page.getByRole("region", { name: "Photos de la pièce" }).getByRole("heading", { name: "Photos (1)" })).toBeVisible();
});

test("annotations (texte, flèche, cercle) modifiables, repères, commentaire en sauvegarde automatique — persistés après rechargement", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl(`&portee=piece&cible=${ctx.pieceId}`));
  await page.getByTestId("photo-thumb").first().click();
  const detail = page.getByRole("region", { name: "Photo sélectionnée" });
  const overlay = detail.getByTestId("photo-overlay");
  await expect(detail.getByRole("img", { name: "Séjour, mur nord" })).toBeVisible();
  await expect(detail.getByText("avant toute version figée")).toBeVisible();
  const box = (await overlay.boundingBox())!;
  const at = (x: number, y: number) => ({ position: { x: box.width * x, y: box.height * y } });

  await detail.getByRole("button", { name: "Repère", exact: true }).click();
  await overlay.click(at(0.25, 0.5));
  await detail.getByLabel("Libellé du repère").fill("Tableau électrique");
  await detail.getByLabel("Objet désigné (facultatif)").selectOption({ label: "Tableau électrique · RDC" });
  await detail.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(detail.getByText("1. Tableau électrique")).toBeVisible();

  await detail.getByRole("button", { name: "Flèche", exact: true }).click();
  await overlay.click(at(0.1, 0.1)); await overlay.click(at(0.4, 0.45));
  await expect(overlay.getByTestId("annotation-fleche")).toHaveCount(1);
  await detail.getByRole("button", { name: "Cercle", exact: true }).click();
  await overlay.click(at(0.6, 0.6)); await overlay.click(at(0.7, 0.6));
  await expect(overlay.getByTestId("annotation-cercle")).toHaveCount(1);
  await detail.getByRole("button", { name: "Texte", exact: true }).click();
  await overlay.click(at(0.5, 0.85));
  await detail.getByLabel("Texte").fill("Humidité");
  await detail.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(overlay.getByTestId("annotation-texte")).toHaveText("Humidité");

  // Modifier le texte et la couleur, puis déplacer l'annotation texte.
  await detail.getByTestId("annotation-item").filter({ hasText: "Humidité" }).getByRole("button", { name: "Modifier" }).click();
  const edit = detail.getByRole("form", { name: "Modifier l'annotation" });
  await edit.getByLabel("Texte").fill("Humidité en pied de mur (80 cm)");
  await edit.getByLabel("Couleur").selectOption("jaune");
  await edit.getByRole("button", { name: "Enregistrer" }).click();
  await expect(overlay.getByTestId("annotation-texte")).toHaveText("Humidité en pied de mur (80 cm)");
  // Le formulaire reste ouvert après l'enregistrement : on enchaîne sur « Déplacer ».
  await detail.getByRole("form", { name: "Modifier l'annotation" }).getByRole("button", { name: "Déplacer" }).click();
  await overlay.click(at(0.2, 0.3));
  await expect(page.getByTestId("photos-feedback")).toHaveText("Annotation déplacée.");

  // Commentaire : sauvegarde automatique (pas de bouton Enregistrer).
  await detail.getByLabel("Commentaire de la photo").fill("Séjour, mur nord — fissure verticale");
  await detail.getByLabel("Commentaire de la photo").blur();
  await expect(detail.getByRole("status", { name: "État de sauvegarde — photo" })).toContainText("Enregistré");

  await page.reload();
  await page.getByTestId("photo-thumb").first().click();
  const reloaded = page.getByRole("region", { name: "Photo sélectionnée" });
  await expect(reloaded.getByTestId("repere")).toHaveCount(1);
  await expect(reloaded.getByTestId("photo-overlay").locator("[data-testid^=annotation-]")).toHaveCount(3);
  await expect(reloaded.getByTestId("annotation-texte")).toHaveText("Humidité en pied de mur (80 cm)");
  await expect(reloaded.getByLabel("Commentaire de la photo")).toHaveValue("Séjour, mur nord — fissure verticale");
  const { data } = await ctx.a.from("tools_releves_elements").select("donnees").eq("type", "annotation").eq("releve_id", ctx.releveId).is("deleted_at", null);
  const texte = (data as Array<{ donnees: { forme: string; geometrie: { x: number; y: number; couleur: string } } }>).find((row) => row.donnees.forme === "texte")!;
  expect(texte.donnees.geometrie.couleur).toBe("jaune");
  expect(texte.donnees.geometrie.x).toBeCloseTo(0.2, 1); expect(texte.donnees.geometrie.y).toBeCloseTo(0.3, 1);
  const { data: journal } = await ctx.a.from("tools_releves_journal").select("champs").eq("entite", "media").eq("entite_id", mediaId).eq("action", "modification");
  expect((journal as Array<{ champs: string[] }>).some((row) => row.champs.includes("commentaire"))).toBe(true);

  // Suppression d'une annotation (avec confirmation).
  page.once("dialog", (dialog) => void dialog.accept());
  await reloaded.getByTestId("annotation-item").filter({ hasText: "Cercle" }).getByRole("button", { name: "Retirer l'annotation" }).click();
  await expect(reloaded.getByTestId("photo-overlay").locator("[data-testid^=annotation-]")).toHaveCount(2);
});

test("galerie par niveau (pièce, zone, étage, bâtiment, chantier, relevé), rattachements multiples, filtres", async ({ page }) => {
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

  const scope = page.getByTestId("gallery-scope");
  const count = async (value: string) => { await scope.selectOption(value); return page.getByTestId("photo-thumb").count(); };
  expect(await count(`piece:${ctx.pieceId}`)).toBe(1);
  expect(await count(`zone:${ctx.zoneId}`)).toBe(1);
  expect(await count(`etage:${ctx.etageId}`)).toBe(1);
  expect(await count(`piece:${ctx.cuisineId}`)).toBe(0);
  await expect(page.getByText("Aucune photo pour ce niveau.")).toBeVisible();
  expect(await count(`etage:${ctx.r1Id}`)).toBe(0);
  expect(await count(`batiment:${ctx.batimentId}`)).toBe(1);
  expect(await count(`chantier:${ctx.chantierId}`)).toBe(1);
  await expect(page).toHaveURL(new RegExp(`portee=chantier&cible=${ctx.chantierId}`));
  expect(await count("releve")).toBe(1);
  await page.getByLabel("Annotées").check();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(1);
  await page.getByRole("group", { name: "Filtres" }).getByLabel("État").selectOption("as_built");
  await expect(page.getByTestId("photo-thumb")).toHaveCount(0);
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
    const policy = (await response!.allHeaders())["permissions-policy"] ?? "";
    expect(policy).toContain("camera=(self)"); expect(policy).toContain("geolocation=()"); expect(policy).toContain("microphone=()");
    await signIn(page, EMAIL_A);
    await page.goto(photosUrl());
    const capture = await openCapture(page);
    await capture.getByRole("button", { name: "Caméra" }).click();
    const camera = page.getByRole("dialog", { name: "Caméra" });
    await expect(camera.getByLabel("Aperçu de la caméra")).toBeVisible();
    await expect(camera.getByRole("button", { name: "Capturer la photo" })).toBeEnabled();
    expect(await page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await camera.getByRole("button", { name: "Capturer la photo" }).click();
    await expect(camera).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll("video").length)).toBe(0);
    await page.getByRole("region", { name: "Prévisualisation" }).getByRole("button", { name: "Enregistrer la photo" }).click();
    await expect(page.getByTestId("photo-thumb")).toHaveCount(2);
    const camMedia = (await activeMedias()).find((row) => row.metadata.source === "camera_web")!;
    expect(camMedia.metadata).toMatchObject({ source: "camera_web", priseLeSource: "capture", gpsRetire: false });
    await context.close();
  } finally {
    await browser.close();
  }
});

test("caméra refusée : message clair et repli sur l'appareil photo système / la galerie", async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-fake-device-for-media-stream"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(photosUrl());
    page.on("dialog", (dialog) => void dialog.dismiss());
    await context.clearPermissions();
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("refus", "NotAllowedError")); });
    const capture = await openCapture(page);
    await capture.getByRole("button", { name: "Caméra" }).click();
    await expect(page.getByRole("dialog", { name: "Caméra" }).getByRole("alert")).toHaveText(/Accès à la caméra refusé/);
    await page.getByRole("dialog", { name: "Caméra" }).getByRole("button", { name: "Fermer" }).click();
    await expect(capture.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
    await expect(capture.getByRole("button", { name: "Galerie / fichier" })).toBeVisible();
    await context.close();
  } finally {
    await browser.close();
  }
});

test("navigateur sans getUserMedia : caméra en direct non proposée, capture système et galerie disponibles", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }); });
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  const capture = await openCapture(page);
  await expect(capture.getByRole("button", { name: "Caméra" })).toHaveCount(0);
  await expect(capture.getByText("Ce navigateur ne donne pas accès à la caméra en direct.")).toBeVisible();
  await expect(capture.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Échecs : MIME invalide, image illisible, fichier trop gros, doublon
// ─────────────────────────────────────────────────────────────────────────────
test("refus clairs : type invalide, image illisible, fichier trop gros, doublon (aucune ligne ni fichier créés)", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await openCapture(page);
  const feedback = page.getByTestId("photos-feedback");
  const input = page.getByTestId("input-import");
  await input.setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 pas une photo") });
  await expect(feedback).toHaveText(/Format non pris en charge/);
  await input.setInputFiles({ name: "faux.jpg", mimeType: "image/jpeg", buffer: Buffer.from("ceci n'est pas un JPEG") });
  await expect(feedback).toHaveText(/Image illisible/);
  const enorme = join(dir, "enorme.jpg");
  writeFileSync(enorme, Buffer.alloc(61 * 1024 * 1024, 1));
  await input.setInputFiles(enorme);
  await expect(feedback).toHaveText(/trop volumineux/);
  await expect(page.getByRole("region", { name: "Prévisualisation" })).toHaveCount(0);

  // Doublon : le même fichier d'origine choisi une seconde fois (empreintes du fichier déposé et de l'origine).
  const before = (await activeMedias()).length;
  expect((await activeMedias()).some((media) => typeof media.metadata.empreinteOrigineSha256 === "string")).toBe(true);
  await input.setInputFiles(PHOTO_GPS);
  await expect(feedback).toHaveText(/déjà dans le relevé/);
  const preview = page.getByRole("region", { name: "Prévisualisation" });
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(feedback).toHaveText("Cette photo est déjà dans le relevé.");
  expect((await activeMedias()).length).toBe(before);
});

// ─────────────────────────────────────────────────────────────────────────────
// File « à synchroniser » : hors ligne, rechargement, navigateur fermé, upload interrompu
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
  const stored = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name ?? "").filter((name) => name.startsWith("elsatia-releve-file:")));
  expect(stored).toHaveLength(1);

  await page.route(`${SUPABASE_URL}/storage/v1/object/**`, (route) => route.abort("internetdisconnected"));
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toBeVisible();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(2);
  await page.unroute(`${SUPABASE_URL}/storage/v1/object/**`);
  await page.getByRole("region", { name: "À synchroniser" }).getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toHaveCount(0);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(3);
});

test("navigateur fermé pendant l'attente : la file est reprise à la réouverture (profil persistant)", async () => {
  const profile = mkdtempSync(join(tmpdir(), "releve-profil-"));
  let context = await chromium.launchPersistentContext(profile, { executablePath: CHROME });
  let page = context.pages()[0] ?? await context.newPage();
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await expect(page.getByTestId("photo-thumb")).toHaveCount(3);
  await context.setOffline(true);
  const preview = await importPhoto(page, PHOTO_3);
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toBeVisible();
  await context.close();

  context = await chromium.launchPersistentContext(profile, { executablePath: CHROME });
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(photosUrl());
  // Session et file retrouvées : l'envoi reprend automatiquement à l'ouverture.
  await expect(page.getByTestId("photo-thumb")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "À synchroniser" })).toHaveCount(0);
  await context.close();
});

test("upload interrompu entre le fichier et la ligne : reprise sans doublon (fichier « déjà présent »)", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  let cut = true;
  await page.route(`${SUPABASE_URL}/rest/v1/tools_releves_medias*`, (route) => {
    if (cut && route.request().method() === "POST") { cut = false; return route.abort("connectionreset"); }
    return route.continue();
  });
  const preview = await importPhoto(page, PHOTO_4);
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toBeVisible();
  await page.getByRole("region", { name: "À synchroniser" }).getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("region", { name: "À synchroniser" })).toHaveCount(0);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(5);
  // Un seul fichier (et une seule miniature) par photo : aucune copie orpheline.
  const medias = await activeMedias();
  const { data: objects } = must(await ctx.a.storage.from(BUCKET).list(`${ctx.tenantA}/${ctx.releveId}/photos`, { limit: 1000 }));
  expect(objects!.length).toBe(medias.length * 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Remplacement, suppression, versions, cascade Lot 3, isolation tenant
// ─────────────────────────────────────────────────────────────────────────────
test("remplacement puis suppression : rattachements conservés, anciens fichiers (et miniatures) retirés du bucket", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  const { data: oldRow } = await ctx.a.from("tools_releves_medias").select("storage_path,miniature_storage_path").eq("id", mediaId).single();
  const old = oldRow as { storage_path: string; miniature_storage_path: string };
  await page.getByRole("button", { name: /fissure verticale/ }).click();
  const detail = page.getByRole("region", { name: "Photo sélectionnée" });
  const chooser = page.waitForEvent("filechooser");
  await detail.getByRole("button", { name: "Remplacer la photo" }).click();
  await (await chooser).setFiles(PHOTO_2);
  const preview = page.getByRole("region", { name: "Prévisualisation" });
  await expect(preview.getByRole("heading", { name: "Remplacer la photo" })).toBeVisible();
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText(/synchronisée/);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(5);

  const { data: gone } = await ctx.a.from("tools_releves_medias").select("deleted_at").eq("id", mediaId).single();
  expect((gone as { deleted_at: string | null }).deleted_at).not.toBeNull();
  expect((await ctx.a.storage.from(BUCKET).download(old.storage_path)).error).not.toBeNull();
  expect((await ctx.a.storage.from(BUCKET).download(old.miniature_storage_path)).error).not.toBeNull();
  const replacement = (await activeMedias()).find((row) => row.metadata.remplaceMediaId === mediaId)!;
  expect(replacement).toMatchObject({ commentaire: "Séjour, mur nord — fissure verticale" });
  expect(replacement.metadata).toMatchObject({ orientation: "portrait", largeurPx: 2304, hauteurPx: 3072 });
  const { data: anchors } = await ctx.a.from("tools_releves_elements").select("donnees").eq("type", "photo_anchor").eq("releve_id", ctx.releveId).is("deleted_at", null);
  expect((anchors as Array<{ donnees: { mediaId: string } }>).filter((row) => row.donnees.mediaId === replacement.id)).toHaveLength(3);

  await page.getByRole("button", { name: /fissure verticale/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("region", { name: "Photo sélectionnée" }).getByRole("button", { name: "Supprimer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText("Photo supprimée.");
  await expect(page.getByTestId("photo-thumb")).toHaveCount(4);
  expect((await ctx.a.storage.from(BUCKET).download(replacement.storage_path)).error).not.toBeNull();
  expect((await ctx.a.storage.from(BUCKET).download(replacement.miniature_storage_path!)).error).not.toBeNull();
});

test("versions : une photo figée par une version reste lisible après suppression ; les photos suivantes portent la version", async ({ page }) => {
  const { data: version } = must(await ctx.a.rpc("tools_releve_creer_version", { p_releve_id: ctx.releveId, p_libelle: "Existant" }));
  const v1 = (version as { id: string }).id;
  const figees = await activeMedias();
  expect(figees).toHaveLength(4);
  await signIn(page, EMAIL_A);
  await page.goto(photosUrl());
  await page.getByTestId("photo-thumb").first().click();
  const detail = page.getByRole("region", { name: "Photo sélectionnée" });
  // Photos déposées avant la version : « avant toute version figée » ; la version les contient.
  await expect(detail.getByText("avant toute version figée")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await detail.getByRole("button", { name: "Supprimer la photo" }).click();
  await expect(page.getByTestId("photos-feedback")).toHaveText(/fichier est conservé : il appartient à une version figée/);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(3);
  const restantes = new Set((await activeMedias()).map((media) => media.id));
  const retiree = figees.find((media) => !restantes.has(media.id))!;
  // Fichier ET miniature de la photo retirée toujours présents : la version 1 reste consultable.
  expect((await ctx.a.storage.from(BUCKET).download(retiree.storage_path)).error).toBeNull();
  expect((await ctx.a.storage.from(BUCKET).download(retiree.miniature_storage_path!)).error).toBeNull();
  const { data: contenu } = await ctx.a.from("tools_releves_versions").select("contenu").eq("id", v1).single();
  expect((contenu as { contenu: { medias: Array<{ id: string }> } }).contenu.medias.map((media) => media.id)).toContain(retiree.id);

  // Nouvelle photo « corrigée » : version de référence = v1, imposée par le serveur.
  const preview = await importPhoto(page, PHOTO_5);
  await preview.getByLabel("État documenté").selectOption("corrige");
  await preview.getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(4);
  const nouvelle = (await activeMedias()).find((media) => media.etat_documente === "corrige")!;
  expect(nouvelle.version_reference_id).toBe(v1);
  await page.getByRole("button", { name: /Relevé/ }).filter({ hasText: "Corrigé" }).first().click();
  await expect(page.getByRole("region", { name: "Photo sélectionnée" }).getByText("v1 · Initiale")).toBeVisible();
});

test("cascade Lot 3 : pièce à la corbeille → ses photos disparaissent ; pièce restaurée → elles reviennent", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.cuisineId}`);
  await page.getByRole("region", { name: "Photos de la pièce" }).getByTestId("piece-add-photo").click();
  await page.getByTestId("input-import").setInputFiles(PHOTO_6);
  await page.getByRole("region", { name: "Prévisualisation" }).getByRole("button", { name: "Enregistrer la photo" }).click();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(1);
  must(await ctx.a.from("tools_releves_pieces").update({ deleted_at: new Date().toISOString() }).eq("id", ctx.cuisineId));
  await page.goto(photosUrl());
  await expect(page.getByTestId("photo-thumb")).toHaveCount(4);
  must(await ctx.a.from("tools_releves_pieces").update({ deleted_at: null }).eq("id", ctx.cuisineId));
  await page.reload();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(5);
  // Duplication de la pièce (Lot 3) : la copie n'a aucune photo.
  const { data: copie } = must(await ctx.a.rpc("tools_releve_dupliquer_noeud", { p_type: "piece", p_id: ctx.cuisineId }));
  await page.goto(photosUrl(`&portee=piece&cible=${copie as string}`));
  await expect(page.getByText("Aucune photo pour ce niveau.")).toBeVisible();
});

test("tenant B : photos du tenant A invisibles, page inaccessible, aucune ligne ni fichier lisible", async ({ page }) => {
  await signIn(page, EMAIL_B);
  await page.goto(photosUrl());
  await expect(page.getByText(/introuvable ou non accessible|Relevé introuvable/)).toBeVisible();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(0);
  const { data } = await ctx.b.from("tools_releves_medias").select("id").eq("releve_id", ctx.releveId);
  expect(data).toEqual([]);
  const { data: annotations } = await ctx.b.from("tools_releves_elements").select("id").eq("releve_id", ctx.releveId);
  expect(annotations).toEqual([]);
  const paths = (await activeMedias()).flatMap((media) => [media.storage_path, media.miniature_storage_path!]);
  const signed = await ctx.b.storage.from(BUCKET).createSignedUrls(paths, 60);
  expect((signed.data ?? []).filter((item) => item.signedUrl)).toEqual([]);
  expect((await ctx.b.storage.from(BUCKET).upload(`${ctx.tenantA}/${ctx.releveId}/photos/${uuid()}.jpg`, readFileSync(PHOTO_3), { contentType: "image/jpeg" })).error).not.toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance : 200 photos sur un relevé, 50 dans une pièce
// ─────────────────────────────────────────────────────────────────────────────
test("@perf 200 photos (50 dans une pièce) : chargement, galerie, mémoire, envoi séquentiel", async ({ page }) => {
  // Jeu de données déposé par l'API (fichier + miniature + ligne + rattachement), comme la file.
  const releveId = uuid(); const batimentId = uuid(); const etageId = uuid(); const pieceIds = [uuid(), uuid(), uuid(), uuid()];
  must(await ctx.a.from("tools_releves").insert({ id: releveId, entreprise_id: ctx.tenantA, nom: `Relevé 200 photos ${suffix}`, chantier_nom: "Perf" }));
  const { data: chantier } = await ctx.a.from("tools_releves_chantiers").select("id").eq("releve_id", releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await ctx.a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: releveId, nom: "Perf" }));
  must(await ctx.a.from("tools_releves_batiments").insert({ id: batimentId, releve_id: releveId, chantier_id: chantierId, nom: "Bât" }));
  must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: releveId, batiment_id: batimentId, nom: "RDC", niveau: 0 }));
  must(await ctx.a.from("tools_releves_pieces").insert(pieceIds.map((id, index) => ({ id, releve_id: releveId, etage_id: etageId, nom: `Pièce ${index + 1}`, usage: "bureau", ordre: index }))));
  const seedStarted = Date.now();
  const storage = ctx.a.storage.from(BUCKET);
  const one = async (index: number) => {
    const photo = await noisy(1600, 1200, index % 256).jpeg({ quality: 80 }).toBuffer();
    const mini = await sharp(photo).resize(480).jpeg({ quality: 72 }).toBuffer();
    const id = uuid(); const miniId = uuid();
    const path = `${ctx.tenantA}/${releveId}/photos/${id}.jpg`; const miniPath = `${ctx.tenantA}/${releveId}/photos/${miniId}.jpg`;
    must(await storage.upload(miniPath, mini, { contentType: "image/jpeg" }));
    must(await storage.upload(path, photo, { contentType: "image/jpeg" }));
    must(await ctx.a.from("tools_releves_medias").insert({
      id, releve_id: releveId, categorie: "photos", storage_path: path, miniature_storage_path: miniPath, mime_type: "image/jpeg", taille_octets: photo.byteLength,
      metadata: { source: "import", priseLe: new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString(), priseLeSource: "fichier", orientation: "paysage", orientationExif: null, largeurPx: 1600, hauteurPx: 1200, largeurOriginePx: 1600, hauteurOriginePx: 1200, tailleOrigineOctets: photo.byteLength, compressionQualite: 0.85, compressionCoteMaxPx: 3072, empreinteSha256: sha256(photo), gpsRetire: false, remplaceMediaId: null },
    }));
    const pieceId = index < 50 ? pieceIds[0] : pieceIds[1 + (index % 3)];
    must(await ctx.a.from("tools_releves_elements").insert({ releve_id: releveId, type: "photo_anchor", etage_id: etageId, piece_id: pieceId, donnees: { mediaId: id, ancre: { kind: "entite", ref: { kind: "piece", id: pieceId } }, directionRad: null, legende: null, ordre: index } }));
    return photo.byteLength + mini.byteLength;
  };
  let seededBytes = 0;
  for (let start = 0; start < 200; start += 10) seededBytes += (await Promise.all(Array.from({ length: 10 }, (_, k) => one(start + k)))).reduce((sum, value) => sum + value, 0);
  perf.jeu200 = { photos: 200, depotMs: Date.now() - seedStarted, octetsDeposes: seededBytes };

  await signIn(page, EMAIL_A);
  let storageRequests = 0; let signRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/storage/v1/object/sign/")) signRequests += request.method() === "POST" ? 1 : 0;
    if (request.url().includes("/storage/v1/object/") && request.method() === "GET") storageRequests += 1;
  });
  await page.addInitScript(() => {
    (window as unknown as { __longTasks: number[] }).__longTasks = [];
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) (window as unknown as { __longTasks: number[] }).__longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
    // Changements de `src` d'une vignette déjà affichée = re-signature inutile (rechargement).
    (window as unknown as { __src: number }).__src = 0;
    new MutationObserver((mutations) => { for (const mutation of mutations) if (mutation.attributeName === "src") (window as unknown as { __src: number }).__src += 1; })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ["src"] });
  });
  const started = Date.now();
  await page.goto(`${BASE}/releves/photos?id=${releveId}`);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(48);
  await page.waitForFunction(() => [...document.querySelectorAll("[data-testid=photo-thumb] img")].filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length >= 12, null, { timeout: 30_000 });
  const firstPaintMs = Date.now() - started;
  const scopeStarted = Date.now();
  await page.getByTestId("gallery-scope").selectOption(`piece:${pieceIds[0]}`);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(48);
  await page.getByRole("button", { name: "Afficher plus (2)" }).click();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(50);
  const pieceMs = Date.now() - scopeStarted;
  await page.getByTestId("gallery-scope").selectOption("releve");
  const allStarted = Date.now();
  for (const remaining of [152, 104, 56, 8]) await page.getByRole("button", { name: `Afficher plus (${remaining})` }).click();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(200);
  // Toutes les vignettes signées (une requête groupée par page affichée), puis chargement au défilement.
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=photo-thumb] img").length >= 200, null, { timeout: 30_000 });
  const allMs = Date.now() - allStarted;
  // Défilement de toute la galerie, un écran à la fois (chargement paresseux des miniatures).
  const scrollStarted = Date.now();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  // Comme un utilisateur : on ne passe à l'écran suivant qu'une fois les vignettes visibles chargées.
  const visibleLoaded = () => page.evaluate(() => [...document.querySelectorAll("[data-testid=photo-thumb] img")]
    .filter((img) => { const rect = img.getBoundingClientRect(); return rect.bottom > 0 && rect.top < window.innerHeight; })
    .every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
  for (let y = 0; y <= height; y += 600) {
    // `scroll-behavior: smooth` global : défilement instantané pour une mesure déterministe.
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await expect.poll(visibleLoaded, { timeout: 15_000 }).toBe(true);
  }
  const loaded = await page.evaluate(() => ({
    ok: [...document.querySelectorAll("[data-testid=photo-thumb] img")].filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length,
    srcChanges: (window as unknown as { __src: number }).__src,
    thumbs: document.querySelectorAll("[data-testid=photo-thumb]").length,
    imgs: document.querySelectorAll("[data-testid=photo-thumb] img").length,
    incomplete: [...document.querySelectorAll("[data-testid=photo-thumb] img")].map((img, index) => [index, (img as HTMLImageElement).complete, Math.round(img.getBoundingClientRect().top)]).filter(([, complete]) => !complete).slice(0, 8),
    scrollY: window.scrollY, height: document.documentElement.scrollHeight,
  }));
  expect(loaded, JSON.stringify(loaded)).toMatchObject({ ok: 200 });
  const scrollMs = Date.now() - scrollStarted;
  const metrics = await page.evaluate(() => ({
    heapMo: Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1024 / 1024),
    longTasks: (window as unknown as { __longTasks: number[] }).__longTasks,
    images: document.querySelectorAll("[data-testid=photo-thumb] img").length,
    maxImagePx: Math.max(...[...document.querySelectorAll("[data-testid=photo-thumb] img")].map((img) => Math.max((img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight))),
  }));
  // L'original n'est jamais chargé par la galerie : que des miniatures (≤ 480 px).
  expect(metrics.maxImagePx).toBeLessThanOrEqual(480);
  const longest = Math.max(0, ...metrics.longTasks);
  expect(longest).toBeLessThan(1000);
  perf.galerie200 = {
    premiereVueMs: firstPaintMs, galeriePiece50Ms: pieceMs, galerieRelevé200AfficheeMs: allMs, heapJsMo: metrics.heapMo,
    requetesSignatureGroupee: signRequests, telechargementsStorage: storageRequests,
    tachesLonguesNb: metrics.longTasks.length, tacheLaPlusLongueMs: Math.round(longest), vignettesAffichees: metrics.images, defilementCompletMs: scrollMs,
  };

  // Envoi séquentiel de 5 photos par l'interface (traitement + miniature + file + dépôt).
  const files = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
    const file = join(dir, `sequentiel-${index}.jpg`);
    await noisy(4032, 3024, 20 + index * 40).jpeg({ quality: 92 }).toFile(file);
    return file;
  }));
  await page.goto(`${BASE}/releves/photos?id=${releveId}&portee=piece&cible=${pieceIds[3]}&ajout=1`);
  const durations: number[] = [];
  for (const [index, file] of files.entries()) {
    const t0 = Date.now();
    await page.getByTestId("input-import").setInputFiles(file);
    await page.getByRole("region", { name: "Prévisualisation" }).getByRole("button", { name: "Enregistrer la photo" }).click();
    await expect(page.getByTestId("photos-feedback")).toHaveText(/synchronisée/);
    await expect(page.getByRole("region", { name: "Prévisualisation" })).toHaveCount(0);
    durations.push(Date.now() - t0);
    if (index < files.length - 1) await page.evaluate(() => { const el = document.querySelector("[data-testid=photos-feedback]"); if (el) el.textContent = ""; });
  }
  perf.envoiSequentiel12Mpx = { photos: files.length, msParPhoto: durations, moyenneMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) };
});

// ─────────────────────────────────────────────────────────────────────────────
// Mobile : iPhone-like, Android-like, tablette (Chromium en émulation)
// ─────────────────────────────────────────────────────────────────────────────
const PROFILES: Array<[string, BrowserContextOptions]> = [
  ["iPhone-like (390×844, tactile)", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
  ["Android-like (412×915, tactile)", { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" }],
  ["tablette (820×1180, tactile)", { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
];

for (const [index, [nom, profile]] of PROFILES.entries()) {
  test(`@responsive ${nom} : pièce → Ajouter une photo, prévisualisation, repère au toucher, sans débordement`, async ({ browser }) => {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    try {
      await signIn(page, EMAIL_A);
      await page.goto(`${BASE}/releves/piece?id=${ctx.releveId}&piece=${ctx.pieceId}`);
      const add = page.getByRole("region", { name: "Photos de la pièce" }).getByTestId("piece-add-photo");
      expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await sansDebordement(page)).toBe(true);
      await add.tap();
      await expect(page.getByLabel("Rattacher à")).toHaveValue("piece");
      // Barre fixe « Ajouter une photo » au pouce (smartphone et tablette).
      const bar = page.getByTestId("add-photo-bar");
      await expect(bar).toBeVisible();
      expect((await bar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const name of ["Prendre une photo", "Galerie / fichier"]) {
        const box = await captureRegion(page).getByRole("button", { name }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.getByTestId("input-import").setInputFiles(MOBILE[index]);
      const preview = page.getByRole("region", { name: "Prévisualisation" });
      await expect(preview.getByRole("img", { name: "Prévisualisation de la photo" })).toBeVisible();
      expect(await sansDebordement(page)).toBe(true);
      const image = (await preview.getByRole("img", { name: "Prévisualisation de la photo" }).boundingBox())!;
      expect(image.width).toBeLessThanOrEqual(profile.viewport!.width);
      await preview.getByRole("button", { name: "Enregistrer la photo" }).tap();
      await expect(page.getByTestId("photos-feedback")).toHaveText(/synchronisée/);

      await page.getByTestId("photo-thumb").first().tap();
      const detail = page.getByRole("region", { name: "Photo sélectionnée" });
      await detail.getByRole("button", { name: "Repère", exact: true }).tap();
      const overlay = detail.getByTestId("photo-overlay");
      await expect(overlay).toBeVisible();
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
