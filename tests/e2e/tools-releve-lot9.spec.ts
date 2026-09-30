import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * ELSATIA Tools — Relevé & Métré — Lot 9 : quantitatifs, ouvrages & takeoff automatique, sur pile RÉELLE
 * (GoTrue + PostgREST + PostgreSQL avec la vraie RLS), Tools en `next dev`.
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 RELEVE_E2E_SUPABASE_URL=http://localhost:54321 RELEVE_E2E_ANON_KEY=… \
 *   RELEVE_E2E_EMAIL_A=… RELEVE_E2E_EMAIL_B=… RELEVE_E2E_PASSWORD=… PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-releve-lot9.spec.ts --project=desktop-chromium
 *
 * Les quantités affichées sont celles du SERVEUR (moteur déterministe). Valeurs attendues calculées à la
 * main (voir le rapport Lot 9). Tablette : Chromium en émulation (MOBILE EMULATED ONLY). Mesures :
 * RELEVE_E2E_PERF_OUT.
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
const dir = join(tmpdir(), `releve-lot9-${suffix}`);
const PERF_OUT = process.env.RELEVE_E2E_PERF_OUT ?? join(dir, "perf.json");
const perf: Record<string, unknown> = {};

type Pt = { x: number; y: number };
type Wall = { id: string; pieceId: null; donnees: { a: Pt; b: Pt; epaisseurMm: number; hauteurMm: number | null; typeMur: string; etatProjet?: string } };
type Ctx = { a: SupabaseClient; b: SupabaseClient; tenantA: string; releveId: string; chantierId: string; batimentId: string; e1: string; zone: string; sejour: string; chambre: string };
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
const ouvrage = (extra: Record<string, unknown>) => ({
  nom: "Ouvrage", categorie: "peinture", unite: "m2", regle: { source: "surface_sol" }, pertePourcent: 0, arrondi: { mode: "aucun" },
  etatTravaux: "nouveau", etats: ["existant", "nouveau"], ...extra,
});

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
type Ligne = { ouvrageId: string; pieceId: string | null; etatProjet: string; quantiteCalculee: number | null; quantiteRetenue: number | null; annotations: string[]; ajustement: { id: string; perime: boolean } | null };
type Quantitatif = { source: string; fige: boolean; ouvrages: { id: string; nom: string; code?: string }[]; lignes: Ligne[]; anomalies: { code: string; detail: string; ouvrageId: string }[] };
async function quantitatif(planId: string, as: SupabaseClient = ctx.a): Promise<Quantitatif> {
  const { data } = must(await as.rpc("tools_releve_plan_quantitatif", { p_plan_id: planId }));
  return data as Quantitatif;
}
async function revision(planId: string) {
  const { data } = must(await ctx.a.from("tools_releves_plans").select("revision").eq("id", planId).single());
  return (data as { revision: number }).revision;
}
async function seedPlan(etageId: string, mods: Record<string, unknown>, etat = "initial") {
  const { data: plan } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: etageId, p_etat: etat }));
  const planId = (plan as { id: string }).id;
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: planId, p_revision: await revision(planId), p_modifications: mods }));
  return planId;
}
const qtUrl = (extra = "") => `${BASE}/releves/quantitatifs?id=${ctx.releveId}${extra}`;
const qtMessage = (page: Page) => page.getByTestId("qt-message");
const planSection = (page: Page, planId: string) => page.locator(`[data-testid="qt-plan"][data-plan="${planId}"]`);
const carte = (page: Page, nom: string) => page.getByTestId("qt-ouvrage").filter({ has: page.getByTestId("qt-ouvrage-nom").filter({ hasText: new RegExp(`^${nom.replace(/[()]/g, "\\$&")}$`) }) });
const sansDebordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function ouvrir(page: Page, nom: string) {
  const details = carte(page, nom).first();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator("summary").click();
  await expect(details.getByTestId("qt-formule")).toBeVisible();
  return details;
}
const ligne = (details: ReturnType<typeof carte>, piece: string, etat: string) => details.locator(`[data-testid="qt-ligne"][data-piece="${piece}"][data-etat="${etat}"]`);

