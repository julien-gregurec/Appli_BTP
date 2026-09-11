import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { expect, request as clientApi, test, type APIRequestContext, type Page } from "@playwright/test";
import { cheminEtatSession } from "./pilote-mobile-aides";

/**
 * Non-régression du rôle EXPERT-COMPTABLE face aux changements mobiles et hors ligne.
 *
 * Ce lot ne construit pas le portail expert-comptable. Il vérifie que rien de ce qu'il a
 * ajouté — file hors ligne, documents emportés, routes de rejeu et de présence — ne contourne
 * les limites du rôle. Chaque refus est éprouvé À LA SOURCE, par l'API de la base sous le
 * jeton de l'expert-comptable, et pas seulement par l'écran : un écran qui cache un lien ne
 * prouve pas qu'on ne peut pas y aller.
 */

const ENTREPRISE_A = "a0000000-0000-0000-0000-000000000001";
const FACTURE_A = "aa000000-0000-0000-0000-000000000001";  // émise (« envoyee ») : définitive
const FACTURE_B = "ba000000-0000-0000-0000-000000000001";  // autre entreprise
const EXPERT = "40000000-0000-0000-0000-000000000001";

async function jeton(request: APIRequestContext): Promise<string> {
  const url = process.env.E2E_SUPABASE_URL!;
  const cle = process.env.E2E_SUPABASE_ANON_KEY!;
  const reponse = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: cle, "content-type": "application/json" },
    data: { email: "expert-comptable-a@invalid.local", password: "test" },
  });
  expect(reponse.ok(), "connexion API de l'expert-comptable").toBe(true);
  return (await reponse.json()).access_token;
}

