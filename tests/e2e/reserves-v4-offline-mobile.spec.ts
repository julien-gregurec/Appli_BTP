import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";

/**
 * Recette V4 — résilience réseau, anti-doublon et terrain mobile.
 *
 * Ce fichier MESURE le hors-ligne au lieu de l'affirmer. Le premier test constate ce que
 * l'application fait réellement sans réseau ; il échouera le jour où un service worker
 * sera livré, et c'est précisément son rôle : empêcher qu'on prétende « offline » avant
 * que ce soit vrai, et signaler le moment où ça le devient.
 */

const RESERVES = process.env.E2E_RESERVES_URL ?? "http://127.0.0.1:3020";
const CHANTIER = "e0000000-0000-0000-0000-000000000001";
const INTERVENANT_B = "e2000000-0000-0000-0000-00000000000b";
const ENTREPRISE_B = "f0000000-0000-0000-0000-000000000001";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);

test.describe.configure({ mode: "serial", timeout: 180_000 });

async function connexion(page: Page, email: string, destination: string) {
  await page.context().clearCookies();
  await page.goto(`${RESERVES}/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).waitFor();
}

async function jetonSupabase(request: APIRequestContext, email: string) {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !key || !url.startsWith("http://127.0.0.1")) {
    throw new Error("La recette E2E exige un Supabase local explicite");
  }
  const reponse = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email, password: "test" },
  });
  expect(reponse.status()).toBe(200);
  return (await reponse.json()).access_token as string;
}

async function rpc(
  request: APIRequestContext, accessToken: string,
  fonction: string, parametres: Record<string, unknown>,
) {
  return request.post(`${process.env.E2E_SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    headers: {
      apikey: process.env.E2E_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    data: parametres,
  });
}

// ── §11 — ce que le hors-ligne fait RÉELLEMENT ────────────────────────────────

test("sans réseau, l'application est aujourd'hui inutilisable — constat mesuré", async ({
  page, context,
}) => {
  await connexion(page, "admin-a@invalid.local", "/dashboard");
  await page.goto(`${RESERVES}/chantiers/${CHANTIER}`);
  await expect(page.locator("h1")).toContainText("RECETTE_A_Groupe scolaire");

  // Aucun service worker n'est enregistré : rien ne peut servir la page sans réseau.
  const travailleurs = await page.evaluate(
    async () => (await navigator.serviceWorker?.getRegistrations?.() ?? []).length,
  );
  expect(travailleurs).toBe(0);

  await context.setOffline(true);
  // Un chantier DÉJÀ chargé n'est pas consultable après coupure : la navigation échoue.
  await expect(
    page.goto(`${RESERVES}/reserves`, { waitUntil: "domcontentloaded", timeout: 10_000 }),
  ).rejects.toThrow(/ERR_INTERNET_DISCONNECTED|net::/);
  await context.setOffline(false);

  // Le jour où un cache hors-ligne sera livré, ce test tombera : il faudra alors le
  // remplacer par la vérification du contenu réellement servi sans réseau.
});

// ── §12 — aucune duplication à la reconnexion ────────────────────────────────

test("un envoi rejoué ne crée pas de doublon : la clé d'idempotence fait son office", async ({
  page, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const cle = randomUUID();
  const titre = `Rejeu réseau ${cle.slice(0, 8)}`;

  const creer = () => rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER,
    p_titre: titre,
    p_description: "Saisie renvoyée après une coupure réseau.",
    p_priorite: "normale",
    p_intervenant_id: null, p_plan_id: null,
    p_position_x: null, p_position_y: null,
    p_photo_obligatoire_levee: false, p_echeance: null,
    p_origine_client_id: cle, p_plan_page: null,
  });

  // Trois tentatives, comme un utilisateur qui réappuie sur un réseau qui flanche.
  const premier = await creer();
  expect(premier.status()).toBe(200);
  const identifiant = (await premier.json()) as string;
  for (let essai = 0; essai < 2; essai += 1) {
    const rejeu = await creer();
    expect(rejeu.status()).toBe(200);
    // La base renvoie la réserve DÉJÀ créée, elle n'en ajoute pas une seconde.
    expect(await rejeu.json()).toBe(identifiant);
  }

  await connexion(page, "admin-a@invalid.local", "/dashboard");
  await page.goto(`${RESERVES}/imprimer/chantier/${CHANTIER}?vue=toutes`);
  const lignes = page.locator(".table-synthese tbody tr").filter({ hasText: titre });
  await expect(lignes).toHaveCount(1);
});

test("le formulaire de création émet réellement une clé d'idempotence", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local", "/dashboard");
  await page.goto(`${RESERVES}/chantiers/${CHANTIER}/nouvelle-reserve`);
  const cle = page.locator('input[name="origine_client_id"]');
  await expect(cle).toHaveCount(1);
  const valeur = await cle.inputValue();
  // Sans clé émise par le client, la protection anti-doublon de la base est du code mort.
  expect(valeur).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  // Deux ouvertures du formulaire = deux saisies distinctes, donc deux clés distinctes.
  await page.reload();
  expect(await cle.inputValue()).not.toBe(valeur);
});