test.beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const a = await client(EMAIL_A); const b = await client(EMAIL_B);
  const { data: session } = await a.auth.getUser();
  const { data: membership } = await a.from("utilisateurs_entreprises").select("entreprise_id").eq("utilisateur_id", session.user!.id).eq("statut", "actif").limit(1).single();
  const tenantA = (membership as { entreprise_id: string }).entreprise_id;
  const keys = { releveId: uuid(), batimentId: uuid(), e1: uuid(), zone: uuid(), sejour: uuid(), chambre: uuid() };
  must(await a.from("tools_releves").insert({ id: keys.releveId, entreprise_id: tenantA, nom: `Relevé Lot 9 ${suffix}`, chantier_nom: "Maison Lot 9" }));
  const { data: chantier } = await a.from("tools_releves_chantiers").select("id").eq("releve_id", keys.releveId).limit(1).maybeSingle();
  const chantierId = (chantier as { id: string } | null)?.id ?? uuid();
  if (!chantier) must(await a.from("tools_releves_chantiers").insert({ id: chantierId, releve_id: keys.releveId, nom: "Maison Lot 9" }));
  must(await a.from("tools_releves_batiments").insert({ id: keys.batimentId, releve_id: keys.releveId, chantier_id: chantierId, nom: "Maison" }));
  must(await a.from("tools_releves_etages").insert({ id: keys.e1, releve_id: keys.releveId, batiment_id: keys.batimentId, nom: "RDC", niveau: 0, type_niveau: "rdc", ordre: 0 }));
  must(await a.from("tools_releves_zones").insert({ id: keys.zone, releve_id: keys.releveId, etage_id: keys.e1, nom: "Logement", type: "logement" }));
  // Séjour : hauteur 2,50 m ; Chambre : SANS hauteur (murs nets non calculables, jamais inventés).
  must(await a.from("tools_releves_pieces").insert([
    { id: keys.sejour, releve_id: keys.releveId, etage_id: keys.e1, zone_id: keys.zone, nom: "Séjour", usage: "sejour", ordre: 0, hauteur_sous_plafond_mm: 2500 },
    { id: keys.chambre, releve_id: keys.releveId, etage_id: keys.e1, nom: "Chambre", usage: "chambre", ordre: 1 },
  ]));
  ctx = { a, b, tenantA, chantierId, ...keys };
  // Maison 6 × 4 m à l'axe (murs de 20 cm, h 2,50), cloison x = 3 000 (10 cm) ; porte sud (Séjour), porte de cloison, fenêtre nord (Chambre).
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
test("Catalogue → takeoff automatique : peinture, stratifié, portes, plinthes ; valeurs du serveur ; hauteur inconnue signalée", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(`${BASE}/releves/fiche?id=${ctx.releveId}`);
  await page.getByTestId("lien-quantitatifs").click();
  await expect(page.getByRole("heading", { name: `Quantitatifs · Relevé Lot 9 ${suffix}` })).toBeVisible();
  const section = planSection(page, plans.e1);
  await expect(section.getByTestId("qt-plan-badge")).toHaveText("Plan 1 · Initiale · calculé");
  await section.getByTestId("qt-ajouter-catalogue").click();
  for (const code of ["PEI-MUR", "SOL-STR", "POR-U", "PLI-ML"]) await section.getByTestId(`qt-catalogue-${code}`).check();
  await section.getByTestId("qt-catalogue-ajouter").click();
  await expect(qtMessage(page)).toHaveText("4 ouvrage(s) ajouté(s) depuis le catalogue.");
  await expect(page.getByTestId("qt-total-ouvrages")).toHaveText("4");
  // Peinture : Séjour 29,683 m² nets × 1,05 = 31,167 ; Chambre sans hauteur → non calculable (jamais inventée).
  await expect(carte(page, "Peinture murs (2 couches)").getByTestId("qt-ouvrage-total")).toHaveText("31,167 m² (+ 1 non calculable)");
  // Stratifié : 10,83 m² × 1,07 = 11,5881 → arrondi 0,01 supérieur = 11,59 par pièce.
  await expect(carte(page, "Sol stratifié").getByTestId("qt-ouvrage-total")).toHaveText("23,18 m²");
  // Portes existantes : une dans le Séjour, une dans la cloison (partagée → étage, comptée une fois).
  await expect(carte(page, "Portes (bloc-porte)").getByTestId("qt-ouvrage-total")).toHaveText("2 u");
  const portes = await ouvrir(page, "Portes (bloc-porte)");
  await expect(ligne(portes, ctx.sejour, "existant").getByTestId("qt-ligne-quantite")).toHaveText("1 u");
  await expect(ligne(portes, "etage", "existant")).toContainText("Étage (partagé entre pièces)");
  const strat = await ouvrir(page, "Sol stratifié");
  await expect(strat.getByTestId("qt-formule")).toHaveText("Surface de sol + perte 7 % → arrondi supérieur (0,01) = m²");
  // Parité écran ↔ serveur : chaque ligne affichée est la quantité du serveur.
  const q = await quantitatif(plans.e1);
  const plinthes = q.ouvrages.find((o) => o.code === "PLI-ML")!;
  const somme = q.lignes.filter((l) => l.ouvrageId === plinthes.id).reduce((s, l) => s + Math.round(l.quantiteRetenue! * 1000), 0);
  await expect(carte(page, "Plinthes").getByTestId("qt-ouvrage-total")).toHaveText(`${(somme / 1000).toFixed(3).replace(".", ",").replace(/0$/, "")} ml`);
  expect(q.lignes.find((l) => l.ouvrageId === q.ouvrages.find((o) => o.code === "PEI-MUR")!.id && l.pieceId === ctx.sejour)!.quantiteCalculee).toBe(31.167);
  // Anomalie : source non calculable (Chambre sans hauteur).
  await expect(page.getByTestId("qt-anomalies")).toContainText("Source absente");
  await expect(carte(page, "Peinture murs (2 couches)").getByTestId("qt-ouvrage-anomalies")).toHaveText("1 anomalie(s)");
});

