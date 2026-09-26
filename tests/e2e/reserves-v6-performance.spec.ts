import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { connexion, RESERVES } from "./reserves-aides";

/**
 * Recette de TENUE À LA CHARGE — ELSATIA Réserves V6.
 *
 * Elle répond à une question que les recettes précédentes ne posaient pas : le produit
 * tient-il sur un chantier RÉEL ? Le décor V3/V4 porte une douzaine de réserves ; un
 * immeuble en réception en porte des centaines, et un lot livré d'un coup peut en porter
 * deux mille. À cette échelle, ce n'est plus la justesse qui casse, c'est l'usage : un
 * écran qui met trente secondes à s'ouvrir sur un téléphone de chantier n'est pas lent,
 * il est inutilisable.
 *
 * Les seuils sont volontairement LARGES. Ils ne mesurent pas la vitesse de ce poste — qui
 * héberge plusieurs piles de recette simultanées — mais l'absence d'effondrement : une
 * page qui ne revient pas, un rendu quadratique, une file qui ne se vide jamais.
 *
 * Décor : `scripts/e2e/prepare-reserves-v6-charge.sql`.
 */

const CHANTIER_CHARGE = "e0000000-0000-0000-0000-0000000000c1";
const ENTREPRISE_A = "a0000000-0000-0000-0000-000000000001";
const UTILISATEUR_A = "10000000-0000-0000-0000-000000000001";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);
test.describe.configure({ mode: "serial", timeout: 600_000 });

/** Seuil d'effondrement, pas seuil de confort. */
const BUDGET_ECRAN = 45_000;

async function chronometre(page: Page, url: string): Promise<number> {
  const debut = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: BUDGET_ECRAN });
  return Date.now() - debut;
}

test("la liste d'un chantier de 2 000 réserves s'ouvre et reste manipulable", async ({
  page,
}) => {
  await connexion(page, "admin-a@invalid.local");

  const duree = await chronometre(page, `${RESERVES}/chantiers/${CHANTIER_CHARGE}`);
  console.log(`fiche chantier (2 000 réserves) : ${duree} ms`);
  expect(duree).toBeLessThan(BUDGET_ECRAN);

  const listeDuree = await chronometre(
    page, `${RESERVES}/reserves?chantier=${CHANTIER_CHARGE}`);
  console.log(`liste des réserves : ${listeDuree} ms`);
  expect(listeDuree).toBeLessThan(BUDGET_ECRAN);

  // La page doit AFFICHER quelque chose, pas seulement répondre : une liste vide
  // servie vite serait le pire des résultats.
  await expect(page.locator("body")).toContainText("Charge n°");
});

test("le document imprimable de 2 000 réserves ne s'effondre pas", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");

  const synthese = Date.now();
  const reponse = await page.request.get(
    `${RESERVES}/imprimer/chantier/${CHANTIER_CHARGE}?vue=toutes`,
    { timeout: 120_000 },
  );
  const html = await reponse.text();
  console.log(`document synthétique : ${Date.now() - synthese} ms, ${Math.round(html.length / 1024)} Ko`);
  expect(reponse.status()).toBe(200);
  // Toutes les lignes sont présentes : pas de troncature silencieuse, qui produirait un
  // document FAUX — le pire défaut possible pour une pièce que l'on annexe à un
  // procès-verbal. Régression mesurée avant correctif : le document s'arrêtait à la
  // millième réserve, sans le dire, parce que `max_rows = 1000` coupe côté API de données.
  const numeros = new Set(
    [...html.matchAll(/Charge n°(\d+)/g)].map((m) => Number(m[1])),
  );
  console.log(`réserves distinctes rendues : ${numeros.size}`);
  expect(numeros.size).toBe(2000);
  expect(numeros.has(1)).toBe(true);
  expect(numeros.has(1001), "la 1001ᵉ réserve, celle que le plafond coupait").toBe(true);
  expect(numeros.has(2000)).toBe(true);
});

test("une file de 100 mutations part en un seul passage, sans doublon", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");

  const mutations = Array.from({ length: 100 }, () => ({
    id: randomUUID(), type: "reserve_creer", entrepriseId: ENTREPRISE_A,
    utilisateurId: UTILISATEUR_A, reserveId: null, chantierId: CHANTIER_CHARGE,
    version: 1, payload: { titre: `File 100 ${randomUUID().slice(0, 8)}` },
  }));

  // La route borne un lot à 50 : c'est délibéré, et la file cliente envoie donc par
  // paquets. On vérifie que la borne est bien tenue, puis que les deux paquets passent.
  const lotTropGrand = await page.request.post(`${RESERVES}/api/offline/mutations`, {
    data: { mutations }, timeout: 120_000,
  });
  expect(lotTropGrand.status()).toBe(400);

  const debut = Date.now();
  const identifiants = new Set<string>();
  for (let i = 0; i < mutations.length; i += 25) {
    const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
      data: { mutations: mutations.slice(i, i + 25) }, timeout: 120_000,
    });
    expect(reponse.status()).toBe(200);
    const corps = (await reponse.json()) as
      { resultats: { issue: string; identifiant: string }[] };
    for (const r of corps.resultats) {
      expect(["applique", "rejeu"]).toContain(r.issue);
      identifiants.add(r.identifiant);
    }
  }
  console.log(`100 mutations : ${Date.now() - debut} ms`);
  expect(identifiants.size, "cent mutations, cent réserves distinctes").toBe(100);

  // REJEU intégral de la file : c'est le scénario d'une coupure au mauvais moment.
  const rejoues = new Set<string>();
  for (let i = 0; i < mutations.length; i += 25) {
    const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
      data: { mutations: mutations.slice(i, i + 25) }, timeout: 120_000,
    });
    const corps = (await reponse.json()) as { resultats: { identifiant: string }[] };
    for (const r of corps.resultats) rejoues.add(r.identifiant);
  }
  expect([...rejoues].sort()).toEqual([...identifiants].sort());
});

