import { chromium } from "playwright-core";
const base = process.env.RECETTE_URL ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const journal = [];
const etape = (t, ok, d = "") => { journal.push(`${ok ? "✓" : "✕"} ${t}${d ? " — " + d : ""}`); };
async function connexion(email) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => etape("erreur JS", false, e.message));
  await p.goto(`${base}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "Motdepasse-test-123");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
  return { ctx, p };
}
const { ctx, p } = await connexion("admin@elsatia.test");
await p.goto(`${base}/plateforme/social/publication`, { waitUntil: "networkidle" });
await p.getByLabel("Titre interne").fill("[RECETTE] Lancement ELSATIA Réserves");
await p.getByLabel("Produit ELSATIA").selectOption("reserves");
await p.getByLabel("Texte principal").fill("ELSATIA Réserves permet de suivre chaque réserve de chantier jusqu’à sa levée, photos et signatures comprises.");
await p.getByLabel("Texte alternatif (accessibilité)").fill("Symbole ELSATIA cyan sur fond bleu");
await p.setInputFiles('input[type="file"]', process.env.RECETTE_VISUEL ?? "/tmp/visuel-test.png");
await p.getByText("Image ajoutée").waitFor({ timeout: 60000 });
etape("Image téléversée, convertie en JPEG", true);
await p.getByRole("button", { name: /Adapter par réseau/ }).click();
await p.getByText("Variantes proposées par l’Assistant Social").waitFor({ timeout: 60000 });
const fb = await p.locator("#texte-facebook").inputValue(), ig = await p.locator("#texte-instagram").inputValue(), li = await p.locator("#texte-linkedin").inputValue();
etape("Trois variantes générées et différentes", new Set([fb, ig, li]).size === 3 && fb && ig && li, `FB ${fb.length} c. / IG ${ig.length} c. / LI ${li.length} c.`);
etape("Instagram plus court et avec hashtags", ig.length < fb.length && /#/.test(ig));
for (const r of ["Facebook", "Instagram", "LinkedIn"]) {
  await p.getByRole("tab", { name: r }).click();
  await p.locator(`article[aria-label="Aperçu ${r}"]`).screenshot({ path: `${process.env.RECETTE_CAPTURES ?? "/tmp"}/apercu-${r}.png` });
}
etape("Prévisualisations Facebook / Instagram / LinkedIn rendues", true);
await p.getByRole("button", { name: "Soumettre à validation" }).click();
await p.waitForURL(/\?id=/, { timeout: 60000 });
await p.getByText("À valider").first().waitFor({ timeout: 30000 });
const url = p.url();
etape("Soumise à validation", true, url.split("id=")[1]);
await p.screenshot({ path: `${process.env.RECETTE_CAPTURES ?? "/tmp"}/scenario-a-valider.png`, fullPage: true });

// Un éditeur ne peut pas valider.
const ed = await connexion("editeur@elsatia.test");
await ed.p.goto(url, { waitUntil: "networkidle" });
const boutonValider = await ed.p.getByRole("button", { name: "Valider le contenu" }).count();
etape("Éditeur : aucun bouton de validation", boutonValider === 0, (await ed.p.getByText("En attente d’un Administrateur ou d’un Validateur").count()) ? "message d’attente affiché" : "");
await ed.ctx.close();

await p.getByLabel(/Commentaire/).fill("Contenu conforme, visuel à remplacer par le visuel officiel.");
await p.getByRole("button", { name: "Valider le contenu" }).click();
await p.getByText("Publication validée.").waitFor({ timeout: 30000 });
await p.reload({ waitUntil: "networkidle" });
etape("Validée par un Administrateur", (await p.getByText("Validé par").count()) > 0);
const sansConfirmation = p.getByRole("button", { name: /Publier maintenant/ });
await sansConfirmation.click();
await p.getByText("Cocher la confirmation.").waitFor({ timeout: 10000 });
etape("Publication refusée sans confirmation explicite", true);
await p.getByRole("checkbox", { name: /Je confirme la publication/ }).check();
await p.getByRole("button", { name: /Publier maintenant \(simulation\)/ }).click();
await p.getByText(/Simulation \(dry-run\) : rien n’a été publié/).waitFor({ timeout: 60000 });
const bilan = await p.getByText(/Simulation \(dry-run\)/).first().innerText();
etape("Publication simulée sur les trois réseaux", /Facebook : simulé.*Instagram : simulé.*LinkedIn : simulé/s.test(bilan), bilan.replace(/\s+/g, " ").slice(0, 160));
await p.reload({ waitUntil: "networkidle" });
await p.screenshot({ path: `${process.env.RECETTE_CAPTURES ?? "/tmp"}/scenario-apres-simulation.png`, fullPage: true });

// Modifier le texte après validation : retour en brouillon.
await p.getByLabel("Texte principal").fill("Texte modifié après validation.");
await p.getByRole("button", { name: "Enregistrer en brouillon" }).click();
await p.getByText("Brouillon enregistré.").waitFor({ timeout: 30000 });
await p.reload({ waitUntil: "networkidle" });
etape("Modification après validation → retour en brouillon, validation effacée", (await p.getByText("Validé par").count()) === 0 && (await p.locator("span", { hasText: /^Brouillon$/ }).count()) > 0);
await ctx.close();
await b.close();
console.log(journal.join("\n"));