test("Formule fermée : unité incohérente refusée avant envoi, montants selon entraxe par mur, formule lisible, origine", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl());
  const section = planSection(page, plans.e1);
  await section.getByTestId("qt-ajouter").click();
  const form = section.getByTestId("qt-ouvrage-form");
  await form.getByTestId("qt-f-nom").fill("Montants 48");
  await form.getByTestId("qt-f-categorie").selectOption("cloisons");
  await form.getByTestId("qt-f-source").selectOption("longueur_murs");
  await form.getByTestId("qt-f-unite").selectOption("u");
  // ml → u sans entraxe : refusé (aucune conversion implicite).
  await expect(form.getByTestId("qt-f-unite-produite")).toHaveText("Unité produite : ml ≠ u (aucune conversion implicite)");
  await expect(form.getByTestId("qt-f-erreur")).toHaveText("Unité incohérente : la formule ne produit pas l'unité déclarée (aucune conversion implicite).");
  await expect(form.getByTestId("qt-f-enregistrer")).toBeDisabled();
  await form.getByTestId("qt-f-op-ajouter").click();
  await form.getByTestId("qt-f-op").last().selectOption("entraxe");
  await form.getByTestId("qt-f-op-valeur").last().fill("0,6");
  await form.getByTestId("qt-f-op-ajouter").click();
  await form.getByTestId("qt-f-op").last().selectOption("ajouter");
  await form.getByTestId("qt-f-op-valeur").last().fill("1");
  await form.getByTestId("qt-f-arrondi").selectOption("superieur");
  await form.getByTestId("qt-f-pas").fill("1");
  await expect(form.getByTestId("qt-f-unite-produite")).toHaveText("Unité produite : u");
  await expect(form.getByTestId("qt-f-formule")).toHaveText("Longueur de murs (plan) ÷ entraxe 0,6 m + 1 → arrondi supérieur (1) = u");
  await form.getByTestId("qt-f-enregistrer").click();
  await expect(qtMessage(page)).toHaveText("Ouvrage « Montants 48 » ajouté.");
  // Par mur : s 6,00 → 11 ; e 4,00 → 8 ; n 11 ; w 8 ; cloison 4,00 → 8. Rattachement : w → Séjour, e → Chambre,
  // s, n et la cloison bordent les deux pièces → étage (jamais comptés deux fois).
  const montants = await ouvrir(page, "Montants 48");
  await expect(montants.getByTestId("qt-ouvrage-total")).toHaveText("46 u");
  await expect(ligne(montants, ctx.sejour, "existant").getByTestId("qt-ligne-quantite")).toHaveText("8 u");
  await expect(ligne(montants, ctx.chambre, "existant").getByTestId("qt-ligne-quantite")).toHaveText("8 u");
  await expect(ligne(montants, "etage", "existant").getByTestId("qt-ligne-quantite")).toHaveText("30 u");
  // Formule invalide rejetée par le SERVEUR aussi (le client ne peut pas contourner).
  const invalid = await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: plans.e1, p_id: uuid(), p_donnees: ouvrage({ regle: { source: "surface_sol", operations: [{ op: "eval", valeur: 1 }] } }) });
  expect(invalid.error?.code).toBe("22023");
  expect(invalid.error?.message).toContain("Formule invalide");
  const { data: row } = must(await ctx.a.from("tools_releves_ouvrages").select("origine, created_by, revision").eq("plan_id", plans.e1).eq("donnees->>nom", "Montants 48").single());
  expect(row).toMatchObject({ origine: "auto", revision: 1 });
});

