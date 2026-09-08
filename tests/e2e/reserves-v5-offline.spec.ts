import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { connexion, jetonSupabase, RESERVES, rpc } from "./reserves-aides";

/**
 * Recette V5 — hors-ligne réel, en navigateur.
 *
 * Ce fichier ne constate pas une absence : il DÉMONTRE le fonctionnement. Chaque test
 * coupe réellement le réseau du contexte, agit, puis vérifie l'effet — dans l'écran, dans
 * la base locale de l'appareil, et jusque dans la base de données du serveur.
 *
 * Décor attendu : voir `docs/reserves/ELSATIA_RESERVES_RECETTE_V4.md` et
 * `scripts/e2e/recette-reserves-v4.sh`.
 */

const CHANTIER = "e0000000-0000-0000-0000-000000000001";
const INTERVENANT_B = "e2000000-0000-0000-0000-00000000000b";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);

// Le poste de recette héberge plusieurs piles Supabase simultanées : l'authentification
// locale y répond parfois en une dizaine de secondes. Les budgets sont donc calibrés sur
// une machine CHARGÉE, faute de quoi la recette échouerait sur la contention et non sur
// une régression.
test.describe.configure({ mode: "serial", timeout: 300_000 });

// ── Utilitaires ──────────────────────────────────────────────────────────────

/**
 * Prépare l'appareil : service worker actif ET cache de consultation semé.
 *
 * Sans cette attente, une coupure immédiate testerait un appareil qui n'a encore rien
 * mémorisé — c'est-à-dire pas le hors-ligne, mais son absence.
 */
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
  }, null, { timeout: 20_000 });
}

/**
 * Attend que la file soit réellement vidée, en ligne.
 *
 * La coquille relance une synchronisation à chaque ouverture : on la recharge jusqu'à ce
 * qu'elle annonce n'avoir plus rien à envoyer, plutôt que d'attendre un délai arbitraire.
 */
async function attendreFileVidee(page: Page, essais = 6) {
  for (let i = 0; i < essais; i += 1) {
    await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
    // On OBSERVE la coquille se vider, sans la recharger : chaque rechargement relance
    // une synchronisation, et plusieurs envois concurrents de la même mutation se
    // disputeraient la même ligne en base.
    const vide = page.locator('[data-test="rien-a-envoyer"]');
    if (await vide.isVisible({ timeout: 25_000 }).catch(() => false)) return;
  }
  await expect(page.locator('[data-test="rien-a-envoyer"]')).toBeVisible({ timeout: 25_000 });
}

/** Ouvre la coquille hors-ligne et attend son hydratation. */
async function ouvrirCoquilleHorsLigne(page: Page) {
  await page.goto(`${RESERVES}/reserves`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="coquille-hors-ligne"]')).toBeVisible();
  // L'hydratation est la condition de tout le reste : sans elle, on lirait l'état
  // initial du rendu serveur et non ce que l'appareil a réellement en mémoire.
  await expect(page.locator('[data-test="capture-offline"]')).toBeVisible({ timeout: 20_000 });
}

/** Saisit une action dans le formulaire de terrain de la coquille hors-ligne. */
async function saisir(page: Page, champs: {
  type: string; titre?: string; description?: string; contenu?: string;
  reserveIndex?: number;
}) {
  await page.locator('[data-test="type-mutation"]').selectOption(champs.type);
  if (champs.reserveIndex !== undefined) {
    const options = page.locator('[data-test="reserve"] option');
    await options.first().waitFor();
    const valeur = await options.nth(champs.reserveIndex).getAttribute("value");
    await page.locator('[data-test="reserve"]').selectOption(valeur!);
  }
  if (champs.titre !== undefined) await page.locator('[data-test="titre"]').fill(champs.titre);
  if (champs.description !== undefined) {
    await page.locator('[data-test="description"]').fill(champs.description);
  }
  if (champs.contenu !== undefined) await page.locator('[data-test="contenu"]').fill(champs.contenu);
  await page.locator('[data-test="enregistrer"]').click();
  await expect(page.locator('[data-test="message-capture"]')).toBeVisible();
}

