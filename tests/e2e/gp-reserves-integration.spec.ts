import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { login } from "./helpers";
import { RESERVES, connexion, deconnexionUI, jetonSupabase, rpc } from "./reserves-aides";

/*
 * Recette cross-app Gestion Pro ↔ ELSATIA Réserves (intégration V1).
 *
 * Deux applications COMPILÉES (GP sur 3100, Réserves sur 3020), une pile Supabase locale
 * (passerelle au-dessus du vrai PostgreSQL, train complet). Décor :
 * tests/e2e/gp-reserves-pile-locale/preparer-base.sh.
 *
 * Scénario : GP → fiche chantier → « Utiliser dans ELSATIA Réserves » → (10 mises à jour :
 * aucun doublon) → Réserves : chantier, entreprises, contacts, plans repris → création
 * d'une réserve → assignation → acceptation et demande de levée par l'entreprise invitée
 * → levée validée → retour GP : résumé mis à jour à chaque étape. Plus les profils :
 * sans rôle Réserves, salarié, chef de chantier, autre tenant.
 */

const CHANTIER_GP = "a4000000-0000-0000-0000-000000000001";
const CHANTIER_GP_B = "b4000000-0000-0000-0000-000000000001";
const FICHE = `/chantiers/${CHANTIER_GP}`;
const PAS_LOGIN = /^(?!.*\/login).*$/;

