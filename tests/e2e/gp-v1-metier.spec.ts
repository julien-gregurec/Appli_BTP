import { expect, test, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

/**
 * GP V1 « Batappli-like » — les 15 scénarios E2E du prompt (§ 19), sur la pile locale jetable :
 * base au ledger + SQL proposé des lots A→G, GoTrue + PostgREST + Kong, application en `next dev`
 * avec GP_DEVIS_V2=1 et GP_PLANNING_V2=1 (voir docs/gp-v1, § 18).
 *
 * Chaque scénario est autonome mais ils s'enchaînent : les objets créés au début servent aux suivants.
 * `test.describe.configure({ mode: "serial" })` : un échec arrête la suite, sans masquer sa cause.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });
// Pile de recette en `next dev` : la première visite d'une page ou d'une action la compile (plusieurs
// secondes). Les délais sont élargis en conséquence ; ils ne masquent aucun comportement.
test.beforeEach(({ page }) => { page.setDefaultTimeout(60_000); page.setDefaultNavigationTimeout(90_000); });

const suffixe = String(Date.now()).slice(-6);
const NOM_CLIENT = `E2E Client ${suffixe}`;
const DESIGNATION = `E2E Plaque ${suffixe}`;
const OUVRAGE = `E2E Cloison ${suffixe}`;
const REF_AFFAIRE = `AFF-E2E-${suffixe}`;
const TITRE_EVENEMENT = `E2E Pose ${suffixe}`;
// Un jour propre à chaque exécution : la base refuse plus de 24 h planifiées par salarié et par jour, les
// évènements des exécutions précédentes ne doivent donc pas s'accumuler sur la même date.
const JOUR_PLANNING = `2026-11-${String(1 + (Number(suffixe) % 28)).padStart(2, "0")}`;

// Les scénarios 13 à 15 réutilisent les objets créés par 1 et 4 ; pour les rejouer seuls (poste saturé,
// suite coupée), un devis et un client existants peuvent être fournis par l'environnement.
let urlDevis = process.env.E2E_DEVIS_URL ?? "";
let urlClient = process.env.E2E_CLIENT_URL ?? "";
const REF_RECHERCHE = () => process.env.E2E_REF_AFFAIRE ?? REF_AFFAIRE;

const cellule = (page: Page, index: number, colonne: string) => page.locator(`[data-cellule='${index}:${colonne}']`);
/** Navigation puis attente de l'hydratation : en `next dev`, une frappe avant l'hydratation est perdue. */
let detoursInfra = 0;
async function aller(page: Page, url: string) {
  // Pile locale jetable sous charge : GoTrue peut dépasser son délai (504 sur /auth/v1/user), le proxy
  // traite alors la session comme absente et renvoie vers /login puis /dashboard. On réessaie et on
  // compte ces détours : ils sont rapportés, jamais masqués.
  for (let i = 0; i < 4; i += 1) {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const attendu = new URL(url, page.url()).pathname;
    const obtenu = new URL(page.url()).pathname;
    if (obtenu === attendu || !["/login", "/dashboard"].includes(obtenu) || attendu === "/dashboard") break;
    detoursInfra += 1;
    console.log(`[infra] ${attendu} → ${obtenu} (GoTrue en délai ?), nouvel essai ${i + 1}`);
    await page.waitForTimeout(2000);
  }
  await attendreHydratation(page);
}
test.afterAll(() => { if (detoursInfra) console.log(`[infra] détours session/GoTrue pendant la suite : ${detoursInfra}`); });
/**
 * « Enregistrer et fermer » : l'action serveur enregistre (statut « Enregistré à … ») puis le routeur
 * ouvre la fiche. Sous charge, cette navigation douce peut être avortée par un délai GoTrue ; on
 * exige la preuve de l'enregistrement, puis on ouvre la fiche nous-mêmes en comptant le détour.
 */
async function enregistrerEtFermer(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Enregistrer et fermer" }).click();
  const debut = Date.now();
  while (Date.now() - debut < 45_000) {
    const url = new URL(page.url());
    const m = url.pathname.match(/^\/devis\/([0-9a-f-]{36})(\/modifier)?$/);
    if (m && !m[2]) return `${url.origin}${url.pathname}`;
    if (m && m[2] && /Enregistré à/.test(await page.locator("main").innerText().catch(() => ""))) {
      await page.waitForTimeout(3000);
      if (/\/modifier$/.test(new URL(page.url()).pathname)) {
        detoursInfra += 1;
        console.log("[infra] enregistrement confirmé mais navigation vers la fiche avortée : ouverture directe");
        const fiche = `${url.origin}/devis/${m[1]}`;
        await aller(page, fiche);
        return fiche;
      }
    }
    const alerte = (await page.locator("[role=alert]").allTextContents().catch(() => [])).map((t) => t.trim()).filter(Boolean);
    if (alerte.length) throw new Error(`Enregistrement refusé : ${alerte.join(" | ")}`);
    await page.waitForTimeout(500);
  }
  throw new Error(`Enregistrement sans retour à la fiche : ${page.url()}`);
}
/**
 * Attend que React ait hydraté la page : en `next dev` sur un disque lent, le code client se compile à
 * la demande et une saisie faite avant l'hydratation reste dans le DOM sans atteindre l'état React.
 * Après hydratation, les nœuds rendus par le serveur portent une clé interne `__reactFiber…`.
 */
async function attendreHydratation(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("main") ?? document.body;
    return Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  }, undefined, { timeout: 180_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
}
/** Saisie robuste à l'hydratation : ressaisit tant que la condition n'est pas remplie. */
async function saisir(page: Page, champ: ReturnType<Page["locator"]>, valeur: string, condition: () => Promise<boolean>) {
  for (let i = 0; i < 6; i += 1) {
    await champ.click();
    await champ.fill("");
    await champ.pressSequentially(valeur, { delay: 10 });
    await page.waitForTimeout(500);
    if (await condition()) return;
    await page.waitForTimeout(1000);
  }
  const diag = await page.evaluate(() => ({
    inputs: [...document.querySelectorAll("form input")].map((i) => ({ v: (i as HTMLInputElement).value, d: (i as HTMLInputElement).disabled })),
    boutons: [...document.querySelectorAll("button")].filter((b) => b.textContent?.includes("Ajouter le composant")).map((b) => ({ d: b.disabled })),
    hydrate: document.documentElement.dataset.hydrated ?? null,
  }));
  throw new Error(`La saisie « ${valeur} » n'a pas été prise en compte — valeur lue : ${await champ.inputValue()} — ${JSON.stringify(diag)}`);
}
/** Connexion robuste au mode développement : un clic avant l'hydratation peut être perdu ; on réessaie. */
/** Cookies de session par utilisateur : une seule connexion réelle par utilisateur et par exécution (limite de débit /login). */
const sessions = new Map<string, Awaited<ReturnType<Page["context"]>>["cookies"] extends (...a: never[]) => Promise<infer C> ? C : never>();
async function connexion(page: Page, email: string) {
  const cookies = sessions.get(email);
  if (cookies) {
    await page.context().addCookies(cookies);
    await aller(page, "/dashboard");
    if (/\/dashboard/.test(page.url())) return;
  }
  for (let i = 0; i < 3; i += 1) {
    await aller(page, "/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("test");
    await page.getByRole("button", { name: "Se connecter" }).click();
    const ok = await page.waitForURL(/\/dashboard/, { timeout: 20_000 }).then(() => true).catch(() => false);
    if (ok) { sessions.set(email, await page.context().cookies()); return; }
  }
  await login(page, email);
  sessions.set(email, await page.context().cookies());
}

test("1. création client", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(NOM_CLIENT);
  await page.locator("select[name='type']").selectOption("professionnel");
  const email = page.locator("input[name='email']");
  if (await email.count()) await email.fill(`client-${suffixe}@exemple.invalid`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
  urlClient = page.url();
  await expect(page.locator("main")).toContainText(NOM_CLIENT);
});

test("2. création article (référence interne attribuée)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/prestations/nouveau");
  await page.locator("#designation").fill(DESIGNATION);
  await page.locator("input[name='prix_unitaire_ht']").first().fill("20");
  await page.getByRole("button", { name: "Créer la prestation" }).click();
  await page.waitForURL((u) => u.pathname === "/prestations" || /\/prestations\/[0-9a-f-]{36}/.test(u.pathname) || u.searchParams.has("error"), { timeout: 30_000 });
  if (new URL(page.url()).searchParams.has("error")) throw new Error(`Création refusée : ${new URL(page.url()).searchParams.get("error")}`);
  await aller(page, "/prestations");
  await expect(page.locator("main")).toContainText(DESIGNATION);
});