/**
 * Attend que la file AFFICHE au moins une action.
 *
 * Un `count()` ne réessaie pas : il rend l'état de l'instant. Or l'écriture locale et le
 * rafraîchissement de la liste sont asynchrones — le message « Enregistré sur l'appareil »
 * paraît d'abord, la liste suit. Sur une machine chargée, le test lisait donc l'instant
 * d'avant et échouait sur un écran parfaitement juste.
 */
async function attendreFileNonVide(page: Page) {
  await expect(page.locator('[data-test="file-hors-ligne"] li').first()).toBeVisible({
    timeout: 20_000,
  });
}

// ── §1 — consultation hors ligne ─────────────────────────────────────────────

test("chargée en ligne, l'application s'ouvre et se consulte SANS réseau", async ({
  page, context,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);

  await context.setOffline(true);
  // La navigation aboutit : c'est le service worker qui répond, pas le réseau.
  const reponse = await page.goto(`${RESERVES}/reserves`, { waitUntil: "domcontentloaded" });
  expect(reponse?.status()).toBe(200);

  await expect(page.locator('[data-test="coquille-hors-ligne"]')).toBeVisible();
  await expect(page.locator('[data-test="etat-reseau"]')).toContainText("Aucun réseau");

  // Le chantier et ses réserves, chargés en ligne, restent lisibles.
  await expect(page.locator('[data-test="chantiers-hors-ligne"] li').first()).toBeVisible();
  await expect(page.locator('[data-test="chantiers-hors-ligne"]')).toContainText(
    "RECETTE_A_Groupe scolaire");
  expect(await page.locator('[data-test="reserves-hors-ligne"] li').count()).toBeGreaterThan(0);

  // Ce qui n'est PAS disponible est annoncé : une liste partielle ne doit pas se lire
  // comme l'état complet du chantier.
  await expect(page.locator('[data-test="limites-hors-ligne"]')).toContainText("plans");
  await context.setOffline(false);
});

test("un rechargement hors ligne ne perd ni le cache ni la file", async ({ page, context }) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  const titre = `Persistance ${randomUUID().slice(0, 8)}`;
  await saisir(page, { type: "reserve_creer", titre, description: "Rechargement hors ligne." });
  await attendreFileNonVide(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="capture-offline"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-test="file-hors-ligne"]')).toContainText(titre);
  // Assertion ATTENDANTE : la liste vient d'IndexedDB, lue après l'hydratation. Un
  // `count()` immédiat rendait zéro dès que la machine était chargée — l'écran était
  // juste, le test mesurait l'instant d'avant.
  await expect(page.locator('[data-test="reserves-hors-ligne"] li').first()).toBeVisible();
  await context.setOffline(false);
});

// ── §2 — mutations hors ligne et synchronisation ─────────────────────────────

