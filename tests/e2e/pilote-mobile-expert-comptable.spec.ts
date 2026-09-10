import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
   * ÉCART CONNU ET RAPPORTÉ — ce test reste ROUGE à dessein.
   *
   * Le cahier des charges inclut les notes de frais dans le périmètre de l'expert-comptable, et
   * la page gère `comptabiliser_notes_frais`. Mais le garde de route du proxy
   * (`MODULE_PERMISSION_PAR_CHEMIN`, `src/lib/module-permissions.ts`) n'admet que
   * `saisir_ses_notes_frais`, sans alternative. L'expert-comptable est donc renvoyé vers
   * `/dashboard?acces=refuse`.
   *
   * Non corrigé dans ce lot : la correction élargit l'autorisation dans la table de routage, y
   * compris sur `/api/notes-frais` qui porte le dépôt de fichiers, pour plusieurs rôles au-delà
   * du pilote mobile. Elle est proposée au rapport. On ne marque PAS ce test `test.fail()` :
   * transformer un rouge connu en vert dans le résumé serait précisément le masquage à éviter.
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
    const modification = await api.modifier(`factures?id=eq.${FACTURE_A}`, { notes: "tentative expert-comptable" });
    const modifiees = modification.ok() ? await modification.json() : [];
    expect(Array.isArray(modifiees) ? modifiees.length : 0, "une facture définitive a été modifiée").toBe(0);

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