function rest(request: APIRequestContext, token: string) {
  const url = process.env.E2E_SUPABASE_URL!;
  const cle = process.env.E2E_SUPABASE_ANON_KEY!;
  const entetes = { apikey: cle, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" };
  return {
    lire: (chemin: string) => request.get(`${url}/rest/v1/${chemin}`, { headers: entetes }),
    modifier: (chemin: string, donnees: unknown) => request.patch(`${url}/rest/v1/${chemin}`, { headers: entetes, data: donnees }),
    supprimer: (chemin: string) => request.delete(`${url}/rest/v1/${chemin}`, { headers: entetes }),
  };
}

/**
 * Atterrit-on RÉELLEMENT sur la route demandée ?
 *
 * L'URL ne suffit pas, et la première version de cette sonde s'y est trompée : une page
 * protégée par `notFound()` — c'est le cas de `/plateforme/stripe` pour qui n'est pas
 * administrateur plateforme — affiche la page 404 SUR PLACE, sans changer d'URL. Comparer le
 * seul chemin prenait ce refus pour une ouverture, et aurait signalé une faille qui n'existe
 * pas. On exige donc aussi que la page ne soit pas une 404.
 */
async function atteint(page: Page, route: string): Promise<boolean> {
  await page.goto(route);
  await page.waitForLoadState("load");
  if (new URL(page.url()).pathname !== route) return false;
  const texte = await page.locator("body").innerText();
  return !/\b404\b|could not be found|page introuvable/i.test(texte);
}

test.describe("@pilote @expert périmètre de l'expert-comptable", () => {
  test.use({ storageState: cheminEtatSession("expertComptableA") });

  test("@pilote @expert accède aux écrans comptables autorisés", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/factures", "/depenses", "/exports", "/paiements-bancaires"]) {
      expect(await atteint(page, route), `${route} refusé à l'expert-comptable`).toBe(true);
    }
  });

  /**
   * Décision du 2026-09-11 (condition C4) : l'expert-comptable consulte les notes de frais et
   * leurs justificatifs de l'entreprise qui l'a mandaté. Ce test était ROUGE à dessein tant que
   * le proxy n'admettait que `saisir_ses_notes_frais` ; il doit désormais être vert, et le
   * circuit complet est éprouvé plus bas.
   */
  test("@pilote @expert accède aux notes de frais et justificatifs de l'entreprise mandatée", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await atteint(page, "/notes-frais"), "/notes-frais refusé à l'expert-comptable").toBe(true);
    // Il voit la note déposée par l'ouvrier A — preuve qu'il lit bien celles de l'entreprise.
    await expect(page.locator("body")).toContainText("EXP-2026-000001");
  });

  test("@pilote @expert est écarté de l'administration, des opérations et des données non comptables", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/parametres", "/parametres/acces", "/plateforme/stripe",   // administration, secrets Stripe
      "/chantiers", "/planning",                                   // opérations, planning individuel
      "/messagerie",                                               // conversations internes
      "/stock", "/outillage", "/flotte",                           // matériels
    ]) {
      expect(await atteint(page, route), `${route} ouvert à l'expert-comptable`).toBe(false);
    }
  });

  test("@pilote @expert ne peut ni modifier ni supprimer une facture définitive — à l'écran comme en base", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await atteint(page, `/factures/${FACTURE_A}/modifier`), "l'écran de modification est ouvert").toBe(false);

    const api = rest(request, await jeton(request));
    // Une colonne RÉELLE : la première version envoyait `notes`, qui n'existe pas ; PostgREST
    // répondait 400, compté comme « 0 ligne » — le test passait pour une mauvaise raison. On
    // exige désormais une réponse 200 VIDE : le refus vient de la RLS, pas d'une requête fausse.
    const modification = await api.modifier(`factures?id=eq.${FACTURE_A}`, { notes_internes: "tentative expert-comptable" });
    expect(modification.status(), `modification de facture : ${await modification.text()}`).toBe(200);
    expect(await modification.json(), "une facture définitive a été modifiée").toEqual([]);

    const suppression = await api.supprimer(`factures?id=eq.${FACTURE_A}`);
    const supprimees = suppression.ok() ? await suppression.json() : [];
    expect(Array.isArray(supprimees) ? supprimees.length : 0, "une facture définitive a été supprimée").toBe(0);

    // Et elle est toujours là, intacte.
    const intacte = execFileSync("docker", ["exec", "supabase_db_elsatia-train-v3-e2e", "psql", "-U", "postgres", "-d", "postgres", "-tAc",
      `select statut from public.factures where id = '${FACTURE_A}'`], { encoding: "utf8" }).trim();
    expect(intacte).toBe("envoyee");
  });

  test("@pilote @expert ne voit rien d'une autre entreprise", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/factures/${FACTURE_B}`);
    await expect(page.locator("body")).not.toContainText("TEST_B_FAC_001");

    const api = rest(request, await jeton(request));
    const lue = await api.lire(`factures?id=eq.${FACTURE_B}&select=id`);
    expect(await lue.json(), "la facture de l'entreprise B est lisible").toEqual([]);
  });

  test("@pilote @expert n'obtient aucune donnée opérationnelle par l'API", async ({ request }) => {
    const api = rest(request, await jeton(request));
    for (const table of ["sessions_pointage", "pointages", "affectations", "messages"]) {
      const lue = await api.lire(`${table}?select=id&limit=1`);
      const lignes = lue.ok() ? await lue.json() : [];
      expect(Array.isArray(lignes) ? lignes.length : 0, `${table} lisible par l'expert-comptable`).toBe(0);
    }
  });

  test("@pilote @expert la file hors ligne ne lui donne aucun droit nouveau", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/factures");
    // Il tente de faire passer, par la route de rejeu, un pointage qu'il n'a pas le droit de faire.
    const resultat = await page.evaluate(async ({ entreprise, utilisateur }) => {
      const r = await fetch("/api/mobile/offline/mutations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutations: [{
          id: crypto.randomUUID(), type: "pointage_arrivee", entrepriseId: entreprise, utilisateurId: utilisateur,
          capteA: Date.now(), payload: { employe_id: "a2000000-0000-0000-0000-000000000007", chantier_id: "a4000000-0000-0000-0000-000000000002" },
        }] }),
      });
      return r.ok ? (await r.json()).resultats?.[0]?.issue : `http-${r.status}`;
    }, { entreprise: ENTREPRISE_A, utilisateur: EXPERT });
    // Rejeu sous RLS : sans `peut_pointer_pour_employe`, la base refuse. Aucun droit nouveau.
    expect(resultat, "la file a permis un pointage à l'expert-comptable").not.toBe("applique");
  });

  test("@pilote @expert ne laisse aucune donnée métier en cache local", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/factures", "/depenses", "/exports"]) await page.goto(route);
    const trace = await page.evaluate(async () => {
      const cles = await caches.keys().catch(() => [] as string[]);
      const urls: string[] = [];
      for (const cle of cles) {
        const cache = await caches.open(cle);
        for (const requete of await cache.keys()) urls.push(new URL(requete.url).pathname);
      }
      return urls.filter((u) => !u.startsWith("/_next/static/") && !u.startsWith("/icons/") && !/\.(png|svg|ico|webmanifest|css|js|woff2?)$/.test(u) && u !== "/offline" && u !== "/manifest.webmanifest");
    });
    expect(trace, `pages ou API en cache : ${trace.join(", ")}`).toEqual([]);
  });
});