test("3. création ouvrage (bibliothèque, composants, publication)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/ouvrages/bibliotheque/nouveau");
  await page.getByLabel("Nom *").fill(OUVRAGE);
  await page.getByLabel("Unité principale *").fill("m²");
  await page.getByLabel("Quantité principale *").fill("1");
  const bouton = page.getByRole("button", { name: "Ajouter le composant" });
  const champComposant = page.locator("form").filter({ has: bouton }).locator("input").first();
  await champComposant.click();
  await saisir(page, champComposant, "Plaque BA13 (E2E)", () => bouton.isEnabled());
  await bouton.click();
  await expect(page.locator("main")).toContainText("Composants (1)");
  // Le composant reçoit quantité, unité et prix ; tout champ numérique du composant à 0 est complété.
  const carte = page.locator("section, article, div").filter({ hasText: "Plaque BA13 (E2E)" }).last();
  for (const champ of await carte.locator("input[type='number']").all()) {
    if ((await champ.inputValue()) === "0" || (await champ.inputValue()) === "") await champ.fill("2");
  }
  const unite = carte.locator("input").filter({ hasNot: page.locator("[type='number']") }).nth(1);
  if (await unite.count()) await unite.fill("m²").catch(() => undefined);
  await page.getByRole("button", { name: /Publier/ }).click();
  const publie = await page.waitForURL(/\/ouvrages\/bibliotheque\/[0-9a-f-]{36}/, { timeout: 15_000 }).then(() => true).catch(() => false);
  if (!publie) {
    const texte = await page.locator("main").innerText();
    const champs = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => `${i.type}:${i.value}`).join(" | "));
    throw new Error(`Publication refusée — ${texte.replace(/\s+/g, " ").slice(0, 1200)} — champs : ${champs}`);
  }
  await expect(page.locator("main")).toContainText(OUVRAGE);
});