test("Ajustements : quantité calculée jamais écrasée, raison obligatoire, auteur / date, retrait tracé", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl());
  const strat = await ouvrir(page, "Sol stratifié");
  const row = ligne(strat, ctx.sejour, "nouveau");
  await row.getByTestId("qt-ajuster").click();
  await row.getByTestId("qt-ajustement-valeur").fill("12");
  await row.getByTestId("qt-ajustement-valider").click();
  await expect(row.getByRole("alert")).toHaveText("La raison de l'ajustement est obligatoire.");
  await row.getByTestId("qt-ajustement-raison").fill("Paquets entiers de 2,13 m²");
  await row.getByTestId("qt-ajustement-valider").click();
  await expect(qtMessage(page)).toHaveText("Sol stratifié ajusté : la quantité calculée reste affichée à côté.");
  const after = ligne(await ouvrir(page, "Sol stratifié"), ctx.sejour, "nouveau");
  await expect(after.getByTestId("qt-ligne-quantite")).toHaveText("12,00 m² · calculé 11,59 m²");
  await expect(after.getByTestId("qt-ajustement")).toContainText("Retenu 12,00 m² au lieu de 11,59 m² — « Paquets entiers de 2,13 m² »");
  await expect(page.getByTestId("qt-total-ajustees")).toHaveText("1");
  await expect(carte(page, "Sol stratifié").getByTestId("qt-ouvrage-total")).toHaveText("23,59 m²");
  const { data: aj } = must(await ctx.a.from("tools_releves_quantitatif_ajustements").select("valeur_calculee, valeur_retenue, raison, created_by, created_at").eq("plan_id", plans.e1).is("retire_le", null).single());
  const { data: user } = await ctx.a.auth.getUser();
  expect(aj).toMatchObject({ valeur_calculee: 11.59, valeur_retenue: 12, raison: "Paquets entiers de 2,13 m²", created_by: user.user!.id });
  // Aucune écriture directe (RLS : lecture seule).
  const direct = await ctx.a.from("tools_releves_quantitatif_ajustements").update({ valeur_retenue: 1 }).eq("plan_id", plans.e1).select();
  expect(direct.data ?? []).toHaveLength(0);
  // Retrait : retour à la quantité calculée, historique conservé.
  await after.getByTestId("qt-retirer").click();
  await expect(qtMessage(page)).toHaveText("Ajustement retiré : retour à la quantité calculée.");
  await expect(carte(page, "Sol stratifié").getByTestId("qt-ouvrage-total")).toHaveText("23,18 m²");
  const { count } = await ctx.a.from("tools_releves_quantitatif_ajustements").select("id", { count: "exact", head: true }).eq("plan_id", plans.e1).not("retire_le", "is", null);
  expect(count).toBe(1);
});

test("Existant / dépose / neuf : plan projeté dérivé (ouvrages copiés), quantités séparées, conservé / à déposer / à créer", async ({ page }) => {
  // Projeté : cloison à déposer, cloison neuve de 2,00 m (hors contour).
  const { data: derived } = must(await ctx.a.rpc("tools_releve_plan_creer", { p_etage_id: ctx.e1, p_etat: "projete" }));
  plans.projete = (derived as { id: string }).id;
  const { data: copies } = must(await ctx.a.from("tools_releves_elements").select("id, donnees").eq("plan_id", plans.projete).eq("type", "mur"));
  const cloison = (copies as { id: string; donnees: Record<string, unknown> }[]).find((m) => m.donnees.origineId === walls.c)!;
  must(await ctx.a.rpc("tools_releve_plan_enregistrer", { p_plan_id: plans.projete, p_revision: await revision(plans.projete), p_modifications: { murs: [
    { id: cloison.id, pieceId: null, donnees: { ...cloison.donnees, etatProjet: "a_deposer" } },
    { ...wall(uuid(), 1000, 1000, 1000, 3000, 100, "cloison"), donnees: { ...wall("x", 1000, 1000, 1000, 3000, 100, "cloison").donnees, etatProjet: "nouveau" } },
  ] } }));
  const q = await quantitatif(plans.projete);
  expect(q.ouvrages.map((o) => o.nom).sort()).toEqual(["Montants 48", "Peinture murs (2 couches)", "Plinthes", "Portes (bloc-porte)", "Sol stratifié"]);
  must(await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: plans.projete, p_id: uuid(), p_donnees: ouvrage({
    nom: "Cloisons (tous états)", code: "MURS-ETATS", categorie: "cloisons", regle: { source: "surface_murs_plan" }, etats: ["existant", "a_deposer", "nouveau", "deplace"] }) }));
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl("&etat=projete"));
  await expect(page.getByTestId("qt-plan-badge")).toHaveText("Plan 2 · Projetée · calculé");
  // Conservé : s 15 + e 10 + n 15 + w 10 = 50 m² ; à déposer : cloison 10 m² ; à créer : cloison neuve 2,00 × 2,50 = 5 m².
  const total = page.locator('[data-testid="qt-total"][data-cle="murs-etats|m2"]');
  await expect(total.getByTestId("qt-conserve")).toHaveText("conservé 50,00 m²");
  await expect(total.getByTestId("qt-a-deposer")).toHaveText("à déposer 10,00 m²");
  await expect(total.getByTestId("qt-a-creer")).toHaveText("à créer 5,00 m²");
  await expect(total.getByTestId("qt-total-quantite")).toHaveText("65,00 m²");
  // Montants (copie de l'existant) : la cloison déposée ne compte plus dans l'état « existant ».
  await expect(carte(page, "Montants 48").getByTestId("qt-ouvrage-total")).toHaveText("38 u");
});

