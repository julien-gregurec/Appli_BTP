// Visite de toutes les pages ELSATIA Social : bureau/mobile, clair/sombre.
import { chromium } from "playwright-core";
const base = process.env.RECETTE_URL ?? "http://localhost:3000";
const pages = ["", "/publication", "/calendrier", "/calendrier?vue=semaine", "/calendrier?vue=jour", "/statistiques", "/commentaires", "/messages", "/assistant", "/comptes", "/comptes?error=Connexion%20expir%C3%A9e%20ou%20invalide%20%3A%20recommencer", "/configuration", "/equipe", "/journal"];
const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const resultats = [];
for (const [nom, viewport, scheme] of [["bureau-clair", { width: 1440, height: 900 }, "light"], ["mobile-clair", { width: 390, height: 844 }, "light"], ["bureau-sombre", { width: 1440, height: 900 }, "dark"]]) {
  const ctx = await navigateur.newContext({ viewport, colorScheme: scheme, locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && erreurs.push(`console ${m.text().slice(0, 200)}`));
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', "admin@elsatia.test");
  await page.fill('input[name="password"]', "Motdepasse-test-123");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
  for (const p of pages) {
    erreurs.length = 0;
    const rep = await page.goto(`${base}/plateforme/social${p}`, { waitUntil: "networkidle", timeout: 120000 });
    const texte = await page.locator("main").innerText().catch(() => "");
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const fichier = `${nom}${p.replace(/[/?=&%]+/g, "_") || "_accueil"}.png`.slice(0, 120);
    await page.screenshot({ path: `${process.env.RECETTE_CAPTURES ?? "/tmp"}/${fichier}`, fullPage: true });
    resultats.push({ vue: nom, page: p || "/", http: rep?.status(), bandeau: texte.toUpperCase().includes("MODE SIMULATION — AUCUNE PUBLICATION RÉELLE NE SERA ENVOYÉE"), debordementHorizontal: debordement, or: await page.locator("main").evaluate((m) => /c9a24a|201, 162, 74/i.test(m.outerHTML + [...m.querySelectorAll("*")].map((e) => getComputedStyle(e).backgroundColor + getComputedStyle(e).color).join())), erreurs: [...erreurs] });
  }
  await ctx.close();
}
await navigateur.close();
console.log(JSON.stringify(resultats, null, 1));