test.describe("@pilote @expert révocation", () => {
  test.use({ storageState: cheminEtatSession("expertComptableA") });

  test("@pilote @expert la révocation coupe l'accès à la navigation suivante", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await atteint(page, "/factures")).toBe(true);
    const psql = (sql: string) => execFileSync("docker", ["exec", "supabase_db_elsatia-train-v3-e2e", "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql], { encoding: "utf8" });
    psql(`update public.utilisateurs_entreprises set statut = 'desactive' where utilisateur_id = '${EXPERT}' and entreprise_id = '${ENTREPRISE_A}'`);
    try {
      expect(await atteint(page, "/factures"), "l'expert-comptable révoqué voit encore les factures").toBe(false);
      await expect(page.locator("body")).not.toContainText("TEST_A_FAC_001");
    } finally {
      // Le décor est rendu tel quel, quelle que soit l'issue du test.
      psql(`update public.utilisateurs_entreprises set statut = 'actif' where utilisateur_id = '${EXPERT}' and entreprise_id = '${ENTREPRISE_A}'`);
    }
  });
});

// ── Circuit comptable des notes de frais (décision du 2026-09-11, condition C4) ─────────────
//
// Les notes sont créées par le VRAI chemin du produit : l'ouvrier A les saisit (RLS), dépose un
// justificatif par la route d'upload avec SA session, puis les soumet. L'expert-comptable agit
// ensuite sur ces données réelles — rien n'est fabriqué dans la base pour lui faciliter la tâche.

const OUVRIER_A_UTILISATEUR = "10000000-0000-0000-0000-000000000002";
const OUVRIER_A_EMPLOYE = "a2000000-0000-0000-0000-000000000002";