test("Synthèse par chantier, bâtiment, étage, zone, pièce, lot, ouvrage ; exports CSV et contrat Gestion Pro", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl());
  for (const [niveau, libelle] of [["chantier", "Maison Lot 9"], ["batiment", "Maison"], ["etage", "RDC"], ["zone", "Logement"], ["piece", "Séjour"], ["lot", "Peinture"], ["ouvrage", "Sol stratifié (m²)"]] as const) {
    await page.getByTestId("qt-niveau").selectOption(niveau);
    await expect(page.getByTestId("qt-synthese").getByRole("heading")).toContainText("Synthèse par");
    await expect(page.getByTestId("qt-groupe").filter({ hasText: libelle }).first()).toBeVisible();
    expect(page.url()).toContain(niveau === "ouvrage" ? `id=${ctx.releveId}` : `niveau=${niveau}`);
  }
  await page.getByTestId("qt-niveau").selectOption("piece");
  const sejour = page.getByTestId("qt-groupe").filter({ hasText: "Séjour" }).first();
  if (!(await sejour.evaluate((element) => (element as HTMLDetailsElement).open))) await sejour.locator("summary").click();
  await expect(sejour.locator('[data-testid="qt-total"][data-cle="sol-str|m2"] [data-testid="qt-total-quantite"]')).toHaveText("11,59 m²");
  let started = Date.now();
  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("qt-export-csv").click()]);
  const csv = readFileSync((await csvDownload.path())!, "utf8");
  perf.export_csv_ms = Date.now() - started;
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("Maison Lot 9;Maison;RDC;Logement;Séjour;Revêtements de sols;Sols;SOL-STR;Sol stratifié;m²;11,590;11,590;non;;Surface de sol;Surface de sol + perte 7 % → arrondi supérieur (0,01) = m²;Nouveau;Automatique;;");
  expect(csv).toContain("Maison Lot 9;Maison;RDC;;Chambre;Peinture;Peinture;PEI-MUR;Peinture murs (2 couches);m²;;;non;Non calculable;");
  expect(csv).toContain(";RDC;;(partagé entre pièces);Menuiseries intérieures;Portes;POR-U;Portes (bloc-porte);u;1,000;1,000;non;");
  started = Date.now();
  const [gpDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("qt-export-json").click()]);
  const gp = JSON.parse(readFileSync((await gpDownload.path())!, "utf8"));
  perf.export_gp_ms = Date.now() - started;
  expect(gp).toMatchObject({ contract: { name: "elsatia.tools.quantitatif", version: "1.0.0" }, kind: "releve-metre/quantitatif",
    readiness: { status: "contract-only", devis: "not-generated" }, source: { releveId: ctx.releveId, etat: "existant", moteur: "quantitatif-v1" } });
  const strat = gp.lignes.find((l: { source: string; emplacement: { piece: { id: string } | null } }) => l.source === "surface_sol" && l.emplacement.piece?.id === ctx.sejour);
  expect(strat).toMatchObject({ unite: "m2", quantite: "11.590", quantiteCalculee: "11.590", etatProjet: "nouveau",
    emplacement: { chantier: { nom: "Maison Lot 9" }, batiment: { nom: "Maison" }, etage: { nom: "RDC" }, zone: { nom: "Logement" }, piece: { nom: "Séjour" } } });
  expect(gp.lignes.every((l: { quantite: string | null }) => l.quantite === null || /^-?\d+\.\d{3}$/.test(l.quantite))).toBe(true);
  expect(gp.anomalies.some((a: { code: string }) => a.code === "source_absente")).toBe(true);
  expect(JSON.stringify(gp)).not.toMatch(/"[^"]*(prix|price|tarif|montant)[^"]*"\s*:/i);
});