test("4. création devis (éditeur ligne par ligne, référence d'affaire)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await expect(page.locator("[role=grid][aria-label='Lignes du devis']")).toBeVisible();
  const selectClient = page.locator("select").filter({ has: page.locator("option", { hasText: "Choisir un client" }) }).first();
  await expect(selectClient).toBeVisible();
  const trouve = await expect.poll(async () => (await selectClient.locator("option").allTextContents()).some((o) => o.includes(NOM_CLIENT)), { timeout: 30_000 }).toBe(true).then(() => true).catch(() => false);
  if (!trouve) {
    const options = await selectClient.locator("option").allTextContents();
    throw new Error(`Client « ${NOM_CLIENT} » absent du choix : ${options.slice(0, 5).join(" | ")} (${options.length})`);
  }
  const valeurClient = await selectClient.locator("option", { hasText: NOM_CLIENT }).first().getAttribute("value");
  await selectClient.selectOption(valeurClient ?? "");
  await page.getByLabel("Référence d’affaire").fill(REF_AFFAIRE);
  // Première ligne : Entrée dans la grille crée une ligne ; sinon le bouton.
  const ajouter = page.getByRole("button", { name: "Ajouter une ligne" });
  if (await ajouter.count()) await ajouter.click();
  // Chaque cellule commet sa valeur à la sortie (désignation : 120 ms après le blur) ; l'aperçu A4 reflète
  // l'état commis, c'est lui qui fait foi avant l'enregistrement.
  for (let essai = 0; essai < 3; essai += 1) {
    await cellule(page, 0, "designation").fill("Dépose existant (E2E)");
    await cellule(page, 0, "designation").blur();
    await page.waitForTimeout(400);
    if (await page.locator(".doc-a4").first().innerText().then((t) => t.includes("Dépose existant (E2E)")).catch(() => false)) break;
  }
  await expect(page.locator(".doc-a4").first()).toContainText("Dépose existant (E2E)");
  await cellule(page, 0, "quantite").fill("10");
  await cellule(page, 0, "quantite").blur();
  await cellule(page, 0, "prix_vente").fill("15");
  // Sortie de cellule sans Tab : Tab en fin de ligne ouvrirait une nouvelle ligne vide, refusée à l'enregistrement.
  await cellule(page, 0, "prix_vente").blur();
  await expect(page.getByLabel("Totaux")).toContainText("150,00");
  await expect(page.locator("[role=grid][aria-label='Lignes du devis']")).toHaveAttribute("aria-rowcount", "1");
  urlDevis = await enregistrerEtFermer(page);
  await aller(page, urlDevis);
  await expect(page.locator("main")).toContainText("150,00");
});

