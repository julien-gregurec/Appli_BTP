import {
  expect, test, type APIRequestContext, type BrowserContext, type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  connexion, contexteAutreAppareil, jetonSupabase, RESERVES, rpc,
} from "./reserves-aides";

/**
 * Recette ELSATIA Réserves — HOST SUSPENSION POLICY V1 (décision D-01).
 *
 * Quand l'organisation HÔTE d'un chantier est suspendue, l'entreprise intervenante
 * invitée passe en LECTURE SEULE : elle consulte ses réserves, leur historique, les
 * photos, le plan et le PDF ; elle ne peut plus accepter, refuser, commenter, déposer une
 * photo, demander une levée ni rejouer sa file hors-ligne. Au rétablissement de l'hôte,
 * l'écriture revient, sans reconnexion ni nouvelle invitation.
 *
 * Toute la recette se joue dans UNE SEULE session navigateur de l'intervenant, ouverte
 * AVANT la suspension : la décision doit s'appliquer à la requête suivante, sans
 * reconnexion. La suspension elle-même est posée « depuis un autre appareil », par la
 * clé serveur — exactement le chemin du webhook de facturation, qui n'est pas modifié.
 *
 * Décor : `scripts/e2e/prepare-reserves-suspension-hote.sql` (hôte H, intervenant S,
 * isolés du décor V3–V6 : suspendre A casserait les autres recettes en cas d'arrêt).
 */

const HOTE = "a9000000-0000-0000-0000-000000000001";
const ENTREPRISE_S = "c9000000-0000-0000-0000-000000000001";
const UTILISATEUR_S = "c9000000-0000-0000-0000-0000000000a1";
const CHANTIER = "e9000000-0000-0000-0000-000000000001";
const INTERVENANT_S = "e9200000-0000-0000-0000-00000000005a";
const EMAIL_HOTE = "hote-suspension@invalid.local";
const EMAIL_S = "couvreur-s@invalid.local";
const MESSAGE_REFUS = "Organisation hôte suspendue : cette réserve est en lecture seule.";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);
test.describe.configure({ mode: "serial", timeout: 300_000 });

// ── Utilitaires ──────────────────────────────────────────────────────────────

function enTetesService() {
  const cle = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error("E2E_SUPABASE_SERVICE_ROLE_KEY requise (clé serveur locale)");
  return { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };
}

/** Change l'état commercial de l'hôte comme le fait la facturation : clé serveur. */
async function etatHote(api: APIRequestContext, statut: "actif" | "suspendu") {
  const reponse = await api.patch(
    `${process.env.E2E_SUPABASE_URL}/rest/v1/entreprises?id=eq.${HOTE}`,
    { headers: { ...enTetesService(), Prefer: "return=representation" },
      data: { abonnement_statut: statut, suspension_prevue_at: null }, timeout: 60_000 },
  );
  expect(reponse.status(), await reponse.text()).toBe(200);
}

/**
 * Lecture sous l'identité de l'INTERVENANT (RLS). C'est exactement le périmètre où ses
 * écritures pourraient laisser une trace — ses réserves, leur historique, leurs échanges,
 * leurs photos, le registre d'idempotence — et le fait que ces lectures aboutissent
 * pendant la suspension prouve au passage que la consultation reste ouverte.
 * (La clé serveur n'a volontairement pas accès au journal en local.)
 */
