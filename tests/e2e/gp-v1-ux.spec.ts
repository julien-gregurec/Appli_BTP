import { expect, test, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

/**
 * GP V1 — refonte UX selon la validation de Julien (2026-09-13) : devis à la façon Batappli, planning sans
 * panneau latéral, numérotation configurable, texte riche, navigation retour, mobile. Pile locale jetable
 * (voir gp-v1-metier.spec.ts pour les conventions : sérialité, hydratation, détours GoTrue).
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultTimeout(60_000); page.setDefaultNavigationTimeout(90_000); });

const suffixe = String(Date.now()).slice(-6);
const CLIENT_INLINE = `UX Client ${suffixe}`;
const CHANTIER_INLINE = `UX Chantier ${suffixe}`;
const TITRE_EVENEMENT = `UX Pose ${suffixe}`;
const JOUR_PLANNING = `2026-12-${String(1 + (Number(suffixe) % 27)).padStart(2, "0")}`;
const PHRASE = "Cloison vitrée bord à bord avec porte toute hauteur";

const cellule = (page: Page, index: number, colonne: string) => page.locator(`[data-cellule='${index}:${colonne}']`);
/** Segment de texte riche (span portant exactement ce texte) dans un conteneur. */
const segment = (conteneur: ReturnType<Page["locator"]>, texte: string) => conteneur.locator("span").filter({ hasText: new RegExp(`^${texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first();
/** Cellule calculée (PU net, total HT) : lecture seule, exposée en `data-lecture`. */
const lecture = (page: Page, index: number, colonne: string) => page.locator(`[data-lecture='${index}:${colonne}']`);
const grille = (page: Page) => page.locator("[role=grid][aria-label='Lignes du devis']");

async function attendreHydratation(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector("main") ?? document.body).some((k) => k.startsWith("__reactFiber")), undefined, { timeout: 180_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
}
async function aller(page: Page, url: string) {
  for (let i = 0; i < 4; i += 1) {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const attendu = new URL(url, page.url()).pathname;
    const obtenu = new URL(page.url()).pathname;
    if (obtenu === attendu || !["/login", "/dashboard"].includes(obtenu) || attendu === "/dashboard") break;
    await page.waitForTimeout(2000);
  }
  await attendreHydratation(page);
}
const sessions = new Map<string, Awaited<ReturnType<Page["context"]>>["cookies"] extends (...a: never[]) => Promise<infer C> ? C : never>();
async function connexion(page: Page, email: string) {
  const cookies = sessions.get(email);
  if (cookies) { await page.context().addCookies(cookies); await aller(page, "/dashboard"); if (/\/dashboard/.test(page.url())) return; }
  for (let i = 0; i < 3; i += 1) {
    await aller(page, "/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("test");
    await page.getByRole("button", { name: "Se connecter" }).click();
    if (await page.waitForURL(/\/dashboard/, { timeout: 20_000 }).then(() => true).catch(() => false)) { sessions.set(email, await page.context().cookies()); return; }
  }
  await login(page, email);
  sessions.set(email, await page.context().cookies());
}
async function ajouterLigne(page: Page, type: string) { await page.getByTestId("menu-ajouter").click(); await page.locator(`[role=menuitem][data-cle="${type}"]`).click(); }
async function enregistrerEtFermer(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Enregistrer et fermer" }).click();
  const debut = Date.now();
  while (Date.now() - debut < 60_000) {
    const url = new URL(page.url());
    const m = url.pathname.match(/^\/devis\/([0-9a-f-]{36})(\/modifier)?$/);
    if (m && !m[2]) return `${url.origin}${url.pathname}`;
    const alerte = (await page.locator("[role=alert]").allTextContents().catch(() => [])).map((t) => t.trim()).filter(Boolean);
    if (alerte.length) throw new Error(`Enregistrement refusé : ${alerte.join(" | ")}`);
    await page.waitForTimeout(500);
  }
  throw new Error(`Enregistrement sans retour à la fiche : ${page.url()}`);
}
async function selectionnerTexte(page: Page, champ: ReturnType<Page["locator"]>, debut: number, fin: number) {
  await champ.focus();
  await champ.evaluate((el, r) => (el as HTMLInputElement).setSelectionRange(r[0], r[1]), [debut, fin]);
}

let urlDevis = "";

test("47. devis complet : client et chantier inline, titre, ouvrage, article en m², remise de ligne, texte riche, sous-total, copier/coller, A4, PDF, retour, réouverture", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await expect(page.getByTestId("retour-devis")).toBeVisible();
  // 2-3. Client inexistant → créé sans quitter le devis, affecté.
  await page.getByRole("button", { name: "+ Client" }).click();
  const dlgClient = page.locator("[data-testid=dialogue-client-rapide]");
  await dlgClient.getByLabel("Type").selectOption("professionnel");
  await dlgClient.getByLabel("Raison sociale *").fill(CLIENT_INLINE);
  await dlgClient.getByLabel("Adresse").fill("1 rue de l’UX");
  await dlgClient.getByLabel("Code postal").fill("67000");
  await dlgClient.getByLabel("Ville").fill("Strasbourg");
  await dlgClient.getByLabel("Téléphone").fill("03 88 00 00 00");
  await dlgClient.getByLabel("SIRET").fill("123 456 789 00012");
  await dlgClient.getByLabel("Contact (nom)").fill("Mme UX");
  await dlgClient.getByRole("button", { name: "Créer et affecter au devis" }).click();
  await expect(dlgClient).toBeHidden({ timeout: 60_000 });
  const client = page.getByRole("combobox", { name: "Client", exact: true });
  await expect(client.locator("option:checked")).toHaveText(CLIENT_INLINE);
  // 4. Chantier inline, prérempli.
  await page.getByRole("button", { name: "+ Chantier" }).click();
  const dlgChantier = page.locator("[data-testid=dialogue-chantier-rapide]");
  await expect(dlgChantier.getByLabel("Adresse")).toHaveValue("1 rue de l’UX");
  await dlgChantier.getByLabel("Nom du chantier *").fill(CHANTIER_INLINE);
  await dlgChantier.getByRole("button", { name: "Créer et rattacher au devis" }).click();
  await expect(dlgChantier).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("combobox", { name: "Chantier", exact: true }).locator("option:checked")).toHaveText(CHANTIER_INLINE);
  await page.getByLabel("Référence d’affaire").fill(`UX-${suffixe}`);
  // 5. Titre.
  await ajouterLigne(page, "titre");
  await cellule(page, 0, "designation").fill("Cloisons");
  await page.keyboard.press("Tab");
  // 6. Ouvrage de la bibliothèque (premier résultat).
  await ajouterLigne(page, "ouvrage");
  const dlgOuvrage = page.locator("dialog[open]").last();
  await dlgOuvrage.locator("#recherche-ouvrage").pressSequentially("Cloison", { delay: 20 });
  await expect(dlgOuvrage.locator("li button").first()).toBeVisible();
  await dlgOuvrage.locator("li button").first().click();
  await dlgOuvrage.getByRole("button", { name: /Insérer tout/ }).click();
  await expect(dlgOuvrage).toHaveCount(0);
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "2");
  // 7-10. Article libre en m², quantité 12, remise 5 %.
  await ajouterLigne(page, "libre");
  await cellule(page, 2, "designation").fill(PHRASE);
  await page.keyboard.press("Tab");
  await cellule(page, 2, "quantite").fill("12");
  await page.keyboard.press("Tab");
  await cellule(page, 2, "unite").fill("m²");
  await page.keyboard.press("Tab");
  await cellule(page, 2, "prix_vente").fill("100");
  await page.keyboard.press("Tab");
  await cellule(page, 2, "remise").fill("5");
  await page.keyboard.press("Tab");
  await expect(cellule(page, 2, "remise")).toHaveValue("5");
  await expect(lecture(page, 2, "pu_net")).toContainText("95,00");
  // 11. Texte riche : « Cloison vitrée » en gras, « porte toute hauteur » souligné, « bord à bord » italique, « avec » accent.
  const d = cellule(page, 2, "designation");
  await selectionnerTexte(page, d, 0, 14);
  await page.getByRole("button", { name: "Gras" }).click();
  let v = await d.inputValue();
  await selectionnerTexte(page, d, v.indexOf("porte"), v.length);
  await page.getByRole("button", { name: "Souligné" }).click();
  v = await d.inputValue();
  await selectionnerTexte(page, d, v.indexOf("bord à bord"), v.indexOf("bord à bord") + 11);
  await page.getByRole("button", { name: "Italique" }).click();
  v = await d.inputValue();
  await selectionnerTexte(page, d, v.indexOf("avec"), v.indexOf("avec") + 4);
  await page.getByLabel("Couleur du texte").selectOption("accent");
  await page.keyboard.press("Tab");
  await expect(d).toHaveValue("[b]Cloison vitrée[/b] [i]bord à bord[/i] [c=accent]avec[/c] [u]porte toute hauteur[/u]");
  // 12. Sous-total.
  await ajouterLigne(page, "sous_total");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "4");
  // 13. Copier/coller la section (titre + ouvrage + article + sous-total) : 8 lignes.
  await cellule(page, 0, "poignee").click();
  await cellule(page, 3, "poignee").click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.locator("[data-testid=retour-presse-papier]")).toContainText("4 lignes copiées");
  await cellule(page, 3, "poignee").click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "8");
  // 14. Aperçu A4 (mode grille + aperçu, puis mode document) : gras / souligné / italique / accent rendus, aucune balise.
  // `.first()` : « Aperçu A4 » existe aussi dans la barre d'actions contextuelle (GP V1, 2026-09-14).
  await page.getByRole("button", { name: "Aperçu A4" }).first().click();
  const doc = page.locator(".doc-a4").first();
  await expect(doc).toBeVisible();
  // Styles CALCULÉS (l'attribut `style` sérialisé diffère entre rendu serveur et client).
  await expect(segment(doc, "Cloison vitrée")).toHaveCSS("font-weight", "700");
  await expect(segment(doc, "porte toute hauteur")).toHaveCSS("text-decoration-line", "underline");
  await expect(segment(doc, "bord à bord")).toHaveCSS("font-style", "italic");
  // Couleur accent = couleur de l'entreprise (variable CSS) : on vérifie qu'elle diffère du texte courant.
  expect(await segment(doc, "avec").evaluate((e) => getComputedStyle(e).color !== getComputedStyle(e.parentElement as Element).color)).toBe(true);
  await expect(doc).not.toContainText("[b]");
  await expect(doc).toContainText("m²");
  await expect(doc).toContainText("remise −5 %");
  // `exact: true` : la barre d'actions contextuelle (GP V1, 2026-09-14) porte un bouton « Passer en vue
  // Document »/« Passer en vue Grille », dont le nom accessible contient ces mots sans leur être égal.
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await expect(grille(page)).toBeHidden();
  await expect(page.getByTestId("zone-document")).toBeVisible();
  await page.getByRole("button", { name: "Grille", exact: true }).click();
  // 16. Sauvegarder.
  urlDevis = await enregistrerEtFermer(page);
  const id = urlDevis.split("/").pop();
  // Lecture : même texte riche, unité, remise appliquée.
  await expect(segment(page.locator("main"), "Cloison vitrée")).toHaveCSS("font-weight", "700");
  await expect(segment(page.locator("main"), "porte toute hauteur")).toHaveCSS("text-decoration-line", "underline");
  await expect(page.locator("main")).toContainText("m²");
  // 15. PDF (Chromium local sur la page d'impression, qui rend le même document) et page d'impression.
  const r = await page.evaluate(async (u) => { const res = await fetch(u); return { status: res.status, type: res.headers.get("content-type") ?? "", taille: (await res.arrayBuffer()).byteLength }; }, `/api/documents/devis/${id}/pdf`);
  expect(r.status, JSON.stringify(r)).toBe(200);
  expect(r.type).toContain("application/pdf");
  const impression = await page.evaluate(async (u) => (await (await fetch(u)).text()), `/imprimer/devis/${id}`);
  expect(impression).toContain("font-weight:700");
  expect(impression).toContain("text-decoration:underline");
  expect(impression).not.toContain("[b]");
  // 17. Retour (lien de la fiche) puis 18. réouverture : tout est conservé.
  await page.getByRole("link", { name: "← Devis" }).first().click();
  await expect(page).toHaveURL(/\/devis$/);
  await aller(page, `${urlDevis}/modifier`);
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "8");
  await expect(cellule(page, 2, "designation")).toHaveValue("[b]Cloison vitrée[/b] [i]bord à bord[/i] [c=accent]avec[/c] [u]porte toute hauteur[/u]");
  await expect(cellule(page, 2, "quantite")).toHaveValue("12");
  await expect(cellule(page, 2, "unite")).toHaveValue("m²");
  await expect(cellule(page, 2, "remise")).toHaveValue("5");
  await expect(page.getByRole("combobox", { name: "Client", exact: true }).locator("option:checked")).toHaveText(CLIENT_INLINE);
  // Garde de navigation : modification puis retour → dialogue → Quitter sans enregistrer.
  await cellule(page, 2, "quantite").fill("13");
  await page.keyboard.press("Tab");
  await page.getByTestId("retour-devis").click();
  const garde = page.getByTestId("garde-modifications");
  await expect(garde).toBeVisible();
  await garde.getByRole("button", { name: "Quitter sans enregistrer" }).click();
  await expect(page).toHaveURL(new RegExp(`/devis/${id}$`));
});

test("39. remises de ligne 0, 5, 25, 100 : calculs corrects (PU net et total)", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `${urlDevis}/modifier`);
  for (const [remise, net, total] of [["0", "100,00", "1 200,00"], ["5", "95,00", "1 140,00"], ["25", "75,00", "900,00"], ["100", "0,00", "0,00"]] as const) {
    await cellule(page, 2, "remise").fill(remise);
    await page.keyboard.press("Tab");
    await expect(lecture(page, 2, "pu_net")).toContainText(net);
    await expect(lecture(page, 2, "total_ht")).toContainText(total);
  }
  await cellule(page, 2, "remise").fill("5");
  await page.keyboard.press("Tab");
  await page.getByTestId("retour-devis").click();
  const garde = page.getByTestId("garde-modifications");
  if (await garde.isVisible().catch(() => false)) await garde.getByRole("button", { name: "Quitter sans enregistrer" }).click();
});

test("48. planning : nouvel évènement, double clic, glisser, Alt+glisser, menu contextuel, ouvrir le chantier, retour, imprimer, barre d'actions contextuelle", async ({ page, context }) => {
  await connexion(page, USERS.adminA);
  await aller(page, `/planning?vue=jour&jour=${JOUR_PLANNING}`);
  await expect(page.locator("[role=grid]")).toBeVisible();
  // Barre d'actions contextuelle repliable (GP V1, 2026-09-14) : additive au menu « Actions ▾ » et au menu
  // contextuel du bloc, jamais un panneau permanent imposé (celui-ci se replie, largeur compacte).
  await expect(page.locator("[data-panneau-actions]")).toHaveCount(1);
  await expect(page.getByTestId("rail-planning")).toBeVisible();
  await expect(page.getByRole("link", { name: "← Tableau de bord" })).toBeVisible();
  // 2. Créer.
  await page.getByRole("button", { name: "Nouvel évènement" }).first().click();
  const dialogue = page.locator("dialog[open]").filter({ hasText: "Nouvel évènement" });
  await dialogue.getByLabel("Titre").fill(TITRE_EVENEMENT);
  await dialogue.getByLabel("Début").fill("08:00");
  await dialogue.getByLabel("Fin").fill("10:00");
  // « Chantier » est aussi une option du choix « Type » : on cible le champ par son rôle et son nom exact.
  const chantier = dialogue.getByRole("combobox", { name: "Chantier", exact: true });
  await chantier.selectOption({ index: 1 });
  await dialogue.getByLabel("Admin A").check();
  await dialogue.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialogue).toHaveCount(0, { timeout: 90_000 });
  const bloc = page.locator("[data-bloc]").filter({ hasText: TITRE_EVENEMENT }).first();
  await expect(bloc).toBeVisible();
  // 3. Double clic → modifier le titre.
  await bloc.dblclick();
  const edition = page.locator("dialog[open]");
  await expect(edition).toBeVisible();
  await edition.getByLabel("Titre").fill(`${TITRE_EVENEMENT} bis`);
  await edition.getByRole("button", { name: "Enregistrer" }).click();
  await expect(edition).toHaveCount(0, { timeout: 90_000 });
  const bloc2 = page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` }).first();
  await expect(bloc2).toBeVisible();
  // 4. Glisser de deux heures (vue jour : 64 px par heure).
  const b = await bloc2.boundingBox();
  if (!b) throw new Error("bloc sans boîte");
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 20 + 64, b.y + b.height / 2, { steps: 6 });
  await page.mouse.move(b.x + 20 + 128, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(bloc2).toHaveAttribute("aria-label", /10:00 à 12:00/, { timeout: 30_000 });
  await expect.poll(async () => (await page.locator("main").innerText()).includes("Enregistrement…"), { timeout: 60_000 }).toBe(false);
  // 4b. Glisser vers un autre salarié (ligne suivante) — polish UX Julien, § 29 : la destination est
  // identifiée par sa ligne (`data-ligne`, le salarié réel), jamais par un delta de pixels absolu, pour
  // rester robuste à un changement de hauteur de ligne ou de densité de l'écran.
  const ligneActuelle = await bloc2.evaluate((el) => el.closest("[role=row][data-ligne]")?.getAttribute("data-ligne"));
  const ligneSuivante = page.locator(`[role=row][data-ligne]:not([data-ligne="${ligneActuelle}"])`).first();
  const bLigne = await ligneSuivante.boundingBox();
  const b3 = await bloc2.boundingBox();
  if (!bLigne || !b3) throw new Error("ligne ou bloc sans boîte");
  await page.mouse.move(b3.x + 20, b3.y + b3.height / 2);
  await page.mouse.down();
  await page.mouse.move(b3.x + 20, bLigne.y + bLigne.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await page.locator("main").innerText()).includes("Enregistrement…"), { timeout: 60_000 }).toBe(false);
  await expect.poll(
    async () => bloc2.evaluate((el) => el.closest("[role=row][data-ligne]")?.getAttribute("data-ligne")),
    { timeout: 30_000 },
  ).not.toBe(ligneActuelle);
  // 5. Alt+glisser → duplication (deux blocs portent le titre).
  const b2 = await bloc2.boundingBox();
  if (!b2) throw new Error("bloc sans boîte");
  await page.keyboard.down("Alt");
  await page.mouse.move(b2.x + 20, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + 20 + 100, b2.y + b2.height / 2, { steps: 6 });
  await page.mouse.move(b2.x + 20 + 192, b2.y + b2.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const duplique = page.locator("dialog[open]");
  if (await duplique.isVisible().catch(() => false)) await duplique.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` })).toHaveCount(2, { timeout: 90_000 });
  // 6. Menu contextuel (clic droit) : actions présentes, motifs par droits.
  await page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` }).first().click({ button: "right" });
  const menu = page.getByTestId("menu-contextuel");
  await expect(menu).toBeVisible();
  for (const cle of ["modifier", "dupliquer", "affecter", "chantier", "client", "historique", "imprimer", "supprimer"]) await expect(menu.locator(`[role=menuitem][data-cle="${cle}"]`)).toHaveCount(1);
  // 9. Imprimer (nouvel onglet) puis 7. ouvrir le chantier, 8. retour planning.
  const [impression] = await Promise.all([context.waitForEvent("page"), menu.locator('[role=menuitem][data-cle="imprimer"]').click()]);
  await expect(impression).toHaveURL(/\/imprimer\/planning/);
  await impression.close();
  await page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` }).first().click({ button: "right" });
  await menu.locator('[role=menuitem][data-cle="chantier"]').click();
  await expect(page).toHaveURL(/\/chantiers\/[0-9a-f-]{36}/);
  await page.goBack();
  await expect(page).toHaveURL(/\/planning/);
  await expect(page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` }).first()).toBeVisible();
  // Menu « Actions ▾ » de la barre (tactile) : mêmes actions.
  await page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` }).first().click();
  await page.getByTestId("menu-actions-evenement").click();
  await expect(page.getByTestId("menu-contextuel").locator('[role=menuitem][data-cle="supprimer"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  // Barre d'actions contextuelle : « Modifier » depuis la barre ouvre la même fiche que le double clic ;
  // repli en icônes (préférence mémorisée) sans perdre l'accès aux actions.
  await page.locator("[data-bloc]").filter({ hasText: `${TITRE_EVENEMENT} bis` }).first().click();
  await expect(page.getByTestId("rail-planning-action-modifier")).toBeVisible();
  await page.getByTestId("rail-planning-action-modifier").click();
  const editionRail = page.locator("dialog[open]");
  await expect(editionRail).toBeVisible();
  await editionRail.getByRole("button", { name: "Annuler" }).click();
  await page.getByTestId("rail-planning-bascule").click();
  await expect(page.getByTestId("rail-planning")).toHaveAttribute("data-repliee", "1");
  await page.reload();
  await attendreHydratation(page);
  await expect(page.getByTestId("rail-planning")).toHaveAttribute("data-repliee", "1");
  await page.getByTestId("rail-planning-bascule").click();
  await expect(page.getByTestId("rail-planning")).toHaveAttribute("data-repliee", "0");
});

test("49. numérotation : entreprise A avec préfixe DEV, entreprise B sans préfixe — références correctes et uniques", async ({ page }) => {
  // B : compteur seul sur 5 chiffres.
  await connexion(page, USERS.adminB);
  await aller(page, "/parametres/numerotation");
  await page.getByLabel("Préfixe Devis").fill("");
  const annee = page.getByTestId("numerotation-devis").getByLabel("Année", { exact: true });
  if (await annee.isChecked()) await annee.uncheck();
  await page.getByLabel("Chiffres Devis").selectOption("5");
  await expect(page.getByTestId("apercu-devis")).toHaveText(/^\d{5}$/);
  await page.getByRole("button", { name: "Enregistrer la numérotation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Numérotation enregistrée" })).toBeVisible();
  const numeros: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    await aller(page, "/devis/nouveau");
    await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 });
    await ajouterLigne(page, "libre");
    await cellule(page, 0, "designation").fill(`Ligne B ${suffixe}-${i}`);
    await page.keyboard.press("Tab");
    await cellule(page, 0, "quantite").fill("1"); await page.keyboard.press("Tab");
    await cellule(page, 0, "prix_vente").fill("10"); await page.keyboard.press("Tab");
    const fiche = await enregistrerEtFermer(page);
    await page.locator("select").filter({ has: page.locator("option[value='envoye']") }).first().selectOption("envoye");
    await expect.poll(async () => (await page.locator("main").innerText()).includes("· envoye"), { timeout: 60_000 }).toBe(true);
    await aller(page, fiche);
    const texte = await page.locator("main").innerText();
    const m = texte.match(/Devis\s+(\d{5})\s+·/);
    expect(m, texte.slice(0, 200)).not.toBeNull();
    numeros.push(m![1]);
  }
  expect(numeros[0]).not.toBe(numeros[1]);
  expect(Number(numeros[1])).toBe(Number(numeros[0]) + 1);
  // A : format historique DEV-AAAA-NNN.
  await page.context().clearCookies();
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 });
  await ajouterLigne(page, "libre");
  await cellule(page, 0, "designation").fill(`Ligne A ${suffixe}`);
  await page.keyboard.press("Tab");
  await cellule(page, 0, "quantite").fill("1"); await page.keyboard.press("Tab");
  await cellule(page, 0, "prix_vente").fill("10"); await page.keyboard.press("Tab");
  const ficheA = await enregistrerEtFermer(page);
  await page.locator("select").filter({ has: page.locator("option[value='envoye']") }).first().selectOption("envoye");
  await expect.poll(async () => (await page.locator("main").innerText()).includes("· envoye"), { timeout: 60_000 }).toBe(true);
  await aller(page, ficheA);
  await expect(page.locator("main")).toContainText(/DEV-\d{4}-\d{3}/);
});

test("51. mobile 390 px : toolbar, client inline, retour + garde, barre d'actions en feuille tactile (pas une grande barre verticale), planning avec menu Actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await expect(page.getByTestId("menu-ajouter")).toBeVisible();
  await ajouterLigne(page, "libre");
  await expect(page.locator("ol li")).toHaveCount(1);
  // Barre d'actions contextuelle (GP V1, 2026-09-14) : sur téléphone, un bouton « Actions (n) » en bas
  // d'écran ouvre une feuille — jamais la grande barre verticale du bureau (`lg:fixed` reste masqué ici).
  const boutonActionsDevis = page.getByTestId("rail-devis-mobile-bouton");
  await expect(boutonActionsDevis).toBeVisible();
  await boutonActionsDevis.click();
  const feuilleDevis = page.getByTestId("rail-devis-mobile-feuille");
  await expect(feuilleDevis).toBeVisible();
  await expect(feuilleDevis).toContainText("Ligne libre");
  await expect(feuilleDevis).toContainText("Article du catalogue");
  await feuilleDevis.getByRole("button", { name: "Fermer" }).click();
  await expect(feuilleDevis).toBeHidden();
  await page.getByRole("button", { name: "+ Client" }).click();
  const dlg = page.locator("[data-testid=dialogue-client-rapide]");
  await expect(dlg).toBeVisible();
  const boite = await dlg.boundingBox();
  expect(boite?.width ?? 0).toBeGreaterThanOrEqual(380);
  await dlg.getByRole("button", { name: "Annuler" }).click();
  await page.getByTestId("retour-devis").click();
  await expect(page.getByTestId("garde-modifications")).toBeVisible();
  await page.getByTestId("garde-modifications").getByRole("button", { name: "Annuler" }).click();
  await aller(page, `/planning?vue=semaine&jour=${JOUR_PLANNING}`);
  await expect(page.getByTestId("rail-planning-mobile-bouton")).toBeVisible();
  await expect(page.getByTestId("menu-actions-evenement")).toBeVisible();
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debordement).toBeLessThanOrEqual(1);
});

test("60. en-tête du devis repliable : nouveau devis développé, barre compacte correcte, raccourci, mémorisation, jamais sous le pli", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  // 1. Nouveau devis : toujours développé, jamais replié « de façon surprenante ».
  const barre = page.getByTestId("entete-devis-barre");
  await expect(barre).toHaveAttribute("data-repliee", "0");
  await expect(barre).toContainText("En-tête du devis");
  // 2. Client, chantier et une ligne, puis repli : la barre porte le résumé, la grille reste visible.
  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 });
  await ajouterLigne(page, "libre");
  await cellule(page, 0, "designation").fill("Ligne en-tête repliable");
  await page.keyboard.press("Tab");
  await cellule(page, 0, "quantite").fill("2"); await page.keyboard.press("Tab");
  await cellule(page, 0, "prix_vente").fill("100"); await page.keyboard.press("Tab");
  await expect(lecture(page, 0, "total_ht")).toContainText("200,00");
  await page.getByTestId("entete-devis-bouton").click();
  await expect(barre).toHaveAttribute("data-repliee", "1");
  await expect(barre).toContainText("Brouillon");
  await expect(barre).toContainText("HT 200,00 €");
  await expect(barre).toContainText("TTC 240,00 €");
  await expect(grille(page)).toBeVisible();
  // 3. Le bouton Enregistrer et l'indicateur de sauvegarde restent visibles, en-tête replié.
  await expect(page.getByRole("button", { name: "Enregistrer et fermer" })).toBeVisible();
  // 4. Raccourci clavier : redéplie, puis reréplie.
  await page.keyboard.press("Control+Shift+H");
  await expect(barre).toHaveAttribute("data-repliee", "0");
  await expect(page.getByLabel("Référence d’affaire")).toBeVisible();
  await page.keyboard.press("Control+Shift+H");
  await expect(barre).toHaveAttribute("data-repliee", "1");
  // 5. Préférence mémorisée : sauvegarder, rouvrir le devis existant → reste replié.
  const url = await enregistrerEtFermer(page);
  await aller(page, `${url}/modifier`);
  await expect(page.getByTestId("entete-devis-barre")).toHaveAttribute("data-repliee", "1");
  // 6. Un AUTRE nouveau devis reste développé malgré la préférence mémorisée (jamais replié par surprise).
  await aller(page, "/devis/nouveau");
  await expect(page.getByTestId("entete-devis-barre")).toHaveAttribute("data-repliee", "0");
});

test("61. barre d'actions contextuelle du devis : motif sans sélection, Copier/Coller depuis la barre, repli mémorisé, sans casser la barre d'outils", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 });
  // 1. Rien sélectionné : Copier/Dupliquer/Supprimer portent le motif, en infobulle ET au lecteur d'écran.
  const railCopier = page.getByTestId("rail-devis-action-copier");
  await expect(railCopier).toHaveAttribute("aria-disabled", "true");
  await expect(railCopier).toHaveAttribute("title", /Sélectionnez d’abord/);
  // 2. Deux lignes, sélection, Copier PUIS Coller — depuis la barre, pas la barre d'outils ni Ctrl+C/V.
  await ajouterLigne(page, "libre");
  await cellule(page, 0, "designation").fill("Ligne rail A"); await page.keyboard.press("Tab");
  await cellule(page, 0, "quantite").fill("1"); await page.keyboard.press("Tab");
  await cellule(page, 0, "prix_vente").fill("50"); await page.keyboard.press("Tab");
  await ajouterLigne(page, "libre");
  await cellule(page, 1, "designation").fill("Ligne rail B"); await page.keyboard.press("Tab");
  await cellule(page, 1, "quantite").fill("2"); await page.keyboard.press("Tab");
  await cellule(page, 1, "prix_vente").fill("30"); await page.keyboard.press("Tab");
  await cellule(page, 0, "poignee").click();
  await cellule(page, 1, "poignee").click({ modifiers: ["Shift"] });
  await expect(railCopier).not.toHaveAttribute("aria-disabled", "true");
  await railCopier.click();
  await expect(page.locator("[data-testid=retour-presse-papier]")).toContainText("2 lignes copiées");
  await cellule(page, 1, "poignee").click();
  await page.getByTestId("rail-devis-action-coller").click();
  await expect(grille(page)).toHaveAttribute("aria-rowcount", "4");
  // 3. La barre d'outils « Ajouter »/« Plus » d'origine fonctionne toujours (additive, pas un remplacement).
  await expect(page.getByTestId("menu-ajouter")).toBeVisible();
  await expect(page.getByTestId("menu-plus")).toBeVisible();
  // 4. Repli en icônes seules, mémorisé après rechargement.
  await page.getByTestId("rail-devis-bascule").click();
  await expect(page.getByTestId("rail-devis")).toHaveAttribute("data-repliee", "1");
  const railCopierReplie = page.getByTestId("rail-devis-action-copier");
  await expect(railCopierReplie).toHaveAttribute("aria-label", "Copier");
  await page.getByTestId("retour-devis").click();
  const gardeRepli = page.getByTestId("garde-modifications");
  if (await gardeRepli.isVisible().catch(() => false)) await gardeRepli.getByRole("button", { name: "Quitter sans enregistrer" }).click();
  await aller(page, "/devis/nouveau");
  await expect(page.getByTestId("rail-devis")).toHaveAttribute("data-repliee", "1");
});

test("62. menu « Ajouter » ancré au bouton (portail), jamais tout en bas de page, même sous une barre d'outils collante", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 });
  // En-tête repliée : la barre d'outils devient `sticky` près du haut, reproduisant exactement les
  // conditions du bogue signalé par Julien (`backdrop-blur` détournait le positionnement `fixed` du
  // menu vers ce conteneur au lieu de la fenêtre).
  await page.keyboard.press("Control+Shift+H");
  const boutonAjouter = page.getByTestId("menu-ajouter");
  await boutonAjouter.click();
  const menu = page.getByTestId("menu-contextuel");
  await expect(menu).toBeVisible();
  const [rBouton, rMenu] = await Promise.all([boutonAjouter.boundingBox(), menu.boundingBox()]);
  if (!rBouton || !rMenu) throw new Error("mesures indisponibles");
  expect(Math.abs(rMenu.y - (rBouton.y + rBouton.height))).toBeLessThan(20);
  expect(Math.abs(rMenu.x - rBouton.x)).toBeLessThan(20);
  await page.keyboard.press("Escape");
  // Même vérification pour « Plus », deuxième bouton de la même barre.
  const boutonPlus = page.getByTestId("menu-plus");
  await boutonPlus.click();
  const menu2 = page.getByTestId("menu-contextuel");
  const [rBouton2, rMenu2] = await Promise.all([boutonPlus.boundingBox(), menu2.boundingBox()]);
  if (!rBouton2 || !rMenu2) throw new Error("mesures indisponibles");
  expect(Math.abs(rMenu2.y - (rBouton2.y + rBouton2.height))).toBeLessThan(20);
  await page.keyboard.press("Escape");
});

test("63. menu gauche à trois états (ouvert, compact, masqué), préférence mémorisée, réaffichage", async ({ page }) => {
  await connexion(page, USERS.adminA);
  // Pas « /dashboard » : la fiche « Personnalisez votre tableau de bord » (première connexion) y ouvre un
  // dialogue modal sans rapport avec ce scénario — n'importe quelle autre page authentifiée convient.
  await aller(page, "/clients");
  const aside = page.locator("#navigation-mobile");
  let boite = await aside.boundingBox();
  expect(boite?.width ?? 0).toBeGreaterThan(200);
  // 1. Réduit en icônes.
  await page.getByTestId("menu-reduire").click();
  await page.waitForTimeout(300);
  boite = await aside.boundingBox();
  expect(boite?.width ?? 0).toBeLessThan(80);
  await expect(page.getByTestId("menu-developper")).toBeVisible();
  // 2. Mémorisé après rechargement.
  await page.reload();
  await attendreHydratation(page);
  boite = await aside.boundingBox();
  expect(boite?.width ?? 0).toBeLessThan(80);
  // 3. Masque complètement.
  await page.getByTestId("menu-developper").click();
  await page.waitForTimeout(300);
  await page.getByTestId("menu-masquer").click();
  await page.waitForTimeout(300);
  boite = await aside.boundingBox();
  expect(boite?.width ?? 0).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("menu-reafficher")).toBeVisible();
  // 4. Mémorisé aussi masqué ; le contenu récupère l'espace.
  await page.reload();
  await attendreHydratation(page);
  await expect(page.getByTestId("menu-reafficher")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tableau de bord" })).toHaveCount(0);
  // 5. Réaffiche.
  await page.getByTestId("menu-reafficher").click();
  await page.waitForTimeout(300);
  boite = await aside.boundingBox();
  expect(boite?.width ?? 0).toBeGreaterThan(200);
  await expect(page.getByRole("link", { name: "Tableau de bord" })).toBeVisible();
});

test("64. repli du menu gauche ne remonte pas l'éditeur de devis : la saisie non validée est préservée", async ({ page }) => {
  await connexion(page, USERS.adminA);
  await aller(page, "/devis/nouveau");
  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 });
  await ajouterLigne(page, "libre");
  const d = cellule(page, 0, "designation");
  await d.fill("Ne doit pas disparaître au repli");
  // Pas de Tab : la valeur reste dans l'état local du champ, jamais encore validée dans l'état React de
  // l'éditeur — un remontage de l'arbre la perdrait, une simple réduction du menu gauche ne le doit pas
  // (Sidebar et l'éditeur sont deux sous-arbres React distincts, cf. `(app)/layout.tsx`).
  await page.getByTestId("menu-reduire").click();
  await page.waitForTimeout(300);
  await expect(d).toHaveValue("Ne doit pas disparaître au repli");
  await page.getByTestId("menu-developper").click();
});