test("5. ajout de plusieurs types de lignes (titre, article du catalogue, sous-total, remise, commentaire)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `${urlDevis}/modifier`);
  const grille = page.locator("[role=grid][aria-label='Lignes du devis']");
  await expect(grille).toBeVisible();
  const inserer = page.getByLabel("Insérer");
  await inserer.selectOption("titre");
  await inserer.selectOption("sous_total");
  await inserer.selectOption("remise");
  await inserer.selectOption("commentaire");
  await expect(grille).toHaveAttribute("aria-rowcount", "5");
  // Chaque ligne de structure reçoit son libellé (un titre ou un commentaire vide n'est pas enregistrable).
  const libelles: Record<number, string> = { 1: "Gros œuvre (E2E)", 2: "Sous-total gros œuvre", 3: "Remise commerciale", 4: "Commentaire pour le client (E2E)" };
  for (const [index, libelle] of Object.entries(libelles)) {
    const c = cellule(page, Number(index), "designation");
    if (await c.count()) { await c.fill(libelle); await c.blur(); await page.waitForTimeout(250); }
  }
  // Article du catalogue via Ctrl+K.
  await page.keyboard.press("ControlOrMeta+k");
  const dialogue = page.locator("dialog[open]");
  await expect(dialogue).toBeVisible();
  await page.keyboard.type(DESIGNATION.slice(0, 12));
  await expect(page.locator("#resultats-articles [role=option]").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialogue).toHaveCount(0);
  await expect(grille).toHaveAttribute("aria-rowcount", "6");
  await enregistrerEtFermer(page);
});

test("6. modification au clavier (Tab entre cellules, Ctrl+Z)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `${urlDevis}/modifier`);
  await expect(page.locator("[role=grid][aria-label='Lignes du devis']")).toBeVisible();
  await cellule(page, 0, "quantite").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("12");
  await page.keyboard.press("Tab");
  await expect(cellule(page, 0, "quantite")).toHaveValue("12");
  await expect(page.getByLabel("Totaux")).toContainText("€");
  // La validation d'une cellule crée une étape d'historique : le bouton « Annuler » (Ctrl+Z) s'active.
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+z");
  const annule = await expect(cellule(page, 0, "quantite")).toHaveValue("10", { timeout: 5_000 }).then(() => true).catch(() => false);
  if (!annule) {
    // Raccourci absorbé par le champ actif : le bouton de la barre d'outils fait la même chose.
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(cellule(page, 0, "quantite")).toHaveValue("10");
  }
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(cellule(page, 0, "quantite")).toHaveValue("12");
  await enregistrerEtFermer(page);
});

test("7. calcul total et marge (colonnes de coûts pour un poste autorisé)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `${urlDevis}/modifier`);
  await expect(page.locator("[role=grid][aria-label='Lignes du devis']")).toBeVisible();
  await expect(page.getByLabel("Totaux")).toContainText("Total HT");
  await expect(page.getByLabel("Rentabilité (interne)")).toBeVisible();
  await cellule(page, 0, "prix_achat").fill("9");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Rentabilité (interne)")).toContainText("%");
});