test("la mémoire locale encaisse 500 réserves sans bloquer l'écran", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");
  await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="coquille-hors-ligne"]')).toBeVisible();

  // On écrit 500 lignes dans la base locale, puis on rouvre la coquille : c'est
  // exactement ce que fait le semeur de cache après la visite d'un gros chantier.
  const ecriture = await page.evaluate(async () => {
    const brut = localStorage.getItem("elsatia-reserves::identite");
    if (!brut) return { erreur: "aucune identité locale" };
    const [entrepriseId, utilisateurId] = brut.split(":");
    const nom = `elsatia-reserves::v1::${entrepriseId}::${utilisateurId}`;
    const base = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(nom, 1);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const debut = performance.now();
    await new Promise<void>((res, rej) => {
      const tx = base.transaction(["reserves"], "readwrite");
      const magasin = tx.objectStore("reserves");
      for (let i = 0; i < 500; i += 1) {
        magasin.put({
          id: `c0000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
          chantierId: "c0000000-0000-0000-0000-0000000000c1",
          numero: i + 1, titre: `Charge locale ${i}`, description: null,
          statut: "emise", priorite: "normale", intervenant: null,
          echeance: null, plan: null, planPage: null,
          majA: new Date().toISOString(),
        });
      }
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    const ecrit = performance.now() - debut;
    const lecture = performance.now();
    const nombre = await new Promise<number>((res) => {
      const r = base.transaction(["reserves"], "readonly").objectStore("reserves").count();
      r.onsuccess = () => res(r.result); r.onerror = () => res(-1);
    });
    const lu = performance.now() - lecture;
    base.close();
    const quota = await navigator.storage?.estimate?.().catch(() => null);
    return { ecrit: Math.round(ecrit), lu: Math.round(lu), nombre, quota };
  });
  console.log("écriture locale de 500 lignes :", JSON.stringify(ecriture));
  expect((ecriture as { nombre: number }).nombre).toBeGreaterThanOrEqual(500);
  // Une seconde pour cinq cents lignes : au-delà, l'écran se fige à la saisie.
  expect((ecriture as { ecrit: number }).ecrit).toBeLessThan(2000);

  const ouverture = await chronometre(page, `${RESERVES}/hors-ligne`);
  console.log(`ouverture de la coquille avec 500 réserves locales : ${ouverture} ms`);
  expect(ouverture).toBeLessThan(BUDGET_ECRAN);
  await expect(page.locator('[data-test="reserves-hors-ligne"]')).toBeVisible({
    timeout: 30_000,
  });
});

test("la reprise ne tourne pas en boucle : la sonde s'espace puis s'arrête", async ({
  page,
}) => {
  await connexion(page, "admin-a@invalid.local");
  await page.goto(`${RESERVES}/hors-ligne`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="coquille-hors-ligne"]')).toBeVisible();

  // Une mutation qui a épuisé son budget de tentatives : rien ne peut plus la faire
  // avancer. En V5, la coquille sondait quand même le réseau toutes les cinq secondes,
  // indéfiniment — sur un téléphone posé dans une poche, la radio ne se rendormait jamais.
  await page.evaluate(async () => {
    const brut = localStorage.getItem("elsatia-reserves::identite")!;
    const [entrepriseId, utilisateurId] = brut.split(":");
    const base = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(`elsatia-reserves::v1::${entrepriseId}::${utilisateurId}`, 1);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const instant = new Date().toISOString();
    await new Promise<void>((res, rej) => {
      const tx = base.transaction(["mutations"], "readwrite");
      tx.objectStore("mutations").put({
        id: "eeeeeeee-0000-0000-0000-00000000ffff", type: "commentaire_ajouter",
        etat: "echec", entrepriseId, utilisateurId,
        reserveId: "d0000000-0000-0000-0000-000000000001", chantierId: null,
        version: 1, payload: { contenu: "refus definitif" },
        creeeA: instant, modifieeA: instant, tentatives: 5,
        derniereErreur: "Action refusée.", identifiantServeur: null,
      });
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    base.close();
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="coquille-hors-ligne"]')).toBeVisible();

  const sondes = await page.evaluate(async () => {
    let compte = 0;
    const vrai = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? "";
      if (String(url).includes("/api/offline/ping")) compte += 1;
      return vrai.apply(this, args);
    };
    await new Promise((r) => setTimeout(r, 25_000));
    window.fetch = vrai;
    return compte;
  });
  console.log(`sondes réseau en 25 s sur une file définitivement bloquée : ${sondes}`);
  // La régression V5 en produisait environ cinq. Zéro est le comportement attendu ;
  // on tolère une sonde de bonne foi déclenchée par un autre chemin.
  expect(sondes).toBeLessThanOrEqual(1);
});