const psql = (sql: string) => execFileSync("docker", ["exec", "supabase_db_elsatia-train-v3-e2e", "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql], { encoding: "utf8" }).trim();

function jpeg(taille = 2048): Buffer {
  const octets = Buffer.alloc(taille, 0x20);
  octets.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 0);
  octets.writeUInt32BE((Date.now() + Math.floor(Math.random() * 1e6)) % 0xffffffff, 20);
  octets.set([0xff, 0xd9], taille - 2);
  return octets;
}

async function jetonDe(requete: APIRequestContext, email: string): Promise<string> {
  const reponse = await requete.post(`${process.env.E2E_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, "content-type": "application/json" },
    data: { email, password: "test" },
  });
  expect(reponse.ok(), `connexion API de ${email}`).toBe(true);
  return (await reponse.json()).access_token;
}

function rpc(requete: APIRequestContext, token: string, fonction: string, parametres: Record<string, unknown>) {
  return requete.post(`${process.env.E2E_SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: parametres,
  });
}

type NoteRecette = { id: string; reference: string; documentId: string; versionId: string; octets: Buffer; chemin: string };

/** L'ouvrier A saisit, justifie et soumet une note — par les chemins du produit. */
async function noteSoumiseParOuvrierA(requete: APIRequestContext, marque: string): Promise<NoteRecette> {
  const token = await jetonDe(requete, "ouvrier-a@invalid.local");
  const creation = await requete.post(`${process.env.E2E_SUPABASE_URL}/rest/v1/notes_frais`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" },
    data: {
      entreprise_id: ENTREPRISE_A, employe_id: OUVRIER_A_EMPLOYE, cree_par_utilisateur_id: OUVRIER_A_UTILISATEUR,
      date_frais: new Date().toISOString().slice(0, 10), montant_ttc: 58.4, categorie: "carburant",
      description: `RECETTE_EXPERT_${marque}`, fournisseur: `Station ${marque}`, statut: "brouillon", lieu_hors_chantier: "sans_chantier",
    },
  });
  expect(creation.ok(), `création de la note par l'ouvrier A : ${await creation.text()}`).toBe(true);
  const [note] = await creation.json();

  // Dépôt du justificatif par la route de l'application, avec la session de l'ouvrier A.
  const octets = jpeg();
  const ouvrier = await clientApi.newContext({ baseURL: process.env.E2E_PILOTE_BASE_URL, storageState: cheminEtatSession("ouvrierA"), ignoreHTTPSErrors: true });
  try {
    const depot = await ouvrier.post("/api/notes-frais/upload", { multipart: {
      note_id: note.id, type_document: "ticket_caisse", document_entier: "1",
      fichiers: { name: `ticket-${marque}.jpg`, mimeType: "image/jpeg", buffer: octets },
    } });
    expect(depot.ok(), `dépôt du justificatif par l'ouvrier A : ${depot.status()} ${await depot.text()}`).toBe(true);
  } finally { await ouvrier.dispose(); }

  const soumission = await rpc(requete, token, "transition_note_frais", { p_note_id: note.id, p_nouveau_statut: "soumis", p_message: null });
  expect(soumission.ok(), `soumission : ${await soumission.text()}`).toBe(true);

  const [documentId, versionId, chemin] = psql(
    `select d.id||'|'||v.id||'|'||v.storage_path from public.documents_notes_frais d join public.versions_documents_notes_frais v on v.document_id = d.id where d.note_frais_id = '${note.id}' order by v.created_at limit 1`,
  ).split("|");
  return { id: note.id, reference: psql(`select reference from public.notes_frais where id = '${note.id}'`), documentId, versionId, octets, chemin };
}

const statutDe = (id: string) => psql(`select statut from public.notes_frais where id = '${id}'`);