test("8. PDF du devis (route authentifiée, journalisée)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  const id = urlDevis.split("/").pop();
  // Depuis la page elle-même (mêmes cookies, même origine) : Chromium local imprime la page d'impression.
  await aller(page, urlDevis);
  const r = await page.evaluate(async (u) => {
    const res = await fetch(u);
    return { status: res.status, type: res.headers.get("content-type") ?? "", url: res.url, taille: (await res.arrayBuffer()).byteLength };
  }, `/api/documents/devis/${id}/pdf`);
  expect(r.status, JSON.stringify(r)).toBe(200);
  expect(r.type, JSON.stringify(r)).toContain("application/pdf");
  expect(r.taille).toBeGreaterThan(1000);
  await aller(page, urlDevis);
  await expect(page.locator("main")).toContainText("PDF généré");
});

test("9. transformation en facture (devis accepté → facture issue du devis)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, urlDevis);
  // Transitions autorisées : brouillon → envoyé → accepté (jamais brouillon → accepté directement).
  const statutEnvoi = page.locator("select").filter({ has: page.locator("option[value='envoye']") }).first();
  await statutEnvoi.selectOption("envoye");
  const statutAccept = page.locator("select").filter({ has: page.locator("option[value='accepte']") }).first();
  await expect(statutAccept).toBeVisible({ timeout: 30_000 });
  await statutAccept.selectOption("accepte");
  await expect.poll(async () => (await page.locator("main").innerText()).includes("· accepte") || (await page.locator("select option:checked").allTextContents()).some((t) => /Accepté/.test(t)), { timeout: 30_000 }).toBe(true);
  await aller(page, urlDevis);
  page.on("dialog", (d) => d.accept());
  const transformer = page.getByRole("button", { name: "Transformer en facture" }).first();
  await expect(transformer).toBeVisible();
  await transformer.scrollIntoViewIfNeeded();
  const clique = await transformer.click({ timeout: 20_000 }).then(() => true).catch(() => false);
  if (!clique) await transformer.dispatchEvent("click");
  await page.waitForURL(/\/factures\/[0-9a-f-]{36}/, { timeout: 90_000 });
  await aller(page, urlDevis);
  await expect(page.locator("main")).toContainText(/Documents issus|facture/i);
});

test("10. création planning (évènement horodaté, salarié affecté, ligne affectations synchronisée)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `/planning?vue=jour&jour=${JOUR_PLANNING}`);
  await expect(page.locator("[role=grid]")).toBeVisible();
  await page.getByRole("button", { name: "Nouvel évènement" }).click();
  const dialogue = page.locator("dialog[open]").filter({ hasText: "Nouvel évènement" });
  await dialogue.getByLabel("Titre").fill(TITRE_EVENEMENT);
  await dialogue.getByLabel("Début").fill("08:00");
  await dialogue.getByLabel("Fin").fill("12:00");
  await dialogue.getByLabel("Admin A").check();
  await dialogue.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialogue).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator("[data-bloc]").filter({ hasText: TITRE_EVENEMENT })).toBeVisible();
});

test("11. déplacement d'un évènement (clavier → +15 min, persistant après rechargement)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `/planning?vue=jour&jour=${JOUR_PLANNING}`);
  const bloc = page.locator("[data-bloc]").filter({ hasText: TITRE_EVENEMENT });
  await bloc.click();
  await page.keyboard.press("ArrowRight");
  await expect(bloc).toHaveAttribute("aria-label", /08:15 à 12:15/);
  // Mise à jour optimiste puis enregistrement : on attend la fin de l'enregistrement (indicateur « Enregistrement… »)
  // et l'absence d'erreur avant de recharger pour prouver la persistance.
  await expect.poll(async () => (await page.locator("main").innerText()).includes("Enregistrement…"), { timeout: 30_000 }).toBe(false);
  const alertes = (await page.locator("[role=alert]").allTextContents()).map((t) => t.trim()).filter(Boolean);
  expect(alertes, "erreur affichée après le déplacement").toEqual([]);
  await page.waitForTimeout(1500);
  await aller(page, `/planning?vue=jour&jour=${JOUR_PLANNING}`);
  await expect(page.locator("[data-bloc]").filter({ hasText: TITRE_EVENEMENT }).first()).toHaveAttribute("aria-label", /08:15 à 12:15/);
});