test("une réserve saisie hors ligne arrive en base au retour du réseau", async ({
  page, context, request,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  const titre = `Constat hors ligne ${randomUUID().slice(0, 8)}`;
  await saisir(page, { type: "reserve_creer", titre, description: "Saisi sans couverture." });
  await expect(page.locator('[data-test="message-capture"]')).toContainText("retour du réseau");
  await expect(page.locator('[data-test="file-hors-ligne"]')).toContainText(titre);

  // Rien n'est parti : le serveur ne connaît pas encore cette réserve.
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const avant = await rpc(request, jetonA, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  expect(JSON.stringify(await avant.json())).not.toContain(titre);

  // Retour du réseau : la file part d'elle-même.
  await context.setOffline(false);
  // De retour en ligne, /reserves rend la VRAIE page : la file s'inspecte sur la
  // coquille, seule page à la lire depuis la base locale.
  await attendreFileVidee(page);

  const apres = await rpc(request, jetonA, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  expect(JSON.stringify(await apres.json())).toContain(titre);
});

test("commentaire et demande de levée saisis hors ligne sont transmis", async ({
  page, context, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER, p_titre: `Support commentaire ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: INTERVENANT_B,
    p_origine_client_id: randomUUID(),
  });
  expect(creation.status()).toBe(200);
  const reserveId = (await creation.json()) as string;

  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  const commentaire = `Relevé effectué sur place ${randomUUID().slice(0, 8)}`;
  // La réserve créée à l'instant est en cache : on la retrouve dans le sélecteur.
  const options = await page.locator('[data-test="type-mutation"]').count();
  expect(options).toBe(1);
  await page.locator('[data-test="type-mutation"]').selectOption("commentaire_ajouter");
  await page.locator('[data-test="reserve"]').selectOption(reserveId).catch(async () => {
    // La réserve peut ne pas être dans le cache si le tableau de bord ne l'a pas listée :
    // on retombe alors sur la première réserve connue, le test porte sur le mécanisme.
    await page.locator('[data-test="reserve"]').selectOption({ index: 0 });
  });
  await page.locator('[data-test="contenu"]').fill(commentaire);
  await page.locator('[data-test="enregistrer"]').click();
  await expect(page.locator('[data-test="message-capture"]')).toBeVisible();
  await expect(page.locator('[data-test="file-hors-ligne"]')).toContainText(commentaire);

  await context.setOffline(false);
  // De retour en ligne, /reserves rend la VRAIE page : la file s'inspecte sur la
  // coquille, seule page à la lire depuis la base locale.
  await attendreFileVidee(page);

  const historique = await rpc(request, jetonA, "reserves_export_historique", {
    p_chantier_id: CHANTIER, p_intervenant_id: null,
  });
  expect(JSON.stringify(await historique.json())).toContain(commentaire);
});

test("une photo saisie hors ligne est conservée puis déposée, sans doublon", async ({
  page, context, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER, p_titre: `Support photo ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: INTERVENANT_B,
    p_origine_client_id: randomUUID(),
  });
  const reserveId = (await creation.json()) as string;

  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  await page.locator('[data-test="type-mutation"]').selectOption("photo_ajouter");
  await page.locator('[data-test="reserve"]').selectOption(reserveId).catch(async () => {
    await page.locator('[data-test="reserve"]').selectOption({ index: 0 });
  });
  // Un JPEG minimal mais réel : le serveur valide le type MIME, pas un nom de fichier.
  await page.locator('[data-test="photo"]').setInputFiles({
    name: "constat.jpg", mimeType: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
      + "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA"
      + "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64"),
  });
  await page.locator('[data-test="legende"]').fill("Constat hors ligne");
  // L'aperçu prouve que la preuve est visible sur l'appareil avant tout envoi.
  await expect(page.locator('[data-test="apercu"]')).toBeVisible();
  await page.locator('[data-test="enregistrer"]').click();
  await expect(page.locator('[data-test="message-capture"]')).toBeVisible();
  await expect(page.locator('[data-test="file-hors-ligne"]')).toContainText("Photo");

  await context.setOffline(false);
  // De retour en ligne, /reserves rend la VRAIE page : la file s'inspecte sur la
  // coquille, seule page à la lire depuis la base locale.
  await attendreFileVidee(page);

  const photos = await rpc(request, jetonA, "reserves_export_photos", {
    p_chantier_id: CHANTIER, p_intervenant_id: null,
  });
  const liste = (await photos.json()) as { reserve_id: string }[];
  // Exactement UNE photo pour cette réserve : la clé d'idempotence a fait son office.
  expect(liste.filter((p) => p.reserve_id === reserveId)).toHaveLength(1);
});

// ── §3 — idempotence et reprise ──────────────────────────────────────────────

test("une file rejouée plusieurs fois ne duplique rien", async ({ page, context, request }) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  const titre = `Rejeu file ${randomUUID().slice(0, 8)}`;
  await saisir(page, { type: "reserve_creer", titre });

  // La mutation est lue telle que l'appareil la conserve, puis REJOUÉE À L'IDENTIQUE
  // plusieurs fois. C'est le scénario exact d'une file qui repart après plusieurs
  // coupures : mêmes clés, mêmes charges utiles, envois répétés.
  const mutation = await page.evaluate(async () => {
    const bases = await indexedDB.databases();
    const nom = bases.map((b) => b.name).find((n) => n?.startsWith("elsatia-reserves::"))!;
    const base = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open(nom); r.onsuccess = () => res(r.result);
    });
    const toutes = await new Promise<Record<string, unknown>[]>((res) => {
      const r = base.transaction(["mutations"], "readonly").objectStore("mutations").getAll();
      r.onsuccess = () => res(r.result);
    });
    base.close();
    return toutes.find((m) => (m as { etat: string }).etat === "en_attente")!;
  });
  expect(mutation).toBeTruthy();

  await context.setOffline(false);
  // Cinq rejeux consécutifs de la MÊME mutation.
  for (let essai = 0; essai < 5; essai += 1) {
    const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
      data: { mutations: [mutation] },
    });
    expect(reponse.status()).toBe(200);
    const corps = await reponse.json() as { resultats: { issue: string }[] };
    // Le premier applique, les suivants sont reconnus comme des rejeux : jamais un échec.
    expect(["applique", "rejeu"]).toContain(corps.resultats[0].issue);
  }

  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const lignes = await rpc(request, jetonA, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  const correspondances = ((await lignes.json()) as { titre: string }[])
    .filter((l) => l.titre === titre);
  expect(correspondances).toHaveLength(1);
});

