import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { allerA, cheminEtatSession, viderStockageLocal } from "./pilote-mobile-aides";

/**
 * Recette de la réserve R3 : une note de frais préparée hors ligne ne part JAMAIS sans son
 * justificatif en laissant croire que l'opération est complète.
 *
 * Les fichiers sont de vrais fichiers — un JPEG et un PDF construits octet par octet — et
 * passent par la vraie route de dépôt, la vraie politique de stockage et la vraie base.
 */

const ENTREPRISE_A = "a0000000-0000-0000-0000-000000000001";
const OUVRIER_TERRAIN_A = "40000000-0000-0000-0000-000000000003";

/** Un JPEG minimal mais réel : en-tête, segment, fin d'image. */
function jpeg(taille = 2048): Buffer {
  const octets = Buffer.alloc(taille, 0x20);
  octets.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 0);
  // Un octet variable, pour que chaque exécution produise une empreinte nouvelle : sans lui,
  // un fichier déjà déposé lors d'une passe précédente fausserait le constat d'idempotence.
  octets.writeUInt32BE(Date.now() % 0xffffffff, 20);
  octets.set([0xff, 0xd9], taille - 2);
  return octets;
}

function pdf(): Buffer {
  return Buffer.from(`%PDF-1.4\n% recette ${Date.now()}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
}

/**
 * Nombre de documents rattachés à une note, lu DANS LA BASE DE RECETTE.
 *
 * On lit la base directement parce que c'est la seule mesure qui ne dépend pas de ce que
 * l'application affirme. Un compteur d'écran pourrait très bien dire « 1 » avec deux lignes
 * en base : c'est précisément ce que ce test cherche à exclure.
 */
function documentsDeLaNote(noteId: string): number {
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) throw new Error("identifiant de note invalide");
  const sortie = execFileSync("docker", [
    "exec", "supabase_db_elsatia-train-v3-e2e", "psql", "-U", "postgres", "-d", "postgres", "-tAc",
    `select count(*) from public.documents_notes_frais where note_frais_id = '${noteId}'`,
  ], { encoding: "utf8" });
  return Number(sortie.trim());
}

function statutDeLaNote(noteId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) throw new Error("identifiant de note invalide");
  return execFileSync("docker", [
    "exec", "supabase_db_elsatia-train-v3-e2e", "psql", "-U", "postgres", "-d", "postgres", "-tAc",
    `select coalesce((select statut from public.notes_frais where id = '${noteId}'), 'absente')`,
  ], { encoding: "utf8" }).trim();
}

/** État local de l'appareil : mutations et fichiers en attente. */
async function etatLocal(page: Page) {
  return page.evaluate(async ({ entreprise, utilisateur }) => {
    const base = await new Promise<IDBDatabase | null>((r) => {
      const requete = indexedDB.open(`elsatia:gp:${entreprise}:${utilisateur}`);
      requete.onsuccess = () => r(requete.result);
      requete.onerror = () => r(null);
    });
    if (!base) return { mutations: [], justificatifs: [] };
    const lire = (magasin: string) => new Promise<unknown[]>((r) => {
      if (!base.objectStoreNames.contains(magasin)) return r([]);
      const requete = base.transaction(magasin, "readonly").objectStore(magasin).getAll();
      requete.onsuccess = () => r(requete.result as unknown[]);
      requete.onerror = () => r([]);
    });
    const mutations = (await lire("mutations")) as { id: string; etat: string; payload: Record<string, unknown>; motif?: string }[];
    const justificatifs = (await lire("justificatifs")) as { id: string; mutationId: string; depose: boolean; taille: number }[];
    base.close();
    return {
      mutations: mutations.map((m) => ({ id: m.id, etat: m.etat, avecJustificatif: m.payload?.avec_justificatif === true, motif: m.motif })),
      justificatifs: justificatifs.map((j) => ({ id: j.id, mutationId: j.mutationId, depose: j.depose, taille: j.taille })),
    };
  }, { entreprise: ENTREPRISE_A, utilisateur: OUVRIER_TERRAIN_A });
}

async function preparerNoteHorsLigne(page: Page, fichier: { name: string; mimeType: string; buffer: Buffer }) {
  const bloc = page.locator('[data-test="note-hors-ligne"]');
  await expect(bloc).toBeVisible();
  await bloc.getByLabel("Montant TTC").fill("37,90");
  await bloc.getByLabel("Fournisseur").fill("Station recette R3");
  await bloc.locator('input[type="file"]').setInputFiles(fichier);
  await bloc.getByLabel("Le document est visible en entier").check();
  await bloc.getByRole("button", { name: /conserver la note/i }).click();
  // On attend l'ISSUE affichée — confirmation ou refus — avant de rendre la main, exactement
  // comme le salarié attend le message avant de ranger son téléphone.
  //
  // Sans cette attente, quatre scénarios lisaient la file ou quittaient la page juste après
  // le clic, avant la fin de l'écriture IndexedDB : la file paraissait vide (« reading 'id'
  // of undefined »), et le test de redémarrage interrompait lui-même l'écriture en naviguant
  // aussitôt — ce qui passait pour une photo perdue par l'application.
  const etat = bloc.locator('[data-test="note-hors-ligne-etat"]');
  await expect(etat).toBeVisible({ timeout: 15_000 });
  return etat;
}

test.describe("@pilote @justificatifs note de frais avec justificatif, sans réseau", () => {
  test.use({ storageState: cheminEtatSession("ouvrierTerrainA") });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allerA(page, "/notes-frais");
    await viderStockageLocal(page);
    await allerA(page, "/notes-frais");
  });

  test("@pilote @justificatifs une photo capturée hors ligne part AVEC la note, et seulement avec elle", async ({ page }) => {
    await page.context().setOffline(true);
    const etat = await preparerNoteHorsLigne(page, { name: "ticket.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    await expect(etat).toContainText(/partiront ensemble/i);

    const local = await etatLocal(page);
    expect(local.mutations).toHaveLength(1);
    expect(local.mutations[0].avecJustificatif).toBe(true);
    // Le fichier est bien sur l'appareil, rattaché à SA note.
    expect(local.justificatifs).toHaveLength(1);
    expect(local.justificatifs[0].mutationId).toBe(local.mutations[0].id);
    const noteId = local.mutations[0].id;

    // Rien n'a encore touché le serveur.
    expect(statutDeLaNote(noteId)).toBe("absente");

    await page.context().setOffline(false);
    await allerA(page, "/notes-frais");

    // La note n'est déclarée synchronisée qu'une fois le fichier acquitté.
    await expect.poll(async () => (await etatLocal(page)).mutations.find((m) => m.id === noteId)?.etat, { timeout: 30_000 })
      .toBe("synchronise");

    expect(statutDeLaNote(noteId)).toBe("brouillon");
    expect(documentsDeLaNote(noteId), "la note est arrivée sans son justificatif").toBe(1);
    // Les fichiers ne quittent l'appareil qu'une fois déposés.
    expect((await etatLocal(page)).justificatifs).toHaveLength(0);
  });

  test("@pilote @justificatifs un PDF importé suit le même chemin", async ({ page }) => {
    await page.context().setOffline(true);
    const etat = await preparerNoteHorsLigne(page, { name: "facture.pdf", mimeType: "application/pdf", buffer: pdf() });
    await expect(etat).toContainText(/partiront ensemble/i);
    const noteId = (await etatLocal(page)).mutations[0].id;

    await page.context().setOffline(false);
    await allerA(page, "/notes-frais");
    await expect.poll(async () => (await etatLocal(page)).mutations.find((m) => m.id === noteId)?.etat, { timeout: 30_000 })
      .toBe("synchronise");
    expect(documentsDeLaNote(noteId)).toBe(1);
  });

  test("@pilote @justificatifs une coupure pendant le dépôt ne déclare rien, et la reprise termine sans doublon", async ({ page }) => {
    await page.context().setOffline(true);
    await preparerNoteHorsLigne(page, { name: "coupure.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    const noteId = (await etatLocal(page)).mutations[0].id;
    await page.context().setOffline(false);

    // Le réseau revient, mais la route de dépôt tombe : la note est créée, le fichier non.
    await page.route("**/api/notes-frais/upload", (route) => route.abort("connectionreset"));
    await allerA(page, "/notes-frais");

    await expect.poll(() => statutDeLaNote(noteId), { timeout: 30_000 }).toBe("brouillon");
    await page.waitForTimeout(1500);
    const pendant = await etatLocal(page);
    // Le cœur de R3 : note en base, fichier absent — et l'appareil ne dit PAS « synchronisée ».
    expect(pendant.mutations.find((m) => m.id === noteId)?.etat).not.toBe("synchronise");
    expect(pendant.justificatifs.filter((j) => j.mutationId === noteId), "le fichier a été perdu").toHaveLength(1);
    expect(documentsDeLaNote(noteId)).toBe(0);

    // Reprise : le dépôt passe, une seule fois.
    await page.unroute("**/api/notes-frais/upload");
    await allerA(page, "/notes-frais");
    await expect.poll(async () => (await etatLocal(page)).mutations.find((m) => m.id === noteId)?.etat, { timeout: 30_000 })
      .toBe("synchronise");
    expect(documentsDeLaNote(noteId), "la reprise a dupliqué la pièce").toBe(1);
  });

  test("@pilote @justificatifs un dépôt dont la réponse s'est perdue n'est pas refait", async ({ page }) => {
    await page.context().setOffline(true);
    await preparerNoteHorsLigne(page, { name: "reponse-perdue.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    const noteId = (await etatLocal(page)).mutations[0].id;
    await page.context().setOffline(false);

    // Le serveur REÇOIT et enregistre le fichier, mais la réponse n'atteint jamais l'appareil.
    await page.route("**/api/notes-frais/upload", async (route) => {
      await route.fetch();
      await route.abort("connectionreset");
    });
    await allerA(page, "/notes-frais");
    await expect.poll(() => documentsDeLaNote(noteId), { timeout: 30_000 }).toBe(1);

    // L'appareil croit encore devoir envoyer. À la reprise, il DEMANDE avant de refaire.
    await page.unroute("**/api/notes-frais/upload");
    await allerA(page, "/notes-frais");
    await expect.poll(async () => (await etatLocal(page)).mutations.find((m) => m.id === noteId)?.etat, { timeout: 30_000 })
      .toBe("synchronise");
    expect(documentsDeLaNote(noteId), "le dépôt a été refait alors qu'il avait eu lieu").toBe(1);
  });

  test("@pilote @justificatifs un fichier trop lourd est refusé AVANT d'être conservé", async ({ page }) => {
    await page.context().setOffline(true);
    const etat = await preparerNoteHorsLigne(page, {
      name: "photo-geante.jpg", mimeType: "image/jpeg", buffer: jpeg(15 * 1024 * 1024 + 1),
    });
    await expect(etat).toContainText(/15 Mo/);
    // Rien n'est conservé : on ne laisse pas partir une pièce que le serveur refusera.
    const local = await etatLocal(page);
    expect(local.mutations).toHaveLength(0);
    expect(local.justificatifs).toHaveLength(0);
    await page.context().setOffline(false);
  });

  test("@pilote @justificatifs un faux fichier image est refusé sur son contenu réel", async ({ page }) => {
    await page.context().setOffline(true);
    const etat = await preparerNoteHorsLigne(page, {
      name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("MZ ceci n'est pas une image"),
    });
    await expect(etat).toContainText(/n’est pas un PDF, JPG, PNG/);
    expect((await etatLocal(page)).justificatifs).toHaveLength(0);
    await page.context().setOffline(false);
  });

  test("@pilote @justificatifs la note et sa photo survivent au redémarrage", async ({ page }) => {
    await page.context().setOffline(true);
    await preparerNoteHorsLigne(page, { name: "redemarrage.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    await page.goto("about:blank");
    // Toujours hors réseau au retour : on ne vérifie que la survie, pas la transmission.
    await page.goto("about:blank");
    await page.context().setOffline(false);
    await allerA(page, "/notes-frais");
    const local = await etatLocal(page);
    expect(local.justificatifs.length + local.mutations.filter((m) => m.etat === "synchronise").length,
      "la photo a disparu au redémarrage").toBeGreaterThanOrEqual(1);
  });

  test("@pilote @justificatifs une session expirée suspend l'envoi sans rien perdre", async ({ page }) => {
    await page.context().setOffline(true);
    await preparerNoteHorsLigne(page, { name: "session.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    const noteId = (await etatLocal(page)).mutations[0].id;
    await page.context().setOffline(false);

    // Session perdue AVANT la synchronisation.
    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(3000);

    const local = await etatLocal(page);
    expect(local.justificatifs.filter((j) => j.mutationId === noteId), "le fichier a été perdu").toHaveLength(1);
    expect(local.mutations.find((m) => m.id === noteId)?.etat).not.toBe("synchronise");
    expect(statutDeLaNote(noteId)).toBe("absente");
  });
});

test.describe("@pilote @justificatifs refus sous une autre identité", () => {
  test.use({ storageState: cheminEtatSession("ouvrierB") });

  test("@pilote @justificatifs la vérification d'un justificatif de A est refusée à B", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    const reponse = await page.evaluate(async ({ entreprise, utilisateur }) => {
      const parametres = new URLSearchParams({
        note_id: "4f000000-0000-0000-0000-000000000001",
        empreinte: "a".repeat(64),
        entreprise_id: entreprise,
        utilisateur_id: utilisateur,
      });
      const r = await fetch(`/api/mobile/offline/justificatif-present?${parametres}`);
      return r.status;
    }, { entreprise: ENTREPRISE_A, utilisateur: OUVRIER_TERRAIN_A });
    expect(reponse, "B a pu interroger un justificatif préparé par A").toBe(403);
  });
});