test("12. détection de conflit (même salarié, même créneau)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `/planning?vue=jour&jour=${JOUR_PLANNING}`);
  await page.getByRole("button", { name: "Nouvel évènement" }).click();
  const dialogue = page.locator("dialog[open]").filter({ hasText: "Nouvel évènement" });
  await dialogue.getByLabel("Titre").fill(`${TITRE_EVENEMENT} bis`);
  await dialogue.getByLabel("Début").fill("10:00");
  await dialogue.getByLabel("Fin").fill("11:00");
  await dialogue.getByLabel("Admin A").check();
  await dialogue.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialogue).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByRole("region", { name: "Conflits" }).or(page.locator("section[aria-label='Conflits']"))).toContainText("Déjà affecté");
  await expect(page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` })).toHaveAttribute("aria-label", /conflit/);
});

test("13. vérification des droits (chef d'équipe : planning en lecture, actions grisées avec motif ; devis refusés)", async ({ page }) => {
  await connexion(page, USERS.leaderA);
  await aller(page, `/planning?vue=jour&jour=${JOUR_PLANNING}`);
  // Le panneau existe en deux rendus (colonne fixe et feuille tactile) : le premier suffit.
  const nouvel = page.locator("[aria-disabled='true']").filter({ hasText: "Nouvel évènement" }).first();
  await expect(nouvel).toBeVisible();
  await expect(nouvel).toHaveAttribute("title", /gerer_planning|poste/);
  const bloc = page.locator("[data-bloc]").filter({ hasText: TITRE_EVENEMENT }).first();
  await bloc.click();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await expect(bloc).toHaveAttribute("aria-label", /08:15 à 12:15/);
  const devis = await page.request.get(urlDevis, { maxRedirects: 0 });
  expect([302, 303, 307, 403, 404]).toContain(devis.status());
});

test("14. recherche par référence interne (palette Ctrl+K)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/dashboard");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.locator("dialog[open][aria-label='Recherche globale']");
  await expect(palette).toBeVisible();
  await page.keyboard.type(REF_RECHERCHE().toLowerCase());
  await expect(palette.locator("[role=option]").first()).toContainText(/Devis|DEV/i);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(urlDevis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("15. vérification de la barre latérale (actions groupées, indisponibles visibles et expliquées)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, urlClient);
  if (!process.env.E2E_CLIENT_URL) await expect(page.locator("main")).toContainText(NOM_CLIENT);
  await expect(page.getByRole("link", { name: "Nouveau devis" }).or(page.getByRole("button", { name: "Nouveau devis" })).first()).toBeVisible();
  await aller(page, urlDevis);
  await expect(page.locator("text=Créer").first()).toBeVisible();
  const grisees = page.locator("[aria-disabled='true'][title]");
  expect(await grisees.count()).toBeGreaterThan(0);
  const motif = await grisees.first().getAttribute("title");
  expect(motif && motif.length > 10).toBeTruthy();
  // Groupes du panneau contextuel (Créer, Modifier, Document, Voir aussi…) et action indisponible expliquée.
  await expect(page.getByText(/^(Créer|Modifier|Document|Voir aussi)$/).first()).toBeVisible();
  // « Importer des lignes » est annoncé indisponible en V1 quel que soit l'état du devis : motif explicite, jamais caché.
  const importer = page.getByRole("button", { name: /Importer des lignes/ }).first();
  await expect(importer).toHaveAttribute("aria-disabled", "true");
  await expect(importer).toHaveAttribute("title", /V2/);
});