test("Bibliothèque d'ouvrages : enregistrer, réutiliser sur un autre plan, aucun prix", async ({ page }) => {
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl());
  const montants = await ouvrir(page, "Montants 48");
  await montants.getByTestId("qt-ouvrage-bibliotheque").click();
  await expect(qtMessage(page)).toHaveText("« Montants 48 » enregistré dans la bibliothèque.");
  const prix = await ctx.a.rpc("tools_releve_bibliotheque_enregistrer", { p_releve_id: ctx.releveId, p_id: uuid(), p_donnees: ouvrage({ nom: "Avec prix", prixUnitaireHt: 12 }) });
  expect(prix.error?.message).toBe("Aucun prix dans Tools : un ouvrage décrit la prestation, son unité et sa règle de quantité.");
  await page.goto(qtUrl("&etat=projete"));
  const section = planSection(page, plans.projete);
  await section.getByTestId("qt-ajouter-bibliotheque").click();
  const entree = section.getByTestId("qt-bibliotheque-entree").filter({ hasText: "Montants 48" }).first();
  await expect(entree).toContainText("Longueur de murs (plan) ÷ entraxe 0,6 m + 1 → arrondi supérieur (1) = u");
  await entree.getByTestId("qt-bibliotheque-choix").check();
  await section.getByTestId("qt-bibliotheque-ajouter").click();
  await expect(qtMessage(page)).toHaveText("1 ouvrage(s) ajouté(s) depuis la bibliothèque.");
  const { data: rows } = must(await ctx.a.from("tools_releves_ouvrages").select("bibliotheque_id").eq("plan_id", plans.projete).eq("donnees->>nom", "Montants 48").is("deleted_at", null));
  expect((rows as { bibliotheque_id: string | null }[]).filter((r) => r.bibliotheque_id !== null)).toHaveLength(1);
});

test("Anomalies : quantité négative, pièce supprimée, ajustement orphelin — préparées pour le futur module Erreurs", async ({ page }) => {
  const negatif = uuid();
  must(await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: plans.projete, p_id: negatif, p_donnees: ouvrage({ nom: "Reprise négative", unite: "u", regle: { source: "saisie", valeur: 1, operations: [{ op: "ajouter", valeur: -3 }] } }) }));
  const cellier = uuid();
  must(await ctx.a.from("tools_releves_pieces").insert({ id: cellier, releve_id: ctx.releveId, etage_id: ctx.e1, nom: "Cellier", usage: "autre", ordre: 2 }));
  must(await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: plans.projete, p_id: uuid(), p_donnees: ouvrage({ nom: "Cellier peint", pieceIds: [cellier] }) }));
  must(await ctx.a.from("tools_releves_pieces").update({ deleted_at: new Date().toISOString() }).eq("id", cellier));
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl("&etat=projete"));
  const anomalies = page.getByTestId("qt-anomalies");
  await expect(anomalies.locator('[data-code="quantite_negative"]')).toContainText("Quantité négative : vérifiez la formule (ajout négatif ?).");
  await expect(anomalies.locator('[data-code="objet_supprime"]')).toContainText("Objet supprimé : pièce visée supprimée.");
  await expect(page.getByTestId("qt-total-anomalies")).toContainText(/^[1-9]\d* erreur\(s\)/);
  const q = await quantitatif(plans.projete);
  expect(q.anomalies.map((a) => `${a.code}:${a.detail}`)).toEqual(expect.arrayContaining(["quantite_negative:negative", "objet_supprime:piece_supprimee"]));
});

test("Versioning : quantitatif figé avec le plan (immuable, insensible aux modifications), plan dérivé recalculé", async ({ page }) => {
  must(await ctx.a.rpc("tools_releve_plan_figer", { p_plan_id: plans.e1, p_revision: await revision(plans.e1), p_libelle: "Existant Lot 9" }));
  const avant = await quantitatif(plans.e1);
  expect(avant).toMatchObject({ source: "gel", fige: true });
  // Hauteur de la Chambre saisie APRÈS le gel : le quantitatif figé ne bouge pas ; le projeté (non figé) suit.
  must(await ctx.a.from("tools_releves_pieces").update({ hauteur_sous_plafond_mm: 2500 }).eq("id", ctx.chambre));
  const apres = await quantitatif(plans.e1);
  expect(apres.lignes).toEqual(avant.lignes);
  const refus = await ctx.a.rpc("tools_releve_ouvrage_enregistrer", { p_plan_id: plans.e1, p_id: uuid(), p_donnees: ouvrage({}) });
  expect(refus.error?.code).toBe("42501");
  await signIn(page, EMAIL_A);
  await page.goto(qtUrl());
  await expect(page.getByTestId("qt-plan-badge")).toHaveText("Plan 1 · Initiale · quantitatif figé");
  await expect(planSection(page, plans.e1).getByTestId("qt-ajouter")).toHaveCount(0);
  await expect(carte(page, "Peinture murs (2 couches)").getByTestId("qt-ouvrage-total")).toHaveText("31,167 m² (+ 1 non calculable)");
  await page.getByTestId("qt-etat-projete").click();
  await expect(carte(page, "Peinture murs (2 couches)").getByTestId("qt-ouvrage-total")).not.toContainText("non calculable");
});