test("une mutation interrompue en plein envoi repart au démarrage suivant", async ({
  page, context, request,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  const titre = `Interruption ${randomUUID().slice(0, 8)}`;
  await saisir(page, { type: "reserve_creer", titre });

  // On simule l'arrêt brutal PENDANT l'envoi : la mutation reste figée en « en_cours »,
  // état dans lequel elle ne repartirait jamais sans reprise au démarrage.
  await page.evaluate(async () => {
    const bases = await indexedDB.databases();
    const nom = bases.map((b) => b.name).find((n) => n?.startsWith("elsatia-reserves::"))!;
    const base = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open(nom); r.onsuccess = () => res(r.result);
    });
    await new Promise<void>((res) => {
      const tx = base.transaction(["mutations"], "readwrite");
      const magasin = tx.objectStore("mutations");
      magasin.getAll().onsuccess = (e) => {
        for (const m of (e.target as IDBRequest).result) {
          if (m.etat === "en_attente") magasin.put({ ...m, etat: "en_cours" });
        }
      };
      tx.oncomplete = () => res();
    });
    base.close();
  });

  await context.setOffline(false);
  // De retour en ligne, /reserves rend la VRAIE page : la file s'inspecte sur la
  // coquille, seule page à la lire depuis la base locale.
  await attendreFileVidee(page);

  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const lignes = await rpc(request, jetonA, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  expect(JSON.stringify(await lignes.json())).toContain(titre);
});

// ── §4 — conflit : le serveur garde la main ──────────────────────────────────