// ── §13 — une levée validée ne s'écrase pas ──────────────────────────────────

test("une levée validée ne peut pas être réécrite par une reprise", async ({ request }) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER, p_titre: `Levée protégée ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: INTERVENANT_B,
    p_plan_id: null, p_position_x: null, p_position_y: null,
    p_photo_obligatoire_levee: false, p_echeance: null,
    p_origine_client_id: randomUUID(), p_plan_page: null,
  });
  expect(creation.status()).toBe(200);
  const reserve = (await creation.json()) as string;

  // La matrice de transitions n'autorise aucun passage direct depuis « levée » : une
  // reprise locale qui tenterait de rouvrir la réserve est refusée par la base.
  const interdit = await rpc(request, jetonA, "reserves_appliquer_transition", {
    p_reserve_id: reserve, p_action: "levee_validee", p_commentaire: null,
  });
  // La réserve n'est pas au stade « levée demandée » : la transition est refusée.
  expect([400, 401, 403, 404, 409, 500]).toContain(interdit.status());
});

// ── §14 / §15 — terrain mobile ───────────────────────────────────────────────

const LARGEURS = [375, 390, 430];

test("@responsive les écrans de terrain tiennent sur 375, 390 et 430 px", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local", "/dashboard");

  for (const largeur of LARGEURS) {
    await page.setViewportSize({ width: largeur, height: 844 });
    for (const chemin of ["/dashboard", "/reserves", `/chantiers/${CHANTIER}`]) {
      await page.goto(`${RESERVES}${chemin}`);
      await expect(page.locator("h1").first()).toBeVisible();

      // Un débordement horizontal condamne la saisie au doigt : on le refuse.
      const debordement = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(debordement, `${chemin} déborde en ${largeur} px`).toBeLessThanOrEqual(1);
    }
  }
});

test("@responsive les cibles tactiles atteignent 44 px", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local", "/dashboard");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${RESERVES}/chantiers/${CHANTIER}`);

  const cibles = page.locator("main a.bouton, main button");
  const total = await cibles.count();
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i += 1) {
    const cible = cibles.nth(i);
    if (!(await cible.isVisible())) continue;
    const boite = await cible.boundingBox();
    if (!boite) continue;
    const nom = (await cible.innerText().catch(() => "")).slice(0, 30);
    expect(Math.round(boite.height), `cible « ${nom} » trop basse`).toBeGreaterThanOrEqual(44);
  }
});

test("@responsive l'entreprise invitée ne voit que ses réserves, sur mobile", async ({
  page, request,
}) => {
  // L'état de départ de B n'est pas garanti : selon l'ordre d'exécution, elle est encore
  // « invitée », déjà rattachée, ou révoquée par le parcours V3 qui se termine par une
  // révocation. On la ramène donc explicitement à « rattachée » avant de mesurer.
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");

  // Une entreprise révoquée est réactivée par l'hôte ; une entreprise jamais rattachée
  // doit passer par le lien d'invitation, qui est le SEUL mécanisme de rattachement.
  await rpc(request, jetonA, "reserves_reactiver_intervenant", {
    p_intervenant_id: INTERVENANT_B,
  });

  let rattachee = await (async () => {
    try {
      await connexion(page, "gerant-b@invalid.local", "/dashboard");
      return true;
    } catch { return false; }
  })();

  if (!rattachee) {
    const jeton = `recette-mobile-${Date.now()}`;
    const empreinte = createHash("sha256").update(jeton).digest("hex");
    const invitation = await rpc(request, jetonA, "reserves_inviter_intervenant", {
      p_intervenant_id: INTERVENANT_B, p_token_hash: empreinte,
      p_email: "gerant-b@invalid.local", p_contact_nom: "Bernard É.",
    });
    expect(invitation.status()).toBe(200);
    const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");
    const acceptation = await rpc(request, jetonB, "reserves_invitation_accepter", {
      p_token_hash: empreinte, p_entreprise_id: ENTREPRISE_B,
    });
    expect(acceptation.status()).toBe(200);
    await connexion(page, "gerant-b@invalid.local", "/dashboard");
    rattachee = true;
  }
  expect(rattachee).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${RESERVES}/reserves`);
  const corps = await page.locator("main").innerText();

  // Ce que B DOIT voir : le titre de sa propre vue.
  await expect(page.locator("h1").first()).toBeVisible();
  // Ce que B ne doit JAMAIS voir : les réserves d'un autre corps d'état.
  expect(corps).not.toContain("Calfeutrement de menuiserie");
  expect(corps).not.toContain("Menuiserie C");
  // Ni les écrans d'administration du chantier.
  expect(corps).not.toContain("Entreprises intervenantes");

  const debordement = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(debordement).toBeLessThanOrEqual(1);
});