async function plan(texte: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#fff"/>
    <rect x="40" y="40" width="720" height="420" fill="none" stroke="#333" stroke-width="6"/>
    <text x="60" y="100" font-size="40" font-family="sans-serif">${texte}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Dépôt des fichiers de plans GP (ce que ferait l'écran « Photos & documents » de GP). */
async function deposerPlanGp(request: APIRequestContext, chemin: string, texte: string) {
  const reponse = await request.post(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/chantier-documents/${chemin}`, {
    headers: { Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
    data: await plan(texte),
  });
  expect(reponse.status()).toBe(200);
}

async function lire(request: APIRequestContext, jeton: string, table: string, requete: string) {
  const reponse = await request.get(`${process.env.E2E_SUPABASE_URL}/rest/v1/${table}?${requete}`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, Authorization: `Bearer ${jeton}` },
  });
  expect(reponse.status()).toBe(200);
  return (await reponse.json()) as Record<string, unknown>[];
}

const bloc = (page: Page) => page.getByRole("region", { name: "ELSATIA Réserves" });

async function compteurs(page: Page) {
  await page.goto(FICHE);
  const lireTuile = async (id: string) => Number(await bloc(page).getByTestId(`reserves-${id}`).locator("dd").innerText());
  return {
    total: await lireTuile("total"), ouvertes: await lireTuile("ouvertes"), enCours: await lireTuile("en-cours"),
    attente: await lireTuile("attente-levée"), levees: await lireTuile("levées"),
  };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await deposerPlanGp(request, `a0000000-0000-0000-0000-000000000001/${CHANTIER_GP}/plan-rdc-v1.png`, "PLAN RDC — v1");
  await deposerPlanGp(request, `a0000000-0000-0000-0000-000000000001/${CHANTIER_GP}/plan-etage-v1.png`, "PLAN ÉTAGE — v1");
});

test("sans rôle Réserves : la fiche chantier GP n'affiche aucun bloc Réserves", async ({ page }) => {
  await login(page, "dirigeant-a@invalid.local", PAS_LOGIN);
  await page.goto(FICHE);
  await expect(page.getByRole("heading", { name: "RECETTE_A_Résidence des Tanneurs" })).toBeVisible();
  await expect(bloc(page)).toHaveCount(0);
  await expect(page.getByText("Utiliser dans ELSATIA Réserves")).toHaveCount(0);
});

test("salarié affecté (émetteur Réserves) : bloc visible, sans action de synchronisation", async ({ page }) => {
  await login(page, "ouvrier-a@invalid.local", PAS_LOGIN);
  await page.goto(FICHE);
  await expect(bloc(page)).toBeVisible();
  await expect(bloc(page)).toContainText("Un responsable des réserves peut activer le suivi");
  await expect(bloc(page).getByRole("button")).toHaveCount(0);
});

test("parcours complet GP → Réserves → levée → retour GP", async ({ page, request }) => {
  test.setTimeout(240_000);
  // ── 1. Manager GP : première utilisation ──────────────────────────────────
  await login(page, "admin-a@invalid.local", PAS_LOGIN);
  await page.goto(FICHE);
  await expect(bloc(page)).toContainText("L’adresse, le client, les entreprises, les contacts et les plans y sont repris");
  await bloc(page).getByRole("button", { name: "Utiliser dans ELSATIA Réserves" }).click();
  await expect(page.getByText("Chantier créé dans ELSATIA Réserves : 2 entreprises ajoutées, 4 contacts ajoutés, 2 plans transmis.")).toBeVisible();
  // Aucune configuration technique visible.
  await expect(bloc(page)).not.toContainText(/uuid|rpc|gp_|storage|synchronis/i);
  expect(await compteurs(page)).toEqual({ total: 0, ouvertes: 0, enCours: 0, attente: 0, levees: 0 });

  // ── 2. Idempotence : 10 mises à jour par l'écran ──────────────────────────
  for (let i = 0; i < 10; i += 1) {
    await bloc(page).getByRole("button", { name: "Mettre à jour depuis Gestion Pro" }).click();
    await expect(page.getByText("Chantier mis à jour dans ELSATIA Réserves.")).toBeVisible();
  }
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const chantiers = await lire(request, jetonA, "reserves_chantiers", `select=id,nom,adresse,code_postal,ville,reference,client,source&chantier_gp_id=eq.${CHANTIER_GP}`);
  expect(chantiers).toHaveLength(1);
  expect(chantiers[0]).toMatchObject({
    nom: "RECETTE_A_Résidence des Tanneurs", adresse: "12 rue des Tanneurs", code_postal: "68000",
    ville: "Colmar", reference: "CHA-REC-001", client: "TEST_A_Client secret", source: "gestion_pro",
  });
  const chantierReserves = String(chantiers[0].id);
  expect(await lire(request, jetonA, "reserves_intervenants", `select=id&chantier_id=eq.${chantierReserves}`)).toHaveLength(2);
  expect(await lire(request, jetonA, "reserves_contacts", `select=id&chantier_id=eq.${chantierReserves}`)).toHaveLength(4);
  const plans = await lire(request, jetonA, "reserves_plans", `select=id,nom,gp_version,storage_path&chantier_id=eq.${chantierReserves}&order=nom`);
  expect(plans.map((p) => [p.nom, p.gp_version, Boolean(p.storage_path)])).toEqual([["Plan RDC", 1, true], ["Plan étage", 1, true]]);

  // ── 3. « Ouvrir dans Réserves » : lien issu du catalogue ─────────────────
  const lien = bloc(page).getByRole("link", { name: "Ouvrir dans Réserves" });
  await expect(lien).toHaveAttribute("href", `http://localhost:3020/chantiers/${chantierReserves}`);

  // ── 4. Réserves : ce qui a été repris ─────────────────────────────────────
  await connexion(page, "admin-a@invalid.local", `/chantiers/${chantierReserves}`);
  await page.goto(`${RESERVES}/chantiers/${chantierReserves}`);
  await expect(page.getByRole("heading", { name: "RECETTE_A_Résidence des Tanneurs" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Repris de Gestion Pro");
  await expect(page.locator("body")).toContainText("2 entreprises");
  await expect(page.locator("body")).toContainText("Mme Syndic");
  await expect(page.locator("body")).toContainText("Paul Volt");
  await page.goto(`${RESERVES}/chantiers/${chantierReserves}/plans`);
  await expect(page.locator("body")).toContainText("Gestion Pro · version 1");
  // Le plan copié est réellement servi par le bucket Réserves.
  const ouvrir = page.getByRole("link", { name: "Ouvrir" }).first();
  const image = await page.request.get(new URL(String(await ouvrir.getAttribute("href")), RESERVES).toString());
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");

  // ── 5. Création d'une réserve dans Réserves (écran), attribuée à une entreprise reprise ─
  await page.goto(`${RESERVES}/chantiers/${chantierReserves}/nouvelle-reserve`);
  await page.locator('input[name="titre"]').fill("Tableau électrique non étiqueté");
  await page.locator('select[name="intervenant_id"]').selectOption({ label: "Électricité Rhin — Électricité" });
  await page.getByRole("button", { name: "Envoyer la réserve" }).click();
  await expect(page).not.toHaveURL(/nouvelle-reserve/);
  const reserves = await lire(request, jetonA, "reserves", `select=id,statut,intervenant_id&chantier_id=eq.${chantierReserves}`);
  expect(reserves).toHaveLength(1);
  expect(reserves[0].statut).toBe("assignee");
  const reserveId = String(reserves[0].id);
  const intervenantId = String(reserves[0].intervenant_id);

  // Une deuxième réserve, émise sans entreprise (reste « ouverte »).
  const seconde = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: chantierReserves, p_titre: "Plinthe à reprendre", p_description: null, p_priorite: "basse",
    p_intervenant_id: null, p_plan_id: null, p_position_x: null, p_position_y: null,
    p_photo_obligatoire_levee: false, p_echeance: null, p_origine_client_id: null, p_plan_page: null,
  });
  expect(seconde.status()).toBe(200);

  // ── 6. Retour GP après création / assignation ────────────────────────────
  await login(page, "admin-a@invalid.local", PAS_LOGIN);
  expect(await compteurs(page)).toEqual({ total: 2, ouvertes: 1, enCours: 1, attente: 0, levees: 0 });

  // ── 7. L'entreprise invitée : invitation explicite (un contact n'ouvre aucun accès) ─
  // Le gérant de C est le contact « Paul Volt » (même e-mail) : il n'a pourtant rien reçu.
  const jetonC = await jetonSupabase(request, "intervenant-c@invalid.local");
  expect(await lire(request, jetonC, "reserves", "select=id")).toHaveLength(0);
  const invitationJeton = `recette-gp-${Date.now()}`;
  const invitation = await rpc(request, jetonA, "reserves_inviter_intervenant", {
    p_intervenant_id: intervenantId,
    p_token_hash: createHash("sha256").update(invitationJeton).digest("hex"),
    p_email: "intervenant-c@invalid.local",
    p_contact_nom: "Paul Volt",
  });
  expect(invitation.status()).toBe(200);
  await connexion(page, "intervenant-c@invalid.local", `/invitation/${invitationJeton}`);
  await page.getByRole("button", { name: "Rejoindre l’intervention" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // ── 8. Acceptation, demande de levée (écran de l'entreprise invitée) ──────
  await page.goto(`${RESERVES}/reserves/${reserveId}`);
  await page.getByRole("button", { name: "J’accepte" }).click();
  await expect(page.locator("body")).toContainText(/Acceptée/i);
  await page.getByRole("button", { name: /Demander la levée/i }).click();
  await expect(page.locator("body")).toContainText(/Levée demandée/i);
  await deconnexionUI(page);

  await login(page, "admin-a@invalid.local", PAS_LOGIN);
  expect(await compteurs(page)).toEqual({ total: 2, ouvertes: 1, enCours: 0, attente: 1, levees: 0 });

  // ── 9. Levée validée par l'hôte dans Réserves ─────────────────────────────
  await connexion(page, "admin-a@invalid.local", `/reserves/${reserveId}`);
  await page.goto(`${RESERVES}/reserves/${reserveId}`);
  await page.getByRole("button", { name: "Valider la levée" }).click();
  await expect(page.locator("body")).toContainText(/Levée/);

  // ── 10. Retour GP : résumé mis à jour ─────────────────────────────────────
  await login(page, "admin-a@invalid.local", PAS_LOGIN);
  expect(await compteurs(page)).toEqual({ total: 2, ouvertes: 1, enCours: 0, attente: 0, levees: 1 });
  // L'état GP n'expose ni titres de réserves, ni motifs.
  await expect(bloc(page)).not.toContainText("Tableau électrique");

  // ── 11. Une nouvelle version GP d'un plan déjà utilisé n'écrase rien ──────
  // La seconde réserve est repérée sur le plan RDC, puis GP publie une v2 de ce plan.
  const planRdc = String(plans[0].id);
  const repositionner = await rpc(request, jetonA, "reserves_repositionner", {
    p_reserve_id: String((await lire(request, jetonA, "reserves", `select=id&chantier_id=eq.${chantierReserves}&statut=eq.emise`))[0].id),
    p_plan_id: planRdc, p_plan_page: 1, p_position_x: 0.5, p_position_y: 0.5,
  });
  expect(repositionner.status()).toBeLessThan(300);
  await deposerPlanGp(request, `a0000000-0000-0000-0000-000000000001/${CHANTIER_GP}/plan-rdc-v2.png`, "PLAN RDC — v2");
  const majDoc = await request.patch(`${process.env.E2E_SUPABASE_URL}/rest/v1/documents_chantier?id=eq.a7100000-0000-0000-0000-000000000001`, {
    // Le manager GP remplace le fichier du document (ce que fait l'écran « Photos & documents »).
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, Authorization: `Bearer ${jetonA}`, "Content-Type": "application/json", Prefer: "return=representation" },
    data: { storage_path: `a0000000-0000-0000-0000-000000000001/${CHANTIER_GP}/plan-rdc-v2.png` },
  });
  expect(majDoc.status()).toBeLessThan(300);
  expect(await majDoc.json()).toHaveLength(1);
  await page.goto(FICHE);
  await bloc(page).getByRole("button", { name: "Mettre à jour depuis Gestion Pro" }).click();
  await expect(page.getByText(/1 plan a une nouvelle version dans Gestion Pro/)).toBeVisible();
  await expect(bloc(page)).toContainText("1 plan a une version plus récente dans Gestion Pro");
  const apres = await lire(request, jetonA, "reserves_plans", `select=gp_version,storage_path,gp_maj_disponible&id=eq.${planRdc}`);
  expect(apres[0]).toMatchObject({ gp_version: 1, storage_path: plans[0].storage_path, gp_maj_disponible: true });
});

test("chef de chantier affecté (responsable Réserves, sans gerer_chantiers GP) : met à jour son chantier", async ({ page, request }) => {
  await login(page, "chef-equipe-a@invalid.local", PAS_LOGIN);
  await page.goto(FICHE);
  await bloc(page).getByRole("button", { name: "Mettre à jour depuis Gestion Pro" }).click();
  await expect(page.getByText(/Chantier mis à jour dans ELSATIA Réserves/)).toBeVisible();
  const jeton = await jetonSupabase(request, "chef-equipe-a@invalid.local");
  expect(await lire(request, jeton, "reserves_chantiers", `select=id&chantier_gp_id=eq.${CHANTIER_GP}`)).toHaveLength(1);
});

test("autre tenant : B ne voit ni la fiche de A ni son état, et ne peut pas la synchroniser", async ({ page, request }) => {
  await login(page, "admin-b@invalid.local", PAS_LOGIN);
  const reponse = await page.goto(FICHE);
  expect(reponse?.status()).toBe(404);
  const jetonB = await jetonSupabase(request, "admin-b@invalid.local");
  const etat = await rpc(request, jetonB, "reserves_etat_chantier_gp", { p_chantier_gp_id: CHANTIER_GP });
  expect(etat.status()).toBeLessThan(300);
  // Aucun état : `null` (PostgREST) ou corps vide (passerelle) — jamais un compteur de A.
  expect(["", "null"]).toContain((await etat.text()).trim());
  const sync = await rpc(request, jetonB, "reserves_synchroniser_chantier_gp", { p_chantier_gp_id: CHANTIER_GP });
  expect(sync.status()).toBeGreaterThanOrEqual(400);
  // B utilise la même action sur son propre chantier : rien de A ne l'atteint.
  await page.goto(`/chantiers/${CHANTIER_GP_B}`);
  await bloc(page).getByRole("button", { name: "Utiliser dans ELSATIA Réserves" }).click();
  await expect(page.getByText(/Chantier créé dans ELSATIA Réserves/)).toBeVisible();
  const contacts = await lire(request, jetonB, "reserves_contacts", "select=nom,email");
  expect(contacts.map((c) => c.nom)).toEqual(["Contact B"]);
  expect(await lire(request, jetonB, "reserves_intervenants", "select=nom")).toEqual([{ nom: "RECETTE_B_Secret Maçonnerie" }]);
});