test.describe("@pilote @expert circuit comptable des notes de frais", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: cheminEtatSession("expertComptableA") });

  let aValider: NoteRecette, aCorriger: NoteRecette, aRefuser: NoteRecette;

  test.beforeAll(async ({ playwright }) => {
    const requete = await playwright.request.newContext();
    try {
      const marque = `${Date.now()}`;
      aValider = await noteSoumiseParOuvrierA(requete, `${marque}_V`);
      aCorriger = await noteSoumiseParOuvrierA(requete, `${marque}_C`);
      aRefuser = await noteSoumiseParOuvrierA(requete, `${marque}_R`);
    } finally { await requete.dispose(); }
  });

  test("@pilote @expert consulte la note et TÉLÉCHARGE son justificatif, octet pour octet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await atteint(page, "/notes-frais"), "/notes-frais refusé").toBe(true);
    await expect(page.locator("body")).toContainText(aValider.reference);
    expect(await atteint(page, `/notes-frais/${aValider.id}`), "la note est refusée").toBe(true);
    await expect(page.locator("body")).toContainText(aValider.reference);

    const telechargement = await page.request.get(`/api/notes-frais/documents/${aValider.versionId}`);
    expect(telechargement.status(), "téléchargement du justificatif").toBe(200);
    const recu = await telechargement.body();
    expect(createHash("sha256").update(recu).digest("hex")).toBe(createHash("sha256").update(aValider.octets).digest("hex"));
  });

  test("@pilote @expert ne voit AUCUN formulaire de modification de la dépense", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await atteint(page, `/notes-frais/${aValider.id}`);
    await expect(page.locator('input[name="montant_ttc"]'), "un champ de montant modifiable est proposé").toHaveCount(0);
    await expect(page.getByRole("button", { name: /transmettre au responsable/i })).toHaveCount(0);
  });

  test("@pilote @expert contrôle : prise en charge puis validation, par l'écran", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await atteint(page, `/notes-frais/${aValider.id}`);
    await page.getByRole("button", { name: /prendre en charge/i }).click();
    await expect.poll(() => statutDe(aValider.id), { timeout: 20_000 }).toBe("en_verification");
    await atteint(page, `/notes-frais/${aValider.id}`);
    await page.getByRole("button", { name: /^valider$/i }).click();
    await expect.poll(() => statutDe(aValider.id), { timeout: 20_000 }).toBe("valide");
    expect(psql(`select valide_par from public.notes_frais where id = '${aValider.id}'`)).toBe(EXPERT);
  });

  test("@pilote @expert contrôle : demande de correction motivée", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await atteint(page, `/notes-frais/${aCorriger.id}`);
    await page.getByPlaceholder("Correction demandée…").fill("Le ticket est coupé : merci de le reprendre en entier.");
    await page.getByRole("button", { name: /demander une correction/i }).click();
    await expect.poll(() => statutDe(aCorriger.id), { timeout: 20_000 }).toBe("correction_demandee");
  });

  test("@pilote @expert contrôle : un refus SANS motif est rejeté, un refus motivé passe", async ({ page, request }) => {
    const sansMotif = await rpc(request, await jetonDe(request, "expert-comptable-a@invalid.local"), "transition_note_frais", { p_note_id: aRefuser.id, p_nouveau_statut: "refuse", p_message: "" });
    expect(sansMotif.ok(), "un refus sans motif a été accepté").toBe(false);
    expect(statutDe(aRefuser.id)).toBe("soumis");

    await page.setViewportSize({ width: 390, height: 844 });
    await atteint(page, `/notes-frais/${aRefuser.id}`);
    await page.getByPlaceholder("Motif obligatoire…").fill("Dépense personnelle, hors mission.");
    await page.getByRole("button", { name: /^refuser$/i }).click();
    await expect.poll(() => statutDe(aRefuser.id), { timeout: 20_000 }).toBe("refuse");
  });

  test("@pilote @expert produit l'export comptable des notes validées", async ({ page }) => {
    const jour = new Date().toISOString().slice(0, 10);
    const reponse = await page.request.get(`/api/notes-frais/exports?debut=${jour}&fin=${jour}`);
    expect(reponse.status(), `export : ${reponse.status()}`).toBe(200);
    expect((await reponse.body()).length, "export vide").toBeGreaterThan(100);
    expect(Number(psql(`select count(*) from public.exports_notes_frais where cree_par = '${EXPERT}' and created_at > now() - interval '10 minutes'`))).toBeGreaterThan(0);
  });

  test("@pilote @expert comptabilise : référence comptable puis « exportée en comptabilité »", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await atteint(page, `/notes-frais/${aValider.id}`);
    const reference = `CPT-${Date.now()}`;
    await page.getByPlaceholder("Référence comptable").fill(reference);
    await page.getByRole("button", { name: /^enregistrer$/i }).click();
    await expect.poll(() => psql(`select coalesce(reference_comptable,'') from public.notes_frais where id = '${aValider.id}'`), { timeout: 20_000 }).toBe(reference);
    await atteint(page, `/notes-frais/${aValider.id}`);
    await page.getByRole("button", { name: /marquer exportée en comptabilité/i }).click();
    await expect.poll(() => statutDe(aValider.id), { timeout: 20_000 }).toBe("exporte_comptabilite");
  });

  test("@pilote @expert consulte le journal d'audit de la note", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await atteint(page, `/notes-frais/${aValider.id}`);
    await expect(page.getByRole("heading", { name: /journal d’audit/i })).toBeVisible();
  });

  test("@pilote @expert ne peut PAS modifier la dépense saisie par le salarié — en base", async ({ request }) => {
    const api = rest(request, await jetonDe(request, "expert-comptable-a@invalid.local"));
    const avant = psql(`select montant_ttc||'|'||fournisseur from public.notes_frais where id = '${aCorriger.id}'`);
    const tentative = await api.modifier(`notes_frais?id=eq.${aCorriger.id}`, { montant_ttc: 1, fournisseur: "tentative expert-comptable" });
    const modifiees = tentative.ok() ? await tentative.json() : [];
    expect(Array.isArray(modifiees) ? modifiees.length : 0, "la dépense du salarié a été modifiée").toBe(0);
    expect(psql(`select montant_ttc||'|'||fournisseur from public.notes_frais where id = '${aCorriger.id}'`)).toBe(avant);
  });

  test("@pilote @expert ne peut NI supprimer NI remplacer un justificatif — base, stockage et route", async ({ request, page }) => {
    const token = await jetonDe(request, "expert-comptable-a@invalid.local");
    const api = rest(request, token);
    for (const [table, filtre] of [["documents_notes_frais", `id=eq.${aCorriger.documentId}`], ["versions_documents_notes_frais", `id=eq.${aCorriger.versionId}`]] as const) {
      const suppression = await api.supprimer(`${table}?${filtre}`);
      const supprimees = suppression.ok() ? await suppression.json() : [];
      expect(Array.isArray(supprimees) ? supprimees.length : 0, `${table} : ligne supprimée`).toBe(0);
      const modification = await api.modifier(`${table}?${filtre}`, { nom_fichier_original: "remplace-par-expert.jpg" });
      const modifiees = modification.ok() ? await modification.json() : [];
      expect(Array.isArray(modifiees) ? modifiees.length : 0, `${table} : ligne modifiée`).toBe(0);
    }
    // Le fichier lui-même, directement dans le stockage.
    await request.delete(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/notes-frais`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: { prefixes: [aCorriger.chemin] },
    });
    expect(psql(`select count(*) from storage.objects where bucket_id = 'notes-frais' and name = '${aCorriger.chemin}'`), "le justificatif a disparu du stockage").toBe("1");

    // Remplacement par la route de l'application : la note est en « correction demandée », état
    // qui accepte un nouveau dépôt — du salarié, jamais de l'expert-comptable.
    const documentsAvant = psql(`select count(*) from public.documents_notes_frais where note_frais_id = '${aCorriger.id}'`);
    const depot = await page.request.post("/api/notes-frais/upload", { multipart: {
      note_id: aCorriger.id, type_document: "ticket_caisse", document_entier: "1",
      fichiers: { name: "remplacement.jpg", mimeType: "image/jpeg", buffer: jpeg() },
    } });
    expect(depot.ok(), "l'expert-comptable a pu déposer un justificatif").toBe(false);
    expect(psql(`select count(*) from public.documents_notes_frais where note_frais_id = '${aCorriger.id}'`)).toBe(documentsAvant);
    expect(psql(`select count(*) from public.documents_notes_frais where id = '${aCorriger.documentId}'`)).toBe("1");
  });
});