async function lireIntervenant<T>(api: APIRequestContext, chemin: string): Promise<T[]> {
  const jeton = await jetonSupabase(api, EMAIL_S);
  const reponse = await api.get(`${process.env.E2E_SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, Authorization: `Bearer ${jeton}` },
    timeout: 60_000,
  });
  expect(reponse.status(), await reponse.text()).toBe(200);
  return (await reponse.json()) as T[];
}

/** Empreinte de tout ce qu'une écriture de l'intervenant laisserait chez l'hôte. */
async function empreinte(api: APIRequestContext) {
  const filtre = `reserve_id=in.(${r1},${r2})`;
  const [historique, messages, photos, mutations, reserves, intervenant] = await Promise.all([
    lireIntervenant<{ id: string }>(api, `reserves_historique?${filtre}&select=id`),
    lireIntervenant<{ id: string }>(api, `reserves_messages?entreprise_id=eq.${HOTE}&select=id`),
    lireIntervenant<{ id: string; disponible_at: string | null; supprimee_at: string | null }>(
      api, `reserves_photos?${filtre}&select=id,disponible_at,supprimee_at`),
    lireIntervenant<{ id: string }>(api, `reserves_mutations_appliquees?${filtre}&select=id`),
    lireIntervenant<{ id: string; statut: string; titre: string }>(
      api, `reserves?id=in.(${r1},${r2})&select=id,statut,titre&order=id`),
    lireIntervenant<Record<string, unknown>>(
      api, `reserves_intervenants?id=eq.${INTERVENANT_S}&select=id,statut,entreprise_intervenante_id,rejoint_at`),
  ]);
  expect(historique.length, "l'historique reste lisible").toBeGreaterThan(0);
  expect(reserves, "les réserves restent lisibles").toHaveLength(2);
  return JSON.stringify({
    historique: historique.length, messages: messages.length,
    photos: photos.map((p) => [p.id, Boolean(p.disponible_at), Boolean(p.supprimee_at)]).sort(),
    mutations: mutations.length, reserves, intervenant,
  });
}

async function preparerAppareil(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const bases = await indexedDB.databases();
    const nom = bases.map((b) => b.name).find((n) => n?.startsWith("elsatia-reserves::"));
    if (!nom) return false;
    const base = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(nom!);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const nombre = await new Promise<number>((res) => {
      const r = base.transaction(["reserves"], "readonly").objectStore("reserves").count();
      r.onsuccess = () => res(r.result); r.onerror = () => res(0);
    });
    base.close();
    return nombre > 0;
  }, null, { timeout: 30_000 });
}

/** Petite image JPEG valide (en-tête SOI + JFIF) — le contenu importe peu ici. */
const JPEG = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbfcffd9",
  "hex",
);

// ── État partagé de la recette (mode série) ──────────────────────────────────

let r1 = "";   // réserve « assignée » : l'intervenant pourrait l'accepter
let r2 = "";   // réserve « acceptée » : l'intervenant pourrait demander la levée
const titreR1 = `SUSP Relevé de faîtage ${randomUUID().slice(0, 8)}`;
const titreR2 = `SUSP Gouttière à reprendre ${randomUUID().slice(0, 8)}`;
const commentaireHorsLigne = `Saisi hors ligne avant suspension ${randomUUID().slice(0, 8)}`;
// Clés de mutation tirées AVANT la suspension, jamais parvenues au serveur.
const cleCommentaire = randomUUID();
const cleLevee = randomUUID();
const clePhoto = randomUUID();
let empreinteAvant = "";
let intervenantAvant = "";

// UNE session navigateur pour toute la recette : c'est la « session déjà ouverte » dont
// on prouve qu'elle bascule en lecture seule, puis revient, sans reconnexion.
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  const api = await contexteAutreAppareil();
  await etatHote(api, "actif");
  await api.dispose();
  context = await browser.newContext();
  page = await context.newPage();
});

test.afterAll(async () => {
  // Quoi qu'il arrive, l'hôte de recette n'est jamais laissé suspendu.
  const api = await contexteAutreAppareil();
  await etatHote(api, "actif").catch(() => undefined);
  await api.dispose();
  await context?.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Hôte actif : l'intervenant agit ; sa session reste ouverte pour la suite
// ─────────────────────────────────────────────────────────────────────────────

test("hôte actif : l'intervenant voit et agit normalement", async ({ request }) => {
  const jetonHote = await jetonSupabase(request, EMAIL_HOTE);
  const jetonS = await jetonSupabase(request, EMAIL_S);

  const creer = async (titre: string) => {
    const reponse = await rpc(request, jetonHote, "reserves_creer", {
      p_chantier_id: CHANTIER, p_titre: titre, p_description: "Constat de réception",
      p_priorite: "haute", p_intervenant_id: INTERVENANT_S, p_origine_client_id: randomUUID(),
    });
    expect(reponse.status(), await reponse.text()).toBe(200);
    return (await reponse.json()) as string;
  };
  r1 = await creer(titreR1);
  r2 = await creer(titreR2);
  expect((await rpc(request, jetonS, "reserves_repondre_responsabilite", {
    p_reserve_id: r2, p_accepte: true,
  })).status()).toBeLessThan(300);

  await connexion(page, EMAIL_S, `/reserves/${r1}`);
  await expect(page.getByRole("heading", { name: new RegExp(titreR1) })).toBeVisible();
  await expect(page.getByRole("button", { name: "J’accepte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer" })).toBeVisible();
  await expect(page.getByTestId("bandeau-lecture-seule")).toHaveCount(0);

  // Une photo de travaux déposée avant la suspension, par la route de la file.
  const photo = await page.request.post(`${RESERVES}/api/offline/photo`, {
    multipart: {
      mutationId: randomUUID(), reserveId: r2, usage: "travaux", legende: "Avant suspension",
      entrepriseId: ENTREPRISE_S, utilisateurId: UTILISATEUR_S,
      photo: { name: "travaux.jpg", mimeType: "image/jpeg", buffer: JPEG },
    },
  });
  expect(photo.status(), await photo.text()).toBe(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — File hors-ligne préparée AVANT la suspension, rejouée APRÈS
// ─────────────────────────────────────────────────────────────────────────────

test("une file préparée avant la suspension est refusée au rejeu, sans rien écrire", async () => {
  // Le cache de consultation est semé par le tableau de bord (SemeurCache).
  await page.goto(`${RESERVES}/dashboard`, { waitUntil: "domcontentloaded" });
  await preparerAppareil(page);
  await context.setOffline(true);
  await page.goto(`${RESERVES}/reserves`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="capture-offline"]')).toBeVisible({ timeout: 30_000 });

  await page.locator('[data-test="type-mutation"]').selectOption("commentaire_ajouter");
  await page.locator('[data-test="reserve"]').selectOption(r1);
  await page.locator('[data-test="contenu"]').fill(commentaireHorsLigne);
  await page.locator('[data-test="enregistrer"]').click();
  await expect(page.locator('[data-test="message-capture"]')).toBeVisible();

  await page.locator('[data-test="type-mutation"]').selectOption("levee_demander");
  await page.locator('[data-test="reserve"]').selectOption(r2);
  await page.locator('[data-test="enregistrer"]').click();
  await expect(page.locator('[data-test="file-hors-ligne"] li')).toHaveCount(2, { timeout: 20_000 });

  // Pendant la coupure, sur un autre appareil : la facturation suspend l'hôte.
  const autre = await contexteAutreAppareil();
  empreinteAvant = await empreinte(autre);
  intervenantAvant = JSON.stringify(await lireIntervenant(autre,
    `reserves_intervenants?id=eq.${INTERVENANT_S}&select=id,statut,entreprise_intervenante_id,rejoint_at`));
  await etatHote(autre, "suspendu");

  await context.setOffline(false);
  await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="capture-offline"]')).toBeVisible({ timeout: 30_000 });

  // La saisie n'est PAS perdue : elle est conservée, en échec, avec le motif en clair.
  const echecs = page.locator('[data-etat="echec"]');
  await expect(echecs.first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/lecture seule/).first()).toBeVisible();
  await expect(page.locator("body")).toContainText(commentaireHorsLigne);

  // Et le serveur n'a RIEN reçu.
  expect(await empreinte(autre)).toBe(empreinteAvant);
  await autre.dispose();
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Même session, aucune reconnexion : lecture conservée, écran en lecture seule
// ─────────────────────────────────────────────────────────────────────────────

test("session déjà ouverte : lecture conservée, commandes masquées", async () => {
  // La session du §1 est celle du contexte : aucune reconnexion ici.
  await page.goto(`${RESERVES}/reserves/${r1}`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: new RegExp(titreR1) })).toBeVisible();
  await expect(page.getByTestId("bandeau-lecture-seule")).toBeVisible();
  await expect(page.getByTestId("bandeau-lecture-seule")).toContainText("Lecture seule");
  // Historique lisible.
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
  await expect(page.locator(".chrono li").first()).toBeVisible();
  // Aucune commande d'écriture.
  for (const nom of ["J’accepte", "Je refuse", "Envoyer", "Joindre la photo", "Demander la levée"]) {
    await expect(page.getByRole("button", { name: nom }), nom).toHaveCount(0);
  }
  await expect(page.getByText("Retirer une photo")).toHaveCount(0);

  // Photo déposée avant la suspension : toujours affichée (URL signée émise).
  await page.goto(`${RESERVES}/reserves/${r2}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bandeau-lecture-seule")).toBeVisible();
  // R2 est acceptée : sans la suspension, « Demander la levée » serait proposé.
  await expect(page.getByRole("button", { name: "Demander la levée" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Envoyer" })).toHaveCount(0);
  const image = page.locator("img").filter({ hasNot: page.locator("[aria-hidden]") }).first();
  await expect(image).toBeVisible();

  // Liste et chantier.
  await page.goto(`${RESERVES}/reserves`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(titreR1);
  await expect(page.locator("body")).toContainText(titreR2);
  await page.goto(`${RESERVES}/chantiers/${CHANTIER}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bandeau-lecture-seule")).toBeVisible();
});

test("session déjà ouverte : PDF et document imprimable restent accessibles", async () => {
  const imprimable = await page.request.get(`${RESERVES}/imprimer/chantier/${CHANTIER}`);
  expect(imprimable.status()).toBe(200);
  const html = await imprimable.text();
  expect(html).toContain(titreR1);
  expect(html).toContain(titreR2);

  const pdf = await page.request.get(`${RESERVES}/api/documents/chantier/${CHANTIER}/pdf`, {
    timeout: 120_000,
  });
  expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const corps = await pdf.body();
  expect(corps.subarray(0, 5).toString()).toBe("%PDF-");
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Contrôle en base / API, pas seulement à l'écran
// ─────────────────────────────────────────────────────────────────────────────

test("toute écriture est refusée par l'API, sans faux historique", async ({ request }) => {
  const jetonS = await jetonSupabase(request, EMAIL_S);
  const tentatives: [string, Record<string, unknown>][] = [
    ["reserves_repondre_responsabilite", { p_reserve_id: r1, p_accepte: true }],
    ["reserves_repondre_responsabilite", { p_reserve_id: r1, p_accepte: false, p_motif: "Pas notre lot" }],
    ["reserves_commenter", { p_reserve_id: r1, p_contenu: "Pendant la suspension" }],
    ["reserves_ajouter_photo", { p_reserve_id: r2, p_usage: "travaux" }],
    ["reserves_demander_levee", { p_reserve_id: r2, p_commentaire: "Terminé" }],
    ["reserves_transition_differee", { p_reserve_id: r2, p_statut_apres: "levee_demandee" }],
  ];
  for (const [fonction, parametres] of tentatives) {
    const reponse = await rpc(request, jetonS, fonction, parametres);
    const corps = await reponse.json();
    expect(reponse.status(), `${fonction} : ${JSON.stringify(corps)}`).toBe(403);
    expect(corps.message, fonction).toBe(MESSAGE_REFUS);
    expect(corps.hint, fonction).toBe("RESERVES_HOTE_SUSPENDU");
  }

  // Modification directe par PostgREST : aucune ligne touchée.
  const patch = await request.patch(`${process.env.E2E_SUPABASE_URL}/rest/v1/reserves?id=eq.${r1}`, {
    headers: {
      apikey: process.env.E2E_SUPABASE_ANON_KEY!, Authorization: `Bearer ${jetonS}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    data: { titre: "modifié pendant la suspension" },
  });
  expect(await patch.json()).toEqual([]);

  // Rejeu de la file par la route de l'application, avec les clés d'AVANT la suspension.
  const lot = await page.request.post(`${RESERVES}/api/offline/mutations`, {
    data: { mutations: [
      { id: cleCommentaire, type: "commentaire_ajouter", entrepriseId: ENTREPRISE_S,
        utilisateurId: UTILISATEUR_S, reserveId: r1, chantierId: CHANTIER,
        payload: { contenu: "Rejeu après suspension" }, version: 1 },
      { id: cleLevee, type: "levee_demander", entrepriseId: ENTREPRISE_S,
        utilisateurId: UTILISATEUR_S, reserveId: r2, chantierId: CHANTIER,
        payload: {}, version: 1 },
    ] },
  });
  expect(lot.status()).toBe(200);
  const { resultats } = await lot.json() as { resultats: { id: string; issue: string; motif?: string }[] };
  expect(resultats.map((r) => r.issue)).toEqual(["refus", "refus"]);
  for (const r of resultats) expect(r.motif).toMatch(/lecture seule/);

  const photo = await page.request.post(`${RESERVES}/api/offline/photo`, {
    multipart: {
      mutationId: clePhoto, reserveId: r2, usage: "levee", legende: "Rejeu",
      entrepriseId: ENTREPRISE_S, utilisateurId: UTILISATEUR_S,
      photo: { name: "levee.jpg", mimeType: "image/jpeg", buffer: JPEG },
    },
  });
  expect(photo.status()).toBe(409);
  expect((await photo.json()).issue).toBe("refus");

  // Audit : strictement rien n'a été écrit, ni historique, ni message, ni photo, ni registre.
  const api = await contexteAutreAppareil();
  expect(await empreinte(api)).toBe(empreinteAvant);
  await api.dispose();
});

test("les utilisateurs de l'hôte suspendu suivent les règles commerciales existantes", async ({
  request,
}) => {
  const jetonHote = await jetonSupabase(request, EMAIL_HOTE);
  const lecture = await request.get(
    `${process.env.E2E_SUPABASE_URL}/rest/v1/reserves?chantier_id=eq.${CHANTIER}&select=id`,
    { headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, Authorization: `Bearer ${jetonHote}` } },
  );
  expect(await lecture.json()).toEqual([]);
  const ecriture = await rpc(request, jetonHote, "reserves_commenter", {
    p_reserve_id: r1, p_contenu: "hôte suspendu",
  });
  expect(ecriture.status()).toBeGreaterThanOrEqual(400);
  expect((await ecriture.json()).hint).not.toBe("RESERVES_HOTE_SUSPENDU");
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — Rétablissement : l'écriture revient, sans reconnexion ni nouvelle invitation
// ─────────────────────────────────────────────────────────────────────────────

test("rétablissement : l'écriture revient dans la même session", async () => {
  const api = await contexteAutreAppareil();
  await etatHote(api, "actif");

  await page.goto(`${RESERVES}/reserves/${r1}`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId("bandeau-lecture-seule")).toHaveCount(0);
  await page.getByRole("button", { name: "J’accepte" }).click();
  await expect(page.locator(".etiquette").filter({ hasText: /Accept/ }).first()).toBeVisible({
    timeout: 30_000,
  });

  // La file conservée repart : les échecs sont remis en file, puis transmis.
  await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
  const reessayer = page.locator('[data-test="reessayer"]');
  if (await reessayer.count()) {
    for (const bouton of await reessayer.all()) await bouton.click().catch(() => undefined);
  }
  await expect(page.locator('[data-test="rien-a-envoyer"], [data-test="file-vide"]').first())
    .toBeVisible({ timeout: 120_000 });

  const reserves = await lireIntervenant<{ id: string; statut: string }>(
    api, `reserves?id=in.(${r1},${r2})&select=id,statut`);
  expect(Object.fromEntries(reserves.map((r) => [r.id, r.statut]))).toEqual({
    [r1]: "acceptee", [r2]: "levee_demandee",
  });
  const messages = await lireIntervenant<{ contenu: string }>(
    api, `reserves_messages?entreprise_id=eq.${HOTE}&select=contenu`);
  expect(messages.filter((m) => m.contenu === commentaireHorsLigne)).toHaveLength(1);

  // Aucune invitation recréée, intervenant intact.
  expect(JSON.stringify(await lireIntervenant(api,
    `reserves_intervenants?id=eq.${INTERVENANT_S}&select=id,statut,entreprise_intervenante_id,rejoint_at`)))
    .toBe(intervenantAvant);
  await api.dispose();
});