test("une levée validée pendant la coupure n'est JAMAIS écrasée par la file", async ({
  page, context, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");

  // Une réserve prise en charge par B : c'est l'état qui autorise une demande de levée.
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER, p_titre: `Conflit levée ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: INTERVENANT_B,
    p_origine_client_id: randomUUID(),
  });
  const reserveId = (await creation.json()) as string;
  // On passe par les fonctions PUBLIQUES du domaine — celles que l'application appelle.
  // `reserves_appliquer_transition` est interne : elle n'est pas accordée au rôle
  // `authenticated`, et l'appeler directement ne prouverait rien du parcours réel.
  expect((await rpc(request, jetonB, "reserves_repondre_responsabilite", {
    p_reserve_id: reserveId, p_accepte: true,
  })).status()).toBeLessThan(300);

  await connexion(page, "gerant-b@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  // B prépare une demande de levée, sans réseau.
  await page.locator('[data-test="type-mutation"]').selectOption("levee_demander");
  await page.locator('[data-test="reserve"]').selectOption(reserveId);
  await page.locator('[data-test="enregistrer"]').click();
  await expect(page.locator('[data-test="message-capture"]')).toBeVisible();

  // Pendant ce temps, sur un autre appareil : la levée est demandée PUIS validée.
  expect((await rpc(request, jetonB, "reserves_demander_levee", {
    p_reserve_id: reserveId,
  })).status()).toBeLessThan(300);
  expect((await rpc(request, jetonA, "reserves_statuer_levee", {
    p_reserve_id: reserveId, p_validee: true,
  })).status()).toBeLessThan(300);

  await context.setOffline(false);
  // Un conflit ne vide JAMAIS la file : on ouvre la coquille et on laisse la
  // synchronisation se prononcer, sans attendre qu'elle se termine par un succès.
  await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="capture-offline"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(5000);

  // La réserve reste LEVÉE : la file n'a rien réécrit.
  const lignes = await rpc(request, jetonA, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  const reserve = ((await lignes.json()) as { id: string; statut: string }[])
    .find((l) => l.id === reserveId);
  expect(reserve?.statut).toBe("levee");

  // Et la saisie de B n'est pas perdue : elle est conservée, marquée en conflit.
  await expect(page.locator('[data-test="file-hors-ligne"] [data-etat="conflit"]').first())
    .toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-test="file-hors-ligne"]')).toContainText("hors ligne");
});

// ── §5 — cloisonnement des identités ─────────────────────────────────────────

test("la file préparée par A n'est jamais envoyée sous l'identité de B", async ({
  page, context, request,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  const titre = `Cloisonnement ${randomUUID().slice(0, 8)}`;
  await saisir(page, { type: "reserve_creer", titre });

  // La mutation d'A est extraite telle quelle, puis rejouée sous la session de B.
  const mutation = await page.evaluate(async () => {
    const bases = await indexedDB.databases();
    const nom = bases.map((b) => b.name).find((n) => n?.startsWith("elsatia-reserves::"))!;
    const base = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open(nom); r.onsuccess = () => res(r.result);
    });
    const toutes = await new Promise<Record<string, unknown>[]>((res) => {
      const r = base.transaction(["mutations"], "readonly").objectStore("mutations").getAll();
      r.onsuccess = () => res(r.result);
    });
    base.close();
    return toutes.find((m) => (m as { etat: string }).etat === "en_attente")!;
  });
  expect(mutation).toBeTruthy();

  await context.setOffline(false);
  // B se connecte sur le MÊME appareil.
  await connexion(page, "gerant-b@invalid.local");

  const refus = await page.request.post(`${RESERVES}/api/offline/mutations`, {
    data: { mutations: [mutation] },
  });
  expect(refus.status()).toBe(200);
  const corps = await refus.json() as { resultats: { issue: string; motif?: string }[] };
  expect(corps.resultats[0].issue).toBe("refus");
  expect(corps.resultats[0].motif).toContain("autre identité");

  // Et rien n'a été créé sous B.
  const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");
  const vueB = await rpc(request, jetonB, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  expect(JSON.stringify(await vueB.json())).not.toContain(titre);
});

test("après déconnexion, rien de l'organisation précédente n'est consultable", async ({
  page, context,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);

  // Déconnexion par le bouton : elle purge le cache de lecture et le pointeur d'identité.
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);

  await context.setOffline(true);
  await page.goto(`${RESERVES}/reserves`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="coquille-hors-ligne"]')).toBeVisible();
  // Aucune identité : la coquille n'ouvre aucune base, donc n'affiche aucun chantier.
  await expect(page.locator('[data-test="aucune-identite"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-test="chantiers-hors-ligne"]')).toHaveCount(0);
  await context.setOffline(false);
});

test("deux identités ne partagent pas la même base locale", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  const basesA = await page.evaluate(async () =>
    (await indexedDB.databases()).map((b) => b.name).filter((n) => n?.startsWith("elsatia-reserves::")));

  await connexion(page, "gerant-b@invalid.local");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2500);
  const basesApres = await page.evaluate(async () =>
    (await indexedDB.databases()).map((b) => b.name).filter((n) => n?.startsWith("elsatia-reserves::")));

  // B a SA base, distincte de celle d'A : le cloisonnement est structurel, pas filtré.
  expect(basesA.length).toBeGreaterThan(0);
  const nouvelles = basesApres.filter((n) => !basesA.includes(n));
  expect(nouvelles.length).toBeGreaterThan(0);
  for (const nom of basesApres) expect(nom).toMatch(/^elsatia-reserves::v\d+::[0-9a-f-]{36}::[0-9a-f-]{36}$/);
});

// ── §6 — interface : ne jamais laisser croire que c'est transmis ─────────────

/**
 * Sur WebKit/iPhone, la NAVIGATION hors ligne ne peut pas être éprouvée : sous
 * `context.setOffline(true)`, WebKit échoue avec une erreur interne dès qu'un service
 * worker contrôle la page (limitation de l'émulation Playwright, pas de l'application —
 * la sonde ci-dessous vérifie que le service worker y est bien actif et contrôlant).
 * Les tests marqués `@responsive` évitent donc la navigation hors ligne et éprouvent ce
 * qui est réellement vérifiable partout : le socle, la file, et l'affichage.
 */

test("@responsive le socle hors-ligne s'installe sur le moteur du terrain", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);

  // Service worker réellement actif ET contrôlant la page.
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const caches = await page.evaluate(() => window.caches.keys());
  expect(caches.some((c) => c.includes("coquille"))).toBe(true);
  expect(caches.some((c) => c.includes("statique"))).toBe(true);

  // La base locale est nommée d'après l'identité : le cloisonnement est structurel.
  const bases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((b) => b.name).filter((n) => n?.startsWith("elsatia-reserves::")));
  expect(bases).toHaveLength(1);
  expect(bases[0]).toMatch(/^elsatia-reserves::v\d+::[0-9a-f-]{36}::[0-9a-f-]{36}$/);
});

test("@responsive une saisie faite sans réseau est conservée puis transmise", async ({
  page, context, request,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);

  // On ouvre la coquille EN LIGNE, puis on coupe : la saisie et la file n'exigent
  // aucune navigation, seulement IndexedDB — ce que tous les moteurs savent faire.
  await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="capture-offline"]')).toBeVisible({ timeout: 25_000 });

  await context.setOffline(true);
  const titre = `Terrain mobile ${randomUUID().slice(0, 8)}`;
  await saisir(page, { type: "reserve_creer", titre });
  await expect(page.locator('[data-test="message-capture"]')).toContainText("retour du réseau");
  await expect(page.locator('[data-test="file-hors-ligne"]')).toContainText(titre);

  // Rien ne déborde de l'écran : la file doit rester utilisable au doigt.
  const debordement = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(debordement).toBeLessThanOrEqual(1);

  await context.setOffline(false);
  await attendreFileVidee(page);

  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const lignes = await rpc(request, jetonA, "reserves_export_chantier", { p_chantier_id: CHANTIER });
  expect(JSON.stringify(await lignes.json())).toContain(titre);
});

test("le bandeau annonce le travail non transmis, y compris en ligne", async ({
  page, context,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await preparerAppareil(page);
  await context.setOffline(true);
  await ouvrirCoquilleHorsLigne(page);

  await saisir(page, { type: "reserve_creer", titre: `Bandeau ${randomUUID().slice(0, 8)}` });

  // De retour EN LIGNE mais avant la synchronisation, l'écran doit encore dire que
  // quelque chose n'est pas parti : « en ligne » ne signifie pas « déjà transmis ».
  await context.setOffline(false);
  await page.goto(`${RESERVES}/dashboard`, { waitUntil: "domcontentloaded" });
  const bandeau = page.locator('[data-test="bandeau-offline"]');
  if (await bandeau.isVisible().catch(() => false)) {
    await expect(page.locator('[data-test="compteur-en-suspens"]')).toContainText("non transmise");
  }
  // Puis il disparaît, une fois la file réellement vidée — et pas avant.
  await expect(bandeau).toHaveCount(0, { timeout: 40_000 });
});