test("Sécurité : autre tenant (lecture, synthèse, écriture, bibliothèque), écritures directes refusées", async ({ page }) => {
  for (const [rpc, args] of [
    ["tools_releve_plan_quantitatif", { p_plan_id: plans.projete }],
    ["tools_releve_quantitatif_synthese", { p_releve_id: ctx.releveId, p_etat: "projete" }],
    ["tools_releve_ouvrage_enregistrer", { p_plan_id: plans.projete, p_id: uuid(), p_donnees: ouvrage({}) }],
    ["tools_releve_bibliotheque", { p_releve_id: ctx.releveId }],
  ] as const) {
    const { error } = await ctx.b.rpc(rpc, args);
    expect(error?.code, rpc).toBe("42501");
  }
  const { data: visibles } = await ctx.b.from("tools_releves_ouvrages").select("id").eq("releve_id", ctx.releveId);
  expect(visibles ?? []).toHaveLength(0);
  const direct = await ctx.a.from("tools_releves_ouvrages").insert({ releve_id: ctx.releveId, plan_id: plans.projete, donnees: ouvrage({}) });
  expect(direct.error).not.toBeNull();
  await signIn(page, EMAIL_B);
  await page.goto(qtUrl());
  await expect(page.getByTestId("qt-vue")).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tablette — Chromium en émulation tactile (MOBILE EMULATED ONLY)
// ─────────────────────────────────────────────────────────────────────────────
const TABLET: BrowserContextOptions = { reducedMotion: "reduce", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };

test("Tablette 820×1180 : quantitatifs lisibles (cartes, aucun tableau horizontal), ajouter et ajuster au doigt", async () => {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext(TABLET);
    const page = await context.newPage();
    await signIn(page, EMAIL_A);
    await page.goto(qtUrl("&etat=projete"));
    await expect(page.getByTestId("qt-total-ouvrages")).not.toHaveText("0");
    expect(await sansDebordement(page)).toBe(true);
    expect(await page.locator("table").count()).toBe(0);
    const section = planSection(page, plans.projete);
    await section.getByTestId("qt-ajouter-catalogue").tap();
    await section.getByTestId("qt-catalogue-CAR-SOL").tap();
    await section.getByTestId("qt-catalogue-ajouter").tap();
    await expect(qtMessage(page)).toHaveText("1 ouvrage(s) ajouté(s) depuis le catalogue.");
    const carrelage = carte(page, "Carrelage sol");
    await carrelage.locator("summary").tap();
    await expect(carrelage.getByTestId("qt-formule")).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    for (const target of [carrelage.locator("summary"), page.getByTestId("qt-export-csv"), page.getByTestId("qt-niveau")]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    }
    // Carrelage : 10,83 × 1,10 = 11,913 m² par pièce (projeté : état « nouveau »).
    const row = ligne(carrelage, ctx.sejour, "nouveau");
    await expect(row.getByTestId("qt-ligne-quantite")).toHaveText("11,913 m²");
    expect((await row.getByTestId("qt-ajuster").boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await row.getByTestId("qt-ajuster").tap();
    await row.getByTestId("qt-ajustement-valeur").fill("12,5");
    await row.getByTestId("qt-ajustement-raison").fill("Calepinage 60×60");
    await row.getByTestId("qt-ajustement-valider").tap();
    await expect(qtMessage(page)).toHaveText("Carrelage sol ajusté : la quantité calculée reste affichée à côté.");
    expect(await sansDebordement(page)).toBe(true);
    await page.getByTestId("qt-niveau").selectOption("lot");
    await expect(page.getByTestId("qt-groupe").first()).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: join(dir, "tablette-quantitatifs.png"), fullPage: false });
    await context.close();
  } finally {
    await browser.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Performances : 100 ouvrages × 50 pièces et 1 000 ouvrages × 5 pièces (5 000 lignes chacun)
// ─────────────────────────────────────────────────────────────────────────────
const KINDS = [
  { nom: "Peinture", categorie: "peinture", unite: "m2", regle: { source: "surface_murs" }, pertePourcent: 5 },
  { nom: "Plinthes", categorie: "plinthes", unite: "ml", regle: { source: "perimetre_utile" }, pertePourcent: 5 },
  { nom: "Stratifié", categorie: "sols", unite: "m2", regle: { source: "surface_sol" }, pertePourcent: 7, arrondi: { mode: "superieur", pas: 0.01 } },
  { nom: "Faux plafond", categorie: "plafonds", unite: "m2", regle: { source: "surface_plafond" }, pertePourcent: 5 },
  { nom: "Ragréage", categorie: "sols", unite: "kg", regle: { source: "surface_sol", operations: [{ op: "ratio_kg", valeur: 4.5 }] }, arrondi: { mode: "superieur", pas: 25 } },
];
for (const [nbOuvrages, nbPieces] of [[100, 50], [1000, 5]] as const) {
  test(`Performance ${nbOuvrages} ouvrages × ${nbPieces} pièces (5 000 lignes) : calcul, recalcul, affichage, agrégation, export`, async ({ page }) => {
    const etageId = uuid();
    must(await ctx.a.from("tools_releves_etages").insert({ id: etageId, releve_id: ctx.releveId, batiment_id: ctx.batimentId, nom: `Perf ${nbOuvrages}`, niveau: nbOuvrages === 100 ? 3 : 4, type_niveau: "etage", ordre: 10 + nbPieces, hauteur_sous_plafond_mm: 2500 }));
    const cols = Math.ceil(Math.sqrt(nbPieces)); const rows = Math.ceil(nbPieces / cols); const step = 3000;
    const h = (r: number, c: number) => `h${r}-${c}`; const v = (c: number, r: number) => `v${c}-${r}`;
    const idOf: Record<string, string> = {};
    const murs: Wall[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) { idOf[h(r, c)] = uuid(); murs.push(wall(idOf[h(r, c)], c * step, r * step, (c + 1) * step, r * step)); }
    for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) { idOf[v(c, r)] = uuid(); murs.push(wall(idOf[v(c, r)], c * step, r * step, c * step, (r + 1) * step)); }
    const pieces: { id: string; releve_id: string; etage_id: string; nom: string; usage: string; ordre: number }[] = [];
    const contours: unknown[] = [];
    for (let i = 0; i < nbPieces; i++) {
      const r = Math.floor(i / cols); const c = i % cols; const id = uuid();
      pieces.push({ id, releve_id: ctx.releveId, etage_id: etageId, nom: `P${nbOuvrages}-${i + 1}`, usage: "bureau", ordre: i });
      contours.push({ pieceId: id, points: rect(c * step + 100, r * step + 100, (c + 1) * step - 100, (r + 1) * step - 100), murIds: [idOf[h(r, c)], idOf[v(c + 1, r)], idOf[h(r + 1, c)], idOf[v(c, r)]], graine: { x: c * step + 1500, y: r * step + 1500 } });
    }
    must(await ctx.a.from("tools_releves_pieces").insert(pieces));
    const planId = await seedPlan(etageId, { murs, contours });
    let t = Date.now();
    const lot = Array.from({ length: nbOuvrages }, (_, i) => ({ id: uuid(), donnees: ouvrage({ ...KINDS[i % KINDS.length], code: `PERF-${i % KINDS.length}` }) }));
    must(await ctx.a.rpc("tools_releve_ouvrages_importer", { p_plan_id: planId, p_ouvrages: lot }));
    const importMs = Date.now() - t;
    t = Date.now();
    const first = await quantitatif(planId);
    const calculMs = Date.now() - t;
    expect(first.lignes).toHaveLength(5000);
    // Édition : une hauteur de pièce change → recalcul complet côté serveur.
    must(await ctx.a.from("tools_releves_pieces").update({ hauteur_sous_plafond_mm: 2700 }).eq("id", pieces[0].id));
    t = Date.now();
    const second = await quantitatif(planId);
    const recalculMs = Date.now() - t;
    expect(second.lignes).toHaveLength(5000);
    expect(second.lignes.find((l) => l.pieceId === pieces[0].id && l.ouvrageId === lot[0].id)!.quantiteCalculee)
      .not.toBe(first.lignes.find((l) => l.pieceId === pieces[0].id && l.ouvrageId === lot[0].id)!.quantiteCalculee);
    // Affichage (tous les étages projetés : 0 ; existant : RDC figé + cet étage).
    await signIn(page, EMAIL_A);
    t = Date.now();
    await page.goto(qtUrl());
    await expect(planSection(page, planId)).toBeVisible({ timeout: 60_000 });
    const renderMs = Date.now() - t;
    const serverMs = Number(await page.getByTestId("qt-vue").getAttribute("data-calcul-ms"));
    t = Date.now();
    await page.getByTestId("qt-niveau").selectOption("piece");
    await expect(page.getByTestId("qt-groupe").filter({ hasText: `P${nbOuvrages}-${nbPieces}` })).toBeVisible({ timeout: 60_000 });
    const agregationMs = Date.now() - t;
    t = Date.now();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("qt-export-csv").click()]);
    const csv = readFileSync((await download.path())!, "utf8");
    const exportCsvMs = Date.now() - t;
    expect(csv.split("\r\n").filter((l) => l.includes(`;Perf ${nbOuvrages};`)).length).toBe(5000);
    t = Date.now();
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("qt-export-json").click()]);
    const gp = JSON.parse(readFileSync((await json.path())!, "utf8"));
    const exportJsonMs = Date.now() - t;
    expect(gp.lignes.length).toBeGreaterThanOrEqual(5000);
    perf[`ouvrages_${nbOuvrages}`] = { pieces: nbPieces, lignes: first.lignes.length, importMs, calculMs, recalculMs, renderMs, serverMs, agregationMs, exportCsvMs, exportJsonMs };
    expect(calculMs).toBeLessThan(15_000);
    expect(renderMs).toBeLessThan(60_000);
  });
}
